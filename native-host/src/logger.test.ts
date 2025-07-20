// Simple test for logger functionality
import { Logger, LogLevel, getLogger } from './logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Logger', () => {
  let testLogFile: string;
  let logger: Logger;

  beforeEach(() => {
    // Create a unique test log file
    testLogFile = path.join(os.tmpdir(), `browser-volume-test-${Date.now()}.log`);
    logger = new Logger({
      level: LogLevel.DEBUG,
      enableConsole: false,
      enableFile: true,
      logFile: testLogFile,
      maxFileSize: 1024 * 1024, // 1MB
      maxBackups: 2
    });
  });

  afterEach(() => {
    // Clean up test log file
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
    logger.shutdown();
  });

  test('should create log file and write messages', () => {
    logger.info('Test message', { data: 'test' });
    
    expect(fs.existsSync(testLogFile)).toBe(true);
    
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    expect(logContent).toContain('Test message');
    expect(logContent).toContain('"data":"test"');
    expect(logContent).toContain('[INFO]');
  });

  test('should log errors with stack traces', () => {
    const testError = new Error('Test error');
    logger.error('Error occurred', testError);
    
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    expect(logContent).toContain('Error occurred');
    expect(logContent).toContain('Test error');
    expect(logContent).toContain('[ERROR]');
  });

  test('should respect log levels', () => {
    const infoLogger = new Logger({
      level: LogLevel.INFO,
      enableConsole: false,
      enableFile: true,
      logFile: testLogFile
    });

    infoLogger.debug('Debug message');
    infoLogger.info('Info message');
    
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    expect(logContent).not.toContain('Debug message');
    expect(logContent).toContain('Info message');
    
    infoLogger.shutdown();
  });

  test('should measure performance with timers', async () => {
    // Create a logger with performance tracking enabled
    const perfLogger = new Logger({
      level: LogLevel.DEBUG,
      enableConsole: false,
      enableFile: true,
      logFile: testLogFile,
      enablePerformance: true
    });

    const result = await perfLogger.timeAsync('test-operation', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'completed';
    });

    expect(result).toBe('completed');
    
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    expect(logContent).toContain('PERF: test-operation took');
    
    perfLogger.shutdown();
  });

  test('should sanitize sensitive data', () => {
    logger.info('Login attempt', {
      username: 'testuser',
      password: 'secret123',
      token: 'abc123'
    });

    const logContent = fs.readFileSync(testLogFile, 'utf8');
    expect(logContent).toContain('testuser');
    expect(logContent).not.toContain('secret123');
    expect(logContent).not.toContain('abc123');
    expect(logContent).toContain('[REDACTED]');
  });

  test('should get singleton logger instance', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();
    
    expect(logger1).toBe(logger2);
  });
});

// Test debug mode functionality
describe('Logger Debug Mode', () => {
  beforeEach(() => {
    delete process.env.BROWSER_VOLUME_DEBUG;
  });

  test('should enable debug mode when environment variable is set', () => {
    process.env.BROWSER_VOLUME_DEBUG = 'true';
    
    const debugLogger = new Logger();
    
    // In debug mode, the logger should accept debug level messages
    expect(debugLogger['config'].level).toBe(LogLevel.DEBUG);
    expect(debugLogger['config'].enablePerformance).toBe(true);
  });

  test('should use info level when debug mode is not set', () => {
    const normalLogger = new Logger();
    
    expect(normalLogger['config'].level).toBe(LogLevel.INFO);
    expect(normalLogger['config'].enablePerformance).toBe(false);
  });
});
