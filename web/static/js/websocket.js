/**
 * WebSocket client for real-time communication with backend
 */

class WebSocketClient {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.connected = false;

        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onSessionInfo = null;
        this.onAssistantMessage = null;
        this.onToolUse = null;
        this.onProcessing = null;
        this.onError = null;
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;

        console.log('Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.connected = true;
            this.reconnectAttempts = 0;

            if (this.onConnect) {
                this.onConnect();
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.connected = false;

            if (this.onDisconnect) {
                this.onDisconnect();
            }

            // Attempt to reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
                console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

                setTimeout(() => {
                    this.connect();
                }, delay);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
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
        return true;
    }

    /**
     * Send interrupt signal
     */
    sendInterrupt(reason = 'user_stopped') {
        if (!this.connected) {
            return false;
        }

        const message = {
            type: 'interrupt',
            reason: reason
        };

        this.ws.send(JSON.stringify(message));
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
        return true;
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
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;
