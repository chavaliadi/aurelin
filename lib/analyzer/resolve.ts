import path from 'path';
import type { GraphEdge, RawImport, UnresolvedImport } from './graph.types';

export interface ParsedConfig {
    configPath: string;
    configDir: string;
    baseUrl?: string;
    paths?: Record<string, string[]>;
    extends?: string;
}

export interface ResolverContext {
    allFiles: Set<string>;
    wrapperPrefix: string;
    config?: ParsedConfig | null;
}

export type ResolveOutcome =
    | { type: 'resolved'; target: string }
    | { type: 'ambiguous'; candidates: string[] }
    | { type: 'not_found' }
    | { type: 'external' };

export interface ResolveResult {
    edges: GraphEdge[];
    unresolved: UnresolvedImport[];
    wrapperPrefix: string;
    primaryConfigPath: string | null;
    ignoredConfigs: string[];
}

/**
 * TypeScript module resolution precedence search order.
 * First existing candidate in this exact sequence wins.
 *
 * Precedence rationale (TypeScript compiler spec):
 * 1. Extension order: .ts > .tsx > .d.ts > .js > .jsx > .mjs > .cjs.
 * 2. File before directory: a file module strictly precedes a directory index.
 * 3. In TS ESM (Node16/NodeNext), an import ending in '.js' maps to '.ts'/'.tsx'
 *    before '.js', because '.js' represents the emitted compilation output.
 */
export const RESOLUTION_PRECEDENCE_EXTENSIONS = [
    '.ts',
    '.tsx',
    '.d.ts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
] as const;

/**
 * Strips comments (// and /* ... *\/) and trailing commas from JSON/JSONC text,
 * preserving strings and newlines.
 */
export function stripJsonComments(json: string): string {
    let insideString = false;
    let escape = false;
    let result = '';

    for (let i = 0; i < json.length; i++) {
        const char = json[i];
        if (insideString) {
            result += char;
            if (escape) {
                escape = false;
            } else if (char === '\\') {
                escape = true;
            } else if (char === '"') {
                insideString = false;
            }
        } else {
            if (char === '"') {
                insideString = true;
                result += char;
            } else if (char === '/' && json[i + 1] === '/') {
                while (i < json.length && json[i] !== '\n') {
                    i++;
                }
                if (i < json.length) result += json[i];
            } else if (char === '/' && json[i + 1] === '*') {
                i += 2;
                while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) {
                    if (json[i] === '\n') result += '\n';
                    i++;
                }
                i++; // skip /
            } else {
                result += char;
            }
        }
    }

    return result.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Detects if all files in the project sit under a single top-level directory.
 * If every file in filePaths sits under a single top-level directory (e.g. 'myproj/app/page.tsx', 'myproj/components/x.tsx'),
 * that directory is returned (e.g. 'myproj').
 * If there are multiple top-level directories (e.g. 'app/page.tsx', 'components/x.tsx') or any file at the root,
 * or if filePaths is empty, returns ''.
 *
 * NOTE: A project that legitimately has one top-level folder containing everything is
 * indistinguishable from a wrapper. Treat it as a wrapper.
 */
export function detectWrapperPrefix(filePaths: string[]): string {
    if (!filePaths || filePaths.length === 0) return '';

    const first = filePaths[0].replace(/\\/g, '/').replace(/^\.\//, '');
    const firstSlash = first.indexOf('/');
    if (firstSlash === -1) {
        return '';
    }
    const topDir = first.slice(0, firstSlash);
    if (!topDir) return '';

    const prefix = topDir + '/';
    for (const f of filePaths) {
        const norm = f.replace(/\\/g, '/').replace(/^\.\//, '');
        if (!norm.startsWith(prefix)) {
            return '';
        }
    }

    return topDir;
}

/**
 * Parses tsconfig.json or jsconfig.json content safely, tolerating comments and trailing commas.
 */
export function parseConfig(content: string, configPath: string): ParsedConfig | null {
    try {
        const cleaned = stripJsonComments(content);
        const parsed = JSON.parse(cleaned);
        const compilerOptions = parsed.compilerOptions || {};
        const normPath = configPath.replace(/\\/g, '/').replace(/^\.\//, '');
        const configDir = path.posix.dirname(normPath) === '.' ? '' : path.posix.dirname(normPath);

        return {
            configPath: normPath,
            configDir,
            baseUrl: compilerOptions.baseUrl,
            paths: compilerOptions.paths,
            extends: parsed.extends,
        };
    } catch {
        return null;
    }
}

/**
 * Selects the primary tsconfig/jsconfig according to Rule 3:
 * Use the one nearest the upload root after wrapper stripping.
 * Ignore any others and note them in ignoredConfigs.
 */
export function choosePrimaryConfig(
    configs: Record<string, string>,
    wrapperPrefix: string
): { config: ParsedConfig; ignoredConfigs: string[] } | null {
    const candidatePaths = Object.keys(configs).filter(p => {
        const lower = p.toLowerCase();
        return lower.endsWith('tsconfig.json') || lower.endsWith('jsconfig.json');
    });

    if (candidatePaths.length === 0) return null;

    // Sort by depth after stripping wrapper prefix, with tsconfig preferred over jsconfig at same depth
    const prefix = wrapperPrefix ? wrapperPrefix + '/' : '';
    const scored = candidatePaths.map(p => {
        const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
        const stripped = norm.startsWith(prefix) ? norm.slice(prefix.length) : norm;
        const depth = stripped.split('/').length;
        const isTs = norm.toLowerCase().endsWith('tsconfig.json');
        return { originalPath: p, norm, depth, isTs };
    });

    scored.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        if (a.isTs !== b.isTs) return a.isTs ? -1 : 1;
        return a.norm.localeCompare(b.norm);
    });

    // Try candidates in nearest-to-root order. If the nearest config is malformed
    // (e.g. invalid JSON), skip it and try the next. Return null only if none parse.
    for (let i = 0; i < scored.length; i++) {
        const parsed = parseConfig(configs[scored[i].originalPath], scored[i].originalPath);
        if (parsed) {
            const ignoredConfigs = scored
                .filter((_, idx) => idx !== i)
                .map(s => s.originalPath);
            return { config: parsed, ignoredConfigs };
        }
    }

    return null;
}

/**
 * Generates all candidate paths for a given target path in TypeScript precedence order.
 *
 * Rules:
 * 1. Extension order: .ts > .tsx > .d.ts > .js > .jsx > .mjs > .cjs.
 * 2. File before directory: file candidates strictly precede directory index candidates.
 * 3. ESM .js suffix: imports ending in '.js' map to '.ts' and '.tsx' before literal '.js'.
 */
function getFileCandidates(targetPath: string): string[] {
    const candidates: string[] = [];
    const clean = targetPath.replace(/\\/g, '/').replace(/^\.\//, '');

    // ESM .js suffix: ./util.js → try .ts, .tsx, .d.ts, then literal .js.
    // TypeScript's ESM remapping is strictly .js → .ts/.tsx/.d.ts. No .jsx/.mjs/.cjs
    // fallback, and no directory index fallback for explicit-extension specifiers.
    if (clean.endsWith('.js')) {
        const base = clean.slice(0, -3);
        candidates.push(base + '.ts');
        candidates.push(base + '.tsx');
        candidates.push(base + '.d.ts');
        candidates.push(clean);
        return candidates;
    }

    // Explicit extension (.ts, .tsx, .d.ts, .jsx, .mjs, .cjs): literal path only.
    // No cross-extension fallback — a specifier with an explicit extension that does
    // not exist is not_found, never silently resolved to a different file.
    // No directory index fallback for explicit-extension specifiers.
    const extMatch = RESOLUTION_PRECEDENCE_EXTENSIONS.find(ext => clean.endsWith(ext));
    if (extMatch) {
        candidates.push(clean);
        return candidates;
    }

    // No extension:
    // 1. Exact path
    candidates.push(clean);

    // 2. File with extensions in precedence order (.ts, .tsx, .d.ts, .js, .jsx, .mjs, .cjs)
    for (const ext of RESOLUTION_PRECEDENCE_EXTENSIONS) {
        candidates.push(clean + ext);
    }

    // 3. Directory index files in precedence order (strictly AFTER all file candidates)
    for (const ext of RESOLUTION_PRECEDENCE_EXTENSIONS) {
        candidates.push(path.posix.join(clean, 'index' + ext));
    }

    return candidates;
}

/**
 * Matches candidates against allFilesSet adhering to precedence-ordered selection.
 * First existing candidate wins.
 *
 * True ambiguity is reserved strictly for case-only collisions
 * (e.g. './utils' where both 'utils.ts' and 'Utils.ts' exist in allFiles).
 */
function matchCandidates(candidates: string[], allFiles: Set<string>): ResolveOutcome {
    const seen = new Set<string>();

    for (const c of candidates) {
        const clean = c.replace(/\\/g, '/').replace(/^\.\//, '');
        if (seen.has(clean)) continue;
        seen.add(clean);

        const cleanLower = clean.toLowerCase();
        const caseMatches: string[] = [];

        for (const file of allFiles) {
            if (file.toLowerCase() === cleanLower) {
                caseMatches.push(file);
            }
        }

        // True case-only collision across multiple files differing only in casing
        if (caseMatches.length > 1) {
            return { type: 'ambiguous', candidates: caseMatches.sort() };
        }

        // First candidate in precedence order with an existing match wins!
        if (caseMatches.length === 1) {
            return { type: 'resolved', target: caseMatches[0] };
        }
    }

    return { type: 'not_found' };
}

/**
 * Resolves a single import specifier from a source file.
 */
export function resolveSpecifier(
    specifier: string,
    fromFile: string,
    ctx: ResolverContext
): ResolveOutcome {
    if (!specifier || typeof specifier !== 'string') {
        return { type: 'not_found' };
    }

    const normFromFile = fromFile.replace(/\\/g, '/').replace(/^\.\//, '');
    const currentDir = path.posix.dirname(normFromFile) === '.' ? '' : path.posix.dirname(normFromFile);

    // 1. Relative imports (./ or ../)
    if (specifier.startsWith('.')) {
        const joined = currentDir ? path.posix.join(currentDir, specifier) : specifier.replace(/^\.\//, '');
        const target = path.posix.normalize(joined);
        const candidates = getFileCandidates(target);
        return matchCandidates(candidates, ctx.allFiles);
    }

    // 2. tsconfig / jsconfig paths mapping
    // NOTE: A tsconfig paths pattern can shadow a real npm package (e.g. "@scope/*"
    // mapped to "./packages/*" with packages/nextjs.ts present will resolve
    // @scope/nextjs to packages/nextjs.ts instead of the npm package).
    // TypeScript itself behaves the same way — paths take priority over node_modules.
    // This is intentional; do not add workarounds or heuristics.
    if (ctx.config?.paths) {
        for (const [pattern, targetPatterns] of Object.entries(ctx.config.paths)) {
            const starIndex = pattern.indexOf('*');
            let isMatch = false;
            let wildcard = '';

            if (starIndex === -1) {
                isMatch = (specifier === pattern);
            } else {
                const prefix = pattern.slice(0, starIndex);
                const suffix = pattern.slice(starIndex + 1);
                if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length) {
                    isMatch = true;
                    wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
                }
            }

            if (isMatch) {
                // Try targets left to right: take the first that resolves. Never aggregate across targets.
                for (const targetPattern of targetPatterns) {
                    const replaced = starIndex === -1 ? targetPattern : targetPattern.replace('*', wildcard);
                    const baseDir = ctx.config.baseUrl
                        ? path.posix.join(ctx.config.configDir, ctx.config.baseUrl)
                        : ctx.config.configDir;
                    const combined = path.posix.normalize(path.posix.join(baseDir, replaced));
                    const candidates = getFileCandidates(combined);
                    const outcome = matchCandidates(candidates, ctx.allFiles);
                    if (outcome.type !== 'not_found') {
                        return outcome;
                    }
                }
            }
        }
    }

    // 3. baseUrl resolution without alias
    // NOTE: With baseUrl set, every bare specifier is tried as a local file before
    // being classified as external. A local react.ts therefore shadows the npm
    // package 'react'. TypeScript itself behaves the same way; this is intentional.
    if (ctx.config?.baseUrl) {
        const baseDir = path.posix.join(ctx.config.configDir, ctx.config.baseUrl);
        const combined = path.posix.normalize(path.posix.join(baseDir, specifier));
        const outcome = matchCandidates(getFileCandidates(combined), ctx.allFiles);
        if (outcome.type !== 'not_found') {
            return outcome;
        }
    }

    // 4. Fallback root alias (@/...) when no config or not handled by config paths
    if (specifier.startsWith('@/')) {
        const rel = specifier.slice(2);
        const rootDir = ctx.wrapperPrefix || (ctx.config ? ctx.config.configDir : '');
        const target = rootDir ? path.posix.join(rootDir, rel) : rel;
        const candidates = getFileCandidates(path.posix.normalize(target));
        const outcome = matchCandidates(candidates, ctx.allFiles);
        if (outcome.type !== 'not_found') {
            return outcome;
        }
    }

    // 5. Absolute imports from project root (/...)
    if (specifier.startsWith('/')) {
        const rel = specifier.slice(1);
        const rootDir = ctx.wrapperPrefix || (ctx.config ? ctx.config.configDir : '');
        const target = rootDir ? path.posix.join(rootDir, rel) : rel;
        const candidates = getFileCandidates(path.posix.normalize(target));
        const outcome = matchCandidates(candidates, ctx.allFiles);
        if (outcome.type !== 'not_found') {
            return outcome;
        }
    }

    // 6. Bare specifier matching no alias/relative path -> External dependency
    // (e.g. 'react', 'lodash', '@clerk/nextjs')
    const isBare = !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('@/');
    if (isBare) {
        return { type: 'external' };
    }

    return { type: 'not_found' };
}

/**
 * Resolves all imports across all files in the project.
 */
export function resolveImports(
    files: { filePath: string; imports?: RawImport[] }[],
    allFilePaths: string[],
    configs?: Record<string, string>
): ResolveResult {
    const allFilesSet = new Set(allFilePaths.map(f => f.replace(/\\/g, '/').replace(/^\.\//, '')));
    const wrapperPrefix = detectWrapperPrefix(allFilePaths);

    const configSelection = configs ? choosePrimaryConfig(configs, wrapperPrefix) : null;
    const primaryConfig = configSelection?.config ?? null;
    const ignoredConfigs = configSelection?.ignoredConfigs ?? [];

    const ctx: ResolverContext = {
        allFiles: allFilesSet,
        wrapperPrefix,
        config: primaryConfig,
    };

    const edges: GraphEdge[] = [];
    const unresolved: UnresolvedImport[] = [];
    const seenEdges = new Set<string>();

    for (const file of files) {
        const fromFile = file.filePath.replace(/\\/g, '/').replace(/^\.\//, '');
        const rawImports = file.imports || [];

        for (const rawImp of rawImports) {
            if (rawImp.isNonLiteral) {
                unresolved.push({
                    from: fromFile,
                    specifier: rawImp.specifier,
                    reason: 'non_literal',
                });
                continue;
            }

            const outcome = resolveSpecifier(rawImp.specifier, fromFile, ctx);

            if (outcome.type === 'resolved') {
                const edgeKey = `${fromFile}->${outcome.target}:${rawImp.kind}`;
                if (!seenEdges.has(edgeKey)) {
                    seenEdges.add(edgeKey);
                    edges.push({
                        from: fromFile,
                        to: outcome.target,
                        kind: rawImp.kind,
                    });
                }
            } else if (outcome.type === 'ambiguous') {
                unresolved.push({
                    from: fromFile,
                    specifier: rawImp.specifier,
                    reason: 'ambiguous',
                    candidates: outcome.candidates,
                });
            } else if (outcome.type === 'not_found') {
                unresolved.push({
                    from: fromFile,
                    specifier: rawImp.specifier,
                    reason: 'not_found',
                });
            }
            // outcome.type === 'external' is deliberately excluded from both edges and unresolved
        }
    }

    return {
        edges,
        unresolved,
        wrapperPrefix,
        primaryConfigPath: primaryConfig?.configPath ?? null,
        ignoredConfigs,
    };
}
