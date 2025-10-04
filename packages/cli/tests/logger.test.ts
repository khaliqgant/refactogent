import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Logger } from '../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: {
    log: ReturnType<typeof jest.spyOn>;
    debug: ReturnType<typeof jest.spyOn>;
    warn: ReturnType<typeof jest.spyOn>;
    error: ReturnType<typeof jest.spyOn>;
  };

  beforeEach(() => {
    logger = new Logger();
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Non-verbose mode', () => {
    beforeEach(() => {
      logger = new Logger(false);
    });

    it('should not output debug messages', () => {
      logger.debug('Debug message');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should not output info messages', () => {
      logger.info('Info message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should not output warn messages', () => {
      logger.warn('Warning message');
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should not output error messages', () => {
      logger.error('Error message');
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should always output log messages', () => {
      logger.log('Direct log message');
      expect(consoleSpy.log).toHaveBeenCalledWith('Direct log message');
    });
  });

  describe('Verbose mode', () => {
    beforeEach(() => {
      logger = new Logger(true);
    });

    it('should output debug messages with timestamp', () => {
      logger.debug('Debug message');
      expect(consoleSpy.debug).toHaveBeenCalled();
      const call = consoleSpy.debug.mock.calls[0][0];
      expect(call).toMatch(/\[.*\] DEBUG Debug message/);
    });

    it('should output info messages with timestamp', () => {
      logger.info('Info message');
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toMatch(/\[.*\] INFO  Info message/);
    });

    it('should output warn messages with timestamp', () => {
      logger.warn('Warning message');
      expect(consoleSpy.warn).toHaveBeenCalled();
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toMatch(/\[.*\] WARN  Warning message/);
    });

    it('should output error messages with timestamp', () => {
      logger.error('Error message');
      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toMatch(/\[.*\] ERROR Error message/);
    });

    it('should include context in messages', () => {
      logger.info('Info message', { key: 'value' });
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toMatch(/\[.*\] INFO  Info message {"key":"value"}/);
    });

    it('should always output log messages', () => {
      logger.log('Direct log message');
      expect(consoleSpy.log).toHaveBeenCalledWith('Direct log message');
    });
  });

  describe('Verbose control', () => {
    it('should allow changing verbose mode', () => {
      logger = new Logger(false);
      logger.debug('Debug message');
      expect(consoleSpy.debug).not.toHaveBeenCalled();

      logger.setVerbose(true);
      logger.debug('Debug message');
      expect(consoleSpy.debug).toHaveBeenCalled();
    });
  });
});
