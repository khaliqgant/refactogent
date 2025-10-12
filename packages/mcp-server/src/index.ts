#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { RefactorContextTool } from "./tools/refactor-context.js";
import { RefactorCheckpointTool } from "./tools/refactor-checkpoint.js";
import { RefactorValidateTool } from "./tools/refactor-validate.js";
import { RefactorImpactTool } from "./tools/refactor-impact.js";
import { RefactorSuggestTool } from "./tools/refactor-suggest.js";
import { RefactorExecuteSafeTool } from "./tools/refactor-execute-safe.js";
import { RefactorDependencyTraceTool } from "./tools/refactor-dependency-trace.js";
import { RefactorTestCoverageTool } from "./tools/refactor-test-coverage.js";
import { ProjectHealthResource } from "./resources/project-health.js";

// Load environment variables
dotenv.config();

// Create server instance
const server = new Server(
  {
    name: "refactogent-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Initialize tools
const refactorContext = new RefactorContextTool();
const refactorCheckpoint = new RefactorCheckpointTool();
const refactorValidate = new RefactorValidateTool();
const refactorImpact = new RefactorImpactTool();

// AI provider configuration (supports multiple providers)
const aiApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
const refactorSuggest = new RefactorSuggestTool(aiApiKey);

const refactorExecuteSafe = new RefactorExecuteSafeTool();
const refactorDependencyTrace = new RefactorDependencyTraceTool();
const refactorTestCoverage = new RefactorTestCoverageTool();

// Initialize resources
const projectHealth = new ProjectHealthResource();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "refactor_context",
        description:
          "Analyze codebase structure and provide rich context for refactoring decisions. Returns files, symbols, dependencies, test coverage, and complexity metrics.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File or directory path to analyze (relative to project root)",
            },
            includeTests: {
              type: "boolean",
              description: "Include test coverage analysis",
              default: true,
            },
            includeDependencies: {
              type: "boolean",
              description: "Map import/export dependency relationships",
              default: true,
            },
          },
          required: ["path"],
        },
      },
      {
        name: "refactor_checkpoint",
        description:
          "Create a safety checkpoint (git stash) before refactoring. Allows rollback if something goes wrong.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Description of what's about to change",
            },
            includeUntracked: {
              type: "boolean",
              description: "Include untracked files in checkpoint",
              default: false,
            },
          },
          required: ["message"],
        },
      },
      {
        name: "refactor_validate",
        description:
          "Run tests, linting, and type checking after refactoring changes. Optionally rollback to a checkpoint if validation fails.",
        inputSchema: {
          type: "object",
          properties: {
            checkpointId: {
              type: "string",
              description: "Checkpoint ID to rollback to if validation fails",
            },
            autoRollback: {
              type: "boolean",
              description: "Automatically revert to checkpoint on validation failure",
              default: false,
            },
            skipTests: {
              type: "boolean",
              description: "Skip running tests",
              default: false,
            },
            skipLint: {
              type: "boolean",
              description: "Skip linting",
              default: false,
            },
            skipTypeCheck: {
              type: "boolean",
              description: "Skip type checking",
              default: false,
            },
          },
        },
      },
      {
        name: "refactor_impact",
        description:
          "Analyze the blast radius of changing a file or symbol. Shows direct and transitive dependents, test coverage, and risk score.",
        inputSchema: {
          type: "object",
          properties: {
            targetFile: {
              type: "string",
              description: "File path to analyze impact for",
            },
            targetSymbol: {
              type: "string",
              description: "Optional: specific function, class, or type name to analyze",
            },
          },
          required: ["targetFile"],
        },
      },
      {
        name: "refactor_suggest",
        description:
          "Use AI to analyze code and suggest intelligent refactoring improvements. Supports Claude (Anthropic) and GPT (OpenAI). Returns prioritized suggestions with risk scores and reasoning.",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "File path to analyze for refactoring suggestions",
            },
            focus: {
              type: "string",
              enum: ["types", "duplicates", "complexity", "naming", "structure", "all"],
              description: "Focus area for refactoring suggestions",
              default: "all",
            },
            maxSuggestions: {
              type: "number",
              description: "Maximum number of suggestions to return",
              default: 5,
            },
          },
          required: ["file"],
        },
      },
      {
        name: "refactor_execute_safe",
        description:
          "Safely execute refactoring changes with automatic checkpoint creation, validation, and rollback on failure. The AI's best friend for applying code changes.",
        inputSchema: {
          type: "object",
          properties: {
            changes: {
              type: "array",
              description: "Array of file changes to apply",
              items: {
                type: "object",
                properties: {
                  filePath: {
                    type: "string",
                    description: "Path to the file to change",
                  },
                  operation: {
                    type: "string",
                    enum: ["update", "create", "delete"],
                    description: "Type of operation",
                  },
                  newContent: {
                    type: "string",
                    description: "New file content (required for update/create)",
                  },
                },
                required: ["filePath", "operation"],
              },
            },
            description: {
              type: "string",
              description: "Description of what this refactoring does",
            },
            skipValidation: {
              type: "boolean",
              description: "Skip validation after applying changes",
              default: false,
            },
            autoRollback: {
              type: "boolean",
              description: "Auto-rollback on validation failure",
              default: true,
            },
            skipTests: {
              type: "boolean",
              description: "Skip running tests during validation",
            },
            skipLint: {
              type: "boolean",
              description: "Skip linting during validation",
            },
            skipTypeCheck: {
              type: "boolean",
              description: "Skip type checking during validation",
            },
          },
          required: ["changes", "description"],
        },
      },
      {
        name: "refactor_dependency_trace",
        description:
          "Trace forward and backward dependencies for a file. Shows import chains, what depends on this file, circular dependencies, and unused imports/exports. Essential for understanding impact.",
        inputSchema: {
          type: "object",
          properties: {
            targetFile: {
              type: "string",
              description: "File to trace dependencies for",
            },
            direction: {
              type: "string",
              enum: ["forward", "backward", "both"],
              description: "Direction to trace dependencies",
              default: "both",
            },
            maxDepth: {
              type: "number",
              description: "Maximum depth to trace",
              default: 3,
            },
            includeUnused: {
              type: "boolean",
              description: "Include unused imports/exports analysis",
              default: true,
            },
          },
          required: ["targetFile"],
        },
      },
      {
        name: "refactor_test_coverage",
        description:
          "Analyze REAL test coverage using actual coverage tools (Jest, c8, etc). Shows line/branch/function coverage, uncovered regions, test-to-code ratio, and specific recommendations.",
        inputSchema: {
          type: "object",
          properties: {
            targetPath: {
              type: "string",
              description: "Specific file or directory to analyze (default: project root)",
            },
            generateReport: {
              type: "boolean",
              description: "Generate detailed HTML coverage report",
              default: false,
            },
            threshold: {
              type: "number",
              description: "Minimum coverage percentage required (for validation)",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "refactor_context":
        return await refactorContext.execute(args);

      case "refactor_checkpoint":
        return await refactorCheckpoint.execute(args);

      case "refactor_validate":
        return await refactorValidate.execute(args);

      case "refactor_impact":
        return await refactorImpact.execute(args);

      case "refactor_suggest":
        return await refactorSuggest.execute(args);

      case "refactor_execute_safe":
        return await refactorExecuteSafe.execute(args);

      case "refactor_dependency_trace":
        return await refactorDependencyTrace.execute(args);

      case "refactor_test_coverage":
        return await refactorTestCoverage.execute(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error("Error handling tool call:", error);

    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "refactogent://project-health",
        name: "Project Health Report",
        description:
          "Overall codebase health metrics including complexity, test coverage, and refactoring opportunities",
        mimeType: "application/json",
      },
    ],
  };
});

// Read resource contents
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "refactogent://project-health") {
    const health = await projectHealth.getHealth();

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(health, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Refactogent MCP Server running on stdio");
    console.error("Ready to provide AI-powered refactoring with safety guardrails");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
