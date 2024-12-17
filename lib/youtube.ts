import { google } from 'googleapis'

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
})

export type VideoResult = {
  id: string
  title: string
  thumbnail: string
  duration: string
}

export async function searchYouTube(query: string): Promise<VideoResult[]> {
  try {
    const response = await youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: 10,
      videoDuration: 'any'
    })

    const videoIds = response.data.items?.map(item => item.id?.videoId) || []
    
    // Get video details to include duration
    const videoDetails = await youtube.videos.list({
      part: ['contentDetails', 'snippet'],
      id: videoIds
    })

    return videoDetails.data.items?.map(video => ({
      id: video.id as string,
      title: video.snippet?.title as string,
      thumbnail: video.snippet?.thumbnails?.medium?.url as string,
      duration: video.contentDetails?.duration as string
    })) || []
  } catch (error) {
    console.error('YouTube API Error:', error)
    throw new Error('Failed to search YouTube')
  }
}

