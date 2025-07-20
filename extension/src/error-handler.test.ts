// Simple test for error handler functionality  
import { ErrorHandler, ErrorType, ErrorSeverity, getErrorHandler } from './error-handler';

// Mock console methods
const consoleSpy = {
  error: jest.spyOn(console, 'error').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  debug: jest.spyOn(console, 'debug').mockImplementation(() => {})
};

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
    // Clear all console spies
    Object.values(consoleSpy).forEach(spy => spy.mockClear());
  });

  afterEach(() => {
    errorHandler.clearErrors();
  });

  test('should handle and categorize errors', () => {
    const testError = new Error('Connection failed');
    
    const extensionError = errorHandler.handleError(
      testError,
      ErrorType.NATIVE_MESSAGING,
      ErrorSeverity.HIGH
    );

    expect(extensionError.type).toBe(ErrorType.NATIVE_MESSAGING);
    expect(extensionError.severity).toBe(ErrorSeverity.HIGH);
    expect(extensionError.message).toBe('Connection failed');
    expect(extensionError.retryable).toBe(true);
    expect(extensionError.userMessage).toContain('communicate with audio');
  });

  test('should provide user-friendly error messages', () => {
    const permissionError = new Error('Permission denied');
    
    const extensionError = errorHandler.handleError(
      permissionError,
      ErrorType.PERMISSION,
      ErrorSeverity.MEDIUM
    );

    expect(extensionError.userMessage).toContain('Permission denied');
    expect(extensionError.retryable).toBe(false);
  });

  test('should track error history', () => {
    const error1 = new Error('First error');
    const error2 = new Error('Second error');

    errorHandler.handleError(error1, ErrorType.AUDIO_CONTROL, ErrorSeverity.LOW);
    errorHandler.handleError(error2, ErrorType.NETWORK, ErrorSeverity.MEDIUM);

    const recentErrors = errorHandler.getRecentErrors(5);
    expect(recentErrors).toHaveLength(2);
    expect(recentErrors[0].message).toBe('Second error'); // Most recent first
    expect(recentErrors[1].message).toBe('First error');
  });

  test('should update connection status', () => {
    errorHandler.updateConnectionStatus({
      isConnected: true,
      status: 'connected'
    });

    const status = errorHandler.getConnectionStatus();
    expect(status.isConnected).toBe(true);
    expect(status.status).toBe('connected');
  });

  test('should retry operations with exponential backoff', async () => {
    let attempts = 0;
    const maxAttempts = 3;

    const operation = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts < maxAttempts) {
        throw new Error(`Attempt ${attempts} failed`);
      }
      return 'success';
    });

    const result = await errorHandler.retry(operation, 'test', {
      maxAttempts,
      baseDelay: 1, // Very short delay for testing
      maxDelay: 10,
      backoffMultiplier: 2
    });

    expect(result).toBe('success');
    expect(attempts).toBe(maxAttempts);
    expect(operation).toHaveBeenCalledTimes(maxAttempts);
  });

  test('should fail after max retry attempts', async () => {
    const operation = jest.fn().mockImplementation(() => {
      throw new Error('Always fails');
    });

    await expect(
      errorHandler.retry(operation, 'test', {
        maxAttempts: 2,
        baseDelay: 1,
        maxDelay: 10,
        backoffMultiplier: 2
      })
    ).rejects.toThrow('Always fails');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('should wrap operations with error handling', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await errorHandler.wrapOperation(
      operation,
      'test-operation',
      ErrorType.AUDIO_CONTROL,
      ErrorSeverity.MEDIUM,
      false // not retryable
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('should sanitize context data', () => {
    const sensitiveContext = {
      username: 'testuser',
      password: 'secret123',
      apiKey: 'abc123',
      normalData: 'visible'
    };

    const extensionError = errorHandler.handleError(
      new Error('Test'),
      ErrorType.UNKNOWN,
      ErrorSeverity.LOW,
      sensitiveContext
    );

    expect(extensionError.context.username).toBe('testuser');
    expect(extensionError.context.password).toBe('[REDACTED]');
    expect(extensionError.context.apiKey).toBe('[REDACTED]');
    expect(extensionError.context.normalData).toBe('visible');
  });

  test('should clear error history', () => {
    errorHandler.handleError(new Error('Test'), ErrorType.UNKNOWN, ErrorSeverity.LOW);
    expect(errorHandler.hasErrors()).toBe(true);

    errorHandler.clearErrors();
    expect(errorHandler.hasErrors()).toBe(false);
    expect(errorHandler.getRecentErrors()).toHaveLength(0);
  });

  test('should detect critical errors', () => {
    errorHandler.handleError(
      new Error('Critical issue'),
      ErrorType.NATIVE_MESSAGING,
      ErrorSeverity.CRITICAL
    );

    expect(errorHandler.hasCriticalErrors()).toBe(true);
  });

  test('should get singleton error handler instance', () => {
    const handler1 = getErrorHandler();
    const handler2 = getErrorHandler();
    
    expect(handler1).toBe(handler2);
  });
});

// Clean up mocks after all tests
afterAll(() => {
  Object.values(consoleSpy).forEach(spy => spy.mockRestore());
});
