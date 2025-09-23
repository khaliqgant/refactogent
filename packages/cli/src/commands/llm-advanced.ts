import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { ConfigLoader } from '../config/config-loader.js';
import { LLMProviderManager } from '../llm/llm-provider-manager.js';
import { ContextAwareLLMService } from '../llm/context-aware-llm-service.js';
import { LLMSafetyGates } from '../llm/llm-safety-gates.js';
import { LLMTaskFramework } from '../llm/llm-task-framework.js';
import { LLMExecutionFlow } from '../llm/llm-execution-flow.js';
import { RefactorContextPackage } from '../llm/refactor-context-package.js';

export interface LLMAdvancedCommandOptions {
  operation: 'generate' | 'refactor' | 'analyze' | 'explain' | 'optimize' | 'test' | 'document';
  input: string;
  context?: string;
  projectPath?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enableSafetyChecks?: boolean;
  enableRetries?: boolean;
  maxRetries?: number;
  timeout?: number;
  format?: 'json' | 'yaml' | 'text';
  verbose?: boolean;
}

/**
 * Create the advanced LLM CLI command
 */
export function createLLMAdvancedCommand(): Command {
  const llmAdvancedCommand = new Command('llm-advanced')
    .description(
      'Advanced LLM operations with multiple providers, safety gates, and context awareness'
    )
    .option('-o, --operation <operation>', 'LLM operation type', 'generate')
    .option('-i, --input <input>', 'Input text or code for the operation')
    .option('-c, --context <context>', 'Additional context for the operation')
    .option('-p, --project-path <path>', 'Project path for context analysis', '.')
    .option('--provider <provider>', 'LLM provider to use (openai, anthropic, etc.)')
    .option('--model <model>', 'Specific model to use')
    .option('--temperature <number>', 'Temperature for generation', '0.7')
    .option('--max-tokens <number>', 'Maximum tokens to generate', '2000')
    .option('--enable-safety-checks', 'Enable safety gate checks')
    .option('--enable-retries', 'Enable retry mechanism')
    .option('--max-retries <number>', 'Maximum number of retries', '3')
    .option('--timeout <seconds>', 'Timeout for the operation', '300')
    .option('-f, --format <format>', 'Output format', 'text')
    .option('-v, --verbose', 'Show detailed execution information')
    .action(async (options: LLMAdvancedCommandOptions) => {
      const logger = new Logger();
      const metrics = new RefactoGentMetrics(logger);
      const tracer = new RefactoGentTracer(logger);
      const configLoader = new ConfigLoader(logger);

      try {
        const config = await configLoader.loadConfig(process.cwd());

        if (!options.input) {
          console.error('❌ Input is required. Use --input to specify the text or code.');
          process.exit(1);
        }

        if (options.verbose) {
          console.log('🚀 Starting advanced LLM operation...');
          console.log(`📝 Operation: ${options.operation}`);
          console.log(`📝 Input: ${options.input.substring(0, 100)}...`);
          if (options.context) {
            console.log(`📋 Context: ${options.context.substring(0, 50)}...`);
          }
          console.log(`📁 Project: ${options.projectPath || '.'}`);
          console.log(`🤖 Provider: ${options.provider || 'auto'}`);
          console.log(`🌡️  Temperature: ${options.temperature}`);
          console.log(`🔢 Max Tokens: ${options.maxTokens}`);
        }

        // Initialize services
        const providerManager = new LLMProviderManager(logger, metrics, tracer, config as any);
        const llmService = new ContextAwareLLMService(logger, metrics, tracer, config as any);
        const safetyGates = new LLMSafetyGates(logger, metrics, tracer, config as any);
        const taskFramework = new LLMTaskFramework(logger, metrics, tracer, config as any);
        const executionFlow = new LLMExecutionFlow(logger, metrics, tracer, config as any);
        const contextPackage = new RefactorContextPackage(logger, metrics, tracer, config as any);

        await providerManager.initialize();
        await llmService.initialize();
        await taskFramework.initialize();
        await executionFlow.initialize();

        // Register providers
        await providerManager.registerProviderConfig('openai', {
          apiKey: process.env.OPENAI_API_KEY || '',
          model: options.model || 'gpt-4',
        });

        // Execute operation
        let result: any;
        const startTime = Date.now();

        switch (options.operation) {
          case 'generate':
            result = await llmService.generateWithContext(
              {
                prompt: options.input,
                context: options.context
                  ? { projectPath: options.projectPath, context: options.context }
                  : undefined,
                options: {
                  maxTokens: parseInt(options.maxTokens?.toString() || '2000'),
                  temperature: parseFloat(options.temperature?.toString() || '0.7'),
                },
              },
              options.provider
            );
            break;

          case 'refactor':
            result = await llmService.performRefactoring({
              codeBlock: options.input,
              filePath: options.projectPath || '.',
              projectContext: options.context || '',
              operation: 'extract',
              options: {
                preserveBehavior: true,
                addDocumentation: true,
              },
            });
            break;

          case 'analyze':
            result = await llmService.generateWithContext(
              {
                prompt: `Analyze the following code:\n\n${options.input}\n\nProvide a detailed analysis.`,
                context: options.context
                  ? { projectPath: options.projectPath, context: options.context }
                  : undefined,
                options: {
                  maxTokens: parseInt(options.maxTokens?.toString() || '2000'),
                  temperature: parseFloat(options.temperature?.toString() || '0.3'),
                },
              },
              options.provider
            );
            break;

          case 'explain':
            result = await llmService.generateWithContext(
              {
                prompt: `Explain the following code:\n\n${options.input}\n\nProvide a clear explanation.`,
                context: options.context
                  ? { projectPath: options.projectPath, context: options.context }
                  : undefined,
                options: {
                  maxTokens: parseInt(options.maxTokens?.toString() || '2000'),
                  temperature: parseFloat(options.temperature?.toString() || '0.3'),
                },
              },
              options.provider
            );
            break;

          case 'optimize':
            result = await llmService.generateWithContext(
              {
                prompt: `Optimize the following code:\n\n${options.input}\n\nProvide optimized version with explanations.`,
                context: options.context
                  ? { projectPath: options.projectPath, context: options.context }
                  : undefined,
                options: {
                  maxTokens: parseInt(options.maxTokens?.toString() || '2000'),
                  temperature: parseFloat(options.temperature?.toString() || '0.3'),
                },
              },
              options.provider
            );
            break;

          case 'test':
            result = await llmService.generateWithContext(
              {
                prompt: `Generate tests for the following code:\n\n${options.input}\n\nProvide comprehensive test cases.`,
                context: options.context
                  ? { projectPath: options.projectPath, context: options.context }
                  : undefined,
                options: {
                  maxTokens: parseInt(options.maxTokens?.toString() || '2000'),
                  temperature: parseFloat(options.temperature?.toString() || '0.3'),
                },
              },
              options.provider
            );
            break;

          case 'document':
            result = await llmService.generateWithContext(
              {
                prompt: `Generate documentation for the following code:\n\n${options.input}\n\nProvide comprehensive documentation.`,
                context: options.context
                  ? { projectPath: options.projectPath, context: options.context }
                  : undefined,
                options: {
                  maxTokens: parseInt(options.maxTokens?.toString() || '2000'),
                  temperature: parseFloat(options.temperature?.toString() || '0.3'),
                },
              },
              options.provider
            );
            break;

          default:
            throw new Error(`Unknown operation: ${options.operation}`);
        }

        // Safety checks
        if (options.enableSafetyChecks) {
          const safetyResult = await safetyGates.checkContent(
            result.content || result.refactoredCode || result,
            options.context
          );

          if (!safetyResult.passed) {
            console.log('⚠️  Safety check failed:');
            safetyResult.violations.forEach((violation, index) => {
              console.log(
                `  ${index + 1}. [${violation.severity.toUpperCase()}] ${violation.message}`
              );
            });
          }
        }

        const executionTime = Date.now() - startTime;

        if (options.format === 'json') {
          console.log(
            JSON.stringify(
              {
                operation: options.operation,
                result: result.content || result.refactoredCode || result,
                metadata: result.metadata || {},
                executionTime,
                safetyChecks: options.enableSafetyChecks,
              },
              null,
              2
            )
          );
        } else if (options.format === 'yaml') {
          console.log('operation:', options.operation);
          console.log('result:', result.content || result.refactoredCode || result);
          console.log('executionTime:', executionTime);
          console.log('safetyChecks:', options.enableSafetyChecks);
        } else {
          // Text output
          console.log('✅ LLM operation completed successfully');
          console.log(`⏱️  Execution time: ${executionTime}ms`);
          console.log(`🤖 Provider: ${result.context?.provider || 'unknown'}`);
          console.log(`🔢 Tokens: ${result.context?.totalTokens || 'unknown'}`);
          console.log(`💰 Cost: $${result.metadata?.cost || '0.00'}`);
          console.log(`🎯 Confidence: ${result.metadata?.confidence || 'N/A'}`);

          console.log('\n📝 Result:');
          console.log(result.content || result.refactoredCode || result);
        }

        // Cleanup
        await providerManager.close();
        await llmService.close();
        await taskFramework.close();
        await executionFlow.close();
        await contextPackage.close();
      } catch (error) {
        console.error('❌ LLM operation failed:', error);
        process.exit(1);
      }
    });

  return llmAdvancedCommand;
}
