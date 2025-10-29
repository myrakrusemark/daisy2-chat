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
        this.audioInitialized = false;
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
        this.setupAudioInitialization();
    }

    /**
     * Setup audio initialization on first user interaction
     */
    setupAudioInitialization() {
        const initAudio = () => {
            if (this.audioInitialized) return;

            // Play and immediately pause all sounds to unlock audio
            Object.values(this.sounds).forEach(sound => {
                sound.volume = 0.01;
                sound.play().then(() => {
                    sound.pause();
                    sound.currentTime = 0;
                    sound.volume = 1.0;
                }).catch(() => {
                    // Ignore errors during initialization
                });
            });

            this.audioInitialized = true;
            console.log('Audio initialized');

            // Remove listeners after initialization
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
            document.removeEventListener('touchstart', initAudio);
        };

        // Listen for any user interaction
        document.addEventListener('click', initAudio, { once: false });
        document.addEventListener('keydown', initAudio, { once: false });
        document.addEventListener('touchstart', initAudio, { once: false });
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

            // Store the last interim transcript for push-to-talk mode
            if (interimTranscript) {
                this.lastInterimTranscript = interimTranscript;
            }

            // For wake-word mode: start/reset silence timer only on meaningful speech
            if (this.currentMode === 'wake-word') {
                // Only reset timer if we have actual content (not empty/whitespace)
                const hasContent = (completeTranscript && completeTranscript.trim()) ||
                                   (interimTranscript && interimTranscript.trim());

                if (hasContent) {
                    this.clearSilenceTimer();
                    this.silenceTimer = setTimeout(() => {
                        this.stopListening();
                    }, this.silenceTimeout);
                }
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

            // Determine what to send
            let transcriptToSend = this.accumulatedTranscript.trim();

            // In push-to-talk mode, if we have no final transcript but have interim, use that
            if (!transcriptToSend && this.lastInterimTranscript && this.currentMode === 'push-to-talk') {
                transcriptToSend = this.lastInterimTranscript.trim();
                console.log('Using interim transcript for push-to-talk:', transcriptToSend);
            }

            // Send transcript if we have one
            if (transcriptToSend && this.onTranscript) {
                this.onTranscript(transcriptToSend);
            }

            // Clear the buffers
            this.accumulatedTranscript = '';
            this.lastInterimTranscript = '';

            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.isRecognitionActive = true;
            // Clear buffers when starting new recording
            this.accumulatedTranscript = '';
            this.lastInterimTranscript = '';
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

        // Stop any currently playing TTS before starting new one
        if (this.isPlaying || this.currentAudio) {
            console.log('Stopping currently playing TTS');
            this.stopSpeaking();
        }

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
     * Speak text using browser TTS (for quick feedback like tool summaries)
     */
    speakText(text) {
        if (!window.speechSynthesis || !text) return;

        // Don't cancel ongoing speech - let it queue naturally
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.speechRate || 1.0;

        // Use selected voice if available
        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }

        console.log('Speaking tool summary:', text);
        window.speechSynthesis.speak(utterance);
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

        // Stop browser TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
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
