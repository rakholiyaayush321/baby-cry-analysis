from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    children = relationship("Child", back_populates="parent")

class Child(Base):
    __tablename__ = "children"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    weight = Column(Float, nullable=False)

    parent = relationship("User", back_populates="children")
    analyses = relationship("AnalysisRecord", back_populates="child")

class AnalysisRecord(Base):
    __tablename__ = "analysis_records"

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    cry_type = Column(String, nullable=False)
    confidence_score = Column(Float, nullable=False)
    breathing_status = Column(String, nullable=False)
    distress_score = Column(Float, nullable=False)
    recommendation = Column(String, nullable=False)
    metrics = Column(JSON, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)

    child = relationship("Child", back_populates="analyses")
