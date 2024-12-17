'use client'

import { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Download, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AudioTest } from "@/components/AudioTest"

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadFilename, setDownloadFilename] = useState('')

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      if (!response.ok) throw new Error('Search failed')
      const results = await response.json()
      setSearchResults(results)
    } catch (err) {
      toast.error('Failed to search YouTube. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async (video: VideoResult) => {
    setDownloadingId(video.id)
    setDownloadProgress(0)
    setDownloadFilename('')

    try {
      const response = await fetch(`/api/download?videoId=${video.id}`)
      if (!response.ok) throw new Error('Download failed')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Unable to read response')

      let totalSize = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = new TextDecoder().decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('filename:')) {
            setDownloadFilename(line.slice(9))
          } else if (line.startsWith('totalSize:')) {
            totalSize = parseFloat(line.slice(10))
          } else if (line.startsWith('progress:')) {
            const [, current, total] = line.split(':')
            const progress = (parseFloat(current) / parseFloat(total)) * 100
            setDownloadProgress(progress)
          } else if (line === 'completed') {
            toast.success('Download completed!')
            break
          } else if (line.startsWith('error:')) {
            throw new Error(line.slice(6))
          }
        }
      }

      // Trigger download
      const downloadResponse = await fetch(`/api/download?videoId=${video.id}`)
      const blob = await downloadResponse.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadFilename || `${video.title}.mp3`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err) {
      console.error('Download error:', err)
      toast.error(`Failed to download: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDownloadingId(null)
      setDownloadProgress(0)
      setDownloadFilename('')
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

  return (
    <main className="container mx-auto p-4 space-y-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-6">YouTube Downloader</h1>
        <div className="flex gap-2 mb-6">
          <Input
            type="text"
            placeholder="Search for a video..."
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
                    <div className="mt-2">
                      <Progress value={downloadProgress} className="w-full" />
                      <p className="text-sm text-gray-500 mt-1">
                        {downloadProgress.toFixed(1)}% - {downloadFilename}
                      </p>
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

      <div className="mt-8">
        <AudioTest />
      </div>
    </main>
  )
}

