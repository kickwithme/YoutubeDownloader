#!/usr/bin/env python3
import sys
import json
import signal
from yt_dlp import YoutubeDL
import os
import re

# Global flag for cancellation
should_stop = False

def signal_handler(signum, frame):
    global should_stop
    should_stop = True
    print(json.dumps({
        'type': 'progress',
        'status': 'cancelled'
    }), flush=True)
    sys.exit(1)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def sanitize_filename(filename):
    clean_name = re.sub(r'[^\x00-\x7F]+', '', filename)
    clean_name = re.sub(r'[^a-zA-Z0-9-_ \.]', '', clean_name)
    clean_name = re.sub(r'\s+', ' ', clean_name).strip()
    return clean_name or 'audio'

def progress_hook(d):
    global should_stop
    if should_stop:
        raise KeyboardInterrupt
        
    if d['status'] == 'downloading':
        # Get more detailed progress info
        total = d.get('total_bytes')
        downloaded = d.get('downloaded_bytes')
        
        if total and downloaded:
            percentage = (downloaded / total) * 100
        else:
            # Fallback to estimated percentage
            percentage = float(d.get('_percent_str', '0%').replace('%', ''))

        progress = {
            'type': 'progress',
            'percentage': round(percentage, 1),
            'speed': d.get('_speed_str', 'N/A'),
            'eta': d.get('_eta_str', 'N/A'),
            'downloaded': downloaded,
            'total': total,
            'status': 'downloading'
        }
        print(json.dumps(progress), flush=True)
    elif d['status'] == 'finished':
        progress = {
            'type': 'progress',
            'percentage': 100,
            'status': 'converting',
            'phase': 'Converting to MP3...'
        }
        print(json.dumps(progress), flush=True)

def download_audio(video_id):
    global should_stop
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    downloads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'downloads')
    if not os.path.exists(downloads_dir):
        os.makedirs(downloads_dir)
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(downloads_dir, '%(title)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True
    }
    
    try:
        with YoutubeDL(ydl_opts) as ydl:
            if should_stop:
                raise KeyboardInterrupt("Download cancelled")
            info = ydl.extract_info(url, download=True)
            
            if should_stop:
                # Clean up partial downloads
                try:
                    safe_title = sanitize_filename(info['title'])
                    safe_filename = os.path.join(downloads_dir, f"{safe_title}.mp3")
                    if os.path.exists(safe_filename):
                        os.remove(safe_filename)
                except:
                    pass
                raise KeyboardInterrupt("Download cancelled")

            safe_title = sanitize_filename(info['title'])
            safe_filename = os.path.join(downloads_dir, f"{safe_title}.mp3")
            
            # Rename the file if necessary
            original_filename = os.path.join(downloads_dir, f"{info['title']}.mp3")
            if os.path.exists(original_filename) and original_filename != safe_filename:
                os.rename(original_filename, safe_filename)
            
            result = {
                'type': 'complete',
                'success': True,
                'title': info['title'],
                'filename': safe_filename  # This will be an absolute path
            }
            print(json.dumps(result), flush=True)
            return result
    except KeyboardInterrupt:
        print(json.dumps({
            'type': 'error',
            'success': False,
            'error': 'Download cancelled by user'
        }), flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'type': 'error',
            'success': False,
            'error': str(e)
        }), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'type': 'error',
            'success': False,
            'error': 'Video ID required'
        }))
        sys.exit(1)
    
    result = download_audio(sys.argv[1])
    sys.exit(0 if result['success'] else 1) 