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
    this.connecting = false;
        
    // Health check and connection monitoring
    this.pingInterval = null;
    this.pingTimeout = null;
    this.lastPingTime = null;
    this.healthCheckInterval = 30000; // 30 seconds
    this.pingResponseTimeout = 5000; // 5 seconds
        
    // Message queue for pending messages during reconnection
    this.messageQueue = [];
    this.maxQueueSize = 10;
        
    // Connection state tracking
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting

    // Callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onSessionInfo = null;
    this.onAssistantMessage = null;
    this.onToolUse = null;
    this.onToolSummaryUpdate = null;
    this.onProcessing = null;
    this.onError = null;
    this.onTTSStart = null;
    this.onTTSAudio = null;
    this.onTTSEnd = null;
    this.onStateChange = null;
    this.onSessionInvalid = null;
    this.onReconnectAttempt = null;
    this.onReconnectFailed = null;
    this.onConnectionStateChange = null;
  }

  /**
     * Connect to WebSocket server
     */
  connect() {
    if (this.connecting || this.connected) {
      console.log('Already connecting or connected, skipping connect attempt');
      return;
    }
        
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;

    console.log('Connecting to WebSocket:', wsUrl);
        
    this.setConnectionState('connecting');
    this.connecting = true;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = async () => {
      console.log('WebSocket connected');
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      this.setConnectionState('connected');
            
      // Start health monitoring
      this.startHealthCheck();
            
      // Process queued messages
      await this.processMessageQueue();

      // Validate session on connection/reconnection
      const isValid = await this.validateSession();
      if (!isValid) {
        console.log('Session invalid, triggering session recreation');
        if (this.onSessionInvalid) {
          this.onSessionInvalid();
        }
        return;
      }

      if (this.onConnect) {
        this.onConnect();
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected', event.code, event.reason);
      this.connected = false;
      this.connecting = false;
            
      // Stop health monitoring
      this.stopHealthCheck();

      if (this.onDisconnect) {
        this.onDisconnect();
      }
            
      // Only attempt reconnection if not manually disconnected
      if (event.code !== 1000 && event.code !== 1001) {
        this.attemptReconnection();
      } else {
        this.setConnectionState('disconnected');
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.connecting = false;
            
      // Trigger reconnection on error if not already disconnected
      if (this.connected) {
        this.connected = false;
        this.stopHealthCheck();
        this.attemptReconnection();
      }
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

    case 'tool_summary_update':
      console.log('Tool summary update:', message.tool, message.summary);
      if (this.onToolSummaryUpdate) {
        this.onToolSummaryUpdate(message.tool, message.input, message.summary);
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

    case 'state_change':
      console.log('State change from server:', message.state);
      if (this.onStateChange) {
        this.onStateChange(message.state);
      }
      break;
                
    case 'ping':
      // Respond to ping with pong
      this.sendMessage({ type: 'pong', timestamp: message.timestamp });
      break;
                
    case 'pong':
      // Handle pong response
      this.handlePongResponse(message.timestamp);
      break;

    default:
      console.warn('Unknown message type:', type);
    }
  }

  /**
     * Send user message to server
     */
  sendUserMessage(content) {
    const message = {
      type: 'user_message',
      content: content
    };

    return this.sendMessage(message, true); // Queue this message if disconnected
  }

  /**
     * Send interrupt signal
     */
  sendInterrupt(reason = 'user_stopped') {
    const message = {
      type: 'interrupt',
      reason: reason
    };

    return this.sendMessage(message, false); // Don't queue interrupts
  }

  /**
     * Send configuration update
     */
  sendConfigUpdate(config) {
    const message = {
      type: 'config_update',
      config: config
    };

    return this.sendMessage(message, false); // Don't queue config updates
  }

  /**
     * Send state change to server
     */
  sendStateChange(state) {
    const message = {
      type: 'state_change',
      state: state
    };

    return this.sendMessage(message, false); // Don't queue state changes
  }
    
  /**
     * Generic send message method with reconnection and queueing support
     */
  sendMessage(message, queueOnDisconnect = false) {
    // If connected, send immediately
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        // Connection might be stale, trigger reconnection
        this.handleConnectionFailure();
                
        if (queueOnDisconnect) {
          this.queueMessage(message);
        }
        return false;
      }
    }

    // If not connected but should queue, add to queue and trigger reconnection
    if (queueOnDisconnect) {
      this.queueMessage(message);
      this.attemptReconnection();
      return false; // Message queued, not immediately sent
    }

    // Not connected and shouldn't queue
    console.warn('WebSocket not connected, message dropped:', message.type);
    this.attemptReconnection();
    return false;
  }

  /**
     * Queue message for later sending
     */
  queueMessage(message) {
    // Remove oldest messages if queue is full
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift();
      console.warn('Message queue full, dropping oldest message');
    }
        
    this.messageQueue.push({
      message: message,
      timestamp: Date.now()
    });
        
    console.log(`Message queued (${this.messageQueue.length}/${this.maxQueueSize}):`, message.type);
  }
    
  /**
     * Process queued messages after reconnection
     */
  async processMessageQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }
        
    console.log(`Processing ${this.messageQueue.length} queued messages`);
        
    const messages = [...this.messageQueue];
    this.messageQueue = [];
        
    for (const queuedMessage of messages) {
      // Check if message is not too old (5 minutes)
      if (Date.now() - queuedMessage.timestamp < 300000) {
        this.sendMessage(queuedMessage.message, false);
        // Small delay between messages to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.log('Dropping old queued message:', queuedMessage.message.type);
      }
    }
  }
    
  /**
     * Attempt reconnection with backoff
     */
  attemptReconnection() {
    // Don't start new reconnection if already connecting or at max attempts
    if (this.connecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
        
    this.setConnectionState('reconnecting');
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
    // Update status with reconnection attempt
    if (this.onReconnectAttempt) {
      this.onReconnectAttempt(this.reconnectAttempts, this.maxReconnectAttempts, delay);
    }
        
    setTimeout(() => {
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect();
      } else {
        // Max attempts reached
        this.setConnectionState('disconnected');
        if (this.onReconnectFailed) {
          this.onReconnectFailed();
        }
      }
    }, delay);
  }
    
  /**
     * Handle connection failure (stale connection detected)
     */
  handleConnectionFailure() {
    console.log('Connection failure detected, initiating reconnection');
    this.connected = false;
    this.connecting = false;
    this.stopHealthCheck();
        
    // Close the stale connection
    if (this.ws) {
      this.ws.close();
    }
        
    this.attemptReconnection();
  }
    
  /**
     * Set connection state and notify listeners
     */
  setConnectionState(state) {
    if (this.connectionState !== state) {
      const previousState = this.connectionState;
      this.connectionState = state;
            
      console.log(`Connection state: ${previousState} -> ${state}`);
            
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state, previousState);
      }
    }
  }
    
  /**
     * Start health check monitoring
     */
  startHealthCheck() {
    this.stopHealthCheck(); // Clear any existing interval
        
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, this.healthCheckInterval);
  }
    
  /**
     * Stop health check monitoring
     */
  stopHealthCheck() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
        
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }
    
  /**
     * Send ping to server for health check
     */
  sendPing() {
    const timestamp = Date.now();
    this.lastPingTime = timestamp;
        
    // Set timeout for ping response
    this.pingTimeout = setTimeout(() => {
      console.warn('Ping timeout - connection may be stale');
      this.handleConnectionFailure();
    }, this.pingResponseTimeout);
        
    this.sendMessage({ type: 'ping', timestamp: timestamp });
  }
    
  /**
     * Handle pong response from server
     */
  handlePongResponse(timestamp) {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
        
    if (timestamp === this.lastPingTime) {
      const latency = Date.now() - timestamp;
      console.log(`Ping successful (${latency}ms)`);
    }
  }
    
  /**
     * Get current connection state
     */
  getConnectionState() {
    return this.connectionState;
  }
    
  /**
     * Get number of queued messages
     */
  getQueuedMessageCount() {
    return this.messageQueue.length;
  }

  /**
     * Disconnect WebSocket
     */
  disconnect() {
    this.setConnectionState('disconnected');
    this.stopHealthCheck();
        
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
        
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnection
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
