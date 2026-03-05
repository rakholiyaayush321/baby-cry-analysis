from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="parent")

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    age_weeks = Column(Integer, nullable=False)
    weight = Column(Float, nullable=False)
    gender = Column(String, nullable=True)
    guardian_name = Column(String, nullable=True)
    contact_number = Column(String, nullable=True)
    medical_notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    parent = relationship("User", back_populates="patients")
    media_files = relationship("MediaFile", back_populates="patient")
    analyses = relationship("Analysis", back_populates="patient")

class MediaFile(Base):
    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # "audio", "video", "webcam"
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="media_files")
    analyses = relationship("Analysis", back_populates="media_file")

class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    media_id = Column(Integer, ForeignKey("media_files.id"), nullable=True)
    cry_type = Column(String, nullable=False)
    detected_problem = Column(String, nullable=True)
    risk_level = Column(String, nullable=False) # "Low", "Medium", "High"
    status = Column(String, nullable=True) # "Normal", "Warning", "Critical"
    confidence = Column(Float, nullable=False)
    stability_score = Column(Integer, nullable=True)
    media_source = Column(String, nullable=True) # "upload", "live"
    metrics = Column(JSON, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="analyses")
    media_file = relationship("MediaFile", back_populates="analyses")
