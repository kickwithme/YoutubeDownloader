import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// Function to sanitize filename
function sanitizeFilename(filename: string): string {
  // Remove non-ASCII characters and common problematic characters
  return filename
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII
    .replace(/[^a-zA-Z0-9-_ \.]/g, '') // Keep only alphanumeric, dash, underscore, space, and dot
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
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
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Handle different OS paths
    const isWindows = process.platform === 'win32';
    const pythonPath = 'python3';  // Simplified for repl.it
    const scriptPath = join(process.cwd(), 'scripts', 'download.py');

    console.log('Current directory:', process.cwd());
    console.log('Python path:', pythonPath);
    console.log('Script path:', scriptPath);

    // Check if paths exist
    try {
      const pythonStats = readFileSync(pythonPath);
      const scriptStats = readFileSync(scriptPath);
      console.log('Python and script files found');
    } catch (error) {
      console.error('File check error:', error);
      return NextResponse.json({ 
        error: 'Python setup incorrect',
        details: error.message
      }, { status: 500 });
    }

    const pythonProcess = spawn(pythonPath, [scriptPath, videoId]);

    return new Promise((resolve) => {
      let lastJsonResult: any = null;
      let debugOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Python stdout:', output);
        
        // Handle multiple lines
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

          // Clean up the downloaded file
          try {
            unlinkSync(filename);
          } catch (e) {
            console.error('Failed to clean up file:', e);
          }

          // Sanitize the filename for the Content-Disposition header
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

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ 
      error: 'Failed to download audio',
      details: error.message
    }, { status: 500 });
  }
}

