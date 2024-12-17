const handleDownload = async (videoId: string) => {
  try {
    // Create progress element first
    const progressContainer = document.createElement('div');
    progressContainer.className = 'fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-white p-4 rounded-lg shadow-lg z-50 min-w-[300px]';
    
    const progressText = document.createElement('p');
    progressText.className = 'text-sm text-gray-600 mb-2';
    progressText.textContent = 'Initializing...';
    progressContainer.appendChild(progressText);
    
    const progressBar = document.createElement('div');
    progressBar.className = 'w-full bg-gray-200 rounded-full h-2.5';
    const progressFill = document.createElement('div');
    progressFill.className = 'bg-blue-600 h-2.5 rounded-full transition-all duration-200';
    progressFill.style.width = '0%';
    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);
    
    document.body.appendChild(progressContainer);

    // Create a function to update progress
    const updateProgress = (data: any) => {
      requestAnimationFrame(() => {
        if (data.percentage) {
          const percentage = parseFloat(data.percentage.replace('%', ''));
          console.log('Setting progress to:', percentage);
          progressFill.style.width = `${percentage}%`;
          progressText.textContent = `Downloading: ${percentage}%${data.speed ? ` at ${data.speed}` : ''}${data.eta ? ` (ETA: ${data.eta})` : ''}`;
        }
        if (data.status === 'Converting...') {
          progressText.textContent = 'Converting to MP3...';
          progressFill.style.width = '100%';
        }
      });
    };

    // Wait for EventSource connection
    await new Promise<void>((resolve, reject) => {
      const eventSource = new EventSource(`/api/progress`);
      let hasError = false;
      
      eventSource.onopen = () => {
        console.log('SSE connection opened');
        resolve();
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        hasError = true;
        eventSource.close();
        reject(error);
      };

      eventSource.onmessage = (event) => {
        console.log('Raw SSE message:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('Parsed progress data:', data);
          updateProgress(data);
        } catch (e) {
          console.error('Error parsing progress data:', e);
        }
      };

      // Store eventSource for cleanup
      (progressContainer as any).eventSource = eventSource;

      // Timeout after 30 seconds if no connection
      setTimeout(() => {
        if (!hasError && eventSource.readyState !== 1) {
          console.error('SSE connection timeout');
          eventSource.close();
          reject(new Error('Connection timeout'));
        }
      }, 30000);
    });

    // Start the download
    const response = await fetch(`/api/download?videoId=${videoId}`);
    
    if (!response.ok) {
      throw new Error('Download failed');
    }

    // Clean up
    if ((progressContainer as any).eventSource) {
      (progressContainer as any).eventSource.close();
    }
    document.body.removeChild(progressContainer);

    // Handle the downloaded file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio.mp3`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

  } catch (error) {
    console.error('Download error:', error);
    toast({
      title: 'Download Failed',
      description: error.message,
      variant: 'destructive'
    });
  }
}; 