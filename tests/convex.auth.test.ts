import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

const modules = import.meta.glob('../convex/**/*.*s');

function createSampleScanArgs(scanId: string = 'scan_123', projectName: string = 'Test Project') {
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
    visibility: 'summary',
  };
}

describe('Phase 1A: Convex Authentication & Authorization Gates', () => {
  describe('Gate A: Unauthenticated calls must be rejected', () => {
    it('rejects saveScan without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.scans.saveScan, createSampleScanArgs())
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });

    it('rejects getLastTwoScansForProject without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.query(api.scans.getLastTwoScansForProject, { projectName: 'Test' })
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });

    it('rejects getScansByUser without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.query(api.scans.getScansByUser, {})
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });

    it('rejects getProjectHistory without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.query(api.scans.getProjectHistory, { projectName: 'Test' })
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });

    it('rejects deleteScan without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.scans.deleteScan, { scanId: 'scan_123' })
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });

    it('rejects deleteProjectScans without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.scans.deleteProjectScans, { projectName: 'Test' })
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });

    it('rejects CreateNewUser without authentication', async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.user.CreateNewUser, {})
      ).rejects.toThrow(/Unauthenticated|Unauthorized/i);
    });
  });

  describe('Gate B: Cross-user isolation (User A vs User B)', () => {
    it('prevents user B from reading or deleting user A scans', async () => {
      const t = convexTest(schema, modules);

      // Authenticate as User A and save a scan
      const userA = t.withIdentity({ subject: 'user_a', name: 'User A', email: 'a@example.com' });
      await userA.mutation(
        api.scans.saveScan,
        createSampleScanArgs('scan_user_a', 'Project A')
      );

      // Authenticate as User B
      const userB = t.withIdentity({ subject: 'user_b', name: 'User B', email: 'b@example.com' });

      // User B queries project scans for Project A => must NOT return User A's scans
      const scansForProject = await userB.query(
        api.scans.getLastTwoScansForProject,
        { projectName: 'Project A' }
      );
      expect(scansForProject).toEqual([]);

      // User B queries dashboard scans => must NOT return User A's scans
      const userBScans = await userB.query(api.scans.getScansByUser, {});
      expect(userBScans).toEqual([]);

      // User B tries to delete User A's scan => must throw or return false
      const deleteResult = await userB.mutation(
        api.scans.deleteScan,
        { scanId: 'scan_user_a' }
      );
      expect(deleteResult).toEqual({ success: false });

      // User B tries to delete Project A scans => must not delete User A's scans
      const deleteProjectResult = await userB.mutation(
        api.scans.deleteProjectScans,
        { projectName: 'Project A' }
      );
      expect(deleteProjectResult.deletedCount).toBe(0);

      // Verify User A's scan is still intact
      const userAScans = await userA.query(api.scans.getScansByUser, {});
      expect(userAScans.length).toBe(1);
      expect(userAScans[0].scanId).toBe('scan_user_a');
    });

    it('is idempotent and preserves token balance for existing user in CreateNewUser', async () => {
      const t = convexTest(schema, modules);
      const userA = t.withIdentity({ subject: 'user_a', name: 'User A', email: 'a@example.com' });
      const first = await userA.mutation(api.user.CreateNewUser, {});
      expect(first.token).toBe(5000);

      // Simulate token consumption directly in db
      await t.mutation(async (ctx) => {
        const u = await ctx.db
          .query('UserTable')
          .filter((q) => q.eq(q.field('email'), 'a@example.com'))
          .first();
        if (u) {
          await ctx.db.patch(u._id, { token: 4200 });
        }
      });

      // Calling CreateNewUser again must not overwrite or reset balance
      const second = await userA.mutation(api.user.CreateNewUser, {});
      expect(second.token).toBe(4200);
    });
  });
});
