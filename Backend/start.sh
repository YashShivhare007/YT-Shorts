#!/bin/bash

# Install system dependencies
apt-get update && apt-get install -y ffmpeg

# Create temp directory if it doesn't exist
mkdir -p temp_videos

# Set environment variables
export FLASK_ENV=production
export FLASK_APP=backed_api.py

# Start the application
gunicorn --bind 0.0.0.0:$PORT backed_api:app --workers 2 --timeout 300 --keep-alive 2 --max-requests 1000 --max-requests-jitter 50 