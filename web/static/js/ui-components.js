/**
 * UI Components - Handle UI updates and interactions
 */

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
     * Add tool use indicator
     */
    addToolUseIndicator(toolName, summary, toolInput = null) {
        const indicatorEl = document.createElement('div');
        indicatorEl.className = 'message tool-use';

        // Format tool input for display
        let inputDisplay = '';
        if (toolInput) {
            const inputStr = JSON.stringify(toolInput, null, 2);
            inputDisplay = `<div class="tool-input">${this.escapeHtml(inputStr)}</div>`;
        }

        // Check if this is a download link generation tool
        let downloadButton = '';
        if (toolName === 'generate_download_link' && toolInput && toolInput.path) {
            const fileName = toolInput.path.split('/').pop();
            downloadButton = `
                <div class="download-button-container" style="margin-top: 12px;">
                    <button class="download-link-btn" data-path="${this.escapeHtml(toolInput.path)}" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                        transition: all 0.2s ease;
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 12px rgba(0,0,0,0.15)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)';">
                        📥 Download ${this.escapeHtml(fileName)}
                    </button>
                    <div class="download-status" style="margin-top: 8px; font-size: 12px; color: #666;"></div>
                </div>
            `;
        }

        indicatorEl.innerHTML = `
            <div class="message-header">🔧 Tool Used</div>
            <div class="message-content">
                <span class="tool-badge">${toolName}</span>
                <span class="tool-summary">${summary}</span>
                ${inputDisplay}
                ${downloadButton}
            </div>
            <div class="message-timestamp">${this.getTimestamp()}</div>
        `;

        // Add click handler for download button
        if (downloadButton) {
            setTimeout(() => {
                const btn = indicatorEl.querySelector('.download-link-btn');
                if (btn) {
                    btn.addEventListener('click', () => this.handleDownloadClick(btn));
                }
            }, 0);
        }

        this.appendMessage(indicatorEl);
        return indicatorEl;
    }

    /**
     * Handle download button click
     */
    async handleDownloadClick(button) {
        const path = button.dataset.path;
        const statusEl = button.parentElement.querySelector('.download-status');

        // Get current session ID
        const sessionId = window.sessionManager?.sessionId;
        if (!sessionId) {
            statusEl.textContent = '❌ No active session';
            statusEl.style.color = '#e53e3e';
            return;
        }

        // Disable button and show loading
        button.disabled = true;
        button.style.opacity = '0.6';
        button.style.cursor = 'not-allowed';
        statusEl.textContent = '⏳ Generating download link...';
        statusEl.style.color = '#666';

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

            // Open download URL in new tab
            window.open(data.download_url, '_blank');

            statusEl.innerHTML = `✅ Download started! <span style="font-size: 10px;">(Link expires in 10 min)</span>`;
            statusEl.style.color = '#38a169';

        } catch (error) {
            statusEl.textContent = '❌ Failed to generate download link';
            statusEl.style.color = '#e53e3e';
            console.error('Download error:', error);
        } finally {
            // Re-enable button after 2 seconds
            setTimeout(() => {
                button.disabled = false;
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
            }, 2000);
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
     * Create message element
     */
    createMessageElement(role, content, toolCalls = []) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${role}`;

        const headerText = role === 'user' ? '👤 You' : '🤖 Claude';

        let toolsHtml = '';
        if (toolCalls && toolCalls.length > 0) {
            toolsHtml = '<div class="tools-used">' +
                toolCalls.map(tool => {
                    const count = tool.count ? ` (${tool.count}x)` : '';
                    return `<span class="tool-indicator">${tool.name}${count}</span>`;
                }).join('') +
                '</div>';
        }

        messageEl.innerHTML = `
            <div class="message-header">${headerText}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
            ${toolsHtml}
            <div class="message-timestamp">${this.getTimestamp()}</div>
        `;

        return messageEl;
    }

    /**
     * Append message to conversation
     */
    appendMessage(messageEl) {
        // Remove welcome message if it exists
        const welcomeEl = this.conversationEl.querySelector('.welcome-message');
        if (welcomeEl) {
            welcomeEl.remove();
        }

        this.conversationEl.appendChild(messageEl);

        // Scroll to bottom
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    /**
     * Update status display
     */
    setStatus(status, type = 'normal') {
        this.statusEl.textContent = status;
        this.statusEl.className = 'status-display';

        if (type === 'processing') {
            this.statusEl.classList.add('processing');
        } else if (type === 'error') {
            this.statusEl.classList.add('error');
        }
    }

    /**
     * Update session ID display
     */
    setSessionId(sessionId) {
        this.sessionIdEl.textContent = `Session: ${sessionId}`;
    }

    /**
     * Update connection status indicator
     */
    setConnectionStatus(status) {
        this.connectionStatusEl.className = `status-indicator ${status}`;
    }

    /**
     * Clear conversation
     */
    clearConversation() {
        this.conversationEl.innerHTML = `
            <div class="welcome-message">
                <h2>Conversation Cleared</h2>
                <p>Start a new conversation</p>
            </div>
        `;
    }

    /**
     * Toggle settings panel
     */
    toggleSettings() {
        this.settingsPanelEl.classList.toggle('collapsed');
    }

    /**
     * Show browser compatibility warning
     */
    showBrowserWarning(issues) {
        const warningEl = document.getElementById('browser-warning');
        const textEl = document.getElementById('browser-warning-text');

        textEl.innerHTML = `
            <p>Your browser has the following compatibility issues:</p>
            <ul>
                ${issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
            <p>For the best experience, use Firefox or Chrome.</p>
        `;

        warningEl.classList.remove('hidden');

        // Dismiss button
        const dismissBtn = document.getElementById('btn-dismiss-warning');
        dismissBtn.addEventListener('click', () => {
            warningEl.classList.add('hidden');
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
