import { InteractiveFeatures, InteractiveOptions } from '../ux/interactive-features.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe('InteractiveFeatures', () => {
  let interactiveFeatures: InteractiveFeatures;
  let logger: Logger;
  let metrics: RefactoGentMetrics;
  let tracer: RefactoGentTracer;
  let config: RefactoGentConfig;

  beforeEach(() => {
    logger = new Logger();
    metrics = new RefactoGentMetrics(logger);
    tracer = new RefactoGentTracer(logger);
    config = { repository: { language: ['typescript'] } } as any;
    interactiveFeatures = new InteractiveFeatures(logger, metrics, tracer, config);
  });

  describe('generateCitations', () => {
    it('should generate citations with default options', async () => {
      const query = 'refactor this function';
      const context = { files: ['src/utils/helper.ts'] };
      const options: InteractiveOptions = {};

      const citations = await interactiveFeatures.generateCitations(query, context, options);

      expect(citations).toBeDefined();
      expect(Array.isArray(citations)).toBe(true);
      citations.forEach(citation => {
        expect(citation).toHaveProperty('id');
        expect(citation).toHaveProperty('type');
        expect(citation).toHaveProperty('path');
        expect(citation).toHaveProperty('content');
        expect(citation).toHaveProperty('relevance');
        expect(citation).toHaveProperty('reason');
        expect(citation.relevance).toBeGreaterThanOrEqual(0);
        expect(citation.relevance).toBeLessThanOrEqual(1);
      });
    });

    it('should generate citations with custom options', async () => {
      const query = 'optimize performance';
      const context = { files: ['src/utils/helper.ts'] };
      const options: InteractiveOptions = {
        enableCitations: true,
        enableHover: true,
        maxCitations: 5,
        hoverDelay: 1000,
      };

      const citations = await interactiveFeatures.generateCitations(query, context, options);

      expect(citations).toBeDefined();
      expect(citations.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when citations disabled', async () => {
      const query = 'test query';
      const context = { files: ['src/utils/helper.ts'] };
      const options: InteractiveOptions = {
        enableCitations: false,
      };

      const citations = await interactiveFeatures.generateCitations(query, context, options);

      expect(citations).toEqual([]);
    });

    it('should handle empty query gracefully', async () => {
      const query = '';
      const context = { files: ['src/utils/helper.ts'] };
      const options: InteractiveOptions = {};

      const citations = await interactiveFeatures.generateCitations(query, context, options);

      expect(citations).toBeDefined();
      expect(Array.isArray(citations)).toBe(true);
    });
  });

  describe('generateHoverText', () => {
    it('should generate hover text for citation', () => {
      const citation = {
        id: 'citation-1',
        type: 'file' as const,
        path: 'src/utils/helper.ts',
        line: 5,
        content: 'export function helper() { return "help"; }',
        relevance: 0.9,
        reason: 'Function definition matches query keywords',
      };

      const hoverText = interactiveFeatures.generateHoverText(citation);

      expect(hoverText).toContain('src/utils/helper.ts:5');
      expect(hoverText).toContain('**Type:** file');
      expect(hoverText).toContain('**Relevance:** 90.0%');
      expect(hoverText).toContain('Function definition matches query keywords');
      expect(hoverText).toContain('export function helper()');
    });

    it('should handle citation without line number', () => {
      const citation = {
        id: 'citation-2',
        type: 'symbol' as const,
        path: 'src/utils/helper.ts',
        content: 'export function helper() { return "help"; }',
        relevance: 0.8,
        reason: 'Function name matches query',
      };

      const hoverText = interactiveFeatures.generateHoverText(citation);

      expect(hoverText).toContain('src/utils/helper.ts');
      expect(hoverText).not.toContain(':undefined');
    });
  });

  describe('reGround', () => {
    it('should re-ground context successfully', async () => {
      const query = 'refactor this function';
      const projectPath = '/test/project';
      const options: InteractiveOptions = {};

      const result = await interactiveFeatures.reGround(query, projectPath, options);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.newContext).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.message).toContain('Re-grounding completed');
    });

    it('should handle re-grounding errors gracefully', async () => {
      const query = 'invalid query';
      const projectPath = '/invalid/path';
      const options: InteractiveOptions = {};

      const result = await interactiveFeatures.reGround(query, projectPath, options);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.newContext).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.message).toContain('Re-grounding completed');
    });
  });

  describe('generatePlanPreview', () => {
    it('should generate plan preview with default options', async () => {
      const query = 'refactor this function';
      const projectPath = '/test/project';
      const options: InteractiveOptions = {};

      const plan = await interactiveFeatures.generatePlanPreview(query, projectPath, options);

      expect(plan).toBeDefined();
      expect(plan.steps).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.estimatedTime).toBeGreaterThanOrEqual(0);
      expect(plan.riskLevel).toMatch(/^(low|medium|high)$/);
      expect(plan.rollbackPoints).toBeDefined();
      expect(plan.dependencies).toBeDefined();

      plan.steps.forEach(step => {
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('name');
        expect(step).toHaveProperty('description');
        expect(step).toHaveProperty('type');
        expect(step).toHaveProperty('estimatedTime');
        expect(step).toHaveProperty('dependencies');
        expect(step).toHaveProperty('riskLevel');
        expect(step.estimatedTime).toBeGreaterThanOrEqual(0);
        expect(step.riskLevel).toMatch(/^(low|medium|high)$/);
      });
    });

    it('should generate plan preview with custom options', async () => {
      const query = 'optimize performance';
      const projectPath = '/test/project';
      const options: InteractiveOptions = {
        enablePlanPreview: true,
        maxCitations: 5,
      };

      const plan = await interactiveFeatures.generatePlanPreview(query, projectPath, options);

      expect(plan).toBeDefined();
      expect(plan.steps).toBeDefined();
      expect(plan.estimatedTime).toBeGreaterThanOrEqual(0);
      expect(plan.riskLevel).toMatch(/^(low|medium|high)$/);
    });

    it('should handle empty query gracefully', async () => {
      const query = '';
      const projectPath = '/test/project';
      const options: InteractiveOptions = {};

      const plan = await interactiveFeatures.generatePlanPreview(query, projectPath, options);

      expect(plan).toBeDefined();
      expect(plan.steps).toBeDefined();
      expect(plan.estimatedTime).toBeGreaterThanOrEqual(0);
      expect(plan.riskLevel).toMatch(/^(low|medium|high)$/);
    });
  });

  describe('formatPlanPreview', () => {
    it('should format plan preview correctly', () => {
      const mockPlan = {
        steps: [
          {
            id: 'step-1',
            name: 'Search for relevant files',
            description: 'Find files that match the query criteria',
            type: 'search' as const,
            estimatedTime: 2,
            dependencies: [],
            riskLevel: 'low' as const,
          },
          {
            id: 'step-2',
            name: 'Generate refactoring suggestions',
            description: 'Create specific refactoring recommendations',
            type: 'edit' as const,
            estimatedTime: 10,
            dependencies: ['step-1'],
            riskLevel: 'medium' as const,
            rollbackPlan: 'Revert to original code if issues arise',
          },
        ],
        estimatedTime: 12,
        riskLevel: 'medium' as const,
        rollbackPoints: ['step-2'],
        dependencies: ['step-1'],
      };

      const formatted = interactiveFeatures.formatPlanPreview(mockPlan);

      expect(formatted).toContain('Plan Preview (Dry Run)');
      expect(formatted).toContain('**Estimated Time:** 12 minutes');
      expect(formatted).toContain('**Risk Level:** MEDIUM');
      expect(formatted).toContain('**Rollback Points:** 1');
      expect(formatted).toContain('**Dependencies:** 1');
      expect(formatted).toContain('Search for relevant files');
      expect(formatted).toContain('Generate refactoring suggestions');
    });

    it('should handle empty plan gracefully', () => {
      const mockPlan = {
        steps: [],
        estimatedTime: 0,
        riskLevel: 'low' as const,
        rollbackPoints: [],
        dependencies: [],
      };

      const formatted = interactiveFeatures.formatPlanPreview(mockPlan);

      expect(formatted).toContain('Plan Preview (Dry Run)');
      expect(formatted).toContain('**Estimated Time:** 0 minutes');
      expect(formatted).toContain('**Risk Level:** LOW');
    });
  });

  describe('generateIDEIntegration', () => {
    it('should generate IDE integration data', () => {
      const citations = [
        {
          id: 'citation-1',
          type: 'file' as const,
          path: 'src/utils/helper.ts',
          line: 5,
          content: 'export function helper() { return "help"; }',
          relevance: 0.9,
          reason: 'Function definition matches query keywords',
        },
      ];

      const plan = {
        steps: [
          {
            id: 'step-1',
            name: 'Search for relevant files',
            description: 'Find files that match the query criteria',
            type: 'search' as const,
            estimatedTime: 2,
            dependencies: [],
            riskLevel: 'low' as const,
          },
        ],
        estimatedTime: 2,
        riskLevel: 'low' as const,
        rollbackPoints: [],
        dependencies: [],
      };

      const integration = interactiveFeatures.generateIDEIntegration(citations, plan);

      expect(integration).toBeDefined();
      expect(integration.hoverData).toBeDefined();
      expect(integration.quickActions).toBeDefined();
      expect(integration.statusBar).toBeDefined();
      expect(integration.quickActions.length).toBeGreaterThan(0);
      expect(integration.statusBar).toContain('RefactoGent');
    });
  });
});
