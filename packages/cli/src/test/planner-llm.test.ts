import { PlannerLLM, PlanGraph, PlannerOptions } from '../planner/planner-llm.js';
import { IntentClassification } from '../planner/intent-classifier.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe('PlannerLLM', () => {
  let planner: PlannerLLM;
  let logger: Logger;
  let metrics: RefactoGentMetrics;
  let tracer: RefactoGentTracer;
  let config: RefactoGentConfig;

  beforeEach(() => {
    logger = new Logger();
    metrics = new RefactoGentMetrics(logger);
    tracer = new RefactoGentTracer(logger);
    config = {
      repository: {
        language: ['typescript'],
        name: 'test-repo',
        type: 'library',
      },
      paths: {
        ignore: ['node_modules/**'],
        prioritize: ['src/**'],
        tests: ['test/**', '**/*.test.ts'],
        configs: ['*.json', '*.yaml'],
      },
      safety: {
        thresholds: {
          maxChangeSize: 100,
          maxFilesAffected: 10,
          criticalPathSensitivity: 'medium',
        },
      },
      features: {
        experimental: false,
        codeGraph: true,
        crossFileAnalysis: true,
        architecturalPatterns: true,
        dependencyAnalysis: true,
      },
    } as RefactoGentConfig;

    planner = new PlannerLLM(logger, metrics, tracer, config);
  });

  const createMockIntent = (
    intent: string,
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): IntentClassification => ({
    intent: intent as any,
    confidence: 0.8,
    reasoning: 'Test intent',
    complexity,
    estimatedTime: 10,
    requiredTools: ['search', 'read', 'edit'],
    riskLevel: intent === 'migration' ? 'high' : 'medium',
  });

  describe('generatePlan', () => {
    it('should generate a plan for refactor intent', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'extract function from complex code');

      expect(plan).toBeDefined();
      expect(plan.nodes.size).toBeGreaterThan(0);
      expect(plan.edges.size).toBeGreaterThan(0);
      expect(plan.entryPoint).toBeDefined();
      expect(plan.exitPoints.length).toBeGreaterThan(0);
      expect(plan.estimatedTotalTime).toBeGreaterThan(0);
      expect(plan.maxParallelism).toBeGreaterThan(0);
      expect(plan.riskAssessment).toBeDefined();
    });

    it('should generate a plan for edit intent', async () => {
      const intent = createMockIntent('edit');
      const plan = await planner.generatePlan(intent, 'modify the function');

      expect(plan).toBeDefined();
      expect(plan.nodes.size).toBeGreaterThan(0);
      expect(plan.entryPoint).toBeDefined();
    });

    it('should generate a plan for test-gen intent', async () => {
      const intent = createMockIntent('test-gen');
      const plan = await planner.generatePlan(intent, 'generate unit tests');

      expect(plan).toBeDefined();
      expect(plan.nodes.size).toBeGreaterThan(0);
      expect(plan.entryPoint).toBeDefined();
    });

    it('should generate a plan for migration intent', async () => {
      const intent = createMockIntent('migration', 'high');
      const plan = await planner.generatePlan(intent, 'migrate to new framework');

      expect(plan).toBeDefined();
      expect(plan.nodes.size).toBeGreaterThan(0);
      expect(plan.riskAssessment.overall).toBe('high');
    });

    it('should handle different complexity levels', async () => {
      const complexities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      for (const complexity of complexities) {
        const intent = createMockIntent('refactor', complexity);
        const plan = await planner.generatePlan(intent, 'refactor code');

        expect(plan).toBeDefined();
        expect(plan.estimatedTotalTime).toBeGreaterThan(0);
      }
    });

    it('should include rollback plans when requested', async () => {
      const intent = createMockIntent('refactor');
      const options: PlannerOptions = {
        includeRollback: true,
        optimizeForSafety: true,
      };

      const plan = await planner.generatePlan(intent, 'refactor code', options);

      expect(plan).toBeDefined();
      expect(plan.riskAssessment.rollbackPoints.length).toBeGreaterThan(0);
    });

    it('should optimize for time when requested', async () => {
      const intent = createMockIntent('refactor');
      const options: PlannerOptions = {
        optimizeForTime: true,
        maxParallelism: 3,
      };

      const plan = await planner.generatePlan(intent, 'refactor code', options);

      expect(plan).toBeDefined();
      expect(plan.maxParallelism).toBeGreaterThan(1);
    });

    it('should include verification when requested', async () => {
      const intent = createMockIntent('refactor');
      const options: PlannerOptions = {
        includeVerification: true,
      };

      const plan = await planner.generatePlan(intent, 'refactor code', options);

      expect(plan).toBeDefined();
      // Should include verification nodes
      const verificationNodes = Array.from(plan.nodes.values()).filter(
        node =>
          node.name.toLowerCase().includes('verify') || node.name.toLowerCase().includes('check')
      );
      expect(verificationNodes.length).toBeGreaterThan(0);
    });

    it('should handle different intents with appropriate tools', async () => {
      const intents = [
        { intent: 'refactor', expectedTools: ['search', 'read', 'edit', 'typecheck', 'format'] },
        { intent: 'edit', expectedTools: ['read', 'edit', 'format'] },
        { intent: 'explain', expectedTools: ['search', 'read'] },
        { intent: 'test-gen', expectedTools: ['search', 'read', 'edit', 'test-runner'] },
        { intent: 'doc-gen', expectedTools: ['search', 'read', 'edit'] },
        {
          intent: 'migration',
          expectedTools: ['search', 'read', 'edit', 'typecheck', 'test-runner', 'format'],
        },
        { intent: 'optimize', expectedTools: ['search', 'read', 'edit', 'profiler', 'benchmark'] },
        { intent: 'debug', expectedTools: ['search', 'read', 'debugger', 'log-analyzer'] },
        { intent: 'analyze', expectedTools: ['search', 'read', 'metrics-collector'] },
      ];

      for (const { intent, expectedTools } of intents) {
        const mockIntent = createMockIntent(intent);
        mockIntent.requiredTools = expectedTools;

        const plan = await planner.generatePlan(mockIntent, `perform ${intent} operation`);

        expect(plan).toBeDefined();
        expect(plan.nodes.size).toBeGreaterThan(0);
      }
    });

    it('should generate valid plan structure', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      // Check that all nodes have valid properties
      for (const [nodeId, node] of plan.nodes) {
        expect(node.id).toBe(nodeId);
        expect(node.type).toBeDefined();
        expect(node.name).toBeDefined();
        expect(node.description).toBeDefined();
        expect(node.dependencies).toBeDefined();
        expect(node.estimatedTime).toBeGreaterThanOrEqual(0);
        expect(node.riskLevel).toBeDefined();
        expect(node.retryable).toBeDefined();
      }

      // Check that all edges have valid properties
      for (const [edgeId, edge] of plan.edges) {
        expect(edge.from).toBeDefined();
        expect(edge.to).toBeDefined();
        expect(edge.type).toBeDefined();
        expect(edge.weight).toBeGreaterThanOrEqual(0);
        expect(plan.nodes.has(edge.from)).toBe(true);
        expect(plan.nodes.has(edge.to)).toBe(true);
      }
    });
  });

  describe('validatePlan', () => {
    it('should validate a well-formed plan', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');
      const validation = await planner.validatePlan(plan);

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toBeDefined();
      expect(validation.suggestions).toBeDefined();
    });

    it('should detect cycles in plan', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      // Manually create a cycle for testing
      const nodeIds = Array.from(plan.nodes.keys());
      if (nodeIds.length >= 2) {
        const edge1 = { from: nodeIds[0], to: nodeIds[1], type: 'success' as const, weight: 1.0 };
        const edge2 = { from: nodeIds[1], to: nodeIds[0], type: 'success' as const, weight: 1.0 };
        plan.edges.set('cycle-1', edge1);
        plan.edges.set('cycle-2', edge2);
      }

      const validation = await planner.validatePlan(plan);
      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes('cycle'))).toBe(true);
    });

    it('should detect unreachable nodes', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      // Add an unreachable node
      const unreachableNode = {
        id: 'unreachable',
        type: 'tool' as const,
        name: 'Unreachable Tool',
        description: 'This node is unreachable',
        dependencies: ['nonexistent'],
        estimatedTime: 1,
        riskLevel: 'low' as const,
        retryable: true,
      };
      plan.nodes.set('unreachable', unreachableNode);

      const validation = await planner.validatePlan(plan);
      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes('Unreachable'))).toBe(true);
    });

    it('should detect missing dependencies', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      // Add a node with missing dependency
      const nodeWithMissingDep = {
        id: 'missing-dep',
        type: 'tool' as const,
        name: 'Tool with Missing Dep',
        description: 'This node has a missing dependency',
        dependencies: ['nonexistent'],
        estimatedTime: 1,
        riskLevel: 'low' as const,
        retryable: true,
      };
      plan.nodes.set('missing-dep', nodeWithMissingDep);

      const validation = await planner.validatePlan(plan);
      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes('Missing dependencies'))).toBe(true);
    });
  });

  describe('plan metrics', () => {
    it('should calculate estimated total time correctly', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      const calculatedTime = Array.from(plan.nodes.values()).reduce(
        (total, node) => total + node.estimatedTime,
        0
      );

      expect(plan.estimatedTotalTime).toBe(calculatedTime);
    });

    it('should calculate max parallelism correctly', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      expect(plan.maxParallelism).toBeGreaterThan(0);
      expect(plan.maxParallelism).toBeLessThanOrEqual(plan.nodes.size);
    });

    it('should assess risk correctly', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, 'refactor code');

      expect(plan.riskAssessment).toBeDefined();
      expect(plan.riskAssessment.overall).toBeDefined();
      expect(plan.riskAssessment.criticalPaths).toBeDefined();
      expect(plan.riskAssessment.rollbackPoints).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid intent gracefully', async () => {
      const invalidIntent = createMockIntent('unknown');
      const plan = await planner.generatePlan(invalidIntent, 'unknown operation');

      expect(plan).toBeDefined();
      expect(plan.nodes.size).toBeGreaterThan(0);
    });

    it('should handle empty context gracefully', async () => {
      const intent = createMockIntent('refactor');
      const plan = await planner.generatePlan(intent, '');

      expect(plan).toBeDefined();
      expect(plan.nodes.size).toBeGreaterThan(0);
    });
  });
});
