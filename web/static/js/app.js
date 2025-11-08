import { applyState } from './state-themes.js';

// Import constants from global constants file
const { 
    WAKE_WORD, 
    WAKE_WORD_DISPLAY, 
    READY_MESSAGE, 
    WAKE_WORD_LISTENING_MESSAGE, 
    WAKE_WORD_RESUME_DELAY, 
    WAKE_WORD_RESTART_DELAY,
    STT_ENGINES,
    STT_ENGINE_NAMES,
    DEFAULT_STT_ENGINE 
} = window.CLAUDE_CONSTANTS;

class ClaudeAssistant {
    constructor() {
        // Initialize components (access from window for non-module scripts)
        this.audio = new window.AudioManager();
        this.ui = new window.UIComponents();
        this.ws = null;
        this.sessionId = null;
        this.wakeWord = null;

        // Activation mode state
        this.activationMode = null; // 'push-to-talk', 'click-to-activate', 'wake-word'
        this.isListening = false;
        this.isProcessing = false;

        // Load saved settings from cookies
        this.loadSettings();

        // Check browser compatibility
        this.checkCompatibility();

        // Initialize session
        this.initializeSession();

        // Setup event listeners
        this.setupEventListeners();
        
        // Check server transcription availability (will be set when WebSocket connects)
        this.serverTranscriptionAvailable = false;
        
        // Track if wake word was paused for processing (to prevent Bluetooth interference)
        this.wakeWordWasPausedForProcessing = false;
    }

    /**
     * Load settings from cookies
     */
    loadSettings() {
        // Load wake word setting
        const wakeWordEnabled = this.getCookie('wakeWordEnabled');
        if (wakeWordEnabled !== null) {
            const toggle = document.getElementById('wake-word-toggle');
            if (toggle) {
                toggle.checked = wakeWordEnabled === 'true';
            }
        }
        
        // Load STT engine preference
        const sttEngine = this.getCookie('sttEngine') || DEFAULT_STT_ENGINE;
        this.audio.setPreferredEngine(sttEngine);
        
        // Update UI radio button
        const radioButton = document.getElementById(`stt-${sttEngine}`);
        if (radioButton) {
            radioButton.checked = true;
        }
    }

    /**
     * Get cookie value
     */
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    }

    /**
     * Set cookie value
     */
    setCookie(name, value, days = 365) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }

    checkCompatibility() {
        const compat = window.AudioManager.checkCompatibility();

        if (!compat.supported) {
            this.ui.showBrowserWarning(compat.issues);
        }
    }

    async initializeSession() {
        try {
            // Set connecting state to disable audio input during initialization
            applyState('connecting');
            this.ui.setStatus('Creating session...');
            
            // Create session via API
            const workingDir = document.getElementById('working-directory').value;

            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    working_directory: workingDir
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create session');
            }

            const sessionData = await response.json();
            this.sessionId = sessionData.session_id;

            console.log('Session created:', this.sessionId);

            // Update status and connect WebSocket
            this.ui.setStatus('Connecting to server...');
            this.connectWebSocket();

        } catch (error) {
            console.error('Error initializing session:', error);
            this.ui.setStatus('Failed to initialize session', 'error');
            applyState('idle'); // Exit connecting state on error
        }
    }

    /**
     * Connect WebSocket
     */
    connectWebSocket() {
        this.ws = new window.WebSocketClient(this.sessionId);

        // Setup WebSocket callbacks
        this.ws.onConnect = () => {
            console.log('Connected to WebSocket');
            this.ui.setConnectionStatus('connected');
            
            // Reset client state to idle on successful connection
            this.isProcessing = false;
            this.isListening = false;
            
            // Clear any UI states that might be stuck
            const btn = document.getElementById('btn-push-to-talk');
            if (btn) {
                btn.classList.remove('btn-active');
            }
            
            // Return to idle state
            applyState('idle');
            this.ui.setStatus(READY_MESSAGE);

            // Check server transcription availability
            this.checkServerTranscriptionAvailability();
            
            // Update STT engine status indicators
            this.updateSTTEngineStatus();

            // Start wake word mode if checkbox is checked
            const wakeWordToggle = document.getElementById('wake-word-toggle');
            if (wakeWordToggle && wakeWordToggle.checked) {
                this.startWakeWord();
            }
        };

        this.ws.onDisconnect = () => {
            console.log('Disconnected from WebSocket');
            this.ui.setConnectionStatus('disconnected');
            
            // Reset states on disconnect
            this.isProcessing = false;
            this.isListening = false;
            
            // Stop wake word if running
            if (this.wakeWord && this.wakeWord.getIsListening()) {
                this.wakeWord.stopListening();
            }
            
            // Clear any UI states
            const btn = document.getElementById('btn-push-to-talk');
            if (btn) {
                btn.classList.remove('btn-active');
            }
            
            applyState('idle');
            this.ui.setStatus('Connection lost - attempting to reconnect...', 'error');
        };

        this.ws.onSessionInvalid = async () => {
            console.log('Session invalid - creating new session');
            this.ui.setStatus('Server restarted - creating new session...', 'warning');
            await this.createNewSession();
        };

        this.ws.onReconnectAttempt = (attempt, maxAttempts, delay) => {
            this.ui.setStatus(`Reconnecting... (${attempt}/${maxAttempts}) - retry in ${Math.round(delay/1000)}s`, 'warning');
        };

        this.ws.onReconnectFailed = () => {
            this.ui.setStatus('Connection failed after multiple attempts. Refresh page to retry.', 'error');
        };

        this.ws.onSessionInfo = (info) => {
            console.log('Session info received:', info);
            this.ui.setSessionId(info.session_id);
        };

        this.ws.onAssistantMessage = (content, toolCalls) => {
            this.ui.addAssistantMessage(content, toolCalls);
            // TTS will be handled by separate TTS callbacks
        };

        // Track tool indicators for updates
        this.toolIndicators = new Map();

        this.ws.onToolUse = (toolName, toolInput, summary) => {
            const indicatorEl = this.ui.addToolUseIndicator(toolName, summary, toolInput);

            // Store indicator for potential updates
            const toolKey = `${toolName}_${Date.now()}`;
            this.toolIndicators.set(toolKey, indicatorEl);

            this.audio.playSound('tool');
        };

        // Handle tool summary updates (no TTS for tools)
        this.ws.onToolSummaryUpdate = (toolName, toolInput, betterSummary) => {
            console.log('Tool summary update:', toolName, betterSummary);

            // Find the most recent indicator for this tool
            const indicators = Array.from(this.toolIndicators.entries())
                .filter(([key]) => key.startsWith(toolName))
                .sort(([a], [b]) => b.split('_')[1] - a.split('_')[1]);

            if (indicators.length > 0) {
                const [, indicatorEl] = indicators[0];
                this.ui.updateToolSummary(indicatorEl, betterSummary);
            }
        };

        // Handle text content blocks (like "Sure, I'll help you...")
        this.ws.onTextBlock = (content) => {
            console.log('Text block:', content);

            // Mark as intermediate (more content may be coming)
            this.speakingToolSummary = true;

            // Display as an assistant message
            this.ui.addAssistantMessage(content);
            // TTS is handled by server via stream_tts_audio
        };

        // Handle mark_final message (indicates the last text block was final)
        this.ws.onMarkFinal = () => {
            console.log('Current response marked as final');
            // This will make the TTS end handler return to idle/sleep
            this.speakingToolSummary = false;
        };

        this.ws.onProcessing = (status) => {

            if (status === 'thinking') {
                this.ui.setStatus('Claude is thinking...', 'processing');
                this.isProcessing = true;
                
                // Pause wake word detection to prevent microphone interference with Bluetooth audio
                this.pauseWakeWordForProcessing();
            } else if (status === 'complete') {
                this.ui.setStatus('Response complete');
            }
        };

        this.ws.onError = (errorMessage) => {
            console.error('WebSocket error:', errorMessage);
            this.ui.setStatus(`Error: ${errorMessage}`, 'error');
            this.isProcessing = false;
            
            // Resume wake word detection on error
            this.resumeWakeWordAfterProcessing();
        };

        // TTS streaming callbacks
        // Track if we're in the middle of speaking tool summaries
        this.speakingToolSummary = false;

        this.ws.onTTSStart = (text) => {
            console.log('TTS stream starting - exiting thinking mode, ensuring wake word paused for Bluetooth audio');
            // Exit thinking mode and enter speaking mode
            applyState('speaking');
            
            // Ensure wake word is paused during TTS to prevent microphone interference
            this.pauseWakeWordForProcessing();
            
            this.audio.startTTSStream();
        };

        this.ws.onTTSAudio = (audioData) => {
            this.audio.addTTSChunk(audioData);
        };

        this.ws.onTTSEnd = () => {
            console.log('TTS stream complete, playing audio');
            this.audio.playTTSStream(() => {
                console.log('Finished speaking');

                // Only play sleep sound and reset state if this was the final response
                // (not a tool summary)
                if (!this.speakingToolSummary) {
                    applyState('idle');
                    this.ui.setStatus(READY_MESSAGE);
                    this.isProcessing = false;

                    // Play sleep sound to indicate returning to idle state
                    this.audio.playSound('sleep');
                    
                    // Resume wake word detection now that TTS is complete
                    this.resumeWakeWordAfterProcessing();
                } else {
                    // Reset flag for next TTS and return to processing state
                    // (Claude is still working on the full response)
                    this.speakingToolSummary = false;
                    applyState('processing');
                    
                    // Keep wake word paused since we're still processing
                }
            });
        };

        // Server transcription handlers
        this.ws.onServerTranscriptionResult = (result) => {
            console.log('Server transcription result received:', result);
            this.audio.handleServerTranscriptionResult(result, this.ws);
        };

        this.ws.onTranscriptionStatus = (status) => {
            console.log('Server transcription status:', status);
            this.serverTranscriptionAvailable = status.available;
            this.audio.setServerTranscriptionMode(true, status.available);
            
            // Update STT engine status indicators
            this.updateSTTEngineStatus();
        };

        this.ws.onServerTranscriptionStarted = (sessionId) => {
            console.log('Server transcription started:', sessionId);
        };

        this.ws.onServerTranscriptionStopped = () => {
            console.log('Server transcription stopped');
        };

        this.ws.onTranscriptionUnavailable = (fallback) => {
            console.log('Server transcription unavailable, using fallback:', fallback);
            this.serverTranscriptionAvailable = false;
            this.audio.setServerTranscriptionMode(false, false);
        };

        // Connect
        this.ws.connect();
    }

    canStartListening() {
        const currentState = document.body.getAttribute('data-state');
        return currentState !== 'processing' && currentState !== 'connecting';
    }

    setupEventListeners() {
        // Audio callbacks
        this.audio.onTranscript = (transcript) => {
            this.handleTranscript(transcript);
        };

        this.audio.onInterimTranscript = (transcript) => {
            // Show interim transcript in a user message bubble
            this.ui.updateInterimUserMessage(transcript);
        };

        this.audio.onError = (error) => {
            console.error('Speech recognition error:', error);
            this.ui.setStatus(`Speech error: ${error}`, 'error');
            this.ui.clearInterimUserMessage();
            this.stopListening();
        };

        this.audio.onEnd = () => {

            // Only auto-stop for wake-word mode, not push-to-talk
            // In push-to-talk, user controls when to stop by releasing button
            if (this.activationMode === 'wake-word') {
                this.stopListening();

                // DON'T restart wake word immediately - let the processing pause/resume logic handle it
                // This prevents microphone interference with Bluetooth audio during TTS playback
                console.log('Speech recognition ended - wake word will be resumed after processing is complete');
            }
        };

        // Spacebar push-to-talk and ESC to stop
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // ESC to stop any current process
            if (e.code === 'Escape') {
                e.preventDefault();
                this.stopAllProcesses();
                return;
            }

            // Spacebar for push-to-talk
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();

                if (!this.canStartListening()) {
                    return;
                }

                // Allow interrupting TTS by stopping speech
                if (this.isProcessing) {
                    this.audio.stopSpeaking();
                    this.isProcessing = false;
                }

                this.setActivationMode('push-to-talk');
                this.startListening();
            }
        });

        document.addEventListener('keyup', (e) => {
            // Ignore if typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Spacebar release
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.activationMode === 'push-to-talk' && this.isListening) {
                    this.stopListening();
                }
            }
        });

        // Push-to-talk button setup
        const pttBtn = document.getElementById('btn-push-to-talk');

        // Prevent context menu on long press
        pttBtn.addEventListener('contextmenu', (e) => e.preventDefault());

        // Handler for starting push-to-talk (mouse/touch)
        const startPTT = (e) => {
            e.preventDefault();

            if (!this.canStartListening()) {
                return;
            }

            if (this.isProcessing) {
                this.audio.stopSpeaking();
                this.isProcessing = false;
            }
            this.setActivationMode('push-to-talk');
            this.startListening();
        };

        // Handler for stopping push-to-talk (mouse/touch)
        const stopPTT = (e) => {
            if (this.activationMode === 'push-to-talk') {
                this.stopListening();
            }
        };

        // Attach both mouse and touch events
        ['mousedown', 'touchstart'].forEach(evt => pttBtn.addEventListener(evt, startPTT));
        ['mouseup', 'touchend'].forEach(evt => pttBtn.addEventListener(evt, stopPTT));

        document.getElementById('wake-word-toggle').addEventListener('change', (e) => {
            // Save setting to cookie
            this.setCookie('wakeWordEnabled', e.target.checked.toString());
            
            if (e.target.checked) {
                // Start wake word mode
                this.startWakeWord();
            } else {
                // Stop wake word mode
                this.stopWakeWord();
            }
        });

        // STT Engine selection
        document.querySelectorAll('input[name="stt-engine"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const selectedEngine = e.target.value;
                    console.log(`STT engine changed to: ${selectedEngine}`);
                    
                    // Save setting to cookie
                    this.setCookie('sttEngine', selectedEngine);
                    
                    // Update audio manager
                    this.audio.setPreferredEngine(selectedEngine);
                    
                    // Update status indicators
                    this.updateSTTEngineStatus();
                    
                    // Update status message
                    const engineName = STT_ENGINE_NAMES[selectedEngine];
                    this.ui.setStatus(`Speech engine switched to: ${engineName}`);
                }
            });
        });

        // Settings
        document.getElementById('enable-sounds').addEventListener('change', (e) => {
            this.audio.setSoundsEnabled(e.target.checked);
        });

        document.getElementById('btn-new-session').addEventListener('click', () => {
            this.createNewSession();
        });

        document.getElementById('btn-clear-conversation').addEventListener('click', () => {
            this.ui.clearConversation();
        });

        // Git operations
        document.getElementById('working-directory').addEventListener('blur', () => {
            this.checkGitStatus();
        });

        document.getElementById('btn-init-git').addEventListener('click', async () => {
            await this.initializeGit();
        });

        // Check git status on initial load
        this.checkGitStatus();

        // Stop button
        document.getElementById('btn-stop').addEventListener('click', () => {
            this.stopAllProcesses();
        });
    }

    /**
     * Set activation mode
     */
    setActivationMode(mode) {
        this.activationMode = mode;

        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (mode === 'push-to-talk') {
            document.getElementById('btn-push-to-talk').classList.add('active');
        }
        // Wake word mode is handled by the checkbox state
    }

    /**
     * Update push-to-talk button visual state based on VAD detection
     */
    updatePushToTalkButtonVadState(vadState) {
        const pttBtn = document.getElementById('btn-push-to-talk');
        if (!pttBtn) return;

        // VAD State Update logging disabled for cleaner console output

        // Only apply VAD glow when wake word detection is active but we're not actively listening for commands
        if (vadState.vadFired && !this.isListening) {
            pttBtn.classList.add('vad-active');
            console.log('🎤 VAD: Speech detected - adding white glow');
        } else {
            pttBtn.classList.remove('vad-active');
            if (vadState.vadFired && this.isListening) {
                console.log('🎤 VAD: Speech detected but already listening - no glow');
            }
        }
    }

    /**
     * Start listening for speech with state integration
     */
    startListening() {
        if (this.isListening) return;

        // Temporarily pause wake word detection if it's running
        if (this.wakeWord && this.wakeWord.getIsListening()) {
            this.wakeWord.stopListening();
        }

        const success = this.audio.startListening(this.activationMode, this.ws);
        if (success) {
            this.isListening = true;
            applyState('listening');
            this.ui.setStatus('Listening... speak now');

            // Play wake sound for audio feedback
            this.audio.playSound('wake');

            // Update mode button
            if (this.activationMode === 'push-to-talk') {
                const btn = document.getElementById('btn-push-to-talk');
                btn.classList.add('btn-active');
            }
        }
    }

    /**
     * Stop listening with state integration
     */
    stopListening() {
        if (!this.isListening) return;

        this.audio.stopListening(this.ws);
        this.isListening = false;

        // Update mode button
        const btn = document.getElementById('btn-push-to-talk');
        if (btn) {
            btn.classList.remove('btn-active');
        }

        if (!this.isProcessing) {
            applyState('idle');
            this.ui.setStatus(READY_MESSAGE);
        }

        // Resume wake word detection if wake word toggle is checked
        const wakeWordToggle = document.getElementById('wake-word-toggle');
        if (wakeWordToggle && wakeWordToggle.checked && this.wakeWord && !this.wakeWord.getIsListening()) {
            setTimeout(() => {
                this.wakeWord.startListening();
            }, WAKE_WORD_RESUME_DELAY);
        }
    }

    /**
     * Handle speech transcript
     */
    handleTranscript(transcript) {

        // Stop listening
        this.stopListening();

        // Add user message to UI (this will handle interim message finalization)
        this.ui.addUserMessage(transcript);

        // Send to WebSocket
        if (this.ws && this.ws.isConnected()) {
            // Enter processing state (vibrant violet) - disables push-to-talk and wake-word
            applyState('processing');
            this.isProcessing = true;
            this.ws.sendUserMessage(transcript);
        } else {
            this.ui.setStatus('Not connected to server', 'error');
        }
    }

    /**
     * Stop all current processes and return to idle state
     * State-based implementation
     */
    stopAllProcesses() {
        const currentState = document.body.getAttribute('data-state');
        console.log(`Stopping all processes (current state: ${currentState})...`);

        // Clear any interim user message
        this.ui.clearInterimUserMessage();

        // State-based stop logic
        switch (currentState) {
            case 'listening':
                // Stop speech recognition
                if (this.isListening) {
                    this.audio.stopListening();
                    this.isListening = false;
                    const btn = document.getElementById('btn-push-to-talk');
                    if (btn) btn.classList.remove('btn-active');
                }
                break;

            case 'processing':
                // Interrupt backend and stop any pending TTS
                if (this.ws && this.ws.isConnected()) {
                    this.ws.sendInterrupt('user_stopped');
                }
                this.audio.stopSpeaking();
                this.isProcessing = false;
                break;

            case 'speaking':
                // Stop TTS playback
                this.audio.stopSpeaking();
                this.isProcessing = false;
                break;
        }

        // Return to idle state or wake word mode
        if (this.activationMode === 'wake-word' && this.wakeWord) {
            // Restart wake word listening
            this.wakeWord.stopListening();
            setTimeout(() => {
                this.wakeWord.startListening();
                this.ui.setStatus(WAKE_WORD_LISTENING_MESSAGE());
            }, WAKE_WORD_RESUME_DELAY);
            applyState('idle');
        } else {
            // Clear activation mode and return to idle
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.remove('active', 'listening');
            });
            this.activationMode = null;
            applyState('idle');
            this.ui.setStatus(READY_MESSAGE);
        }
        
        // Resume wake word if it was paused for processing
        this.resumeWakeWordAfterProcessing();

        // Play sleep sound
        this.audio.playSound('sleep');
    }

    /**
     * Check server transcription availability
     */
    checkServerTranscriptionAvailability() {
        if (this.ws && this.ws.isConnected()) {
            this.ws.getTranscriptionStatus();
        }
    }

    /**
     * Create new session
     */
    async createNewSession() {
        // Disconnect current WebSocket
        if (this.ws) {
            this.ws.disconnect();
        }

        // Clear UI
        this.ui.clearConversation();
        this.ui.setStatus('Creating new session...');

        // Initialize new session
        await this.initializeSession();
    }



    /**
     * Start wake word detection
     */
    async startWakeWord() {
        this.setActivationMode('wake-word');

        // Initialize wake word manager if not already done
        if (!this.wakeWord) {
            this.wakeWord = new window.WakeWordManager();

            // Set up callbacks
            this.wakeWord.onWakeWordDetected = (data) => {
                console.log('Wake word detected!', data);
                this.audio.playSound('wakeWord');
                this.ui.setStatus(`Wake word "${data.wakeWord}" detected! Listening for command...`);

                // Temporarily stop wake word listening
                this.wakeWord.stopListening();

                // Set mode to wake-word and start listening for the command
                this.setActivationMode('wake-word');
                this.startListening();
            };

            this.wakeWord.onError = (error) => {
                console.error('Wake word error:', error);
                this.ui.setStatus(`Wake word error: ${error}`, 'error');
            };
            
            // Set up VAD callback for visual feedback
            this.wakeWord.onVadStateChanged = (vadState) => {
                this.updatePushToTalkButtonVadState(vadState);
            };

            this.wakeWord.onReady = (data) => {
                console.log('Wake word ready:', data);
                this.ui.setStatus(`Listening for wake word: "${data.wakeWord}"`);
            };

            this.wakeWord.onStatusChange = (data) => {
                console.log('Wake word status change:', data);
                this.ui.setStatus(data.message);
            };

            await this.wakeWord.initialize(WAKE_WORD);
        }

        // Start listening for wake word
        this.wakeWord.startListening();
        this.ui.setStatus(WAKE_WORD_LISTENING_MESSAGE());
    }

    /**
     * Stop wake word detection
     */
    stopWakeWord() {
        if (this.wakeWord) {
            this.wakeWord.stopListening();
        }

        // Clear VAD visual state
        const pttBtn = document.getElementById('btn-push-to-talk');
        if (pttBtn) {
            pttBtn.classList.remove('vad-active');
        }

        this.activationMode = null;
        this.ui.setStatus('Wake word detection stopped');

        // Play sleep sound
        this.audio.playSound('sleep');
    }

    /**
     * Check git status for current working directory
     */
    async checkGitStatus() {
        const workingDir = document.getElementById('working-directory').value;

        // Show loading state
        document.getElementById('git-status-loading').classList.remove('hidden');
        document.getElementById('git-status-loading').classList.add('flex');
        document.getElementById('git-status-initialized').classList.add('hidden');
        document.getElementById('git-status-not-initialized').classList.add('hidden');
        document.getElementById('git-status-error').classList.add('hidden');

        try {
            const response = await fetch(`/api/git/status?path=${encodeURIComponent(workingDir)}`);
            const data = await response.json();

            // Hide loading
            document.getElementById('git-status-loading').classList.add('hidden');
            document.getElementById('git-status-loading').classList.remove('flex');

            if (response.ok) {
                if (data.initialized) {
                    // Git initialized
                    document.getElementById('git-status-initialized').classList.remove('hidden');
                    document.getElementById('git-status-initialized').classList.add('flex');
                } else {
                    // Not initialized
                    document.getElementById('git-status-not-initialized').classList.remove('hidden');
                    document.getElementById('git-status-not-initialized').classList.add('flex');
                }
            } else {
                // Error
                document.getElementById('git-status-error').classList.remove('hidden');
                document.getElementById('git-status-error').classList.add('flex');
                document.getElementById('git-status-error-message').textContent = data.detail || 'Error checking git status';
            }
        } catch (error) {
            console.error('Error checking git status:', error);
            document.getElementById('git-status-loading').classList.add('hidden');
            document.getElementById('git-status-error').classList.remove('hidden');
            document.getElementById('git-status-error').classList.add('flex');
            document.getElementById('git-status-error-message').textContent = 'Failed to check git status';
        }
    }

    /**
     * Initialize git repository
     */
    async initializeGit() {
        const workingDir = document.getElementById('working-directory').value;
        const button = document.getElementById('btn-init-git');

        // Disable button
        button.disabled = true;
        button.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Initializing...';

        try {
            const response = await fetch('/api/git/init', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: workingDir
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success - refresh git status
                await this.checkGitStatus();
                this.ui.setStatus('Git repository initialized successfully', 'success');
            } else {
                // Error
                document.getElementById('git-status-error').classList.remove('hidden');
                document.getElementById('git-status-error').classList.add('flex');
                document.getElementById('git-status-error-message').textContent = data.message || 'Failed to initialize git';
                button.disabled = false;
                button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg> Initialize Git Repository';
            }
        } catch (error) {
            console.error('Error initializing git:', error);
            document.getElementById('git-status-error').classList.remove('hidden');
            document.getElementById('git-status-error').classList.add('flex');
            document.getElementById('git-status-error-message').textContent = 'Failed to initialize git repository';
            button.disabled = false;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg> Initialize Git Repository';
        }
    }

    /**
     * Update STT engine status indicators
     */
    updateSTTEngineStatus() {
        // Update Server Whisper status
        const serverStatus = this.audio.getEngineStatus(STT_ENGINES.SERVER_WHISPER);
        const serverStatusEl = document.getElementById('server-whisper-status');
        if (serverStatusEl) {
            serverStatusEl.textContent = serverStatus.text;
            serverStatusEl.className = `badge badge-xs ${serverStatus.class}`;
        }

        // Update Browser Speech API status
        const browserStatus = this.audio.getEngineStatus(STT_ENGINES.BROWSER_SPEECH_API);
        const browserStatusEl = document.getElementById('browser-speech-api-status');
        if (browserStatusEl) {
            browserStatusEl.textContent = browserStatus.text;
            browserStatusEl.className = `badge badge-xs ${browserStatus.class}`;
        }

        // Update radio button selection based on current engine
        const currentEngine = this.audio.getCurrentEngine();
        if (currentEngine) {
            const radioButton = document.getElementById(`stt-${currentEngine}`);
            if (radioButton) {
                radioButton.checked = true;
            }
        }

        console.log('STT Engine Status Updated:', {
            current: this.audio.getCurrentEngine(),
            preferred: this.audio.getPreferredEngine(),
            availability: this.audio.getEngineAvailability()
        });
    }

    /**
     * Pause wake word detection during processing to prevent microphone interference with Bluetooth audio
     */
    pauseWakeWordForProcessing() {
        // If wake word mode is active, mark it as paused for processing
        const wakeWordToggle = document.getElementById('wake-word-toggle');
        if (wakeWordToggle && wakeWordToggle.checked) {
            console.log('Marking wake word as paused for processing to prevent Bluetooth audio interference');
            
            // Stop if currently listening
            if (this.wakeWord && this.wakeWord.getIsListening()) {
                this.wakeWord.stopListening();
            }
            
            this.wakeWordWasPausedForProcessing = true;
        }
    }

    /**
     * Resume wake word detection after processing is complete
     */
    resumeWakeWordAfterProcessing() {
        // Only resume if wake word was actually paused for processing and wake word mode is still enabled
        const wakeWordToggle = document.getElementById('wake-word-toggle');
        if (this.wakeWordWasPausedForProcessing && 
            wakeWordToggle && 
            wakeWordToggle.checked && 
            this.wakeWord && 
            !this.wakeWord.getIsListening()) {
            
            console.log('Resuming wake word detection after processing complete');
            setTimeout(() => {
                if (this.wakeWord) {
                    this.wakeWord.startListening();
                    this.ui.setStatus(WAKE_WORD_LISTENING_MESSAGE());
                }
                this.wakeWordWasPausedForProcessing = false;
            }, WAKE_WORD_RESUME_DELAY);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Claude Assistant...');
    const app = new ClaudeAssistant();
    window.app = app; // For debugging
});
