import { NextResponse } from 'next/server'
import { searchYouTube } from '@/lib/youtube'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 })
  }

  try {
    const results = await searchYouTube(query)
    return NextResponse.json(results)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to search YouTube' }, { status: 500 })
  }
}

