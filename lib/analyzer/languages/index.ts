import type { Issue } from '../types';

/**
 * LanguageModule interface for Phase 5+ language-aware pattern detection
 * Each language module detects language-specific patterns deterministically
 * All patterns are regex/heuristic-based — no compiler toolchains required
 */
export interface LanguageModule {
    id: string;                                      // "python", "go", "java", "cpp"
    displayName: string;                             // "Python", "Go", "Java", "C++"
    extensions: string[];                            // [".py"], [".go"], etc.
    detectPatterns(code: string): Issue[];           // Returns language-specific issues
    getPromptHints(issues: Issue[]): string[];       // Returns AI prompt guidance
}

/**
 * Registry of all language modules
 * Lazy-loaded to avoid circular dependencies
 */
const languageModules: Map<string, LanguageModule> = new Map();

/**
 * Load a language module by ID
 * Modules are imported on-demand to keep bundle size light
 */
export async function getLanguageModule(languageId: string): Promise<LanguageModule | null> {
    if (languageModules.has(languageId)) {
        return languageModules.get(languageId)!;
    }

    try {
        let langModule: LanguageModule;

        switch (languageId) {
            case 'py':
                // Dynamically import Python module
                langModule = (await import('./python')).pythonModule;
                break;
            case 'go':
                langModule = (await import('./go')).goModule;
                break;
            case 'java':
                langModule = (await import('./java')).javaModule;
                break;
            case 'cpp':
                langModule = (await import('./cpp')).cppModule;
                break;
            default:
                return null;
        }

        languageModules.set(languageId, langModule);
        return langModule;
    } catch {
        return null;
    }
}

/**
 * Detect patterns for a given language
 * Returns empty array if language module not found
 */
export async function detectLanguagePatterns(code: string, languageId: string): Promise<Issue[]> {
    const langModule = await getLanguageModule(languageId);
    if (!langModule) return [];
    return langModule.detectPatterns(code);
}

/**
 * Get AI prompt hints for detected patterns
 * Returns empty array if language module not found
 */
export async function getLanguagePromptHints(issues: Issue[], languageId: string): Promise<string[]> {
    const langModule = await getLanguageModule(languageId);
    if (!langModule) return [];
    return langModule.getPromptHints(issues);
}
