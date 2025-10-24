/**
 * Audio module - Web Speech API (STT) and Speech Synthesis API (TTS)
 * Firefox-compatible implementation
 */

class AudioManager {
    constructor() {
        // Speech Recognition (STT)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('Speech Recognition not supported');
            this.recognition = null;
        } else {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;  // Changed to continuous
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
        }

        // Track recognition state
        this.isRecognitionActive = false;
        this.accumulatedTranscript = '';  // Buffer to accumulate transcript
        this.currentMode = null;  // Track activation mode (push-to-talk or wake-word)
        this.silenceTimer = null;  // Timer for auto-stopping after silence
        this.silenceTimeout = 2000;  // 2 seconds of silence before auto-stop

        // Audio playback for streamed TTS
        this.audioContext = null;
        this.audioChunks = [];
        this.isPlaying = false;
        this.currentAudio = null;  // Track current audio element for stopping

        // Sound effects
        this.soundsEnabled = true;
        this.sounds = {
            wake: new Audio('/static/sounds/wake.mp3'),
            wakeWord: new Audio('/static/sounds/wake-word.mp3'),
            tool: new Audio('/static/sounds/tool.mp3'),
            wait: new Audio('/static/sounds/wait.mp3'),
            sleep: new Audio('/static/sounds/sleep.mp3'),
        };

        // Callbacks
        this.onTranscript = null;
        this.onInterimTranscript = null;
        this.onError = null;
        this.onEnd = null;

        this.setupRecognitionHandlers();
    }

    /**
     * No longer needed - Transformers.js doesn't have voice selection
     * Keeping stubs for compatibility
     */
    getVoices() {
        return [];
    }

    setVoice(voiceName) {
        // No-op for Transformers.js
        console.log('Voice selection not available with Transformers.js TTS');
    }

    setSpeechRate(rate) {
        // No-op for Transformers.js
        console.log('Speech rate control not available with Transformers.js TTS');
    }

    /**
     * Setup speech recognition event handlers
     */
    setupRecognitionHandlers() {
        if (!this.recognition) return;

        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            // Build complete transcript from all results
            let completeTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    completeTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            // Update accumulated transcript
            if (completeTranscript) {
                this.accumulatedTranscript = completeTranscript.trim();
            }

            // For wake-word mode: start/reset silence timer on ANY speech (final or interim)
            if (this.currentMode === 'wake-word' && (completeTranscript || interimTranscript)) {
                this.clearSilenceTimer();
                this.silenceTimer = setTimeout(() => {
                    this.stopListening();
                }, this.silenceTimeout);
            }

            // Show interim results for user feedback
            if (interimTranscript && this.onInterimTranscript) {
                const displayText = this.accumulatedTranscript + ' ' + interimTranscript;
                this.onInterimTranscript(displayText.trim());
            } else if (this.accumulatedTranscript && this.onInterimTranscript) {
                this.onInterimTranscript(this.accumulatedTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (this.onError) {
                this.onError(event.error);
            }
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            this.isRecognitionActive = false;

            // Send accumulated transcript if we have one
            if (this.accumulatedTranscript.trim() && this.onTranscript) {
                this.onTranscript(this.accumulatedTranscript.trim());
            }

            // Clear the buffer
            this.accumulatedTranscript = '';

            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.isRecognitionActive = true;
            // Clear buffer when starting new recording
            this.accumulatedTranscript = '';
        };
    }

    /**
     * Start listening for speech
     * @param {string} mode - Activation mode ('push-to-talk' or 'wake-word')
     */
    startListening(mode = 'push-to-talk') {
        if (!this.recognition) {
            console.error('Speech recognition not available');
            return false;
        }

        // Store the current mode
        this.currentMode = mode;

        // Clear any existing silence timer
        this.clearSilenceTimer();

        // If already active, stop first
        if (this.isRecognitionActive) {
            console.log('Recognition already active, stopping first...');
            this.recognition.stop();
            // Wait a bit before restarting
            setTimeout(() => {
                this._attemptStart();
            }, 100);
            return true;
        }

        return this._attemptStart();
    }

    /**
     * Internal method to attempt starting recognition
     */
    _attemptStart() {
        try {
            this.recognition.start();
            this.playSound('wake');
            return true;
        } catch (error) {
            console.error('Error starting recognition:', error);
            // If it fails because already started, stop and retry
            if (error.message && error.message.includes('already started')) {
                this.recognition.stop();
                setTimeout(() => {
                    this._attemptStart();
                }, 100);
                return true;
            }
            return false;
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        // Clear silence timer
        this.clearSilenceTimer();

        if (this.recognition) {
            this.recognition.stop();
        }
    }

    /**
     * Clear the silence detection timer
     */
    clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    /**
     * Start TTS audio stream
     */
    startTTSStream() {
        console.log('Starting TTS audio stream');
        this.audioChunks = [];
        this.isPlaying = false;

        // Initialize audio context if needed
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    /**
     * Add audio chunk to stream
     */
    addTTSChunk(audioData) {
        // audioData is base64 encoded audio chunk
        this.audioChunks.push(audioData);
    }

    /**
     * Play the accumulated audio chunks
     */
    async playTTSStream(onEnd = null) {
        console.log(`Playing TTS stream (${this.audioChunks.length} chunks)`);

        if (this.audioChunks.length === 0) {
            console.warn('No audio chunks to play');
            if (onEnd) onEnd();
            return;
        }

        try {
            // Concatenate all base64 chunks
            const combinedB64 = this.audioChunks.join('');

            // Decode base64 to binary
            const binaryString = atob(combinedB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Create audio element and play
            const blob = new Blob([bytes], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            this.currentAudio = audio;  // Track for stopping

            audio.onended = () => {
                console.log('TTS playback finished');
                URL.revokeObjectURL(audioUrl);
                this.isPlaying = false;
                this.currentAudio = null;
                if (onEnd) onEnd();
            };

            audio.onerror = (e) => {
                console.error('Audio playback error:', e);
                URL.revokeObjectURL(audioUrl);
                this.isPlaying = false;
                this.currentAudio = null;
                if (onEnd) onEnd();
            };

            this.isPlaying = true;
            await audio.play();

        } catch (error) {
            console.error('Error playing TTS stream:', error);
            this.isPlaying = false;
            if (onEnd) onEnd();
        }
    }

    /**
     * Stop speaking
     */
    stopSpeaking() {
        this.isPlaying = false;
        this.audioChunks = [];

        // Stop currently playing audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
    }

    /**
     * Play sound effect
     */
    playSound(soundName) {
        if (!this.soundsEnabled) return;

        const sound = this.sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(err => console.error('Error playing sound:', err));
        }
    }

    /**
     * Enable/disable sound effects
     */
    setSoundsEnabled(enabled) {
        this.soundsEnabled = enabled;
    }

    /**
     * Check browser compatibility
     */
    static checkCompatibility() {
        const issues = [];

        // Check Speech Recognition
        if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            issues.push('Speech Recognition (STT) is not supported in this browser');
        }

        // Check Speech Synthesis
        if (!window.speechSynthesis) {
            issues.push('Speech Synthesis (TTS) is not supported in this browser');
        }

        // Detect browser
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('firefox')) {
            // Firefox has good support
            console.log('Firefox detected - full support expected');
        } else if (userAgent.includes('chrome') || userAgent.includes('edge')) {
            // Chrome/Edge have good support
            console.log('Chrome/Edge detected - full support expected');
        } else if (userAgent.includes('safari')) {
            // Safari has limited support
            issues.push('Safari has limited Web Speech API support. Consider using Firefox or Chrome for best experience.');
        }

        return {
            supported: issues.length === 0,
            issues: issues,
            browser: userAgent.includes('firefox') ? 'firefox' :
                    userAgent.includes('chrome') ? 'chrome' :
                    userAgent.includes('edge') ? 'edge' :
                    userAgent.includes('safari') ? 'safari' : 'unknown'
        };
    }
}

// Export for use in other modules
window.AudioManager = AudioManager;
