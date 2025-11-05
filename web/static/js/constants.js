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
    RECOGNITION_RESTART_DELAY: 100,
    AUDIO_INIT_VOLUME: 0.01
};