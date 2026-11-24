import { describe, it, expect } from 'vitest';
import {
    detectWrapperPrefix,
    stripJsonComments,
    parseConfig,
    choosePrimaryConfig,
    resolveSpecifier,
    resolveImports,
    RESOLUTION_PRECEDENCE_EXTENSIONS,
} from '../lib/analyzer/resolve';

describe('Import Resolver Unit Tests', () => {
    describe('1. Wrapper folder detection', () => {
        it('returns empty string when there is no wrapper (Amendment 4 / S5a case)', () => {
            const files = ['app/page.tsx', 'components/x.tsx'];
            expect(detectWrapperPrefix(files)).toBe('');
        });

        it('returns empty string for empty file list', () => {
            expect(detectWrapperPrefix([])).toBe('');
        });

        it('returns empty string when files are in the root directory', () => {
            const files = ['package.json', 'src/index.ts'];
            expect(detectWrapperPrefix(files)).toBe('');
        });

        it('detects a single top-level wrapper directory (S5b case)', () => {
            const files = ['myproj/app/page.tsx', 'myproj/components/x.tsx'];
            expect(detectWrapperPrefix(files)).toBe('myproj');
        });

        it('detects single wrapper with nested subfolders', () => {
            const files = ['proj/a.ts', 'proj/sub/b.ts', 'proj/sub/deep/c.ts'];
            expect(detectWrapperPrefix(files)).toBe('proj');
        });

        it('returns empty string when root file is not first in the array', () => {
            const files = ['proj/a.ts', 'package.json'];
            expect(detectWrapperPrefix(files)).toBe('');
        });
    });

    describe('2. TSConfig / JSConfig parsing & comments', () => {
        it('strips single-line and multi-line comments directly', () => {
            const raw = '{\n// comment\n"a": 1, /* inline */ "b": 2,\n}';
            expect(JSON.parse(stripJsonComments(raw))).toEqual({ a: 1, b: 2 });
        });

        it('strips single-line and multi-line comments and trailing commas', () => {
            const jsonc = `{
                // Compiler options for project
                "compilerOptions": {
                    "baseUrl": ".", /* base directory */
                    "paths": {
                        "@/*": ["./src/*"], // alias
                    },
                },
            }`;
            const parsed = parseConfig(jsonc, 'tsconfig.json');
            expect(parsed).not.toBeNull();
            expect(parsed?.baseUrl).toBe('.');
            expect(parsed?.paths).toEqual({ '@/*': ['./src/*'] });
        });

        it('prioritizes tsconfig nearest the upload root and notes ignored configs (Amendment 3)', () => {
            const configs = {
                'packages/sub/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: './sub' } }),
                'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
                'jsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: './js' } }),
            };
            const selection = choosePrimaryConfig(configs, '');
            expect(selection).not.toBeNull();
            expect(selection?.config.configPath).toBe('tsconfig.json');
            expect(selection?.ignoredConfigs).toContain('packages/sub/tsconfig.json');
            expect(selection?.ignoredConfigs).toContain('jsconfig.json');
        });

        it('accounts for wrapper prefix when evaluating depth of tsconfig', () => {
            const configs = {
                'myproj/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
                'myproj/packages/sub/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: './sub' } }),
            };
            const selection = choosePrimaryConfig(configs, 'myproj');
            expect(selection).not.toBeNull();
            expect(selection?.config.configPath).toBe('myproj/tsconfig.json');
            expect(selection?.ignoredConfigs).toContain('myproj/packages/sub/tsconfig.json');
        });

        it('returns null for malformed JSON', () => {
            const result = parseConfig('{ not valid json !!!', 'tsconfig.json');
            expect(result).toBeNull();
        });

        it('falls back to deeper config when nearest config is malformed JSON', () => {
            const configs = {
                'tsconfig.json': '{ invalid json !!!',
                'packages/sub/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: './sub' } }),
            };
            const selection = choosePrimaryConfig(configs, '');
            expect(selection).not.toBeNull();
            expect(selection?.config.configPath).toBe('packages/sub/tsconfig.json');
            expect(selection?.ignoredConfigs).toContain('tsconfig.json');
        });
    });

    describe('3. Single-specifier resolution rules (resolveSpecifier)', () => {
        const allFiles = new Set([
            'src/main.ts',
            'src/util.ts',
            'src/lib/index.ts',
            'src/lib/helper.ts',
            'components/button.tsx',
            'components/card/index.tsx',
            'ambig.ts',
            'ambig.js',
        ]);

        const baseCtx = {
            allFiles,
            wrapperPrefix: '',
            config: null,
        };

        it('resolves relative imports without extension', () => {
            const outcome = resolveSpecifier('./util', 'src/main.ts', baseCtx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('resolves ESM .js suffix to .ts file (S3 rule)', () => {
            const outcome = resolveSpecifier('./util.js', 'src/main.ts', baseCtx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('resolves directory import to index file', () => {
            const outcome = resolveSpecifier('./lib', 'src/main.ts', baseCtx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/lib/index.ts' });
        });

        it('resolves paths with wildcards in tsconfig (S4 rule)', () => {
            const ctx = {
                allFiles,
                wrapperPrefix: '',
                config: {
                    configPath: 'tsconfig.json',
                    configDir: '',
                    baseUrl: '.',
                    paths: {
                        '@components/*': ['components/*'],
                    },
                },
            };
            const outcome = resolveSpecifier('@components/button', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'components/button.tsx' });
        });

        it('resolves index files via paths alias', () => {
            const ctx = {
                allFiles,
                wrapperPrefix: '',
                config: {
                    configPath: 'tsconfig.json',
                    configDir: '',
                    baseUrl: '.',
                    paths: {
                        '@ui/*': ['components/*'],
                    },
                },
            };
            const outcome = resolveSpecifier('@ui/card', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'components/card/index.tsx' });
        });

        it('resolves baseUrl without alias', () => {
            const ctx = {
                allFiles,
                wrapperPrefix: '',
                config: {
                    configPath: 'tsconfig.json',
                    configDir: '',
                    baseUrl: 'src',
                },
            };
            const outcome = resolveSpecifier('util', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('handles wrapper prefix in fallback root alias (S5b rule)', () => {
            const wrapperFiles = new Set(['myproj/app/page.tsx', 'myproj/components/x.tsx']);
            const ctx = {
                allFiles: wrapperFiles,
                wrapperPrefix: 'myproj',
                config: null,
            };
            const outcome = resolveSpecifier('@/components/x', 'myproj/app/page.tsx', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'myproj/components/x.tsx' });
        });

        it('excludes bare specifiers as external dependencies (Rule 5)', () => {
            expect(resolveSpecifier('react', 'src/main.ts', baseCtx)).toEqual({ type: 'external' });
            expect(resolveSpecifier('lodash/cloneDeep', 'src/main.ts', baseCtx)).toEqual({ type: 'external' });
            expect(resolveSpecifier('@clerk/nextjs', 'src/main.ts', baseCtx)).toEqual({ type: 'external' });
        });

        it('returns not_found when relative import does not exist', () => {
            const outcome = resolveSpecifier('./nonexistent', 'src/main.ts', baseCtx);
            expect(outcome).toEqual({ type: 'not_found' });
        });

        it('resolves ./util.ts to util.ts when it exists (explicit extension)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/util.ts']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./util.ts', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('resolves absolute /components/x relative to project root', () => {
            const ctx = {
                allFiles: new Set(['app/page.tsx', 'components/x.tsx']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('/components/x', 'app/page.tsx', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'components/x.tsx' });
        });

        it('resolves absolute /components/x through wrapper prefix', () => {
            const ctx = {
                allFiles: new Set(['myproj/app/page.tsx', 'myproj/components/x.tsx']),
                wrapperPrefix: 'myproj',
                config: null,
            };
            const outcome = resolveSpecifier('/components/x', 'myproj/app/page.tsx', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'myproj/components/x.tsx' });
        });
    });

    describe('4. Precedence rules and narrowed ambiguity (Amendment 5)', () => {
        it('exports the named precedence constant with correct sequence', () => {
            expect(RESOLUTION_PRECEDENCE_EXTENSIONS).toEqual([
                '.ts',
                '.tsx',
                '.d.ts',
                '.js',
                '.jsx',
                '.mjs',
                '.cjs',
            ]);
        });

        it('./util resolves to util.ts when util.ts and util.js both exist (.ts > .js)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/util.ts', 'src/util.js']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./util', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('./util resolves to util.ts when util.ts and util.tsx both exist (.ts > .tsx)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/util.ts', 'src/util.tsx']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./util', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('./button resolves to button.ts when button.ts and button/index.ts both exist (file before directory)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/button.ts', 'src/button/index.ts']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./button', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/button.ts' });
        });

        it('./util.js resolves to util.ts when util.ts and util.js both exist (ESM .js maps to source)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/util.ts', 'src/util.js']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./util.js', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/util.ts' });
        });

        it('paths ["./src/*", "./legacy/*"] resolves to src when the file exists in both (ordered fallback)', () => {
            const ctx = {
                allFiles: new Set([
                    'main.ts',
                    'src/Button.tsx',
                    'legacy/Button.tsx',
                ]),
                wrapperPrefix: '',
                config: {
                    configPath: 'tsconfig.json',
                    configDir: '',
                    baseUrl: '.',
                    paths: {
                        '@components/*': ['./src/*', './legacy/*'],
                    },
                },
            };
            const outcome = resolveSpecifier('@components/Button', 'main.ts', ctx);
            expect(outcome).toEqual({ type: 'resolved', target: 'src/Button.tsx' });
        });

        it('./utils with utils.ts and Utils.ts still reported ambiguous with both candidates (case-only collision)', () => {
            const ctx = {
                allFiles: new Set(['main.ts', 'utils.ts', 'Utils.ts']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./utils', 'main.ts', ctx);
            expect(outcome).toEqual({
                type: 'ambiguous',
                candidates: ['Utils.ts', 'utils.ts'],
            });
        });

        it('./util.tsx when util.tsx absent but util.ts present => not_found (no cross-extension fallback)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/util.ts']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./util.tsx', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'not_found' });
        });

        it('./util.js with util.jsx present but no .ts/.tsx/.d.ts/.js => not_found (no .jsx fallback from .js)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/util.jsx']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./util.js', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'not_found' });
        });

        it('./button.tsx with button/index.tsx present but button.tsx absent => not_found (no index fallback for explicit extension)', () => {
            const ctx = {
                allFiles: new Set(['src/main.ts', 'src/button/index.tsx']),
                wrapperPrefix: '',
                config: null,
            };
            const outcome = resolveSpecifier('./button.tsx', 'src/main.ts', ctx);
            expect(outcome).toEqual({ type: 'not_found' });
        });
    });

    describe('5. Batch resolveImports integration', () => {
        it('records ambiguous imports with reason and candidates in unresolved for case-only collision', () => {
            const files = [
                {
                    filePath: 'index.ts',
                    imports: [{ specifier: './utils', kind: 'import' as const }],
                },
            ];
            const allFilePaths = ['index.ts', 'utils.ts', 'Utils.ts'];
            const res = resolveImports(files, allFilePaths);

            expect(res.edges).toHaveLength(0);
            expect(res.unresolved).toHaveLength(1);
            expect(res.unresolved[0]).toEqual({
                from: 'index.ts',
                specifier: './utils',
                reason: 'ambiguous',
                candidates: ['Utils.ts', 'utils.ts'],
            });
        });

        it('excludes external packages from both edges and unresolved', () => {
            const files = [
                {
                    filePath: 'main.ts',
                    imports: [
                        { specifier: 'react', kind: 'import' as const },
                        { specifier: './local', kind: 'import' as const },
                    ],
                },
            ];
            const allFilePaths = ['main.ts', 'local.ts'];
            const res = resolveImports(files, allFilePaths);

            expect(res.edges).toEqual([{ from: 'main.ts', to: 'local.ts', kind: 'import' }]);
            expect(res.unresolved).toHaveLength(0);
        });
    });
});
