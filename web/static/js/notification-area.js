/**
 * Notification Area Component
 * Displays dynamic workspace notifications at the top of the conversation area
 */

class NotificationArea {
  constructor() {
    this.notificationEl = null;
    this.isVisible = false;
    this.currentSessionId = null;
    
    // Initialize notification area in DOM
    this.initializeNotificationArea();
  }
  
  /**
   * Initialize notification area in the conversation container
   */
  initializeNotificationArea() {
    // Find conversation container
    const conversationEl = document.getElementById('conversation');
    if (!conversationEl) {
      console.error('Conversation element not found for notification area');
      return;
    }
    
    // Create notification container
    this.notificationEl = document.createElement('div');
    this.notificationEl.id = 'notification-area';
    this.notificationEl.className = 'notification-area hidden';
    
    // Insert at the beginning of conversation area
    conversationEl.parentNode.insertBefore(this.notificationEl, conversationEl);
    
    console.log('Notification area initialized');
  }
  
  /**
   * Display notification for a session
   * @param {string} sessionId - Session ID to get notifications for
   */
  async displayNotificationForSession(sessionId) {
    try {
      console.log(`🔔 Fetching notification for session: ${sessionId}`);
      
      // Store current session ID
      this.currentSessionId = sessionId;
      
      // Show loading state while fetching
      this.showLoading();
      
      // Fetch notification content from API
      const response = await fetch(`/api/notifications/${sessionId}`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch notification for session ${sessionId}: ${response.status}`);
        this.hideNotification();
        return;
      }
      
      const data = await response.json();
      
      console.log('📊 Notification API response:', data);
      
      if (data.success && data.notification) {
        if (data.notification.notifications) {
          // Multiple notifications
          console.log(`📋 Processing ${data.notification.notifications.length} notifications`);
          this.showMultipleNotifications(data.notification.notifications);
        } else {
          // Single notification (legacy format)
          console.log('📋 Processing single notification');
          this.showNotification(data.notification);
        }
      } else {
        console.log(`No notification configured for session ${sessionId}`);
        this.hideNotification();
      }
      
    } catch (error) {
      console.error('Error fetching notification:', error);
      this.hideNotification();
    }
  }
  
  /**
   * Show multiple notifications
   * @param {Array} notifications - Array of notification objects
   */
  showMultipleNotifications(notifications) {
    if (!this.notificationEl || !notifications || notifications.length === 0) {
      this.hideNotification();
      return;
    }
    
    // Create container for all notifications (preserve original order from YAML)
    let notificationsHtml = `<div class="notification-container">`;
    
    notifications.forEach((notification, index) => {
      const { content, style = 'info', id = `notification-${index}`, title = '' } = notification;
      
      // Map styles to CSS classes
      const styleClasses = {
        info: 'alert alert-info',
        success: 'alert alert-success',
        warning: 'alert alert-warning',
        error: 'alert alert-error'
      };
      
      const alertClass = styleClasses[style] || styleClasses.info;
      
      // Create title HTML if title exists
      const titleHtml = title ? `<div class="notification-title font-semibold text-sm mb-1">${this.escapeHtml(title)}</div>` : '';
      
      // Add notification HTML (allow HTML content for script outputs)
      notificationsHtml += `
        <div class="${alertClass} notification-content notification-item" data-notification-id="${id}">
          <div class="flex-1">
            ${titleHtml}
            <div class="notification-text">${content}</div>
          </div>
        </div>
      `;
    });
    
    notificationsHtml += `</div>`;
    
    this.notificationEl.innerHTML = notificationsHtml;
    
    // Show notification area
    this.notificationEl.classList.remove('hidden');
    this.isVisible = true;
    
    console.log(`${notifications.length} notifications displayed`);
  }
  
  /**
   * Show notification content (single notification - legacy support)
   * @param {Object} notificationData - Notification data from backend
   */
  showNotification(notificationData) {
    if (!this.notificationEl) {
      console.warn('Notification element not initialized');
      return;
    }
    
    const { content, style = 'info', title = '' } = notificationData;
    
    // Map styles to CSS classes
    const styleClasses = {
      info: 'alert alert-info',
      success: 'alert alert-success',
      warning: 'alert alert-warning',
      error: 'alert alert-error'
    };
    
    const alertClass = styleClasses[style] || styleClasses.info;
    const titleHtml = title ? `<div class="notification-title font-semibold text-sm mb-1">${this.escapeHtml(title)}</div>` : '';
    
    this.notificationEl.innerHTML = `
      <div class="notification-container">
        <div class="${alertClass} notification-content">
          <div class="flex-1">
            ${titleHtml}
            <div class="notification-text">${content}</div>
          </div>
        </div>
      </div>
    `;
    
    // Show notification
    this.notificationEl.classList.remove('hidden');
    this.isVisible = true;
    
    console.log('Notification displayed:', content.substring(0, 50) + '...');
  }
  
  /**
   * Show loading state
   */
  showLoading() {
    if (!this.notificationEl) return;
    
    this.notificationEl.innerHTML = `
      <div class="notification-container">
        <div class="alert alert-info notification-content">
          <div class="flex-1">
            <div class="notification-text">🔄 Loading workspace information...</div>
          </div>
        </div>
      </div>
    `;
    
    this.notificationEl.classList.remove('hidden');
    this.isVisible = true;
    
    console.log('🔄 Notification loading state displayed');
  }
  
  /**
   * Hide notification
   */
  hideNotification() {
    if (!this.notificationEl) return;
    
    this.notificationEl.classList.add('hidden');
    this.notificationEl.innerHTML = '';
    this.isVisible = false;
    
    console.log('Notification hidden');
  }
  
  /**
   * Update notification content for current session
   */
  async refreshNotification() {
    if (this.currentSessionId) {
      await this.displayNotificationForSession(this.currentSessionId);
    }
  }
  
  /**
   * Clear notification cache (useful for development/testing)
   * @param {string} workingDir - Optional working directory to clear cache for
   */
  async clearCache(workingDir = null) {
    try {
      const url = workingDir 
        ? `/api/notifications/cache?working_dir=${encodeURIComponent(workingDir)}`
        : '/api/notifications/cache';
        
      const response = await fetch(url, { method: 'DELETE' });
      
      if (response.ok) {
        console.log('Notification cache cleared');
        // Refresh current notification
        await this.refreshNotification();
      } else {
        console.warn('Failed to clear notification cache');
      }
    } catch (error) {
      console.error('Error clearing notification cache:', error);
    }
  }
  
  /**
   * Check if notification is currently visible
   * @returns {boolean}
   */
  isNotificationVisible() {
    return this.isVisible;
  }
  
  /**
   * Get current notification content
   * @returns {string|null}
   */
  getCurrentContent() {
    if (!this.isVisible || !this.notificationEl) return null;
    
    const textEl = this.notificationEl.querySelector('.notification-text');
    return textEl ? textEl.textContent : null;
  }
  
  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Handle session changes
   * @param {string} sessionId - New session ID
   */
  async onSessionChange(sessionId) {
    console.log(`Session changed to: ${sessionId}`);
    await this.displayNotificationForSession(sessionId);
  }
  
  /**
   * Handle new session creation
   * @param {string} sessionId - New session ID
   */
  async onNewSession(sessionId) {
    console.log(`New session created: ${sessionId}`);
    await this.displayNotificationForSession(sessionId);
  }
}

// Export for use in other modules
window.NotificationArea = NotificationArea;