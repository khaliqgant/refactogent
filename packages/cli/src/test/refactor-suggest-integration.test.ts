import { describe, it, expect } from '@jest/globals';
import { PatternDetector } from '../refactoring/pattern-detector.js';
import { SuggestionEngine } from '../refactoring/suggestion-engine.js';
import { Logger } from '../utils/logger.js';

describe('Refactor Suggest Integration', () => {
  it('should create pattern detector and suggestion engine instances', () => {
    const logger = new Logger(false);
    const patternDetector = new PatternDetector(logger);
    const suggestionEngine = new SuggestionEngine(logger);

    expect(patternDetector).toBeDefined();
    expect(suggestionEngine).toBeDefined();
  });

  it('should have available refactoring patterns', () => {
    const logger = new Logger(false);
    const patternDetector = new PatternDetector(logger);

    const patterns = patternDetector.getAvailablePatterns();

    expect(patterns.length).toBeGreaterThan(0);

    const patternIds = patterns.map(p => p.id);
    expect(patternIds).toContain('extract_function');
    expect(patternIds).toContain('extract_variable');
    expect(patternIds).toContain('simplify_conditional');
    expect(patternIds).toContain('remove_dead_code');
  });

  it('should retrieve specific patterns by ID', () => {
    const logger = new Logger(false);
    const patternDetector = new PatternDetector(logger);

    const extractFunction = patternDetector.getPattern('extract_function');
    expect(extractFunction).toBeDefined();
    expect(extractFunction?.name).toBe('Extract Function');
    expect(extractFunction?.category).toBe('extract');

    const nonExistent = patternDetector.getPattern('non_existent');
    expect(nonExistent).toBeUndefined();
  });

  it('should have proper pattern structure', () => {
    const logger = new Logger(false);
    const patternDetector = new PatternDetector(logger);

    const patterns = patternDetector.getAvailablePatterns();

    for (const pattern of patterns) {
      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBeDefined();
      expect(pattern.description).toBeDefined();
      expect(pattern.category).toBeDefined();
      expect(pattern.complexity).toMatch(/^(simple|moderate|complex)$/);
      expect(pattern.safetyLevel).toMatch(/^(safe|moderate|risky|dangerous)$/);
      expect(Array.isArray(pattern.prerequisites)).toBe(true);
      expect(Array.isArray(pattern.benefits)).toBe(true);
      expect(Array.isArray(pattern.risks)).toBe(true);
    }
  });

  it('should categorize patterns correctly', () => {
    const logger = new Logger(false);
    const patternDetector = new PatternDetector(logger);

    const patterns = patternDetector.getAvailablePatterns();
    const categories = [...new Set(patterns.map(p => p.category))];

    expect(categories).toContain('extract');
    expect(categories).toContain('simplify');
    expect(categories).toContain('optimize');
  });
});
