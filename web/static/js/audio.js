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
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
        }

        // Track recognition state
        this.isRecognitionActive = false;

        // Speech Synthesis (TTS)
        this.synthesis = window.speechSynthesis;
        this.voices = [];
        this.selectedVoice = null;
        this.speechRate = 1.3;

        // Load voices
        this.loadVoices();

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
     * Load available TTS voices
     */
    loadVoices() {
        const loadVoicesImpl = () => {
            this.voices = this.synthesis.getVoices();

            // Prefer English voices
            const enVoices = this.voices.filter(v => v.lang.startsWith('en'));
            if (enVoices.length > 0) {
                // Try to find a good default voice
                this.selectedVoice = enVoices.find(v => v.name.includes('Google')) ||
                                    enVoices.find(v => v.name.includes('Microsoft')) ||
                                    enVoices[0];
            } else {
                this.selectedVoice = this.voices[0];
            }

            console.log(`Loaded ${this.voices.length} voices`);
        };

        // Load voices immediately
        loadVoicesImpl();

        // Also load when they become available (some browsers need this)
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = loadVoicesImpl;
        }
    }

    /**
     * Get list of available voices
     */
    getVoices() {
        return this.voices;
    }

    /**
     * Set selected voice
     */
    setVoice(voiceName) {
        const voice = this.voices.find(v => v.name === voiceName);
        if (voice) {
            this.selectedVoice = voice;
            console.log('Selected voice:', voice.name);
        }
    }

    /**
     * Set speech rate
     */
    setSpeechRate(rate) {
        this.speechRate = rate;
    }

    /**
     * Setup speech recognition event handlers
     */
    setupRecognitionHandlers() {
        if (!this.recognition) return;

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript && this.onTranscript) {
                this.onTranscript(finalTranscript);
            } else if (interimTranscript && this.onInterimTranscript) {
                this.onInterimTranscript(interimTranscript);
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
            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.isRecognitionActive = true;
        };
    }

    /**
     * Start listening for speech
     */
    startListening() {
        if (!this.recognition) {
            console.error('Speech recognition not available');
            return false;
        }

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
        if (this.recognition) {
            this.recognition.stop();
        }
    }

    /**
     * Speak text using TTS
     */
    speak(text, onEnd = null) {
        if (!this.synthesis) {
            console.error('Speech synthesis not available');
            return;
        }

        // Cancel any ongoing speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.speechRate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }

        if (onEnd) {
            utterance.onend = onEnd;
        }

        this.synthesis.speak(utterance);
    }

    /**
     * Stop speaking
     */
    stopSpeaking() {
        if (this.synthesis) {
            this.synthesis.cancel();
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
