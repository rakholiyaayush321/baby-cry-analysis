import requests
import json
import os
import numpy as np
import soundfile as sf

BASE_URL = "http://127.0.0.1:8000"

def test_health_check():
    print("Testing Health Check...")
    try:
        # Check if login works (assuming user exists from previous sessions)
        # For simplicity, we just check if the server is up
        response = requests.get(BASE_URL)
        print(f"Status: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

def create_mock_audio():
    os.makedirs("temp", exist_ok=True)
    path = "temp/mock_cry.wav"
    # Create 2 seconds of silence/noise
    data = np.random.uniform(-1, 1, 44100 * 2)
    sf.write(path, data, 44100)
    return path

def test_analysis_api():
    print("\nTesting Auto Analysis API (Audio)...")
    audio_path = create_mock_audio()
    try:
        with open(audio_path, "rb") as f:
            files = {"audio": ("mock_cry.wav", f, "audio/wav")}
            response = requests.post(f"{BASE_URL}/api/analyze/audio", files=files)
            print(f"Status: {response.status_code}")
            try:
                print(json.dumps(response.json(), indent=2))
            except:
                print(response.text)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

if __name__ == "__main__":
    test_health_check()
    test_analysis_api()
