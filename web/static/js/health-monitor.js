/**
 * Health Monitoring System for Claude Assistant
 * Provides real-time health dashboard and session monitoring
 */

class HealthMonitor {
    constructor() {
        this.updateInterval = 5000; // 5 seconds
        this.updateTask = null;
        this.healthData = null;
        this.sessionHealthData = {};
        
        // UI elements
        this.healthPanel = null;
        this.systemHealthEl = null;
        this.sessionsHealthEl = null;
        this.cleanupProgressEl = null;
        
        // Initialize UI
        this.createHealthUI();
        this.bindEvents();
    }

    /**
     * Create the health monitoring UI
     */
    createHealthUI() {
        // Create health panel toggle button in navbar
        const navbar = document.querySelector('.navbar .flex-none:last-child');
        if (navbar) {
            const healthToggle = document.createElement('button');
            healthToggle.id = 'btn-health-toggle';
            healthToggle.className = 'btn btn-ghost btn-circle btn-sm';
            healthToggle.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L7 12.5l2.091 2.091a2.25 2.25 0 01.659 1.591v5.714a2.25 2.25 0 01-2.25 2.25h-2.091a2.25 2.25 0 01-2.25-2.25v-5.714A2.25 2.25 0 013.5 15.091L5.591 13 3.5 10.909A2.25 2.25 0 013.159 9.318V3.604A2.25 2.25 0 015.409 1.354h2.091A2.25 2.25 0 019.75 3.604z" />
                </svg>
            `;
            healthToggle.title = 'System Health';
            navbar.insertBefore(healthToggle, navbar.firstChild);
        }

        // Create health panel
        this.healthPanel = document.createElement('div');
        this.healthPanel.id = 'health-panel';
        this.healthPanel.className = 'health-panel hidden';
        this.healthPanel.innerHTML = `
            <div class="health-panel-header">
                <h3 class="text-lg font-semibold">System Health</h3>
                <button id="btn-close-health" class="btn btn-ghost btn-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="health-panel-content">
                <div id="system-health" class="health-section">
                    <h4 class="text-sm font-medium mb-2">System Overview</h4>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="health-metric">
                            <span class="label">Sessions:</span>
                            <span id="total-sessions" class="value">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Memory:</span>
                            <span id="system-memory" class="value">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">CPU:</span>
                            <span id="system-cpu" class="value">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Cleanups:</span>
                            <span id="active-cleanups" class="value">-</span>
                        </div>
                    </div>
                </div>
                
                <div id="session-health" class="health-section">
                    <h4 class="text-sm font-medium mb-2">Session Health</h4>
                    <div class="session-health-summary">
                        <div class="health-status healthy">
                            <span class="status-dot bg-success"></span>
                            <span>Healthy: <span id="healthy-count">0</span></span>
                        </div>
                        <div class="health-status degraded">
                            <span class="status-dot bg-warning"></span>
                            <span>Degraded: <span id="degraded-count">0</span></span>
                        </div>
                        <div class="health-status critical">
                            <span class="status-dot bg-error"></span>
                            <span>Critical: <span id="critical-count">0</span></span>
                        </div>
                    </div>
                </div>
                
                <div id="current-session" class="health-section">
                    <h4 class="text-sm font-medium mb-2">Current Session</h4>
                    <div id="current-session-details" class="text-xs">
                        <div class="health-metric">
                            <span class="label">Status:</span>
                            <span id="current-session-status" class="value badge badge-xs">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Memory:</span>
                            <span id="current-session-memory" class="value">- MB</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">CPU:</span>
                            <span id="current-session-cpu" class="value">- %</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Requests:</span>
                            <span id="current-session-requests" class="value">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Success Rate:</span>
                            <span id="current-session-success" class="value">- %</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Avg Response:</span>
                            <span id="current-session-response" class="value">- ms</span>
                        </div>
                    </div>
                </div>

                <div id="connection-quality" class="health-section">
                    <h4 class="text-sm font-medium mb-2">Connection Quality</h4>
                    <div class="text-xs">
                        <div class="health-metric">
                            <span class="label">Rating:</span>
                            <span id="connection-rating" class="value badge badge-xs">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Latency:</span>
                            <span id="connection-latency" class="value">- ms</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Messages:</span>
                            <span id="connection-messages" class="value">↑- ↓-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Errors:</span>
                            <span id="connection-errors" class="value">-</span>
                        </div>
                        <div class="health-metric">
                            <span class="label">Uptime:</span>
                            <span id="connection-uptime" class="value">-</span>
                        </div>
                    </div>
                </div>

                <div id="cleanup-progress" class="health-section hidden">
                    <h4 class="text-sm font-medium mb-2">Cleanup in Progress</h4>
                    <div class="cleanup-details">
                        <div class="progress-bar">
                            <div id="cleanup-progress-bar" class="progress-fill"></div>
                            <span id="cleanup-progress-text" class="progress-text">0%</span>
                        </div>
                        <div id="cleanup-operation" class="text-xs mt-1">-</div>
                        <div id="cleanup-errors" class="text-xs text-error mt-1 hidden"></div>
                    </div>
                </div>
            </div>
        `;

        // Add to body
        document.body.appendChild(this.healthPanel);

        // Get references to elements
        this.systemHealthEl = document.getElementById('system-health');
        this.sessionsHealthEl = document.getElementById('session-health');
        this.cleanupProgressEl = document.getElementById('cleanup-progress');
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Health panel toggle
        const toggleBtn = document.getElementById('btn-health-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleHealthPanel());
        }

        // Close button
        const closeBtn = document.getElementById('btn-close-health');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideHealthPanel());
        }

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.healthPanel && !this.healthPanel.contains(e.target) && 
                e.target.id !== 'btn-health-toggle') {
                this.hideHealthPanel();
            }
        });
    }

    /**
     * Start health monitoring
     */
    startMonitoring() {
        if (this.updateTask) return;
        
        console.log('Starting health monitoring');
        this.updateTask = setInterval(() => {
            this.updateHealthData();
        }, this.updateInterval);
        
        // Initial update
        this.updateHealthData();
    }

    /**
     * Stop health monitoring
     */
    stopMonitoring() {
        if (this.updateTask) {
            clearInterval(this.updateTask);
            this.updateTask = null;
            console.log('Stopped health monitoring');
        }
    }

    /**
     * Update health data from API
     */
    async updateHealthData() {
        try {
            // Get system health
            const systemResponse = await fetch('/api/health/system');
            if (systemResponse.ok) {
                this.healthData = await systemResponse.json();
                this.updateSystemHealthUI();
            }

            // Get current session health if we have a session ID
            const sessionId = window.app?.sessionId;
            if (sessionId) {
                const sessionResponse = await fetch(`/api/health/sessions/${sessionId}`);
                if (sessionResponse.ok) {
                    this.sessionHealthData[sessionId] = await sessionResponse.json();
                    this.updateCurrentSessionUI();
                }
            }

            // Check for cleanup progress
            if (sessionId) {
                try {
                    const cleanupResponse = await fetch(`/api/sessions/${sessionId}/cleanup-progress`);
                    if (cleanupResponse.ok) {
                        const cleanupData = await cleanupResponse.json();
                        this.updateCleanupProgressUI(cleanupData);
                    } else {
                        this.hideCleanupProgress();
                    }
                } catch (e) {
                    // No cleanup in progress, hide the section
                    this.hideCleanupProgress();
                }
            }

            // Update connection quality
            this.updateConnectionQualityUI();

        } catch (error) {
            console.warn('Failed to update health data:', error);
        }
    }

    /**
     * Update system health UI
     */
    updateSystemHealthUI() {
        if (!this.healthData) return;

        const data = this.healthData;
        
        // Update system metrics
        document.getElementById('total-sessions').textContent = 
            `${data.total_sessions}/${data.max_sessions}`;
        document.getElementById('system-memory').textContent = 
            `${data.system_resources.memory_percent.toFixed(1)}%`;
        document.getElementById('system-cpu').textContent = 
            `${data.system_resources.cpu_percent.toFixed(1)}%`;
        document.getElementById('active-cleanups').textContent = data.active_cleanups;

        // Update session health counts
        const health = data.session_health;
        document.getElementById('healthy-count').textContent = health.healthy;
        document.getElementById('degraded-count').textContent = health.degraded;
        document.getElementById('critical-count').textContent = health.critical;

        // Update health status indicator in navbar
        const healthBtn = document.getElementById('btn-health-toggle');
        if (healthBtn) {
            healthBtn.classList.remove('text-success', 'text-warning', 'text-error');
            if (health.critical > 0 || health.unresponsive > 0) {
                healthBtn.classList.add('text-error');
            } else if (health.degraded > 0) {
                healthBtn.classList.add('text-warning');
            } else {
                healthBtn.classList.add('text-success');
            }
        }
    }

    /**
     * Update current session UI
     */
    updateCurrentSessionUI() {
        const sessionId = window.app?.sessionId;
        const sessionData = this.sessionHealthData[sessionId];
        
        if (!sessionData) return;

        // Update session status
        const statusEl = document.getElementById('current-session-status');
        statusEl.textContent = sessionData.health_status;
        statusEl.className = `value badge badge-xs badge-${this.getStatusClass(sessionData.health_status)}`;

        // Update resource usage
        document.getElementById('current-session-memory').textContent = 
            `${sessionData.resource_usage.subprocess_memory_mb.toFixed(1)} MB`;
        document.getElementById('current-session-cpu').textContent = 
            `${sessionData.resource_usage.subprocess_cpu_percent.toFixed(1)} %`;

        // Update performance metrics
        document.getElementById('current-session-requests').textContent = 
            sessionData.performance.total_requests;
        document.getElementById('current-session-success').textContent = 
            `${sessionData.performance.success_rate.toFixed(1)} %`;
        document.getElementById('current-session-response').textContent = 
            `${sessionData.performance.avg_response_time_ms.toFixed(0)} ms`;
    }

    /**
     * Update connection quality UI
     */
    updateConnectionQualityUI() {
        const ws = window.app?.ws;
        if (!ws) return;

        const quality = ws.getConnectionQuality();
        
        // Update connection rating
        const ratingEl = document.getElementById('connection-rating');
        ratingEl.textContent = quality.qualityRating;
        ratingEl.className = `value badge badge-xs badge-${this.getQualityClass(quality.qualityRating)}`;

        // Update latency
        document.getElementById('connection-latency').textContent = 
            `${quality.latency || quality.avgLatency} ms`;

        // Update message counts
        document.getElementById('connection-messages').textContent = 
            `↑${quality.messagesSent} ↓${quality.messagesReceived}`;

        // Update errors
        const errorsEl = document.getElementById('connection-errors');
        errorsEl.textContent = `${quality.errors} (${quality.errorRate}%)`;
        errorsEl.className = quality.errors > 0 ? 'value text-warning' : 'value';

        // Update uptime
        const uptimeEl = document.getElementById('connection-uptime');
        if (quality.uptime) {
            const seconds = Math.floor(quality.uptime / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            
            let uptimeText;
            if (hours > 0) {
                uptimeText = `${hours}h ${minutes % 60}m`;
            } else if (minutes > 0) {
                uptimeText = `${minutes}m ${seconds % 60}s`;
            } else {
                uptimeText = `${seconds}s`;
            }
            uptimeEl.textContent = uptimeText;
        } else {
            uptimeEl.textContent = '-';
        }
    }

    /**
     * Get CSS class for connection quality
     */
    getQualityClass(rating) {
        switch (rating) {
            case 'excellent': return 'success';
            case 'good': return 'info';
            case 'fair': return 'warning';
            case 'poor': return 'error';
            default: return 'neutral';
        }
    }

    /**
     * Update cleanup progress UI
     */
    updateCleanupProgressUI(cleanupData) {
        if (!cleanupData) return;

        const section = document.getElementById('cleanup-progress');
        section.classList.remove('hidden');

        const progressBar = document.getElementById('cleanup-progress-bar');
        const progressText = document.getElementById('cleanup-progress-text');
        const operationEl = document.getElementById('cleanup-operation');
        const errorsEl = document.getElementById('cleanup-errors');

        // Update progress
        progressBar.style.width = `${cleanupData.progress_percent}%`;
        progressText.textContent = `${cleanupData.progress_percent.toFixed(0)}%`;
        operationEl.textContent = cleanupData.current_operation;

        // Show errors if any
        if (cleanupData.errors && cleanupData.errors.length > 0) {
            errorsEl.textContent = `Errors: ${cleanupData.errors.join(', ')}`;
            errorsEl.classList.remove('hidden');
        } else {
            errorsEl.classList.add('hidden');
        }

        // Hide section when cleanup is complete
        if (cleanupData.stage === 'completed' || cleanupData.stage === 'failed') {
            setTimeout(() => {
                section.classList.add('hidden');
            }, 3000);
        }
    }

    /**
     * Hide cleanup progress section
     */
    hideCleanupProgress() {
        const section = document.getElementById('cleanup-progress');
        if (section) {
            section.classList.add('hidden');
        }
    }

    /**
     * Get CSS class for health status
     */
    getStatusClass(status) {
        switch (status) {
            case 'healthy': return 'success';
            case 'degraded': return 'warning';
            case 'critical': return 'error';
            case 'unresponsive': return 'error';
            default: return 'neutral';
        }
    }

    /**
     * Toggle health panel visibility
     */
    toggleHealthPanel() {
        if (this.healthPanel.classList.contains('hidden')) {
            this.showHealthPanel();
        } else {
            this.hideHealthPanel();
        }
    }

    /**
     * Show health panel
     */
    showHealthPanel() {
        this.healthPanel.classList.remove('hidden');
        this.startMonitoring();
        this.updateHealthData(); // Immediate update
    }

    /**
     * Hide health panel
     */
    hideHealthPanel() {
        this.healthPanel.classList.add('hidden');
        this.stopMonitoring();
    }
}

// Export for use in other modules
window.HealthMonitor = HealthMonitor;