/**
 * UI Components - Handle UI updates and interactions
 */

import { applyState } from './state-themes.js';

class UIComponents {
    constructor() {
        // Get DOM elements
        this.conversationEl = document.getElementById('conversation');
        this.statusEl = document.getElementById('status-display');
        this.sessionIdEl = document.getElementById('session-id');
        this.connectionStatusEl = document.getElementById('connection-status');

        // Settings elements
        this.settingsPanelEl = document.querySelector('.settings-panel');
        this.toggleSettingsBtn = document.getElementById('btn-toggle-settings');

        // Setup settings panel toggle
        if (this.toggleSettingsBtn) {
            this.toggleSettingsBtn.addEventListener('click', () => {
                this.toggleSettings();
            });
        }
    }

    /**
     * Add user message to conversation
     */
    addUserMessage(content) {
        const messageEl = this.createMessageElement('user', content);
        this.appendMessage(messageEl);
    }

    /**
     * Add assistant message to conversation
     */
    addAssistantMessage(content, toolCalls = []) {
        const messageEl = this.createMessageElement('assistant', content, toolCalls);
        this.appendMessage(messageEl);
    }

    /**
     * Add tool use indicator with new styling
     */
    addToolUseIndicator(toolName, summary, toolInput = null) {
        const indicatorEl = document.createElement('div');
        indicatorEl.className = 'flex justify-start mb-2';

        // Check if this is a download link generation tool
        let downloadLink = '';
        if ((toolName === 'generate_download_link' || toolName === 'mcp__file-downloads__generate_download_link') && toolInput && toolInput.path) {
            const fileName = toolInput.path.split('/').pop();
            downloadLink = `
                <div class="download-link-container mt-2" data-path="${this.escapeHtml(toolInput.path)}">
                    <div class="text-xs opacity-70">Generating download link...</div>
                </div>
            `;
        }

        indicatorEl.innerHTML = `
            <div class="max-w-[80%]">
                <div class="glass-tool-display px-4 py-3 opacity-70">
                    <div class="text-xs font-mono">
                        <strong>${toolName}</strong> — <em>${summary}</em>
                    </div>
                    ${downloadLink}
                </div>
            </div>
        `;

        // Generate download link if needed
        if (downloadLink) {
            setTimeout(() => {
                const container = indicatorEl.querySelector('.download-link-container');
                if (container) {
                    this.generateDownloadLink(container);
                }
            }, 0);
        }

        this.appendMessage(indicatorEl);
        return indicatorEl;
    }

    /**
     * Generate download link
     */
    async generateDownloadLink(container) {
        const path = container.dataset.path;
        const fileName = path.split('/').pop();

        // Get current session ID from window.app
        const sessionId = window.app?.sessionId;
        if (!sessionId) {
            container.innerHTML = '<div style="font-size: 12px; color: #e53e3e;">❌ No active session</div>';
            return;
        }

        try {
            // Generate download token
            const response = await fetch('/api/download/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    file_path: path,
                    expiry_minutes: 10
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate download link');
            }

            const data = await response.json();

            // Display simple download link
            container.innerHTML = `
                <div style="margin-top: 8px; font-size: 13px;">
                    📥 <a href="${data.download_url}" target="_blank" style="color: #667eea; text-decoration: underline;">Download ${this.escapeHtml(fileName)}</a>
                    <span style="color: #999; font-size: 11px; margin-left: 8px;">(expires in 10 min)</span>
                </div>
            `;

        } catch (error) {
            container.innerHTML = '<div style="font-size: 12px; color: #e53e3e;">❌ Failed to generate download link</div>';
            console.error('Download error:', error);
        }
    }

    /**
     * Update tool use indicator with better summary
     */
    updateToolSummary(indicatorEl, newSummary) {
        const summaryEl = indicatorEl.querySelector('.tool-summary');
        if (summaryEl) {
            summaryEl.textContent = newSummary;
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Create message element with new DaisyUI styling
     */
    createMessageElement(role, content, toolCalls = []) {
        const messageEl = document.createElement('div');
        const isUser = role === 'user';

        messageEl.className = `flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`;

        const roleLabel = isUser ? 'You' : 'Claude';
        const bubbleClass = isUser ? 'chat-bubble-primary' : 'chat-bubble-secondary';

        let toolsHtml = '';
        if (toolCalls && toolCalls.length > 0) {
            toolsHtml = toolCalls.map(tool => {
                const count = tool.count ? ` (${tool.count}×)` : '';
                return `<div class="glass-tool-display px-4 py-3 mb-2 opacity-70">
                    <div class="text-xs font-mono"><strong>${tool.name}</strong>${count}</div>
                </div>`;
            }).join('');
        }

        messageEl.innerHTML = `
            <div class="max-w-[80%]">
                <div class="text-xs opacity-70 mb-1 px-2">
                    ${roleLabel}
                    <time class="ml-2">${this.getTimestamp()}</time>
                </div>
                ${toolsHtml}
                <div class="rounded-2xl px-4 py-3 ${bubbleClass}">
                    ${this.escapeHtml(content)}
                </div>
            </div>
        `;

        return messageEl;
    }

    /**
     * Append message to conversation
     */
    appendMessage(messageEl) {
        this.conversationEl.appendChild(messageEl);

        // Scroll to bottom
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    /**
     * Update status display with state theme integration
     */
    setStatus(status, type = 'normal') {
        this.statusEl.textContent = status;

        // Map old status types to new state system
        if (type === 'processing') {
            applyState('processing');
        } else if (type === 'error') {
            applyState('error');
        } else if (type === 'normal') {
            // Check if we should be in idle state
            if (status.includes('Ready') || status.includes('assist')) {
                applyState('idle');
            }
        }
    }

    /**
     * Update session ID display
     */
    setSessionId(sessionId) {
        this.sessionIdEl.textContent = `Session: ${sessionId}`;
    }

    /**
     * Update connection status indicator with state integration
     */
    setConnectionStatus(status) {
        // Update the visual indicator
        if (status === 'connected') {
            this.connectionStatusEl.className = 'w-3 h-3 rounded-full bg-success';
            applyState('idle');
        } else if (status === 'connecting') {
            this.connectionStatusEl.className = 'w-3 h-3 rounded-full bg-warning';
            applyState('connecting');
        } else if (status === 'disconnected') {
            this.connectionStatusEl.className = 'w-3 h-3 rounded-full bg-error';
            applyState('error');
        }
    }

    /**
     * Clear conversation
     */
    clearConversation() {
        this.conversationEl.innerHTML = '';
    }

    /**
     * Toggle settings panel
     */
    toggleSettings() {
        this.settingsPanelEl.classList.toggle('collapsed');
    }

    /**
     * Show browser compatibility warning with modal
     */
    showBrowserWarning(issues) {
        const warningEl = document.getElementById('browser-warning');
        const textEl = document.getElementById('browser-warning-text');

        textEl.innerHTML = `
            <p>Your browser has the following compatibility issues:</p>
            <ul class="list-disc list-inside mt-2 mb-2">
                ${issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
            <p>For the best experience, use Firefox or Chrome.</p>
        `;

        // Show modal using DaisyUI method
        warningEl.showModal();

        // Dismiss button
        const dismissBtn = document.getElementById('btn-dismiss-warning');
        dismissBtn.addEventListener('click', () => {
            warningEl.close();
        });
    }

    /**
     * Populate voice selector
     */
    populateVoiceSelector(voices, selectedVoice) {
        const selectEl = document.getElementById('voice-select');
        selectEl.innerHTML = '';

        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;

            if (selectedVoice && voice.name === selectedVoice.name) {
                option.selected = true;
            }

            selectEl.appendChild(option);
        });
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get formatted timestamp
     */
    getTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Export for use in other modules
window.UIComponents = UIComponents;
