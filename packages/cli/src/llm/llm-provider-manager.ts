import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface LLMProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
}

export interface LLMProviderResponse {
  content: string;
  tokensUsed: number;
  processingTime: number;
  model: string;
  provider: string;
}

export interface LLMProviderManager {
  getProvider(name: string): LLMProvider | null;
  listProviders(): string[];
  addProvider(config: LLMProviderConfig): void;
  removeProvider(name: string): void;
  callLLM(provider: string, prompt: string, options?: any): Promise<LLMProviderResponse>;
}

export interface LLMProvider {
  name: string;
  call(prompt: string, options?: any): Promise<LLMProviderResponse>;
  validate(): Promise<boolean>;
  getConfig(): LLMProviderConfig;
}

/**
 * LLM Provider Manager
 * Handles API key management, provider configuration, and LLM calls
 * Supports OpenAI, Anthropic, and local LLM providers
 */
export class LLMProviderManager {
  private logger: Logger;
  private providers: Map<string, LLMProvider>;
  private configPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.providers = new Map();
    this.configPath = this.getConfigPath();
    this.loadProviders();
  }

  /**
   * Get provider configuration path
   * Uses standard locations: ~/.refactogent/llm-config.json or .refactor-agent.yaml
   */
  private getConfigPath(): string {
    const homeDir = os.homedir();
    const refactogentDir = path.join(homeDir, '.refactogent');

    // Ensure directory exists
    if (!fs.existsSync(refactogentDir)) {
      fs.mkdirSync(refactogentDir, { recursive: true });
    }

    return path.join(refactogentDir, 'llm-config.json');
  }

  /**
   * Load providers from configuration
   */
  private loadProviders(): void {
    this.logger.info('Loading LLM providers from configuration');

    try {
      // Try to load from dedicated LLM config file
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        this.loadProvidersFromConfig(config);
        return;
      }

      // Try to load from .refactor-agent.yaml
      const yamlPath = '.refactor-agent.yaml';
      if (fs.existsSync(yamlPath)) {
        const yamlConfig = this.loadFromYaml(yamlPath);
        if (yamlConfig.llm?.providers) {
          this.loadProvidersFromConfig(yamlConfig.llm.providers);
          return;
        }
      }

      // Load from environment variables as fallback
      this.loadProvidersFromEnv();
    } catch (error) {
      this.logger.warn('Failed to load LLM providers from configuration', { error });
      this.loadProvidersFromEnv();
    }
  }

  /**
   * Load providers from configuration object
   */
  private loadProvidersFromConfig(config: any): void {
    if (Array.isArray(config)) {
      config.forEach(providerConfig => {
        this.addProvider(providerConfig);
      });
    } else if (config.providers && Array.isArray(config.providers)) {
      config.providers.forEach((providerConfig: any) => {
        this.addProvider(providerConfig);
      });
    }
  }

  /**
   * Load providers from environment variables
   */
  private loadProvidersFromEnv(): void {
    this.logger.info('Loading LLM providers from environment variables');

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.addProvider({
        name: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000'),
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.1'),
        enabled: true,
      });
    }

    // Anthropic Claude
    if (process.env.ANTHROPIC_API_KEY) {
      this.addProvider({
        name: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
        maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4000'),
        temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.1'),
        enabled: true,
      });
    }

    // Local LLM (Ollama)
    if (process.env.OLLAMA_BASE_URL) {
      this.addProvider({
        name: 'ollama',
        apiKey: '', // No API key needed for local
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama2',
        maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '4000'),
        temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.1'),
        enabled: true,
      });
    }
  }

  /**
   * Load configuration from YAML file
   */
  private loadFromYaml(filePath: string): any {
    try {
      const yaml = require('js-yaml');
      const content = fs.readFileSync(filePath, 'utf-8');
      return yaml.load(content);
    } catch (error) {
      this.logger.warn('Failed to load YAML configuration', { filePath, error });
      return {};
    }
  }

  /**
   * Add a new LLM provider
   */
  addProvider(config: LLMProviderConfig): void {
    this.logger.info('Adding LLM provider', { name: config.name, model: config.model });

    const provider = this.createProvider(config);
    this.providers.set(config.name, provider);

    // Save configuration
    this.saveProviders();
  }

  /**
   * Create provider instance based on configuration
   */
  private createProvider(config: LLMProviderConfig): LLMProvider {
    switch (config.name.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(config, this.logger);
      case 'anthropic':
        return new AnthropicProvider(config, this.logger);
      case 'ollama':
        return new OllamaProvider(config, this.logger);
      default:
        throw new Error(`Unsupported LLM provider: ${config.name}`);
    }
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): LLMProvider | null {
    return this.providers.get(name) || null;
  }

  /**
   * List all available providers
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Remove provider
   */
  removeProvider(name: string): void {
    this.logger.info('Removing LLM provider', { name });
    this.providers.delete(name);
    this.saveProviders();
  }

  /**
   * Call LLM with specified provider
   */
  async callLLM(provider: string, prompt: string, options?: any): Promise<LLMProviderResponse> {
    const llmProvider = this.getProvider(provider);
    if (!llmProvider) {
      throw new Error(`LLM provider not found: ${provider}`);
    }

    this.logger.info('Calling LLM', { provider, promptLength: prompt.length });

    try {
      const response = await llmProvider.call(prompt, options);
      this.logger.info('LLM call completed', {
        provider,
        tokensUsed: response.tokensUsed,
        processingTime: response.processingTime,
      });

      return response;
    } catch (error) {
      this.logger.error('LLM call failed', { provider, error });
      throw error;
    }
  }

  /**
   * Save providers to configuration file
   */
  private saveProviders(): void {
    try {
      const config = {
        providers: Array.from(this.providers.values()).map(provider => provider.getConfig()),
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      this.logger.info('LLM providers configuration saved', { path: this.configPath });
    } catch (error) {
      this.logger.error('Failed to save LLM providers configuration', { error });
    }
  }
}

/**
 * OpenAI Provider Implementation
 */
class OpenAIProvider implements LLMProvider {
  public name: string;
  private config: LLMProviderConfig;
  private logger: Logger;

  constructor(config: LLMProviderConfig, logger: Logger) {
    this.name = config.name;
    this.config = config;
    this.logger = logger;
  }

  async call(prompt: string, options?: any): Promise<LLMProviderResponse> {
    const startTime = Date.now();

    // This would integrate with actual OpenAI API
    // For now, return mock response
    const mockResponse = {
      content: `OpenAI response for: ${prompt.substring(0, 100)}...`,
      tokensUsed: Math.floor(Math.random() * 1000) + 500,
      processingTime: Date.now() - startTime,
      model: this.config.model,
      provider: this.config.name,
    };

    return mockResponse;
  }

  async validate(): Promise<boolean> {
    // This would validate the API key with OpenAI
    return this.config.apiKey.length > 0;
  }

  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }
}

/**
 * Anthropic Claude Provider Implementation
 */
class AnthropicProvider implements LLMProvider {
  public name: string;
  private config: LLMProviderConfig;
  private logger: Logger;

  constructor(config: LLMProviderConfig, logger: Logger) {
    this.name = config.name;
    this.config = config;
    this.logger = logger;
  }

  async call(prompt: string, options?: any): Promise<LLMProviderResponse> {
    const startTime = Date.now();

    // This would integrate with actual Anthropic API
    // For now, return mock response
    const mockResponse = {
      content: `Anthropic Claude response for: ${prompt.substring(0, 100)}...`,
      tokensUsed: Math.floor(Math.random() * 1000) + 500,
      processingTime: Date.now() - startTime,
      model: this.config.model,
      provider: this.config.name,
    };

    return mockResponse;
  }

  async validate(): Promise<boolean> {
    // This would validate the API key with Anthropic
    return this.config.apiKey.length > 0;
  }

  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }
}

/**
 * Ollama Local LLM Provider Implementation
 */
class OllamaProvider implements LLMProvider {
  public name: string;
  private config: LLMProviderConfig;
  private logger: Logger;

  constructor(config: LLMProviderConfig, logger: Logger) {
    this.name = config.name;
    this.config = config;
    this.logger = logger;
  }

  async call(prompt: string, options?: any): Promise<LLMProviderResponse> {
    const startTime = Date.now();

    // This would integrate with actual Ollama API
    // For now, return mock response
    const mockResponse = {
      content: `Ollama local LLM response for: ${prompt.substring(0, 100)}...`,
      tokensUsed: Math.floor(Math.random() * 1000) + 500,
      processingTime: Date.now() - startTime,
      model: this.config.model,
      provider: this.config.name,
    };

    return mockResponse;
  }

  async validate(): Promise<boolean> {
    // This would validate connection to Ollama
    return true; // Local provider is always available
  }

  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }
}
