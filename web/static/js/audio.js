// Import constants from global constants file
const { 
    SILENCE_TIMEOUT, 
    WAKE_WORD_SILENCE_TIMEOUT,
    RECOGNITION_RESTART_DELAY, 
    AUDIO_INIT_VOLUME,
    SERVER_TRANSCRIPTION,
    STT_ENGINES,
    STT_ENGINE_NAMES,
    DEFAULT_STT_ENGINE 
} = window.CLAUDE_CONSTANTS;

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
        this.silenceTimeout = SILENCE_TIMEOUT;

        // Audio playback for streamed TTS
        this.audioContext = null;  // Only used for future Web Audio features, not TTS
        this.audioChunks = [];
        this.isPlaying = false;
        this.currentAudio = null;  // Track current audio element for stopping
        this.lastAudioBlob = null;  // Save last audio blob for replay
        this.audioGestureInitialized = false;  // Track if user gesture has initialized audio

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

        // Server transcription state
        this.useServerTranscription = SERVER_TRANSCRIPTION.ENABLED;
        this.serverTranscriptionAvailable = false;
        this.audioStreamingActive = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        // STT Engine management
        this.preferredEngine = DEFAULT_STT_ENGINE;
        this.currentEngine = null;
        this.engineAvailability = {
            [STT_ENGINES.SERVER_WHISPER]: false,
            [STT_ENGINES.BROWSER_SPEECH_API]: false
        };
        
        // Browser-side silence detection for wake-word mode
        this.silenceTimer = null;
        this.silenceTimeout = WAKE_WORD_SILENCE_TIMEOUT; // 2 seconds from constants
        this.lastTranscriptionTime = null;
        this.currentInterimTranscript = '';
        this.lastTranscriptText = ''; // Track last text to detect actual changes

        this.setupRecognitionHandlers();
        this.setupAudioInitialization();
        
        // Initialize engine availability
        this.checkEngineAvailability();
    }

    setupAudioInitialization() {
        const initAudio = () => {
            if (this.audioInitialized) return;

            console.log('Initializing audio with user gesture for proper Android/Samsung routing');

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

            // Initialize AudioContext if needed for future features (with proper routing hints)
            if (!this.audioContext) {
                try {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                        latencyHint: 'playback'  // Force Android to use media audio path
                    });
                    
                    // Ensure context is resumed (critical for Samsung devices)
                    if (this.audioContext.state === 'suspended') {
                        this.audioContext.resume();
                    }
                } catch (error) {
                    console.warn('AudioContext initialization failed:', error);
                }
            }

            this.audioInitialized = true;
            this.audioGestureInitialized = true;
            console.log('Audio initialization complete - should route to Bluetooth on Android');

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

    setupRecognitionHandlers() {
        if (!this.recognition) return;

        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            // Build complete transcript from NEW results only (prevents duplicates)
            let completeTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
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
            this.isRecognitionActive = false;

            // Determine what to send
            let transcriptToSend = this.accumulatedTranscript.trim();

            // In push-to-talk mode, if we have no final transcript but have interim, use that
            // But only if we actually received speech input during this session
            if (!transcriptToSend && this.lastInterimTranscript && this.currentMode === 'push-to-talk') {
                transcriptToSend = this.lastInterimTranscript.trim();
                console.log('Using interim transcript for push-to-talk:', transcriptToSend);
            }

            // Send transcript only if we have one and it's from the current session
            if (transcriptToSend && this.onTranscript) {
                console.log('Browser STT sending transcript:', transcriptToSend);
                this.onTranscript(transcriptToSend);
            } else if (!transcriptToSend) {
                console.log('Browser STT: No transcript to send - session ended without speech');
            }

            // Clear the buffers
            this.accumulatedTranscript = '';
            this.lastInterimTranscript = '';

            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.recognition.onstart = () => {
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
            this.recognition.stop();
            // Wait a bit before restarting
            setTimeout(() => {
                this._attemptStart();
            }, 100);
            return true;
        }

        return this._attemptStart();
    }

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

    stopListening() {
        // Clear silence timer
        this.clearSilenceTimer();

        if (this.recognition) {
            this.recognition.stop();
        }
    }

    clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    startTTSStream() {
        // Stop any currently playing TTS before starting new one
        if (this.isPlaying || this.currentAudio) {
            this.stopSpeaking();
        }

        this.audioChunks = [];
        this.isPlaying = false;

        // Note: Removed AudioContext initialization here as TTS playback uses <audio> element
        // This prevents Samsung Android audio routing issues where AudioContext can interfere
        // with proper A2DP Bluetooth routing
    }

    addTTSChunk(audioData) {
        // audioData is base64 encoded audio chunk
        this.audioChunks.push(audioData);
    }

    /**
     * Play the accumulated audio chunks
     * Optimized for Samsung Android Bluetooth A2DP routing
     */
    async playTTSStream(onEnd = null) {
        console.log(`Playing TTS stream (${this.audioChunks.length} chunks)`);

        if (this.audioChunks.length === 0) {
            console.warn('No audio chunks to play');
            if (onEnd) onEnd();
            return;
        }

        // Ensure audio has been initialized with user gesture (critical for Android)
        if (!this.audioGestureInitialized) {
            console.warn('Audio not initialized with user gesture - this may cause routing issues on Android');
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

            // Create audio element and play (using <audio> ensures proper A2DP routing on Samsung)
            const blob = new Blob([bytes], { type: 'audio/wav' });
            this.lastAudioBlob = blob;  // Save for replay
            const audioUrl = URL.createObjectURL(blob);
            
            // Create audio with explicit media classification for Samsung routing
            const audio = new Audio();
            audio.src = audioUrl;  // Set src after creation for better Samsung compatibility
            this.currentAudio = audio;  // Track for stopping

            // Samsung Android specific fixes for Bluetooth A2DP routing
            audio.setAttribute('playsinline', 'true');  // Prevent fullscreen on mobile
            audio.preload = 'auto';  // Ensure browser treats as media
            audio.controls = false;  // Disable controls but keep media classification
            audio.muted = false;  // Explicitly not muted
            audio.volume = 1.0;  // Full volume
            
            // Force the audio element into the DOM temporarily (Samsung routing fix)
            audio.style.display = 'none';
            document.body.appendChild(audio);
            
            console.log('Starting TTS playback via DOM-attached <audio> element for Samsung Bluetooth routing');

            audio.onended = () => {
                console.log('TTS playback finished');
                URL.revokeObjectURL(audioUrl);
                // Remove from DOM after playback
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
                this.isPlaying = false;
                this.currentAudio = null;
                if (onEnd) onEnd();
            };

            audio.onerror = (e) => {
                console.error('Audio playback error:', e);
                URL.revokeObjectURL(audioUrl);
                // Remove from DOM on error
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
                this.isPlaying = false;
                this.currentAudio = null;
                if (onEnd) onEnd();
            };

            this.isPlaying = true;
            
            // Additional Samsung fix: Force a small delay to let DOM attachment complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            await audio.play();

        } catch (error) {
            console.error('Error playing TTS stream:', error);
            this.isPlaying = false;
            if (onEnd) onEnd();
        }
    }

    /**
     * Replay the last TTS audio
     * Optimized for Samsung Android Bluetooth A2DP routing
     */
    async replayLastTTS() {
        if (!this.lastAudioBlob) {
            console.warn('No TTS audio to replay');
            return;
        }

        try {
            // Stop any currently playing audio
            if (this.isPlaying || this.currentAudio) {
                this.stopSpeaking();
            }

            const audioUrl = URL.createObjectURL(this.lastAudioBlob);
            
            // Create audio with explicit media classification for Samsung routing
            const audio = new Audio();
            audio.src = audioUrl;  // Set src after creation for better Samsung compatibility
            this.currentAudio = audio;

            // Samsung Android specific fixes for Bluetooth A2DP routing
            audio.setAttribute('playsinline', 'true');
            audio.preload = 'auto';
            audio.controls = false;
            audio.muted = false;
            audio.volume = 1.0;
            
            // Force the audio element into the DOM temporarily (Samsung routing fix)
            audio.style.display = 'none';
            document.body.appendChild(audio);
            
            console.log('Replaying TTS via DOM-attached <audio> element for Samsung Bluetooth routing');

            audio.onended = () => {
                console.log('TTS replay finished');
                URL.revokeObjectURL(audioUrl);
                // Remove from DOM after playback
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
                this.isPlaying = false;
                this.currentAudio = null;
            };

            audio.onerror = (e) => {
                console.error('Audio replay error:', e);
                URL.revokeObjectURL(audioUrl);
                // Remove from DOM on error
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
                this.isPlaying = false;
                this.currentAudio = null;
            };

            this.isPlaying = true;
            
            // Additional Samsung fix: Force a small delay to let DOM attachment complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            await audio.play();
        } catch (error) {
            console.error('Error replaying TTS:', error);
            this.isPlaying = false;
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
            
            // Remove from DOM if it's attached (Samsung fix cleanup)
            if (this.currentAudio.parentNode) {
                this.currentAudio.parentNode.removeChild(this.currentAudio);
            }
            
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
     * Enable server-side transcription mode
     */
    setServerTranscriptionMode(enabled, available = true) {
        this.useServerTranscription = enabled && available;
        this.serverTranscriptionAvailable = available;
        
        // Update engine availability and reconfigure if needed
        this.engineAvailability[STT_ENGINES.SERVER_WHISPER] = available;
        this.checkEngineAvailability();
        this._updateEngineConfiguration();
        
        console.log(`Server transcription mode: ${this.useServerTranscription ? 'enabled' : 'disabled'}`);
    }

    /**
     * Start server-side audio streaming
     */
    async startServerAudioStreaming(websocket, mode = 'wake-word') {
        if (!this.useServerTranscription || !websocket) {
            console.log('Server transcription not available, using browser STT');
            return false;
        }

        try {
            this.currentServerMode = mode;
            console.log(`Starting server audio streaming in ${mode} mode`);
            
            // Clear any previous transcription state
            this._clearTranscriptionState();
            
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: SERVER_TRANSCRIPTION.PREFERRED_SAMPLE_RATE,
                    channelCount: SERVER_TRANSCRIPTION.PREFERRED_CHANNELS,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });

            // Set up MediaRecorder for audio streaming
            let mimeType = SERVER_TRANSCRIPTION.MIME_TYPE;
            console.log('Trying MediaRecorder with MIME type:', mimeType);
            console.log('MediaRecorder.isTypeSupported:', MediaRecorder.isTypeSupported(mimeType));
            
            // Fallback MIME types if WAV isn't supported
            const fallbackTypes = [
                'audio/wav',
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                '' // Let browser choose
            ];
            
            for (const type of fallbackTypes) {
                if (MediaRecorder.isTypeSupported(type) || type === '') {
                    mimeType = type;
                    console.log('Using MIME type:', mimeType || 'browser default');
                    break;
                }
            }
            
            const options = mimeType ? { mimeType } : {};
            this.mediaRecorder = new MediaRecorder(stream, options);
            
            console.log('MediaRecorder created successfully, state:', this.mediaRecorder.state);

            this.audioChunks = [];
            this.audioStreamingActive = true;

            // Handle audio data - send chunks immediately for both modes for real-time transcription
            this.mediaRecorder.ondataavailable = (event) => {
                console.log(`MediaRecorder data available: ${event.data.size} bytes, type: ${event.data.type}, mode: ${this.currentServerMode}`);
                
                if (event.data.size > 0 && this.audioStreamingActive) {
                    // Send chunks immediately for both PTT and wake-word modes
                    console.log('Converting audio data to base64 and sending to server for real-time transcription');
                    const reader = new FileReader();
                    reader.onload = () => {
                        const audioData = reader.result.split(',')[1]; // Remove data URL prefix
                        console.log(`Sending audio chunk: ${audioData.length} base64 chars`);
                        websocket.sendAudioChunk(audioData);
                    };
                    reader.onerror = (error) => {
                        console.error('FileReader error:', error);
                    };
                    reader.readAsDataURL(event.data);
                } else {
                    console.log(`Skipping audio data: size=${event.data.size}, active=${this.audioStreamingActive}`);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.audioStreamingActive = false;
                stream.getTracks().forEach(track => track.stop());
                console.log(`Server audio streaming stopped for ${this.currentServerMode} mode`);
                
                // For PTT mode, send transcript immediately when button released
                // For wake-word mode, silence detection handles sending
                if (this.currentServerMode === 'push-to-talk') {
                    this._sendFinalTranscript('PTT button released');
                    
                    // Stop the transcription session
                    setTimeout(() => {
                        websocket.stopServerTranscription();
                    }, 500);
                }
                
                // Clear accumulated chunks
                this.audioChunks = [];
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
            };

            this.mediaRecorder.onstart = () => {
                console.log('MediaRecorder started');
            };

            // Start recording with 1-second intervals for real-time transcription
            const chunkInterval = 1000; // Always 1 second for both modes
            console.log('Starting MediaRecorder with 1-second intervals for real-time transcription');
            this.mediaRecorder.start(chunkInterval);
            console.log('MediaRecorder started, state:', this.mediaRecorder.state);
            console.log('Starting server transcription session...');
            websocket.startServerTranscription();
            
            // Start silence detection for wake-word mode
            if (mode === 'wake-word') {
                this._startSilenceDetection(websocket);
            }

            console.log('Server audio streaming started');
            return true;

        } catch (error) {
            console.error('Error starting server audio streaming:', error);
            this.audioStreamingActive = false;
            return false;
        }
    }

    /**
     * Stop server-side audio streaming
     */
    stopServerAudioStreaming(websocket) {
        if (!this.audioStreamingActive) {
            return;
        }

        this.audioStreamingActive = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        // Don't stop transcription session here for any mode
        // Each mode handles stopping in its own way:
        // - PTT: onstop handler stops after sending message  
        // - Wake-word: silence timeout stops after sending message
        // This prevents double-stopping the session

        console.log('Server audio streaming stopped');
    }

    /**
     * Handle server transcription result
     */
    handleServerTranscriptionResult(result, websocket) {
        console.log('Server transcription result:', result);
        
        // Ignore results if audio streaming is no longer active
        if (!this.audioStreamingActive) {
            console.log('Ignoring late transcription result - audio streaming inactive');
            return;
        }
        
        if (result.text.trim()) {
            const newText = result.text.trim();
            
            // Only reset silence timer if we got NEW/DIFFERENT text
            if (newText !== this.lastTranscriptText) {
                console.log('New transcription text detected, starting/resetting silence timer');
                this.lastTranscriptionTime = Date.now();
                this.lastTranscriptText = newText;
                this._resetSilenceTimer(websocket);
            } else {
                console.log('Same transcription text, not resetting timer');
            }
            
            if (result.is_final) {
                // Final result - treat as complete transcript
                console.log('Calling onTranscript with server result:', newText);
                this.currentInterimTranscript = ''; // Clear interim when we get final
                this.lastTranscriptText = ''; // Reset for next session
                if (this.onTranscript) {
                    this.onTranscript(newText);
                }
            } else {
                // Interim result - show in UI for real-time feedback and store for silence timeout
                this.currentInterimTranscript = newText;
                if (this.onInterimTranscript) {
                    this.onInterimTranscript(newText);
                }
            }
        }
    }

    /**
     * Enhanced startListening that supports both browser and server transcription
     */
    startListening(mode = 'push-to-talk', websocket = null) {
        // If server transcription is enabled and available, use that for any mode
        if (this.useServerTranscription && this.serverTranscriptionAvailable && websocket) {
            console.log(`Starting server transcription for mode: ${mode}`);
            return this.startServerAudioStreaming(websocket, mode);
        }

        // Otherwise use browser STT
        console.log(`Using browser STT for mode: ${mode}`);
        return this._startBrowserListening(mode);
    }

    /**
     * Original browser-based listening (renamed)
     */
    _startBrowserListening(mode = 'push-to-talk') {
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
     * Enhanced stopListening that supports both modes
     */
    stopListening(websocket = null) {
        // Stop server audio streaming if active
        if (this.audioStreamingActive) {
            this.stopServerAudioStreaming(websocket);
            return;
        }

        // Stop browser STT
        this.clearSilenceTimer();
        if (this.recognition) {
            this.recognition.stop();
        }
        
        // Clear browser-side silence detection
        this._clearSilenceTimer();
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

    /**
     * Start silence detection for wake-word mode
     */
    _startSilenceDetection(websocket) {
        console.log(`Preparing browser-side silence detection (${this.silenceTimeout}ms) - will start on first transcription`);
        this.lastTranscriptionTime = null; // Don't set time until first transcription
        this.currentInterimTranscript = ''; // Clear any previous interim transcript
        this.lastTranscriptText = ''; // Clear previous text tracker
        // Don't start timer yet - wait for first transcription result
    }
    
    /**
     * Clear transcription state when starting new session
     */
    _clearTranscriptionState() {
        this.lastTranscriptionTime = null;
        this.currentInterimTranscript = '';
        this.lastTranscriptText = '';
        this._clearSilenceTimer();
    }

    /**
     * Reset the silence timer
     */
    _resetSilenceTimer(websocket) {
        this._clearSilenceTimer();
        
        // Only use silence detection for wake-word mode
        if (this.currentServerMode !== 'wake-word') {
            return;
        }
        
        this.silenceTimer = setTimeout(() => {
            const timeSinceLastTranscription = Date.now() - (this.lastTranscriptionTime || Date.now());
            console.log(`Silence timeout triggered. Time since last transcription: ${timeSinceLastTranscription}ms`);
            
            // Only trigger if we have actually received transcription results
            if (this.audioStreamingActive && this.lastTranscriptionTime && timeSinceLastTranscription >= this.silenceTimeout) {
                console.log('Auto-stopping wake-word transcription due to silence');
                this.stopServerAudioStreaming(websocket);
                
                // Send the final transcript using the same method as PTT
                this._sendFinalTranscript('Wake-word silence timeout');
                
                // Stop the transcription session after sending message (like PTT does)
                setTimeout(() => {
                    if (websocket) {
                        websocket.stopServerTranscription();
                    }
                }, 500);
            } else if (!this.lastTranscriptionTime) {
                console.log('Silence timeout ignored - no transcription results received yet');
                // Restart the timer to wait for transcription results
                this._resetSilenceTimer(websocket);
            }
        }, this.silenceTimeout);
        
        console.log(`Silence timer reset: ${this.silenceTimeout}ms`);
    }

    /**
     * Clear the silence timer
     */
    _clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    /**
     * Send the final transcript - shared by both PTT and wake-word modes
     */
    _sendFinalTranscript(reason) {
        const finalTranscript = this.currentInterimTranscript || '';
        console.log(`Sending final transcript (${reason}):`, finalTranscript);
        console.log('Current state:', {
            currentInterimTranscript: this.currentInterimTranscript,
            hasOnTranscript: !!this.onTranscript,
            transcriptLength: finalTranscript.length,
            transcriptTrimmed: finalTranscript.trim(),
            lastTranscriptionTime: this.lastTranscriptionTime
        });
        
        // Only send transcript if we have actual new text AND we've received transcription results in this session
        if (finalTranscript.trim() && this.onTranscript && this.lastTranscriptionTime) {
            // Set accumulated transcript for normal flow compatibility
            this.accumulatedTranscript = finalTranscript.trim();
            console.log('Calling this.onTranscript with result:', finalTranscript.trim());
            this.onTranscript(finalTranscript.trim());
        } else if (!finalTranscript.trim() || !this.lastTranscriptionTime) {
            console.log('No final transcript to send - empty transcript or no transcription activity in this session');
            // For wake-word mode, restart listening if no transcript
            if (this.currentServerMode === 'wake-word' && this.onEnd) {
                this.onEnd();
            }
            // For push-to-talk mode, just stop without sending anything
            console.log('PTT session ended without transcription - not sending previous message');
        } else {
            console.log('No onTranscript callback available');
        }
        
        // Clear the interim transcript buffer after processing
        this.currentInterimTranscript = '';
        this.lastTranscriptText = '';
    }

    /**
     * STT Engine Management Methods
     */

    /**
     * Set preferred STT engine
     * @param {string} engine - Engine ID from STT_ENGINES
     */
    setPreferredEngine(engine) {
        if (Object.values(STT_ENGINES).includes(engine)) {
            this.preferredEngine = engine;
            console.log(`Preferred STT engine set to: ${STT_ENGINE_NAMES[engine]}`);
            this._updateEngineConfiguration();
        } else {
            console.error(`Invalid STT engine: ${engine}`);
        }
    }

    /**
     * Get current preferred STT engine
     */
    getPreferredEngine() {
        return this.preferredEngine;
    }

    /**
     * Get current active STT engine
     */
    getCurrentEngine() {
        return this.currentEngine;
    }

    /**
     * Check and update engine availability
     */
    checkEngineAvailability() {
        // Check browser speech API availability
        const browserSpeechAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        this.engineAvailability[STT_ENGINES.BROWSER_SPEECH_API] = browserSpeechAvailable;
        
        // Server transcription availability is set via setServerTranscriptionMode
        this.engineAvailability[STT_ENGINES.SERVER_WHISPER] = this.serverTranscriptionAvailable;
        
        console.log('Engine availability:', this.engineAvailability);
        return this.engineAvailability;
    }

    /**
     * Get engine availability status
     */
    getEngineAvailability() {
        return { ...this.engineAvailability };
    }

    /**
     * Get engine status for UI display
     * @param {string} engine - Engine ID
     */
    getEngineStatus(engine) {
        const available = this.engineAvailability[engine];
        const isActive = this.currentEngine === engine;
        
        if (isActive) {
            return { status: 'active', text: 'Active', class: 'badge-success' };
        } else if (available) {
            return { status: 'available', text: 'Available', class: 'badge-info' };
        } else {
            return { status: 'unavailable', text: 'Unavailable', class: 'badge-error' };
        }
    }

    /**
     * Force engine selection (for manual override)
     * @param {string} engine - Engine ID to use
     */
    forceEngine(engine) {
        if (!this.engineAvailability[engine]) {
            console.warn(`Cannot force unavailable engine: ${STT_ENGINE_NAMES[engine]}`);
            return false;
        }
        
        this.preferredEngine = engine;
        this._updateEngineConfiguration();
        return true;
    }

    /**
     * Update engine configuration based on preference and availability
     * @private
     */
    _updateEngineConfiguration() {
        const preferred = this.preferredEngine;
        
        // Check if preferred engine is available
        if (this.engineAvailability[preferred]) {
            this.currentEngine = preferred;
            
            // Configure based on selected engine
            if (preferred === STT_ENGINES.SERVER_WHISPER) {
                this.useServerTranscription = true;
            } else if (preferred === STT_ENGINES.BROWSER_SPEECH_API) {
                this.useServerTranscription = false;
            }
            
            console.log(`Using STT engine: ${STT_ENGINE_NAMES[preferred]}`);
        } else {
            // Fallback to any available engine
            const fallbackEngine = this._selectFallbackEngine();
            if (fallbackEngine) {
                this.currentEngine = fallbackEngine;
                
                if (fallbackEngine === STT_ENGINES.SERVER_WHISPER) {
                    this.useServerTranscription = true;
                } else if (fallbackEngine === STT_ENGINES.BROWSER_SPEECH_API) {
                    this.useServerTranscription = false;
                }
                
                console.log(`Preferred engine unavailable, using fallback: ${STT_ENGINE_NAMES[fallbackEngine]}`);
            } else {
                console.error('No STT engines available');
                this.currentEngine = null;
            }
        }
    }

    /**
     * Select best available fallback engine
     * @private
     */
    _selectFallbackEngine() {
        // Prefer server transcription if available
        if (this.engineAvailability[STT_ENGINES.SERVER_WHISPER]) {
            return STT_ENGINES.SERVER_WHISPER;
        }
        
        // Fall back to browser speech API
        if (this.engineAvailability[STT_ENGINES.BROWSER_SPEECH_API]) {
            return STT_ENGINES.BROWSER_SPEECH_API;
        }
        
        return null;
    }
}

// Export for use in other modules
window.AudioManager = AudioManager;
