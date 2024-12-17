import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// Keep track of active downloads
const activeDownloads = new Map<string, { process: any, controller: AbortController }>();

// Function to sanitize filename
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9-_ \.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sendProgress(progress: any) {
  const controller = (global as any).progressController;
  if (controller) {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const action = searchParams.get('action');

  if (action === 'cancel' && videoId) {
    const download = activeDownloads.get(videoId);
    if (download) {
      // Send SIGTERM to Python process
      download.process.kill('SIGTERM');
      download.controller.abort();
      activeDownloads.delete(videoId);
    }
    return NextResponse.json({ status: 'cancelled' });
  }

  // Handle different OS paths
  const isWindows = process.platform === 'win32';
  const pythonPath = join(process.cwd(), 'venv', 
    isWindows ? 'Scripts' : 'bin',
    isWindows ? 'python.exe' : 'python3'
  );
  const scriptPath = join(process.cwd(), 'scripts', 'download.py');

  console.log('Current directory:', process.cwd());
  console.log('Python path:', pythonPath);
  console.log('Script path:', scriptPath);

  // Check if script exists
  try {
    const scriptStats = readFileSync(scriptPath);
    console.log('Script file found');
  } catch (error) {
    console.error('Script file check error:', error);
    return NextResponse.json({ 
      error: 'Python script not found',
      details: error.message
    }, { status: 500 });
  }

  // Use python3 command directly
  const pythonProcess = spawn('python3', [scriptPath, videoId]);
  const controller = new AbortController();
  
  // Store the process
  activeDownloads.set(videoId, { process: pythonProcess, controller });

  // Clean up when done
  pythonProcess.on('close', () => {
    activeDownloads.delete(videoId);
  });

  return new Promise((resolve) => {
    let lastJsonResult: any = null;
    let debugOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Python stdout:', output);
      
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'progress') {
            sendProgress(parsed);
            console.log('Progress:', parsed);
          } else if (parsed.type === 'complete') {
            lastJsonResult = parsed;
          } else if (parsed.type === 'error') {
            lastJsonResult = parsed;
          }
        } catch (e) {
          console.log('Non-JSON output:', line);
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.log('Python stderr:', output);
      debugOutput += output;
    });

    pythonProcess.on('close', async (code) => {
      if (code !== 0 || !lastJsonResult || !lastJsonResult.success) {
        resolve(NextResponse.json({ 
          error: 'Download failed',
          details: lastJsonResult?.error || debugOutput
        }, { status: 500 }));
        return;
      }

      try {
        const { filename } = lastJsonResult;
        const fileBuffer = readFileSync(filename);

        try {
          unlinkSync(filename);
        } catch (e) {
          console.error('Failed to clean up file:', e);
        }

        const safeFilename = sanitizeFilename(filename.split('/').pop() || 'audio.mp3');

        const headers = new Headers();
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
        headers.set('Content-Length', fileBuffer.length.toString());

        resolve(new NextResponse(fileBuffer, {
          headers,
          status: 200,
        }));
      } catch (error) {
        console.error('Error processing download:', error);
        resolve(NextResponse.json({ 
          error: 'Failed to process download',
          details: error.message
        }, { status: 500 }));
      }
    });
  });
}

