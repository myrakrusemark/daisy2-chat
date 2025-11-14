import { applyState } from './state-themes.js';

// Import constants from global constants file
const { 
  DEFAULT_KEYWORDS,
  KEYWORD_DISPLAY, 
  READY_MESSAGE, 
  VAD_LISTENING_MESSAGE, 
  STT_ENGINES,
  STT_ENGINE_NAMES,
  DEFAULT_STT_ENGINE 
} = window.CLAUDE_CONSTANTS;

class ClaudeAssistant {
  constructor() {
    // Initialize components (access from window for non-module scripts)
    this.audio = new window.AudioManager();
    this.ui = new window.UIComponents();
    this.healthMonitor = new window.HealthMonitor();
    this.ws = null;
    this.sessionId = null;
    // VAD is now integrated into audio manager

    // Activation mode state
    this.activationMode = null; // 'push-to-talk', 'click-to-activate', 'wake-word'
    this.isListening = false;
    this.isProcessing = false;

    // Android app detection state
    this.isAndroidApp = false;
    this.appVersion = null;
    this.appCapabilities = [];

    // Initialize Android app detection
    this.initializeAppDetection();

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
        
    // VAD is always-on, no need to pause/resume
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
        
    // Load wake word tuning settings
    this.loadWakeWordTuningSettings();
    
    // Load buffer duration from localStorage
    this.loadBufferDurationSetting();
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

  /**
     * Load wake word tuning settings from cookies
     */
  loadWakeWordTuningSettings() {
    // Default values
    const defaults = {
      detectionThreshold: 0.5,
      inputGain: 1.0,
      vadSensitivity: 0.5,
      vadHangover: 12
    };

    // Load from cookies or use defaults
    const detectionThreshold = parseFloat(this.getCookie('wakeWordDetectionThreshold')) || defaults.detectionThreshold;
    const inputGain = parseFloat(this.getCookie('wakeWordInputGain')) || defaults.inputGain;
    const vadSensitivity = parseFloat(this.getCookie('wakeWordVadSensitivity')) || defaults.vadSensitivity;
    const vadHangover = parseInt(this.getCookie('wakeWordVadHangover')) || defaults.vadHangover;

    // Update UI elements
    const thresholdSlider = document.getElementById('detection-threshold');
    const thresholdDisplay = document.getElementById('threshold-display');
    const gainSlider = document.getElementById('input-gain');
    const gainDisplay = document.getElementById('input-gain-display');
    const vadSlider = document.getElementById('vad-sensitivity');
    const vadDisplay = document.getElementById('vad-sensitivity-display');
    const hangoverSlider = document.getElementById('vad-hangover');
    const hangoverDisplay = document.getElementById('vad-hangover-display');

    if (thresholdSlider) {
      thresholdSlider.value = detectionThreshold;
      if (thresholdDisplay) {thresholdDisplay.textContent = detectionThreshold.toFixed(2);}
    }

    if (gainSlider) {
      gainSlider.value = inputGain;
      if (gainDisplay) {gainDisplay.textContent = `${Math.round(inputGain * 100)}%`;}
    }

    if (vadSlider) {
      vadSlider.value = vadSensitivity;
      if (vadDisplay) {vadDisplay.textContent = vadSensitivity.toFixed(2);}
    }

    if (hangoverSlider) {
      hangoverSlider.value = vadHangover;
      if (hangoverDisplay) {hangoverDisplay.textContent = `${vadHangover} frames`;}
    }

    // Store current values for VAD tuning
    this.vadTuning = {
      vadSensitivity,
      inputGain,
      vadHangover
    };
  }

  /**
   * Load buffer duration setting from cookies
   */
  loadBufferDurationSetting() {
    const defaultBufferDuration = 750; // Default 750ms
    const bufferDuration = parseInt(this.getCookie('bufferDuration')) || defaultBufferDuration;
    
    // Update UI elements
    const bufferSlider = document.getElementById('buffer-duration');
    const bufferDisplay = document.getElementById('buffer-duration-display');
    
    if (bufferSlider) {
      bufferSlider.value = bufferDuration;
    }
    if (bufferDisplay) {
      bufferDisplay.textContent = `${bufferDuration}ms`;
    }
    
    // Apply the setting to VAD service if available
    if (this.audio && this.audio.vadService && this.audio.vadService.updateSettings) {
      this.audio.vadService.updateSettings({
        bufferDurationMs: bufferDuration
      });
    }
    
    console.log(`Buffer duration loaded: ${bufferDuration}ms`);
  }

  /**
     * Save wake word tuning settings to cookies
     */
  saveWakeWordTuningSettings() {
    const settings = this.getWakeWordTuningValues();
        
    this.setCookie('wakeWordDetectionThreshold', settings.detectionThreshold);
    this.setCookie('wakeWordInputGain', settings.inputGain);
    this.setCookie('wakeWordVadSensitivity', settings.vadSensitivity);
    this.setCookie('wakeWordVadHangover', settings.vadHangover);

    this.vadTuning = settings;
        
    console.log('Wake word tuning settings saved:', settings);
  }

  /**
     * Get current wake word tuning values from UI
     */
  getWakeWordTuningValues() {
    const thresholdSlider = document.getElementById('detection-threshold');
    const gainSlider = document.getElementById('input-gain');
    const vadSlider = document.getElementById('vad-sensitivity');
    const hangoverSlider = document.getElementById('vad-hangover');

    return {
      detectionThreshold: thresholdSlider ? parseFloat(thresholdSlider.value) : 0.5,
      inputGain: gainSlider ? parseFloat(gainSlider.value) : 1.0,
      vadSensitivity: vadSlider ? parseFloat(vadSlider.value) : 0.5,
      vadHangover: hangoverSlider ? parseInt(hangoverSlider.value) : 12
    };
  }

  /**
     * Apply VAD tuning settings to active VAD service
     */
  applyVADTuning() {
    if (this.audio && this.audio.vadService) {
      const settings = this.getWakeWordTuningValues();
            
      // Apply settings to the VAD service
      this.audio.vadService.updateSettings({
        vadThreshold: settings.vadSensitivity,
        inputGain: settings.inputGain,
        vadHangoverFrames: settings.vadHangover
      });
            
      // Save to cookies
      this.saveWakeWordTuningSettings();
            
      console.log('Applied wake word tuning:', settings);
            
      // Show feedback
      const applyBtn = document.getElementById('btn-apply-tuning');
      if (applyBtn) {
        const originalText = applyBtn.innerHTML;
        applyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Applied!';
        applyBtn.classList.add('btn-success');
        applyBtn.classList.remove('btn-primary');
                
        setTimeout(() => {
          applyBtn.innerHTML = originalText;
          applyBtn.classList.remove('btn-success');
          applyBtn.classList.add('btn-primary');
        }, 2000);
      }
    }
  }

  /**
     * Reset wake word tuning to defaults
     */
  resetWakeWordTuning() {
    const defaults = {
      detectionThreshold: 0.5,
      inputGain: 1.0,
      vadSensitivity: 0.5,
      vadHangover: 12
    };

    // Update UI
    const thresholdSlider = document.getElementById('detection-threshold');
    const thresholdDisplay = document.getElementById('threshold-display');
    const gainSlider = document.getElementById('input-gain');
    const gainDisplay = document.getElementById('input-gain-display');
    const vadSlider = document.getElementById('vad-sensitivity');
    const vadDisplay = document.getElementById('vad-sensitivity-display');
    const hangoverSlider = document.getElementById('vad-hangover');
    const hangoverDisplay = document.getElementById('vad-hangover-display');

    if (thresholdSlider) {
      thresholdSlider.value = defaults.detectionThreshold;
      if (thresholdDisplay) {thresholdDisplay.textContent = defaults.detectionThreshold.toFixed(2);}
    }

    if (gainSlider) {
      gainSlider.value = defaults.inputGain;
      if (gainDisplay) {gainDisplay.textContent = `${Math.round(defaults.inputGain * 100)}%`;}
    }

    if (vadSlider) {
      vadSlider.value = defaults.vadSensitivity;
      if (vadDisplay) {vadDisplay.textContent = defaults.vadSensitivity.toFixed(2);}
    }

    if (hangoverSlider) {
      hangoverSlider.value = defaults.vadHangover;
      if (hangoverDisplay) {hangoverDisplay.textContent = `${defaults.vadHangover} frames`;}
    }

    console.log('Reset wake word tuning to defaults');
  }

  checkCompatibility() {
    const compat = window.AudioManager.checkCompatibility();

    // Skip browser compatibility warnings if Android app is detected
    if (this.isAndroidApp) {
      console.log('Android app detected - skipping browser compatibility checks');
      return;
    }

    // With server-side Whisper transcription, browser compatibility issues are much less critical
    // Only show warnings for truly unsupported browsers or missing essential features
    if (!compat.supported && compat.critical) {
      this.ui.showBrowserWarning(compat.issues, compat);
    } else if (!compat.supported) {
      console.log('Browser compatibility notes:', compat.issues.join(', '));
      console.log('✓ Server-side transcription available - browser limitations bypassed');
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
    
    // Set WebSocket reference in audio manager
    this.audio.setWebSocket(this.ws);

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
        this.startVADListening();
      }
    };

    this.ws.onDisconnect = async () => {
      console.log('Disconnected from WebSocket');
      this.ui.setConnectionStatus('disconnected');
            
      // Reset states on disconnect
      this.isProcessing = false;
      this.isListening = false;
            
      // Stop VAD if running
      if (this.activationMode === 'vad-continuous') {
        await this.stopVADListening();
      }
            
      // Clear any UI states
      const btn = document.getElementById('btn-push-to-talk');
      if (btn) {
        btn.classList.remove('btn-active');
      }
            
      // Set connecting state to disable audio input during reconnection
      applyState('connecting');
      this.ui.setStatus('Connection lost - attempting to reconnect...');
    };

    this.ws.onSessionInvalid = async () => {
      console.log('Session invalid - creating new session');
      this.ui.setStatus('Server restarted - creating new session...', 'warning');
      await this.createNewSession();
    };

    this.ws.onReconnectAttempt = (attempt, maxAttempts, delay) => {
      // Set connecting state during reconnection attempts to disable audio input
      applyState('connecting');
      this.ui.setStatus(`Reconnecting... (${attempt}/${maxAttempts}) - retry in ${Math.round(delay/1000)}s`);
    };

    this.ws.onReconnectFailed = () => {
      // Set error state when reconnection fails completely
      applyState('error');
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
      this.resumeVADAfterProcessing();
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
          this.resumeVADAfterProcessing();
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
      console.log('DEBUG: PTT button startPTT called!');
      e.preventDefault();

      if (!this.canStartListening()) {
        return;
      }

      if (this.isProcessing) {
        this.audio.stopSpeaking();
        this.isProcessing = false;
      }
      this.setActivationMode('push-to-talk');
      console.log('DEBUG: PTT button pressed, activation mode set to:', this.activationMode);
      this.startListening();
    };

    // Handler for stopping push-to-talk (mouse/touch)
    const stopPTT = (e) => {
      if (this.activationMode === 'push-to-talk') {
        this.stopListening();
        // Reset to vad-continuous mode for keyword detection
        this.setActivationMode('vad-continuous');
        console.log('DEBUG: PTT released, reset to vad-continuous mode');
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
        this.startVADListening();
      } else {
        // Stop wake word mode
        this.stopVADListening();
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

    // Keyword listening settings
    this.setupKeywordControls();

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

    // Wake Word Tuning Controls
    // Real-time slider value display updates
    const thresholdSlider = document.getElementById('detection-threshold');
    const thresholdDisplay = document.getElementById('threshold-display');
    thresholdSlider?.addEventListener('input', () => {
      thresholdDisplay.textContent = parseFloat(thresholdSlider.value).toFixed(2);
    });

    const gainSlider = document.getElementById('input-gain');
    const gainDisplay = document.getElementById('input-gain-display');
    gainSlider?.addEventListener('input', () => {
      const gain = parseFloat(gainSlider.value);
      gainDisplay.textContent = Math.round(gain * 100) + '%';
    });

    const vadSensitivitySlider = document.getElementById('vad-sensitivity');
    const vadSensitivityDisplay = document.getElementById('vad-sensitivity-display');
    vadSensitivitySlider?.addEventListener('input', () => {
      vadSensitivityDisplay.textContent = parseFloat(vadSensitivitySlider.value).toFixed(2);
    });

    const vadHangoverSlider = document.getElementById('vad-hangover');
    const vadHangoverDisplay = document.getElementById('vad-hangover-display');
    vadHangoverSlider?.addEventListener('input', () => {
      const frames = parseInt(vadHangoverSlider.value);
      vadHangoverDisplay.textContent = frames + ' frames';
    });

    // Apply tuning settings button
    document.getElementById('btn-apply-tuning')?.addEventListener('click', () => {
      this.applyWakeWordTuning();
    });

    // Reset tuning settings button
    document.getElementById('btn-reset-tuning')?.addEventListener('click', () => {
      this.resetWakeWordTuning();
    });
  }

  /**
     * Set activation mode
     */
  setActivationMode(mode) {
    this.activationMode = mode;
    this.audio.setActivationMode(mode);

    // Update UI
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    if (mode === 'push-to-talk') {
      document.getElementById('btn-push-to-talk').classList.add('active');
    } else if (mode === 'vad-continuous') {
      // VAD mode is always active when enabled via checkbox
      const vadToggle = document.getElementById('wake-word-toggle');
      if (vadToggle) {
        vadToggle.classList.add('active');
      }
    }
  }

  /**
     * Update push-to-talk button visual state based on VAD detection
     */
  updatePushToTalkButtonVadState(vadState) {
    const pttBtn = document.getElementById('btn-push-to-talk');
    if (!pttBtn) {return;}

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
    if (this.isListening) {return;}

    // VAD is always listening, no need to pause/resume

    const bypassKeywords = this.activationMode === 'push-to-talk';
    console.log('DEBUG: activationMode:', this.activationMode, 'bypassKeywords:', bypassKeywords);
    const success = this.audio.startRecording(bypassKeywords);
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

    this.audio.stopRecording();
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

    // VAD is always listening, no need to resume
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
        this.audio.stopRecording();
        this.isListening = false;
        const btn = document.getElementById('btn-push-to-talk');
        if (btn) {btn.classList.remove('btn-active');}
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

    // Return to idle state - VAD continues listening
    if (this.activationMode === 'vad-continuous') {
      // VAD continues running, just update status
      this.ui.setStatus(VAD_LISTENING_MESSAGE());
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
     * Start always-on VAD listening with keyword detection
     */
  async startVADListening() {
    this.setActivationMode('vad-continuous');

    // Initialize audio manager VAD service
    const vadInitialized = await this.audio.initializeVADListening();
    if (!vadInitialized) {
      this.ui.setStatus('Failed to initialize VAD listening', 'error');
      return;
    }

    // Set up VAD callbacks for visual feedback
    this.audio.onVadStateChanged = (vadState) => {
      this.updatePushToTalkButtonVadState(vadState);
    };

    this.audio.onRecordingStart = () => {
      console.log('VAD triggered recording start');
      this.ui.setStatus('🎙️ Recording... (say "hey daisy" followed by your command)');
    };

    this.audio.onRecordingStop = () => {
      console.log('VAD triggered recording stop');
      this.ui.setStatus('🔄 Processing audio...');
    };

    this.ui.setStatus(VAD_LISTENING_MESSAGE());
    console.log('✓ Always-on VAD listening started');
  }

  /**
     * Stop VAD listening
     */
  async stopVADListening() {
    await this.audio.stopVADListening();

    // Clear VAD visual state
    const pttBtn = document.getElementById('btn-push-to-talk');
    if (pttBtn) {
      pttBtn.classList.remove('vad-active');
    }

    this.activationMode = null;
    this.ui.setStatus('VAD listening stopped');

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
  async pauseWakeWordForProcessing() {
    // If wake word mode is active, mark it as paused for processing
    const wakeWordToggle = document.getElementById('wake-word-toggle');
    if (wakeWordToggle && wakeWordToggle.checked) {
      console.log('Marking wake word as paused for processing to prevent Bluetooth audio interference');
            
      // For VAD continuous mode, we don't stop during processing
      if (this.activationMode === 'vad-continuous') {
        console.log('VAD continuous mode - staying active during processing');
      }
            
      // VAD continues listening during processing
    }
  }

  /**
     * VAD continues listening - no need to resume
     */
  resumeVADAfterProcessing() {
    // VAD is always listening, no action needed
    console.log('VAD continues listening - no resume needed');
  }

  /**
     * Initialize Android app detection
     */
  initializeAppDetection() {
    // Check user agent first for immediate detection
    this.checkUserAgent();

    // Set up message listener for app communication
    window.addEventListener('message', (event) => {
      this.handleAppMessage(event);
    });

    console.log('Android app detection initialized');
  }

  /**
     * Check user agent for Android app detection
     */
  checkUserAgent() {
    if (navigator.userAgent.includes('OfflineVoiceDemo')) {
      console.log('Android app detected via user agent');
      this.isAndroidApp = true;
    }
  }

  /**
     * Handle messages from Android app
     */
  handleAppMessage(event) {
    // Validate origin for security
    const validOrigins = [
      'capacitor://localhost',
      'http://localhost',
      'https://localhost'
    ];
    
    if (!validOrigins.some(origin => event.origin.startsWith(origin))) {
      return;
    }

    const { type, ...data } = event.data;

    switch (type) {
    case 'init':
      this.handleAppInit(data);
      break;

    case 'transcript':
      this.handleAppTranscript(data);
      break;

    case 'status':
      this.handleAppStatus(data);
      break;

    default:
      console.log('Unknown message type from app:', type, data);
    }
  }

  /**
     * Handle app initialization message
     */
  handleAppInit(data) {
    this.isAndroidApp = true;
    this.appVersion = data.appVersion;
    this.appCapabilities = data.capabilities || [];

    console.log('Android app connected!');
    console.log('Version:', this.appVersion);
    console.log('Capabilities:', this.appCapabilities);

    // Update UI to show app is connected
    this.ui.setStatus('Android voice app connected');

    // Enable app-specific features
    this.enableAppFeatures();
  }

  /**
     * Handle voice transcript from app
     */
  handleAppTranscript(data) {
    const { text, isFinal } = data;

    console.log('Voice input from app:', text);
    console.log('Is final:', isFinal);

    if (isFinal) {
      // Process final transcript - route directly to existing transcript handler
      // This reuses all the existing WebSocket and conversation logic
      this.handleTranscript(text);
    } else {
      // Show interim transcript in status
      this.ui.setStatus(`App listening: "${text}"`);
    }
  }

  /**
     * Handle status updates from app
     */
  handleAppStatus(data) {
    const { status } = data;

    console.log('App status:', status);

    // Update UI based on app status
    switch (status) {
    case 'recording':
      this.ui.setStatus('App is recording...', 'processing');
      break;
    case 'listening':
      this.ui.setStatus('App is listening for wake word...');
      break;
    case 'processing':
      this.ui.setStatus('App is processing...', 'processing');
      break;
    case 'ready':
      this.ui.setStatus('App ready');
      break;
    case 'timeout':
      this.ui.setStatus('App listening timeout');
      break;
    default:
      this.ui.setStatus(`App status: ${status}`);
    }
  }

  /**
     * Enable features specific to Android app
     */
  enableAppFeatures() {
    // Hide browser-specific controls when in app
    const controlsArea = document.querySelector('.controls-area');
    const wakeWordToggle = document.querySelector('.form-control:has(#wake-word-toggle)');
    
    // Find STT Engine section by looking for the Speech Recognition Engine label
    const sttSection = Array.from(document.querySelectorAll('.form-control')).find(el => {
      const label = el.querySelector('.label-text.font-semibold');
      return label && label.textContent.includes('Speech Recognition Engine');
    });
    
    if (controlsArea) {
      controlsArea.style.display = 'none';
    }
    
    // Hide wake word toggle in header
    if (wakeWordToggle) {
      wakeWordToggle.style.display = 'none';
    }
    
    // Hide STT Engine selection section
    if (sttSection) {
      sttSection.style.display = 'none';
    }
    
    // Find and hide Wake Word Tuning section
    const wakeWordTuningSection = Array.from(document.querySelectorAll('.space-y-3')).find(el => {
      const span = el.querySelector('span.font-semibold');
      return span && span.textContent.includes('Wake Word Tuning');
    });
    
    if (wakeWordTuningSection) {
      wakeWordTuningSection.style.display = 'none';
    }
    
    // Auto-select Android app STT engine
    const androidSttRadio = document.getElementById('stt-android-app');
    if (androidSttRadio) {
      androidSttRadio.checked = true;
      // Trigger change event to notify other components
      androidSttRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Show app-specific status
    this.ui.setStatus('Voice controls handled by Android app');
  }

  /**
     * Check if running in Android app
     */
  isRunningInApp() {
    return this.isAndroidApp;
  }

  /**
   * Setup keyword listening controls
   */
  setupKeywordControls() {
    // Keyword input
    const keywordInput = document.getElementById('keyword-input');
    if (keywordInput) {
      keywordInput.addEventListener('input', (e) => {
        // Update keyword in real-time
        const keyword = e.target.value.trim().toLowerCase();
        if (keyword) {
          this.audio.setKeywords([keyword]);
          console.log(`Keyword updated: "${keyword}"`);
        }
      });
    }

    // VAD sensitivity
    const vadSensitivity = document.getElementById('vad-sensitivity');
    const vadSensitivityDisplay = document.getElementById('vad-sensitivity-display');
    if (vadSensitivity && vadSensitivityDisplay) {
      vadSensitivity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        vadSensitivityDisplay.textContent = value.toFixed(2);
      });
    }

    // Recording timeout
    const recordingTimeout = document.getElementById('recording-timeout');
    const recordingTimeoutDisplay = document.getElementById('recording-timeout-display');
    if (recordingTimeout && recordingTimeoutDisplay) {
      recordingTimeout.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        recordingTimeoutDisplay.textContent = `${value}s`;
      });
    }

    // Buffer duration
    const bufferDuration = document.getElementById('buffer-duration');
    const bufferDurationDisplay = document.getElementById('buffer-duration-display');
    if (bufferDuration && bufferDurationDisplay) {
      bufferDuration.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        bufferDurationDisplay.textContent = `${value}ms`;
      });
    }

    // Apply settings button
    const applyBtn = document.getElementById('btn-apply-keyword-settings');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        this.applyKeywordSettings();
      });
    }

    // Reset settings button
    const resetBtn = document.getElementById('btn-reset-keyword-settings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetKeywordSettings();
      });
    }
  }

  /**
   * Apply keyword settings
   */
  applyKeywordSettings() {
    const keywordInput = document.getElementById('keyword-input');
    const vadSensitivity = document.getElementById('vad-sensitivity');
    const recordingTimeout = document.getElementById('recording-timeout');
    const bufferDuration = document.getElementById('buffer-duration');

    if (keywordInput) {
      const keywords = keywordInput.value.trim().toLowerCase();
      if (keywords) {
        // Update keywords in audio manager and keyword detector
        this.audio.setKeywords(keywords.split(',').map(k => k.trim()));
        
        // Save to localStorage
        localStorage.setItem('claudeKeywords', keywords);
        console.log(`✓ Keywords applied: "${keywords}"`);
      }
    }

    if (vadSensitivity) {
      const sensitivity = parseFloat(vadSensitivity.value);
      // Update VAD sensitivity if the VAD service supports it
      if (this.audio.vadService && this.audio.vadService.setVadThreshold) {
        this.audio.vadService.setVadThreshold(sensitivity);
      }
      localStorage.setItem('claudeVadSensitivity', sensitivity);
      console.log(`✓ VAD sensitivity applied: ${sensitivity}`);
    }

    if (recordingTimeout) {
      const timeout = parseFloat(recordingTimeout.value) * 1000; // Convert to ms
      // Update timeout in audio manager
      this.audio.setSilenceTimeout(timeout);
      localStorage.setItem('claudeRecordingTimeout', timeout);
      console.log(`✓ Recording timeout applied: ${timeout}ms`);
    }

    if (bufferDuration) {
      const duration = parseInt(bufferDuration.value); // Already in ms
      // Update buffer duration in VAD service
      if (this.audio.vadService && this.audio.vadService.updateSettings) {
        this.audio.vadService.updateSettings({
          bufferDurationMs: duration
        });
      }
      this.setCookie('bufferDuration', duration);
      console.log(`✓ Pre-buffer duration applied: ${duration}ms`);
    }

    this.ui.setStatus('Keyword settings applied successfully');
  }

  /**
   * Reset keyword settings to defaults
   */
  resetKeywordSettings() {
    const keywordInput = document.getElementById('keyword-input');
    const vadSensitivity = document.getElementById('vad-sensitivity');
    const recordingTimeout = document.getElementById('recording-timeout');
    const bufferDuration = document.getElementById('buffer-duration');

    if (keywordInput) {
      keywordInput.value = 'hey daisy';
    }
    if (vadSensitivity) {
      vadSensitivity.value = '0.5';
      document.getElementById('vad-sensitivity-display').textContent = '0.50';
    }
    if (recordingTimeout) {
      recordingTimeout.value = '2.0';
      document.getElementById('recording-timeout-display').textContent = '2.0s';
    }
    if (bufferDuration) {
      bufferDuration.value = '750';
      document.getElementById('buffer-duration-display').textContent = '750ms';
    }

    // Apply the reset values
    this.applyKeywordSettings();
    
    console.log('✓ Keyword settings reset to defaults');
    this.ui.setStatus('Keyword settings reset to defaults');
  }

  /**
     * Get app version if available
     */
  getAppVersion() {
    return this.appVersion;
  }

  /**
     * Check if app has specific capability
     */
  hasAppCapability(capability) {
    return this.appCapabilities.includes(capability);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing Claude Assistant...');
  const app = new ClaudeAssistant();
  window.app = app; // For debugging
});
