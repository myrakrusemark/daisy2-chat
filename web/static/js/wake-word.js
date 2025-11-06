/**
 * Wake Word Detection Module using OpenWakeWord
 *
 * This module provides browser-native wake word detection using OpenWakeWord
 * running entirely in the browser via ONNX Runtime - no backend processing needed!
 */

class WakeWordManager {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.gainNode = null;
        this.mediaStream = null;
        this.isListening = false;
        this.wakeWord = window.CLAUDE_CONSTANTS.WAKE_WORD;

        // OpenWakeWord models and state
        this.melspecModel = null;
        this.embeddingModel = null;
        this.vadModel = null;
        this.models = {
            'hey_jarvis': { url: '/static/lib/openwakeword/models/hey_jarvis_v0.1.onnx', session: null },
            'hey_mycroft': { url: '/static/lib/openwakeword/models/hey_mycroft_v0.1.onnx', session: null },
            'alexa': { url: '/static/lib/openwakeword/models/alexa_v0.1.onnx', session: null }
        };

        // Audio processing state
        this.sampleRate = 16000;
        this.frameSize = 1280;
        this.mel_buffer = [];
        this.embedding_buffer = [];
        this.vadState = { h: null, c: null };
        this.isSpeechActive = false;
        this.vadHangoverCounter = 0;
        this.VAD_HANGOVER_FRAMES = 12;
        this.isDetectionCoolingDown = false;

        // Callbacks
        this.onWakeWordDetected = null;
        this.onError = null;
        this.onReady = null;
        this.onStatusChange = null;
        this.onVadStateChanged = null;

        // Audio worklet processor code
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
            registerProcessor('audio-processor', AudioProcessor);
        `;
    }

    /**
     * Initialize OpenWakeWord detector
     */
    async initialize(wakeWord = window.CLAUDE_CONSTANTS.WAKE_WORD) {
        try {
            this.wakeWord = wakeWord;
            this.updateStatus('Loading OpenWakeWord models...', 'idle');

            // Load all ONNX models
            await this.loadModels();

            console.log(`Wake word manager initialized with wake word: "${wakeWord}"`);
            console.log('Using OpenWakeWord for offline wake word detection');

            if (this.onReady) {
                this.onReady({ wakeWord });
            }

            return true;

        } catch (error) {
            console.error('Failed to initialize wake word detector:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
            if (this.onError) {
                this.onError(error.message);
            }
            return false;
        }
    }

    /**
     * Load ONNX models
     */
    async loadModels() {
        const sessionOptions = { executionProviders: ['wasm'] };
        
        try {
            // Load core models
            [this.melspecModel, this.embeddingModel, this.vadModel] = await Promise.all([
                ort.InferenceSession.create('/static/lib/openwakeword/models/melspectrogram.onnx', sessionOptions),
                ort.InferenceSession.create('/static/lib/openwakeword/models/embedding_model.onnx', sessionOptions),
                ort.InferenceSession.create('/static/lib/openwakeword/models/silero_vad.onnx', sessionOptions)
            ]);

            // Load wake word models
            for (const name in this.models) {
                this.models[name].session = await ort.InferenceSession.create(this.models[name].url, sessionOptions);
            }

            this.updateStatus('Models loaded. Ready to start.', 'idle');
            console.log('✓ OpenWakeWord models loaded successfully');

        } catch (error) {
            throw new Error(`Model loading failed: ${error.message}`);
        }
    }

    /**
     * Reset processing state
     */
    resetState() {
        this.mel_buffer = [];
        this.embedding_buffer = [];
        
        // Initialize embedding buffer with 16 empty frames
        for (let i = 0; i < 16; i++) {
            this.embedding_buffer.push(new Float32Array(96).fill(0));
        }

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
        this.isDetectionCoolingDown = false;
    }

    /**
     * Voice Activity Detection
     */
    async runVad(chunk) {
        try {
            const tensor = new ort.Tensor('float32', chunk, [1, chunk.length]);
            const sr = new ort.Tensor('int64', [BigInt(this.sampleRate)], []);
            const res = await this.vadModel.run({ input: tensor, sr: sr, h: this.vadState.h, c: this.vadState.c });
            this.vadState.h = res.hn;
            this.vadState.c = res.cn;
            return res.output.data[0] > 0.5;
        } catch (err) {
            console.error("VAD Error:", err);
            return false;
        }
    }

    /**
     * Main inference pipeline
     */
    async runInference(chunk, isSpeechConsideredActive) {
        // Stage 1: Audio Chunk -> Melspectrogram
        const melspecTensor = new ort.Tensor('float32', chunk, [1, this.frameSize]);
        const melspecResults = await this.melspecModel.run({ [this.melspecModel.inputNames[0]]: melspecTensor });
        let new_mel_data = melspecResults[this.melspecModel.outputNames[0]].data;

        // Transform melspectrogram data
        for (let j = 0; j < new_mel_data.length; j++) {
            new_mel_data[j] = (new_mel_data[j] / 10.0) + 2.0;
        }
        
        // Add 5 frames to buffer
        for (let j = 0; j < 5; j++) {
            this.mel_buffer.push(new Float32Array(new_mel_data.subarray(j * 32, (j + 1) * 32)));
        }

        // Stage 2: Melspectrogram History -> Embedding Vector
        while (this.mel_buffer.length >= 76) {
            const window_frames = this.mel_buffer.slice(0, 76);
            const flattened_mel = new Float32Array(76 * 32);
            for (let j = 0; j < window_frames.length; j++) {
                flattened_mel.set(window_frames[j], j * 32);
            }

            const embeddingFeeds = { [this.embeddingModel.inputNames[0]]: new ort.Tensor('float32', flattened_mel, [1, 76, 32, 1]) };
            const embeddingOut = await this.embeddingModel.run(embeddingFeeds);
            const new_embedding = embeddingOut[this.embeddingModel.outputNames[0]].data;

            // Stage 3: Embedding History -> Final Prediction
            this.embedding_buffer.shift();
            this.embedding_buffer.push(new Float32Array(new_embedding));

            const flattened_embeddings = new Float32Array(16 * 96);
            for (let j = 0; j < this.embedding_buffer.length; j++) {
                flattened_embeddings.set(this.embedding_buffer[j], j * 96);
            }
            const final_input_tensor = new ort.Tensor('float32', flattened_embeddings, [1, 16, 96]);

            // Check all wake word models
            for (const name in this.models) {
                const results = await this.models[name].session.run({ [this.models[name].session.inputNames[0]]: final_input_tensor });
                const score = results[this.models[name].session.outputNames[0]].data[0];

                if (score > 0.5 && isSpeechConsideredActive && !this.isDetectionCoolingDown) {
                    this.isDetectionCoolingDown = true;
                    
                    console.log(`🎯 WAKE WORD DETECTED: ${name} (Score: ${score.toFixed(2)})`);
                    this.updateStatus(`Wake word detected: ${name}!`, 'detected');

                    if (this.onWakeWordDetected) {
                        this.onWakeWordDetected({
                            wakeWord: name,
                            score: score
                        });
                    }

                    // Reset status after 2 seconds
                    setTimeout(() => {
                        if (this.isListening) {
                            this.updateStatus('Listening for wake words...', 'listening');
                        }
                    }, 2000);

                    setTimeout(() => { this.isDetectionCoolingDown = false; }, 2000);
                }
            }
            
            this.mel_buffer.splice(0, 8);
        }
    }

    /**
     * Start listening for wake word using OpenWakeWord
     */
    async startListening() {
        if (this.isListening) {
            console.log('Already listening for wake word');
            return;
        }

        try {
            this.updateStatus('Initializing OpenWakeWord...', 'idle');
            console.log('Starting OpenWakeWord detection...');

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
            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

            // Set up audio processing
            this.workletNode.port.onmessage = async (event) => {
                const chunk = event.data;
                if (!chunk) return;
                
                const vadFired = await this.runVad(chunk);

                if (vadFired) {
                    if (!this.isSpeechActive) {
                        this.isSpeechActive = true;
                        // Emit VAD state change when speech starts
                        if (this.onVadStateChanged) {
                            this.onVadStateChanged({ isActive: true, vadFired: true });
                        }
                    }
                    this.vadHangoverCounter = this.VAD_HANGOVER_FRAMES;
                } else if (this.isSpeechActive) {
                    this.vadHangoverCounter--;
                    if (this.vadHangoverCounter <= 0) {
                        this.isSpeechActive = false;
                        // Emit VAD state change when speech ends
                        if (this.onVadStateChanged) {
                            this.onVadStateChanged({ isActive: false, vadFired: false });
                        }
                    }
                }
                
                // Always emit current VAD fire state for real-time feedback
                if (this.onVadStateChanged) {
                    this.onVadStateChanged({ isActive: this.isSpeechActive, vadFired: vadFired });
                }
                
                await this.runInference(chunk, this.isSpeechActive);
            };

            source.connect(this.gainNode);
            this.gainNode.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination);

            this.isListening = true;
            console.log('✓ OpenWakeWord started successfully');
            console.log(`Listening for: ${this.wakeWord}`);
            
            this.updateStatus('Listening for wake words...', 'listening');

        } catch (error) {
            console.error('Error starting OpenWakeWord:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
            
            if (this.onError) {
                this.onError(error.message);
            }
        }
    }

    /**
     * Stop listening for wake word
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
            console.log('✓ OpenWakeWord stopped');
            this.updateStatus('Status: Idle - Wake word detection stopped', 'idle');

        } catch (error) {
            console.error('Error stopping OpenWakeWord:', error);
            this.isListening = false;
        }
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
     * Check if listening
     */
    getIsListening() {
        return this.isListening;
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
     * Clean up resources
     */
    async cleanup() {
        await this.stopListening();
        console.log('Wake word manager cleaned up');
    }
}

// Export for use in other modules
window.WakeWordManager = WakeWordManager;