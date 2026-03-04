from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

async def get_current_user(db: Session = Depends(get_db)):
    # Bypass authentication: Always return the guest user
    user = db.query(models.User).filter(models.User.email == "guest@neurocry.ai").first()
    if user is None:
        # Create a default guest user if it doesn't exist
        user = models.User(
            email="guest@neurocry.ai",
            hashed_password=get_password_hash("guest_password")
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
