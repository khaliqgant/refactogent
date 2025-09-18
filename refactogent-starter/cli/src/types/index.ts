// Core types for Refactogent CLI

export interface RefactogentConfig {
  version: string;
  maxPrLoc: number;
  branchPrefix: string;
  modesAllowed: RefactoringMode[];
  protectedPaths: string[];
  gates: SafetyGates;
  languages: Record<string, LanguageConfig>;
  semantics?: SemanticsConfig;
}

export interface LanguageConfig {
  build: string;
  test: string;
  lints: string[];
}

export interface SafetyGates {
  requireCharacterizationTests: boolean;
  requireGreenCi: boolean;
  minLineCoverageDelta: string;
  minBranchCoverageDelta: string;
  mutationScoreThreshold: number;
  forbidPublicApiChanges: boolean;
  forbidDependencyChanges: boolean;
}

export interface SemanticsConfig {
  httpGoldenRoutes: string[];
  tolerate?: {
    jsonFieldsIgnored?: string[];
    headerFieldsIgnored?: string[];
  };
}

export type RefactoringMode = 
  | 'organize-only' 
  | 'name-hygiene' 
  | 'tests-first' 
  | 'micro-simplify';

export type ProjectType = 'typescript' | 'python' | 'go' | 'mixed' | 'unknown';

export interface ProjectInfo {
  path: string;
  type: ProjectType;
  languages: string[];
  hasTests: boolean;
  hasConfig: boolean;
  configPath?: string;
}

export interface CommandContext {
  config: RefactogentConfig;
  projectInfo: ProjectInfo;
  outputDir: string;
  verbose: boolean;
}

export interface CommandResult {
  success: boolean;
  message: string;
  artifacts?: string[];
  data?: any;
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}