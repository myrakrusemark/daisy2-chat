/**
 * UI Component Templates
 * Simple template functions for creating reusable UI elements
 */

export const Components = {
  /**
     * Create a chat message element
     * @param {string} role - 'user' or 'assistant'
     * @param {string} text - Message content
     * @param {string} time - Optional timestamp
     * @returns {HTMLElement}
     */
  chatMessage(role, text, time = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-6`;

    const timestamp = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
            <div class="max-w-[80%]">
                <div class="text-xs opacity-70 mb-1 px-2">
                    ${role === 'user' ? 'You' : 'Claude'}
                    <time class="ml-2">${timestamp}</time>
                </div>
                <div class="rounded-2xl px-4 py-3 ${role === 'user' ? 'chat-bubble-primary' : 'chat-bubble-secondary'}">
                    ${text}
                </div>
            </div>
        `;

    return messageDiv;
  },

  /**
     * Create a tool use display element
     * @param {string} toolName - Name of the tool
     * @param {string} summary - Description of what the tool did
     * @param {string} downloadUrl - Optional download link
     * @returns {HTMLElement}
     */
  toolDisplay(toolName, summary, downloadUrl = null) {
    const toolDiv = document.createElement('div');
    toolDiv.className = 'glass-tool-display px-4 py-3 mb-2 opacity-70';

    const content = downloadUrl
      ? `<a href="${downloadUrl}" class="underline italic">
                ${summary}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block ml-1" style="width: 14px; height: 14px; vertical-align: middle;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
            </a>`
      : `<em>${summary}</em>`;

    toolDiv.innerHTML = `
            <div class="text-xs font-mono">
                <strong>${toolName}</strong> — ${content}
            </div>
        `;

    return toolDiv;
  },

  /**
     * Create live transcription bubble
     * @param {string} text - Current transcription
     * @returns {HTMLElement}
     */
  liveTranscription(text) {
    const div = document.createElement('div');
    div.id = 'live-transcription';
    div.className = 'flex justify-end mb-6';

    div.innerHTML = `
            <div class="max-w-[80%]">
                <div class="text-xs opacity-70 mb-1 px-2">
                    You
                    <time class="ml-2">now</time>
                </div>
                <div class="rounded-2xl px-4 py-3 chat-bubble-primary opacity-70">
                    ${text}
                </div>
            </div>
        `;

    return div;
  },

  /**
     * Create welcome hero section
     * @returns {HTMLElement}
     */
  welcomeHero() {
    const div = document.createElement('div');
    div.className = 'hero min-h-[50vh]';

    div.innerHTML = `
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
        `;

    return div;
  },

  /**
     * Create error message element
     * @param {string} message - Error message
     * @returns {HTMLElement}
     */
  errorMessage(message) {
    const div = document.createElement('div');
    div.className = 'flex justify-center mb-6';

    div.innerHTML = `
            <div class="alert alert-error max-w-md">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>${message}</span>
            </div>
        `;

    return div;
  }
};

// Make it available globally for non-module scripts
window.Components = Components;
