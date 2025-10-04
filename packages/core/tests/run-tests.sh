#!/bin/bash

# Test runner script for the indexing implementation
echo "🧪 Running comprehensive test suite for CodebaseIndexer..."

# Build the project first
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Exiting."
    exit 1
fi

# Run the tests
echo "🔍 Running tests..."
npm test

if [ $? -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed."
    exit 1
fi

# Run tests with coverage
echo "📊 Running tests with coverage..."
npm run test:coverage

echo "🎉 Test suite completed!"
