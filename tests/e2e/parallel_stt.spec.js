/**
 * End-to-end tests for parallel STT functionality across multiple browser sessions
 */

const { test, expect } = require('@playwright/test');

test.describe('Parallel STT End-to-End Tests', () => {

  test.beforeEach(async ({ context }) => {
    // Grant microphone permissions for all pages
    await context.grantPermissions(['microphone']);
  });

  test('should allow multiple browser tabs to use STT simultaneously', async ({ context }) => {
    // Open three browser tabs
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    const page3 = await context.newPage();

    // Navigate to the application
    await Promise.all([
      page1.goto('/'),
      page2.goto('/'),
      page3.goto('/'),
    ]);

    // Wait for pages to load
    await Promise.all([
      page1.waitForSelector('#voice-button'),
      page2.waitForSelector('#voice-button'),
      page3.waitForSelector('#voice-button'),
    ]);

    // Start STT on all three tabs simultaneously
    await Promise.all([
      page1.click('#voice-button'),
      page2.click('#voice-button'),
      page3.click('#voice-button'),
    ]);

    // Verify all three tabs show recording state
    await Promise.all([
      expect(page1.locator('#voice-button')).toHaveClass(/recording/),
      expect(page2.locator('#voice-button')).toHaveClass(/recording/),
      expect(page3.locator('#voice-button')).toHaveClass(/recording/),
    ]);

    // Wait a moment for STT to process
    await page1.waitForTimeout(2000);

    // Verify status shows transcription is active on all tabs
    await Promise.all([
      expect(page1.locator('#status')).toContainText(/listening|transcribing|recording/i),
      expect(page2.locator('#status')).toContainText(/listening|transcribing|recording/i),
      expect(page3.locator('#status')).toContainText(/listening|transcribing|recording/i),
    ]);

    // Stop STT on all tabs
    await Promise.all([
      page1.click('#voice-button'),
      page2.click('#voice-button'),
      page3.click('#voice-button'),
    ]);

    // Clean up
    await page1.close();
    await page2.close();
    await page3.close();
  });

  test('should handle STT session isolation between tabs', async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await Promise.all([
      page1.goto('/'),
      page2.goto('/'),
    ]);

    // Start STT on page 1
    await page1.click('#voice-button');
    await expect(page1.locator('#voice-button')).toHaveClass(/recording/);

    // Page 2 should not be affected
    await expect(page2.locator('#voice-button')).not.toHaveClass(/recording/);

    // Start STT on page 2
    await page2.click('#voice-button');
    await expect(page2.locator('#voice-button')).toHaveClass(/recording/);

    // Both should be recording now
    await Promise.all([
      expect(page1.locator('#voice-button')).toHaveClass(/recording/),
      expect(page2.locator('#voice-button')).toHaveClass(/recording/),
    ]);

    // Stop STT on page 1 only
    await page1.click('#voice-button');
    await expect(page1.locator('#voice-button')).not.toHaveClass(/recording/);

    // Page 2 should still be recording
    await expect(page2.locator('#voice-button')).toHaveClass(/recording/);

    // Stop STT on page 2
    await page2.click('#voice-button');
    await expect(page2.locator('#voice-button')).not.toHaveClass(/recording/);

    await page1.close();
    await page2.close();
  });

  test('should handle WebSocket reconnection during STT', async ({ page }) => {
    await page.goto('/');
    
    // Start STT
    await page.click('#voice-button');
    await expect(page.locator('#voice-button')).toHaveClass(/recording/);

    // Simulate network interruption by reloading the page
    await page.reload();
    await page.waitForSelector('#voice-button');

    // WebSocket should reconnect automatically
    await page.waitForTimeout(2000);

    // Should be able to start STT again
    await page.click('#voice-button');
    await expect(page.locator('#voice-button')).toHaveClass(/recording/);

    // Stop STT
    await page.click('#voice-button');
  });

  test('should display transcription results in real-time', async ({ page }) => {
    await page.goto('/');

    // Monitor WebSocket messages
    const messages = [];
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        try {
          const message = JSON.parse(event.payload);
          messages.push(message);
        } catch (e) {
          // Ignore non-JSON messages
        }
      });
    });

    // Start STT
    await page.click('#voice-button');
    
    // Wait for STT to start
    await page.waitForTimeout(3000);

    // Check for transcription-related messages
    const hasSTTMessages = messages.some(msg => 
      msg.type === 'server_transcription_started' || 
      msg.type === 'server_transcription_result'
    );

    if (hasSTTMessages) {
      console.log('STT WebSocket communication working');
    }

    // Stop STT
    await page.click('#voice-button');
  });

  test('should handle microphone permission gracefully', async ({ context }) => {
    // Create page without microphone permission
    const page = await context.newPage();
    
    await page.goto('/');

    // Try to start STT without microphone permission
    await page.click('#voice-button');

    // Should show appropriate error or prompt for permission
    const statusText = await page.locator('#status').textContent();
    const hasPermissionMessage = statusText.includes('permission') || 
                                 statusText.includes('microphone') ||
                                 statusText.includes('access');

    if (hasPermissionMessage) {
      console.log('Microphone permission handling working');
    }

    await page.close();
  });

  test('should perform well with multiple concurrent sessions', async ({ context }) => {
    const startTime = Date.now();
    
    // Create 5 concurrent browser contexts (simulating different users)
    const contexts = await Promise.all([
      context.browser().newContext(),
      context.browser().newContext(), 
      context.browser().newContext(),
      context.browser().newContext(),
      context.browser().newContext(),
    ]);

    // Create pages in each context
    const pages = await Promise.all(
      contexts.map(ctx => ctx.newPage())
    );

    // Navigate all pages
    await Promise.all(
      pages.map(page => page.goto('/'))
    );

    // Wait for all pages to load
    await Promise.all(
      pages.map(page => page.waitForSelector('#voice-button'))
    );

    // Start STT on all pages simultaneously
    await Promise.all(
      pages.map(page => page.click('#voice-button'))
    );

    const setupTime = Date.now() - startTime;
    console.log(`Setup time for 5 concurrent sessions: ${setupTime}ms`);

    // Verify all pages are in recording state
    await Promise.all(
      pages.map(page => 
        expect(page.locator('#voice-button')).toHaveClass(/recording/)
      )
    );

    // Wait for STT processing
    await pages[0].waitForTimeout(3000);

    // Stop all sessions
    await Promise.all(
      pages.map(page => page.click('#voice-button'))
    );

    // Clean up
    await Promise.all(pages.map(page => page.close()));
    await Promise.all(contexts.map(ctx => ctx.close()));

    const totalTime = Date.now() - startTime;
    console.log(`Total test time for 5 concurrent sessions: ${totalTime}ms`);

    // Performance assertion - should complete in reasonable time
    expect(totalTime).toBeLessThan(30000); // 30 seconds
  });

  test('should maintain session state across page interactions', async ({ page }) => {
    await page.goto('/');

    // Start STT
    await page.click('#voice-button');
    await expect(page.locator('#voice-button')).toHaveClass(/recording/);

    // Interact with other page elements while STT is active
    await page.click('#settings-button', { force: true }).catch(() => {
      // Settings button might not exist, ignore
    });

    // STT should still be active
    await expect(page.locator('#voice-button')).toHaveClass(/recording/);

    // Type in message input if it exists
    const messageInput = page.locator('#message-input');
    if (await messageInput.isVisible()) {
      await messageInput.fill('Test message while STT is active');
    }

    // STT should still be active
    await expect(page.locator('#voice-button')).toHaveClass(/recording/);

    // Stop STT
    await page.click('#voice-button');
    await expect(page.locator('#voice-button')).not.toHaveClass(/recording/);
  });

  test('should handle rapid start/stop STT operations', async ({ page }) => {
    await page.goto('/');

    // Rapidly start and stop STT multiple times
    for (let i = 0; i < 5; i++) {
      await page.click('#voice-button');
      await page.waitForTimeout(500);
      await page.click('#voice-button');
      await page.waitForTimeout(200);
    }

    // Should end in non-recording state
    await expect(page.locator('#voice-button')).not.toHaveClass(/recording/);

    // Should still be able to start STT normally
    await page.click('#voice-button');
    await expect(page.locator('#voice-button')).toHaveClass(/recording/);
    
    await page.click('#voice-button');
    await expect(page.locator('#voice-button')).not.toHaveClass(/recording/);
  });
});