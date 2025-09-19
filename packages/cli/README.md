# refactogent

Safe, incremental code refactoring assistant CLI tool.

## Installation

```bash
npm install -g refactogent
```

## Usage

```bash
# Get help
refactogent --help

# Analyze a project for refactoring opportunities
refactogent refactor-suggest

# Analyze with specific options
refactogent refactor-suggest --format json --max-suggestions 5

# Analyze project safety
refactogent safety-analyze

# Generate comprehensive project analysis
refactogent analyze
```

## Commands

- `refactor-suggest` - Generate intelligent refactoring suggestions
- `analyze` - Comprehensive project analysis and health report
- `safety-analyze` - Analyze project safety for refactoring
- `ast` - Perform AST analysis across languages
- `coverage-analyze` - Analyze test coverage
- `plan` - Propose safe refactoring operations
- `apply` - Apply planned changes
- `test` - Run test harness

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Run locally
npm run dev
```

## License

MIT