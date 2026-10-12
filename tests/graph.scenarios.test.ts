import { describe, it, expect } from 'vitest';
import { parseCode } from '../lib/analyzer/parser';
import { computeMetrics } from '../lib/analyzer/metrics';
import { analyzeText } from '../lib/analyzer/textAnalyzer';
import { aggregateResults } from '../lib/analyzer/aggregate';
import type { FileResult, Issue } from '../lib/analyzer/types';
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

async function runScenarioPipeline(scenario: GraphScenario): Promise<{
  unreferenced: string[];
  falseUnreferenced: string[];
  cycleCount: number;
}> {
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

  // Honor scenario.config (e.g. tsconfig.json) only to the extent the current code reads it (today: none)
  const project = aggregateResults(fileResults, '', allIssues, []);
  const unreferenced = (project.architectureInsights?.deadCode ?? []).slice().sort();
  const cycles = project.architectureInsights?.cycles ?? [];
  const cycleCount = cycles.length;

  const falseUnreferenced = unreferenced
    .filter((f) => !scenario.expectedUnreferenced.includes(f))
    .slice()
    .sort();

  return {
    unreferenced,
    falseUnreferenced,
    cycleCount,
  };
}

describe('Aurelin Graph Scenarios Test Harness', () => {
  const allScenarios = [...GRAPH_SCENARIOS, ...CYCLE_SCENARIOS];

  describe('Target behavior assertions (controls pass, gaps fail-by-design)', () => {
    for (const scenario of allScenarios) {
      const testTitle = `${scenario.id}: ${scenario.title}`;

      if (scenario.kind === 'control') {
        it(testTitle, async () => {
          const { unreferenced, cycleCount } = await runScenarioPipeline(scenario);
          expect(unreferenced).toEqual([...scenario.expectedUnreferenced].sort());
          expect(cycleCount).toBe(scenario.expectedCycles);
        });
      } else {
        // Gap scenarios are expected to fail until their respective fixing phase lands
        it.fails(testTitle, async () => {
          const { unreferenced, cycleCount } = await runScenarioPipeline(scenario);
          expect(unreferenced).toEqual([...scenario.expectedUnreferenced].sort());
          expect(cycleCount).toBe(scenario.expectedCycles);
        });
      }
    }
  });

  describe('Guarding the evidence: measuredToday matches current output', () => {
    for (const scenario of allScenarios) {
      it(`${scenario.id} measuredToday matches analyzer output`, async () => {
        const { unreferenced, falseUnreferenced, cycleCount } =
          await runScenarioPipeline(scenario);

        // Guard the measured evidence
        expect(falseUnreferenced).toEqual([...scenario.measuredToday.falseUnreferenced].sort());
        expect(cycleCount).toBe(scenario.measuredToday.cyclesFound);

        // Also guard total dead code = expectedUnreferenced + measuredToday.falseUnreferenced
        const expectedTotalDead = [
          ...scenario.expectedUnreferenced,
          ...scenario.measuredToday.falseUnreferenced,
        ].sort();
        expect(unreferenced).toEqual(expectedTotalDead);
      });
    }
  });
});
