class WebSocketClient {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.connected = false;

        // Connection quality tracking
        this.connectionQuality = {
            latency: 0,
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            lastPingTime: null,
            avgLatency: 0,
            connectionStart: null,
            uptime: 0
        };
        
        this.pingInterval = null;
        this.pingIntervalMs = 30000; // 30 seconds

        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onSessionInfo = null;
        this.onAssistantMessage = null;
        this.onToolUse = null;
        this.onToolSummaryUpdate = null;
        this.onTextBlock = null;
        this.onMarkFinal = null;
        this.onProcessing = null;
        this.onError = null;
        this.onTTSStart = null;
        this.onTTSAudio = null;
        this.onTTSEnd = null;
        this.onSessionInvalid = null;
        this.onReconnectAttempt = null;
        this.onReconnectFailed = null;
        
        // Server transcription callbacks
        this.onServerTranscriptionResult = null;
        this.onTranscriptionStatus = null;
        this.onServerTranscriptionStarted = null;
        this.onServerTranscriptionStopped = null;
        this.onTranscriptionUnavailable = null;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            
            // Initialize connection quality tracking
            this.connectionQuality.connectionStart = Date.now();
            this.connectionQuality.errors = 0;
            this.startPingMonitoring();

            // Server handles missing sessions automatically
            if (this.onConnect) {
                this.onConnect();
            }
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.stopPingMonitoring();

            if (this.onDisconnect) {
                this.onDisconnect();
            }

            // Attempt to reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
                console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

                // Update status with reconnection attempt
                if (this.onReconnectAttempt) {
                    this.onReconnectAttempt(this.reconnectAttempts, this.maxReconnectAttempts, delay);
                }

                setTimeout(() => {
                    this.connect();
                }, delay);
            } else {
                // Max attempts reached
                if (this.onReconnectFailed) {
                    this.onReconnectFailed();
                }
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.connectionQuality.errors++;
        };

        this.ws.onmessage = (event) => {
            try {
                this.connectionQuality.messagesReceived++;
                const message = JSON.parse(event.data);
                
                // Handle ping/pong for latency measurement
                if (message.type === 'pong' && this.connectionQuality.lastPingTime) {
                    const latency = Date.now() - this.connectionQuality.lastPingTime;
                    this.connectionQuality.latency = latency;
                    
                    // Calculate average latency
                    if (this.connectionQuality.avgLatency === 0) {
                        this.connectionQuality.avgLatency = latency;
                    } else {
                        this.connectionQuality.avgLatency = (this.connectionQuality.avgLatency * 0.8) + (latency * 0.2);
                    }
                    return;
                }
                
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                this.connectionQuality.errors++;
            }
        };
    }

    /**
     * Handle incoming WebSocket message
     */
    handleMessage(message) {
        const { type } = message;

        switch (type) {
            case 'session_info':
                console.log('Session info:', message);
                if (this.onSessionInfo) {
                    this.onSessionInfo(message);
                }
                break;

            case 'assistant_message':
                console.log('Assistant message:', message.content);
                if (this.onAssistantMessage) {
                    this.onAssistantMessage(message.content, message.tool_calls || []);
                }
                break;

            case 'tool_use':
                console.log('Tool use:', message.tool, message.summary);
                if (this.onToolUse) {
                    this.onToolUse(message.tool, message.input, message.summary);
                }
                break;

            case 'tool_summary_update':
                console.log('Tool summary update:', message.tool, message.summary);
                if (this.onToolSummaryUpdate) {
                    this.onToolSummaryUpdate(message.tool, message.input, message.summary);
                }
                break;

            case 'text_block':
                console.log('Text block:', message.content);
                if (this.onTextBlock) {
                    this.onTextBlock(message.content);
                }
                break;

            case 'mark_final':
                console.log('Marking current response as final');
                if (this.onMarkFinal) {
                    this.onMarkFinal();
                }
                break;

            case 'processing':
                console.log('Processing status:', message.status);
                if (this.onProcessing) {
                    this.onProcessing(message.status);
                }
                break;

            case 'error':
                console.error('Server error:', message.message);
                if (this.onError) {
                    this.onError(message.message);
                }
                break;

            case 'tts_start':
                console.log('TTS start');
                if (this.onTTSStart) {
                    this.onTTSStart(message.text);
                }
                break;

            case 'tts_audio':
                if (this.onTTSAudio) {
                    this.onTTSAudio(message.data);
                }
                break;

            case 'tts_end':
                console.log('TTS end');
                if (this.onTTSEnd) {
                    this.onTTSEnd();
                }
                break;

            case 'process_stopped':
                console.log('🛑 SERVER CONFIRMED: Process stopped', message.summary);
                // Show as a tool indicator in the UI
                if (window.app && window.app.ui) {
                    window.app.ui.addToolUseIndicator('stop', message.summary, {});
                }
                break;

            case 'server_transcription_result':
                console.log('Server transcription result:', message);
                if (this.onServerTranscriptionResult) {
                    this.onServerTranscriptionResult({
                        text: message.text,
                        is_final: message.is_final,
                        confidence: message.confidence,
                        language: message.language
                    });
                }
                break;

            case 'transcription_status':
                console.log('Transcription status:', message.status);
                if (this.onTranscriptionStatus) {
                    this.onTranscriptionStatus(message.status);
                }
                break;

            case 'server_transcription_started':
                console.log('Server transcription started:', message.session_id);
                if (this.onServerTranscriptionStarted) {
                    this.onServerTranscriptionStarted(message.session_id);
                }
                break;

            case 'server_transcription_stopped':
                console.log('Server transcription stopped');
                if (this.onServerTranscriptionStopped) {
                    this.onServerTranscriptionStopped();
                }
                break;

            case 'transcription_unavailable':
                console.log('Server transcription unavailable, fallback:', message.fallback);
                if (this.onTranscriptionUnavailable) {
                    this.onTranscriptionUnavailable(message.fallback);
                }
                break;

            default:
                console.warn('Unknown message type:', type);
        }
    }

    /**
     * Send user message to server
     */
    sendUserMessage(content) {
        if (!this.connected) {
            console.error('WebSocket not connected');
            return false;
        }

        const message = {
            type: 'user_message',
            content: content
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Send interrupt signal
     */
    sendInterrupt(reason = 'user_stopped') {
        if (!this.connected) {
            return false;
        }

        console.log('🛑 BROWSER SENDING: Interrupt signal to server', reason);

        const message = {
            type: 'interrupt',
            reason: reason
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Send configuration update
     */
    sendConfigUpdate(config) {
        if (!this.connected) {
            return false;
        }

        const message = {
            type: 'config_update',
            config: config
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Start server transcription
     */
    startServerTranscription() {
        if (!this.connected) {
            console.error('WebSocket not connected');
            return false;
        }

        const message = {
            type: 'start_server_transcription'
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Stop server transcription
     */
    stopServerTranscription() {
        if (!this.connected) {
            return false;
        }

        const message = {
            type: 'stop_server_transcription'
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Send audio chunk for server transcription
     */
    sendAudioChunk(audioData) {
        if (!this.connected) {
            return false;
        }

        const message = {
            type: 'audio_chunk',
            data: audioData
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Get transcription status
     */
    getTranscriptionStatus() {
        if (!this.connected) {
            return false;
        }

        const message = {
            type: 'get_transcription_status'
        };

        this.ws.send(JSON.stringify(message));
        this.connectionQuality.messagesSent++;
        return true;
    }

    /**
     * Start ping monitoring for latency measurement
     */
    startPingMonitoring() {
        if (this.pingInterval) return;
        
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.sendPing();
            }
        }, this.pingIntervalMs);
    }

    /**
     * Stop ping monitoring
     */
    stopPingMonitoring() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Send ping to measure latency
     */
    sendPing() {
        if (!this.connected) return;
        
        this.connectionQuality.lastPingTime = Date.now();
        const pingMessage = {
            type: 'ping',
            timestamp: this.connectionQuality.lastPingTime
        };
        
        this.ws.send(JSON.stringify(pingMessage));
        this.connectionQuality.messagesSent++;
    }

    /**
     * Get connection quality metrics
     */
    getConnectionQuality() {
        // Calculate uptime
        if (this.connectionQuality.connectionStart) {
            this.connectionQuality.uptime = Date.now() - this.connectionQuality.connectionStart;
        }
        
        // Calculate message loss rate
        const totalMessages = this.connectionQuality.messagesSent + this.connectionQuality.messagesReceived;
        const errorRate = totalMessages > 0 ? (this.connectionQuality.errors / totalMessages) * 100 : 0;
        
        // Determine connection quality rating
        let qualityRating = 'excellent';
        if (this.connectionQuality.avgLatency > 1000 || errorRate > 5) {
            qualityRating = 'poor';
        } else if (this.connectionQuality.avgLatency > 500 || errorRate > 2) {
            qualityRating = 'fair';
        } else if (this.connectionQuality.avgLatency > 200 || errorRate > 0.5) {
            qualityRating = 'good';
        }
        
        return {
            connected: this.connected,
            latency: Math.round(this.connectionQuality.latency),
            avgLatency: Math.round(this.connectionQuality.avgLatency),
            messagesSent: this.connectionQuality.messagesSent,
            messagesReceived: this.connectionQuality.messagesReceived,
            errors: this.connectionQuality.errors,
            errorRate: Math.round(errorRate * 100) / 100,
            uptime: this.connectionQuality.uptime,
            qualityRating: qualityRating,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Validate session with server
     */
    async validateSession() {
        try {
            const response = await fetch(`/api/sessions/${this.sessionId}/validate`);
            if (response.ok) {
                const data = await response.json();
                return data.valid === true;
            }
            return false;
        } catch (error) {
            console.error('Error validating session:', error);
            return false;
        }
    }
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;
