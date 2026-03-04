from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import os

from analyzer import analyze_audio, analyze_video
import models, database, auth

# Create DB Tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="NeuroCry AI Backend")

# Pydantic Schemas for validation
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class ChildCreate(BaseModel):
    name: str
    age: int
    weight: float

class ChildResponse(ChildCreate):
    id: int
    class Config:
        orm_mode = True

class AnalysisResponse(BaseModel):
    id: int
    child_id: int
    cry_type: str
    confidence_score: float
    breathing_status: str
    distress_score: float
    recommendation: str
    metrics: dict
    date: str
    
    class Config:
        orm_mode = True

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================

@app.post("/register")
def register_user(user: UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Return token immediately on register
    access_token = auth.create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# ==========================================
# PROTECTED API ENDPOINTS
# ==========================================

@app.get("/api/children", response_model=List[ChildResponse])
def get_children(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    children = db.query(models.Child).filter(models.Child.user_id == current_user.id).all()
    return children

@app.post("/api/children", response_model=ChildResponse)
def create_child(child: ChildCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    new_child = models.Child(**child.dict(), user_id=current_user.id)
    db.add(new_child)
    db.commit()
    db.refresh(new_child)
    return new_child

@app.get("/api/analyses/{child_id}")
def get_analyses(child_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # Verify child belongs to user
    child = db.query(models.Child).filter(models.Child.id == child_id, models.Child.user_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
        
    analyses = db.query(models.AnalysisRecord).filter(models.AnalysisRecord.child_id == child_id).order_by(models.AnalysisRecord.date.desc()).all()
    
    # Format dates
    results = []
    for a in analyses:
        results.append({
            "id": a.id,
            "cry_type": a.cry_type,
            "confidence_score": a.confidence_score,
            "breathing_status": a.breathing_status,
            "distress_score": a.distress_score,
            "recommendation": a.recommendation,
            "metrics": a.metrics,
            "date": a.date.strftime("%x")
        })
    return results

# ==========================================
# PROCESSING ENDPOINTS
# ==========================================

async def process_media_and_store(file: UploadFile, is_video: bool, child_id: Optional[int], current_user: models.User, db: Session):
    content = await file.read()
    file_path = f"temp_{file.filename}"
    with open(file_path, "wb") as f:
        f.write(content)
        
    result = analyze_video(file_path) if is_video else analyze_audio(file_path)
    
    if os.path.exists(file_path):
        os.remove(file_path)
        
    # If a valid child_id is provided, save it to the DB
    if child_id:
        child = db.query(models.Child).filter(models.Child.id == child_id, models.Child.user_id == current_user.id).first()
        if child:
            a_data = result["analysis"]
            record = models.AnalysisRecord(
                child_id=child.id,
                cry_type=a_data["cry_type"],
                confidence_score=a_data["confidence_score"],
                breathing_status=a_data["breathing_status"],
                distress_score=a_data["distress_score"],
                recommendation=a_data["recommendation"],
                metrics=a_data["metrics"]
            )
            db.add(record)
            db.commit()
            
    return result

@app.post("/analyze-audio")
async def handle_audio(file: UploadFile = File(...), child_id: Optional[int] = None, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    return await process_media_and_store(file, False, child_id, current_user, db)

@app.post("/analyze-video")
async def handle_video(file: UploadFile = File(...), child_id: Optional[int] = None, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    return await process_media_and_store(file, True, child_id, current_user, db)
