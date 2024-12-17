'use client'

import { Button } from "./ui/button"

export function AudioTest() {
  const handleTestDownload = () => {
    // Create a link to download the test MP3
    const a = document.createElement('a')
    a.href = '/assets/sounds/test.mp3'
    a.download = 'test.mp3'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4">
        <h3 className="text-lg font-semibold">Test Audio Player</h3>
        
        {/* Audio player for test file */}
        <audio controls className="w-full max-w-md">
          <source src="/assets/sounds/test.mp3" type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>

        {/* Download test button */}
        <Button onClick={handleTestDownload}>
          Download Test MP3
        </Button>
      </div>

      <div className="border-t pt-4">
        <p className="text-sm text-muted-foreground">
          If the test audio works but YouTube downloads don't, we know the issue is with the download process.
        </p>
      </div>
    </div>
  )
} 