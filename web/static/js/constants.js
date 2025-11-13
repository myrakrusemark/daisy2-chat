// Global constants for Claude Assistant
window.CLAUDE_CONSTANTS = {
  // Keyword detection configuration  
  DEFAULT_KEYWORDS: ['hey daisy', 'daisy'],
  KEYWORD_DISPLAY: 'Hey Daisy',
    
  // UI messages
  READY_MESSAGE: 'Ready to assist',
  VAD_LISTENING_MESSAGE: function() {
    return `👂 Listening continuously for "${window.CLAUDE_CONSTANTS.KEYWORD_DISPLAY}"...`;
  },
    
  // VAD and timeout configuration
  SILENCE_TIMEOUT: 2000,
  VAD_SPEECH_TIMEOUT: 2000, // Stop recording after 2 seconds of VAD silence
  VAD_DETECTION_TIMEOUT: 10000, // 10 seconds timeout for initial speech detection
  RECOGNITION_RESTART_DELAY: 100,
  AUDIO_INIT_VOLUME: 0.01,
    
  // Server transcription configuration
  SERVER_TRANSCRIPTION: {
    ENABLED: true,                    // Enable server transcription by default
    FALLBACK_TO_BROWSER: true,        // Fallback to browser STT if server unavailable
    AUDIO_CHUNK_INTERVAL: 1000,       // Send audio chunks every 1 second for WAV
    PREFERRED_SAMPLE_RATE: 16000,     // 16kHz for Whisper
    PREFERRED_CHANNELS: 1,            // Mono audio
    MIME_TYPE: 'audio/wav'            // WAV format for simpler processing
  },
    
  // STT Engine configuration
  STT_ENGINES: {
    SERVER_WHISPER: 'server-whisper',
    BROWSER_SPEECH_API: 'browser-speech-api',
    ANDROID_APP: 'android-app'
  },
    
  // STT Engine display names
  STT_ENGINE_NAMES: {
    'server-whisper': 'Server Whisper',
    'browser-speech-api': 'Browser Speech API',
    'android-app': 'Android App'
  },
    
  // Default STT engine preference
  DEFAULT_STT_ENGINE: 'server-whisper'
};