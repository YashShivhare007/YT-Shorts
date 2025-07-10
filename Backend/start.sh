#!/bin/bash

# Install system dependencies
# This is often handled better by the deployment platform's configuration (e.g., nixpacks.toml or Dockerfile)
# apt-get update && apt-get install -y ffmpeg

# Create temp directory if it doesn't exist
mkdir -p temp_videos

# Set environment variables
export FLASK_ENV=production
export FLASK_APP=backed_api.py

# Start the application with a single worker to ensure in-memory status works correctly.
# Using --threads can help handle more connections even with a single process.
# Using a --timeout of 600s (10 minutes) to handle long-running transcriptions/clipping.
gunicorn --bind 0.0.0.0:$PORT "Backend.backed_api:app" --workers 1 --threads 4 --timeout 600 