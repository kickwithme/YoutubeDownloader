import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ 
    keyExists: !!process.env.YOUTUBE_API_KEY,
    keyFirstChars: process.env.YOUTUBE_API_KEY?.slice(0, 5) + '...'
  })
} 