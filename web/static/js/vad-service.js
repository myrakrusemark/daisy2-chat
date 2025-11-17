/**
 * VAD (Voice Activity Detection) Service using Silero VAD
 *
 * Extracted from wake word manager to provide standalone speech detection
 * for continuous listening and recording without wake word constraints.
 */

class VADService {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;
    this.mediaStream = null;
    this.isListening = false;

    // VAD model and state
    this.vadModel = null;
    this.vadState = { h: null, c: null };
    this.sampleRate = 16000;
    this.frameSize = 1280;
    
    // VAD processing state
    this.isSpeechActive = false;
    this.vadHangoverCounter = 0;
    this.VAD_HANGOVER_FRAMES = 12;
    
    // Audio buffering for capturing speech before VAD trigger
    this.audioBuffer = [];
    this.BUFFER_DURATION_MS = 750; // 750ms of pre-buffer
    this.MAX_BUFFER_CHUNKS = Math.ceil(this.BUFFER_DURATION_MS / (this.frameSize / this.sampleRate * 1000)); // ~9 chunks for 750ms
    
    // Configurable settings
    this.vadThreshold = 0.5;
    
    // Callbacks
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
    this.onVadStateChanged = null;
    this.onError = null;
    this.onReady = null;
    this.onStatusChange = null;

    // Audio worklet processor code (same as wake word manager)
    this.audioProcessorCode = `
        class AudioProcessor extends AudioWorkletProcessor {
            bufferSize = 1280;
            _buffer = new Float32Array(this.bufferSize);
            _pos = 0;
            constructor() { super(); }
            process(inputs) {
                const input = inputs[0][0];
                if (input) {
                    for (let i = 0; i < input.length; i++) {
                        this._buffer[this._pos++] = input[i];
                        if (this._pos === this.bufferSize) {
                            this.port.postMessage(this._buffer);
                            this._pos = 0;
                        }
                    }
                }
                return true;
            }
        }
        registerProcessor('vad-audio-processor', AudioProcessor);
    `;
  }

  /**
   * Initialize VAD service with Silero VAD model
   */
  async initialize() {
    try {
      this.updateStatus('Loading Silero VAD model...', 'idle');

      // Load only the VAD model (no wake word detection models)
      await this.loadVADModel();

      console.log('VAD service initialized successfully');
      if (this.onReady) {
        this.onReady();
      }

      return true;

    } catch (error) {
      console.error('Failed to initialize VAD service:', error);
      this.updateStatus(`Error: ${error.message}`, 'error');
      if (this.onError) {
        this.onError(error.message);
      }
      return false;
    }
  }

  /**
   * Load Silero VAD model
   */
  async loadVADModel() {
    const sessionOptions = { executionProviders: ['wasm'] };
    
    try {
      this.vadModel = await ort.InferenceSession.create(
        '/static/lib/openwakeword/models/silero_vad.onnx', 
        sessionOptions
      );

      this.updateStatus('VAD model loaded. Ready to start.', 'idle');
      console.log('✓ Silero VAD model loaded successfully');

    } catch (error) {
      throw new Error(`VAD model loading failed: ${error.message}`);
    }
  }

  /**
   * Reset VAD processing state
   */
  resetState() {
    // Reset VAD state
    const vadStateShape = [2, 1, 64];
    if (!this.vadState.h) {
      this.vadState.h = new ort.Tensor('float32', new Float32Array(128).fill(0), vadStateShape);
      this.vadState.c = new ort.Tensor('float32', new Float32Array(128).fill(0), vadStateShape);
    } else {
      this.vadState.h.data.fill(0);
      this.vadState.c.data.fill(0);
    }

    this.isSpeechActive = false;
    this.vadHangoverCounter = 0;
    this.audioBuffer = [];
  }

  /**
   * Add audio chunk to circular buffer for pre-recording
   */
  addToAudioBuffer(chunk) {
    // Create copy of the chunk to avoid reference issues
    const chunkCopy = new Float32Array(chunk);
    this.audioBuffer.push(chunkCopy);
    
    // Maintain circular buffer - remove old chunks when buffer exceeds max size
    if (this.audioBuffer.length > this.MAX_BUFFER_CHUNKS) {
      this.audioBuffer.shift();
    }
  }

  /**
   * Get buffered audio chunks for pre-recording
   */
  getBufferedAudio() {
    return [...this.audioBuffer]; // Return copy to prevent external modification
  }

  /**
   * Clear audio buffer
   */
  clearAudioBuffer() {
    this.audioBuffer = [];
  }

  /**
   * Voice Activity Detection using Silero VAD
   */
  async runVad(chunk) {
    try {
      const tensor = new ort.Tensor('float32', chunk, [1, chunk.length]);
      const sr = new ort.Tensor('int64', [BigInt(this.sampleRate)], []);
      const res = await this.vadModel.run({ 
        input: tensor, 
        sr: sr, 
        h: this.vadState.h, 
        c: this.vadState.c 
      });
      
      this.vadState.h = res.hn;
      this.vadState.c = res.cn;
      
      return res.output.data[0] > this.vadThreshold;
    } catch (err) {
      console.error('VAD Error:', err);
      return false;
    }
  }

  /**
   * Start listening for speech activity
   */
  async startListening() {
    if (this.isListening) {
      console.log('VAD service already listening');
      return;
    }

    try {
      this.updateStatus('Starting VAD speech detection...', 'idle');
      console.log('Starting VAD service...');

      this.resetState();

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;
      
      // Create audio worklet
      const blob = new Blob([this.audioProcessorCode], { type: 'application/javascript' });
      const workletURL = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(workletURL);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'vad-audio-processor');

      // Set up audio processing with speech detection
      this.workletNode.port.onmessage = async (event) => {
        const chunk = event.data;
        if (!chunk) {return;}
        
        // Always buffer audio chunks for pre-recording
        this.addToAudioBuffer(chunk);
        
        const vadFired = await this.runVad(chunk);
        
        // Track speech state changes
        if (vadFired) {
          if (!this.isSpeechActive) {
            this.isSpeechActive = true;
            console.log('🎤 Speech detected - starting recording with pre-buffer');
            
            // Emit speech start event with buffered audio available
            if (this.onSpeechStart) {
              this.onSpeechStart();
            }
          }
          this.vadHangoverCounter = this.VAD_HANGOVER_FRAMES;
        } else if (this.isSpeechActive) {
          this.vadHangoverCounter--;
          if (this.vadHangoverCounter <= 0) {
            this.isSpeechActive = false;
            console.log('🔇 Speech ended - stopping recording');
            
            // Emit speech end event
            if (this.onSpeechEnd) {
              this.onSpeechEnd();
            }
          }
        }
        
        // Always emit current VAD state for real-time feedback
        if (this.onVadStateChanged) {
          this.onVadStateChanged({ 
            isActive: this.isSpeechActive, 
            vadFired: vadFired 
          });
        }
      };

      source.connect(this.gainNode);
      this.gainNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      this.isListening = true;
      console.log('✓ VAD service started successfully');
      this.updateStatus('Listening for speech activity...', 'listening');

    } catch (error) {
      console.error('Error starting VAD service:', error);
      this.updateStatus(`Error: ${error.message}`, 'error');
      
      if (this.onError) {
        this.onError(error.message);
      }
    }
  }

  /**
   * Stop listening for speech activity
   */
  async stopListening() {
    if (!this.isListening) {
      return;
    }

    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
      }
      if (this.workletNode) {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
        this.workletNode = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
      }

      this.isListening = false;
      console.log('✓ VAD service stopped');
      this.updateStatus('VAD service stopped', 'idle');

    } catch (error) {
      console.error('Error stopping VAD service:', error);
      this.isListening = false;
    }
  }

  /**
   * Update VAD sensitivity settings
   */
  updateSettings(settings) {
    console.log('Updating VAD settings:', settings);

    // Update VAD threshold
    if (settings.vadThreshold !== undefined) {
      this.vadThreshold = settings.vadThreshold;
      console.log(`VAD threshold updated to: ${this.vadThreshold}`);
    }

    // Update input gain
    if (settings.inputGain !== undefined && this.gainNode) {
      this.gainNode.gain.value = settings.inputGain;
      console.log(`Input gain updated to: ${settings.inputGain}`);
    }

    // Update VAD hangover frames
    if (settings.vadHangoverFrames !== undefined) {
      this.VAD_HANGOVER_FRAMES = settings.vadHangoverFrames;
      console.log(`VAD hangover frames updated to: ${this.VAD_HANGOVER_FRAMES}`);
    }

    // Update audio buffer duration
    if (settings.bufferDurationMs !== undefined) {
      this.BUFFER_DURATION_MS = settings.bufferDurationMs;
      this.MAX_BUFFER_CHUNKS = Math.ceil(this.BUFFER_DURATION_MS / (this.frameSize / this.sampleRate * 1000));
      console.log(`Audio buffer duration updated to: ${this.BUFFER_DURATION_MS}ms (${this.MAX_BUFFER_CHUNKS} chunks)`);
      
      // Trim existing buffer if it's now too large
      while (this.audioBuffer.length > this.MAX_BUFFER_CHUNKS) {
        this.audioBuffer.shift();
      }
    }
  }

  /**
   * Get current VAD state
   */
  getVadState() {
    return {
      isActive: this.isSpeechActive,
      isListening: this.isListening
    };
  }

  /**
   * Check if VAD service is listening
   */
  getIsListening() {
    return this.isListening;
  }

  /**
   * Update status (internal helper)
   */
  updateStatus(message, type = 'idle') {
    if (this.onStatusChange) {
      this.onStatusChange({ message, type });
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    await this.stopListening();
    console.log('VAD service cleaned up');
  }
}

// Export for use in other modules
window.VADService = VADService;