#!/usr/bin/env python3
"""
Backend processor for YouTube video clipping and upload
Handles: download -> clip -> upload -> return status
Now supports: YouTube links, Drive links with timestamps, Drive transcription
"""

import argparse
import json
import os
import subprocess
import sys
import re
import tempfile
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Google Drive API imports
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
import io

# Audio processing and transcription
# import whisper  # REMOVED - Only using AssemblyAI now
# from pydub import AudioSegment  # REMOVED - Using ffmpeg directly
import requests
import gdown

# If modifying these scopes, delete the file token.pickle.
SCOPES = ['https://www.googleapis.com/auth/drive.file']

class VideoProcessor:
    def __init__(self, output_dir: str = "temp_videos"):
        """Initialize the video processor with output directory"""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Initialize Whisper model as None (will be loaded on first use)
        self.whisper_model = None
        self.loaded_model_name = None
        
        # Initialize Google Drive service as None (will be set up on first use)
        self.drive_service = None
        
        # API clients (initialized on demand)
        self.openai_client = None
        self.assemblyai_client = None
        
        print(f"🎬 VideoProcessor initialized with output directory: {self.output_dir}")
        print(f"💾 Whisper model will be cached after first load")
        print(f"📁 Google Drive service will be initialized on first use")
        
    def setup_google_drive(self):
        """Setup Google Drive API authentication using Service Account"""
        import os
        import json
        from google.oauth2 import service_account
        
        try:
            # Try to get service account JSON from environment variable (production)
            service_account_json = os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON')
            
            if service_account_json:
                print("🔐 Using Service Account from environment variable")
                # Parse JSON from environment variable
                service_account_info = json.loads(service_account_json)
                creds = service_account.Credentials.from_service_account_info(
                    service_account_info, scopes=SCOPES
                )
            else:
                # Fallback to credentials.json file (development)
                print("🔐 Using credentials.json file (development mode)")
                if os.path.exists('credentials.json'):
                    creds = service_account.Credentials.from_service_account_file(
                        'credentials.json', scopes=SCOPES
                    )
                else:
                    raise FileNotFoundError(
                        "No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON environment variable "
                        "or provide credentials.json file"
                    )
            
            self.drive_service = build('drive', 'v3', credentials=creds)
            print("✅ Google Drive API setup successful")
            
        except Exception as e:
            print(f"❌ Google Drive setup failed: {e}")
            raise Exception(f"Google Drive authentication failed: {e}")
        
    def setup_assemblyai_api(self, api_key: str = None):
        """
        Setup AssemblyAI API for transcription with optimized configuration
        Fast, cheap, high accuracy. Requires API key.
        """
        try:
            import assemblyai as aai
            
            # Get API key from environment or parameter
            if api_key:
                aai.settings.api_key = api_key
                self.assemblyai_api_key = api_key
            else:
                # Try to get from environment variable
                import os
                api_key = os.getenv('ASSEMBLYAI_API_KEY')
                if not api_key:
                    raise ValueError("AssemblyAI API key not found. Set ASSEMBLYAI_API_KEY environment variable or pass api_key parameter")
                aai.settings.api_key = api_key
                self.assemblyai_api_key = api_key
            
            # Configure timeout settings for large files - be generous with timeouts
            # AssemblyAI's upload can take a while for large files
            aai.settings.http_timeout = 600.0  # 10 minutes timeout for upload
            
            # Store the client for later use
            self.assemblyai_client = aai
            
            print(f"✅ AssemblyAI API setup successful")
            print(f"🌐 Using AssemblyAI servers for transcription")
            print(f"💰 Cost: ~$0.37 per hour of audio")
            print(f"⚡ Fast, accurate Hindi transcription")
            print(f"⏱️  HTTP timeout set to 10 minutes for large file uploads")
            print(f"🔄 Retry logic: 3 attempts with progressive backoff")
            
        except ImportError:
            print("❌ AssemblyAI package not installed. Installing now...")
            import subprocess
            try:
                subprocess.run(["pip", "install", "assemblyai"], check=True, timeout=120)
                print("✅ AssemblyAI package installed successfully")
                self.setup_assemblyai_api(api_key)
            except subprocess.TimeoutExpired:
                raise Exception("AssemblyAI package installation timed out. Please install manually: pip install assemblyai")
            except subprocess.CalledProcessError as e:
                raise Exception(f"Failed to install AssemblyAI package: {e}")
        except Exception as e:
            print(f"❌ AssemblyAI API setup failed: {e}")
            raise

    def setup_whisper(self, model_size: str = "large-v3"):
        """REMOVED - Only using AssemblyAI now"""
        print("⚠️  Whisper setup skipped - using AssemblyAI only")
        pass

    def setup_openai_whisper_api(self, api_key: str = None):
        """REMOVED - Only using AssemblyAI now"""
        print("⚠️  OpenAI Whisper setup skipped - using AssemblyAI only")
        pass

    def extract_drive_file_id(self, drive_url: str) -> str:
        """Extract file ID from Google Drive URL"""
        patterns = [
            r'/file/d/([a-zA-Z0-9-_]+)',
            r'id=([a-zA-Z0-9-_]+)',
            r'/d/([a-zA-Z0-9-_]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, drive_url)
            if match:
                return match.group(1)
                
        raise ValueError(f"Could not extract file ID from Drive URL: {drive_url}")
        
    def download_from_drive(self, drive_url: str, output_filename: str) -> str:
        """
        Download file from Google Drive using the new drive.usercontent.google.com endpoint.
        This method is more reliable for large files and handles confirmation tokens automatically.
        Only works for 'Anyone with the link' files.
        """
        import requests
        import os
        import re
        
        # Extract file ID from the drive link
        file_id = self.extract_drive_file_id(drive_url)
        if not file_id:
            raise ValueError(f"Could not extract file ID from the provided link: {drive_url}")
        
        output_path = self.output_dir / output_filename
        print(f"[NEW METHOD] Downloading from Drive, file ID: {file_id}")
        
        # Method 1: Try the new drive.usercontent.google.com endpoint first
        # This is the most reliable method for large files as of 2024
        download_url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
        
        try:
            print(f"Attempting download with new endpoint: {download_url}")
            response = requests.get(download_url, stream=True, timeout=30)
            
            if response.status_code == 200:
                # Check if we got HTML (error page) instead of the actual file
                first_chunk = next(response.iter_content(chunk_size=1024), b'')
                if b'<html' in first_chunk.lower() or b'<!doctype' in first_chunk.lower():
                    print("Received HTML error page, trying fallback method...")
                    raise Exception("HTML response received")
                
                # Reset the response for streaming
                response = requests.get(download_url, stream=True, timeout=30)
                
                with open(output_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                print(f"Download completed successfully: {output_path}")
                return str(output_path)
                
        except Exception as e:
            print(f"New endpoint failed: {e}")
            print("Trying fallback method...")
        
        # Method 2: Fallback to the traditional method with confirmation token handling
        try:
            # First request to get the confirmation token for large files
            initial_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            print(f"Trying fallback method with initial URL: {initial_url}")
            
            response = requests.get(initial_url, stream=True, timeout=30)
            
            if response.status_code == 200:
                # Check if we need a confirmation token (for large files)
                content = response.text
                if 'confirm=' in content:
                    # Extract confirmation token
                    import re
                    confirm_match = re.search(r'confirm=([a-zA-Z0-9_-]+)', content)
                    if confirm_match:
                        confirm_token = confirm_match.group(1)
                        print(f"Found confirmation token: {confirm_token}")
                        
                        # Make the actual download request with the token
                        download_url_with_token = f"https://drive.google.com/uc?export=download&id={file_id}&confirm={confirm_token}"
                        print(f"Downloading with confirmation token: {download_url_with_token}")
                        
                        response = requests.get(download_url_with_token, stream=True, timeout=30)
                        
                        if response.status_code == 200:
                            with open(output_path, 'wb') as f:
                                for chunk in response.iter_content(chunk_size=8192):
                                    if chunk:
                                        f.write(chunk)
                            
                            print(f"Download completed with confirmation token: {output_path}")
                            return str(output_path)
                    else:
                        print("Could not extract confirmation token")
                else:
                    # Small file, direct download
                    with open(output_path, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    
                    print(f"Download completed (small file): {output_path}")
                    return str(output_path)
            
        except Exception as e:
            print(f"Fallback method also failed: {e}")
        
        # Method 3: Final fallback - try yt-dlp for Drive links
        try:
            print("Trying yt-dlp as final fallback...")
            return self._download_with_ytdlp(drive_url, output_filename)
            
        except Exception as e:
            print(f"yt-dlp fallback also failed: {e}")
            raise Exception(f"All download methods failed for file ID {file_id}. "
                          f"Make sure the file is shared with 'Anyone with the link' (Viewer) in Google Drive.")
    
    def download_from_drive_fixed(self, drive_url: str, output_filename: str) -> str:
        """
        Improved Google Drive download method that handles corrupted files
        """
        import requests
        import subprocess
        import time
        
        # Extract file ID from the drive link
        file_id = self.extract_drive_file_id(drive_url)
        if not file_id:
            raise ValueError(f"Could not extract file ID from the provided link: {drive_url}")
        
        output_path = self.output_dir / output_filename
        print(f"🔧 [FIXED METHOD] Downloading from Drive, file ID: {file_id}")
        
        # Method 1: Try with Google Drive API using service account
        try:
            if self.drive_service:
                print("🔧 Attempting download using Google Drive API...")
                request = self.drive_service.files().get_media(fileId=file_id)
                
                with open(output_path, 'wb') as f:
                    downloader = MediaIoBaseDownload(f, request)
                    done = False
                    while done is False:
                        status, done = downloader.next_chunk()
                        if status:
                            print(f"📊 Download progress: {int(status.progress() * 100)}%")
                
                # Verify the downloaded file
                if output_path.exists() and output_path.stat().st_size > 1000:
                    print(f"✅ Drive API download successful: {output_path}")
                    print(f"📁 File size: {output_path.stat().st_size / (1024*1024):.2f} MB")
                    return str(output_path)
                else:
                    print("⚠️  Drive API download produced small/empty file, trying fallback...")
                    
        except Exception as e:
            print(f"⚠️  Drive API method failed: {e}")
            print("🔄 Trying direct download methods...")
        
        # Method 2: Enhanced direct download with better headers and session
        try:
            print("🔧 Attempting enhanced direct download...")
            
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            })
            
            # Try multiple download URLs
            download_urls = [
                f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t",
                f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t",
                f"https://drive.google.com/uc?export=download&id={file_id}"
            ]
            
            for i, url in enumerate(download_urls):
                try:
                    print(f"🔗 Trying download URL {i+1}: {url}")
                    response = session.get(url, stream=True, timeout=60)
                    
                    if response.status_code == 200:
                        # Check content type and first chunk
                        content_type = response.headers.get('content-type', '').lower()
                        first_chunk = next(response.iter_content(chunk_size=1024), b'')
                        
                        # Skip if we get HTML instead of video
                        if b'<html' in first_chunk.lower() or 'text/html' in content_type:
                            print(f"⚠️  URL {i+1} returned HTML, trying next...")
                            continue
                        
                        # Reset response and download
                        response = session.get(url, stream=True, timeout=60)
                        
                        with open(output_path, 'wb') as f:
                            downloaded = 0
                            for chunk in response.iter_content(chunk_size=8192):
                                if chunk:
                                    f.write(chunk)
                                    downloaded += len(chunk)
                                    if downloaded % (1024*1024) == 0:  # Every MB
                                        print(f"📊 Downloaded: {downloaded / (1024*1024):.1f} MB")
                        
                        # Verify download
                        if output_path.exists() and output_path.stat().st_size > 1000:
                            print(f"✅ Enhanced download successful: {output_path}")
                            print(f"📁 File size: {output_path.stat().st_size / (1024*1024):.2f} MB")
                            
                            # Quick integrity check using ffprobe
                            try:
                                probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(output_path)]
                                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
                                if probe_result.returncode == 0:
                                    print("✅ Video file integrity verified with ffprobe")
                                    return str(output_path)
                                else:
                                    print("⚠️  ffprobe failed, file might be corrupted, trying next method...")
                                    continue
                            except Exception as probe_error:
                                print(f"⚠️  ffprobe check failed: {probe_error}, but file exists, continuing...")
                                return str(output_path)
                        else:
                            print(f"⚠️  URL {i+1} produced small/empty file, trying next...")
                            
                except Exception as e:
                    print(f"⚠️  URL {i+1} failed: {e}")
                    continue
            
        except Exception as e:
            print(f"⚠️  Enhanced direct download failed: {e}")
        
        # Method 3: yt-dlp as final fallback
        try:
            print("🔧 Trying yt-dlp as final fallback...")
            return self._download_with_ytdlp(drive_url, output_filename)
            
        except Exception as e:
            print(f"⚠️  yt-dlp fallback failed: {e}")
            
        # If all methods fail
        raise Exception(f"All download methods failed for file ID {file_id}. "
                      f"Please ensure the file is shared with 'Anyone with the link' (Viewer) in Google Drive "
                      f"and the file is a valid video format.")

    def _download_with_ytdlp(self, drive_url: str, output_filename: str) -> str:
        """Fallback method using yt-dlp for Google Drive downloads"""
        output_path = self.output_dir / output_filename
        
        # yt-dlp command for Google Drive using system binary
        cmd = [
            "yt-dlp",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "-f", "best[ext=mp4]/best[ext=mp4]/best",  # Prefer mp4
            "-o", str(output_path),
            drive_url
        ]
        
        try:
            print(f"[yt-dlp fallback] Running command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"[yt-dlp fallback] Download completed: {output_path}")
            return str(output_path)
            
        except subprocess.CalledProcessError as e:
            print(f"[yt-dlp fallback] Failed: {e.stderr}")
            raise Exception(f"yt-dlp fallback failed: {e.stderr}")
            
    def extract_audio_from_video(self, video_path: str) -> str:
        """Extract audio from video file"""
        try:
            audio_path = video_path.rsplit('.', 1)[0] + '_audio.wav'
            
            cmd = [
                "ffmpeg",
                "-i", video_path,
                "-vn",  # No video
                "-acodec", "pcm_s16le",  # WAV format
                "-ar", "16000",  # 16kHz sample rate (good for Whisper)
                "-ac", "1",  # Mono
                "-y",  # Overwrite
                audio_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"Audio extracted: {audio_path}")
            return audio_path
            
        except subprocess.CalledProcessError as e:
            print(f"Audio extraction failed: {e.stderr}")
            raise
            
    def transcribe_audio(self, audio_path: str) -> List[Dict]:
        """
        Transcribe audio using AssemblyAI only - no fallbacks
        """
        print(f"🎤 Starting transcription with AssemblyAI...")
        self.setup_assemblyai_api()
        return self.transcribe_with_assemblyai_api(audio_path)

    def download_video(self, youtube_url: str, VideoId: str) -> str:
        """Download video using yt-dlp with highest quality"""
        output_path = self.output_dir / f"{VideoId}.%(ext)s"
        
        # Simple yt-dlp command for highest quality using system binary
        cmd = [
            "yt-dlp",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "-f", "best[height<=1080][ext=mp4]/best[ext=mp4]/best",  # Prefer mp4, max 1080p
                "-o", str(output_path),
                youtube_url
            ]
            
        try:
            print(f"[DEBUG] Running yt-dlp command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"[DEBUG] yt-dlp stdout: {result.stdout}")
            print(f"Download completed for {VideoId}")
            
            # Find the downloaded file
            for file in self.output_dir.glob(f"{VideoId}.*"):
                if file.suffix in ['.mp4', '.webm', '.mkv']:
                    return str(file)
            raise FileNotFoundError(f"Downloaded video file not found for {VideoId}")
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] yt-dlp failed with exit code: {e.returncode}")
            print(f"[ERROR] yt-dlp stderr: {e.stderr}")
            raise

    def cleanup_files(self, file_paths: List[str]):
        """Clean up temporary files"""
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Cleaned up: {file_path}")
            except OSError as e:
                print(f"Failed to clean up {file_path}: {e}")
            
    def create_clip(self, video_path: str, start_time: float, end_time: float, 
                   output_name: str, category: str) -> str:
        """Create a clip using ffmpeg with Shorts format (9:16 aspect ratio)"""
        try:
            # Calculate duration
            duration = end_time - start_time
            
            # Output path for the clip
            clip_path = self.output_dir / f"{output_name}_{category}.mp4"
            
            # FFmpeg command optimized for speed using stream copy.
            # This avoids re-encoding, which is the most time-consuming part.
            # The trade-off is that we can't apply filters like scaling/padding.
            cmd = [
                "ffmpeg",
                "-ss", str(start_time),
                "-i", video_path,
                "-t", str(duration),
                "-c:v", "copy",
                "-c:a", "copy",
                "-y",  # Overwrite output file
                str(clip_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"Clip created: {clip_path}")
            return str(clip_path)
            
        except subprocess.CalledProcessError as e:
            print(f"Clip creation failed: {e.stderr}")
            raise
            
    def upload_to_drive(self, file_path: str, filename: str) -> str:
        """Upload file to Google Drive and return shareable link"""
        if not self.drive_service:
            raise RuntimeError("Google Drive not initialized")
            
        try:
            # Get the parent folder ID from environment variables
            parent_folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
            if not parent_folder_id:
                raise ValueError("GOOGLE_DRIVE_FOLDER_ID environment variable not set.")

            file_metadata = {
                'name': filename,
                'parents': [parent_folder_id]  # Specify the parent folder
            }
            media = MediaFileUpload(file_path, resumable=True)
            
            file = self.drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id,webViewLink',
                supportsAllDrives=True  # Corrected parameter name
            ).execute()
            
            # Make the file publicly accessible
            self.drive_service.permissions().create(
                fileId=file['id'],
                body={'type': 'anyone', 'role': 'reader'},
                fields='id',
                supportsAllDrives=True  # Corrected parameter name
            ).execute()
            
            print(f"Uploaded to Drive: {file['webViewLink']}")
            return file['webViewLink']
            
        except Exception as e:
            print(f"Upload failed: {e}")
            raise
            
    def process_video_youtube(self, youtube_url: str, VideoId: str, clips_data: List[Dict]) -> Dict:
        """Process YouTube video with clips (Scenario 1)"""
        print(f"[DEBUG] process_video_youtube called with VideoId: {VideoId}")
        try:
            # Download the video
            print(f"Starting download for {VideoId}")
            video_path = self.download_video(youtube_url, VideoId)
            print(f"Download completed, video_path: {video_path}")
            
            # Setup Google Drive
            print("Setting up Google Drive...")
            self.setup_google_drive()
            print("Google Drive setup completed")
            
            # Process each clip
            results = []
            temp_files = [video_path]  # Track files for cleanup
            
            for i, clip_data in enumerate(clips_data):
                print(f"Processing clip {i+1}/{len(clips_data)}")
                try:
                    start_time = clip_data['final_start_time']
                    end_time = clip_data['final_end_time']
                    category = clip_data['category']
                    confidence = clip_data['confidence']
                    
                    # Create clip
                    clip_filename = f"clip_{i+1}_{category}"
                    print(f"Creating clip: {clip_filename}")
                    clip_path = self.create_clip(
                        video_path, start_time, end_time, 
                        clip_filename, category
                    )
                    temp_files.append(clip_path)
                    print(f"Clip created: {clip_path}")
                    
                    # Upload to Drive
                    drive_filename = f"{VideoId}_{clip_filename}.mp4"
                    print(f"Uploading to Drive: {drive_filename}")
                    drive_link = self.upload_to_drive(clip_path, drive_filename)
                    print(f"Upload completed: {drive_link}")
                    
                    results.append({
                        'clip_number': i + 1,
                        'category': category,
                        'confidence': confidence,
                        'start_time': start_time,
                        'end_time': end_time,
                        'drive_link': drive_link,
                        'status': 'success'
                    })
                    
                except Exception as e:
                    print(f"Failed to process clip {i+1}: {e}")
                    results.append({
                        'clip_number': i + 1,
                        'category': clip_data.get('category', 'unknown'),
                        'confidence': clip_data.get('confidence', 0),
                        'start_time': clip_data.get('final_start_time', 0),
                        'end_time': clip_data.get('final_end_time', 0),
                        'drive_link': None,
                        'status': 'failed',
                        'error': str(e)
                    })
            
            # Cleanup
            print("Cleaning up temporary files...")
            self.cleanup_files(temp_files)
            
            # Return results
            final_result = {
                'VideoId': VideoId,
                'status': 'completed',
                'clips_processed': len(results),
                'successful_clips': len([r for r in results if r['status'] == 'success']),
                'failed_clips': len([r for r in results if r['status'] == 'failed']),
                'results': results
            }
            print(f"[DEBUG] Final result: {final_result}")
            return final_result
            
        except Exception as e:
            print(f"[ERROR] Processing failed: {e}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            return {
                'VideoId': VideoId,
                'status': 'failed',
                'error': str(e),
                'results': []
            }
            
    def process_video_drive_clips(self, drive_url: str, VideoId: str, clips_data: List[Dict] = None, input_data: Dict = None) -> Dict:
        """Process Drive video with clips (Scenario 2)"""
        print(f"[DEBUG] process_video_drive_clips called with VideoId: {VideoId}")
        
        # Handle new input format where clips_data comes from input_data
        if input_data and 'output' in input_data:
            clips_data = input_data['output']
            print(f"[DEBUG] Using clips data from input_data: {len(clips_data)} clips")
        elif clips_data is None:
            raise ValueError("No clips data provided. Either pass clips_data or input_data with 'output' field.")
        
        try:
            # Setup Google Drive
            print("Setting up Google Drive...")
            self.setup_google_drive()
            print("Google Drive setup completed")
            
            # Check if video already exists locally (optimization from transcript generation)
            video_filename = f"{VideoId}_source.mp4"
            existing_video_path = self.output_dir / video_filename
            
            # Also check for transcript source video (reuse from generate_transcript)
            transcript_video_filename = f"{VideoId}_transcript_source.mp4"
            transcript_video_path = self.output_dir / transcript_video_filename
            
            if existing_video_path.exists() and existing_video_path.stat().st_size > 0:
                print(f"✅ Video already exists locally: {existing_video_path}")
                video_path = str(existing_video_path)
            elif transcript_video_path.exists() and transcript_video_path.stat().st_size > 0:
                print(f"✅ Reusing video from transcript generation: {transcript_video_path}")
                video_path = str(transcript_video_path)
            else:
                # Download the video from Drive using the improved method
                print(f"📥 Video not found locally. Starting download from Drive for {VideoId}")
                video_path = self.download_from_drive_fixed(drive_url, video_filename)
                print(f"✅ Download completed, video_path: {video_path}")
            
            # Process each clip
            results = []
            temp_files = []  # Don't add video_path to cleanup - keep it for reuse
            
            for i, clip_data in enumerate(clips_data):
                print(f"Processing clip {i+1}/{len(clips_data)}")
                try:
                    start_time = clip_data['final_start_time']
                    end_time = clip_data['final_end_time']
                    category = clip_data['category']
                    confidence = clip_data['confidence']
                    
                    # Create clip
                    clip_filename = f"clip_{i+1}_{category}"
                    print(f"Creating clip: {clip_filename}")
                    clip_path = self.create_clip(
                        video_path, start_time, end_time, 
                        clip_filename, category
                    )
                    temp_files.append(clip_path)
                    print(f"Clip created: {clip_path}")
                    
                    # Upload to Drive
                    drive_filename = f"{VideoId}_{clip_filename}.mp4"
                    print(f"Uploading to Drive: {drive_filename}")
                    drive_link = self.upload_to_drive(clip_path, drive_filename)
                    print(f"Upload completed: {drive_link}")
                    
                    results.append({
                        'clip_number': i + 1,
                        'category': category,
                        'confidence': confidence,
                        'start_time': start_time,
                        'end_time': end_time,
                        'drive_link': drive_link,
                        'status': 'success'
                    })
                    
                except Exception as e:
                    print(f"Failed to process clip {i+1}: {e}")
                    results.append({
                        'clip_number': i + 1,
                        'category': clip_data.get('category', 'unknown'),
                        'confidence': clip_data.get('confidence', 0),
                        'start_time': clip_data.get('final_start_time', 0),
                        'end_time': clip_data.get('final_end_time', 0),
                        'drive_link': None,
                        'status': 'failed',
                        'error': str(e)
                    })
            
            # Cleanup only clip files, keep video for reuse
            print("Cleaning up clip files (keeping video for reuse)...")
            self.cleanup_files(temp_files)
            
            # Return results
            final_result = {
                'VideoId': VideoId,
                'status': 'completed',
                'clips_processed': len(results),
                'successful_clips': len([r for r in results if r['status'] == 'success']),
                'failed_clips': len([r for r in results if r['status'] == 'failed']),
                'results': results,
                'video_reused': existing_video_path.exists() or transcript_video_path.exists()
            }
            print(f"[DEBUG] Final result: {final_result}")
            return final_result
            
        except Exception as e:
            print(f"[ERROR] Processing failed: {e}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            return {
                'VideoId': VideoId,
                'status': 'failed',
                'error': str(e),
                'results': []
            }

    def generate_transcript_from_drive(self, drive_url: str, VideoId: str) -> Dict:
        """Generate transcript from Drive video - Downloads video for later clip processing"""
        print(f"[DEBUG] generate_transcript_from_drive called with VideoId: {VideoId}")
        
        try:
            # Setup Google Drive
            print("🔧 Setting up Google Drive...")
            self.setup_google_drive()
            print("✅ Google Drive setup completed")
            
            # Setup AssemblyAI API
            print("🔧 Setting up AssemblyAI API...")
            self.setup_assemblyai_api()
            print("✅ AssemblyAI API setup completed")
            
            # Download the video (IMPORTANT: Keep for later clip processing!)
            video_filename = f"{VideoId}_source.mp4"
            video_path = self.output_dir / video_filename
            
            if not video_path.exists() or video_path.stat().st_size == 0:
                print(f"📥 Downloading video from Drive: {drive_url}")
                video_path = self.download_from_drive_fixed(drive_url, video_filename)
                print(f"✅ Download completed: {video_path}")
            else:
                print(f"✅ Video already exists locally: {video_path}")
            
            # Extract audio for transcription
            audio_filename = f"{VideoId}_source_audio.wav"
            audio_path = self.output_dir / audio_filename
            
            if not audio_path.exists() or audio_path.stat().st_size == 0:
                print(f"🎵 Extracting audio from video...")
                audio_path = self.extract_audio_from_video(str(video_path))
                print(f"✅ Audio extracted: {audio_path}")
            else:
                print(f"✅ Audio already exists locally: {audio_path}")
            
            # Transcribe with AssemblyAI
            print(f"🎤 Starting transcription with AssemblyAI...")
            transcript_segments = self.transcribe_with_assemblyai_api(audio_path)
            
            # Clean transcript (Hindi phonetic cleaning)
            print(f"🧹 Cleaning transcript...")
            cleaned_segments = self.advanced_hindi_phonetic_cleaning(transcript_segments)
            print(f"✅ Transcript cleaned: {len(cleaned_segments)} segments")
            
            # Return result (NO SAVING TO DRIVE - just return the transcript)
            final_result = {
                'VideoId': VideoId,
                'status': 'completed',
                'transcript_segments': len(cleaned_segments),
                'segments': cleaned_segments,
                'video_path': str(video_path),  # Keep for later clip processing
                'audio_path': str(audio_path)
            }
            
            print(f"[DEBUG] Final result: Video ID {VideoId}, {len(cleaned_segments)} segments")
            return final_result
            
        except Exception as e:
            print(f"[ERROR] Transcription failed: {e}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            
            return {
                'VideoId': VideoId,
                'status': 'failed',
                'error': str(e),
                'segments': []
            }

    # Legacy method for backward compatibility
    def process_video(self, youtube_url: str, VideoId: str, clips_data: List[Dict]) -> Dict:
        """Legacy method - redirects to YouTube processing"""
        return self.process_video_youtube(youtube_url, VideoId, clips_data)

    def advanced_hindi_phonetic_cleaning(self, transcript_segments: List[Dict]) -> List[Dict]:
        """
        Advanced Hindi phonetic cleaning to ensure pure Hindi script output.
        Converts English words to phonetic Hindi instead of removing them.
        This ensures "hello everyone im yash" becomes "हैलो एवरीवन आइम यश"
        """
        import re
        
        # Comprehensive English to Hindi phonetic mapping
        phonetic_mapping = {
            # Common greetings and expressions
            r'\b(hello|hi)\b': 'हैलो',
            r'\b(hey)\b': 'हे',
            r'\b(bye|goodbye)\b': 'बाय',
            r'\b(ok|okay)\b': 'ओके',
            r'\b(yes|yeah|yep)\b': 'यस',
            r'\b(no|nope)\b': 'नो',
            r'\b(please)\b': 'प्लीज़',
            r'\b(sorry)\b': 'सॉरी',
            r'\b(thank you|thanks)\b': 'थैंक्स',
            r'\b(welcome)\b': 'वेलकम',
            
            # Common pronouns and names
            r'\b(i|me)\b': 'आई',
            r'\b(you)\b': 'यू',
            r'\b(he|him)\b': 'ही',
            r'\b(she|her)\b': 'शी',
            r'\b(we|us)\b': 'वी',
            r'\b(they|them)\b': 'दे',
            r'\b(my|mine)\b': 'माई',
            r'\b(your|yours)\b': 'योर',
            r'\b(his)\b': 'हिज़',
            r'\b(her|hers)\b': 'हर',
            r'\b(our|ours)\b': 'आवर',
            r'\b(their|theirs)\b': 'देयर',
            
            # Question words
            r'\b(what)\b': 'व्हाट',
            r'\b(when)\b': 'व्हेन',
            r'\b(where)\b': 'व्हेयर',
            r'\b(why)\b': 'व्हाई',
            r'\b(how)\b': 'हाउ',
            r'\b(who)\b': 'हू',
            r'\b(which)\b': 'व्हिच',
            r'\b(whose)\b': 'हूज़',
            r'\b(whom)\b': 'हूम',
            
            # Common verbs
            r'\b(is|am|are)\b': 'इज़',
            r'\b(was|were)\b': 'वाज़',
            r'\b(will|would)\b': 'विल',
            r'\b(can|could)\b': 'कैन',
            r'\b(should|shall)\b': 'शुड',
            r'\b(may|might)\b': 'मे',
            r'\b(have|has|had)\b': 'हैव',
            r'\b(do|does|did)\b': 'डू',
            r'\b(go|goes|went)\b': 'गो',
            r'\b(come|comes|came)\b': 'कम',
            r'\b(get|gets|got)\b': 'गेट',
            r'\b(make|makes|made)\b': 'मेक',
            r'\b(take|takes|took)\b': 'टेक',
            r'\b(give|gives|gave)\b': 'गिव',
            r'\b(see|sees|saw)\b': 'सी',
            r'\b(know|knows|knew)\b': 'नो',
            r'\b(think|thinks|thought)\b': 'थिंक',
            r'\b(say|says|said)\b': 'से',
            r'\b(tell|tells|told)\b': 'टेल',
            r'\b(ask|asks|asked)\b': 'आस्क',
            r'\b(want|wants|wanted)\b': 'वांट',
            r'\b(need|needs|needed)\b': 'नीड',
            r'\b(like|likes|liked)\b': 'लाइक',
            r'\b(love|loves|loved)\b': 'लव',
            r'\b(help|helps|helped)\b': 'हेल्प',
            r'\b(work|works|worked)\b': 'वर्क',
            r'\b(play|plays|played)\b': 'प्ले',
            r'\b(study|studies|studied)\b': 'स्टडी',
            r'\b(learn|learns|learned)\b': 'लर्न',
            r'\b(teach|teaches|taught)\b': 'टीच',
            r'\b(read|reads)\b': 'रीड',
            r'\b(write|writes|wrote)\b': 'राइट',
            r'\b(listen|listens|listened)\b': 'लिसन',
            r'\b(speak|speaks|spoke)\b': 'स्पीक',
            r'\b(understand|understands|understood)\b': 'अंडरस्टैंड',
            
            # Common adjectives
            r'\b(good|better|best)\b': 'गुड',
            r'\b(bad|worse|worst)\b': 'बैड',
            r'\b(big|bigger|biggest)\b': 'बिग',
            r'\b(small|smaller|smallest)\b': 'स्मॉल',
            r'\b(new|newer|newest)\b': 'न्यू',
            r'\b(old|older|oldest)\b': 'ओल्ड',
            r'\b(young|younger|youngest)\b': 'यंग',
            r'\b(fast|faster|fastest)\b': 'फास्ट',
            r'\b(slow|slower|slowest)\b': 'स्लो',
            r'\b(easy|easier|easiest)\b': 'इज़ी',
            r'\b(hard|harder|hardest)\b': 'हार्ड',
            r'\b(important)\b': 'इम्पोर्टेंट',
            r'\b(different)\b': 'डिफरेंट',
            r'\b(same)\b': 'सेम',
            r'\b(right|correct)\b': 'राइट',
            r'\b(wrong)\b': 'रॉन्ग',
            r'\b(true)\b': 'ट्रू',
            r'\b(false)\b': 'फाल्स',
            
            # Common nouns
            r'\b(time)\b': 'टाइम',
            r'\b(day|days)\b': 'डे',
            r'\b(night|nights)\b': 'नाइट',
            r'\b(morning)\b': 'मॉर्निंग',
            r'\b(evening)\b': 'इवनिंग',
            r'\b(week|weeks)\b': 'वीक',
            r'\b(month|months)\b': 'मंथ',
            r'\b(year|years)\b': 'ईयर',
            r'\b(today)\b': 'टुडे',
            r'\b(tomorrow)\b': 'टुमॉरो',
            r'\b(yesterday)\b': 'येस्टर्डे',
            r'\b(home)\b': 'होम',
            r'\b(house|houses)\b': 'हाउस',
            r'\b(school|schools)\b': 'स्कूल',
            r'\b(college|colleges)\b': 'कॉलेज',
            r'\b(university)\b': 'यूनिवर्सिटी',
            r'\b(office|offices)\b': 'ऑफिस',
            r'\b(work)\b': 'वर्क',
            r'\b(job|jobs)\b': 'जॉब',
            r'\b(money)\b': 'मनी',
            r'\b(food)\b': 'फूड',
            r'\b(water)\b': 'वाटर',
            r'\b(book|books)\b': 'बुक',
            r'\b(phone|phones)\b': 'फोन',
            r'\b(computer|computers)\b': 'कंप्यूटर',
            r'\b(internet)\b': 'इंटरनेट',
            r'\b(website|websites)\b': 'वेबसाइट',
            r'\b(email|emails)\b': 'ईमेल',
            r'\b(message|messages)\b': 'मैसेज',
            r'\b(video|videos)\b': 'वीडियो',
            r'\b(photo|photos)\b': 'फोटो',
            r'\b(picture|pictures)\b': 'पिक्चर',
            r'\b(music)\b': 'म्यूज़िक',
            r'\b(song|songs)\b': 'सॉन्ग',
            r'\b(movie|movies)\b': 'मूवी',
            r'\b(game|games)\b': 'गेम',
            r'\b(friend|friends)\b': 'फ्रेंड',
            r'\b(family)\b': 'फैमिली',
            r'\b(people)\b': 'पीपल',
            r'\b(person)\b': 'पर्सन',
            r'\b(man|men)\b': 'मैन',
            r'\b(woman|women)\b': 'वुमन',
            r'\b(boy|boys)\b': 'बॉय',
            r'\b(girl|girls)\b': 'गर्ल',
            r'\b(child|children)\b': 'चाइल्ड',
            r'\b(student|students)\b': 'स्टूडेंट',
            r'\b(teacher|teachers)\b': 'टीचर',
            r'\b(doctor|doctors)\b': 'डॉक्टर',
            r'\b(engineer|engineers)\b': 'इंजीनियर',
            
            # Numbers (common ones)
            r'\b(one)\b': 'वन',
            r'\b(two)\b': 'टू',
            r'\b(three)\b': 'थ्री',
            r'\b(four)\b': 'फोर',
            r'\b(five)\b': 'फाइव',
            r'\b(six)\b': 'सिक्स',
            r'\b(seven)\b': 'सेवन',
            r'\b(eight)\b': 'एट',
            r'\b(nine)\b': 'नाइन',
            r'\b(ten)\b': 'टेन',
            r'\b(hundred)\b': 'हंड्रेड',
            r'\b(thousand)\b': 'थाउज़ेंड',
            r'\b(million)\b': 'मिलियन',
            r'\b(billion)\b': 'बिलियन',
            
            # Common prepositions and conjunctions
            r'\b(and)\b': 'एंड',
            r'\b(or)\b': 'ऑर',
            r'\b(but)\b': 'बट',
            r'\b(so)\b': 'सो',
            r'\b(because)\b': 'बिकॉज़',
            r'\b(if)\b': 'इफ',
            r'\b(then)\b': 'देन',
            r'\b(than)\b': 'दैन',
            r'\b(as)\b': 'ऐज़',
            r'\b(like)\b': 'लाइक',
            r'\b(for)\b': 'फॉर',
            r'\b(with)\b': 'विथ',
            r'\b(without)\b': 'विदाउट',
            r'\b(in)\b': 'इन',
            r'\b(on)\b': 'ऑन',
            r'\b(at)\b': 'एट',
            r'\b(to)\b': 'टू',
            r'\b(from)\b': 'फ्रॉम',
            r'\b(by)\b': 'बाई',
            r'\b(of)\b': 'ऑफ',
            r'\b(about)\b': 'अबाउट',
            r'\b(over)\b': 'ओवर',
            r'\b(under)\b': 'अंडर',
            r'\b(up)\b': 'अप',
            r'\b(down)\b': 'डाउन',
            r'\b(out)\b': 'आउट',
            r'\b(into)\b': 'इनटू',
            r'\b(through)\b': 'थ्रू',
            r'\b(during)\b': 'ड्यूरिंग',
            r'\b(before)\b': 'बिफोर',
            r'\b(after)\b': 'आफ्टर',
            r'\b(between)\b': 'बिटवीन',
            r'\b(among)\b': 'अमंग',
            r'\b(around)\b': 'अराउंड',
            r'\b(near)\b': 'नियर',
            r'\b(far)\b': 'फार',
            r'\b(here)\b': 'हियर',
            r'\b(there)\b': 'देयर',
            r'\b(where)\b': 'व्हेयर',
            r'\b(everywhere)\b': 'एवरीव्हेयर',
            r'\b(somewhere)\b': 'समव्हेयर',
            r'\b(nowhere)\b': 'नोव्हेयर',
            r'\b(everyone|everybody)\b': 'एवरीवन',
            r'\b(someone|somebody)\b': 'समवन',
            r'\b(no one|nobody)\b': 'नो वन',
            r'\b(everything)\b': 'एवरीथिंग',
            r'\b(something)\b': 'समथिंग',
            r'\b(nothing)\b': 'नथिंग',
            r'\b(always)\b': 'ऑलवेज़',
            r'\b(never)\b': 'नेवर',
            r'\b(sometimes)\b': 'समटाइम्स',
            r'\b(often)\b': 'ऑफन',
            r'\b(usually)\b': 'यूज़ुअली',
            r'\b(really)\b': 'रियली',
            r'\b(very)\b': 'वेरी',
            r'\b(quite)\b': 'क्वाइट',
            r'\b(too)\b': 'टू',
            r'\b(also)\b': 'ऑल्सो',
            r'\b(only)\b': 'ओन्ली',
            r'\b(just)\b': 'जस्ट',
            r'\b(still)\b': 'स्टिल',
            r'\b(already)\b': 'ऑलरेडी',
            r'\b(yet)\b': 'येट',
            r'\b(now)\b': 'नाउ',
            r'\b(soon)\b': 'सून',
            r'\b(later)\b': 'लेटर',
            r'\b(first)\b': 'फर्स्ट',
            r'\b(last)\b': 'लास्ट',
            r'\b(next)\b': 'नेक्स्ट',
            r'\b(previous)\b': 'प्रीवियस',
            r'\b(another)\b': 'अनदर',
            r'\b(other|others)\b': 'अदर',
            r'\b(each)\b': 'ईच',
            r'\b(every)\b': 'एवरी',
            r'\b(all)\b': 'ऑल',
            r'\b(some)\b': 'सम',
            r'\b(any)\b': 'एनी',
            r'\b(many)\b': 'मेनी',
            r'\b(much)\b': 'मच',
            r'\b(few)\b': 'फ्यू',
            r'\b(little)\b': 'लिटल',
            r'\b(more)\b': 'मोर',
            r'\b(most)\b': 'मोस्ट',
            r'\b(less)\b': 'लेस',
            r'\b(least)\b': 'लीस्ट',
            r'\b(enough)\b': 'इनफ',
        }
        
        # Additional character-level phonetic conversion for remaining English words
        def convert_english_to_hindi_phonetic(word):
            """Convert English word to Hindi phonetic if it's purely English"""
            if not re.match(r'^[a-zA-Z]+$', word):
                return word  # Not purely English, keep as is
            
            # Character mapping for phonetic conversion
            char_map = {
                'a': 'अ', 'b': 'ब', 'c': 'क', 'd': 'द', 'e': 'ए', 'f': 'फ', 'g': 'ग', 'h': 'ह',
                'i': 'इ', 'j': 'ज', 'k': 'क', 'l': 'ल', 'm': 'म', 'n': 'न', 'o': 'ओ', 'p': 'प',
                'q': 'क्यू', 'r': 'र', 's': 'स', 't': 'त', 'u': 'उ', 'v': 'व', 'w': 'व', 'x': 'क्स',
                'y': 'य', 'z': 'ज़'
            }
            
            # Simple phonetic conversion
            result = ''
            word_lower = word.lower()
            
            # Handle common patterns
            if word_lower.endswith('ing'):
                result = ''.join(char_map.get(c, c) for c in word_lower[:-3]) + 'िंग'
            elif word_lower.endswith('ed'):
                result = ''.join(char_map.get(c, c) for c in word_lower[:-2]) + 'ेड'
            elif word_lower.endswith('er'):
                result = ''.join(char_map.get(c, c) for c in word_lower[:-2]) + 'र'
            elif word_lower.endswith('ly'):
                result = ''.join(char_map.get(c, c) for c in word_lower[:-2]) + 'ली'
            else:
                result = ''.join(char_map.get(c, c) for c in word_lower)
            
            return result
        
        cleaned_segments = []
        
        for segment in transcript_segments:
            text = segment['text']
            
            # Apply phonetic mapping patterns
            for pattern, replacement in phonetic_mapping.items():
                text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
            
            # Handle remaining English words with character-level conversion
            words = text.split()
            converted_words = []
            
            for word in words:
                # Clean punctuation for processing
                clean_word = re.sub(r'[^\w]', '', word)
                punctuation = word[len(clean_word):]  # Extract punctuation
                
                if clean_word:
                    converted_word = convert_english_to_hindi_phonetic(clean_word)
                    converted_words.append(converted_word + punctuation)
                else:
                    converted_words.append(word)
            
            final_text = ' '.join(converted_words).strip()
            
            # Only keep segments with meaningful content
            if final_text and len(final_text) > 1:
                cleaned_segments.append({
                    'start': segment['start'],
                    'end': segment['end'],
                    'text': final_text,
                    'id': segment['id'],
                    'confidence': segment.get('confidence', 0),
                    'no_speech_prob': segment.get('no_speech_prob', 0)
                })
        
        print(f"Advanced phonetic cleaning completed: {len(cleaned_segments)} segments")
        print(f"Conversion applied: English → Hindi phonetic script")
        return cleaned_segments

    def save_transcript(self, transcript_segments: List[Dict], VideoId: str, save_to_drive: bool = True) -> Dict:
        """
        Save transcript in multiple formats with comprehensive metadata
        """
        import datetime
        import json
        
        # Create transcripts directory
        transcripts_dir = Path("transcripts")
        transcripts_dir.mkdir(exist_ok=True)
        
        # Generate timestamp
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Prepare comprehensive transcript data
        transcript_data = {
            "VideoId": VideoId,
            "created_at": datetime.datetime.now().isoformat(),
            "model_info": {
                "model_name": "AssemblyAI",
                "version": "latest",
                "language": "en-hi"  # English-Hindi mixed
            },
            "processing_info": {
                "total_segments": len(transcript_segments),
                "total_duration": sum(seg.get('end', 0) - seg.get('start', 0) for seg in transcript_segments),
                "cleaning_applied": "Hindi phonetic cleaning",
                "mixed_language": True
            },
            "segments": transcript_segments
        }
        
        # File paths
        json_file = transcripts_dir / f"{VideoId}_{timestamp}_transcript.json"
        srt_file = transcripts_dir / f"{VideoId}_{timestamp}_transcript.srt"
        txt_file = transcripts_dir / f"{VideoId}_{timestamp}_transcript.txt"
        
        storage_info = {
            "local_files": {
                "json": str(json_file),
                "srt": str(srt_file),
                "txt": str(txt_file)
            },
            "drive_links": {}
        }
        
        try:
            # Save JSON (complete data)
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(transcript_data, f, indent=2, ensure_ascii=False)
            
            # Save SRT (subtitles format)
            srt_content = self._generate_srt_content(transcript_segments)
            with open(srt_file, 'w', encoding='utf-8') as f:
                f.write(srt_content)
            
            # Save TXT (readable format)
            txt_content = self._generate_txt_content(transcript_segments, transcript_data)
            with open(txt_file, 'w', encoding='utf-8') as f:
                f.write(txt_content)
            
            # Upload to Drive if requested
            if save_to_drive:
                print("☁️ Uploading transcript files to Google Drive...")
                
                # Upload JSON
                json_drive_link = self.upload_to_drive(str(json_file), f"{VideoId}_transcript_{timestamp}.json")
                storage_info["drive_links"]["json"] = json_drive_link
                
                # Upload SRT
                srt_drive_link = self.upload_to_drive(str(srt_file), f"{VideoId}_subtitles_{timestamp}.srt")
                storage_info["drive_links"]["srt"] = srt_drive_link
                
                # Upload TXT
                txt_drive_link = self.upload_to_drive(str(txt_file), f"{VideoId}_readable_{timestamp}.txt")
                storage_info["drive_links"]["txt"] = txt_drive_link
                
                print("✅ All transcript files uploaded to Drive")
            
            return {
                "status": "success",
                "VideoId": VideoId,
                "timestamp": timestamp,
                "files_created": len(storage_info["local_files"]),
                "drive_uploads": len(storage_info["drive_links"]),
                "storage_info": storage_info
            }
            
        except Exception as e:
            print(f"❌ Error saving transcript: {e}")
            return {
                "status": "error",
                "VideoId": VideoId,
                "error": str(e)
            }
    
    def _generate_srt_content(self, transcript_segments: List[Dict]) -> str:
        """Generate SRT subtitle format content"""
        srt_content = ""
        
        for i, segment in enumerate(transcript_segments, 1):
            start_time = self._seconds_to_srt_time(segment['start'])
            end_time = self._seconds_to_srt_time(segment['end'])
            
            srt_content += f"{i}\n"
            srt_content += f"{start_time} --> {end_time}\n"
            srt_content += f"{segment['text']}\n\n"
        
        return srt_content
    
    def _seconds_to_srt_time(self, seconds: float) -> str:
        """Convert seconds to SRT time format (HH:MM:SS,mmm)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        milliseconds = int((seconds % 1) * 1000)
        
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"
    
    def _generate_txt_content(self, transcript_segments: List[Dict], transcript_data: Dict) -> str:
        """Generate readable text format content with metadata"""
        txt_content = f"""हिंदी ट्रांसक्रिप्ट / Hindi Transcript
{'=' * 50}

वीडियो ID / Video ID: {transcript_data['VideoId']}
बनाया गया / Created: {transcript_data['created_at']}
मॉडल / Model: {transcript_data['model_info']['model_name']} 
भाषा / Language: हिंदी (Hindi)
गुणवत्ता / Quality: {transcript_data['processing_info']['total_segments']} segments

सेगमेंट्स / Segments: {transcript_data['processing_info']['total_segments']}
कुल अवधि / Total Duration: {transcript_data['processing_info']['total_duration']:.1f} seconds

{'=' * 50}

"""
        
        for i, segment in enumerate(transcript_segments, 1):
            start_min = int(segment['start'] // 60)
            start_sec = int(segment['start'] % 60)
            end_min = int(segment['end'] // 60)
            end_sec = int(segment['end'] % 60)
            
            txt_content += f"[{start_min:02d}:{start_sec:02d} - {end_min:02d}:{end_sec:02d}] {segment['text']}\n"
        
        txt_content += f"\n{'=' * 50}\n"
        txt_content += f"ट्रांसक्रिप्ट समाप्त / End of Transcript\n"
        txt_content += f"प्रसंस्करण: {transcript_data['processing_info']['cleaning_applied']}\n"
        
        return txt_content

    def get_model_status(self) -> Dict:
        """
        Get current status of Whisper model
        Returns information about model loading and caching
        """
        status = {
            "model_loaded": self.whisper_model is not None,
            "model_name": self.loaded_model_name,
            "model_cached": hasattr(self, 'whisper_model') and self.whisper_model is not None,
            "drive_service_ready": self.drive_service is not None,
            "device": getattr(self, 'device', 'cpu'),
            "compute_type": getattr(self, 'compute_type', 'int8'),
            "whisper_type": getattr(self, 'whisper_type', 'faster-whisper'),
            "optimized_for_apple_silicon": True
        }
        
        if self.whisper_model:
            status["model_info"] = {
                "type": "faster-whisper",
                "size": self.loaded_model_name,
                "optimized_for": "Hindi transcription",
                "mel_bins": "128" if self.loaded_model_name in ["large-v3", "large-v2"] else "80",
                "device": getattr(self, 'device', 'cpu'),
                "compute_type": getattr(self, 'compute_type', 'int8'),
                "performance": "2-4x faster than original Whisper",
                "apple_silicon_optimized": True
            }
        
        return status

    def transcribe_with_assemblyai_api(self, audio_path: str) -> List[Dict]:
        """
        Transcribe audio using AssemblyAI API with proper timeout handling.
        Returns simplified segments with only start/end times and text.
        """
        if not self.assemblyai_client:
            self.setup_assemblyai_api()
        
        print("☁️  Uploading audio to AssemblyAI for processing...")
        
        # Convert Path object to string if needed (fixes the pathlib issue)
        if hasattr(audio_path, '__fspath__'):  # Check if it's a Path-like object
            audio_path_str = str(audio_path)
        else:
            audio_path_str = audio_path
        
        print(f"🔧 Using audio file: {audio_path_str}")
        
        # Verify file exists and get size
        import os
        if not os.path.exists(audio_path_str):
            raise Exception(f"Audio file not found: {audio_path_str}")
        
        file_size_mb = os.path.getsize(audio_path_str) / (1024 * 1024)
        print(f"📁 Audio file size: {file_size_mb:.2f} MB")
        
        # Configuration for Hindi transcription
        config = self.assemblyai_client.TranscriptionConfig(
            language_code="hi",
            speaker_labels=False  # Can be enabled if needed
        )

        # Create transcriber - use the extended timeout from settings
        transcriber = self.assemblyai_client.Transcriber()
        
        # Submit the transcription job with retry logic
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                print(f"📤 Attempt {retry_count + 1}/{max_retries}: Uploading to AssemblyAI...")
                
                # For large files, warn about expected time
                if file_size_mb > 50:
                    estimated_time = file_size_mb / 10  # Rough estimate: 10MB per minute
                    print(f"⏱️  Large file detected. Estimated upload time: {estimated_time:.1f} minutes")
                
                # Try transcription - the timeout is handled by the global setting
                transcript = transcriber.transcribe(audio_path_str, config)
                break
                
            except Exception as e:
                retry_count += 1
                error_msg = str(e).lower()
                
                if any(keyword in error_msg for keyword in ["timeout", "write operation timed out", "read timeout", "connection timeout"]):
                    if retry_count < max_retries:
                        wait_time = retry_count * 15  # Progressive backoff: 15s, 30s, 45s
                        print(f"⚠️  Upload timed out. Retrying in {wait_time}s... (Attempt {retry_count}/{max_retries})")
                        print(f"💡 Tip: Large files may take several minutes to upload to AssemblyAI")
                        import time
                        time.sleep(wait_time)
                        continue
                    else:
                        print("❌ All upload attempts failed due to timeout")
                        raise Exception(f"AssemblyAI upload timed out after {max_retries} attempts. "
                                      f"File size: {file_size_mb:.2f}MB. "
                                      f"This may be due to slow network connection or very large file. "
                                      f"Consider using a shorter video segment or check your internet connection.")
                
                elif "unexpected type" in error_msg or "pathlib" in error_msg:
                    print(f"⚠️  Path type error: {e}")
                    raise Exception(f"Path type error: {e}. Please ensure the audio file path is valid.")
                
                elif "file not found" in error_msg or "no such file" in error_msg:
                    print(f"⚠️  File not found: {e}")
                    raise Exception(f"Audio file not found: {audio_path_str}")
                
                else:
                    print(f"❌ Unexpected error: {e}")
                    # Don't retry for unknown errors, they're likely not transient
                    raise e

        if transcript.status == self.assemblyai_client.TranscriptStatus.error:
            raise Exception(f"AssemblyAI transcription failed: {transcript.error}")

        print("✅ AssemblyAI transcription successful!")
        
        # Create sentence segments from word segments (simplified format)
        sentence_segments = []
        current_segment = None

        if transcript.words:
            # Initialize with the first word
            first_word = transcript.words[0]
            current_segment = {
                'start': first_word.start / 1000.0,
                'end': first_word.end / 1000.0,
                'text': first_word.text,
                'id': 0,
                '_word_confidences': [first_word.confidence]
            }

            for word in transcript.words[1:]:
                # If the word marks the end of a sentence or a long pause occurs, finalize the current segment.
                is_end_of_sentence = word.text.endswith(('.', '?', '!'))
                is_long_pause = (word.start - (current_segment['end'] * 1000) > 700) # 700ms pause

                if is_end_of_sentence or is_long_pause:
                    # Finalize the completed segment
                    avg_conf = sum(current_segment['_word_confidences']) / len(current_segment['_word_confidences'])
                    current_segment['confidence'] = round(avg_conf, 4)
                    del current_segment['_word_confidences']
                    sentence_segments.append(current_segment)
                    
                    # Start a new segment
                    current_segment = {
                        'start': word.start / 1000.0,
                        'end': word.end / 1000.0,
                        'text': word.text,
                        'id': len(sentence_segments),
                        '_word_confidences': [word.confidence]
                    }
                else:
                    # Otherwise, append the word to the current segment.
                    current_segment['text'] += f" {word.text}"
                    current_segment['end'] = word.end / 1000.0
                    current_segment['_word_confidences'].append(word.confidence)
            
            # Add the last segment
            if current_segment:
                avg_conf = sum(current_segment['_word_confidences']) / len(current_segment['_word_confidences'])
                current_segment['confidence'] = round(avg_conf, 4)
                del current_segment['_word_confidences']
                sentence_segments.append(current_segment)

        print(f"📊 Processed {len(sentence_segments)} sentence segments from AssemblyAI.")
        return sentence_segments

def main():
    parser = argparse.ArgumentParser(description='Process videos with various input sources')
    parser.add_argument('--mode', choices=['youtube', 'drive-clips', 'drive-transcript', 'test-drive'], 
                       required=True, help='Processing mode')
    parser.add_argument('--url', required=True, help='YouTube or Drive URL')
    parser.add_argument('--VideoId', required=True, help='Video ID')
    parser.add_argument('--clips-json', help='JSON string containing clips data (for clip modes)')
    
    args = parser.parse_args()
    
    try:
        processor = VideoProcessor()
        
        if args.mode == 'youtube':
            if not args.clips_json:
                raise ValueError("clips_json required for YouTube mode")
            clips_data = json.loads(args.clips_json)
            result = processor.process_video_youtube(args.url, args.VideoId, clips_data)
        
        elif args.mode == 'drive-clips':
            # For drive-clips mode, clips data might come in different formats
            if args.clips_json:
                # Traditional format: separate clips_json parameter
                clips_data = json.loads(args.clips_json)
                result = processor.process_video_drive_clips(args.url, args.VideoId, clips_data=clips_data)
            else:
                # New format: clips data comes within the input (from n8n)
                # In this case, we expect the input to be passed differently
                # This will be handled by the API layer, not command line
                raise ValueError("clips_json required for drive-clips mode when using command line")
        
        elif args.mode == 'drive-transcript':
            result = processor.generate_transcript_from_drive(args.url, args.VideoId)
        
        elif args.mode == 'test-drive':
            # Test the new download method
            print(f"Testing Drive download with URL: {args.url}")
            print(f"Video ID: {args.VideoId}")
            try:
                video_path = processor.download_from_drive(args.url, f"{args.VideoId}_test.mp4")
                result = {
                    'status': 'success',
                    'message': f'Download successful: {video_path}',
                    'file_path': video_path,
                    'file_size': os.path.getsize(video_path) if os.path.exists(video_path) else 0
                }
                print(f"✅ Test successful! File downloaded to: {video_path}")
            except Exception as e:
                result = {
                    'status': 'failed',
                    'error': str(e),
                    'message': 'Download test failed'
                }
                print(f"❌ Test failed: {e}")
        
        # Output result as JSON
        print(json.dumps(result, indent=2))
        
        # Exit with appropriate code
        sys.exit(0 if result['status'] in ['completed', 'success'] else 1)
        
    except Exception as e:
        error_result = {
            'status': 'failed',
            'error': str(e),
            'results': []
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main() 