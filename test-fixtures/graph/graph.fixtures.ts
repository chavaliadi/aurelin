/**
 * Aurelin graph fixtures: evidence AND target tests.
 *
 * Measured 2026-10-12 against repo HEAD 7913893 by running the real analyzer
 * (parseCode -> computeMetrics | analyzeText -> aggregateResults) on each scenario.
 * `measuredToday` is what the analyzer produced BEFORE any fix. After a phase lands,
 * update it (it should become expectedUnreferenced / expectedCycles).
 *
 * Usage in Vitest (Phase 0): for every scenario with fixedByPhase !== null, wrap the
 * assertion in `it.fails(...)`. When the phase that fixes it lands, flip `it.fails` -> `it`.
 * Controls (kind: 'control') must always pass with plain `it`.
 *
 * Drop this file at: test-fixtures/graph/graph.fixtures.ts
 */

export type ScenarioKind = 'control' | 'gap';
export type FixPhase = '2B' | '2C' | '2D' | '2E';

export interface GraphScenario {
  id: string;
  title: string;
  kind: ScenarioKind;
  /** analyzable source files: path -> source text */
  files: Record<string, string>;
  /** non-source files the resolver may read (tsconfig.json, package.json) */
  config?: Record<string, string>;
  /** the TRUE dead-code answer */
  expectedUnreferenced: string[];
  /** the TRUE number of import cycles */
  expectedCycles: number;
  /** what the analyzer produced at HEAD 7913893, before any fix */
  measuredToday: { falseUnreferenced: string[]; cyclesFound: number };
  fixedByPhase: FixPhase | null;
  note?: string;
}

const TSCONFIG_AT_ROOT = JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } });
const TSCONFIG_SRC = JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } });
const TSCONFIG_CUSTOM = JSON.stringify({
  compilerOptions: { baseUrl: '.', paths: { '~/*': ['src/*'], '@lib/*': ['src/lib/*'] } },
});

export const GRAPH_SCENARIOS: GraphScenario[] = [
  {
    id: 'S0',
    title: 'control: plain relative imports + one real orphan',
    kind: 'control',
    files: {
      'src/main.ts': `import { a } from './a'; console.log(a);`,
      'src/a.ts': `import { b } from './b'; export const a = b + 1;`,
      'src/b.ts': `export const b = 1;`,
      'src/orphan.ts': `export const o = 1;`,
    },
    expectedUnreferenced: ['src/orphan.ts'],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: [], cyclesFound: 0 },
    fixedByPhase: null,
  },
  {
    id: 'S1',
    title: 'barrel file re-exports (export * from / export { x } from)',
    kind: 'gap',
    files: {
      'src/main.ts': `import { greet, add } from './lib'; console.log(greet('x'), add(1, 2));`,
      'src/lib/index.ts': `export * from './greet';\nexport { add } from './math';`,
      'src/lib/greet.ts': `export const greet = (n: string) => 'hi ' + n;`,
      'src/lib/math.ts': `export const add = (a: number, b: number) => a + b;`,
    },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: ['src/lib/greet.ts', 'src/lib/math.ts'], cyclesFound: 0 },
    fixedByPhase: '2B',
  },
  {
    id: 'S2',
    title: "require('./a') and await import('./b')",
    kind: 'gap',
    files: {
      'src/main.js': `const a = require('./a');\nasync function f() { const b = await import('./b'); return b; }\nmodule.exports = { a, f };`,
      'src/a.js': `module.exports = 1;`,
      'src/b.js': `export default 2;`,
    },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: ['src/a.js', 'src/b.js'], cyclesFound: 0 },
    fixedByPhase: '2B',
    note: "Next.js dynamic(() => import('./x')) is the same shape and very common.",
  },
  {
    id: 'S3',
    title: "ESM '.js' suffix in TS imports (file on disk is util.ts)",
    kind: 'gap',
    files: {
      'src/main.ts': `import { x } from './util.js'; console.log(x);`,
      'src/util.ts': `export const x = 1;`,
    },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: ['src/util.ts'], cyclesFound: 0 },
    fixedByPhase: '2C',
  },
  {
    id: 'S4',
    title: 'tsconfig paths aliases (~/* and @lib/*)',
    kind: 'gap',
    files: {
      'src/main.ts': `import { y } from '~/lib/y';\nimport { z } from '@lib/z';\nconsole.log(y, z);`,
      'src/lib/y.ts': `export const y = 1;`,
      'src/lib/z.ts': `export const z = 1;`,
    },
    config: { 'tsconfig.json': TSCONFIG_CUSTOM },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: ['src/lib/y.ts', 'src/lib/z.ts'], cyclesFound: 0 },
    fixedByPhase: '2C',
  },
  {
    id: 'S5a',
    title: "'@/' alias, ZIP made from inside the project (no wrapper folder)",
    kind: 'control',
    files: {
      'app/page.tsx': `import X from '@/components/x'; export default X;`,
      'components/x.tsx': `export default function X() { return null }`,
    },
    config: { 'tsconfig.json': TSCONFIG_AT_ROOT },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: [], cyclesFound: 0 },
    fixedByPhase: null,
    note: 'This is the only @/ shape the current resolver handles. Must keep passing.',
  },
  {
    id: 'S5b',
    title: "'@/' alias, ZIP WITH a top-level folder (macOS/Windows 'compress folder')",
    kind: 'gap',
    files: {
      'myproj/app/page.tsx': `import X from '@/components/x'; export default X;`,
      'myproj/components/x.tsx': `export default function X() { return null }`,
    },
    config: { 'myproj/tsconfig.json': TSCONFIG_AT_ROOT },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: ['myproj/components/x.tsx'], cyclesFound: 0 },
    fixedByPhase: '2C',
  },
  {
    id: 'S5c',
    title: "'@/*' maps to ./src/* (create-next-app default with src/ dir)",
    kind: 'gap',
    files: {
      'src/app/page.tsx': `import X from '@/components/x'; export default X;`,
      'src/components/x.tsx': `export default function X() { return null }`,
    },
    config: { 'tsconfig.json': TSCONFIG_SRC },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: { falseUnreferenced: ['src/components/x.tsx'], cyclesFound: 0 },
    fixedByPhase: '2C',
  },
  {
    id: 'S6',
    title: 'Python project (absolute, dotted, and relative imports)',
    kind: 'gap',
    files: {
      'main.py': `from utils import helper\nimport pkg.mod\nfrom . import sibling\n\nhelper()\n`,
      'utils.py': `def helper():\n    return 1\n`,
      'pkg/mod.py': `X = 1\n`,
      'sibling.py': `Y = 2\n`,
    },
    expectedUnreferenced: [],
    expectedCycles: 0,
    measuredToday: {
      falseUnreferenced: ['main.py', 'pkg/mod.py', 'sibling.py', 'utils.py'],
      cyclesFound: 0,
    },
    fixedByPhase: '2D',
    note:
      "Raw imports captured today: main.py -> ['utils','pkg'] ('from . import sibling' is missed, " +
      "'import pkg.mod' is truncated to 'pkg'). 2D: suppress dead-code/cycle claims for languages " +
      'without graph support. 2E (optional): real Python resolution, then main.py is an entry point.',
  },
  {
    id: 'S7',
    title: 'framework/tooling entry files nobody imports (+1 real orphan)',
    kind: 'gap',
    files: {
      'src/main.ts': `console.log('hi');`,
      'proxy.ts': `export default function proxy() {}`,
      'middleware.ts': `export default function mw() {}`,
      'convex/schema.ts': `export default {};`,
      'next.config.ts': `export default {};`,
      'src/a.test.ts': `test('x', () => {});`,
      'scripts/seed.ts': `console.log('seed');`,
      'src/orphan.ts': `export const o = 1;`,
    },
    expectedUnreferenced: ['src/orphan.ts'],
    expectedCycles: 0,
    measuredToday: {
      falseUnreferenced: [
        'convex/schema.ts',
        'middleware.ts',
        'next.config.ts',
        'proxy.ts',
        'scripts/seed.ts',
        'src/a.test.ts',
      ],
      cyclesFound: 0,
    },
    fixedByPhase: '2D',
    note: 'Decision recorded in PLAN.md: tests, scripts, configs, middleware/proxy, convex/** are entry points.',
  },
];

export const CYCLE_SCENARIOS: GraphScenario[] = [
  {
    id: 'C0',
    title: 'control: cycle via relative imports',
    kind: 'control',
    files: {
      'proj/a.ts': `import { b } from './b'; export const a = 1;`,
      'proj/b.ts': `import { a } from './a'; export const b = 2;`,
    },
    expectedUnreferenced: [],
    expectedCycles: 1,
    measuredToday: { falseUnreferenced: [], cyclesFound: 1 },
    fixedByPhase: null,
  },
  {
    id: 'C1',
    title: "real cycle where one edge uses '@/' inside a ZIP with a top-level folder",
    kind: 'gap',
    files: {
      'proj/a.ts': `import { b } from '@/b'; export const a = 1;`,
      'proj/b.ts': `import { a } from './a'; export const b = 2;`,
    },
    config: { 'proj/tsconfig.json': TSCONFIG_AT_ROOT },
    expectedUnreferenced: [],
    expectedCycles: 1,
    measuredToday: { falseUnreferenced: ['proj/b.ts'], cyclesFound: 0 },
    fixedByPhase: '2C',
  },
  {
    id: 'C2',
    title: 'real cycle hidden behind a barrel (index.ts re-exports)',
    kind: 'gap',
    files: {
      'src/a.ts': `import { b } from './lib'; export const a = 1;`,
      'src/lib/index.ts': `export * from './b';`,
      'src/lib/b.ts': `import { a } from '../a'; export const b = 2;`,
    },
    expectedUnreferenced: [],
    expectedCycles: 1,
    measuredToday: { falseUnreferenced: ['src/lib/b.ts'], cyclesFound: 0 },
    fixedByPhase: '2B',
  },
];