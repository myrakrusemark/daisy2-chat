/**
 * Main application logic - Orchestrates audio, WebSocket, and UI
 */

class ClaudeAssistant {
    constructor() {
        // Initialize components
        this.audio = new AudioManager();
        this.ui = new UIComponents();
        this.ws = null;
        this.sessionId = null;
        this.wakeWord = null;

        // Activation mode state
        this.activationMode = null; // 'push-to-talk', 'click-to-activate', 'wake-word'
        this.isListening = false;
        this.isProcessing = false;

        // Check browser compatibility
        this.checkCompatibility();

        // Initialize session
        this.initializeSession();

        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Check browser compatibility
     */
    checkCompatibility() {
        const compat = AudioManager.checkCompatibility();

        if (!compat.supported) {
            this.ui.showBrowserWarning(compat.issues);
        } else {
            console.log(`Browser: ${compat.browser} - Full support detected`);
        }
    }

    /**
     * Initialize session
     */
    async initializeSession() {
        try {
            // Create session via API
            const workingDir = document.getElementById('working-directory').value;
            const toolProfile = document.getElementById('tool-profile').value;
            const permissionMode = document.getElementById('permission-mode').value;

            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    working_directory: workingDir,
                    tool_profile: toolProfile,
                    permission_mode: permissionMode
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create session');
            }

            const sessionData = await response.json();
            this.sessionId = sessionData.session_id;

            console.log('Session created:', this.sessionId);

            // Connect WebSocket
            this.connectWebSocket();

        } catch (error) {
            console.error('Error initializing session:', error);
            this.ui.setStatus('Failed to initialize session', 'error');
        }
    }

    /**
     * Connect WebSocket
     */
    connectWebSocket() {
        this.ws = new WebSocketClient(this.sessionId);

        // Setup WebSocket callbacks
        this.ws.onConnect = () => {
            console.log('Connected to WebSocket');
            this.ui.setConnectionStatus('connected');
            this.ui.setStatus('Ready to assist');
        };

        this.ws.onDisconnect = () => {
            console.log('Disconnected from WebSocket');
            this.ui.setConnectionStatus('disconnected');
            this.ui.setStatus('Disconnected - attempting to reconnect...', 'error');
        };

        this.ws.onSessionInfo = (info) => {
            console.log('Session info received:', info);
            this.ui.setSessionId(info.session_id);
        };

        this.ws.onAssistantMessage = (content, toolCalls) => {
            console.log('Assistant message received:', content);
            console.log('Tool calls:', toolCalls);
            this.ui.addAssistantMessage(content, toolCalls);
            // TTS will be handled by separate TTS callbacks
        };

        this.ws.onToolUse = (toolName, toolInput, summary) => {
            console.log('Tool use:', toolName, summary);
            this.ui.addToolUseIndicator(toolName, summary);
            this.audio.playSound('tool');
        };

        this.ws.onProcessing = (status) => {
            console.log('Processing status:', status);

            if (status === 'thinking') {
                this.ui.setStatus('Claude is thinking...', 'processing');
                this.isProcessing = true;
            } else if (status === 'complete') {
                this.ui.setStatus('Response complete');
            }
        };

        this.ws.onError = (errorMessage) => {
            console.error('WebSocket error:', errorMessage);
            this.ui.setStatus(`Error: ${errorMessage}`, 'error');
            this.isProcessing = false;
        };

        // TTS streaming callbacks
        this.ws.onTTSStart = (text) => {
            console.log('TTS stream starting');
            this.audio.startTTSStream();
        };

        this.ws.onTTSAudio = (audioData) => {
            this.audio.addTTSChunk(audioData);
        };

        this.ws.onTTSEnd = () => {
            console.log('TTS stream complete, playing audio');
            this.audio.playTTSStream(() => {
                console.log('Finished speaking');
                this.ui.setStatus('Ready to assist');
                this.isProcessing = false;

                // Play sleep sound to indicate returning to idle state
                this.audio.playSound('sleep');
            });
        };

        // Connect
        this.ws.connect();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Audio callbacks
        this.audio.onTranscript = (transcript) => {
            this.handleTranscript(transcript);
        };

        this.audio.onInterimTranscript = (transcript) => {
            this.ui.setStatus(`Listening: "${transcript}"`);
        };

        this.audio.onError = (error) => {
            console.error('Speech recognition error:', error);
            this.ui.setStatus(`Speech error: ${error}`, 'error');
            this.stopListening();
        };

        this.audio.onEnd = () => {
            this.stopListening();

            // If in wake word mode, restart wake word listening after command completes
            if (this.activationMode === 'wake-word' && this.wakeWord) {
                setTimeout(() => {
                    this.wakeWord.startListening();
                    this.ui.setStatus('Listening for wake word: "computer"');
                }, 1000);
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

        // Activation mode buttons
        document.getElementById('btn-push-to-talk').addEventListener('mousedown', () => {
            // Allow interrupting TTS by stopping speech
            if (this.isProcessing) {
                this.audio.stopSpeaking();
                this.isProcessing = false;
            }
            this.setActivationMode('push-to-talk');
            this.startListening();
        });

        document.getElementById('btn-push-to-talk').addEventListener('mouseup', () => {
            if (this.activationMode === 'push-to-talk') {
                this.stopListening();
            }
        });

        document.getElementById('btn-wake-word').addEventListener('click', () => {
            if (this.activationMode === 'wake-word') {
                // Stop wake word mode
                this.stopWakeWord();
            } else {
                // Start wake word mode
                this.startWakeWord();
            }
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
        } else if (mode === 'wake-word') {
            document.getElementById('btn-wake-word').classList.add('active');
        }
    }

    /**
     * Start listening for speech
     */
    startListening() {
        if (this.isListening) return;

        const success = this.audio.startListening(this.activationMode);
        if (success) {
            this.isListening = true;
            this.ui.setStatus('Listening... speak now');

            // Update mode button
            if (this.activationMode === 'push-to-talk') {
                document.getElementById('btn-push-to-talk').classList.add('listening');
            }
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        if (!this.isListening) return;

        this.audio.stopListening();
        this.isListening = false;

        // Update mode button
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('listening');
        });

        if (!this.isProcessing) {
            this.ui.setStatus('Ready to assist');
        }
    }

    /**
     * Handle speech transcript
     */
    handleTranscript(transcript) {
        console.log('Transcript received:', transcript);

        // Stop listening
        this.stopListening();

        // Add user message to UI
        this.ui.addUserMessage(transcript);

        // Send to WebSocket
        if (this.ws && this.ws.isConnected()) {
            this.ui.setStatus('Sending to Claude...', 'processing');
            this.ws.sendUserMessage(transcript);
        } else {
            this.ui.setStatus('Not connected to server', 'error');
        }
    }

    /**
     * Stop all current processes and return to ready/sleep state
     */
    stopAllProcesses() {
        console.log('Stopping all processes...');

        // Send interrupt signal to backend
        if (this.ws && this.ws.isConnected()) {
            this.ws.sendInterrupt('user_stopped');
        }

        // Stop listening if active
        if (this.isListening) {
            this.stopListening();
        }

        // Stop TTS playback
        if (this.isProcessing) {
            this.audio.stopSpeaking();
            this.isProcessing = false;
        }

        // Stop wake word detection and return to sleep
        if (this.activationMode === 'wake-word' && this.wakeWord) {
            this.wakeWord.stopListening();
        }

        // Clear activation mode
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active', 'listening');
        });
        this.activationMode = null;

        // Play sleep sound
        this.audio.playSound('sleep');

        // Update UI to ready state
        this.ui.setStatus('Ready to assist');
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
            this.wakeWord = new WakeWordManager();

            // Set up callbacks
            this.wakeWord.onWakeWordDetected = (data) => {
                console.log('Wake word detected!', data);
                this.audio.playSound('wakeWord');
                this.ui.setStatus(`Wake word "${data.wakeWord}" detected! Listening for command...`);

                // Temporarily stop wake word listening
                this.wakeWord.stopListening();

                // Start regular listening for the command
                this.startListening();
            };

            this.wakeWord.onError = (error) => {
                console.error('Wake word error:', error);
                this.ui.setStatus(`Wake word error: ${error}`, 'error');
            };

            this.wakeWord.onReady = (data) => {
                console.log('Wake word ready:', data);
                this.ui.setStatus(`Listening for wake word: "${data.wakeWord}"`);
            };

            await this.wakeWord.initialize('computer');
        }

        // Start listening for wake word
        this.wakeWord.startListening();
        this.ui.setStatus('Listening for wake word: "computer"');

        // Update button state
        document.getElementById('btn-wake-word').classList.add('active');
    }

    /**
     * Stop wake word detection
     */
    stopWakeWord() {
        if (this.wakeWord) {
            this.wakeWord.stopListening();
        }

        this.activationMode = null;
        this.ui.setStatus('Wake word detection stopped');

        // Play sleep sound
        this.audio.playSound('sleep');

        // Update button state
        document.getElementById('btn-wake-word').classList.remove('active');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Claude Assistant...');
    const app = new ClaudeAssistant();
    window.app = app; // For debugging
});
