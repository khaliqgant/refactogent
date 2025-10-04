# CLI Utilities Architecture

This directory contains the utility classes for the RefactoGent CLI, following a
clean separation of concerns.

## Architecture Overview

### Logger (`logger.ts`)

**Purpose**: Simple, dumb logging utility that handles the mechanics of logging.

**Responsibilities**:

- Format log entries with timestamps and levels
- Control verbose vs non-verbose output
- Provide basic logging methods (debug, info, warn, error)
- Simple `log()` method for direct output

**What it does NOT do**:

- Format pretty output
- Handle business logic about what to log
- Make decisions about when to show information

### OutputFormatter (`output-formatter.ts`)

**Purpose**: Pure formatting utility that creates pretty output strings.

**Responsibilities**:

- Format headers, info, success, error messages
- Create statistics displays
- Format file lists and help text
- Generate progress indicators

**What it does NOT do**:

- Actually output anything (just returns formatted strings)
- Handle logging logic
- Make decisions about what to display

### CLI (`index.ts`)

**Purpose**: Orchestrates the application flow and makes decisions about what to
log and when.

**Responsibilities**:

- Decide what information to show to the user
- Choose when to use verbose vs regular logging
- Coordinate between Logger and OutputFormatter
- Handle business logic and user experience

## Benefits of This Architecture

1. **Single Responsibility**: Each class has one clear purpose
2. **Testability**: Easy to test formatting logic separately from logging logic
3. **Reusability**: OutputFormatter can be used in other contexts
4. **Maintainability**: Changes to formatting don't affect logging mechanics
5. **Flexibility**: Easy to add new output formats or logging destinations

## Usage Pattern

```typescript
// CLI decides what to show and when
const logger = new Logger(verbose);
const formatter = new OutputFormatter();

// CLI handles the logic
if (shouldShowInfo) {
  logger.log(formatter.info('Starting process...'));
}

if (verbose) {
  logger.debug('Debug details', { context: data });
}

// CLI decides how to format and display results
logger.log(formatter.stats(statistics));
logger.log(formatter.fileList(files));
```

This separation makes the code more maintainable and follows the principle that
utilities should be simple and focused.
