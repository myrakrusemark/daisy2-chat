/**
 * Main application - Integrates UI with backend functionality
 */

import { applyState, setWebSocketClient, handleServerStateChange } from './state-themes.js';
import { Components } from './components.js';

// Import old modules (make them available globally for now)
// Note: audio.js, ui-components.js, wake-word.js, websocket.js are loaded via script tags

class CassistantApp {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.audio = null;
        this.wakeWord = null;
        this.isListening = false;
        this.isProcessing = false;

        // Wait for DOM and other modules to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        console.log('🚀 Cassistant initializing...');

        // Initialize audio manager
        this.audio = new window.AudioManager();
        this.currentTranscript = ''; // Store current transcript
        this.wakeWordSubmitTimer = null; // Timer for wake word auto-submit

        // Setup callback for when recognition starts
        this.audio.onStart = () => {
            console.log('Recognition started (always-on mode)');
        };

        // Setup audio callbacks for live transcription
        this.audio.onInterimTranscript = (text) => {
            this.currentTranscript = text;
            // Only show live transcription when actively capturing (button held)
            if (this.isListening) {
                this.updateLiveTranscription(text);
                // Reset wake word timer when new speech comes in
                this.resetWakeWordTimer();
            }
        };

        // Setup callback for final transcript (continuous accumulation)
        this.audio.onTranscript = (text) => {
            console.log('Transcript accumulated:', text);
            this.currentTranscript = text;
            // Don't auto-submit - wait for button release or wake word
        };

        // Setup callback for when recognition ends (auto-restart)
        this.audio.onEnd = () => {
            console.log('Recognition ended - restarting in always-on mode');
            // Auto-restart recognition to keep it always on
            setTimeout(() => {
                if (this.ws && this.ws.isConnected()) {
                    this.audio.startListening('continuous');
                }
            }, 100);
        };

        // Check browser compatibility
        this.checkCompatibility();

        // Setup UI event listeners
        this.setupEventListeners();

        // Initialize session
        await this.initializeSession();
    }

    checkCompatibility() {
        const compat = window.AudioManager.checkCompatibility();

        if (!compat.supported) {
            // Show browser warning modal
            const modal = document.getElementById('browser-warning');
            const text = document.getElementById('browser-warning-text');
            if (modal && text) {
                text.textContent = compat.issues.join('. ');
                modal.showModal();
            }
        } else {
            console.log(`✓ Browser: ${compat.browser} - Full support detected`);
        }
    }

    setupEventListeners() {
        // Push to talk button - captures transcript when pressed
        const pttBtn = document.getElementById('btn-push-to-talk');
        if (pttBtn) {
            pttBtn.addEventListener('mousedown', (e) => {
                console.log('Button pressed - start capturing');
                this.startCapturing();
            });
            pttBtn.addEventListener('mouseup', (e) => {
                console.log('Button released - submit transcript');
                this.submitTranscript();
            });
            pttBtn.addEventListener('touchstart', (e) => {
                console.log('Button pressed (touch) - start capturing');
                e.preventDefault();
                this.startCapturing();
            });
            pttBtn.addEventListener('touchend', (e) => {
                console.log('Button released (touch) - submit transcript');
                e.preventDefault();
                this.submitTranscript();
            });
        }

        // Stop button
        const stopBtn = document.getElementById('btn-stop');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.interrupt());
        }

        // Keyboard button (future: show text input modal)
        const keyboardBtn = document.getElementById('btn-keyboard');
        if (keyboardBtn) {
            keyboardBtn.addEventListener('click', () => {
                console.log('Keyboard input not yet implemented');
            });
        }

        // Wake word toggle
        const wakeWordToggle = document.getElementById('wake-word-toggle');
        if (wakeWordToggle) {
            wakeWordToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startWakeWord();
                } else {
                    this.stopWakeWord();
                }
            });
        }

        // Settings - Working directory
        const workingDir = document.getElementById('working-directory');
        if (workingDir) {
            workingDir.addEventListener('change', () => this.updateConfig());
        }

        // Settings - Sound effects
        const soundsToggle = document.getElementById('enable-sounds');
        if (soundsToggle) {
            soundsToggle.addEventListener('change', (e) => {
                if (this.audio) {
                    this.audio.soundEnabled = e.target.checked;
                }
            });
        }

        // Session controls
        const newSessionBtn = document.getElementById('btn-new-session');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => this.createNewSession());
        }

        const clearConvoBtn = document.getElementById('btn-clear-conversation');
        if (clearConvoBtn) {
            clearConvoBtn.addEventListener('click', () => this.clearConversation());
        }

        // Browser warning dismiss
        const dismissBtn = document.getElementById('btn-dismiss-warning');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                document.getElementById('browser-warning').close();
            });
        }

        // ESC key to stop
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.interrupt();
            }
        });
    }

    async initializeSession() {
        try {
            applyState('connecting');

            // Get working directory from settings
            const workingDirInput = document.getElementById('working-directory');
            const workingDir = workingDirInput ? workingDirInput.value : '/app/workspace';

            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    working_directory: workingDir,
                    tool_profile: 'coding',
                    permission_mode: 'bypassPermissions'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create session');
            }

            const sessionData = await response.json();
            this.sessionId = sessionData.session_id;

            console.log('✓ Session created:', this.sessionId);

            // Connect WebSocket
            this.connectWebSocket();

        } catch (error) {
            console.error('✗ Error initializing session:', error);
            applyState('error');
            this.setStatus('Failed to initialize session');
        }
    }

    connectWebSocket() {
        this.ws = new window.WebSocketClient(this.sessionId);

        // Register for bidirectional state sync
        setWebSocketClient(this.ws);

        // Setup callbacks
        this.ws.onConnect = () => {
            console.log('✓ WebSocket connected');
            applyState('idle');
            this.setStatus('Ready to assist');

            // Start always-on STT
            console.log('Starting always-on speech recognition');
            this.audio.startListening('continuous');

            // Start wake word if enabled
            const wakeWordToggle = document.getElementById('wake-word-toggle');
            if (wakeWordToggle && wakeWordToggle.checked) {
                this.startWakeWord();
            }
        };

        this.ws.onDisconnect = () => {
            console.log('✗ WebSocket disconnected');
            applyState('connecting');
            this.setStatus('Disconnected - Reconnecting...');
        };

        this.ws.onSessionInfo = (info) => {
            console.log('Session info:', info);
        };

        this.ws.onAssistantMessage = (content, toolCalls) => {
            console.log('Assistant message:', content);
            this.addMessage('assistant', content);
            applyState('idle');
        };

        this.ws.onToolUse = (tool, input, summary) => {
            console.log('Tool use:', tool, summary);
            this.addToolUse(tool, summary);
        };

        this.ws.onToolSummaryUpdate = (tool, input, summary) => {
            console.log('Tool summary update:', tool, summary);
            // Update existing tool display or add new one
            this.updateToolSummary(tool, summary);
        };

        this.ws.onProcessing = (status) => {
            console.log('Processing status:', status);
            if (status === 'thinking') {
                applyState('processing');
            } else if (status === 'complete') {
                applyState('idle');
            }
        };

        this.ws.onTTSStart = (text) => {
            console.log('TTS started');
            applyState('speaking');
        };

        this.ws.onTTSAudio = (audioData) => {
            // Handle TTS audio streaming if needed
        };

        this.ws.onTTSEnd = () => {
            console.log('TTS ended');
            applyState('idle');
        };

        this.ws.onStateChange = (state) => {
            console.log('State change from server:', state);
            handleServerStateChange(state);
        };

        this.ws.onError = (message) => {
            console.error('WebSocket error:', message);
            this.addMessage('error', message);
            applyState('error');
        };

        // Connect
        this.ws.connect();
    }

    startCapturing() {
        if (this.isListening || this.isProcessing || !this.ws) {
            console.log('Already capturing or processing');
            return;
        }

        // Clear transcript and start showing what we're hearing
        this.currentTranscript = '';
        this.isListening = true;
        applyState('listening', true);
        console.log('Started capturing transcript');
    }

    submitTranscript() {
        if (!this.isListening) {
            console.log('Not capturing, nothing to submit');
            return;
        }

        this.isListening = false;

        // Clear wake word timer
        if (this.wakeWordSubmitTimer) {
            clearTimeout(this.wakeWordSubmitTimer);
            this.wakeWordSubmitTimer = null;
        }

        // Remove live transcription bubble
        this.removeLiveTranscription();

        const transcript = this.currentTranscript.trim();
        console.log('Submitting transcript:', transcript);

        if (transcript) {
            // Add final message
            this.addMessage('user', transcript);

            // Send to server
            this.isProcessing = true;
            applyState('processing', true);
            this.ws.sendUserMessage(transcript);

            // Clear transcript for next capture
            this.currentTranscript = '';
        } else {
            console.log('No transcript to submit');
            applyState('idle');
        }
    }

    interrupt() {
        if (this.isListening) {
            this.isListening = false;
            this.removeLiveTranscription();
            this.currentTranscript = '';

            // Clear wake word timer
            if (this.wakeWordSubmitTimer) {
                clearTimeout(this.wakeWordSubmitTimer);
                this.wakeWordSubmitTimer = null;
            }
        }

        if (this.isProcessing) {
            this.ws.sendInterrupt('user_stopped');
            this.isProcessing = false;
        }

        if (this.audio.isPlaying) {
            this.audio.stopSpeaking();
        }

        applyState('idle', true); // Sync to server
    }

    resetWakeWordTimer() {
        // Clear existing timer
        if (this.wakeWordSubmitTimer) {
            clearTimeout(this.wakeWordSubmitTimer);
        }

        // Set new timer - submit after 2 seconds of silence
        this.wakeWordSubmitTimer = setTimeout(() => {
            if (this.isListening) {
                console.log('2 seconds of silence - auto-submitting');
                this.submitTranscript();
            }
        }, 2000);
    }

    async startWakeWord() {
        if (!this.wakeWord && window.WakeWordDetector) {
            this.wakeWord = new window.WakeWordDetector();
            this.wakeWord.onWakeWordDetected = () => {
                console.log('Wake word detected! Starting capture...');
                this.startCapturing();
                // Start the auto-submit timer
                this.resetWakeWordTimer();
            };
        }

        if (this.wakeWord) {
            try {
                await this.wakeWord.start();
                this.setStatus(window.CLAUDE_CONSTANTS.READY_MESSAGE);
            } catch (error) {
                console.error('Wake word error:', error);
            }
        }
    }

    stopWakeWord() {
        if (this.wakeWord) {
            this.wakeWord.stop();
        }
        this.setStatus('Ready to assist');
    }

    updateConfig() {
        const workingDir = document.getElementById('working-directory').value;

        if (this.ws && this.ws.isConnected()) {
            this.ws.sendConfigUpdate({
                working_directory: workingDir
            });
        }
    }

    async createNewSession() {
        // Delete current session and create new one
        if (this.sessionId) {
            await fetch(`/api/sessions/${this.sessionId}`, { method: 'DELETE' });
        }

        this.clearConversation();
        await this.initializeSession();
    }

    clearConversation() {
        const conversation = document.getElementById('conversation');
        if (conversation) {
            conversation.innerHTML = '';
            conversation.appendChild(Components.welcomeHero());
        }
    }

    addMessage(role, text) {
        const conversation = document.getElementById('conversation');
        if (!conversation) return;

        // Remove empty state prompt on first message
        const emptyPrompt = document.getElementById('empty-prompt');
        if (emptyPrompt) {
            emptyPrompt.remove();
            // Reset conversation container to normal layout
            conversation.classList.remove('min-h-full', 'flex', 'items-center', 'justify-center');
        }

        // Remove welcome message if exists (for backwards compatibility)
        const welcome = conversation.querySelector('.hero');
        if (welcome) welcome.remove();

        // Use component to create message
        const messageEl = Components.chatMessage(role, text);
        conversation.appendChild(messageEl);
        conversation.scrollTop = conversation.scrollHeight;
    }

    addToolUse(toolName, summary, downloadUrl = null) {
        const conversation = document.getElementById('conversation');
        if (!conversation) return;

        // Remove empty state prompt on first content
        const emptyPrompt = document.getElementById('empty-prompt');
        if (emptyPrompt) {
            emptyPrompt.remove();
            conversation.classList.remove('min-h-full', 'flex', 'items-center', 'justify-center');
        }

        // Use component to create tool display
        const toolEl = Components.toolDisplay(toolName, summary, downloadUrl);
        conversation.appendChild(toolEl);
        conversation.scrollTop = conversation.scrollHeight;
    }

    updateToolSummary(toolName, summary, downloadUrl = null) {
        // For now, just add as new tool use
        // TODO: Update existing tool display if we add IDs
        this.addToolUse(toolName, summary, downloadUrl);
    }

    updateLiveTranscription(text) {
        const conversation = document.getElementById('conversation');
        if (!conversation) return;

        // Remove empty state prompt on first transcription
        const emptyPrompt = document.getElementById('empty-prompt');
        if (emptyPrompt) {
            emptyPrompt.remove();
            conversation.classList.remove('min-h-full', 'flex', 'items-center', 'justify-center');
        }

        // Check if live transcription bubble exists
        let liveTranscriptionEl = document.getElementById('live-transcription');

        if (!liveTranscriptionEl) {
            // Create new live transcription bubble
            liveTranscriptionEl = Components.liveTranscription(text);
            conversation.appendChild(liveTranscriptionEl);
        } else {
            // Update existing bubble text
            const textContainer = liveTranscriptionEl.querySelector('.rounded-2xl');
            if (textContainer) {
                textContainer.textContent = text;
            }
        }

        conversation.scrollTop = conversation.scrollHeight;
    }

    removeLiveTranscription() {
        const liveTranscriptionEl = document.getElementById('live-transcription');
        if (liveTranscriptionEl) {
            liveTranscriptionEl.remove();
        }
    }

    setStatus(message) {
        const statusDisplay = document.getElementById('status-display');
        if (statusDisplay) {
            statusDisplay.textContent = message;
        }
    }
}

// Initialize app when modules are loaded
window.addEventListener('load', () => {
    window.app = new CassistantApp();
});
