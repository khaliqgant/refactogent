# Refactoring Engine

This module provides intelligent refactoring pattern detection and suggestion
generation for Refactogent.

## Overview

The refactoring engine consists of two main components:

1. **PatternDetector** - Identifies refactoring opportunities in code
2. **SuggestionEngine** - Converts opportunities into actionable suggestions
   with implementation plans

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  ProjectAST     │───▶│  PatternDetector │───▶│ RefactoringOpp  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  SafetyScore    │───▶│ SuggestionEngine │◀───│ CoverageReport  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ SuggestionResult│
                       └─────────────────┘
```

## Supported Refactoring Patterns

### Extract Patterns

- **Extract Function** - Extract complex code blocks into separate functions
- **Extract Variable** - Extract complex expressions into well-named variables
- **Extract Class** - Extract related functionality into separate classes
- **Extract Interface** - Extract common behavior into interfaces

### Simplify Patterns

- **Simplify Conditional** - Reduce nested conditional complexity
- **Remove Dead Code** - Eliminate unused imports, variables, and functions
- **Optimize Imports** - Organize and clean up import statements

### Modernize Patterns

- **Replace Magic Numbers** - Convert magic numbers to named constants
- **Improve Naming** - Suggest better variable and function names
- **Modernize Syntax** - Update to modern language features

## Usage

### Basic Pattern Detection

```typescript
import { PatternDetector } from './pattern-detector.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(true);
const detector = new PatternDetector(logger);

const result = await detector.detectOpportunities(projectAST, safetyScore, {
  categories: ['extract', 'simplify'],
  safetyThreshold: 80,
  maxSuggestions: 10,
});

console.log(`Found ${result.opportunities.length} opportunities`);
```

### Comprehensive Suggestion Generation

```typescript
import { SuggestionEngine } from './suggestion-engine.js';

const engine = new SuggestionEngine(logger);

const suggestions = await engine.generateSuggestions(
  projectAST,
  safetyScore,
  coverageReport,
  {
    prioritizeBy: 'safety',
    skillLevel: 'intermediate',
    maxSuggestions: 5,
  }
);

// Access quick wins
console.log(`Quick wins: ${suggestions.quickWins.length}`);

// Access implementation roadmap
console.log(`Roadmap phases: ${suggestions.roadmap.phases.length}`);
```

## Configuration Options

### PatternDetectionOptions

| Option                | Type                    | Description                            | Default        |
| --------------------- | ----------------------- | -------------------------------------- | -------------- |
| `categories`          | `RefactoringCategory[]` | Limit detection to specific categories | All categories |
| `safetyThreshold`     | `number`                | Minimum safety rating (0-100)          | 70             |
| `confidenceThreshold` | `number`                | Minimum confidence level (0-100)       | 60             |
| `maxSuggestions`      | `number`                | Maximum number of suggestions          | 10             |
| `includeRisky`        | `boolean`               | Include risky refactorings             | false          |
| `focusAreas`          | `string[]`              | File patterns to focus on              | All files      |

### SuggestionEngineOptions

| Option                | Type                                              | Description                     | Default        |
| --------------------- | ------------------------------------------------- | ------------------------------- | -------------- |
| `prioritizeBy`        | `'safety' \| 'impact' \| 'effort' \| 'readiness'` | Sorting criteria                | 'safety'       |
| `skillLevel`          | `'beginner' \| 'intermediate' \| 'advanced'`      | Team skill level                | 'intermediate' |
| `maxSuggestions`      | `number`                                          | Maximum suggestions to generate | 10             |
| `includeExperimental` | `boolean`                                         | Include experimental patterns   | false          |
| `timeConstraint`      | `'quick_wins' \| 'moderate' \| 'long_term'`       | Time preference                 | 'moderate'     |

## Safety Considerations

The refactoring engine prioritizes safety through:

1. **Safety Ratings** - Each opportunity has a safety score (0-100)
2. **Prerequisite Checks** - Validates conditions before suggesting refactorings
3. **Risk Assessment** - Identifies potential risks and mitigation strategies
4. **Rollback Plans** - Provides undo mechanisms for each transformation
5. **Validation Rules** - Ensures transformations maintain code correctness

## Output Structure

### RefactoringSuggestion

Each suggestion includes:

- **Opportunity** - The detected refactoring pattern
- **Priority** - Importance level (critical/high/medium/low)
- **Readiness** - Implementation readiness assessment
- **Impact** - Expected benefits across multiple dimensions
- **Implementation** - Detailed step-by-step plan
- **Timeline** - Effort and duration estimates

### SuggestionResult

The complete result provides:

- **Suggestions** - Prioritized list of refactoring suggestions
- **Summary** - Aggregate statistics and metrics
- **Roadmap** - Structured implementation plan with phases
- **Quick Wins** - Low-effort, high-impact opportunities
- **Recommendations** - Strategic guidance for the team

## Error Handling

The engine includes comprehensive error handling:

- Input validation for all parameters
- Graceful degradation when analysis fails
- Detailed error messages with context
- Logging for debugging and monitoring

## Extensibility

The system is designed for extensibility:

1. **Custom Patterns** - Add new refactoring patterns
2. **Language Support** - Extend to new programming languages
3. **Analysis Rules** - Customize detection logic
4. **Output Formats** - Add new result formats

## Performance

The engine is optimized for performance:

- Lazy evaluation of expensive operations
- Caching of analysis results
- Parallel processing where possible
- Memory-efficient data structures

## Testing

Comprehensive test coverage includes:

- Unit tests for individual components
- Integration tests for end-to-end workflows
- Mock data for consistent testing
- Performance benchmarks

## Future Enhancements

Planned improvements:

1. Machine learning-based pattern detection
2. Historical refactoring success tracking
3. Team-specific pattern customization
4. IDE integration for real-time suggestions
5. Automated refactoring execution
