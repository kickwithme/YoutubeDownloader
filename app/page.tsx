'use client'

import { useState, useRef } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Download, Search, Loader2, List, Play, Pause, Square } from 'lucide-react'
import { toast } from 'sonner'

type VideoResult = {
  id: string
  title: string
  thumbnail: string
  duration: string
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<VideoResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadFilename, setDownloadFilename] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [shouldStop, setShouldStop] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Add a ref to store the abort controller
  const abortControllerRef = useRef<AbortController | null>(null)

  const progressRef = useRef<number>(0)

  // Add a new ref for the reader
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsLoading(true)
    setSearchError(null)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()

      if (!response.ok) {
        let errorMessage = data.details || data.error || 'Search failed'
        
        // Show specific messages for playlist errors
        if (data.type === 'PLAYLIST_ACCESS_ERROR') {
          setSearchError('This playlist is private or not accessible')
          toast.error('Playlist Error', {
            description: 'Make sure the playlist is public and try again.'
          })
        } else if (data.type === 'PLAYLIST_NOT_FOUND') {
          setSearchError('Playlist not found - The URL might be invalid or the playlist was deleted')
          toast.error('Playlist Error', {
            description: 'The playlist might have been deleted or the URL is invalid.'
          })
        } else {
          setSearchError(errorMessage)
          toast.error('Search failed', {
            description: errorMessage
          })
        }
        
        throw new Error(errorMessage)
      }

      setSearchResults(data)
      setSearchError(null)
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadAll = async () => {
    setIsDownloading(true)
    setShouldStop(false)

    for (const video of searchResults) {
      if (shouldStop) break

      while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100))
        if (shouldStop) break
      }

      try {
        await handleDownload(video)
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (err) {
        console.error(`Failed to download ${video.title}:`, err)
      }
    }

    setIsDownloading(false)
    setShouldStop(false)
    setIsPaused(false)
    toast.success('All downloads completed!')
  }

  const handleDownload = async (video: VideoResult) => {
    setDownloadingId(video.id)
    setDownloadProgress(0)
    setDownloadFilename('')

    const controller = new AbortController()
    const signal = controller.signal

    try {
      let response;
      try {
        response = await fetch(`/api/download?videoId=${video.id}`, {
          signal
        })
      } catch (fetchError) {
        // Handle network errors
        if (signal.aborted) {
          throw new Error('cancelled')
        }
        throw new Error('Network error - Please check your connection')
      }

      // Handle HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (signal.aborted) {
          throw new Error('cancelled')
        }
        throw new Error(errorData.details || errorData.error || 'Download failed')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Unable to read response')

      // Store references for cleanup
      abortControllerRef.current = controller
      readerRef.current = reader

      while (!signal.aborted) {
        try {
          const { done, value } = await reader.read()
          if (done) break

          const text = new TextDecoder().decode(value)
          const lines = text.split('\n')

          for (const line of lines) {
            if (signal.aborted) break

            try {
              if (line.trim()) {
                const data = JSON.parse(line)
                if (data.type === 'progress') {
                  setDownloadProgress(data.percentage)
                  setDownloadFilename(
                    `${data.percentage.toFixed(1)}% ${data.speed ? `at ${data.speed}` : ''} ${data.eta ? `(ETA: ${data.eta})` : ''}`
                  )
                }
              }
            } catch (e) {
              console.log('Non-JSON output:', line)
            }
          }
        } catch (readError) {
          if (signal.aborted) {
            throw new Error('cancelled')
          }
          throw readError
        }
      }

    } catch (err) {
      console.error('Download error:', err)
      if (err.name === 'AbortError' || err.message === 'cancelled' || signal.aborted) {
        toast.info('Download cancelled')
      } else {
        toast.error(`Failed to download: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    } finally {
      // Clean up
      if (readerRef.current) {
        try {
          await readerRef.current.cancel()
        } catch (e) {
          console.error('Error cancelling reader:', e)
        }
        readerRef.current = null
      }

      // Reset states
      setDownloadingId(null)
      setDownloadProgress(0)
      setDownloadFilename('')
      abortControllerRef.current = null
    }
  }

  const formatDuration = (duration: string) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
    if (!match) return ''
    
    const hours = match[1] ? parseInt(match[1]) : 0
    const minutes = match[2] ? parseInt(match[2]) : 0
    const seconds = match[3] ? parseInt(match[3]) : 0
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const stopDownloads = async () => {
    if (downloadingId) {
      try {
        // First, tell the server to stop the download
        await fetch(`/api/download?videoId=${downloadingId}&action=cancel`)

        // Then cancel the reader
        if (readerRef.current) {
          await readerRef.current.cancel()
          readerRef.current = null
        }

        // Finally abort the controller
        if (abortControllerRef.current) {
          try {
            abortControllerRef.current.abort()
          } catch (e) {
            console.error('Error aborting controller:', e)
          }
          abortControllerRef.current = null
        }
      } catch (err) {
        console.error('Failed to cancel download:', err)
      }
    }

    // Reset all states
    setShouldStop(true)
    setIsDownloading(false)
    setIsPaused(false)
    setDownloadingId(null)
    setDownloadProgress(0)
    setDownloadFilename('')
    toast.info('Downloads stopped')
  }

  const togglePause = () => {
    setIsPaused(!isPaused)
    toast.info(isPaused ? 'Downloads resumed' : 'Downloads paused')
  }

  return (
    <main className="container mx-auto p-4 space-y-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-6">YouTube Downloader</h1>
        
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Search for a video or paste URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-grow"
              />
              <Button onClick={handleSearch} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Search</span>
              </Button>
            </div>

            {searchError && (
              <div className="bg-destructive/15 text-destructive text-sm px-3 py-2 rounded-md">
                {searchError}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {searchResults.length > 0 && !isDownloading && (
              <Button 
                onClick={handleDownloadAll}
                disabled={downloadingId !== null}
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Download All
              </Button>
            )}

            {isDownloading && (
              <>
                <Button 
                  onClick={togglePause}
                  size="sm"
                  variant={isPaused ? "outline" : "secondary"}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>

                <Button 
                  onClick={stopDownloads}
                  size="sm"
                  variant="destructive"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {searchResults.map((video) => (
            <Card key={video.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <img 
                  src={video.thumbnail} 
                  alt={video.title} 
                  className="w-40 h-auto rounded object-cover"
                />
                <div className="flex-grow min-w-0">
                  <h2 className="font-semibold truncate">{video.title}</h2>
                  <p className="text-sm text-gray-500">{formatDuration(video.duration)}</p>
                  {downloadingId === video.id && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Progress value={downloadProgress} className="flex-grow" />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {downloadProgress.toFixed(1)}%
                        </span>
                      </div>
                      {downloadFilename && (
                        <p className="text-sm text-muted-foreground">
                          {downloadFilename}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Button 
                  onClick={() => handleDownload(video)} 
                  disabled={downloadingId !== null}
                  variant="outline"
                >
                  {downloadingId === video.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}

