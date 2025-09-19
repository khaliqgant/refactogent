import { chromium, Browser, Page, BrowserContext, Route } from 'playwright';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface HTTPRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

export interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  duration: number;
}

export interface HTTPInteraction {
  id: string;
  request: HTTPRequest;
  response: HTTPResponse;
  route: string;
  endpoint: string;
}

export interface RecordingSession {
  id: string;
  baseUrl: string;
  startTime: number;
  endTime?: number;
  interactions: HTTPInteraction[];
  metadata: {
    userAgent: string;
    viewport: { width: number; height: number };
    authentication?: {
      type: 'bearer' | 'basic' | 'cookie' | 'custom';
      credentials?: Record<string, string>;
    };
  };
}

export interface RecordingOptions {
  baseUrl: string;
  routes?: string[];
  authentication?: {
    type: 'bearer' | 'basic' | 'cookie' | 'custom';
    credentials?: Record<string, string>;
    loginUrl?: string;
    loginSelector?: string;
    usernameSelector?: string;
    passwordSelector?: string;
  };
  headers?: Record<string, string>;
  timeout?: number;
  maxInteractions?: number;
  ignorePatterns?: string[];
  tolerance?: {
    ignoreHeaders?: string[];
    ignoreFields?: string[];
    timestampFields?: string[];
    dynamicFields?: string[];
  };
}

export class HTTPRecorder {
  private logger: Logger;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private session?: RecordingSession;
  private interactionCount = 0;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start recording HTTP interactions
   */
  async startRecording(options: RecordingOptions): Promise<string> {
    this.logger.info('Starting HTTP recording session', { baseUrl: options.baseUrl });

    // Launch browser
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent: 'Refactogent-Recorder/1.0',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: options.headers || {},
    });

    this.page = await this.context.newPage();

    // Initialize session
    const sessionId = `session-${Date.now()}`;
    this.session = {
      id: sessionId,
      baseUrl: options.baseUrl,
      startTime: Date.now(),
      interactions: [],
      metadata: {
        userAgent: 'Refactogent-Recorder/1.0',
        viewport: { width: 1280, height: 720 },
        authentication: options.authentication,
      },
    };

    // Set up request/response interception
    await this.setupInterception(options);

    // Handle authentication if needed
    if (options.authentication) {
      await this.handleAuthentication(options.authentication);
    }

    this.logger.info('HTTP recording session started', { sessionId });
    return sessionId;
  }

  /**
   * Record interactions for specific routes
   */
  async recordRoutes(routes: string[], options: { timeout?: number } = {}): Promise<HTTPInteraction[]> {
    if (!this.page || !this.session) {
      throw new Error('Recording session not started');
    }

    const timeout = options.timeout || 30000;
    const interactions: HTTPInteraction[] = [];

    for (const route of routes) {
      try {
        this.logger.info('Recording route', { route });

        const url = new URL(route, this.session.baseUrl).toString();
        
        // Navigate to route and wait for network idle
        await this.page.goto(url, { 
          waitUntil: 'networkidle',
          timeout 
        });

        // Wait a bit for any async operations
        await this.page.waitForTimeout(1000);

        // Trigger common interactions
        await this.triggerInteractions();

        this.logger.info('Route recorded successfully', { 
          route, 
          interactions: this.session.interactions.length 
        });

      } catch (error) {
        this.logger.warn('Failed to record route', { 
          route, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    return this.session.interactions;
  }

  /**
   * Stop recording and return session data
   */
  async stopRecording(): Promise<RecordingSession> {
    if (!this.session) {
      throw new Error('No recording session active');
    }

    this.session.endTime = Date.now();

    if (this.browser) {
      await this.browser.close();
    }

    this.logger.info('HTTP recording session completed', {
      sessionId: this.session.id,
      interactions: this.session.interactions.length,
      duration: this.session.endTime - this.session.startTime,
    });

    const completedSession = this.session;
    this.session = undefined;
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;

    return completedSession;
  }

  /**
   * Generate golden tests from recorded session
   */
  generateGoldenTests(
    session: RecordingSession,
    options: {
      outputDir: string;
      testFramework?: 'jest' | 'mocha' | 'playwright';
      tolerance?: {
        ignoreHeaders?: string[];
        ignoreFields?: string[];
        timestampFields?: string[];
        dynamicFields?: string[];
      };
    }
  ): string[] {
    const { outputDir, testFramework = 'jest', tolerance } = options;
    const generatedFiles: string[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Group interactions by route
    const routeGroups = this.groupInteractionsByRoute(session.interactions);

    for (const [route, interactions] of Object.entries(routeGroups)) {
      const testFileName = this.sanitizeFileName(`${route}.characterization.test.js`);
      const testFilePath = path.join(outputDir, testFileName);

      const testContent = this.generateTestFile(
        route,
        interactions,
        session,
        testFramework,
        tolerance
      );

      fs.writeFileSync(testFilePath, testContent);
      generatedFiles.push(testFilePath);

      // Generate golden response files
      interactions.forEach((interaction, index) => {
        const goldenFileName = this.sanitizeFileName(
          `${route}.${index}.golden.json`
        );
        const goldenFilePath = path.join(outputDir, goldenFileName);

        const goldenData = this.createGoldenResponse(interaction, tolerance);
        fs.writeFileSync(goldenFilePath, JSON.stringify(goldenData, null, 2));
        generatedFiles.push(goldenFilePath);
      });
    }

    this.logger.info('Generated golden tests', {
      routes: Object.keys(routeGroups).length,
      files: generatedFiles.length,
      outputDir,
    });

    return generatedFiles;
  }

  /**
   * Set up request/response interception
   */
  private async setupInterception(options: RecordingOptions): Promise<void> {
    if (!this.page || !this.session) return;

    await this.page.route('**/*', async (route: Route) => {
      const request = route.request();
      const startTime = Date.now();

      // Skip ignored patterns
      if (options.ignorePatterns?.some(pattern => 
        new RegExp(pattern).test(request.url())
      )) {
        await route.continue();
        return;
      }

      // Continue the request and capture response
      const response = await route.fetch();
      const endTime = Date.now();

      // Skip non-API requests (images, CSS, etc.)
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('application/json') && 
          !contentType.includes('text/html') &&
          !contentType.includes('application/xml')) {
        await route.fulfill({ response });
        return;
      }

      try {
        const body = await response.text();
        
        const interaction: HTTPInteraction = {
          id: `interaction-${this.interactionCount++}`,
          request: {
            method: request.method(),
            url: request.url(),
            headers: request.headers(),
            body: request.postData() || undefined,
            timestamp: startTime,
          },
          response: {
            status: response.status(),
            statusText: response.statusText(),
            headers: response.headers(),
            body,
            timestamp: endTime,
            duration: endTime - startTime,
          },
          route: this.extractRoute(request.url(), this.session!.baseUrl),
          endpoint: new URL(request.url()).pathname,
        };

        this.session!.interactions.push(interaction);

        this.logger.debug('Recorded HTTP interaction', {
          method: interaction.request.method,
          url: interaction.request.url,
          status: interaction.response.status,
          duration: interaction.response.duration,
        });

      } catch (error) {
        this.logger.warn('Failed to record interaction', { 
          url: request.url(), 
          error 
        });
      }

      await route.fulfill({ response });
    });
  }

  /**
   * Handle authentication
   */
  private async handleAuthentication(auth: RecordingOptions['authentication']): Promise<void> {
    if (!this.page || !auth) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.credentials?.token) {
          await this.context?.setExtraHTTPHeaders({
            'Authorization': `Bearer ${auth.credentials.token}`,
          });
        }
        break;

      case 'basic':
        if (auth.credentials?.username && auth.credentials?.password) {
          const credentials = Buffer.from(
            `${auth.credentials.username}:${auth.credentials.password}`
          ).toString('base64');
          await this.context?.setExtraHTTPHeaders({
            'Authorization': `Basic ${credentials}`,
          });
        }
        break;

      case 'cookie':
        if (auth.loginUrl && auth.usernameSelector && auth.passwordSelector) {
          await this.page.goto(auth.loginUrl);
          await this.page.fill(auth.usernameSelector, auth.credentials?.username || '');
          await this.page.fill(auth.passwordSelector, auth.credentials?.password || '');
          
          if (auth.loginSelector) {
            await this.page.click(auth.loginSelector);
            await this.page.waitForNavigation();
          }
        }
        break;

      case 'custom':
        // Custom authentication logic would be implemented here
        this.logger.info('Custom authentication not implemented');
        break;
    }
  }

  /**
   * Trigger common interactions on the page
   */
  private async triggerInteractions(): Promise<void> {
    if (!this.page) return;

    try {
      // Click common interactive elements
      const clickableSelectors = [
        'button:not([disabled])',
        'a[href]:not([href="#"])',
        '[role="button"]',
        'input[type="submit"]',
      ];

      for (const selector of clickableSelectors) {
        const elements = await this.page.$$(selector);
        for (const element of elements.slice(0, 3)) { // Limit to first 3
          try {
            await element.click({ timeout: 1000 });
            await this.page.waitForTimeout(500);
          } catch {
            // Ignore click failures
          }
        }
      }

      // Fill common form fields
      const formSelectors = [
        'input[type="text"]',
        'input[type="email"]',
        'textarea',
        'select',
      ];

      for (const selector of formSelectors) {
        const elements = await this.page.$$(selector);
        for (const element of elements.slice(0, 2)) { // Limit to first 2
          try {
            await element.fill('test-data');
            await this.page.waitForTimeout(300);
          } catch {
            // Ignore fill failures
          }
        }
      }

    } catch (error) {
      this.logger.debug('Error during interaction triggering', { error });
    }
  }

  /**
   * Extract route pattern from URL
   */
  private extractRoute(url: string, baseUrl: string): string {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);
      
      if (urlObj.origin !== baseUrlObj.origin) {
        return url; // External URL
      }

      let pathname = urlObj.pathname;
      
      // Replace common dynamic segments with placeholders
      pathname = pathname.replace(/\/\d+/g, '/:id');
      pathname = pathname.replace(/\/[a-f0-9-]{36}/g, '/:uuid');
      pathname = pathname.replace(/\/[a-f0-9]{24}/g, '/:objectId');
      
      return pathname;
    } catch {
      return url;
    }
  }

  /**
   * Group interactions by route
   */
  private groupInteractionsByRoute(interactions: HTTPInteraction[]): Record<string, HTTPInteraction[]> {
    const groups: Record<string, HTTPInteraction[]> = {};
    
    for (const interaction of interactions) {
      const route = interaction.route;
      if (!groups[route]) {
        groups[route] = [];
      }
      groups[route].push(interaction);
    }
    
    return groups;
  }

  /**
   * Generate test file content
   */
  private generateTestFile(
    route: string,
    interactions: HTTPInteraction[],
    session: RecordingSession,
    framework: string,
    tolerance?: any
  ): string {
    const testName = `Characterization test for ${route}`;
    
    if (framework === 'jest') {
      return this.generateJestTest(testName, route, interactions, session, tolerance);
    } else if (framework === 'playwright') {
      return this.generatePlaywrightTest(testName, route, interactions, session, tolerance);
    }
    
    return this.generateJestTest(testName, route, interactions, session, tolerance);
  }

  /**
   * Generate Jest test
   */
  private generateJestTest(
    testName: string,
    route: string,
    interactions: HTTPInteraction[],
    session: RecordingSession,
    tolerance?: any
  ): string {
    return `// Generated characterization test for ${route}
// Generated at: ${new Date().toISOString()}

const axios = require('axios');
const fs = require('fs');
const path = require('path');

describe('${testName}', () => {
  const baseURL = '${session.baseUrl}';
  
  beforeAll(() => {
    // Set up authentication if needed
    ${session.metadata.authentication ? this.generateAuthSetup(session.metadata.authentication) : '// No authentication required'}
  });

${interactions.map((interaction, index) => `
  test('${interaction.request.method} ${interaction.endpoint} - interaction ${index + 1}', async () => {
    const goldenPath = path.join(__dirname, '${this.sanitizeFileName(`${route}.${index}.golden.json`)}');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    
    const response = await axios({
      method: '${interaction.request.method}',
      url: \`\${baseURL}${interaction.endpoint}\`,
      ${interaction.request.body ? `data: ${JSON.stringify(JSON.parse(interaction.request.body))},` : ''}
      headers: ${JSON.stringify(this.filterHeaders(interaction.request.headers))},
      validateStatus: () => true, // Accept any status code
    });
    
    // Validate response structure
    expect(response.status).toBe(golden.status);
    
    ${tolerance?.ignoreFields ? 
      `// Compare response body with tolerance for dynamic fields
    const responseBody = this.normalizeResponse(response.data, ${JSON.stringify(tolerance.ignoreFields)});
    const goldenBody = this.normalizeResponse(golden.body, ${JSON.stringify(tolerance.ignoreFields)});
    expect(responseBody).toEqual(goldenBody);` :
      `// Compare response body exactly
    expect(response.data).toEqual(golden.body);`
    }
  });`).join('\n')}

  // Helper function to normalize responses for comparison
  function normalizeResponse(data, ignoreFields = []) {
    if (typeof data !== 'object' || data === null) return data;
    
    const normalized = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      if (ignoreFields.includes(key)) {
        continue; // Skip ignored fields
      }
      
      if (typeof value === 'object' && value !== null) {
        normalized[key] = normalizeResponse(value, ignoreFields);
      } else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }
});
`;
  }

  /**
   * Generate Playwright test
   */
  private generatePlaywrightTest(
    testName: string,
    route: string,
    interactions: HTTPInteraction[],
    session: RecordingSession,
    tolerance?: any
  ): string {
    return `// Generated Playwright characterization test for ${route}
// Generated at: ${new Date().toISOString()}

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('${testName}', () => {
  const baseURL = '${session.baseUrl}';

${interactions.map((interaction, index) => `
  test('${interaction.request.method} ${interaction.endpoint} - interaction ${index + 1}', async ({ request }) => {
    const goldenPath = path.join(__dirname, '${this.sanitizeFileName(`${route}.${index}.golden.json`)}');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    
    const response = await request.${interaction.request.method.toLowerCase()}(\`\${baseURL}${interaction.endpoint}\`, {
      ${interaction.request.body ? `data: ${JSON.stringify(JSON.parse(interaction.request.body))},` : ''}
      headers: ${JSON.stringify(this.filterHeaders(interaction.request.headers))},
    });
    
    expect(response.status()).toBe(golden.status);
    
    const responseBody = await response.json();
    ${tolerance?.ignoreFields ? 
      `// Compare with tolerance
    const normalizedResponse = normalizeResponse(responseBody, ${JSON.stringify(tolerance.ignoreFields)});
    const normalizedGolden = normalizeResponse(golden.body, ${JSON.stringify(tolerance.ignoreFields)});
    expect(normalizedResponse).toEqual(normalizedGolden);` :
      `expect(responseBody).toEqual(golden.body);`
    }
  });`).join('\n')}
});

function normalizeResponse(data, ignoreFields = []) {
  if (typeof data !== 'object' || data === null) return data;
  
  const normalized = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    if (ignoreFields.includes(key)) {
      continue;
    }
    
    if (typeof value === 'object' && value !== null) {
      normalized[key] = normalizeResponse(value, ignoreFields);
    } else {
      normalized[key] = value;
    }
  }
  
  return normalized;
}
`;
  }

  /**
   * Create golden response data
   */
  private createGoldenResponse(interaction: HTTPInteraction, tolerance?: any): any {
    let body = interaction.response.body;
    
    try {
      body = JSON.parse(body);
    } catch {
      // Keep as string if not JSON
    }

    return {
      status: interaction.response.status,
      headers: this.filterHeaders(interaction.response.headers),
      body,
      metadata: {
        route: interaction.route,
        endpoint: interaction.endpoint,
        method: interaction.request.method,
        timestamp: interaction.response.timestamp,
        duration: interaction.response.duration,
      },
    };
  }

  /**
   * Filter sensitive headers
   */
  private filterHeaders(headers: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
    ];

    for (const [key, value] of Object.entries(headers)) {
      if (!sensitiveHeaders.includes(key.toLowerCase())) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Generate authentication setup code
   */
  private generateAuthSetup(auth: any): string {
    switch (auth.type) {
      case 'bearer':
        return `axios.defaults.headers.common['Authorization'] = 'Bearer YOUR_TOKEN_HERE';`;
      case 'basic':
        return `axios.defaults.auth = { username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD' };`;
      default:
        return '// Custom authentication setup required';
    }
  }

  /**
   * Sanitize filename for filesystem
   */
  private sanitizeFileName(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}