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
            console.log('Assistant message:', content);
            this.ui.addAssistantMessage(content, toolCalls);

            // Speak response
            this.audio.speak(content, () => {
                this.ui.setStatus('Ready to assist');
                this.isProcessing = false;
            });
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
        };

        // Activation mode buttons
        document.getElementById('btn-push-to-talk').addEventListener('mousedown', () => {
            // Allow interrupting TTS by stopping synthesis
            if (this.isProcessing) {
                this.audio.synthesis.cancel();
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

        document.getElementById('btn-click-to-activate').addEventListener('click', () => {
            // Allow interrupting TTS by stopping synthesis
            if (this.isProcessing) {
                this.audio.synthesis.cancel();
                this.isProcessing = false;
            }

            if (this.activationMode === 'click-to-activate' && this.isListening) {
                this.stopListening();
            } else {
                this.setActivationMode('click-to-activate');
                this.startListening();
            }
        });

        // Settings
        document.getElementById('voice-select').addEventListener('change', (e) => {
            this.audio.setVoice(e.target.value);
        });

        document.getElementById('speech-rate').addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value);
            this.audio.setSpeechRate(rate);
            document.getElementById('rate-value').textContent = rate.toFixed(1);
        });

        document.getElementById('enable-sounds').addEventListener('change', (e) => {
            this.audio.setSoundsEnabled(e.target.checked);
        });

        document.getElementById('btn-new-session').addEventListener('click', () => {
            this.createNewSession();
        });

        document.getElementById('btn-clear-conversation').addEventListener('click', () => {
            this.ui.clearConversation();
        });

        // Load voices and populate selector
        setTimeout(() => {
            const voices = this.audio.getVoices();
            this.ui.populateVoiceSelector(voices, this.audio.selectedVoice);
        }, 100);
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
        } else if (mode === 'click-to-activate') {
            document.getElementById('btn-click-to-activate').classList.add('active');
        } else if (mode === 'wake-word') {
            document.getElementById('btn-wake-word').classList.add('active');
        }
    }

    /**
     * Start listening for speech
     */
    startListening() {
        if (this.isListening) return;

        const success = this.audio.startListening();
        if (success) {
            this.isListening = true;
            this.ui.setStatus('Listening... speak now');
            this.ui.setVisualizerActive(true);

            // Update mode button
            if (this.activationMode === 'push-to-talk') {
                document.getElementById('btn-push-to-talk').classList.add('listening');
            } else if (this.activationMode === 'click-to-activate') {
                document.getElementById('btn-click-to-activate').classList.add('listening');
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
        this.ui.setVisualizerActive(false);

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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Claude Assistant...');
    const app = new ClaudeAssistant();
    window.app = app; // For debugging
});
