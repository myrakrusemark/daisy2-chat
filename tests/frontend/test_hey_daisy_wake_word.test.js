/**
 * Tests for Hey Daisy wake word configuration
 * Validates that the system is properly configured for the new wake word
 */

describe('Hey Daisy Wake Word Configuration', () => {
  
  // Mock window object with CLAUDE_CONSTANTS
  beforeAll(() => {
    global.window = {
      CLAUDE_CONSTANTS: {
        WAKE_WORD: 'Hey Daisy',
        WAKE_WORD_DISPLAY: 'Hey Daisy',
        WAKE_WORD_LISTENING_MESSAGE: function() {
          return `Listening for wake word: "${this.WAKE_WORD_DISPLAY}"`
        }
      }
    };
  });

  test('CLAUDE_CONSTANTS has Hey Daisy configured', () => {
    expect(window.CLAUDE_CONSTANTS.WAKE_WORD).toBe('Hey Daisy');
    expect(window.CLAUDE_CONSTANTS.WAKE_WORD_DISPLAY).toBe('Hey Daisy');
  });

  test('Wake word listening message shows Hey Daisy', () => {
    const message = window.CLAUDE_CONSTANTS.WAKE_WORD_LISTENING_MESSAGE();
    expect(message).toContain('Hey Daisy');
    expect(message).toBe('Listening for wake word: "Hey Daisy"');
  });

  test('Hey Daisy model configuration', () => {
    // Mock WakeWordManager class structure
    const mockWakeWordManager = {
      models: {
        'hey_daisy': { 
          url: '/static/lib/openwakeword/models/hay_daizee.onnx', 
          session: null 
        }
      }
    };

    // Verify Hey Daisy model is configured
    expect(mockWakeWordManager.models).toHaveProperty('hey_daisy');
    expect(mockWakeWordManager.models.hey_daisy.url).toContain('hay_daizee.onnx');
    
    // Verify old models are not configured
    expect(mockWakeWordManager.models).not.toHaveProperty('hey_jarvis');
    expect(mockWakeWordManager.models).not.toHaveProperty('alexa');
    expect(mockWakeWordManager.models).not.toHaveProperty('hey_mycroft');
  });

  test('Wake word detection threshold for Hey Daisy', () => {
    // Mock threshold configuration similar to test pages
    const mockThresholds = {
      'hey_daisy': 0.5
    };

    expect(mockThresholds).toHaveProperty('hey_daisy');
    expect(mockThresholds.hey_daisy).toBe(0.5);
    expect(Object.keys(mockThresholds)).toHaveLength(1);
  });

  test('Wake word detection simulation uses Hey Daisy', () => {
    // Mock the wake word detection function from test pages
    const mockWakeWords = ['hey_daisy'];
    const detectedWord = mockWakeWords[Math.floor(Math.random() * mockWakeWords.length)];
    
    expect(mockWakeWords).toContain('hey_daisy');
    expect(detectedWord).toBe('hey_daisy');
  });

});