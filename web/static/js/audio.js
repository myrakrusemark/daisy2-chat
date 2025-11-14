// Import constants from global constants file
const { 
  SILENCE_TIMEOUT, 
  RECOGNITION_RESTART_DELAY, 
  AUDIO_INIT_VOLUME,
  SERVER_TRANSCRIPTION,
  STT_ENGINES,
  STT_ENGINE_NAMES,
  DEFAULT_STT_ENGINE 
} = window.CLAUDE_CONSTANTS;

class AudioManager {
  constructor() {
    // VAD Service Integration
    this.vadService = new window.VADService();
    this.keywordDetector = new window.KeywordDetector();
    
    // Speech Recognition (STT) - Enhanced with timeout logic
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech Recognition not supported');
      this.recognition = null;
    } else {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
    }

    // Enhanced timeout management for Speech API
    this.lastTranscriptionTime = null;
    this.transcriptionTimeout = null;
    this.TRANSCRIPTION_SILENCE_TIMEOUT = 2000; // 2 seconds, same as VAD
    this.accumulatedTranscript = '';
    
    // Recording state
    this.isRecording = false;
    this.isRecognitionActive = false;
    this.currentRecordingMode = null; // 'vad-continuous'

    // Audio playback for streamed TTS
    this.audioChunks = [];
    this.isPlaying = false;
    this.currentAudio = null;
    this.lastAudioBlob = null;
    this.audioGestureInitialized = false;

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
    this.onRecordingStart = null;
    this.onRecordingStop = null;

    // Server transcription state
    this.useServerTranscription = SERVER_TRANSCRIPTION.ENABLED;
    this.serverTranscriptionAvailable = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
        
    // STT Engine management
    this.preferredEngine = DEFAULT_STT_ENGINE;
    this.currentEngine = null;
    this.engineAvailability = {
      [STT_ENGINES.SERVER_WHISPER]: false,
      [STT_ENGINES.BROWSER_SPEECH_API]: false
    };

    // Initialize components
    this.setupAudioInitialization();
    this.setupVADService();
    this.setupSpeechRecognition();
    this.checkEngineAvailability();
  }

  /**
   * Setup VAD service with event handlers
   */
  setupVADService() {
    // VAD events for recording control
    this.vadService.onSpeechStart = () => {
      console.log('VAD: Speech started - beginning recording');
      this.startRecording();
    };

    this.vadService.onSpeechEnd = () => {
      console.log('VAD: Speech ended - stopping recording');
      this.stopRecording();
    };

    this.vadService.onVadStateChanged = (state) => {
      // Emit VAD state for UI feedback (button glow)
      if (this.onVadStateChanged) {
        this.onVadStateChanged(state);
      }
    };

    this.vadService.onError = (error) => {
      console.error('VAD Service error:', error);
      if (this.onError) {
        this.onError(`VAD Error: ${error}`);
      }
    };
  }

  /**
   * Setup enhanced Speech Recognition with transcription timeout
   */
  setupSpeechRecognition() {
    if (!this.recognition) {return;}

    this.recognition.onresult = (event) => {
      this.lastTranscriptionTime = Date.now();
      this.resetTranscriptionTimeout();

      let interimTranscript = '';
      let finalTranscript = '';

      // Process all results
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Update accumulated transcript
      if (finalTranscript) {
        this.accumulatedTranscript += finalTranscript;
      }

      // Show interim results
      const displayText = this.accumulatedTranscript + ' ' + interimTranscript;
      if (this.onInterimTranscript && displayText.trim()) {
        this.onInterimTranscript(displayText.trim());
      }

      console.log(`Speech API: Final="${finalTranscript.trim()}" Interim="${interimTranscript.trim()}"`);
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.clearTranscriptionTimeout();
      if (this.onError) {
        this.onError(`Speech Recognition: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      console.log('Speech recognition ended');
      this.isRecognitionActive = false;
      this.clearTranscriptionTimeout();
      this.processAccumulatedTranscript('Speech recognition ended');
    };

    this.recognition.onstart = () => {
      console.log('Speech recognition started');
      this.isRecognitionActive = true;
      this.accumulatedTranscript = '';
      this.lastTranscriptionTime = Date.now();
      this.resetTranscriptionTimeout();
    };
  }

  /**
   * Reset transcription timeout (2 seconds of no new transcription)
   */
  resetTranscriptionTimeout() {
    this.clearTranscriptionTimeout();
    this.transcriptionTimeout = setTimeout(() => {
      console.log('Transcription timeout: 2 seconds of silence detected');
      this.stopSpeechRecognition();
    }, this.TRANSCRIPTION_SILENCE_TIMEOUT);
  }

  /**
   * Clear transcription timeout
   */
  clearTranscriptionTimeout() {
    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout);
      this.transcriptionTimeout = null;
    }
  }

  /**
   * Process accumulated transcript and check for keywords
   */
  processAccumulatedTranscript(reason) {
    const transcript = this.accumulatedTranscript.trim();
    console.log(`Processing transcript (${reason}): "${transcript}"`);

    if (!transcript) {
      console.log('No transcript to process');
      return;
    }

    // Check for keywords
    const keywordResult = this.keywordDetector.detectKeyword(transcript);
    if (keywordResult.found) {
      console.log(`✓ Keyword "${keywordResult.keyword}" found, processing command: "${keywordResult.command}"`);
      if (this.onTranscript) {
        // Send only the command part, not the keyword
        this.onTranscript(keywordResult.command || keywordResult.fullText);
      }
    } else {
      console.log(`No keywords found in transcript, discarding: "${transcript}"`);
    }

    // Clear accumulated transcript
    this.accumulatedTranscript = '';
  }

  /**
   * Initialize always-on VAD listening
   */
  async initializeVADListening() {
    try {
      console.log('Initializing VAD service...');
      
      // Initialize VAD service
      const vadInitialized = await this.vadService.initialize();
      if (!vadInitialized) {
        throw new Error('Failed to initialize VAD service');
      }

      // Start VAD listening
      await this.vadService.startListening();
      console.log('✓ Always-on VAD listening started');
      return true;

    } catch (error) {
      console.error('Failed to initialize VAD listening:', error);
      if (this.onError) {
        this.onError(`VAD initialization failed: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Stop VAD listening
   */
  async stopVADListening() {
    try {
      await this.vadService.stopListening();
      console.log('VAD listening stopped');
    } catch (error) {
      console.error('Error stopping VAD listening:', error);
    }
  }

  /**
   * Start recording (triggered by VAD)
   */
  async startRecording() {
    if (this.isRecording) {
      console.log('Already recording, ignoring start request');
      return;
    }

    this.isRecording = true;
    console.log('🎙️ Recording started');

    if (this.onRecordingStart) {
      this.onRecordingStart();
    }

    // Choose recording method based on preferred STT engine
    if (this.useServerTranscription && this.serverTranscriptionAvailable) {
      await this.startServerRecording();
    } else {
      await this.startBrowserRecognition();
    }
  }

  /**
   * Stop recording (triggered by VAD)
   */
  async stopRecording() {
    if (!this.isRecording) {
      console.log('Not recording, ignoring stop request');
      return;
    }

    this.isRecording = false;
    console.log('🔇 Recording stopped');

    if (this.onRecordingStop) {
      this.onRecordingStop();
    }

    // Stop appropriate recording method
    if (this.useServerTranscription && this.serverTranscriptionAvailable) {
      await this.stopServerRecording();
    } else {
      this.stopSpeechRecognition();
    }
  }

  /**
   * Combine pre-buffer (WAV) and recorded audio (WebM/other) into single WAV blob
   */
  async combineAudioStreams(prebufferBlob, recordedBlob) {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      
      // Decode both audio files
      const [prebufferArrayBuffer, recordedArrayBuffer] = await Promise.all([
        prebufferBlob.arrayBuffer(),
        recordedBlob.arrayBuffer()
      ]);
      
      const [prebufferAudioBuffer, recordedAudioBuffer] = await Promise.all([
        audioContext.decodeAudioData(prebufferArrayBuffer),
        audioContext.decodeAudioData(recordedArrayBuffer)
      ]);
      
      // Create combined audio buffer
      const totalLength = prebufferAudioBuffer.length + recordedAudioBuffer.length;
      const combinedBuffer = audioContext.createBuffer(1, totalLength, 16000);
      const combinedData = combinedBuffer.getChannelData(0);
      
      // Copy pre-buffer data
      const prebufferData = prebufferAudioBuffer.getChannelData(0);
      combinedData.set(prebufferData, 0);
      
      // Copy recorded data after pre-buffer
      const recordedData = recordedAudioBuffer.getChannelData(0);
      combinedData.set(recordedData, prebufferAudioBuffer.length);
      
      // Convert combined buffer to WAV
      return this.audioBufferToWav(combinedBuffer);
      
    } catch (error) {
      console.error('Error combining audio streams:', error);
      // Fallback: just use the recorded audio
      return recordedBlob;
    }
  }

  /**
   * Convert AudioBuffer to WAV blob
   */
  audioBufferToWav(audioBuffer) {
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const channelData = audioBuffer.getChannelData(0);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // Convert float to 16-bit PCM
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(44 + i * 2, sample * 0x7fff, true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Convert Float32Array audio chunks to WAV audio blob
   */
  convertBufferedAudioToWav(audioChunks, sampleRate = 16000) {
    if (!audioChunks || audioChunks.length === 0) {
      return null;
    }

    // Concatenate all chunks
    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combinedAudio = new Float32Array(totalLength);
    let offset = 0;
    
    for (const chunk of audioChunks) {
      combinedAudio.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert Float32 to 16-bit PCM
    const pcmData = new Int16Array(totalLength);
    for (let i = 0; i < totalLength; i++) {
      const sample = Math.max(-1, Math.min(1, combinedAudio[i]));
      pcmData[i] = sample * 0x7fff;
    }

    // Create WAV file
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcmData.length * 2, true);
    
    // Write PCM data
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(44 + i * 2, pcmData[i], true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Start server-side recording for complete audio file
   */
  async startServerRecording() {
    try {
      console.log('Starting server recording for complete audio file...');
      
      // Get buffered audio from VAD service
      const bufferedAudioChunks = this.vadService.getBufferedAudio();
      console.log(`Using ${bufferedAudioChunks.length} buffered audio chunks for pre-recording`);
      
      // Convert buffered audio to WAV blob
      this.prebufferBlob = null;
      if (bufferedAudioChunks.length > 0) {
        this.prebufferBlob = this.convertBufferedAudioToWav(bufferedAudioChunks, 16000);
        console.log(`Created pre-buffer audio blob: ${this.prebufferBlob.size} bytes`);
      }
      
      // Start server transcription session
      if (this.websocket) {
        console.log('📡 Starting server transcription session...');
        const result = this.websocket.startServerTranscription();
        console.log('📡 Start transcription result:', result);
      } else {
        console.error('❌ WebSocket not available for starting transcription');
      }
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SERVER_TRANSCRIPTION.PREFERRED_SAMPLE_RATE,
          channelCount: SERVER_TRANSCRIPTION.PREFERRED_CHANNELS,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // Set up MediaRecorder for complete file recording
      let mimeType = SERVER_TRANSCRIPTION.MIME_TYPE;
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        const fallbackTypes = ['audio/webm', 'audio/mp4', ''];
        for (const type of fallbackTypes) {
          if (MediaRecorder.isTypeSupported(type) || type === '') {
            mimeType = type;
            break;
          }
        }
      }

      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(stream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log('Server recording stopped, sending complete audio file with pre-buffer');
        this.sendCompleteAudioFileWithBuffer();
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      console.log('✓ Server recording started with audio pre-buffer');

    } catch (error) {
      console.error('Error starting server recording:', error);
      if (this.onError) {
        this.onError(`Recording failed: ${error.message}`);
      }
    }
  }

  /**
   * Stop server-side recording and process complete audio file
   */
  async stopServerRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      console.log('Stopping server recording...');
      this.mediaRecorder.stop();
    }
  }

  /**
   * Send complete recorded audio file with pre-buffer to server for transcription
   */
  async sendCompleteAudioFileWithBuffer() {
    if (this.recordedChunks.length === 0 && !this.prebufferBlob) {
      console.log('No recorded audio to send');
      return;
    }

    try {
      let finalAudioBlob;
      
      if (this.prebufferBlob && this.recordedChunks.length > 0) {
        // Combine pre-buffer with recorded audio
        const recordedBlob = new Blob(this.recordedChunks, { 
          type: this.mediaRecorder.mimeType || 'audio/webm' 
        });
        
        console.log(`Combining pre-buffer (${this.prebufferBlob.size} bytes) with recording (${recordedBlob.size} bytes)`);
        
        // Properly combine audio streams using Web Audio API
        finalAudioBlob = await this.combineAudioStreams(this.prebufferBlob, recordedBlob);
        
        console.log(`✓ Combined audio streams: ${finalAudioBlob.size} bytes total`);
        
      } else if (this.prebufferBlob) {
        // Only pre-buffer available
        finalAudioBlob = this.prebufferBlob;
        console.log(`Using pre-buffer only: ${finalAudioBlob.size} bytes`);
      } else {
        // Only recorded audio available (fallback)
        finalAudioBlob = new Blob(this.recordedChunks, { 
          type: this.mediaRecorder.mimeType || 'audio/webm' 
        });
        console.log(`Using recorded audio only: ${finalAudioBlob.size} bytes`);
      }

      console.log(`Sending complete audio file with buffer: ${finalAudioBlob.size} bytes`);

      // Convert to base64 for transmission
      const reader = new FileReader();
      reader.onload = () => {
        const audioData = reader.result.split(',')[1]; // Remove data URL prefix
        console.log(`Sending buffered audio: ${audioData.length} base64 chars`);
        
        // Send complete audio file via WebSocket
        if (this.websocket) {
          this.websocket.sendCompleteAudioFile(audioData);
        }
      };
      
      reader.readAsDataURL(finalAudioBlob);
      this.recordedChunks = [];
      this.prebufferBlob = null;

    } catch (error) {
      console.error('Error sending complete audio file with buffer:', error);
      if (this.onError) {
        this.onError(`Audio transmission failed: ${error.message}`);
      }
    }
  }

  /**
   * Send complete recorded audio file to server for transcription (fallback method)
   */
  async sendCompleteAudioFile() {
    // Redirect to buffered version for consistency
    return this.sendCompleteAudioFileWithBuffer();
  }

  /**
   * Start browser speech recognition
   */
  async startBrowserRecognition() {
    if (!this.recognition) {
      console.error('Speech recognition not available');
      return;
    }

    try {
      if (this.isRecognitionActive) {
        console.log('Speech recognition already active');
        return;
      }

      console.log('Starting browser speech recognition...');
      this.recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      if (this.onError) {
        this.onError(`Speech recognition failed: ${error.message}`);
      }
    }
  }

  /**
   * Stop browser speech recognition and process transcript
   */
  stopSpeechRecognition() {
    this.clearTranscriptionTimeout();
    
    if (this.recognition && this.isRecognitionActive) {
      console.log('Stopping speech recognition...');
      this.recognition.stop();
    } else {
      // If recognition not active, process any accumulated transcript
      this.processAccumulatedTranscript('Manual stop');
    }
  }

  /**
   * Set WebSocket reference for server communication
   */
  setWebSocket(websocket) {
    this.websocket = websocket;
  }

  /**
   * Enable/disable server transcription mode
   */
  setServerTranscriptionMode(enabled, available = true) {
    this.useServerTranscription = enabled && available;
    this.serverTranscriptionAvailable = available;
    
    this.engineAvailability[STT_ENGINES.SERVER_WHISPER] = available;
    this.checkEngineAvailability();
    this._updateEngineConfiguration();
    
    console.log(`Server transcription mode: ${this.useServerTranscription ? 'enabled' : 'disabled'}`);
  }

  /**
   * Handle server transcription result with keyword detection
   */
  handleServerTranscriptionResult(result) {
    console.log('Server transcription result:', result);
    
    if (result.text && result.text.trim()) {
      const transcript = result.text.trim();
      
      // Check for keywords
      const keywordResult = this.keywordDetector.detectKeyword(transcript);
      if (keywordResult.found) {
        console.log(`✓ Server keyword "${keywordResult.keyword}" found, processing command: "${keywordResult.command}"`);
        if (this.onTranscript) {
          // Send only the command part, not the keyword
          this.onTranscript(keywordResult.command || keywordResult.fullText);
        }
      } else {
        console.log(`Server: No keywords found in transcript, discarding: "${transcript}"`);
      }
    }
  }

  // Audio playback methods (unchanged from original)
  setupAudioInitialization() {
    const initAudio = () => {
      if (this.audioInitialized) {return;}

      console.log('Initializing audio with user gesture for proper Android/Samsung routing');

      Object.values(this.sounds).forEach(sound => {
        sound.volume = 0.01;
        sound.play().then(() => {
          sound.pause();
          sound.currentTime = 0;
          sound.volume = 1.0;
        }).catch(() => {});
      });

      this.audioInitialized = true;
      this.audioGestureInitialized = true;
      console.log('Audio initialization complete');

      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };

    document.addEventListener('click', initAudio, { once: false });
    document.addEventListener('keydown', initAudio, { once: false });
    document.addEventListener('touchstart', initAudio, { once: false });
  }

  startTTSStream() {
    if (this.isPlaying || this.currentAudio) {
      this.stopSpeaking();
    }
    this.audioChunks = [];
    this.isPlaying = false;
  }

  addTTSChunk(audioData) {
    this.audioChunks.push(audioData);
  }

  async playTTSStream(onEnd = null) {
    console.log(`Playing TTS stream (${this.audioChunks.length} chunks)`);

    if (this.audioChunks.length === 0) {
      console.warn('No audio chunks to play');
      if (onEnd) {onEnd();}
      return;
    }

    if (!this.audioGestureInitialized) {
      console.warn('Audio not initialized with user gesture');
    }

    try {
      const combinedB64 = this.audioChunks.join('');
      const binaryString = atob(combinedB64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'audio/wav' });
      this.lastAudioBlob = blob;
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio();
      audio.src = audioUrl;
      this.currentAudio = audio;

      audio.setAttribute('playsinline', 'true');
      audio.preload = 'auto';
      audio.controls = false;
      audio.muted = false;
      audio.volume = 1.0;
      
      audio.style.display = 'none';
      document.body.appendChild(audio);

      audio.onended = () => {
        console.log('TTS playback finished');
        URL.revokeObjectURL(audioUrl);
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
        this.isPlaying = false;
        this.currentAudio = null;
        if (onEnd) {onEnd();}
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        URL.revokeObjectURL(audioUrl);
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
        this.isPlaying = false;
        this.currentAudio = null;
        if (onEnd) {onEnd();}
      };

      this.isPlaying = true;
      await new Promise(resolve => setTimeout(resolve, 10));
      await audio.play();

    } catch (error) {
      console.error('Error playing TTS stream:', error);
      this.isPlaying = false;
      if (onEnd) {onEnd();}
    }
  }

  async replayLastTTS() {
    if (!this.lastAudioBlob) {
      console.warn('No TTS audio to replay');
      return;
    }

    try {
      if (this.isPlaying || this.currentAudio) {
        this.stopSpeaking();
      }

      const audioUrl = URL.createObjectURL(this.lastAudioBlob);
      const audio = new Audio();
      audio.src = audioUrl;
      this.currentAudio = audio;

      audio.setAttribute('playsinline', 'true');
      audio.preload = 'auto';
      audio.controls = false;
      audio.muted = false;
      audio.volume = 1.0;
      
      audio.style.display = 'none';
      document.body.appendChild(audio);

      audio.onended = () => {
        console.log('TTS replay finished');
        URL.revokeObjectURL(audioUrl);
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
        this.isPlaying = false;
        this.currentAudio = null;
      };

      audio.onerror = (e) => {
        console.error('Audio replay error:', e);
        URL.revokeObjectURL(audioUrl);
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
        this.isPlaying = false;
        this.currentAudio = null;
      };

      this.isPlaying = true;
      await new Promise(resolve => setTimeout(resolve, 10));
      await audio.play();
    } catch (error) {
      console.error('Error replaying TTS:', error);
      this.isPlaying = false;
    }
  }

  speakText(text) {
    if (!window.speechSynthesis || !text) {return;}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.speechRate || 1.0;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    console.log('Speaking tool summary:', text);
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    this.isPlaying = false;
    this.audioChunks = [];

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      
      if (this.currentAudio.parentNode) {
        this.currentAudio.parentNode.removeChild(this.currentAudio);
      }
      
      this.currentAudio = null;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  playSound(soundName) {
    if (!this.soundsEnabled) {return;}

    const sound = this.sounds[soundName];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(err => console.error('Error playing sound:', err));
    }
  }

  setSoundsEnabled(enabled) {
    this.soundsEnabled = enabled;
  }

  // Engine management methods (simplified)
  checkEngineAvailability() {
    const browserSpeechAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    this.engineAvailability[STT_ENGINES.BROWSER_SPEECH_API] = browserSpeechAvailable;
    this.engineAvailability[STT_ENGINES.SERVER_WHISPER] = this.serverTranscriptionAvailable;
    
    console.log('Engine availability:', this.engineAvailability);
    return this.engineAvailability;
  }

  setPreferredEngine(engine) {
    if (Object.values(STT_ENGINES).includes(engine)) {
      this.preferredEngine = engine;
      console.log(`Preferred STT engine set to: ${STT_ENGINE_NAMES[engine]}`);
      this._updateEngineConfiguration();
    } else {
      console.error(`Invalid STT engine: ${engine}`);
    }
  }

  _updateEngineConfiguration() {
    const preferred = this.preferredEngine;
    
    if (this.engineAvailability[preferred]) {
      this.currentEngine = preferred;
      
      if (preferred === STT_ENGINES.SERVER_WHISPER) {
        this.useServerTranscription = true;
      } else if (preferred === STT_ENGINES.BROWSER_SPEECH_API) {
        this.useServerTranscription = false;
      }
      
      console.log(`Using STT engine: ${STT_ENGINE_NAMES[preferred]}`);
    } else {
      // Fallback logic
      const fallbackEngine = this.engineAvailability[STT_ENGINES.SERVER_WHISPER] ? 
        STT_ENGINES.SERVER_WHISPER : STT_ENGINES.BROWSER_SPEECH_API;
      
      if (fallbackEngine && this.engineAvailability[fallbackEngine]) {
        this.currentEngine = fallbackEngine;
        this.useServerTranscription = (fallbackEngine === STT_ENGINES.SERVER_WHISPER);
        console.log(`Preferred engine unavailable, using fallback: ${STT_ENGINE_NAMES[fallbackEngine]}`);
      } else {
        console.error('No STT engines available');
        this.currentEngine = null;
      }
    }
  }

  getPreferredEngine() {
    return this.preferredEngine;
  }

  getCurrentEngine() {
    return this.currentEngine;
  }

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

  getEngineAvailability() {
    return { ...this.engineAvailability };
  }

  /**
   * Set keywords for detection
   */
  setKeywords(keywords) {
    if (Array.isArray(keywords)) {
      this.keywordDetector.updateKeywords(keywords);
    } else if (typeof keywords === 'string') {
      this.keywordDetector.updateKeywords([keywords]);
    }
  }

  /**
   * Set VAD silence timeout
   */
  setSilenceTimeout(timeoutMs) {
    // Update the silence timeout for both VAD and Speech API
    if (this.vadService) {
      this.vadService.silenceTimeout = timeoutMs;
    }
    // Store for future use
    this.silenceTimeout = timeoutMs;
    console.log(`Silence timeout updated: ${timeoutMs}ms`);
  }

  static checkCompatibility() {
    const issues = [];
    const criticalIssues = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        criticalIssues.push('MediaDevices API not supported - microphone access unavailable');
      }

      if (!window.MediaRecorder) {
        criticalIssues.push('MediaRecorder API not supported - audio recording unavailable');
      }

      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        issues.push('Browser Speech Recognition not available (fallback only)');
      }

      if (!window.speechSynthesis) {
        issues.push('Browser Speech Synthesis not available (server TTS used instead)');
      }

      const userAgent = (navigator.userAgent || '').toLowerCase();
      const browser = userAgent.includes('firefox') ? 'firefox' :
        userAgent.includes('chrome') ? 'chrome' :
          userAgent.includes('edge') ? 'edge' :
            userAgent.includes('safari') ? 'safari' : 'unknown';

      console.log(`Browser detected: ${browser}`);

      return {
        supported: criticalIssues.length === 0,
        critical: criticalIssues.length > 0,
        issues: [...criticalIssues, ...issues],
        criticalIssues: criticalIssues,
        nonCriticalIssues: issues,
        browser: browser
      };
    } catch (error) {
      console.error('Error during browser compatibility check:', error);
      return {
        supported: false,
        critical: true,
        issues: ['Browser compatibility check failed'],
        criticalIssues: ['Browser compatibility check failed'],
        nonCriticalIssues: [],
        browser: 'unknown'
      };
    }
  }
}

// Export for use in other modules
window.AudioManager = AudioManager;