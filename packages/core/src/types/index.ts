// Project types
export type ProjectType = 'typescript' | 'javascript' | 'python' | 'go' | 'java' | 'csharp' | 'mixed' | 'unknown';

export interface ProjectInfo {
  name: string;
  type: ProjectType;
  path: string;
  languages?: string[];
  dependencies: DependencyInfo[];
  testFrameworks: string[];
  buildTools: string[];
  configFiles: string[];
  entryPoints: string[];
  sourceFiles: string[];
  testFiles: string[];
  hasTests?: boolean;
  hasConfig?: boolean;
  configPath?: string;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  source?: string; // package.json, requirements.txt, etc.
}

// Configuration types
export interface RefactogentConfig {
  project: {
    type: ProjectType;
    rootPath: string;
    excludePaths: string[];
    includePaths: string[];
  };
  analysis: {
    enableSafetyScoring: boolean;
    enableCoverageAnalysis: boolean;
    enableASTAnalysis: boolean;
    safetyThreshold: number;
    coverageThreshold: number;
  };
  refactoring: {
    maxSuggestions: number;
    prioritizationCriteria: 'safety' | 'impact' | 'effort' | 'readiness';
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    includeRisky: boolean;
  };
  output: {
    format: 'json' | 'table' | 'detailed' | 'html' | 'markdown';
    outputPath?: string;
    verbose: boolean;
  };
}

// Logging types
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}
// Extended configuration types for legacy compatibility
export interface ExtendedRefactogentConfig extends RefactogentConfig {
  version?: string;
  maxPrLoc?: number;
  branchPrefix?: string;
  modesAllowed?: string[];
  languages?: Record<string, any>;
  gates?: Record<string, any>;
  semantics?: {
    tolerate?: Record<string, any>;
    httpGoldenRoutes?: string[];
  };
  protectedPaths?: string[];
}

// Logging types with flexible timestamp
export interface FlexibleLogEntry {
  timestamp: Date | string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}