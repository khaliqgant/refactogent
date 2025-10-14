import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import {
  RefactorSuggestSchema,
  RefactorSuggestOutput,
  RefactorSuggestion,
} from "../types/index.js";
import { getConfig } from "../config/config-loader.js";

interface AIProvider {
  name: string;
  generateSuggestions(prompt: string): Promise<string>;
}

class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey: string, model?: string, maxTokens?: number, temperature?: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model || "claude-3-5-sonnet-20241022";
    this.maxTokens = maxTokens || 4096;
    this.temperature = temperature || 0.7;
  }

  async generateSuggestions(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].type === "text" ? response.content[0].text : "";
  }
}

class OpenAIProvider implements AIProvider {
  name = "openai";
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey: string, model?: string, maxTokens?: number, temperature?: number) {
    this.apiKey = apiKey;
    this.model = model || "gpt-4-turbo-preview";
    this.maxTokens = maxTokens || 4096;
    this.temperature = temperature || 0.7;
  }

  async generateSuggestions(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }
}

export class RefactorSuggestTool {
  private provider: AIProvider | null = null;

  constructor(apiKey?: string) {
    const config = getConfig();

    // Use config-based API key if not provided
    const effectiveApiKey = apiKey || config.ai.apiKey;

    if (effectiveApiKey) {
      // Use provider from config
      if (config.ai.provider === "openai") {
        this.provider = new OpenAIProvider(
          effectiveApiKey,
          config.ai.model,
          config.ai.maxTokens,
          config.ai.temperature
        );
      } else {
        this.provider = new AnthropicProvider(
          effectiveApiKey,
          config.ai.model,
          config.ai.maxTokens,
          config.ai.temperature
        );
      }
    }
  }

  async execute(args: unknown) {
    const validated = RefactorSuggestSchema.parse(args);
    const { file, focus, maxSuggestions } = validated;

    try {
      console.error(`[refactor_suggest] Analyzing ${file} for ${focus} improvements...`);

      // Check if AI provider is configured
      if (!this.provider) {
        const helpfulError = `AI provider not configured for refactor_suggest.

The refactor_suggest tool requires an API key to generate AI-powered suggestions.

To fix this, configure your MCP server with an API key:

Option 1: Environment Variables
  export ANTHROPIC_API_KEY="your-key-here"
  export AI_PROVIDER="anthropic"  # or "openai"

Option 2: MCP Server Configuration
  In your Claude Code MCP config (~/.claude/config.json or similar):
  {
    "mcpServers": {
      "refactogent": {
        "command": "npx",
        "args": ["-y", "@refactogent/mcp-server"],
        "env": {
          "ANTHROPIC_API_KEY": "your-key-here",
          "AI_PROVIDER": "anthropic"
        }
      }
    }
  }

Option 3: Project Configuration
  Create .refactogent.json in your project root:
  {
    "ai": {
      "provider": "anthropic",
      "apiKey": "your-key-here"
    }
  }

Note: The MCP server runs as a separate process from Claude Code and needs
its own API key. This is different from the API key Claude Code uses.

Why is this needed?
- The MCP server is a standalone Node.js process
- It doesn't have access to Claude Code's API key
- refactor_suggest needs to call the AI API independently

Other refactogent tools (context, impact, checkpoint, validate, etc.) work
without an API key and use static analysis only.`;

        throw new Error(helpfulError);
      }

      // Read the file
      const absolutePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File does not exist: ${file}`);
      }

      const fileContent = fs.readFileSync(absolutePath, "utf-8");
      const lineCount = fileContent.split("\n").length;

      console.error(`[refactor_suggest] File has ${lineCount} lines, sending to ${this.provider.name} AI...`);

      // Generate prompt based on focus area
      const prompt = this.buildPrompt(file, fileContent, focus, maxSuggestions);

      // Call AI provider
      const responseText = await this.provider.generateSuggestions(prompt);

      // Parse the response
      const suggestions = this.parseResponse(responseText, file);

      const output: RefactorSuggestOutput = {
        file,
        focus,
        suggestions: suggestions.slice(0, maxSuggestions),
        totalIssuesFound: suggestions.length,
        analysisTimestamp: new Date().toISOString(),
      };

      console.error(
        `[refactor_suggest] Found ${suggestions.length} suggestions (returning top ${maxSuggestions})`
      );

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(output),
          },
        ],
      };
    } catch (error) {
      console.error("[refactor_suggest] Error:", error);
      throw error;
    }
  }

  private buildPrompt(
    file: string,
    content: string,
    focus: string,
    maxSuggestions: number
  ): string {
    const focusInstructions = {
      types: "Focus on type-related improvements: extracting types, adding type annotations, using more specific types, etc.",
      duplicates: "Focus on code duplication: repeated logic, similar functions, extractable utilities, etc.",
      complexity:
        "Focus on complexity reduction: breaking up large functions, simplifying conditionals, reducing nesting, etc.",
      naming: "Focus on naming improvements: unclear variable names, inconsistent naming, misleading names, etc.",
      structure:
        "Focus on structural improvements: file organization, separation of concerns, modularity, etc.",
      all: "Look for all types of refactoring opportunities across the codebase.",
    };

    return `You are a code refactoring expert. Analyze the following code and suggest up to ${maxSuggestions} refactoring improvements.

${focusInstructions[focus as keyof typeof focusInstructions]}

File: ${file}

\`\`\`
${content}
\`\`\`

For each suggestion, provide:
1. A clear title (e.g., "Extract type definition", "Reduce function complexity")
2. A description of what needs to be refactored
3. The line numbers of the code that should be refactored
4. An explanation of why this refactoring would improve the code
5. A risk score (0-100, where 0 is safe and 100 is risky)
6. The priority (high, medium, low)

Format your response as JSON with this structure:
\`\`\`json
{
  "suggestions": [
    {
      "type": "extract-type",
      "title": "Extract user interface",
      "description": "The inline type annotation should be extracted to a separate interface for reusability",
      "startLine": 10,
      "endLine": 15,
      "reasoning": "Extracting this type will improve reusability and make the code more maintainable",
      "riskScore": 15,
      "priority": "medium",
      "autoApplicable": false
    }
  ]
}
\`\`\`

Important: Only return the JSON, no additional text.`;
  }

  private parseResponse(responseText: string, file: string): RefactorSuggestion[] {
    try {
      // Extract JSON from response (handle code blocks)
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;

      const parsed = JSON.parse(jsonText);

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error("Invalid response format: missing suggestions array");
      }

      return parsed.suggestions.map((s: any, index: number) => ({
        id: `suggestion-${index + 1}`,
        type: s.type || "unknown",
        title: s.title || "Untitled suggestion",
        description: s.description || "",
        targetCode: {
          file,
          startLine: s.startLine || 0,
          endLine: s.endLine || 0,
          code: "", // Would need to extract from file
        },
        estimatedImpact: this.estimateImpact(s.riskScore || 50),
        riskScore: s.riskScore || 50,
        autoApplicable: s.autoApplicable !== undefined ? s.autoApplicable : false,
        reasoning: s.reasoning || "",
        priority: s.priority || "medium",
      }));
    } catch (error) {
      console.error("[refactor_suggest] Failed to parse AI response:", error);
      console.error("Response text:", responseText);

      // Return a fallback suggestion
      return [
        {
          id: "error-1",
          type: "analysis-error",
          title: "Unable to parse suggestions",
          description:
            "The AI analysis completed but the response could not be parsed. Please try again.",
          targetCode: {
            file,
            startLine: 0,
            endLine: 0,
            code: "",
          },
          estimatedImpact: "Unknown",
          riskScore: 0,
          autoApplicable: false,
          reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
          priority: "low",
        },
      ];
    }
  }

  private estimateImpact(riskScore: number): string {
    if (riskScore < 20) {
      return "Low risk, minimal impact";
    } else if (riskScore < 50) {
      return "Medium risk, affects a few files";
    } else if (riskScore < 80) {
      return "High risk, affects many files";
    } else {
      return "Very high risk, requires careful review";
    }
  }

  private formatOutput(output: RefactorSuggestOutput): string {
    const { file, focus, suggestions, totalIssuesFound, analysisTimestamp } = output;

    return `# Refactoring Suggestions

**File**: ${file}
**Focus**: ${focus}
**Analysis timestamp**: ${analysisTimestamp}
**Total issues found**: ${totalIssuesFound}
**Showing**: ${suggestions.length} suggestions

---

${suggestions
  .map(
    (s, i) => `
## ${i + 1}. ${s.title} [${s.priority.toUpperCase()}]

**Type**: ${s.type}
**Lines**: ${s.targetCode.startLine}-${s.targetCode.endLine}
**Risk Score**: ${s.riskScore}/100 ${s.riskScore < 30 ? "🟢" : s.riskScore < 70 ? "🟡" : "🔴"}
**Auto-applicable**: ${s.autoApplicable ? "✅ Yes" : "❌ No"}

${s.description}

**Why this matters**: ${s.reasoning}

**Estimated impact**: ${s.estimatedImpact}
`
  )
  .join("\n---\n")}

---

## Next Steps

1. Review each suggestion and assess its value
2. Create a checkpoint with \`refactor_checkpoint\` before making changes
3. Apply refactorings one at a time
4. Run \`refactor_validate\` after each change to ensure nothing breaks
5. Use \`refactor_impact\` to understand the blast radius of larger changes
`;
  }
}
