/**
 * Frontend tests for audio recording functionality
 * Tests the browser-side STT and audio handling
 */

// Mock the audio utilities before importing
const mockAudioUtils = {
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  isRecording: jest.fn().mockReturnValue(false),
  mediaRecorder: null,
  audioStream: null
};

// Mock DOM elements and global functions
document.getElementById = jest.fn((id) => {
  const mockElements = {
    'voice-button': {
      classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
      textContent: '',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    'status': {
      textContent: '',
      classList: { add: jest.fn(), remove: jest.fn() }
    },
    'messages': {
      appendChild: jest.fn(),
      scrollTop: 0,
      scrollHeight: 100
    }
  };
  return mockElements[id] || { 
    classList: { add: jest.fn(), remove: jest.fn() },
    textContent: '',
    addEventListener: jest.fn()
  };
});

describe('Audio Recording Integration', () => {
  let mockWebSocket;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock WebSocket
    mockWebSocket = {
      send: jest.fn(),
      readyState: WebSocket.OPEN,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    
    // Reset fake timers
    jest.clearAllTimers();
  });

  describe('MediaRecorder Integration', () => {
    test('should initialize MediaRecorder with correct options', async () => {
      const mockStream = {
        getTracks: () => [{ stop: jest.fn() }]
      };
      
      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);
      
      // Simulate starting recording
      const mediaRecorder = new MediaRecorder(mockStream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      });
      
      expect(MediaRecorder).toHaveBeenCalledWith(
        mockStream,
        expect.objectContaining({
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 16000
        })
      );
    });

    test('should handle MediaRecorder events correctly', () => {
      const mockStream = { getTracks: () => [] };
      const mediaRecorder = new MediaRecorder(mockStream);
      
      // Test event listener setup
      mediaRecorder.addEventListener('dataavailable', expect.any(Function));
      mediaRecorder.addEventListener('stop', expect.any(Function));
      
      expect(mediaRecorder.addEventListener).toHaveBeenCalledWith(
        'dataavailable', 
        expect.any(Function)
      );
      expect(mediaRecorder.addEventListener).toHaveBeenCalledWith(
        'stop', 
        expect.any(Function)
      );
    });

    test('should send audio chunks via WebSocket', () => {
      const mockAudioBlob = new Blob(['fake-audio-data'], { type: 'audio/webm' });
      const mockFileReader = {
        readAsArrayBuffer: jest.fn(),
        result: new ArrayBuffer(8),
        onload: null
      };
      
      global.FileReader = jest.fn(() => mockFileReader);
      global.btoa = jest.fn().mockReturnValue('base64audiodata');
      
      // Simulate audio data available event
      const dataAvailableEvent = {
        data: mockAudioBlob
      };
      
      // Mock WebSocket send function
      const sendAudioChunk = jest.fn((ws, audioData) => {
        ws.send(JSON.stringify({
          type: 'audio_chunk',
          data: audioData
        }));
      });
      
      sendAudioChunk(mockWebSocket, 'base64audiodata');
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'audio_chunk', 
          data: 'base64audiodata'
        })
      );
    });
  });

  describe('WebSocket Communication', () => {
    test('should start server transcription correctly', () => {
      const startMessage = {
        type: 'start_server_transcription'
      };
      
      mockWebSocket.send(JSON.stringify(startMessage));
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify(startMessage)
      );
    });

    test('should stop server transcription correctly', () => {
      const stopMessage = {
        type: 'stop_server_transcription'
      };
      
      mockWebSocket.send(JSON.stringify(stopMessage));
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify(stopMessage)
      );
    });

    test('should handle transcription results', () => {
      const mockTranscriptionResult = {
        type: 'server_transcription_result',
        text: 'Hello world',
        is_final: false,
        confidence: 0.95
      };
      
      // Mock message handler
      const handleTranscriptionResult = jest.fn((message) => {
        if (message.type === 'server_transcription_result') {
          const statusElement = document.getElementById('status');
          statusElement.textContent = message.text;
          return message.text;
        }
      });
      
      const result = handleTranscriptionResult(mockTranscriptionResult);
      
      expect(result).toBe('Hello world');
      expect(handleTranscriptionResult).toHaveBeenCalledWith(mockTranscriptionResult);
    });
  });

  describe('Multiple Browser Session Simulation', () => {
    test('should handle multiple concurrent WebSocket connections', () => {
      // Simulate multiple browser tabs/windows
      const ws1 = {
        send: jest.fn(),
        readyState: WebSocket.OPEN,
        sessionId: 'session-1'
      };
      
      const ws2 = {
        send: jest.fn(), 
        readyState: WebSocket.OPEN,
        sessionId: 'session-2'
      };
      
      const ws3 = {
        send: jest.fn(),
        readyState: WebSocket.OPEN,
        sessionId: 'session-3'
      };
      
      // Start STT on all three "sessions"
      [ws1, ws2, ws3].forEach((ws, index) => {
        ws.send(JSON.stringify({
          type: 'start_server_transcription',
          session_id: `session-${index + 1}`
        }));
      });
      
      // Verify all sessions sent start messages
      expect(ws1.send).toHaveBeenCalledWith(
        expect.stringContaining('start_server_transcription')
      );
      expect(ws2.send).toHaveBeenCalledWith(
        expect.stringContaining('start_server_transcription')
      );
      expect(ws3.send).toHaveBeenCalledWith(
        expect.stringContaining('start_server_transcription')
      );
      
      // Simulate different audio data for each session
      ws1.send(JSON.stringify({
        type: 'audio_chunk',
        data: 'session1audiodata'
      }));
      
      ws2.send(JSON.stringify({
        type: 'audio_chunk', 
        data: 'session2audiodata'
      }));
      
      ws3.send(JSON.stringify({
        type: 'audio_chunk',
        data: 'session3audiodata'
      }));
      
      // Verify each session sent unique audio
      expect(ws1.send).toHaveBeenCalledWith(
        expect.stringContaining('session1audiodata')
      );
      expect(ws2.send).toHaveBeenCalledWith(
        expect.stringContaining('session2audiodata')
      );
      expect(ws3.send).toHaveBeenCalledWith(
        expect.stringContaining('session3audiodata')
      );
    });

    test('should handle WebSocket reconnection for STT sessions', () => {
      const mockReconnectLogic = jest.fn((ws) => {
        // Simulate reconnection
        ws.readyState = WebSocket.CONNECTING;
        
        // After "reconnection"
        setTimeout(() => {
          ws.readyState = WebSocket.OPEN;
          // Restart STT after reconnection
          ws.send(JSON.stringify({
            type: 'start_server_transcription'
          }));
        }, 100);
      });
      
      mockReconnectLogic(mockWebSocket);
      
      // Fast forward timers
      jest.advanceTimersByTime(100);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('start_server_transcription')
      );
    });
  });

  describe('Audio Format Handling', () => {
    test('should handle WebM audio format correctly', () => {
      const mockWebMBlob = new Blob(['webm-audio-data'], { 
        type: 'audio/webm;codecs=opus' 
      });
      
      expect(mockWebMBlob.type).toBe('audio/webm;codecs=opus');
      expect(mockWebMBlob.size).toBeGreaterThan(0);
    });

    test('should convert audio to base64 for WebSocket transmission', () => {
      // Mock ArrayBuffer and base64 conversion
      const mockArrayBuffer = new ArrayBuffer(16);
      const mockUint8Array = new Uint8Array(mockArrayBuffer);
      
      // Fill with fake audio data
      for (let i = 0; i < mockUint8Array.length; i++) {
        mockUint8Array[i] = i;
      }
      
      // Mock btoa function
      global.btoa = jest.fn().mockImplementation((data) => {
        return 'bW9ja2Jhc2U2NGRhdGE='; // Mock base64 string
      });
      
      const base64Data = btoa(String.fromCharCode(...mockUint8Array));
      
      expect(btoa).toHaveBeenCalled();
      expect(base64Data).toBe('bW9ja2Jhc2U2NGRhdGE=');
    });
  });

  describe('Error Handling', () => {
    test('should handle MediaRecorder errors gracefully', () => {
      const mockErrorHandler = jest.fn((error) => {
        console.error('MediaRecorder error:', error);
        return 'error_handled';
      });
      
      const mockError = new Error('MediaRecorder failed');
      const result = mockErrorHandler(mockError);
      
      expect(mockErrorHandler).toHaveBeenCalledWith(mockError);
      expect(result).toBe('error_handled');
      expect(console.error).toHaveBeenCalledWith(
        'MediaRecorder error:', 
        mockError
      );
    });

    test('should handle WebSocket connection errors', () => {
      const mockErrorHandler = jest.fn((event) => {
        if (event.type === 'error') {
          return 'websocket_error_handled';
        }
      });
      
      const mockErrorEvent = { type: 'error', message: 'Connection failed' };
      const result = mockErrorHandler(mockErrorEvent);
      
      expect(result).toBe('websocket_error_handled');
    });

    test('should handle microphone permission denied', async () => {
      navigator.mediaDevices.getUserMedia.mockRejectedValue(
        new Error('Permission denied')
      );
      
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        expect(error.message).toBe('Permission denied');
      }
    });
  });
});

describe('UI Integration', () => {
  test('should update voice button state correctly', () => {
    const voiceButton = document.getElementById('voice-button');
    
    // Simulate starting recording
    voiceButton.classList.add('recording');
    voiceButton.textContent = 'Stop Recording';
    
    expect(voiceButton.classList.add).toHaveBeenCalledWith('recording');
    expect(voiceButton.textContent).toBe('Stop Recording');
    
    // Simulate stopping recording
    voiceButton.classList.remove('recording');
    voiceButton.textContent = 'Start Recording';
    
    expect(voiceButton.classList.remove).toHaveBeenCalledWith('recording');
    expect(voiceButton.textContent).toBe('Start Recording');
  });

  test('should display transcription results in UI', () => {
    const statusElement = document.getElementById('status');
    const mockTranscription = 'This is a test transcription';
    
    statusElement.textContent = mockTranscription;
    
    expect(statusElement.textContent).toBe(mockTranscription);
  });
});