import { NextResponse } from 'next/server';

const encoder = new TextEncoder();

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Keep track of the controller to send updates
      (global as any).progressController = controller;
    },
    cancel() {
      delete (global as any).progressController;
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 