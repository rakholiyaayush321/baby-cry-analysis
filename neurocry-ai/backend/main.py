from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import os
import json
import asyncio
from datetime import datetime

import models, database, auth

# Create DB Tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="NeuroCry AI Backend")

# ── Schemas ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class PatientCreate(BaseModel):
    name: str
    age_weeks: int
    weight: float
    gender: Optional[str] = None
    guardian_name: Optional[str] = None
    contact_number: Optional[str] = None
    medical_notes: Optional[str] = None

class PatientResponse(BaseModel):
    id: int
    name: str
    age_weeks: int
    weight: float
    gender: Optional[str] = None
    guardian_name: Optional[str] = None
    contact_number: Optional[str] = None
    medical_notes: Optional[str] = None
    analysis_count: int = 0
    last_analysis: Optional[str] = None

    class Config:
        orm_mode = True

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age_weeks: Optional[int] = None
    weight: Optional[float] = None
    gender: Optional[str] = None
    guardian_name: Optional[str] = None
    medical_notes: Optional[str] = None

class AnalysisResultSchema(BaseModel):
    cry_type: str
    detected_problem: Optional[str] = None
    risk_level: str
    confidence: float
    stability_score: int
    recommendation: str
    metrics: dict

class FinalOnboardingRequest(BaseModel):
    name: str
    gender: str
    age_weeks: int
    weight: float
    guardian_name: str
    contact_number: Optional[str] = None
    medical_notes: Optional[str] = None
    # Pre-computed AI analysis
    cry_type: str
    confidence: float
    risk_level: str
    stability_score: int
    status: str
    recommendation: str
    detected_problem: Optional[str] = None
    metrics: Optional[dict] = None

# ── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=_FRONTEND_DIR), name="static")

@app.get("/app/{page_name}", include_in_schema=False)
def serve_page(page_name: str):
    """Serve frontend HTML pages by name, e.g. /app/index.html"""
    page_path = os.path.join(_FRONTEND_DIR, page_name)
    if os.path.isfile(page_path):
        return FileResponse(page_path)
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/app", include_in_schema=False)
@app.get("/app/", include_in_schema=False)
def serve_index():
    return FileResponse(os.path.join(_FRONTEND_DIR, "index.html"))

# ── AI ENGINE ────────────────────────────────────────────────────────────────

CRY_TYPES = [
    "Hungry", "Sleepy", "Belly Pain", "Pain Cry", 
    "Irritated", "Sick Cry", "Respiratory Distress", "Neurological Pattern"
]

def analyze_cry_logic(audio_path: Optional[str] = None, audio_bytes: Optional[bytes] = None):
    # Use the lightweight analyzer for better performance and reliability
    from analyzer import neuro_analysis
    
    result = neuro_analysis(file_path=audio_path, audio_bytes=audio_bytes)
    
    return {
        "cry_type": result["cry_type"],
        "detected_problem": result.get("recommendation", f"Possibility of {result['cry_type']}"),
        "risk_level": result["risk_level"],
        "status": result["status"],
        "confidence": result["confidence"],
        "stability_score": int(100 - result["distress_score"]),
        "recommendation": result["recommendation"],
        "metrics": result["metrics"]
    }

# ── AUTH ──────────────────────────────────────────────────────────────────────

@app.post("/register")
def register(data: RegisterRequest, db: Session = Depends(database.get_db)):
    """Public endpoint: register a new user account."""
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        name=data.name.strip(),
        email=data.email,
        hashed_password=auth.get_password_hash(data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Registration successful", "email": user.email}

@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(database.get_db)):
    """Public endpoint: authenticate and return a JWT access token."""
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not auth.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth.create_access_token(data={"sub": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"name": user.name or user.email, "email": user.email}
    }


# ── PATIENTS ─────────────────────────────────────────────────────────────────

@app.get("/api/patients")
@app.get("/api/children")
def get_patients(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    patients = db.query(models.Patient).filter(models.Patient.user_id == current_user.id).all()
    result = []
    for p in patients:
        count = db.query(models.Analysis).filter(models.Analysis.patient_id == p.id).count()
        last = db.query(models.Analysis).filter(models.Analysis.patient_id == p.id).order_by(models.Analysis.timestamp.desc()).first()
        result.append({
            "id": p.id,
            "name": p.name,
            "age_weeks": p.age_weeks,
            "weight": p.weight,
            "gender": getattr(p, "gender", None),
            "guardian_name": getattr(p, "guardian_name", None),
            "contact_number": getattr(p, "contact_number", None),
            "medical_notes": getattr(p, "medical_notes", None),
            "analysis_count": count,
            "last_analysis": last.timestamp.strftime("%Y-%m-%d %H:%M") if last else None,
            "last_analysis_status": last.status if last else "Stable",
            "last_risk_level": last.risk_level if last else "Low",
            "last_cry_type": last.cry_type if last else "None"
        })
    return result

@app.get("/api/patients/{patient_id}")
def get_patient(patient_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    p = db.query(models.Patient).filter(models.Patient.id == patient_id, models.Patient.user_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    count = db.query(models.Analysis).filter(models.Analysis.patient_id == p.id).count()
    last = db.query(models.Analysis).filter(models.Analysis.patient_id == p.id).order_by(models.Analysis.timestamp.desc()).first()
    return {
        "id": p.id,
        "name": p.name,
        "age_weeks": p.age_weeks,
        "weight": p.weight,
        "gender": getattr(p, "gender", None),
        "guardian_name": getattr(p, "guardian_name", None),
        "contact_number": getattr(p, "contact_number", None),
        "medical_notes": getattr(p, "medical_notes", None),
        "analysis_count": count,
        "last_analysis": last.timestamp.strftime("%Y-%m-%d %H:%M") if last else None,
        "last_analysis_status": last.status if last else "Stable",
        "last_risk_level": last.risk_level if last else "Low",
        "last_cry_type": last.cry_type if last else "None"
    }

@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id, models.Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.query(models.Analysis).filter(models.Analysis.patient_id == patient_id).delete()
    db.query(models.MediaFile).filter(models.MediaFile.patient_id == patient_id).delete()
    db.delete(patient)
    db.commit()
    return {"status": "success", "message": "Patient deleted"}

@app.post("/api/patients")
def create_patient(patient: PatientCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    patient_obj = models.Patient(user_id=current_user.id, **patient.dict())
    db.add(patient_obj)
    db.commit()
    db.refresh(patient_obj)
    return patient_obj

@app.post("/api/patients/register")
async def register_patient_with_media(
    name: str = Form(...),
    gender: str = Form(...),
    age_weeks: int = Form(...),
    weight: float = Form(...),
    guardian_name: str = Form(...),
    contact_number: Optional[str] = Form(None),
    medical_notes: Optional[str] = Form(None),
    audio: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    webcam: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    try:
        # 1. Create Patient Record
        patient_obj = models.Patient(
            user_id=current_user.id,
            name=name,
            gender=gender,
            age_weeks=age_weeks,
            weight=weight,
            guardian_name=guardian_name,
            contact_number=contact_number,
            medical_notes=medical_notes
        )
        db.add(patient_obj)
        db.flush()

        # 2. Process Media if provided
        media_to_process = [
            (audio, "audio"),
            (video, "video"),
            (webcam, "webcam")
        ]
        
        os.makedirs("uploads", exist_ok=True)
        
        for file, f_type in media_to_process:
            if file:
                content = await file.read()
                file_path = f"uploads/{datetime.now().timestamp()}_{file.filename}"
                with open(file_path, "wb") as f:
                    f.write(content)
                
                # Analyze using shared logic
                a_data = analyze_cry_logic(audio_path=file_path)
                
                if a_data:
                    # Save Media Record
                    media = models.MediaFile(patient_id=patient_obj.id, filename=file.filename, file_type=f_type)
                    db.add(media)
                    db.flush()
                    
                    # Save Analysis Record
                    record = models.Analysis(
                        patient_id=patient_obj.id,
                        media_id=media.id,
                        cry_type=a_data["cry_type"],
                        detected_problem=a_data["detected_problem"],
                        risk_level=a_data["risk_level"],
                        status=a_data["status"],
                        confidence=a_data["confidence"],
                        stability_score=a_data["stability_score"],
                        media_source="upload" if f_type != "webcam" else "live",
                        metrics=a_data["metrics"]
                    )
                    db.add(record)
        
        db.commit()
        return {"status": "success", "patient_id": patient_obj.id}
    except Exception as e:
        db.rollback()
        print(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analyses/{patient_id}")
def get_analyses(patient_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id, models.Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    analyses = db.query(models.Analysis).filter(models.Analysis.patient_id == patient_id).order_by(models.Analysis.timestamp.desc()).all()
    return [{
        "id": a.id,
        "cry_type": a.cry_type,
        "confidence": round(a.confidence, 1),
        "risk_level": a.risk_level,
        "status": a.status or "Normal",
        "stability_score": a.stability_score or 0,
        "recommendation": a.detected_problem or f"Monitor {a.cry_type} pattern",
        "metrics": a.metrics or {},
        "media_type": (a.media_file.file_type if a.media_file else None) or a.media_source or "upload",
        "date": a.timestamp.strftime("%Y-%m-%d %H:%M"),
    } for a in analyses]

@app.post("/api/patient/final-onboarding")
def final_onboarding(
    data: FinalOnboardingRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    try:
        # 1. Create Patient
        patient = models.Patient(
            user_id=current_user.id,
            name=data.name,
            gender=data.gender,
            age_weeks=data.age_weeks,
            weight=data.weight,
            guardian_name=data.guardian_name,
            contact_number=data.contact_number,
            medical_notes=data.medical_notes
        )
        db.add(patient)
        db.flush()  # get patient.id without committing

        # 2. Create Analysis linked to patient (no media file required)
        analysis = models.Analysis(
            patient_id=patient.id,
            media_id=None,
            cry_type=data.cry_type,
            detected_problem=data.detected_problem or f"Detected: {data.cry_type}",
            risk_level=data.risk_level,
            status=data.status,
            confidence=data.confidence,
            stability_score=data.stability_score,
            media_source="upload",
            metrics=data.metrics or {"distress_score": 0, "infection_risk": 0, "respiratory_risk": 0}
        )
        db.add(analysis)
        db.commit()
        db.refresh(patient)
        return {"status": "success", "patient_id": patient.id, "message": "Patient onboarding completed"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
def get_stats(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    patients = db.query(models.Patient).filter(models.Patient.user_id == current_user.id).all()
    total_analyses = 0
    alerts = 0
    stability_sum = 0
    analysis_count_with_stability = 0
    
    for p in patients:
        recs = db.query(models.Analysis).filter(models.Analysis.patient_id == p.id).all()
        total_analyses += len(recs)
        for r in recs:
            if r.risk_level == "High":
                alerts += 1
            if r.stability_score:
                stability_sum += r.stability_score
                analysis_count_with_stability += 1
    
    avg_stability = round(stability_sum / analysis_count_with_stability) if analysis_count_with_stability > 0 else 100
    
    return {
        "total_patients": len(patients),
        "total_analyses": total_analyses,
        "risk_alerts": alerts,
        "avg_stability": f"{avg_stability}%",
        "active_sessions": 0,
    }

# ── WEBSOCKET LIVE MONITOR ──────────────────────────────────────────────────

@app.websocket("/ws/live-monitor")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive data from client (audio chunks)
            data = await websocket.receive_bytes()
            
            # Analyze real-time
            result = analyze_cry_logic(audio_bytes=data)
            
            if result:
                await websocket.send_json(result)
            
            await asyncio.sleep(2) # Throttle to 2 seconds as requested
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

# ── AI ANALYSIS ENDPOINTS ──────────────────────────────────────────────────

@app.post("/api/analyze-audio")
async def api_analyze_audio(file: UploadFile = File(...)):
    try:
        content = await file.read()
        res = analyze_cry_logic(audio_bytes=content)
        return {
            "cry_type": res["cry_type"],
            "confidence": res['confidence'],
            "risk": res["risk_level"],
            "status": res["status"],
            "recommendation": res["recommendation"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-video")
async def api_analyze_video(file: UploadFile = File(...)):
    try:
        content = await file.read()
        res = analyze_cry_logic(audio_bytes=content[:500000]) 
        return {
            "cry_type": res["cry_type"],
            "confidence": res['confidence'],
            "risk": res["risk_level"],
            "status": res["status"],
            "recommendation": res["recommendation"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-webcam")
async def api_analyze_webcam(file: UploadFile = File(...)):
    try:
        content = await file.read()
        res = analyze_cry_logic(audio_bytes=content)
        return {
            "cry_type": res["cry_type"],
            "confidence": res['confidence'],
            "risk": res["risk_level"],
            "status": res["status"],
            "recommendation": res["recommendation"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def health_check():
    return {"status": "online", "system": "NeuroCry AI", "timestamp": datetime.now().isoformat()}
