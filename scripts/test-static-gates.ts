import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCode } from '../lib/analyzer/parser';
import { computeMetrics } from '../lib/analyzer/metrics';
import { aggregateResults } from '../lib/analyzer/aggregate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runTests() {
    console.log('🧪 Running Static Analysis Gates Verification...\n');

    // 1. Test Security Smells
    const securityFlawPath = path.resolve(__dirname, '../test-fixtures/security-flaw.js');
    const securityCode = fs.readFileSync(securityFlawPath, 'utf8');
    const parsedSecurity = parseCode(securityCode, 'js');
    const metricsSecurity = computeMetrics(parsedSecurity.ast, securityCode, 'security-flaw.js');

    console.log('--- security-flaw.js results ---');
    console.log(`Analyzed: ${metricsSecurity.summary.totalLines} lines.`);
    console.log('Flagged Issues:');
    metricsSecurity.issues.forEach(issue => {
        console.log(`- [${issue.category.toUpperCase()}] ${issue.type} on line ${issue.line}: ${issue.message}`);
    });

    const hasEval = metricsSecurity.issues.some(i => i.type === 'security_eval');
    const hasSecrets = metricsSecurity.issues.some(i => i.type === 'security_secrets');
    const hasSql = metricsSecurity.issues.some(i => i.type === 'security_sql');

    if (hasEval && hasSecrets && hasSql) {
        console.log('✅ PASS: All AST and regex security smells correctly identified.');
    } else {
        console.error('❌ FAIL: Some security smells were missed!');
    }
    console.log();

    // 2. Test Next.js Client Driver Import
    const nextClientPath = path.resolve(__dirname, '../test-fixtures/next-client.tsx');
    const nextCode = fs.readFileSync(nextClientPath, 'utf8');
    const parsedNext = parseCode(nextCode, 'ts');
    const metricsNext = computeMetrics(parsedNext.ast, nextCode, 'next-client.tsx');

    console.log('--- next-client.tsx results ---');
    console.log('Flagged Issues:');
    metricsNext.issues.forEach(issue => {
        console.log(`- [${issue.category.toUpperCase()}] ${issue.type} on line ${issue.line}: ${issue.message}`);
    });

    const hasFwMisplaced = metricsNext.issues.some(i => i.type === 'framework_misplaced_client');

    if (hasFwMisplaced) {
        console.log('✅ PASS: Next.js Client component DB driver import correctly identified.');
    } else {
        console.error('❌ FAIL: Next.js Client driver import violation was missed!');
    }
    console.log();

    // 3. Test Architecture Pattern Recognition Heuristics
    const mockFiles = [
        { filename: 'UserController.ts', filePath: 'src/controllers/UserController.ts', metrics: metricsSecurity.summary, score: 90, grade: 'Excellent' as const, mode: 'deep' as const, issueCount: 0, topIssue: null },
        { filename: 'UserModel.ts', filePath: 'src/models/UserModel.ts', metrics: metricsSecurity.summary, score: 95, grade: 'Excellent' as const, mode: 'deep' as const, issueCount: 0, topIssue: null },
        { filename: 'UserView.tsx', filePath: 'src/views/UserView.tsx', metrics: metricsSecurity.summary, score: 85, grade: 'Good' as const, mode: 'deep' as const, issueCount: 0, topIssue: null },
        { filename: 'UserRepository.ts', filePath: 'src/repositories/UserRepository.ts', metrics: metricsSecurity.summary, score: 80, grade: 'Good' as const, mode: 'deep' as const, issueCount: 0, topIssue: null },
    ];
    
    const aggregated = aggregateResults(
        mockFiles,
        'Mocks testing',
        [],
        ['@prisma/client', 'next']
    );

    console.log('--- Heuristic Architecture Recognition results ---');
    console.log('Detected Patterns:');
    (aggregated.architectureInsights?.patterns || []).forEach(pattern => {
        console.log(`- ${pattern.name} (Confidence: ${pattern.confidence}%)`);
        pattern.evidence.forEach(ev => console.log(`  * ${ev}`));
    });

    const patterns = aggregated.architectureInsights?.patterns || [];
    const hasMvc = patterns.some(p => p.name.includes('MVC'));
    const hasRepo = patterns.some(p => p.name.includes('Repository'));

    if (hasMvc && hasRepo) {
        console.log('✅ PASS: Heuristic MVC and Repository pattern detection correctly matching paths & dependencies.');
    } else {
        console.error('❌ FAIL: Architecture patterns were missed!');
    }

    if (hasEval && hasSecrets && hasSql && hasFwMisplaced && hasMvc && hasRepo) {
        console.log('\n🎉 ALL STATIC ANALYSIS AND ARCHITECTURE TESTS PASSED SUCCESSFULLY! 🎉');
        process.exit(0);
    } else {
        console.error('\n🚨 SOME TEST PHASES FAILED. PLEASE DEBUG THE ENGINES.');
        process.exit(1);
    }
}

runTests();
