import { Logger } from '../utils/logger.js';
import { APIEndpoint } from '../analysis/api-surface-detector.js';
import * as fs from 'fs';
import * as path from 'path';

export interface HTTPRecording {
  endpoint: APIEndpoint;
  testCases: HTTPTestCase[];
  metadata: RecordingMetadata;
}

export interface HTTPTestCase {
  id: string;
  name: string;
  request: HTTPRequest;
  response: HTTPResponse;
  timestamp: Date;
  duration: number;
  environment: TestEnvironment;
}

export interface HTTPRequest {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  auth?: AuthInfo;
}

export interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  cookies?: Record<string, string>;
  duration: number;
}

export interface AuthInfo {
  type: 'bearer' | 'basic' | 'cookie' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
}

export interface TestEnvironment {
  baseUrl: string;
  environment: 'development' | 'staging' | 'production' | 'test';
  variables: Record<string, string>;
  setup?: string[];
  teardown?: string[];
}

export interface RecordingMetadata {
  projectPath: string;
  recordingDate: Date;
  framework: string;
  version: string;
  totalRequests: number;
  uniqueEndpoints: number;
  recordingDuration: number;
  configuration: RecordingConfig;
}

export interface RecordingConfig {
  maxRequestsPerEndpoint: number;
  timeout: number;
  followRedirects: boolean;
  ignoreDynamicFields: string[];
  toleranceConfig: ToleranceConfig;
  authConfig?: AuthConfig;
}

export interface ToleranceConfig {
  timestamps: boolean;
  uuids: boolean;
  randomValues: boolean;
  customPatterns: RegExp[];
  numericTolerance: number;
}

export interface AuthConfig {
  type: 'bearer' | 'basic' | 'cookie' | 'custom';
  credentials: Record<string, string>;
  loginEndpoint?: string;
  refreshEndpoint?: string;
}

export interface GoldenTest {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  request: HTTPRequest;
  expectedResponse: HTTPResponse;
  tolerance: ToleranceConfig;
  tags: string[];
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    recordedFrom: string;
    framework: string;
  };
}

export class HTTPRecorder {
  private logger: Logger;
  private config: RecordingConfig;

  constructor(logger: Logger, config?: Partial<RecordingConfig>) {
    this.logger = logger;
    this.config = {
      maxRequestsPerEndpoint: 5,
      timeout: 30000,
      followRedirects: true,
      ignoreDynamicFields: ['timestamp', 'id', 'createdAt', 'updatedAt'],
      toleranceConfig: {
        timestamps: true,
        uuids: true,
        randomValues: true,
        customPatterns: [],
        numericTolerance: 0.01,
      },
      ...config,
    };
  }

  /**
   * Record HTTP interactions for discovered API endpoints
   */
  async recordEndpoints(
    endpoints: APIEndpoint[],
    environment: TestEnvironment
  ): Promise<HTTPRecording[]> {
    this.logger.info('Starting HTTP endpoint recording', {
      endpointCount: endpoints.length,
      environment: environment.environment,
    });

    const recordings: HTTPRecording[] = [];

    for (const endpoint of endpoints) {
      if (endpoint.type === 'http') {
        try {
          const recording = await this.recordEndpoint(endpoint, environment);
          recordings.push(recording);

          this.logger.info('Recorded endpoint', {
            endpoint: `${endpoint.method} ${endpoint.path}`,
            testCases: recording.testCases.length,
          });
        } catch (error) {
          this.logger.warn('Failed to record endpoint', {
            endpoint: `${endpoint.method} ${endpoint.path}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.logger.info('HTTP recording completed', {
      totalRecordings: recordings.length,
      totalTestCases: recordings.reduce((sum, r) => sum + r.testCases.length, 0),
    });

    return recordings;
  }

  /**
   * Record a single HTTP endpoint
   */
  private async recordEndpoint(
    endpoint: APIEndpoint,
    environment: TestEnvironment
  ): Promise<HTTPRecording> {
    const testCases: HTTPTestCase[] = [];
    const startTime = Date.now();

    // Generate test scenarios for the endpoint
    const scenarios = this.generateTestScenarios(endpoint);

    for (const scenario of scenarios) {
      try {
        const testCase = await this.executeRequest(scenario, environment);
        testCases.push(testCase);
      } catch (error) {
        this.logger.warn('Failed to execute test scenario', {
          scenario: scenario.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const metadata: RecordingMetadata = {
      projectPath: environment.baseUrl,
      recordingDate: new Date(),
      framework: endpoint.framework || 'unknown',
      version: '1.0.0',
      totalRequests: testCases.length,
      uniqueEndpoints: 1,
      recordingDuration: Date.now() - startTime,
      configuration: this.config,
    };

    return {
      endpoint,
      testCases,
      metadata,
    };
  }

  /**
   * Generate test scenarios for an endpoint
   */
  private generateTestScenarios(endpoint: APIEndpoint): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Basic happy path scenario
    scenarios.push({
      name: `${endpoint.method} ${endpoint.path} - Happy Path`,
      description: 'Basic successful request',
      request: this.createBasicRequest(endpoint),
      expectedStatus: 200,
    });

    // Error scenarios based on method
    if (endpoint.method === 'GET') {
      scenarios.push({
        name: `${endpoint.method} ${endpoint.path} - Not Found`,
        description: 'Request for non-existent resource',
        request: this.createNotFoundRequest(endpoint),
        expectedStatus: 404,
      });
    }

    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method || '')) {
      scenarios.push({
        name: `${endpoint.method} ${endpoint.path} - Invalid Data`,
        description: 'Request with invalid payload',
        request: this.createInvalidDataRequest(endpoint),
        expectedStatus: 400,
      });
    }

    // Authentication scenarios if auth is detected
    if (this.requiresAuth(endpoint)) {
      scenarios.push({
        name: `${endpoint.method} ${endpoint.path} - Unauthorized`,
        description: 'Request without authentication',
        request: this.createUnauthenticatedRequest(endpoint),
        expectedStatus: 401,
      });
    }

    return scenarios.slice(0, this.config.maxRequestsPerEndpoint);
  }

  /**
   * Execute a test scenario
   */
  private async executeRequest(
    scenario: TestScenario,
    environment: TestEnvironment
  ): Promise<HTTPTestCase> {
    const startTime = Date.now();

    // Build full URL
    const url = new URL(scenario.request.path, environment.baseUrl);

    // Add query parameters
    if (scenario.request.query) {
      Object.entries(scenario.request.query).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: scenario.request.method,
      headers: {
        'Content-Type': 'application/json',
        ...scenario.request.headers,
      },
    };

    if (scenario.request.body) {
      fetchOptions.body = JSON.stringify(scenario.request.body);
    }

    try {
      // Execute request
      const response = await fetch(url.toString(), fetchOptions);
      const responseBody = await this.parseResponseBody(response);
      const duration = Date.now() - startTime;

      // Create test case
      const testCase: HTTPTestCase = {
        id: this.generateTestId(scenario),
        name: scenario.name,
        request: {
          method: scenario.request.method,
          url: url.toString(),
          path: scenario.request.path,
          headers: scenario.request.headers || {},
          query: scenario.request.query || {},
          body: scenario.request.body,
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: this.extractHeaders(response),
          body: responseBody,
          duration,
        },
        timestamp: new Date(),
        duration,
        environment,
      };

      return testCase;
    } catch (error) {
      // Create test case for failed requests
      const duration = Date.now() - startTime;

      return {
        id: this.generateTestId(scenario),
        name: scenario.name,
        request: {
          method: scenario.request.method,
          url: url.toString(),
          path: scenario.request.path,
          headers: scenario.request.headers || {},
          query: scenario.request.query || {},
          body: scenario.request.body,
        },
        response: {
          status: 0,
          statusText: 'Network Error',
          headers: {},
          body: { error: error instanceof Error ? error.message : String(error) },
          duration,
        },
        timestamp: new Date(),
        duration,
        environment,
      };
    }
  }

  /**
   * Generate golden tests from recordings
   */
  async generateGoldenTests(recordings: HTTPRecording[]): Promise<GoldenTest[]> {
    this.logger.info('Generating golden tests from recordings', {
      recordingCount: recordings.length,
    });

    const goldenTests: GoldenTest[] = [];

    for (const recording of recordings) {
      for (const testCase of recording.testCases) {
        // Skip failed requests for golden tests
        if (testCase.response.status === 0) continue;

        const goldenTest: GoldenTest = {
          id: testCase.id,
          name: testCase.name,
          description: `Golden test for ${recording.endpoint.method} ${recording.endpoint.path}`,
          endpoint: recording.endpoint.path || '',
          method: recording.endpoint.method || 'GET',
          request: testCase.request,
          expectedResponse: this.normalizeResponse(testCase.response),
          tolerance: this.config.toleranceConfig,
          tags: this.generateTags(recording.endpoint, testCase),
          metadata: {
            createdAt: testCase.timestamp,
            lastUpdated: testCase.timestamp,
            recordedFrom: recording.metadata.framework,
            framework: recording.metadata.framework,
          },
        };

        goldenTests.push(goldenTest);
      }
    }

    this.logger.info('Generated golden tests', { count: goldenTests.length });
    return goldenTests;
  }

  /**
   * Save recordings to files
   */
  async saveRecordings(recordings: HTTPRecording[], outputDir: string): Promise<string[]> {
    const savedFiles: string[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const recording of recordings) {
      const filename = this.generateRecordingFilename(recording.endpoint);
      const filepath = path.join(outputDir, filename);

      try {
        fs.writeFileSync(filepath, JSON.stringify(recording, null, 2));
        savedFiles.push(filepath);

        this.logger.debug('Saved recording', { filepath });
      } catch (error) {
        this.logger.warn('Failed to save recording', {
          filepath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return savedFiles;
  }

  /**
   * Save golden tests to files
   */
  async saveGoldenTests(goldenTests: GoldenTest[], outputDir: string): Promise<string[]> {
    const savedFiles: string[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Group tests by endpoint
    const testsByEndpoint = new Map<string, GoldenTest[]>();
    goldenTests.forEach(test => {
      const key = `${test.method}_${test.endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (!testsByEndpoint.has(key)) {
        testsByEndpoint.set(key, []);
      }
      testsByEndpoint.get(key)!.push(test);
    });

    // Save each endpoint's tests to a separate file
    for (const [endpointKey, tests] of testsByEndpoint) {
      const filename = `${endpointKey}_golden_tests.json`;
      const filepath = path.join(outputDir, filename);

      try {
        fs.writeFileSync(filepath, JSON.stringify(tests, null, 2));
        savedFiles.push(filepath);

        this.logger.debug('Saved golden tests', { filepath, testCount: tests.length });
      } catch (error) {
        this.logger.warn('Failed to save golden tests', {
          filepath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return savedFiles;
  }

  // Helper methods
  private createBasicRequest(endpoint: APIEndpoint): TestRequest {
    const request: TestRequest = {
      method: endpoint.method || 'GET',
      path: endpoint.path || '/',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Refactogent-Recorder/1.0',
      },
      query: {},
    };

    // Add sample data for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      request.body = this.generateSamplePayload(endpoint);
    }

    return request;
  }

  private createNotFoundRequest(endpoint: APIEndpoint): TestRequest {
    const request = this.createBasicRequest(endpoint);

    // Modify path to request non-existent resource
    if (endpoint.path?.includes(':id')) {
      request.path = endpoint.path.replace(':id', '99999');
    } else {
      request.path = (endpoint.path || '/') + '/nonexistent';
    }

    return request;
  }

  private createInvalidDataRequest(endpoint: APIEndpoint): TestRequest {
    const request = this.createBasicRequest(endpoint);

    // Add invalid payload
    request.body = {
      invalid: 'data',
      missingRequired: null,
      wrongType: 'should_be_number',
    };

    return request;
  }

  private createUnauthenticatedRequest(endpoint: APIEndpoint): TestRequest {
    const request = this.createBasicRequest(endpoint);

    // Remove any auth headers
    delete request.headers?.['Authorization'];
    delete request.headers?.['Cookie'];

    return request;
  }

  private requiresAuth(endpoint: APIEndpoint): boolean {
    // Simple heuristics to detect if endpoint requires auth
    const path = endpoint.path || '';
    const authPaths = ['/api/', '/admin/', '/user/', '/profile/', '/dashboard/'];

    return (
      authPaths.some(authPath => path.includes(authPath)) ||
      endpoint.name.toLowerCase().includes('auth') ||
      endpoint.name.toLowerCase().includes('login') ||
      endpoint.name.toLowerCase().includes('protected')
    );
  }

  private generateSamplePayload(endpoint: APIEndpoint): any {
    // Generate sample payload based on endpoint
    const method = endpoint.method || 'GET';
    const path = endpoint.path || '/';

    if (path.includes('user')) {
      return {
        name: 'Test User',
        email: 'test@example.com',
        age: 25,
      };
    }

    if (path.includes('product')) {
      return {
        name: 'Test Product',
        price: 99.99,
        category: 'test',
      };
    }

    // Generic payload
    return {
      data: 'test data',
      timestamp: new Date().toISOString(),
      value: 42,
    };
  }

  private async parseResponseBody(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';

    try {
      if (contentType.includes('application/json')) {
        return await response.json();
      } else if (contentType.includes('text/')) {
        return await response.text();
      } else {
        // For binary content, just store metadata
        return {
          type: 'binary',
          contentType,
          size: response.headers.get('content-length') || 'unknown',
        };
      }
    } catch (error) {
      return {
        error: 'Failed to parse response body',
        contentType,
        rawText: await response.text().catch(() => 'Could not read response'),
      };
    }
  }

  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};

    response.headers.forEach((value, key) => {
      // Skip dynamic headers
      if (!this.isDynamicHeader(key)) {
        headers[key] = value;
      }
    });

    return headers;
  }

  private isDynamicHeader(headerName: string): boolean {
    const dynamicHeaders = [
      'date',
      'x-request-id',
      'x-trace-id',
      'x-correlation-id',
      'etag',
      'last-modified',
    ];

    return dynamicHeaders.includes(headerName.toLowerCase());
  }

  private normalizeResponse(response: HTTPResponse): HTTPResponse {
    const normalized = { ...response };

    // Apply tolerance configuration
    if (this.config.toleranceConfig.timestamps) {
      normalized.body = this.normalizeTimestamps(normalized.body);
    }

    if (this.config.toleranceConfig.uuids) {
      normalized.body = this.normalizeUUIDs(normalized.body);
    }

    if (this.config.toleranceConfig.randomValues) {
      normalized.body = this.normalizeRandomValues(normalized.body);
    }

    // Apply custom patterns
    for (const pattern of this.config.toleranceConfig.customPatterns) {
      normalized.body = this.applyCustomPattern(normalized.body, pattern);
    }

    return normalized;
  }

  private normalizeTimestamps(obj: any): any {
    if (typeof obj === 'string') {
      // Replace ISO timestamps with placeholder
      return obj.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, '{{TIMESTAMP}}');
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeTimestamps(item));
    }

    if (obj && typeof obj === 'object') {
      const normalized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (['createdAt', 'updatedAt', 'timestamp', 'date'].includes(key)) {
          normalized[key] = '{{TIMESTAMP}}';
        } else {
          normalized[key] = this.normalizeTimestamps(value);
        }
      }
      return normalized;
    }

    return obj;
  }

  private normalizeUUIDs(obj: any): any {
    if (typeof obj === 'string') {
      // Replace UUIDs with placeholder
      return obj.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '{{UUID}}'
      );
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeUUIDs(item));
    }

    if (obj && typeof obj === 'object') {
      const normalized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (['id', 'uuid', 'guid'].includes(key.toLowerCase())) {
          normalized[key] = '{{UUID}}';
        } else {
          normalized[key] = this.normalizeUUIDs(value);
        }
      }
      return normalized;
    }

    return obj;
  }

  private normalizeRandomValues(obj: any): any {
    if (typeof obj === 'number') {
      // Normalize random-looking numbers
      if (obj > 1000000 && obj < 9999999999) {
        return '{{RANDOM_NUMBER}}';
      }
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeRandomValues(item));
    }

    if (obj && typeof obj === 'object') {
      const normalized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        normalized[key] = this.normalizeRandomValues(value);
      }
      return normalized;
    }

    return obj;
  }

  private applyCustomPattern(obj: any, pattern: RegExp): any {
    if (typeof obj === 'string') {
      return obj.replace(pattern, '{{CUSTOM}}');
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.applyCustomPattern(item, pattern));
    }

    if (obj && typeof obj === 'object') {
      const normalized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        normalized[key] = this.applyCustomPattern(value, pattern);
      }
      return normalized;
    }

    return obj;
  }

  private generateTestId(scenario: TestScenario): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(scenario.name);
    return `test_${hash}_${timestamp}`;
  }

  private generateRecordingFilename(endpoint: APIEndpoint): string {
    const method = endpoint.method || 'GET';
    const path = (endpoint.path || '/').replace(/[^a-zA-Z0-9]/g, '_');
    return `${method}_${path}_recording.json`;
  }

  private generateTags(endpoint: APIEndpoint, testCase: HTTPTestCase): string[] {
    const tags: string[] = [];

    tags.push(endpoint.method?.toLowerCase() || 'get');
    tags.push(endpoint.framework || 'unknown');

    if (testCase.response.status >= 200 && testCase.response.status < 300) {
      tags.push('success');
    } else if (testCase.response.status >= 400) {
      tags.push('error');
    }

    if (testCase.request.auth) {
      tags.push('authenticated');
    }

    return tags;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Supporting interfaces
interface TestScenario {
  name: string;
  description: string;
  request: TestRequest;
  expectedStatus: number;
}

interface TestRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  auth?: AuthInfo;
}
