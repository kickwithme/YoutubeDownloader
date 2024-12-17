#!/usr/bin/env python3
import sys
import json
from yt_dlp import YoutubeDL
import os
import re

# Create downloads directory in /tmp for repl.it
DOWNLOADS_DIR = '/tmp/downloads'
if not os.path.exists(DOWNLOADS_DIR):
    os.makedirs(DOWNLOADS_DIR)

def sanitize_filename(filename):
    # Remove non-ASCII characters and sanitize
    clean_name = re.sub(r'[^\x00-\x7F]+', '', filename)
    clean_name = re.sub(r'[^a-zA-Z0-9-_ \.]', '', clean_name)
    clean_name = re.sub(r'\s+', ' ', clean_name).strip()
    return clean_name or 'audio'

def progress_hook(d):
    if d['status'] == 'downloading':
        progress = {
            'type': 'progress',
            'percentage': d.get('_percent_str', '0%').strip(),
            'speed': d.get('_speed_str', 'N/A'),
            'eta': d.get('_eta_str', 'N/A')
        }
        print(json.dumps(progress), flush=True)
    elif d['status'] == 'finished':
        progress = {
            'type': 'progress',
            'percentage': '100%',
            'status': 'Converting...'
        }
        print(json.dumps(progress), flush=True)

def download_audio(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    if not os.path.exists('downloads'):
        os.makedirs('downloads')
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': f'{DOWNLOADS_DIR}/%(title)s.%(ext)s',
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True
    }
    
    with YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=True)
            # Sanitize the title for the filename
            safe_title = sanitize_filename(info['title'])
            safe_filename = f"downloads/{safe_title}.mp3"
            
            # Rename the file if necessary
            original_filename = f"downloads/{info['title']}.mp3"
            if os.path.exists(original_filename) and original_filename != safe_filename:
                os.rename(original_filename, safe_filename)
            
            result = {
                'type': 'complete',
                'success': True,
                'title': info['title'],
                'filename': safe_filename
            }
            print(json.dumps(result), flush=True)
            return result
        except Exception as e:
            error_result = {
                'type': 'error',
                'success': False,
                'error': str(e)
            }
            print(json.dumps(error_result), flush=True)
            return error_result

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