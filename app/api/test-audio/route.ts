import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'app/assets/sounds/test.mp3')
    const fileBuffer = readFileSync(filePath)

    const headers = new Headers()
    headers.set('Content-Type', 'audio/mpeg')
    headers.set('Content-Disposition', 'attachment; filename="test.mp3"')
    headers.set('Content-Length', fileBuffer.length.toString())

    return new NextResponse(fileBuffer, {
      headers,
      status: 200,
    })
  } catch (error) {
    console.error('Error serving test audio:', error)
    return NextResponse.json({ error: 'Failed to serve test audio' }, { status: 500 })
  }
} 