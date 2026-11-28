import type { Issue } from '../types';
import type { LanguageModule } from './index';

function detectBareExcept(code: string): Issue[] {
    const issues: Issue[] = [];
    const bareExceptPattern = /^\s*except\s*:\s*$/;

    code.split('\n').forEach((line, idx) => {
        if (bareExceptPattern.test(line)) {
            issues.push({
                type: 'bare_except',
                category: 'language',
                severity: 'high',
                priority: 'quick-win',  // ✅ FIXED
                message: 'Bare except clause catches all exceptions. Specify exception type.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectMutableDefaultArg(code: string): Issue[] {
    const issues: Issue[] = [];
    const mutableDefaultPattern = /def\s+\w+\s*\((.*?)\):/;

    code.split('\n').forEach((line, idx) => {
        const match = mutableDefaultPattern.exec(line);
        if (match) {
            const params = match[1];
            if (/=\s*[\[\{\(]/.test(params)) {
                issues.push({
                    type: 'mutable_default_arg',
                    category: 'language',
                    severity: 'high',
                    priority: 'quick-win',  // ✅ FIXED
                    message: 'Mutable default argument creates shared state. Use None as default.',
                    line: idx + 1,
                });
            }
        }
    });

    return issues;
}

function detectNoneComparison(code: string): Issue[] {
    const issues: Issue[] = [];
    const noneComparisonPattern = /([!=]=)\s*None/;

    code.split('\n').forEach((line, idx) => {
        if (noneComparisonPattern.test(line)) {
            issues.push({
                type: 'none_comparison',
                category: 'language',
                severity: 'medium',
                priority: 'quick-win',
                message: 'Use "is None" or "is not None" instead of == None.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectLongFunction(code: string): Issue[] {
    const issues: Issue[] = [];
    const lines = code.split('\n');
    let funcStartLine = -1;
    let funcName = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*def\s+\w+\s*\(/.test(line)) {
            if (funcStartLine !== -1) {
                const funcLength = i - funcStartLine - 1;
                if (funcLength > 60) {
                    issues.push({
                        type: 'long_function',
                        category: 'language',
                        severity: 'low',
                        priority: 'quick-win',  // ✅ FIXED
                        message: `Function "${funcName}" is ${funcLength} lines. Break into smaller functions.`,
                        line: funcStartLine + 1,
                    });
                }
            }
            const match = line.match(/def\s+(\w+)\s*\(/);
            funcName = match ? match[1] : 'unknown';
            funcStartLine = i;
        }
    }

    if (funcStartLine !== -1) {
        const funcLength = lines.length - funcStartLine - 1;
        if (funcLength > 60) {
            issues.push({
                type: 'long_function',
                category: 'language',
                severity: 'low',
                priority: 'quick-win',  // ✅ FIXED
                message: `Function "${funcName}" is ${funcLength} lines. Break into smaller functions.`,
                line: funcStartLine + 1,
            });
        }
    }

    return issues;
}

function detectPatterns(code: string): Issue[] {
    const issues: Issue[] = [];
    issues.push(...detectBareExcept(code));
    issues.push(...detectMutableDefaultArg(code));
    issues.push(...detectNoneComparison(code));
    issues.push(...detectLongFunction(code));

    // Deduplicate issues
    const seen = new Set<string>();
    return issues.filter((issue) => {
        const key = `${issue.line}-${issue.type}`;
        if (seen.has(key)) return false;  // ✅ FIXED (was missing return false)
        seen.add(key);
        return true;
    });
}

function getPromptHints(issues: Issue[]): string[] {
    const hints: string[] = [];
    const typeSet = new Set(issues.map((i) => i.type));

    if (typeSet.has('bare_except')) hints.push('Catch specific exception types');
    if (typeSet.has('mutable_default_arg')) hints.push('Use None as default for mutable objects');
    if (typeSet.has('none_comparison')) hints.push('Use is None for singleton comparison');
    if (typeSet.has('long_function')) hints.push('Break long functions into smaller ones');

    return hints.slice(0, 3);  // ✅ FIXED: max 3 hints
}

export const pythonModule: LanguageModule = {
    id: 'py',
    displayName: 'Python',
    extensions: ['.py'],
    detectPatterns,
    getPromptHints,
};