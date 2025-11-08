// Global constants for Claude Assistant
window.CLAUDE_CONSTANTS = {
    // Wake word configuration
    WAKE_WORD: 'Hey Jarvis',
    WAKE_WORD_DISPLAY: 'Hey Jarvis',
    
    // UI messages
    READY_MESSAGE: 'Ready to assist',
    WAKE_WORD_LISTENING_MESSAGE: function() {
        return `Listening for wake word: "${window.CLAUDE_CONSTANTS.WAKE_WORD_DISPLAY}"`;
    },
    
    // Delays and timeouts
    WAKE_WORD_RESUME_DELAY: 500,
    WAKE_WORD_RESTART_DELAY: 1000,
    SILENCE_TIMEOUT: 2000,
    WAKE_WORD_SILENCE_TIMEOUT: 2000, // Auto-send wake-word transcription after 2 seconds of silence
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
        BROWSER_SPEECH_API: 'browser-speech-api'
    },
    
    // STT Engine display names
    STT_ENGINE_NAMES: {
        'server-whisper': 'Server Whisper',
        'browser-speech-api': 'Browser Speech API'
    },
    
    // Default STT engine preference
    DEFAULT_STT_ENGINE: 'server-whisper'
};