import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { saveScanToConvex } from '@/lib/db/saveScan';
import type { FileResult } from '@/lib/analyzer/types';

export async function POST(req: NextRequest) {
    try {
        const { userId, getToken } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized: authentication required to save scans.' }, { status: 401 });
        }

        const token = await getToken({ template: 'convex' });
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized: missing Convex authentication token.' }, { status: 401 });
        }

        const body = await req.json();
        const {
            projectName,
            projectScore,
            grade,
            categoryScores,
            totalFiles,
            totalLines,
            totalFunctions,
            topImprovements,
            aiExplanation,
            visibility,
            fileResults,
            languageMode,
            architectureInsights,
            rootCauseClusters,
            topFixes,
            detectedPatterns,
            allIssues,
        } = body;

        if (!projectScore || !categoryScores) {
            return NextResponse.json({ error: 'Missing scan data.' }, { status: 400 });
        }

        const scanId = await saveScanToConvex({
            token,
            projectName: projectName ?? 'Untitled Project',
            languageMode: languageMode ?? 'mixed',
            projectScore,
            grade,
            categoryScores,
            totalFiles: totalFiles ?? 0,
            totalLines: totalLines ?? 0,
            totalFunctions: totalFunctions ?? 0,
            topImprovements: typeof topImprovements === 'string'
                ? topImprovements
                : JSON.stringify(topImprovements ?? []),
            aiExplanation: aiExplanation ?? '',
            visibility: visibility ?? 'summary',
            fileResults: fileResults as FileResult[] | undefined,
            architectureInsights: typeof architectureInsights === 'string'
                ? architectureInsights
                : (architectureInsights ? JSON.stringify(architectureInsights) : undefined),
            rootCauseClusters: typeof rootCauseClusters === 'string'
                ? rootCauseClusters
                : (rootCauseClusters ? JSON.stringify(rootCauseClusters) : undefined),
            topFixes: typeof topFixes === 'string'
                ? topFixes
                : (topFixes ? JSON.stringify(topFixes) : undefined),
            detectedPatterns: typeof detectedPatterns === 'string'
                ? detectedPatterns
                : (detectedPatterns ? JSON.stringify(detectedPatterns) : undefined),
            allIssues: typeof allIssues === 'string'
                ? allIssues
                : (allIssues ? JSON.stringify(allIssues) : undefined),
        });

        return NextResponse.json({ scanId });
    } catch (err) {
        console.error('[/api/save-scan] Error:', err);
        return NextResponse.json({ error: 'Failed to save scan.' }, { status: 500 });
    }
}
