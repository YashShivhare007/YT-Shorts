#!/usr/bin/env python3
"""
Test script for the new backend endpoints
"""

import requests
import json
import time

# Backend URL
BASE_URL = "http://localhost:5000"

def test_endpoints_list():
    """Test the endpoints listing"""
    print("🔍 Testing /endpoints...")
    response = requests.get(f"{BASE_URL}/endpoints")
    if response.status_code == 200:
        print("✅ Endpoints listing works!")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"❌ Endpoints listing failed: {response.status_code}")
    print("-" * 50)

def test_health():
    """Test health endpoint"""
    print("🏥 Testing /health...")
    response = requests.get(f"{BASE_URL}/health")
    if response.status_code == 200:
        print("✅ Health check works!")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"❌ Health check failed: {response.status_code}")
    print("-" * 50)

def test_youtube_processing():
    """Test YouTube processing endpoint"""
    print("📺 Testing /process-youtube...")
    
    payload = {
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "VideoId": "test_youtube_123",
        "clips": [
            {
                "final_start_time": 10.0,
                "final_end_time": 25.0,
                "category": "test_clip",
                "confidence": 0.95
            }
        ]
    }
    
    response = requests.post(f"{BASE_URL}/process-youtube", json=payload)
    if response.status_code == 200:
        result = response.json()
        print("✅ YouTube processing started!")
        print(json.dumps(result, indent=2))
        return result.get('VideoId')
    else:
        print(f"❌ YouTube processing failed: {response.status_code}")
        print(response.text)
        return None

def test_drive_clips_processing():
    """Test Drive clips processing endpoint"""
    print("🗂️ Testing /process-drive-clips...")
    
    payload = {
        "drive_url": "https://drive.google.com/file/d/1ABC123DEF456/view",
        "VideoId": "test_drive_clips_123",
        "clips": [
            {
                "final_start_time": 5.0,
                "final_end_time": 20.0,
                "category": "test_drive_clip",
                "confidence": 0.90
            }
        ]
    }
    
    response = requests.post(f"{BASE_URL}/process-drive-clips", json=payload)
    if response.status_code == 200:
        result = response.json()
        print("✅ Drive clips processing started!")
        print(json.dumps(result, indent=2))
        return result.get('VideoId')
    else:
        print(f"❌ Drive clips processing failed: {response.status_code}")
        print(response.text)
        return None

def test_transcript_generation():
    """Test transcript generation endpoint"""
    print("📝 Testing /generate-transcript...")
    
    payload = {
        "drive_url": "https://drive.google.com/file/d/1ABC123DEF456/view",
        "VideoId": "test_transcript_123"
    }
    
    response = requests.post(f"{BASE_URL}/generate-transcript", json=payload)
    if response.status_code == 200:
        result = response.json()
        print("✅ Transcript generation started!")
        print(json.dumps(result, indent=2))
        return result.get('VideoId')
    else:
        print(f"❌ Transcript generation failed: {response.status_code}")
        print(response.text)
        return None

def test_status(VideoId):
    """Test status endpoint"""
    if not VideoId:
        return
        
    print(f"📊 Testing /status/{VideoId}...")
    response = requests.get(f"{BASE_URL}/status/{VideoId}")
    if response.status_code == 200:
        print("✅ Status check works!")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"❌ Status check failed: {response.status_code}")
        print(response.text)

def main():
    """Run all tests"""
    print("🚀 Testing Backend API Endpoints")
    print("=" * 50)
    
    # Test basic endpoints
    test_health()
    test_endpoints_list()
    
    # Test processing endpoints (these will fail without proper setup, but should return proper error messages)
    print("Note: The following tests will likely fail without proper setup (Google Drive credentials, etc.)")
    print("But they should return proper error messages and HTTP status codes.")
    print()
    
    # Test YouTube processing
    youtube_VideoId = test_youtube_processing()
    print("-" * 50)
    
    # Test Drive clips processing  
    drive_clips_VideoId = test_drive_clips_processing()
    print("-" * 50)
    
    # Test transcript generation
    transcript_VideoId = test_transcript_generation()
    print("-" * 50)
    
    # Test status for one of them
    if youtube_VideoId:
        test_status(youtube_VideoId)
    
    print("\n🎉 Testing completed!")
    print("\nAPI Endpoint Summary:")
    print("1. /process-youtube - For YouTube links with timestamps")
    print("2. /process-drive-clips - For Drive links with timestamps") 
    print("3. /generate-transcript - For Drive links to generate transcripts")
    print("4. /status/<VideoId> - To check processing status")
    print("5. /health - Health check")
    print("6. /endpoints - List all endpoints")

if __name__ == "__main__":
    main() 