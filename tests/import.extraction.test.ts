import { describe, it, expect } from 'vitest';
import { parseCode } from '../lib/analyzer/parser';
import { computeMetrics } from '../lib/analyzer/metrics';
import { aggregateResults } from '../lib/analyzer/aggregate';
import type { FileResult } from '../lib/analyzer/types';

function extractImportsFromCode(code: string, filename: string = 'test.ts') {
  const { ast } = parseCode(code, 'ts');
  const { imports } = computeMetrics(ast, code, filename);
  return imports;
}

describe('Phase 2B: Import Extraction Unit Tests per Construct', () => {
  it('extracts standard ES ImportDeclaration as kind: import', () => {
    const code = `import { foo } from './foo';\nimport bar from '@/bar';`;
    const imports = extractImportsFromCode(code);
    expect(imports).toEqual([
      { specifier: './foo', kind: 'import' },
      { specifier: '@/bar', kind: 'import' },
    ]);
  });

  it('extracts CallExpression require("literal") as kind: require', () => {
    const code = `const a = require('./a');\nconst config = require('@/config');`;
    const imports = extractImportsFromCode(code);
    expect(imports).toEqual([
      { specifier: './a', kind: 'require' },
      { specifier: '@/config', kind: 'require' },
    ]);
  });

  it('extracts dynamic import("literal") as kind: dynamic', () => {
    const code = `async function load() { const mod = await import('./dynamicMod'); return mod; }`;
    const imports = extractImportsFromCode(code);
    expect(imports).toEqual([
      { specifier: './dynamicMod', kind: 'dynamic' },
    ]);
  });

  it('extracts ExportAllDeclaration with source as kind: reexport', () => {
    const code = `export * from './greet';\nexport * from '@/utils';`;
    const imports = extractImportsFromCode(code);
    expect(imports).toEqual([
      { specifier: './greet', kind: 'reexport' },
      { specifier: '@/utils', kind: 'reexport' },
    ]);
  });

  it('extracts ExportNamedDeclaration with source as kind: reexport', () => {
    const code = `export { add, sub } from './math';\nexport { helper as default } from '@/helper';`;
    const imports = extractImportsFromCode(code);
    expect(imports).toEqual([
      { specifier: './math', kind: 'reexport' },
      { specifier: '@/helper', kind: 'reexport' },
    ]);
  });

  it('ignores ExportNamedDeclaration without source', () => {
    const code = `const x = 1;\nexport { x };\nexport const y = 2;`;
    const imports = extractImportsFromCode(code);
    expect(imports).toEqual([]);
  });

  it('records non-literal require specifiers (variables, template with expressions) as isNonLiteral', () => {
    const code = `
      const modName = './a';
      require(modName);
      require(\`./\${modName}\`);
    `;
    const imports = extractImportsFromCode(code);
    expect(imports.length).toBe(2);
    expect(imports[0]).toMatchObject({ kind: 'require', isNonLiteral: true });
    expect(imports[1]).toMatchObject({ kind: 'require', isNonLiteral: true });
  });

  it('records non-literal dynamic import specifiers (variables, expressions) as isNonLiteral', () => {
    const code = `
      const path = './b';
      import(path);
      import(\`./prefix/\${path}\`);
    `;
    const imports = extractImportsFromCode(code);
    expect(imports.length).toBe(2);
    expect(imports[0]).toMatchObject({ kind: 'dynamic', isNonLiteral: true });
    expect(imports[1]).toMatchObject({ kind: 'dynamic', isNonLiteral: true });
  });

  it('non-literal specifiers become unresolved in Graph, NEVER edges', () => {
    const code = `
      const target = './other';
      require(target);
      import(\`./\${target}\`);
    `;
    const { ast } = parseCode(code, 'ts');
    const { summary, issues, imports } = computeMetrics(ast, code, 'src/main.ts');

    const fileResults: FileResult[] = [
      {
        filename: 'main.ts',
        filePath: 'src/main.ts',
        score: 100,
        grade: 'Excellent',
        issueCount: issues.length,
        metrics: summary,
        mode: 'deep',
        imports,
        topIssue: null,
      },
      {
        filename: 'other.ts',
        filePath: 'src/other.ts',
        score: 100,
        grade: 'Excellent',
        issueCount: 0,
        metrics: summary,
        mode: 'deep',
        imports: [],
        topIssue: null,
      },
    ];

    const project = aggregateResults(fileResults, '', [], []);

    // Edges must NOT contain non-literal specifiers
    expect(project.graph?.edges).toEqual([]);

    // Must be recorded as unresolved
    expect(project.graph?.unresolved.length).toBe(2);
    expect(project.graph?.unresolved[0].from).toBe('src/main.ts');
    expect(project.graph?.unresolved[1].from).toBe('src/main.ts');
  });
});
