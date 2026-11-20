import { describe, it, expect } from 'vitest';
import { parseCode } from '../lib/analyzer/parser';
import { computeMetrics } from '../lib/analyzer/metrics';
import { analyzeText } from '../lib/analyzer/textAnalyzer';
import { aggregateResults } from '../lib/analyzer/aggregate';
import type { FileResult, Issue, ProjectResult } from '../lib/analyzer/types';
import {
  GRAPH_SCENARIOS,
  CYCLE_SCENARIOS,
  type GraphScenario,
} from '../test-fixtures/graph/graph.fixtures';

const DEEP_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);

function getLang(filename: string): 'js' | 'ts' {
  return filename.endsWith('.ts') || filename.endsWith('.tsx') ? 'ts' : 'js';
}

function getLanguageId(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const extMap: Record<string, string> = {
    js: 'js',
    ts: 'ts',
    py: 'py',
    java: 'java',
    go: 'go',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'cpp',
    cs: 'java',
    rs: 'go',
    rb: 'py',
  };
  return extMap[ext] || ext;
}

async function runScenario(scenario: GraphScenario): Promise<ProjectResult> {
  const fileResults: FileResult[] = [];
  const allIssues: { filePath: string; issue: Issue }[] = [];

  for (const [filePath, code] of Object.entries(scenario.files)) {
    const filename = filePath.split('/').pop() ?? filePath;
    const ext = '.' + filename.toLowerCase().split('.').pop();
    const isDeep = DEEP_EXTENSIONS.has(ext);

    if (isDeep) {
      const { ast } = parseCode(code, getLang(filename));
      const { summary, issues, imports } = computeMetrics(ast, code, filePath);

      fileResults.push({
        filename,
        filePath,
        score: 100,
        grade: 'Excellent',
        issueCount: issues.length,
        metrics: summary,
        mode: 'deep',
        imports,
        topIssue: issues[0]?.message?.slice(0, 100) ?? null,
      });

      issues.forEach((issue) => allIssues.push({ filePath, issue }));
    } else {
      const languageId = getLanguageId(filename);
      const quickResult = await analyzeText(code, languageId);

      fileResults.push({
        filename,
        filePath,
        score: quickResult.score,
        grade: quickResult.grade,
        issueCount: quickResult.issues.length,
        metrics: quickResult.metrics,
        mode: 'quick',
        imports: quickResult.imports,
        topIssue: quickResult.issues[0]?.message?.slice(0, 100) ?? null,
      });

      quickResult.issues.forEach((issue) => allIssues.push({ filePath, issue }));
    }
  }

  return aggregateResults(fileResults, '', allIssues, []);
}

function extractPreExistingFields(project: ProjectResult): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(project as unknown as Record<string, unknown>) };
  delete copy.graph;
  if (Array.isArray(copy.fileResults)) {
    copy.fileResults = (copy.fileResults as FileResult[]).map((f) => ({
      ...f,
      imports: f.imports?.map((imp) => (typeof imp === 'string' ? imp : imp.specifier)),
    }));
  }
  return copy;
}

describe('Phase 2A Snapshot Verification: byte-identical existing fields + Graph present', () => {
  const s0 = GRAPH_SCENARIOS.find((s) => s.id === 'S0')!;
  const s5a = GRAPH_SCENARIOS.find((s) => s.id === 'S5a')!;
  const c0 = CYCLE_SCENARIOS.find((s) => s.id === 'C0')!;

  describe('S0', () => {
    it('S0: pre-existing output fields unchanged', async () => {
      const project = await runScenario(s0);
      const existingFields = extractPreExistingFields(project);
      expect(existingFields).toMatchSnapshot();
    });

    it('S0: graph is exposed', async () => {
      const project = (await runScenario(s0)) as unknown as { graph?: { edges: unknown[]; nodes: unknown[]; unresolved: unknown[]; unsupportedLanguages: unknown[] } };
      expect(project.graph).toBeDefined();
      expect(project.graph?.edges).toEqual([
        { from: 'src/main.ts', to: 'src/a.ts', kind: 'import' },
        { from: 'src/a.ts', to: 'src/b.ts', kind: 'import' },
      ]);
      expect(project.graph?.nodes).toEqual([
        'src/main.ts',
        'src/a.ts',
        'src/b.ts',
        'src/orphan.ts',
      ]);
      expect(project.graph?.unresolved).toEqual([]);
      expect(project.graph?.unsupportedLanguages).toEqual([]);
    });
  });

  describe('S5a', () => {
    it('S5a: pre-existing output fields unchanged', async () => {
      const project = await runScenario(s5a);
      const existingFields = extractPreExistingFields(project);
      expect(existingFields).toMatchSnapshot();
    });

    it('S5a: graph is exposed', async () => {
      const project = (await runScenario(s5a)) as unknown as { graph?: { edges: unknown[]; nodes: unknown[]; unresolved: unknown[]; unsupportedLanguages: unknown[] } };
      expect(project.graph).toBeDefined();
      expect(project.graph?.edges).toEqual([
        { from: 'app/page.tsx', to: 'components/x.tsx', kind: 'import' },
      ]);
      expect(project.graph?.nodes).toEqual([
        'app/page.tsx',
        'components/x.tsx',
      ]);
      expect(project.graph?.unresolved).toEqual([]);
      expect(project.graph?.unsupportedLanguages).toEqual([]);
    });
  });

  describe('C0', () => {
    it('C0: pre-existing output fields unchanged', async () => {
      const project = await runScenario(c0);
      const existingFields = extractPreExistingFields(project);
      expect(existingFields).toMatchSnapshot();
    });

    it('C0: graph is exposed', async () => {
      const project = (await runScenario(c0)) as unknown as { graph?: { edges: unknown[]; nodes: unknown[]; unresolved: unknown[]; unsupportedLanguages: unknown[] } };
      expect(project.graph).toBeDefined();
      expect(project.graph?.edges).toEqual([
        { from: 'proj/a.ts', to: 'proj/b.ts', kind: 'import' },
        { from: 'proj/b.ts', to: 'proj/a.ts', kind: 'import' },
      ]);
      expect(project.graph?.nodes).toEqual([
        'proj/a.ts',
        'proj/b.ts',
      ]);
      expect(project.graph?.unresolved).toEqual([]);
      expect(project.graph?.unsupportedLanguages).toEqual([]);
    });
  });
});
