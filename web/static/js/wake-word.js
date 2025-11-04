/**
 * Wake Word Detection Module using Porcupine WebAssembly
 *
 * This module provides browser-native wake word detection using Picovoice Porcupine
 * running entirely in the browser via WebAssembly - no backend processing needed!
 */

class WakeWordManager {
    constructor(accessKey) {
        this.accessKey = accessKey;
        this.porcupine = null;
        this.isListening = false;
        this.wakeWord = window.CLAUDE_CONSTANTS.WAKE_WORD; // Default wake word

        // Callbacks
        this.onWakeWordDetected = null;
        this.onError = null;
        this.onReady = null;
    }

    /**
     * Initialize Porcupine wake word detector
     *
     * Note: Since we're using vanilla JS without a build tool,
     * we'll use the Porcupine Web SDK via CDN or bundled version
     */
    async initialize(wakeWord = window.CLAUDE_CONSTANTS.WAKE_WORD) {
        try {
            this.wakeWord = wakeWord;

            // For now, we'll use the Web Speech API continuous recognition
            // as a fallback until we properly integrate Porcupine WebAssembly
            //
            // TODO: Integrate @picovoice/porcupine-web properly with a build tool
            // or use the UMD/CDN version

            console.log(`Wake word manager initialized with wake word: "${wakeWord}"`);
            console.log('Note: Using Web Speech API fallback - Porcupine WebAssembly integration pending');

            if (this.onReady) {
                this.onReady({ wakeWord });
            }

            return true;

        } catch (error) {
            console.error('Failed to initialize wake word detector:', error);
            if (this.onError) {
                this.onError(error.message);
            }
            return false;
        }
    }

    /**
     * Start listening for wake word
     * Uses continuous speech recognition as fallback
     */
    startListening() {
        if (this.isListening) {
            console.log('Already listening for wake word');
            return;
        }

        // Use Web Speech API continuous recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech Recognition not supported');
            if (this.onError) {
                this.onError('Speech Recognition not supported');
            }
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const transcript = event.results[i][0].transcript.toLowerCase().trim();
                    console.log('Heard:', transcript);

                    // Check if wake word was detected (handle both hyphenated and spaced versions)
                    const wakeWordSpaced = this.wakeWord.replace('-', ' ');
                    if (transcript.includes(wakeWordSpaced) || transcript.includes(this.wakeWord)) {
                        console.log(`Wake word "${this.wakeWord}" detected!`);
                        if (this.onWakeWordDetected) {
                            this.onWakeWordDetected({
                                wakeWord: this.wakeWord,
                                transcript: transcript
                            });
                        }
                    }
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Wake word recognition error:', event.error);

            // Auto-restart on certain errors, but only if still listening
            if (this.isListening && (event.error === 'no-speech' || event.error === 'audio-capture')) {
                setTimeout(() => {
                    if (this.isListening) {
                        try {
                            this.recognition.start();
                        } catch (error) {
                            // Ignore start errors if already started
                            if (!error.message.includes('already started')) {
                                console.error('Failed to restart after error:', error);
                            }
                        }
                    }
                }, 1000);
            }
        };

        this.recognition.onend = () => {
            // Auto-restart if still supposed to be listening
            if (this.isListening) {
                setTimeout(() => {
                    if (this.isListening) {
                        try {
                            this.recognition.start();
                        } catch (error) {
                            // Ignore start errors if already started
                            if (!error.message.includes('already started')) {
                                console.error('Failed to restart recognition:', error);
                            }
                        }
                    }
                }, 100);
            }
        };

        try {
            this.recognition.start();
            this.isListening = true;
            console.log(`Now listening for wake word: "${this.wakeWord}"`);
        } catch (error) {
            console.error('Failed to start wake word detection:', error);
            if (this.onError) {
                this.onError(error.message);
            }
        }
    }

    /**
     * Stop listening for wake word
     */
    stopListening() {
        if (!this.isListening) {
            return;
        }

        this.isListening = false;

        if (this.recognition) {
            this.recognition.stop();
        }

        console.log('Stopped listening for wake word');
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.stopListening();

        if (this.porcupine) {
            // TODO: Call porcupine.release() when using actual Porcupine SDK
            this.porcupine = null;
        }
    }
}

// Note: To use the actual Porcupine WebAssembly SDK, we need to either:
// 1. Set up a build tool (webpack/vite/rollup) to bundle the npm package
// 2. Use the Porcupine Web SDK via CDN (if available)
// 3. Use ES modules import maps
//
// For now, this uses Web Speech API continuous recognition as a functional
// fallback that still provides wake word functionality.

// Export for use in other modules
window.WakeWordManager = WakeWordManager;
