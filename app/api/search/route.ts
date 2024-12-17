import { NextResponse } from 'next/server'
import { google } from 'googleapis'

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
})

// Add some debug logging
console.log('API Key available:', !!process.env.YOUTUBE_API_KEY)

// Extract playlist ID from URL
function getPlaylistId(url: string) {
  // Handle various playlist URL formats
  const patterns = [
    /list=([a-zA-Z0-9_-]+)/i,                     // Regular playlist parameter
    /playlist\?list=([a-zA-Z0-9_-]+)/i,           // Direct playlist URL
    /youtube\.com\/playlist\/([a-zA-Z0-9_-]+)/i   // Alternative format
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  try {
    // Check if it's a playlist URL
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
      const playlistId = getPlaylistId(query)
      
      if (playlistId) {
        console.log('Found playlist ID:', playlistId)

        // First, verify the playlist exists and is accessible
        const playlistDetails = await youtube.playlists.list({
          part: ['snippet'],
          id: [playlistId]
        })

        if (!playlistDetails.data.items?.length) {
          return NextResponse.json({ 
            error: 'Playlist not accessible',
            details: 'This playlist might be private or deleted. Make sure the playlist is public and try again.',
            type: 'PLAYLIST_ACCESS_ERROR'
          }, { status: 403 })
        }

        // Get all videos from the playlist
        let allVideos = []
        let nextPageToken = undefined

        do {
          const response = await youtube.playlistItems.list({
            part: ['snippet', 'contentDetails'],
            playlistId: playlistId,
            maxResults: 50,
            pageToken: nextPageToken
          })

          const videos = response.data.items?.map(item => ({
            id: item.snippet?.resourceId?.videoId,
            title: item.snippet?.title,
            thumbnail: item.snippet?.thumbnails?.medium?.url,
            duration: '0:00' // We'll get durations in bulk later
          })) || []

          allVideos = [...allVideos, ...videos]
          nextPageToken = response.data.nextPageToken
        } while (nextPageToken)

        // Get video durations in bulk
        const videoIds = allVideos.map(v => v.id)
        const videoDetails = await youtube.videos.list({
          part: ['contentDetails'],
          id: videoIds
        })

        // Update durations
        const durationMap = new Map(
          videoDetails.data.items?.map(v => [v.id, v.contentDetails?.duration]) || []
        )

        const finalVideos = allVideos.map(video => ({
          ...video,
          duration: durationMap.get(video.id) || '0:00'
        }))

        return NextResponse.json(finalVideos)
      }
    }

    // Regular search
    const { data } = await youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: 10
    })

    const videos = data.items?.map(item => ({
      id: item.id?.videoId as string,
      title: item.snippet?.title as string,
      thumbnail: item.snippet?.thumbnails?.medium?.url as string,
      duration: '0:00'
    })) || []

    return NextResponse.json(videos)

  } catch (error: any) {
    console.error('YouTube API Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    })

    // Handle specific YouTube API errors
    const apiError = error.response?.data?.error
    if (apiError?.errors?.[0]?.reason === 'playlistNotFound') {
      return NextResponse.json({ 
        error: 'Playlist not found',
        details: 'The playlist ID is invalid or the playlist has been deleted.',
        type: 'PLAYLIST_NOT_FOUND'
      }, { status: 404 })
    }

    return NextResponse.json({ 
      error: 'YouTube API Error',
      details: apiError?.message || error.message,
      type: 'API_ERROR'
    }, { status: error.response?.status || 500 })
  }
}

