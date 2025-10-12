import { z } from "zod";

// Tool input schemas
export const RefactorContextSchema = z.object({
  path: z.string().describe("File or directory path to analyze"),
  includeTests: z.boolean().default(true).describe("Include test coverage analysis"),
  includeDependencies: z.boolean().default(true).describe("Map import/export relationships"),
});

export const RefactorCheckpointSchema = z.object({
  message: z.string().describe("Description of what's about to change"),
  includeUntracked: z.boolean().default(false).describe("Include untracked files"),
});

export const RefactorValidateSchema = z.object({
  checkpointId: z.string().optional().describe("Checkpoint ID to rollback to on failure"),
  autoRollback: z.boolean().default(false).describe("Auto-revert on validation failure"),
  skipTests: z.boolean().default(false).describe("Skip running tests"),
  skipLint: z.boolean().default(false).describe("Skip linting"),
  skipTypeCheck: z.boolean().default(false).describe("Skip type checking"),
});

export const RefactorImpactSchema = z.object({
  targetFile: z.string().describe("File path to analyze"),
  targetSymbol: z.string().optional().describe("Specific symbol to analyze"),
});

export const RefactorSuggestSchema = z.object({
  file: z.string().describe("File path to analyze"),
  focus: z
    .enum(["types", "duplicates", "complexity", "naming", "structure", "all"])
    .default("all")
    .describe("Focus area for suggestions"),
  maxSuggestions: z.number().default(5).describe("Maximum suggestions to return"),
});

// Tool output types
export interface RefactorContextOutput {
  files: FileInfo[];
  dependencies: DependencyGraph;
  testCoverage: CoverageInfo;
  complexityMetrics: ComplexityMetrics;
  safetyScore: number;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  symbols: SymbolInfo[];
  exports: string[];
  imports: ImportInfo[];
  complexity: number;
}

export interface SymbolInfo {
  name: string;
  type: "function" | "class" | "interface" | "type" | "variable" | "enum" | "namespace";
  startLine: number;
  endLine: number;
  isExported: boolean;
  complexity?: number;
}

export interface ImportInfo {
  source: string;
  symbols: string[];
  isTypeOnly: boolean;
}

export interface DependencyGraph {
  nodes: string[];
  edges: { from: string; to: string; symbols: string[] }[];
}

export interface CoverageInfo {
  covered: number;
  total: number;
  percentage: number;
  uncoveredFiles: string[];
}

export interface ComplexityMetrics {
  averageComplexity: number;
  maxComplexity: number;
  filesAboveThreshold: string[];
}

export interface RefactorCheckpointOutput {
  checkpointId: string;
  timestamp: string;
  filesTracked: string[];
  message: string;
}

export interface RefactorValidateOutput {
  testsPass: boolean;
  lintPass: boolean;
  typeCheckPass: boolean;
  allPass: boolean;
  errors: ValidationError[];
  rolledBack: boolean;
  suggestion?: string;
}

export interface ValidationError {
  type: "test" | "lint" | "typecheck";
  message: string;
  file?: string;
  line?: number;
}

export interface RefactorImpactOutput {
  targetFile: string;
  targetSymbol?: string;
  directDependents: string[];
  transitiveDependents: string[];
  totalAffectedFiles: number;
  testCoverage: number;
  riskScore: number;
  recommendations: string[];
}

export interface RefactorSuggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  targetCode: CodeSpan;
  estimatedImpact: string;
  riskScore: number;
  autoApplicable: boolean;
  reasoning: string;
  priority: "high" | "medium" | "low";
}

export interface CodeSpan {
  file: string;
  startLine: number;
  endLine: number;
  code: string;
}

export interface RefactorSuggestOutput {
  file: string;
  focus: string;
  suggestions: RefactorSuggestion[];
  totalIssuesFound: number;
  analysisTimestamp: string;
}

export interface ProjectHealth {
  overallScore: number;
  metrics: {
    totalFiles: number;
    totalLines: number;
    averageComplexity: number;
    testCoverage: number;
  };
  opportunities: {
    typeAbstractions: number;
    duplicateCode: number;
    complexFunctions: number;
  };
  recommendations: string[];
}
