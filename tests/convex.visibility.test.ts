import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { generateScanId } from '../lib/db/saveScan';

const modules = import.meta.glob('../convex/**/*.*s');

function createFullScanArgs(scanId: string = 'scan_123', projectName: string = 'Test Project', visibility: string = 'summary') {
  return {
    scanId,
    projectName,
    languageMode: 'deep',
    projectScore: 85,
    grade: 'Good',
    categoryScores: {
      readability: 85,
      maintainability: 80,
      cleanliness: 90,
      structure: 85,
    },
    totalFiles: 10,
    totalLines: 500,
    totalFunctions: 25,
    topImprovements: '[]',
    aiSummary: 'Solid structure.',
    visibility,
    fileResults: JSON.stringify([{ filename: 'test.ts', score: 85, grade: 'Good', mode: 'deep' }]),
    architectureInsights: JSON.stringify({ mermaidGraph: 'graph TD;', cycles: [], godFiles: [], deadCode: [] }),
    rootCauseClusters: JSON.stringify([{ folder: 'src', issueCount: 2, architecturalTip: 'tip', affectedFiles: ['src/a.ts'], categories: ['cleanliness'] }]),
    topFixes: JSON.stringify([{ rank: 1, title: 'Fix imports', impact: 'High', description: 'desc' }]),
    detectedPatterns: JSON.stringify([{ name: 'MVC', confidence: 90, description: 'desc', evidence: [] }]),
    allIssues: JSON.stringify([{ filePath: 'src/a.ts', issue: { type: 'unused_variable', category: 'cleanliness', line: 10, message: 'Unused' } }]),
  };
}

describe('Phase 1B: Share Visibility and Scan IDs (G10, G13)', () => {
  describe('G10: Share visibility filtering on getScanById', () => {
    it('non-owner (unauthenticated) fetch of a scan with summary visibility must NOT include allIssues, architectureInsights, rootCauseClusters, fileResults, topFixes', async () => {
      const t = convexTest(schema, modules);
      const userA = t.withIdentity({ subject: 'user_a', name: 'User A', email: 'a@example.com' });
      await userA.mutation(api.scans.saveScan, createFullScanArgs('scan_summary', 'Project A', 'summary'));

      const result = await t.query(api.scans.getScanById, { scanId: 'scan_summary' });
      expect(result).not.toBeNull();
      expect(result?.scanId).toBe('scan_summary');
      expect(result?.projectScore).toBe(85);

      // Must NOT include sensitive/detailed fields
      expect(result?.allIssues).toBeUndefined();
      expect(result?.architectureInsights).toBeUndefined();
      expect(result?.rootCauseClusters).toBeUndefined();
      expect((result as any)?.fileResults).toBeUndefined();
      expect(result?.topFixes).toBeUndefined();
    });

    it('non-owner (different user) fetch of a scan with summary visibility must NOT include allIssues, architectureInsights, rootCauseClusters, fileResults, topFixes', async () => {
      const t = convexTest(schema, modules);
      const userA = t.withIdentity({ subject: 'user_a', name: 'User A', email: 'a@example.com' });
      await userA.mutation(api.scans.saveScan, createFullScanArgs('scan_summary_2', 'Project A', 'summary'));

      const userB = t.withIdentity({ subject: 'user_b', name: 'User B', email: 'b@example.com' });
      const result = await userB.query(api.scans.getScanById, { scanId: 'scan_summary_2' });
      expect(result).not.toBeNull();

      expect(result?.allIssues).toBeUndefined();
      expect(result?.architectureInsights).toBeUndefined();
      expect(result?.rootCauseClusters).toBeUndefined();
      expect((result as any)?.fileResults).toBeUndefined();
      expect(result?.topFixes).toBeUndefined();
    });

    it('owner fetch of a scan with summary visibility returns full data', async () => {
      const t = convexTest(schema, modules);
      const userA = t.withIdentity({ subject: 'user_a', name: 'User A', email: 'a@example.com' });
      await userA.mutation(api.scans.saveScan, createFullScanArgs('scan_owner_summary', 'Project A', 'summary'));

      const result = await userA.query(api.scans.getScanById, { scanId: 'scan_owner_summary' });
      expect(result).not.toBeNull();
      expect(result?.allIssues).toBeDefined();
      expect(result?.architectureInsights).toBeDefined();
      expect(result?.rootCauseClusters).toBeDefined();
      expect((result as any)?.fileResults).toBeDefined();
      expect(result?.topFixes).toBeDefined();
    });

    it('non-owner fetch of a scan with full visibility returns full data', async () => {
      const t = convexTest(schema, modules);
      const userA = t.withIdentity({ subject: 'user_a', name: 'User A', email: 'a@example.com' });
      await userA.mutation(api.scans.saveScan, createFullScanArgs('scan_full', 'Project A', 'full'));

      const result = await t.query(api.scans.getScanById, { scanId: 'scan_full' });
      expect(result).not.toBeNull();
      expect(result?.allIssues).toBeDefined();
      expect(result?.architectureInsights).toBeDefined();
      expect(result?.rootCauseClusters).toBeDefined();
      expect((result as any)?.fileResults).toBeDefined();
      expect(result?.topFixes).toBeDefined();
    });
  });

  describe('G13: Scan IDs generated with crypto.randomUUID', () => {
    it('generateScanId returns a valid UUID format', () => {
      const id = generateScanId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generateScanId does not use Math.random', () => {
      const mathRandomSpy = vi.spyOn(Math, 'random');
      try {
        generateScanId();
        expect(mathRandomSpy).not.toHaveBeenCalled();
      } finally {
        mathRandomSpy.mockRestore();
      }
    });
  });
});
