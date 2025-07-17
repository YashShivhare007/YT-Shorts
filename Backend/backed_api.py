from flask import Flask, request, jsonify, Response
import logging
import json
import time
import threading
from dotenv import load_dotenv
from pathlib import Path
import subprocess
import os
from flask_cors import CORS

# Load environment variables from .env file
load_dotenv()

# Set up logging to stdout
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app, origins=["https://yt-shorts-1.vercel.app", "http://localhost:5173"])

# Production configuration
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True

# Global status tracking
processing_status = {}

# Cache for yt-dlp version checks to avoid frequent checks
ytdlp_check_cache = {
    'last_check': 0,
    'current_version': None,
    'latest_version': None,
    'needs_upgrade': False
}

# Import the backend processor with proper error handling
processor = None
try:
    import backend_processor
    processor = backend_processor.VideoProcessor()
    logging.info("Successfully imported backend_processor")
except Exception as e:
    logging.error(f"Failed to import backend_processor: {e}")
    import traceback
    logging.error(f"Import traceback: {traceback.format_exc()}")
    # Don't set processor to None here - let the app start and handle it in routes

TERMINATED_IDS_FILE = Path("temp_videos/terminated_executions.txt")
TERMINATED_IDS_FILE.parent.mkdir(exist_ok=True)
TERMINATE_ALL_FLAG = Path("temp_videos/terminate_all.flag")

# Helper to check for terminate all flag
def should_terminate_all():
    return TERMINATE_ALL_FLAG.exists()

# Helper to clear terminate all flag
def clear_terminate_all():
    if TERMINATE_ALL_FLAG.exists():
        TERMINATE_ALL_FLAG.unlink()

def send_progress_update(VideoId, task_type, status, message, result=None):
    """Send progress update to the status tracking system for a specific task."""
    if VideoId not in processing_status:
        processing_status[VideoId] = {
            'transcript': {'status': 'pending', 'message': 'Awaiting task'},
            'clips': {'status': 'pending', 'message': 'Awaiting task'}
        }
    
    update_payload = {
        'status': status,
        'message': message,
        'timestamp': time.time()
    }

    if result:
        update_payload['result'] = result

    processing_status[VideoId][task_type] = update_payload
    logging.info(f"Progress update for {VideoId} [{task_type}]: {status} - {message}")


def check_ytdlp_version():
    """Check if yt-dlp needs to be upgraded (with caching)"""
    global ytdlp_check_cache
    
    # Only check every 30 minutes to avoid frequent API calls
    current_time = time.time()
    if current_time - ytdlp_check_cache['last_check'] < 1800:  # 30 minutes
        return ytdlp_check_cache['needs_upgrade'], ytdlp_check_cache['current_version']
    
    try:
        # Check current version
        result = subprocess.run(['yt-dlp', '--version'], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            current_version = result.stdout.strip()
            ytdlp_check_cache['current_version'] = current_version
            ytdlp_check_cache['last_check'] = current_time
            
            # For now, assume we need to upgrade if version is older than 1 day
            # In a real implementation, you'd check against the latest version
            ytdlp_check_cache['needs_upgrade'] = False  # Don't upgrade too frequently
            return False, current_version
        else:
            return True, "unknown"
    except Exception as e:
        logging.error(f"Error checking yt-dlp version: {e}")
        return True, "unknown"

def upgrade_ytdlp():
    """Upgrade yt-dlp to the latest version using Homebrew"""
    try:
        logging.info("🔄 Upgrading yt-dlp to latest version...")
        
        # Use Homebrew to upgrade yt-dlp
        result = subprocess.run(
            ['brew', 'upgrade', 'yt-dlp'],
            capture_output=True,
            text=True,
            timeout=120  # 2 minutes timeout
        )
        
        if result.returncode == 0:
            logging.info("✅ yt-dlp upgrade completed successfully")
            return True, "yt-dlp upgraded successfully"
        else:
            logging.warning(f"⚠️ yt-dlp upgrade failed: {result.stderr}")
            return False, f"yt-dlp upgrade failed: {result.stderr}"
            
    except subprocess.TimeoutExpired:
        logging.error("⏰ yt-dlp upgrade timed out")
        return False, "yt-dlp upgrade timed out"
    except Exception as e:
        logging.error(f"❌ yt-dlp upgrade error: {e}")
        return False, f"yt-dlp upgrade error: {e}"

def ensure_ytdlp_updated():
    """Smart yt-dlp version check and upgrade if needed"""
    needs_upgrade, current_version = check_ytdlp_version()
    
    if needs_upgrade:
        logging.info(f"🔄 yt-dlp needs upgrade (current: {current_version})")
        return upgrade_ytdlp()
    else:
        logging.info(f"✅ yt-dlp is up to date (version: {current_version})")
        return True, f"yt-dlp is current (version: {current_version})"

def process_youtube_background(youtube_url, VideoId, clips):
    clear_terminate_all()  # Clear flag at job start
    task_type = 'clips'
    try:
        if should_terminate_all():
            logging.warning(f"[process_youtube_background] Terminated by global flag before start.")
            return
        # Check if processor is available
        if processor is None:
            send_progress_update(VideoId, task_type, 'failed', 'Backend processor not available')
            logging.error("Backend processor not available for YouTube processing")
            return
        
        # Check and upgrade yt-dlp if needed
        send_progress_update(VideoId, task_type, 'checking', '🔍 Checking yt-dlp version...')
        upgrade_success, upgrade_message = ensure_ytdlp_updated()
        if should_terminate_all():
            logging.warning(f"[process_youtube_background] Terminated by global flag after yt-dlp check.")
            return
        
        if upgrade_success:
            send_progress_update(VideoId, task_type, 'ready', f'✅ {upgrade_message}')
            logging.info(f"yt-dlp check/upgrade successful for {VideoId}: {upgrade_message}")
        else:
            send_progress_update(VideoId, task_type, 'warning', f'⚠️ {upgrade_message} - continuing with existing version')
            logging.warning(f"yt-dlp check/upgrade failed for {VideoId}: {upgrade_message}")
        
        # Download video
        send_progress_update(VideoId, task_type, 'downloading', 'Starting video download from YouTube...')
        try:
            send_progress_update(VideoId, task_type, 'downloading', 'Downloading video from YouTube...')
            video_path = processor.download_video(youtube_url, VideoId)
            if should_terminate_all():
                logging.warning(f"[process_youtube_background] Terminated by global flag after download.")
                return
            send_progress_update(VideoId, task_type, 'downloading', 'Video download completed')
        except Exception as e:
            send_progress_update(VideoId, task_type, 'failed', f'Download failed: {str(e)}')
            raise
        
        # Setup Google Drive
        send_progress_update(VideoId, task_type, 'setting_up', 'Setting up Google Drive...')
        processor.setup_google_drive()
        if should_terminate_all():
            logging.warning(f"[process_youtube_background] Terminated by global flag after drive setup.")
            return
        
        # Process clips
        results = []
        for i, clip in enumerate(clips):
            if should_terminate_all():
                logging.warning(f"[process_youtube_background] Terminated by global flag during clip loop.")
                return
            try:
                send_progress_update(VideoId, task_type, 'processing', f'Processing clip {i+1}/{len(clips)}...')
                
                start_time = clip['final_start_time']
                end_time = clip['final_end_time']
                category = clip['category']
                confidence = clip['confidence']
                
                # Create clip
                clip_filename = f"clip_{i+1}_{category}"
                clip_path = processor.create_clip(video_path, start_time, end_time, clip_filename, category)
                
                send_progress_update(VideoId, task_type, 'uploading', f'Uploading clip {i+1}/{len(clips)} to Drive...')
                drive_filename = f"{VideoId}_{clip_filename}.mp4"
                drive_link = processor.upload_to_drive(clip_path, drive_filename)
                
                results.append({
                    'clip_number': i + 1,
                    'category': category,
                    'confidence': confidence,
                    'start_time': start_time,
                    'end_time': end_time,
                    'drive_link': drive_link,
                    'status': 'success'
                })
                
                # Cleanup clip file
                processor.cleanup_files([clip_path])
                
            except Exception as e:
                logging.error(f"Failed to process clip {i+1}: {e}")
                results.append({
                    'clip_number': i + 1,
                    'category': clip.get('category', 'unknown'),
                    'confidence': clip.get('confidence', 0),
                    'start_time': clip.get('final_start_time', 0),
                    'end_time': clip.get('final_end_time', 0),
                    'drive_link': None,
                    'status': 'failed',
                    'error': str(e)
                })
        
        # Cleanup
        send_progress_update(VideoId, task_type, 'cleaning_up', 'Cleaning up temporary files...')
        processor.cleanup_files([video_path])
        
        # Final result
        final_result = {
            'VideoId': VideoId,
            'status': 'completed',
            'clips_processed': len(results),
            'successful_clips': len([r for r in results if r['status'] == 'success']),
            'failed_clips': len([r for r in results if r['status'] == 'failed']),
            'results': results
        }
        
        send_progress_update(VideoId, task_type, 'completed', 'Processing completed successfully!', result=final_result)
        
    except Exception as e:
        error_message = f'Processing failed: {str(e)}'
        send_progress_update(VideoId, task_type, 'failed', error_message)
        logging.error(f"Processing failed for {VideoId}: {e}")

def process_drive_clips_background(drive_url, VideoId, clips):
    clear_terminate_all()
    task_type = 'clips'
    try:
        if should_terminate_all():
            logging.warning(f"[process_drive_clips_background] Terminated by global flag before start.")
            return
        # Check if processor is available
        if processor is None:
            send_progress_update(VideoId, task_type, 'failed', 'Backend processor not available')
            logging.error("Backend processor not available for Drive processing")
            return

        # Check if video already exists locally
        video_filename = f"{VideoId}_source.mp4"
        existing_video_path = processor.output_dir / video_filename
        
        if existing_video_path.exists() and existing_video_path.stat().st_size > 0:
            send_progress_update(VideoId, task_type, 'reusing_video', f"✅ Found existing video: {video_filename}. Skipping download.")
            video_path = str(existing_video_path)
        else:
            send_progress_update(VideoId, task_type, 'downloading', '📥 Video not found locally. Starting download from Drive...')
            processor.setup_google_drive()
            if should_terminate_all():
                logging.warning(f"[process_drive_clips_background] Terminated by global flag after drive setup.")
                return
            video_path = processor.download_from_drive_fixed(drive_url, video_filename)
            if should_terminate_all():
                logging.warning(f"[process_drive_clips_background] Terminated by global flag after download.")
                return
        
        # Setup Google Drive for uploads
        send_progress_update(VideoId, task_type, 'setting_up', 'Setting up Google Drive for uploads...')
        processor.setup_google_drive()
        if should_terminate_all():
            logging.warning(f"[process_drive_clips_background] Terminated by global flag after drive setup 2.")
            return
        
        # Process clips
        results = []
        for i, clip in enumerate(clips):
            if should_terminate_all():
                logging.warning(f"[process_drive_clips_background] Terminated by global flag during clip loop.")
                return
            try:
                send_progress_update(VideoId, task_type, 'processing', f'Processing clip {i+1}/{len(clips)}...')
                
                start_time = clip['final_start_time']
                end_time = clip['final_end_time']
                category = clip['category']
                confidence = clip['confidence']
                
                # Create clip
                clip_filename = f"clip_{i+1}_{category}"
                clip_path = processor.create_clip(video_path, start_time, end_time, clip_filename, category)
                
                send_progress_update(VideoId, task_type, 'uploading', f'Uploading clip {i+1}/{len(clips)} to Drive...')
                drive_filename = f"{VideoId}_{clip_filename}.mp4"
                drive_link = processor.upload_to_drive(clip_path, drive_filename)
                
                results.append({
                    'clip_number': i + 1,
                    'category': category,
                    'confidence': confidence,
                    'start_time': start_time,
                    'end_time': end_time,
                    'drive_link': drive_link,
                    'status': 'success'
                })
                
                # Cleanup clip file
                processor.cleanup_files([clip_path])
                
            except Exception as e:
                logging.error(f"Failed to process clip {i+1}: {e}")
                results.append({
                    'clip_number': i + 1,
                    'category': clip.get('category', 'unknown'),
                    'confidence': clip.get('confidence', 0),
                    'start_time': clip.get('final_start_time', 0),
                    'end_time': clip.get('final_end_time', 0),
                    'drive_link': None,
                    'status': 'failed',
                    'error': str(e)
                })
        
        # Cleanup video file
        send_progress_update(VideoId, task_type, 'cleaning_up', 'Cleaning up temporary files...')
        processor.cleanup_files([video_path])
        
        # Final result
        final_result = {
            'VideoId': VideoId,
            'status': 'completed',
            'clips_processed': len(results),
            'successful_clips': len([r for r in results if r['status'] == 'success']),
            'failed_clips': len([r for r in results if r['status'] == 'failed']),
            'results': results
        }
        
        send_progress_update(VideoId, task_type, 'completed', 'Processing completed successfully!', result=final_result)
        
    except Exception as e:
        error_message = f'Processing failed: {str(e)}'
        send_progress_update(VideoId, task_type, 'failed', error_message)
        logging.error(f"Processing failed for {VideoId}: {e}")

def generate_transcript_background(drive_url, VideoId):
    clear_terminate_all()
    task_type = 'transcript'
    try:
        if should_terminate_all():
            logging.warning(f"[generate_transcript_background] Terminated by global flag before start.")
            return
        if processor is None:
            send_progress_update(VideoId, task_type, 'failed', 'Backend processor not available')
            logging.error("Backend processor not available for transcript generation")
            return
            
        send_progress_update(VideoId, task_type, 'processing', 'Starting transcript generation...')
        
        # This is the correct, existing method that handles download, audio extraction, and transcription.
        result = processor.generate_transcript_from_drive(drive_url, VideoId)
        if should_terminate_all():
            logging.warning(f"[generate_transcript_background] Terminated by global flag after transcript.")
            return
        
        # Check the result from the processor
        if result.get('status') == 'completed':
            # The result from generate_transcript_from_drive is already well-formatted.
            # We just need to extract the segments for the final payload.
            final_result = {
                'VideoId': VideoId,
            'status': 'completed',
                'segments': result.get('segments', [])
            }
            send_progress_update(VideoId, task_type, 'completed', 'Transcript generation completed', result=final_result)
        else:
            # If the processor returned a failure, propagate it.
            error_message = result.get('error', 'Unknown error during transcript generation.')
            send_progress_update(VideoId, task_type, 'failed', error_message)
            logging.error(f"Transcript generation failed for {VideoId}: {error_message}")
        
    except Exception as e:
        error_message = f'Transcript generation failed: {str(e)}'
        send_progress_update(VideoId, task_type, 'failed', error_message)
        logging.error(f"Transcript generation failed for {VideoId}: {e}")


def process_drive_clips_background_new(drive_url, VideoId, input_data):
    clear_terminate_all()
    task_type = 'clips'
    try:
        if should_terminate_all():
            logging.warning(f"[process_drive_clips_background_new] Terminated by global flag before start.")
            return
        # Check if processor is available
        if processor is None:
            send_progress_update(VideoId, task_type, 'failed', 'Backend processor not available')
            logging.error("Backend processor not available for Drive clips processing")
            return

        send_progress_update(VideoId, task_type, 'starting', 'Starting Drive clips processing with new format...')
        
        result = processor.process_video_drive_clips(drive_url, VideoId, input_data=input_data)
        if should_terminate_all():
            logging.warning(f"[process_drive_clips_background_new] Terminated by global flag after processing.")
            return
        
        processing_status[VideoId] = {
            'status': 'completed',
            'result': result,
            'timestamp': time.time()
        }
        logging.info(f"Progress update for {VideoId}: completed - Processing completed successfully!")
        
    except Exception as e:
        send_progress_update(VideoId, task_type, 'failed', f'Processing failed: {str(e)}')
        processing_status[VideoId]['error'] = str(e)
        logging.error(f"[process_drive_clips_background_new] Exception: {e}")

@app.route('/process-youtube', methods=['POST'])
def process_youtube():
    """Process YouTube video with clips"""
    logging.info("Received request at /process-youtube")
    try:
        data = request.get_json()
        youtube_url = data.get('youtube_url')
        VideoId = data.get('VideoId') or data.get('VideoId')
        clips = data.get('clips')

        logging.info(f"YouTube URL: {youtube_url}")
        logging.info(f"Video ID: {VideoId}")
        logging.info(f"Clips count: {len(clips) if clips else 0}")
        
        if not youtube_url or not VideoId or not clips:
            return jsonify({'status': 'error', 'error': 'Missing required fields: youtube_url, VideoId, clips'}), 400
        
        # Start background processing
        thread = threading.Thread(
            target=process_youtube_background,
            args=(youtube_url, VideoId, clips)
        )
        thread.start()
        
        return jsonify({
            'status': 'started',
            'VideoId': VideoId,
            'message': 'YouTube processing started. Use /status/{VideoId} to check progress.',
            'progress_url': f'/status/{VideoId}'
        })
        
    except Exception as e:
        logging.error(f"Error in /process-youtube: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/process-drive-clips', methods=['POST'])
def process_drive_clips():
    """Process Drive video with clips"""
    logging.info("Received request at /process-drive-clips")
    try:
        data = request.get_json()
        
        # Handle new input format (from n8n)
        if isinstance(data, list) and len(data) > 0:
            input_obj = data[0]
            drive_url = input_obj.get('drive_url')
            VideoId = input_obj.get('VideoId')
            clips = input_obj.get('output', [])
            
            logging.info(f"New format - Drive URL: {drive_url}")
            logging.info(f"New format - VideoId: {VideoId}")
            logging.info(f"New format - Clips count: {len(clips)}")
            
        else:
            # Handle traditional format
            drive_url = data.get('drive_url')
            VideoId = data.get('VideoId') or data.get('VideoId')
            clips = data.get('clips')
            
            logging.info(f"Old format - Drive URL: {drive_url}")
            logging.info(f"Old format - VideoId: {VideoId}")
            logging.info(f"Old format - Clips count: {len(clips) if clips else 0}")
        
        logging.info(f"  Drive URL: {drive_url}")
        logging.info(f"  Video ID: {VideoId}")
        logging.info(f"  Clips count: {len(clips) if clips else 0}")
        
        if not drive_url:
            logging.error('Missing drive_url')
            return jsonify({'status': 'error', 'error': 'Missing drive_url field'}), 400
        
        if not VideoId:
            logging.error('Missing VideoId/VideoId')
            return jsonify({'status': 'error', 'error': 'Missing VideoId or VideoId field'}), 400
        
        if not clips:
            logging.error('Missing clips data')
            return jsonify({'status': 'error', 'error': 'Missing clips data'}), 400
        
        # Start background processing
        if isinstance(data, list) and len(data) > 0:
            # New format: pass the entire input data
            thread = threading.Thread(
                target=process_drive_clips_background_new,
                args=(drive_url, VideoId, data[0])
            )
        else:
            # Traditional format: pass clips separately
            thread = threading.Thread(
                target=process_drive_clips_background,
                args=(drive_url, VideoId, clips)
            )
        
        thread.start()
        
        return jsonify({
            'status': 'started',
            'VideoId': VideoId,
            'message': 'Drive clips processing started. Use /status/{VideoId} to check progress.',
            'progress_url': f'/status/{VideoId}',
            'clips_count': len(clips) if clips else 0
        })
        
    except Exception as e:
        logging.error(f"Error in /process-drive-clips: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/generate-transcript', methods=['POST'])
def generate_transcript():
    """Generate transcript from Drive video"""
    logging.info("Received request at /generate-transcript")
    try:
        data = request.get_json()
        drive_url = data.get('drive_url')
        VideoId = data.get('VideoId') or data.get('VideoId')
        
        logging.info(f"Drive URL: {drive_url}")
        logging.info(f"Video ID: {VideoId}")
        
        if not drive_url or not VideoId:
            return jsonify({'status': 'error', 'error': 'Missing required fields: drive_url, VideoId'}), 400
        
        # Start background processing
        thread = threading.Thread(
            target=generate_transcript_background,
            args=(drive_url, VideoId)
        )
        thread.start()
        
        return jsonify({
            'status': 'started',
            'VideoId': VideoId,
            'message': 'Transcript generation started. Use /status/{VideoId} to check progress.',
            'progress_url': f'/status/{VideoId}'
        })
        
    except Exception as e:
        logging.error(f"Error in /generate-transcript: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/status/<VideoId>', methods=['GET'])
def get_status(VideoId):
    """DEPRECATED: Returns the overall status of a video process."""
    return jsonify({
        'warning': 'This endpoint is deprecated and will be removed.',
        'message': 'Please use the new task-specific status endpoints.',
        'endpoints': {
            'transcript_status': f'/status/transcript/{VideoId}',
            'clips_status': f'/status/clips/{VideoId}'
        },
        'current_state': processing_status.get(VideoId, {'status': 'not_found', 'message': 'No task initiated for this VideoId.'})
    }), 410 # 410 Gone

@app.route('/status/transcript/<VideoId>', methods=['GET'])
def get_transcript_status(VideoId):
    """Returns the status of the transcript generation task."""
    status = processing_status.get(VideoId, {}).get('transcript')
    if not status:
        return jsonify({'status': 'not_found', 'message': 'No transcript task initiated for this VideoId.'}), 404
    return jsonify(status)

@app.route('/status/clips/<VideoId>', methods=['GET'])
def get_clips_status(VideoId):
    """Returns the status of the video clipping task."""
    status = processing_status.get(VideoId, {}).get('clips')
    if not status:
        return jsonify({'status': 'not_found', 'message': 'No clips task initiated for this VideoId.'}), 404
    return jsonify(status)


@app.route('/upgrade-ytdlp', methods=['POST'])
def upgrade_ytdlp_endpoint():
    """Manually trigger a yt-dlp upgrade."""
    logging.info("Received request at /upgrade-ytdlp")
    try:
        # Run the smart upgrade check in background to avoid blocking
        def upgrade_background():
            upgrade_success, upgrade_message = ensure_ytdlp_updated()
            logging.info(f"Manual yt-dlp check/upgrade result: {upgrade_success} - {upgrade_message}")
        
        # Start background upgrade
        upgrade_thread = threading.Thread(target=upgrade_background)
        upgrade_thread.start()
        
        return jsonify({
            'status': 'started',
            'message': 'yt-dlp version check/upgrade started in background. Check logs for results.',
            'note': 'This will only upgrade if a newer version is available. Automatic check happens before each YouTube video processing.'
        })
        
    except Exception as e:
        logging.error(f"Manual yt-dlp upgrade error: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/ytdlp-version', methods=['GET'])
def ytdlp_version_endpoint():
    """Get current yt-dlp version information"""
    logging.info("Received request at /ytdlp-version")
    try:
        needs_upgrade, current_version = check_ytdlp_version()
        
        return jsonify({
            'status': 'success',
            'current_version': current_version,
            'latest_version': ytdlp_check_cache.get('latest_version'),
            'needs_upgrade': needs_upgrade,
            'last_check': ytdlp_check_cache.get('last_check'),
            'cache_valid_until': ytdlp_check_cache.get('last_check', 0) + 1800,  # 30 minutes
            'note': 'Version check is cached for 30 minutes to avoid frequent API calls'
        })

    except Exception as e:
        logging.error(f"yt-dlp version check error: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    try:
        health_status = {
            'status': 'healthy',
            'timestamp': time.time(),
            'processor_available': processor is not None,
            'app_loaded': True
        }
        return jsonify(health_status)
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': time.time()
        }), 500

@app.route('/endpoints', methods=['GET'])
def list_endpoints():
    """List all available endpoints"""
    return jsonify({
        'endpoints': {
            '/process-youtube': 'Process YouTube video with clips (POST) - Smart yt-dlp check/upgrade',
            '/process-drive-clips': 'Process Drive video with clips (POST)',
            '/generate-transcript': 'Generate transcript from Drive video (POST)',
            '/upgrade-ytdlp': 'Check and upgrade yt-dlp if needed (POST)',
            '/ytdlp-version': 'Get current yt-dlp version info (GET)',
            '/status/<VideoId>': 'Get processing status (GET)',
            '/health': 'Health check (GET)',
            '/endpoints': 'List all endpoints (GET)',
            '/debug-payload': 'Debug incoming payload format (POST)',
            '/process': 'Legacy YouTube processing endpoint (POST)'
        },
        'scenarios': {
            '1': 'YouTube link + timestamps → Use /process-youtube (smart yt-dlp check/upgrade)',
            '2': 'Drive link + timestamps → Use /process-drive-clips', 
            '3': 'Drive link only → Use /generate-transcript',
            '4': 'Check yt-dlp version → Use /ytdlp-version',
            '5': 'Manual yt-dlp upgrade → Use /upgrade-ytdlp'
        }
    })

@app.route('/debug-payload', methods=['POST'])
def debug_payload():
    """Debug endpoint to inspect incoming payloads"""
    try:
        data = request.get_json()
        return jsonify({
            'status': 'debug',
            'received_data': data,
            'data_type': str(type(data)),
            'is_list': isinstance(data, list),
            'is_dict': isinstance(data, dict),
            'length': len(data) if hasattr(data, '__len__') else 'N/A',
            'keys': list(data.keys()) if isinstance(data, dict) else (list(data[0].keys()) if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) else 'N/A'),
            'first_item_type': str(type(data[0])) if isinstance(data, list) and len(data) > 0 else 'N/A'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'raw_data': str(request.data),
            'content_type': request.content_type
        })

@app.route('/terminate-execution', methods=['POST'])
def terminate_execution():
    data = request.get_json()
    execution_id = data.get('execution_id')
    if not execution_id:
        return jsonify({'error': 'Missing execution_id'}), 400
    # Append the execution_id to the file (one per line, avoid duplicates)
    with open(TERMINATED_IDS_FILE, 'a+') as f:
        f.seek(0)
        ids = set(line.strip() for line in f if line.strip())
        if execution_id not in ids:
            f.write(execution_id + '\n')
    # Set the terminate all flag
    TERMINATE_ALL_FLAG.touch()
    logging.info(f"[terminate-execution] Appended execution_id: {execution_id} and set terminate_all.flag")
    return 'ok', 200

@app.route('/should-stop/<execution_id>', methods=['GET'])
def should_stop(execution_id):
    if not execution_id:
        return jsonify({'error': 'Missing execution_id'}), 400
    if not TERMINATED_IDS_FILE.exists():
        return jsonify({'action': 'proceed'})
    with open(TERMINATED_IDS_FILE, 'r') as f:
        ids = set(line.strip() for line in f if line.strip())
    if execution_id in ids:
        return jsonify({'action': 'stop'})
    else:
        return jsonify({'action': 'proceed'})



if __name__ == '__main__':
    # Get port from environment variable (Render sets this)
    port = int(os.environ.get('PORT', 5000))
    
    # Run in production mode if FLASK_ENV is set to production
    debug_mode = os.environ.get('FLASK_ENV') != 'production'
    
    logging.info(f"Starting Flask app on port {port}, debug={debug_mode}")
    app.run(host='0.0.0.0', port=port, debug=debug_mode)