# Testing Documentation

This document describes the comprehensive testing infrastructure for the Claude Assistant project.

## Overview

The testing infrastructure includes:
- **Unit Tests**: Fast, isolated tests for individual components
- **Integration Tests**: Tests for component interactions and STT functionality 
- **End-to-End Tests**: Full browser automation tests
- **Performance Tests**: Load testing and resource usage monitoring
- **CI/CD Pipeline**: Automated testing on every commit and PR

## Test Structure

```
tests/
├── unit/                    # Unit tests (pytest)
│   ├── test_whisper_service.py     # STT service tests
│   └── test_session_manager.py     # Session management tests
├── integration/             # Integration tests (pytest)
│   ├── test_parallel_stt.py        # Parallel STT functionality
│   └── test_mcp_server.py          # Existing MCP tests
├── frontend/               # Frontend tests (Jest)
│   ├── setup.js                    # Test environment setup
│   └── test_audio_recording.test.js # Audio/WebSocket tests
├── e2e/                    # End-to-end tests (Playwright)
│   └── parallel_stt.spec.js        # Browser STT tests
├── performance/            # Performance tests (pytest)
│   └── test_stt_performance.py     # Load and stress tests
└── utils/                  # Testing utilities
    └── stt_test_helpers.py          # Helper functions
```

## Running Tests

### Quick Test Run
```bash
# Run all tests
python scripts/run_tests.py

# Run specific test types
python scripts/run_tests.py --unit           # Unit tests only
python scripts/run_tests.py --integration    # Integration tests only
python scripts/run_tests.py --e2e            # End-to-end tests only
python scripts/run_tests.py --performance    # Performance tests only
python scripts/run_tests.py --frontend       # JavaScript tests only
python scripts/run_tests.py --lint           # Linting only

# Fast mode (skip slower tests)
python scripts/run_tests.py --fast
```

### Manual Test Commands
```bash
# Python tests
pytest tests/unit/ -v
pytest tests/integration/ -v  
pytest tests/performance/ -v -s

# JavaScript tests
npm test                    # Jest unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage

# E2E tests  
npx playwright test         # All browsers
npx playwright test --headed # Visible browser
npx playwright test --project=chromium # Specific browser

# Linting
ruff check src/ tests/      # Python linting
ruff format src/ tests/     # Python formatting
npm run lint                # JavaScript linting
mypy src/ --ignore-missing-imports # Type checking
```

## Key Test Features

### Parallel STT Testing
The test suite extensively validates the parallel STT functionality:

```python
# tests/unit/test_whisper_service.py
@pytest.mark.asyncio
async def test_multiple_concurrent_sessions(service):
    """Test multiple concurrent transcription sessions"""
    # Validates that multiple browser sessions can run STT simultaneously
```

```javascript
// tests/e2e/parallel_stt.spec.js  
test('should allow multiple browser tabs to use STT simultaneously', async ({ context }) => {
    // End-to-end validation of parallel STT across browser tabs
});
```

### Performance Monitoring
Performance tests track resource usage and detect regressions:

```python
# tests/performance/test_stt_performance.py
async def test_concurrent_session_startup_performance(service):
    """Test performance when starting multiple sessions concurrently"""
    # Validates startup time, memory usage, and throughput
```

### Browser Compatibility
E2E tests run across multiple browsers:
- Chrome/Chromium
- Firefox
- Safari/WebKit
- Mobile browsers

## CI/CD Pipeline

### GitHub Actions Workflows

#### `.github/workflows/test.yml`
- Runs on every push and PR
- Tests across Python 3.10, 3.11, 3.12
- Includes linting, type checking, unit tests, integration tests
- Docker build verification
- Performance benchmarks on main branch

#### `.github/workflows/pr.yml` 
- Pull request specific checks
- STT regression tests for changes to critical files
- Code quality analysis
- Security scanning
- Performance impact assessment

### Workflow Triggers
- **Push to main/develop**: Full test suite + performance tests
- **Pull requests**: Fast test suite + regression tests  
- **Scheduled**: Weekly full test suite with performance baselines

## Test Configuration

### Jest Configuration (`jest.config.js`)
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70, 
      lines: 70,
      statements: 70
    }
  },
  // ... mocks for MediaRecorder, WebSocket, etc.
};
```

### Playwright Configuration (`playwright.config.js`)
```javascript
module.exports = defineConfig({
  projects: [
    { name: 'chromium', use: { permissions: ['microphone'] } },
    { name: 'firefox' },
    { name: 'webkit' },
    { name: 'Mobile Chrome' },
    { name: 'Mobile Safari' },
  ],
  // ... browser automation setup
});
```

### Pytest Configuration (`pyproject.toml`)
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
# ... async test support
```

## Writing Tests

### Unit Test Example
```python
@pytest.mark.asyncio
async def test_session_isolation(service):
    """Test that STT sessions are properly isolated"""
    # Start multiple sessions
    await service.start_transcription("session-1", callback1)
    await service.start_transcription("session-2", callback2)
    
    # Process audio for each session
    await service.process_audio_chunk("session-1", audio_data1)
    await service.process_audio_chunk("session-2", audio_data2)
    
    # Verify isolation
    assert session1.audio_buffer != session2.audio_buffer
```

### Frontend Test Example  
```javascript
test('should handle multiple WebSocket connections', () => {
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();
  
  // Start STT on both connections
  ws1.send(JSON.stringify({ type: 'start_server_transcription' }));
  ws2.send(JSON.stringify({ type: 'start_server_transcription' }));
  
  // Verify independent operation
  expect(ws1.messages_sent).toHaveLength(1);
  expect(ws2.messages_sent).toHaveLength(1);
});
```

### E2E Test Example
```javascript
test('multiple browser tabs STT', async ({ context }) => {
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  
  // Navigate and start STT on both tabs
  await Promise.all([page1.goto('/'), page2.goto('/')]);
  await Promise.all([page1.click('#voice-button'), page2.click('#voice-button')]);
  
  // Verify both are recording
  await expect(page1.locator('#voice-button')).toHaveClass(/recording/);
  await expect(page2.locator('#voice-button')).toHaveClass(/recording/);
});
```

## Debugging Tests

### Debug Failed Tests
```bash
# Run with verbose output
pytest tests/unit/test_whisper_service.py -v -s

# Run specific test
pytest tests/unit/test_whisper_service.py::test_multiple_concurrent_sessions -v -s

# Debug E2E tests
npx playwright test --debug
npx playwright test --headed --slowMo=1000
```

### Mock Debugging
```python
# Enable mock logging
import logging
logging.getLogger('unittest.mock').setLevel(logging.DEBUG)

# Inspect mock calls
print(f"Callback called {mock_callback.call_count} times")
print(f"Call arguments: {mock_callback.call_args_list}")
```

## Coverage Reports

```bash
# Python coverage
pytest tests/ --cov=src --cov-report=html

# JavaScript coverage  
npm run test:coverage

# View reports
open htmlcov/index.html           # Python
open coverage/lcov-report/index.html  # JavaScript
```

## Performance Baselines

The performance tests establish baselines for:
- **Session startup**: < 100ms average, < 500ms maximum
- **Concurrent sessions**: ≥ 20 simultaneous sessions  
- **Audio processing**: < 50ms latency per chunk
- **Memory usage**: < 100MB per session, < 10MB after cleanup
- **Throughput**: ≥ 50 audio chunks/second

## Continuous Improvement

### Adding New Tests
1. **Unit tests**: Add to `tests/unit/` for new components
2. **Integration tests**: Add to `tests/integration/` for component interactions  
3. **E2E tests**: Add to `tests/e2e/` for user workflows
4. **Performance tests**: Add to `tests/performance/` for critical paths

### Test Maintenance
- Review and update test baselines quarterly
- Monitor test execution time and optimize slow tests
- Update browser compatibility matrix annually
- Refresh performance baselines after major optimizations

## Troubleshooting

### Common Issues

**"ModuleNotFoundError: No module named 'faster_whisper'"**
- Expected in test environment - dependencies are mocked
- Tests use `sys.modules` mocking to simulate whisper functionality

**"Permission denied for microphone"**
- E2E tests grant microphone permissions automatically
- Use `await context.grantPermissions(['microphone'])` in tests

**"WebSocket connection failed"** 
- Ensure test server is running for E2E tests
- Check `webServer` configuration in `playwright.config.js`

**Slow test execution**
- Use `--fast` flag to skip performance tests
- Run specific test suites instead of full suite during development

For more help, see the troubleshooting section in the main README or open an issue.