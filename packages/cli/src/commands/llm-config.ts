import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { LLMProviderManager } from '../llm/llm-provider-manager.js';

interface LLMConfigOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  list?: boolean;
  test?: boolean;
  remove?: boolean;
  verbose?: boolean;
}

/**
 * LLM Configuration Management Command
 * Handles API key management, provider setup, and configuration
 */
export function createLLMConfigCommand(): Command {
  const command = new Command('llm-config');

  command
    .description('Manage LLM providers and API keys for RefactoGent')
    .option('-p, --provider <name>', 'LLM provider name (openai, anthropic, ollama)')
    .option('-k, --api-key <key>', 'API key for the provider')
    .option('-m, --model <model>', 'Model name to use')
    .option('-u, --base-url <url>', 'Base URL for the provider')
    .option('--max-tokens <number>', 'Maximum tokens to generate', '4000')
    .option('--temperature <number>', 'Temperature for generation', '0.1')
    .option('-l, --list', 'List configured providers')
    .option('-t, --test', 'Test provider connection')
    .option('-r, --remove', 'Remove provider configuration')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (options: LLMConfigOptions) => {
      const logger = new Logger(!!options.verbose);

      try {
        logger.info('Managing LLM configuration', { options });

        const metrics = new RefactoGentMetrics(logger);
        const tracer = new RefactoGentTracer(logger);
        const config = { repository: { language: ['typescript'] } } as any;
        const providerManager = new LLMProviderManager(logger, metrics, tracer, config);

        if (options.list) {
          // List all configured providers
          const providers = providerManager.listProviders();
          console.log('\n📋 Configured LLM Providers:');

          if (providers.length === 0) {
            console.log('   No providers configured');
            console.log('\n💡 To add a provider, use:');
            console.log('   refactogent llm-config --provider openai --api-key YOUR_KEY');
            console.log('   refactogent llm-config --provider anthropic --api-key YOUR_KEY');
            console.log(
              '   refactogent llm-config --provider ollama --base-url http://localhost:11434'
            );
          } else {
            providers.forEach(provider => {
              const config = provider.getConfig();
              console.log(`\n   ${provider.name}:`);
              console.log(`     Model: ${config.model}`);
              console.log(`     Base URL: ${config.baseUrl || 'default'}`);
              console.log(`     Max Tokens: ${config.maxTokens}`);
              console.log(`     Temperature: ${config.temperature}`);
              console.log(
                `     API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'none'}`
              );
            });
          }
        }

        if (options.remove && options.provider) {
          // Remove provider
          providerManager.removeProvider(options.provider);
          console.log(`✅ Removed provider: ${options.provider}`);
        }

        if (options.provider && options.apiKey) {
          // Add or update provider
          const config = {
            name: options.provider,
            apiKey: options.apiKey,
            baseUrl: options.baseUrl,
            model: options.model || getDefaultModel(options.provider),
            maxTokens: parseInt(String(options.maxTokens || '4000')),
            temperature: parseFloat(String(options.temperature || '0.1')),
            enabled: true,
          };

          await providerManager.registerProviderConfig(options.provider, config);
          console.log(`✅ Configured provider: ${options.provider}`);
          console.log(`   Model: ${config.model}`);
          console.log(`   API Key: ***${config.apiKey.slice(-4)}`);
        }

        if (options.test && options.provider) {
          // Test provider connection
          console.log(`\n🧪 Testing provider: ${options.provider}`);

          const provider = providerManager.getProvider(options.provider);
          if (!provider) {
            console.log(`❌ Provider not found: ${options.provider}`);
            console.log('   Use --list to see available providers');
            return;
          }

          try {
            const isValid = await provider.validate();
            if (isValid) {
              console.log(`✅ Provider ${options.provider} is valid and ready`);

              // Test with a simple prompt
              const testPrompt = 'Hello, this is a test prompt for RefactoGent.';
              const response = await providerManager.callLLM(options.provider, {
                prompt: testPrompt,
                maxTokens: 100
              });

              console.log(`✅ Test call successful:`);
              console.log(`   Tokens used: ${response.usage.totalTokens}`);
              console.log(`   Processing time: ${response.metadata.latency}ms`);
              console.log(`   Model: ${response.metadata.model}`);
            } else {
              console.log(`❌ Provider ${options.provider} validation failed`);
              console.log('   Check your API key and configuration');
            }
          } catch (error) {
            console.log(
              `❌ Provider test failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        if (!options.list && !options.remove && !options.provider && !options.test) {
          // Show help
          console.log('\n🔧 LLM Configuration Management');
          console.log('\nCommands:');
          console.log('  --list                    List configured providers');
          console.log('  --provider <name> --api-key <key>  Add/update provider');
          console.log('  --test --provider <name>   Test provider connection');
          console.log('  --remove --provider <name> Remove provider');
          console.log('\nExamples:');
          console.log('  refactogent llm-config --list');
          console.log('  refactogent llm-config --provider openai --api-key sk-...');
          console.log('  refactogent llm-config --provider anthropic --api-key sk-ant-...');
          console.log(
            '  refactogent llm-config --provider ollama --base-url http://localhost:11434'
          );
          console.log('  refactogent llm-config --test --provider openai');
        }

        logger.info('LLM configuration management completed');
      } catch (error) {
        logger.error('LLM configuration management failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return command;
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'gpt-4';
    case 'anthropic':
      return 'claude-3-sonnet-20240229';
    case 'ollama':
      return 'llama2';
    default:
      return 'gpt-4';
  }
}
