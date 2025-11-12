/**
 * Main application logic - Orchestrates audio, WebSocket, and UI
 */

import { applyState } from './state-themes.js';

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
    const compat = window.AudioManager.checkCompatibility();

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
    this.ws = new window.WebSocketClient(this.sessionId);

    // Setup WebSocket callbacks
    this.ws.onConnect = () => {
      console.log('Connected to WebSocket');
      this.ui.setConnectionStatus('connected');
      this.ui.setStatus('Ready to assist');

      // Start wake word mode if checkbox is checked
      const wakeWordToggle = document.getElementById('wake-word-toggle');
      if (wakeWordToggle && wakeWordToggle.checked) {
        this.startWakeWord();
      }
    };

    this.ws.onDisconnect = () => {
      console.log('Disconnected from WebSocket');
      this.ui.setConnectionStatus('disconnected');
      this.ui.setStatus('Disconnected - attempting to reconnect...', 'error');
    };
        
    // Enhanced connection state management
    this.ws.onConnectionStateChange = (newState, previousState) => {
      console.log(`WebSocket state: ${previousState} -> ${newState}`);
            
      switch (newState) {
      case 'connecting':
        this.ui.setConnectionStatus('connecting');
        this.ui.setStatus('Connecting to server...', 'processing');
        break;
                    
      case 'connected':
        this.ui.setConnectionStatus('connected');
        this.ui.setStatus('Ready to assist');
                    
        // Show queued message count if any
        const queuedCount = this.ws.getQueuedMessageCount();
        if (queuedCount > 0) {
          this.ui.setStatus(`Connected - processing ${queuedCount} queued messages`, 'processing');
        }
        break;
                    
      case 'reconnecting':
        this.ui.setConnectionStatus('reconnecting');
        this.ui.setStatus('Connection lost - reconnecting...', 'error');
        break;
                    
      case 'disconnected':
        this.ui.setConnectionStatus('disconnected');
        this.ui.setStatus('Disconnected from server', 'error');
        break;
      }
    };
        
    // Enhanced reconnection feedback
    this.ws.onReconnectAttempt = (attempt, maxAttempts, delay) => {
      this.ui.setStatus(`Reconnecting... (${attempt}/${maxAttempts}) - next attempt in ${Math.round(delay/1000)}s`, 'error');
    };
        
    this.ws.onReconnectFailed = () => {
      this.ui.setStatus('Failed to reconnect - please refresh the page', 'error');
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

    // Track tool indicators for updates
    this.toolIndicators = new Map();

    this.ws.onToolUse = (toolName, toolInput, summary) => {
      console.log('Tool use:', toolName, summary);
      const indicatorEl = this.ui.addToolUseIndicator(toolName, summary, toolInput);

      // Store indicator for potential updates
      const toolKey = `${toolName}_${Date.now()}`;
      this.toolIndicators.set(toolKey, indicatorEl);

      this.audio.playSound('tool');
    };

    // Handle tool summary updates
    this.ws.onToolSummaryUpdate = (toolName, toolInput, betterSummary) => {
      console.log('Tool summary update:', toolName, betterSummary);

      // Mark that we're speaking a tool summary (not the final response)
      this.speakingToolSummary = true;

      // Find the most recent indicator for this tool
      const indicators = Array.from(this.toolIndicators.entries())
        .filter(([key]) => key.startsWith(toolName))
        .sort(([a], [b]) => b.split('_')[1] - a.split('_')[1]);

      if (indicators.length > 0) {
        const [, indicatorEl] = indicators[0];
        this.ui.updateToolSummary(indicatorEl, betterSummary);
        // TTS is handled by server via stream_tts_audio
      }
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
    // Track if we're in the middle of speaking tool summaries
    this.speakingToolSummary = false;

    this.ws.onTTSStart = (text) => {
      console.log('TTS stream starting');
      applyState('speaking');
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
          this.ui.setStatus('Ready to assist');
          this.isProcessing = false;

          // Play sleep sound to indicate returning to idle state
          this.audio.playSound('sleep');
        } else {
          // Reset flag for next TTS
          this.speakingToolSummary = false;
        }
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
      console.log('Audio recognition ended, mode:', this.activationMode);

      // Only auto-stop for wake-word mode, not push-to-talk
      // In push-to-talk, user controls when to stop by releasing button
      if (this.activationMode === 'wake-word') {
        this.stopListening();

        // Restart wake word listening after command completes
        if (this.wakeWord) {
          setTimeout(() => {
            this.wakeWord.startListening();
            this.ui.setStatus(window.CLAUDE_CONSTANTS.WAKE_WORD_LISTENING_MESSAGE());
          }, 1000);
        }
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
    const pttBtn = document.getElementById('btn-push-to-talk');

    // Prevent context menu on long press
    pttBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Handler for starting push-to-talk
    const startPTT = (e) => {
      console.log('Push-to-talk button pressed');
      e.preventDefault(); // Prevent default touch behavior
      // Allow interrupting TTS by stopping speech
      if (this.isProcessing) {
        this.audio.stopSpeaking();
        this.isProcessing = false;
      }
      this.setActivationMode('push-to-talk');
      this.startListening();
    };

    // Handler for stopping push-to-talk
    const stopPTT = (e) => {
      console.log('Push-to-talk button released');
      if (this.activationMode === 'push-to-talk') {
        this.stopListening();
      }
    };

    // Mouse events
    pttBtn.addEventListener('mousedown', startPTT);
    pttBtn.addEventListener('mouseup', stopPTT);

    // Touch events for mobile/touchscreen
    pttBtn.addEventListener('touchstart', startPTT);
    pttBtn.addEventListener('touchend', stopPTT);

    document.getElementById('wake-word-toggle').addEventListener('change', (e) => {
      if (e.target.checked) {
        // Start wake word mode
        this.startWakeWord();
      } else {
        // Stop wake word mode
        this.stopWakeWord();
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
    }
    // Wake word mode is handled by the checkbox state
  }

  /**
     * Start listening for speech with state integration
     */
  startListening() {
    if (this.isListening) {return;}

    // Temporarily pause wake word detection if it's running
    if (this.wakeWord && this.wakeWord.isListening) {
      console.log('Pausing wake word for push-to-talk');
      this.wakeWord.stopListening();
    }

    const success = this.audio.startListening(this.activationMode);
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
    if (!this.isListening) {return;}

    this.audio.stopListening();
    this.isListening = false;

    // Update mode button
    const btn = document.getElementById('btn-push-to-talk');
    if (btn) {
      btn.classList.remove('btn-active');
    }

    if (!this.isProcessing) {
      applyState('idle');
      this.ui.setStatus('Ready to assist');
    }

    // Resume wake word detection if wake word toggle is checked
    const wakeWordToggle = document.getElementById('wake-word-toggle');
    if (wakeWordToggle && wakeWordToggle.checked && this.wakeWord && !this.wakeWord.isListening) {
      console.log('Resuming wake word detection');
      setTimeout(() => {
        this.wakeWord.startListening();
      }, 500);
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

    // Send to WebSocket with enhanced connection handling
    if (this.ws) {
      const connectionState = this.ws.getConnectionState();
            
      if (connectionState === 'connected') {
        this.ui.setStatus('Sending to Claude...', 'processing');
        this.ws.sendUserMessage(transcript);
      } else if (connectionState === 'connecting' || connectionState === 'reconnecting') {
        this.ui.setStatus('Connecting to server, message queued...', 'processing');
        this.ws.sendUserMessage(transcript); // Will be queued automatically
      } else {
        this.ui.setStatus('Reconnecting to server...', 'error');
        this.ws.sendUserMessage(transcript); // Will trigger reconnection and queue message
      }
    } else {
      this.ui.setStatus('WebSocket client not initialized', 'error');
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

    // If in wake word mode, return to listening for wake word
    // Otherwise, clear activation mode
    if (this.activationMode === 'wake-word' && this.wakeWord) {
      // Just restart wake word listening, don't turn off the mode
      this.wakeWord.stopListening();
      setTimeout(() => {
        this.wakeWord.startListening();
        this.ui.setStatus(window.CLAUDE_CONSTANTS.WAKE_WORD_LISTENING_MESSAGE());
      }, 500);
    } else {
      // Not in wake word mode, so clear activation mode
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active', 'listening');
      });
      this.activationMode = null;
      this.ui.setStatus('Ready to assist');
    }

    // Play sleep sound
    this.audio.playSound('sleep');
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

      await this.wakeWord.initialize(window.CLAUDE_CONSTANTS.WAKE_WORD);
    }

    // Start listening for wake word
    this.wakeWord.startListening();
    this.ui.setStatus(window.CLAUDE_CONSTANTS.WAKE_WORD_LISTENING_MESSAGE());
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
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing Claude Assistant...');
  const app = new ClaudeAssistant();
  window.app = app; // For debugging
});
