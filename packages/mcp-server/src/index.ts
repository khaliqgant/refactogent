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
const refactorSuggest = new RefactorSuggestTool(process.env.ANTHROPIC_API_KEY);

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
          "Use Claude AI to analyze code and suggest intelligent refactoring improvements. Returns prioritized suggestions with risk scores and reasoning.",
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
