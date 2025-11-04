// Simple demo interactions for UI/UX testing
// No backend integration - just visual feedback

import { STATE_THEMES, STATE_ORDER, applyState } from './state-themes.js';

document.addEventListener('DOMContentLoaded', () => {
    const pushToTalkBtn = document.getElementById('btn-push-to-talk');
    const stopBtn = document.getElementById('btn-stop');
    const statusDisplay = document.getElementById('status-display');
    const wakeWordToggle = document.getElementById('wake-word-toggle');
    const conversation = document.getElementById('conversation');

    // Update status based on wake word toggle
    function updateStatus() {
        if (wakeWordToggle.checked) {
            statusDisplay.textContent = window.CLAUDE_CONSTANTS.READY_MESSAGE;
        } else {
            statusDisplay.textContent = 'Ready to assist';
        }
    }

    // Simulate connecting, then connected state
    applyState('connecting');
    setTimeout(() => {
        applyState('idle');
        updateStatus();
    }, 2000);

    // Wake word toggle listener
    wakeWordToggle.addEventListener('change', updateStatus);

    // State switcher buttons - automatically wire up all states
    STATE_ORDER.forEach(stateName => {
        const button = document.getElementById(`state-${stateName}`);
        if (button) {
            button.addEventListener('click', () => applyState(stateName));
        }
    });

    // Push to talk interaction
    let isRecording = false;

    pushToTalkBtn.addEventListener('mousedown', () => {
        isRecording = true;
        pushToTalkBtn.classList.add('btn-active');
        applyState('listening');
    });

    pushToTalkBtn.addEventListener('mouseup', () => {
        if (isRecording) {
            isRecording = false;
            pushToTalkBtn.classList.remove('btn-active');
            applyState('processing');

            // Simulate response
            setTimeout(() => {
                addMessage('user', 'This is a demo message');
                applyState('speaking');

                setTimeout(() => {
                    addMessage('assistant', 'This is a demo response from Claude Assistant. The entire screen changes color to reflect the current state: blue when listening, purple when processing, and green when responding.');
                    applyState('idle');
                }, 2000);
            }, 1500);
        }
    });

    // Stop button
    stopBtn.addEventListener('click', () => {
        isRecording = false;
        pushToTalkBtn.classList.remove('btn-active');
        applyState('idle');
    });

    // Add message to conversation
    function addMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`;

        messageDiv.innerHTML = `
            <div class="max-w-[80%]">
                <div class="text-xs opacity-70 mb-1 px-2">
                    ${role === 'user' ? 'You' : 'Claude'}
                    <time class="ml-2">${new Date().toLocaleTimeString()}</time>
                </div>
                <div class="rounded-2xl px-4 py-3 ${role === 'user' ? 'chat-bubble-primary' : 'chat-bubble-secondary'}">
                    ${text}
                </div>
            </div>
        `;

        // Remove welcome message if exists
        const welcome = conversation.querySelector('.hero');
        if (welcome) {
            welcome.remove();
        }

        conversation.appendChild(messageDiv);
        conversation.scrollTop = conversation.scrollHeight;
    }

    // Session controls
    document.getElementById('btn-new-session').addEventListener('click', () => {
        statusDisplay.textContent = '🔄 New session started';
        setTimeout(() => {
            statusDisplay.textContent = 'Ready to assist';
        }, 2000);
    });

    document.getElementById('btn-clear-conversation').addEventListener('click', () => {
        conversation.innerHTML = `
            <div class="hero min-h-[50vh]">
                <div class="hero-content text-center">
                    <div class="max-w-md">
                        <h1 class="text-3xl sm:text-5xl font-bold mb-4">Welcome to Claude Assistant</h1>
                        <p class="text-base-content/70 mb-6">Click the Push to Talk button below to start a conversation</p>
                        <div class="flex flex-col gap-2 text-sm text-base-content/50">
                            <p>💬 Voice-activated AI assistant</p>
                            <p>🎯 Press and hold to speak</p>
                            <p>⚡ Real-time responses</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        statusDisplay.textContent = 'Conversation cleared';
        setTimeout(() => {
            statusDisplay.textContent = 'Ready to assist';
        }, 2000);
    });
});
