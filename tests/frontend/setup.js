/**
 * Jest setup file for frontend tests
 */

// Mock Web APIs that aren't available in jsdom
Object.defineProperty(window, 'MediaRecorder', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    state: 'inactive',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })),
});

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{
        stop: jest.fn(),
        getSettings: () => ({
          sampleRate: 44100,
          channelCount: 1
        })
      }]
    }),
    enumerateDevices: jest.fn().mockResolvedValue([])
  },
});

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    createAnalyser: jest.fn(() => ({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteTimeDomainData: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    createMediaStreamSource: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    createScriptProcessor: jest.fn(() => ({
      onaudioprocess: null,
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    destination: {},
    state: 'running',
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  })),
});

Object.defineProperty(window, 'webkitAudioContext', {
  writable: true,
  value: window.AudioContext,
});

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.CONNECTING,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// WebSocket constants
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3;

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(() => null),
    removeItem: jest.fn(() => null),
    clear: jest.fn(() => null),
  },
  writable: true,
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup fake timers for better test control
jest.useFakeTimers();