import { PatchSetManager, PatchSetOptions, FilePatch } from '../planner/patch-sets.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe('PatchSetManager', () => {
  let manager: PatchSetManager;
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

    manager = new PatchSetManager(logger, metrics, tracer, config);
  });

  const createMockPatch = (
    filePath: string,
    originalContent: string,
    newContent: string
  ): FilePatch => ({
    filePath,
    originalContent,
    newContent,
    changes: [
      {
        type: 'replace',
        startLine: 1,
        endLine: 1,
        originalText: originalContent,
        newText: newContent,
        context: {
          before: [],
          after: [],
        },
      },
    ],
    metadata: {
      timestamp: Date.now(),
      author: 'test',
      description: 'Test patch',
      checksum: 'test-checksum',
    },
  });

  describe('createPatchSet', () => {
    it('should create a patch set with basic options', async () => {
      const patches = [
        createMockPatch('src/test.ts', 'old code', 'new code'),
        createMockPatch('src/utils.ts', 'old utils', 'new utils'),
      ];

      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches);

      expect(patchSet).toBeDefined();
      expect(patchSet.id).toBeDefined();
      expect(patchSet.name).toBe('test-patch-set');
      expect(patchSet.description).toBe('Test patch set');
      expect(patchSet.patches).toEqual(patches);
      expect(patchSet.metadata.totalChanges).toBe(2);
      expect(patchSet.metadata.filesAffected).toBe(2);
    });

    it('should create a patch set with backup', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const options: PatchSetOptions = {
        createBackup: true,
        validateChanges: true,
        includeMetadata: true,
        estimateImpact: true,
        generateRollback: true,
      };

      const patchSet = await manager.createPatchSet(
        'test-patch-set',
        'Test patch set',
        patches,
        options
      );

      expect(patchSet).toBeDefined();
      expect(patchSet.rollbackPlan).toBeDefined();
      expect(patchSet.metadata.estimatedImpact).toBeDefined();
    });

    it('should validate patches when requested', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const options: PatchSetOptions = {
        validateChanges: true,
      };

      const patchSet = await manager.createPatchSet(
        'test-patch-set',
        'Test patch set',
        patches,
        options
      );

      expect(patchSet).toBeDefined();
    });

    it('should estimate impact when requested', async () => {
      const patches = [
        createMockPatch('src/test.ts', 'old code', 'new code'),
        createMockPatch('src/utils.ts', 'old utils', 'new utils'),
        createMockPatch('src/helper.ts', 'old helper', 'new helper'),
      ];
      const options: PatchSetOptions = {
        estimateImpact: true,
      };

      const patchSet = await manager.createPatchSet(
        'test-patch-set',
        'Test patch set',
        patches,
        options
      );

      expect(patchSet.metadata.estimatedImpact).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(patchSet.metadata.estimatedImpact);
    });

    it('should generate rollback plan when requested', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const options: PatchSetOptions = {
        generateRollback: true,
      };

      const patchSet = await manager.createPatchSet(
        'test-patch-set',
        'Test patch set',
        patches,
        options
      );

      expect(patchSet.rollbackPlan).toBeDefined();
      expect(patchSet.rollbackPlan?.patches.length).toBe(1);
      expect(patchSet.rollbackPlan?.verification).toBeDefined();
      expect(patchSet.rollbackPlan?.instructions.length).toBeGreaterThan(0);
    });

    it('should handle empty patches array', async () => {
      const patchSet = await manager.createPatchSet('empty-patch-set', 'Empty patch set', []);

      expect(patchSet).toBeDefined();
      expect(patchSet.patches.length).toBe(0);
      expect(patchSet.metadata.totalChanges).toBe(0);
      expect(patchSet.metadata.filesAffected).toBe(0);
    });
  });

  describe('applyPatchSet', () => {
    it('should apply a patch set successfully', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches);

      const result = await manager.applyPatchSet(patchSet.id);

      expect(result.success).toBe(true);
      expect(result.appliedPatches.length).toBe(1);
      expect(result.failedPatches.length).toBe(0);
    });

    it('should handle dry run mode', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches);

      const result = await manager.applyPatchSet(patchSet.id, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.appliedPatches.length).toBe(1);
    });

    it('should create backup when requested', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches);

      const result = await manager.applyPatchSet(patchSet.id, { backup: true });

      expect(result.success).toBe(true);
      expect(result.rollbackData).toBeDefined();
    });

    it('should handle non-existent patch set', async () => {
      await expect(manager.applyPatchSet('non-existent-id')).rejects.toThrow();
    });
  });

  describe('rollbackPatchSet', () => {
    it('should rollback a patch set with rollback plan', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches, {
        generateRollback: true,
      });

      const result = await manager.rollbackPatchSet(patchSet.id);

      expect(result.success).toBe(true);
      expect(result.rolledBackPatches.length).toBe(1);
      expect(result.failedPatches.length).toBe(0);
    });

    it('should handle patch set without rollback plan', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches);

      await expect(manager.rollbackPatchSet(patchSet.id)).rejects.toThrow();
    });

    it('should handle non-existent patch set for rollback', async () => {
      await expect(manager.rollbackPatchSet('non-existent-id')).rejects.toThrow();
    });
  });

  describe('patch set management', () => {
    it('should get patch set by ID', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', patches);

      const retrieved = manager.getPatchSet(patchSet.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(patchSet.id);
      expect(retrieved?.name).toBe('test-patch-set');
    });

    it('should return undefined for non-existent patch set', () => {
      const retrieved = manager.getPatchSet('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should list all patch sets', async () => {
      const patchSet1 = await manager.createPatchSet('patch-set-1', 'First patch set', [
        createMockPatch('src/test1.ts', 'old1', 'new1'),
      ]);

      const patchSet2 = await manager.createPatchSet('patch-set-2', 'Second patch set', [
        createMockPatch('src/test2.ts', 'old2', 'new2'),
      ]);

      const allPatchSets = manager.listPatchSets();

      expect(allPatchSets.length).toBeGreaterThanOrEqual(2);
      expect(allPatchSets.some(ps => ps.id === patchSet1.id)).toBe(true);
      expect(allPatchSets.some(ps => ps.id === patchSet2.id)).toBe(true);
    });

    it('should delete patch set', async () => {
      const patchSet = await manager.createPatchSet('test-patch-set', 'Test patch set', [
        createMockPatch('src/test.ts', 'old code', 'new code'),
      ]);

      const deleted = await manager.deletePatchSet(patchSet.id);

      expect(deleted).toBe(true);

      const retrieved = manager.getPatchSet(patchSet.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting non-existent patch set', async () => {
      const deleted = await manager.deletePatchSet('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('getPatchSetStats', () => {
    it('should return patch set statistics', async () => {
      await manager.createPatchSet('patch-set-1', 'First patch set', [
        createMockPatch('src/test1.ts', 'old1', 'new1'),
      ]);

      await manager.createPatchSet('patch-set-2', 'Second patch set', [
        createMockPatch('src/test2.ts', 'old2', 'new2'),
        createMockPatch('src/utils.ts', 'old utils', 'new utils'),
      ]);

      const stats = await manager.getPatchSetStats();

      expect(stats.totalPatchSets).toBeGreaterThanOrEqual(2);
      expect(stats.totalPatches).toBeGreaterThanOrEqual(3);
      expect(stats.totalFilesAffected).toBeGreaterThanOrEqual(3);
      expect(stats.averageChangesPerPatchSet).toBeGreaterThan(0);
      expect(stats.impactDistribution).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid patch data gracefully', async () => {
      const invalidPatches = [
        {
          filePath: 'src/test.ts',
          originalContent: 'old code',
          newContent: 'new code',
          changes: [],
          metadata: {
            timestamp: Date.now(),
            author: 'test',
            description: 'Test patch',
            checksum: 'test-checksum',
          },
        } as FilePatch,
      ];

      const patchSet = await manager.createPatchSet(
        'invalid-patch-set',
        'Invalid patch set',
        invalidPatches
      );

      expect(patchSet).toBeDefined();
      expect(patchSet.metadata.totalChanges).toBe(0);
    });

    it('should handle empty patch set name', async () => {
      const patches = [createMockPatch('src/test.ts', 'old code', 'new code')];

      const patchSet = await manager.createPatchSet('', 'Empty name patch set', patches);

      expect(patchSet).toBeDefined();
      expect(patchSet.name).toBe('');
    });
  });
});

