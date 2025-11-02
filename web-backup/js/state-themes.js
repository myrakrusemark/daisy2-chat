// Centralized state theme configuration
// Each state defines its visual appearance and behavior
// State colors are defined in CSS variables (see src/css/input.css)

export const STATE_THEMES = {
    idle: {
        name: 'Idle',
        emoji: '🌙',
        status: 'Ready to assist',
        cssVariable: '--state-idle',  // Reference to CSS variable
        animation: null
    },

    listening: {
        name: 'Listening',
        emoji: '🎤',
        status: '🎤 Listening...',
        cssVariable: '--state-listening',
        animation: 'pulse-glow'
    },

    processing: {
        name: 'Processing',
        emoji: '⚙️',
        status: '⏳ Processing...',
        cssVariable: '--state-processing',
        animation: null
    },

    speaking: {
        name: 'Speaking',
        emoji: '💬',
        status: '💬 Responding...',
        cssVariable: '--state-speaking',
        animation: null
    },

    connecting: {
        name: 'Connecting',
        emoji: '🔗',
        status: '🔗 Connecting...',
        cssVariable: '--state-connecting',
        animation: 'pulse-glow'
    },

    error: {
        name: 'Error',
        emoji: '❌',
        status: '❌ Error occurred',
        cssVariable: '--state-error',
        animation: null
    },

    // Easy to add new states - just add CSS variable in input.css:
    // thinking: {
    //     name: 'Thinking',
    //     emoji: '💭',
    //     status: '💭 Thinking...',
    //     cssVariable: '--state-thinking',  // Define in input.css
    //     animation: null
    // }
};

// Get ordered list of state keys
export const STATE_ORDER = Object.keys(STATE_THEMES);

// Store WebSocket client reference for state sync
let wsClient = null;

// Set WebSocket client for bidirectional state sync
export function setWebSocketClient(client) {
    wsClient = client;
}

// Get current state
export function getCurrentState() {
    return document.body.getAttribute('data-state') || 'idle';
}

// Helper to apply state
export function applyState(stateName, syncToServer = false) {
    const theme = STATE_THEMES[stateName];
    if (!theme) {
        console.warn(`Unknown state: ${stateName}`);
        return;
    }

    // Check if state actually changed
    const currentState = getCurrentState();
    if (currentState === stateName) {
        return; // No change needed
    }

    // Remove all state classes
    STATE_ORDER.forEach(state => {
        document.body.classList.remove(`state-${state}`);
    });

    // Add new state class
    document.body.classList.add(`state-${stateName}`);

    // Update data attribute for reference
    document.body.setAttribute('data-state', stateName);

    // Update status text if element exists
    const statusDisplay = document.getElementById('status-display');
    if (statusDisplay) {
        // For idle state, check wake word toggle
        if (stateName === 'idle') {
            const wakeWordToggle = document.getElementById('wake-word-toggle');
            if (wakeWordToggle && wakeWordToggle.checked) {
                statusDisplay.textContent = 'Ready to assist - Say "Computer"';
            } else {
                statusDisplay.textContent = theme.status;
            }
        } else {
            statusDisplay.textContent = theme.status;
        }
    }

    // Show/hide stop button based on state (using visibility to prevent layout shift)
    const stopBtn = document.getElementById('btn-stop');
    if (stopBtn) {
        const stoppableStates = ['listening', 'processing', 'speaking', 'thinking'];
        if (stoppableStates.includes(stateName)) {
            stopBtn.style.visibility = 'visible';
        } else {
            stopBtn.style.visibility = 'hidden';
        }
    }

    // Show/hide live transcription bubble in listening mode
    const liveTranscription = document.getElementById('live-transcription');
    if (liveTranscription) {
        if (stateName === 'listening') {
            liveTranscription.style.display = '';
        } else {
            liveTranscription.style.display = 'none';
        }
    }

    console.log(`✓ State changed to: ${theme.name}`);

    // Sync state to server if requested and WebSocket is connected
    if (syncToServer && wsClient && wsClient.isConnected()) {
        wsClient.sendStateChange(stateName);
    }
}

// Handle state change from server
export function handleServerStateChange(stateName) {
    // Apply state without syncing back to server (avoid loop)
    applyState(stateName, false);
}
