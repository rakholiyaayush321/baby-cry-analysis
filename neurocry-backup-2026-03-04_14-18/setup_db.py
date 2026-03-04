import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import models
import database
import auth
from sqlalchemy.orm import Session

# Initialize DB tables
print("Initializing database tables...")
models.Base.metadata.create_all(bind=database.engine)

db = database.SessionLocal()
try:
    email = "rakholiyaayush894@gmail.com"
    password = "Ayush123"
    
    # Check if user exists
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        print(f"Creating user {email}...")
        hashed_pw = auth.get_password_hash(password)
        new_user = models.User(email=email, hashed_password=hashed_pw)
        db.add(new_user)
        db.commit()
        print("User created successfully!")
    else:
        print(f"User {email} already exists.")
finally:
    db.close()
    
print("Database setup complete.")
