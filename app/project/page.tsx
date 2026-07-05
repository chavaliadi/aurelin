'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { ArrowLeft, RefreshCw, TrendingUp, ChevronUp, ChevronDown, Minus, Share2, X, Check, BarChart2, ShieldAlert, Code } from 'lucide-react';
import type { ProjectResult, FileResult } from '@/lib/analyzer/types';
import ScoreGauge from '@/components/analyzer/ScoreGauge';
import AIInsight from '@/components/analyzer/AIInsight';
import ThemeToggle from '@/components/ThemeToggle';
import Mermaid from '@/components/analyzer/Mermaid';

export default function ProjectPage() {
    const [project, setProject] = useState<ProjectResult | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareVisibility, setShareVisibility] = useState<'summary' | 'full'>('full');
    const [saving, setSaving] = useState(false);
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const router = useRouter();
    const { user } = useUser();

    const historyScans = useQuery(
        api.scans.getLastTwoScansForProject,
        user ? { userId: user.id, projectName } : 'skip'
    );

    const previousScan = useMemo(() => {
        if (!project || !historyScans || historyScans.length === 0) return null;
        return historyScans.find(s => s.scanId !== project.scanId) ?? null;
    }, [historyScans, project]);

    function timeAgo(ts: number) {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    // Clear generated link when visibility changes — Summary and Full need different links
    useEffect(() => { setShareLink(null); }, [shareVisibility]);

    useEffect(() => {
        const raw = sessionStorage.getItem('cv_project');
        if (!raw) { router.replace('/'); return; }
        try { setProject(JSON.parse(raw) as ProjectResult); }
        catch { router.replace('/'); }
    }, [router]);

    // ── Auto-save for signed-in users ──────────────────────────────────────────
    useEffect(() => {
        if (!project || !user) return;
        const alreadySaved = sessionStorage.getItem('cv_saved');
        if (alreadySaved) return;

        const projectName = sessionStorage.getItem('cv_project_name') ?? 'My Project';
        const languageMode = sessionStorage.getItem('cv_language_mode') ?? 'mixed';

        fetch('/api/save-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                projectName,
                languageMode,
                projectScore: project.projectScore,
                grade: project.projectGrade,
                categoryScores: project.categoryScores,
                totalFiles: project.totalFiles,
                totalLines: project.totalLines,
                totalFunctions: project.totalFunctions,
                topImprovements: JSON.stringify(project.topImprovements),
                aiExplanation: project.aiExplanation ?? '',
                visibility: 'summary',
                architectureInsights: project.architectureInsights ? JSON.stringify(project.architectureInsights) : undefined,
                rootCauseClusters: project.rootCauseClusters ? JSON.stringify(project.rootCauseClusters) : undefined,
                topFixes: project.topFixes ? JSON.stringify(project.topFixes) : undefined,
                detectedPatterns: project.detectedPatterns ? JSON.stringify(project.detectedPatterns) : undefined,
                allIssues: project.allIssues ? JSON.stringify(project.allIssues) : undefined,
            }),
        })
            .then(async (res) => {
                if (res.ok) {
                    sessionStorage.setItem('cv_saved', 'true');
                } else {
                    const err = await res.json().catch(() => ({}));
                    console.warn('[auto-save] save-scan error:', res.status, err);
                }
            })
            .catch((e) => console.warn('[auto-save] network error:', e));
    }, [project, user]);

    if (!project) {
        return (
            <div className="analyze-loading">
                <div className="loading-ring" />
                <span>Loading project report…</span>
            </div>
        );
    }

    const fileResults = project.fileResults;
    const avg = (arr: number[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;

    const complexityPenalty = Math.round(avg(fileResults.map((f: FileResult) => {
        const sub = Math.max(0, Math.min(100, Math.round(100 - (f.metrics.avgCyclomaticComplexity - 1) * 8)));
        return Math.round((100 - sub) * 0.30);
    })));
    const lengthPenalty = Math.round(avg(fileResults.map((f: FileResult) => {
        const sub = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, f.metrics.avgFunctionLength - 20) * 1.2)));
        return Math.round((100 - sub) * 0.25);
    })));
    const nestingPenalty = Math.round(avg(fileResults.map((f: FileResult) => {
        const sub = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, f.metrics.maxNestingDepth - 2) * 15)));
        return Math.round((100 - sub) * 0.20);
    })));
    const duplicationPenalty = Math.round(avg(fileResults.map((f: FileResult) => {
        const sub = Math.max(0, Math.min(100, Math.round(100 - f.metrics.duplicationPercentage * 2)));
        return Math.round((100 - sub) * 0.15);
    })));
    const unusedPenalty = Math.round(avg(fileResults.map((f: FileResult) => {
        const sub = Math.max(0, Math.min(100, Math.round(100 - f.metrics.unusedImportCount * 10)));
        return Math.round((100 - sub) * 0.10);
    })));

    const whatIfs = [
        { name: 'Complexity', penalty: complexityPenalty, action: 'Simplify logic complexity' },
        { name: 'Nesting', penalty: nestingPenalty, action: 'Flatten nested logical paths' },
        { name: 'Duplication', penalty: duplicationPenalty, action: 'Consolidate duplicate logic' },
        { name: 'Unused Imports', penalty: unusedPenalty, action: 'Clean up unused imports' },
        { name: 'Function Length', penalty: lengthPenalty, action: 'Shorten longer functions' },
    ].filter(w => w.penalty > 0);

    function getGrade(s: number): string {
        if (s >= 90) return 'Excellent';
        if (s >= 70) return 'Good';
        if (s >= 50) return 'Fair';
        return 'Critical';
    }

    const catItems = [
        { label: 'Readability', value: project.categoryScores.readability, hint: 'Nesting depth + function length' },
        { label: 'Maintainability', value: project.categoryScores.maintainability, hint: 'Complexity + duplication' },
        { label: 'Cleanliness', value: project.categoryScores.cleanliness, hint: 'Unused imports + file hygiene' },
        { label: 'Structure', value: project.categoryScores.structure, hint: 'Function balance + file size' },
    ];

    function barColor(v: number) {
        if (v >= 80) return '#22c55e';
        if (v >= 60) return '#f59e0b';
        return '#f87171';
    }

    function scoreIcon(score: number) {
        if (score >= 80) return <ChevronUp size={14} color="#22c55e" />;
        if (score >= 60) return <Minus size={14} color="#f59e0b" />;
        return <ChevronDown size={14} color="#f87171" />;
    }

    const gradeColor: Record<string, string> = {
        Excellent: '#22c55e', Good: '#3b82f6', Fair: '#f59e0b', Critical: '#ef4444',
    };
    const correctnessFailedCount = project.correctnessSummary.filesFailedSyntax;
    const correctnessUnknownCount = project.correctnessSummary.filesUnchecked;
    const confidenceBand = project.correctnessSummary.confidenceBand;

    const confidencePillText =
        confidenceBand === 'high' ? 'High confidence' :
            confidenceBand === 'medium' ? 'Medium confidence' :
                confidenceBand === 'low' ? 'Low confidence' :
                    'Unknown confidence';

    async function handleShare() {
        const p = project;  // capture non-null snapshot for TS narrowing
        if (!p) return;
        setSaving(true);
        setShareLink(null);
        try {
            // Ask the server to save the scan and return a scanId
            const payload = {
                userId: user?.id ?? 'guest',
                projectName: sessionStorage.getItem('cv_project_name') ?? 'My Project',
                projectScore: p.projectScore,
                grade: p.projectGrade,
                categoryScores: p.categoryScores,
                totalFiles: p.totalFiles,
                totalLines: p.totalLines,
                totalFunctions: p.totalFunctions,
                topImprovements: JSON.stringify(p.topImprovements),
                aiExplanation: p.aiExplanation,
                visibility: shareVisibility,
                fileResults: shareVisibility === 'full' ? p.fileResults : undefined,
                languageMode: 'mixed',
                architectureInsights: p.architectureInsights ? JSON.stringify(p.architectureInsights) : undefined,
                rootCauseClusters: p.rootCauseClusters ? JSON.stringify(p.rootCauseClusters) : undefined,
                topFixes: p.topFixes ? JSON.stringify(p.topFixes) : undefined,
                detectedPatterns: p.detectedPatterns ? JSON.stringify(p.detectedPatterns) : undefined,
                allIssues: p.allIssues ? JSON.stringify(p.allIssues) : undefined,
            };

            const res = await fetch('/api/save-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.scanId) {
                const url = `${window.location.origin}/scan/${data.scanId}`;
                setShareLink(url);
            }
        } catch {
            console.error('Failed to save scan');
        } finally {
            setSaving(false);
        }
    }

    function copyLink() {
        if (!shareLink) return;
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <main className="analyze-main">
            {/* ── Navbar ── */}
            <nav className="cv-nav">
                <div className="cv-nav-logo" onClick={() => router.push('/')}>
                    <span className="cv-logo-dot" />
                    Aurelin
                </div>
                <div className="cv-nav-actions">
                    {user && (
                        <button className="nav-back-btn" onClick={() => router.push('/dashboard')}>
                            <BarChart2 size={14} /> Dashboard
                        </button>
                    )}
                    <button className="nav-back-btn" onClick={() => router.push('/')}>
                        <ArrowLeft size={14} /> New Analysis
                    </button>
                    <ThemeToggle />
                </div>
            </nav>

            {/* ── Header ── */}
            <div className="analyze-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 className="analyze-title">Project Report</h1>
                    <span className="mode-badge mode-quick">Mixed Deep + Quick Modes</span>
                </div>
                <div className="analyze-issue-summary">
                    <span className="pill pill-clean">{project.totalFiles} files</span>
                    <span className="pill pill-clean">{project.totalLines.toLocaleString()} lines</span>
                    {project.topImprovements.length > 0 && (
                        <span className="pill pill-medium">{project.topImprovements.length} areas to improve</span>
                    )}
                    <button className="share-trigger-btn" onClick={() => setShowShareModal(true)}>
                        <Share2 size={13} /> Share Report
                    </button>
                </div>
            </div>

            {(() => {
                const securitySmells = (project.allIssues || []).filter(i => i.issue.category === 'security');
                const frameworkSmells = (project.allIssues || []).filter(i => i.issue.category === 'framework');
                const deltaScore = previousScan ? project.projectScore - previousScan.projectScore : null;
                const deltaFiles = previousScan ? project.totalFiles - previousScan.totalFiles : null;
                const deltaLines = previousScan ? project.totalLines - previousScan.totalLines : null;

                return (
                    <>
                        <div className="correctness-row" style={{ display: 'grid', gridTemplateColumns: previousScan ? '1fr 1fr' : '1fr', gap: '20px' }}>
                            <div className={`glass-card correctness-card ${correctnessFailedCount > 0 ? 'correctness-fail' : (correctnessUnknownCount > 0 ? 'correctness-unknown' : 'correctness-pass')}`}>
                                <h2 className="card-title">Correctness Gate</h2>
                                <div className="correctness-status-line">
                                    <span className="correctness-pill">
                                        {correctnessFailedCount > 0 ? 'Fail' : (correctnessUnknownCount > 0 ? 'Partially checked' : 'Pass')}
                                    </span>
                                    <span className="correctness-subtext">
                                        ZIP file-level correctness status
                                    </span>
                                </div>
                                <p className="correctness-warning">
                                    {correctnessFailedCount > 0
                                        ? `${correctnessFailedCount} file${correctnessFailedCount > 1 ? 's' : ''} failed syntax checks.`
                                        : 'No syntax failures found in checked files.'}
                                </p>
                                <p className="correctness-subtext">
                                    Coverage: {project.correctnessSummary.filesChecked} checked, {project.correctnessSummary.filesUnchecked} unchecked.
                                </p>
                                <p className="correctness-subtext">
                                    Confidence: {confidencePillText}.
                                </p>
                            </div>

                            {previousScan && (
                                <div className="glass-card correctness-card" style={{ borderLeft: '4px solid', borderLeftColor: deltaScore && deltaScore >= 0 ? '#22c55e' : '#ef4444', paddingLeft: '20px' }}>
                                    <h2 className="card-title">📉 Scan Evolution Delta</h2>
                                    <div className="correctness-status-line">
                                        <span className="correctness-pill" style={{
                                            background: deltaScore && deltaScore >= 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                            color: deltaScore && deltaScore >= 0 ? '#22c55e' : '#ef4444',
                                            borderColor: deltaScore && deltaScore >= 0 ? '#22c55e40' : '#ef444440',
                                            border: '1px solid',
                                        }}>
                                            {deltaScore && deltaScore >= 0 ? `+${deltaScore}` : deltaScore} pts
                                        </span>
                                        <span className="correctness-subtext" style={{ fontSize: '11px' }}>
                                            vs scan {timeAgo(previousScan.createdAt)}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: '12px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Files changed:</span>
                                            <strong style={{ color: deltaFiles && deltaFiles >= 0 ? '#22c55e' : '#ef4444' }}>
                                                {deltaFiles && deltaFiles >= 0 ? `+${deltaFiles}` : deltaFiles}
                                            </strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Lines of code:</span>
                                            <strong style={{ color: deltaLines && deltaLines >= 0 ? '#22c55e' : '#ef4444' }}>
                                                {deltaLines && deltaLines >= 0 ? `+${deltaLines}` : deltaLines}
                                            </strong>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Security & Framework Smells Card ── */}
                        {((securitySmells && securitySmells.length > 0) || (frameworkSmells && frameworkSmells.length > 0)) && (
                            <div className="glass-card security-section" style={{ maxWidth: '1100px', margin: '20px auto 0', padding: '24px' }}>
                                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ShieldAlert size={18} color="#ef4444" /> Security & Framework Violations
                                </h2>
                                <p className="section-subtitle">Deterministic static rules flagged these critical code smells in the uploaded ZIP.</p>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '16px' }}>
                                    {securitySmells.map((item, idx) => (
                                        <div key={`sec-${idx}`} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderLeft: '4px solid #ef4444', borderRadius: '4px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <strong style={{ fontSize: '14px', color: '#ef4444' }}>Security Smell: {item.issue.type.replace('security_', '').toUpperCase()}</strong>
                                                    <span className="text-muted" style={{ fontSize: '12px' }}>Line {item.issue.line} in <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: '3px' }}>{item.filePath}</code></span>
                                                </div>
                                                <p style={{ margin: '6px 0 0', fontSize: '13px' }}>{item.issue.message}</p>
                                            </div>
                                        </div>
                                    ))}

                                    {frameworkSmells.map((item, idx) => (
                                        <div key={`fw-${idx}`} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid #3b82f6', borderRadius: '4px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <strong style={{ fontSize: '14px', color: '#3b82f6' }}>Framework Anti-pattern: {item.issue.type.replace('framework_', '').toUpperCase()}</strong>
                                                    <span className="text-muted" style={{ fontSize: '12px' }}>Line {item.issue.line} in <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: '3px' }}>{item.filePath}</code></span>
                                                </div>
                                                <p style={{ margin: '6px 0 0', fontSize: '13px' }}>{item.issue.message}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}

            {/* ── Ranked Top Fixes Landing Panel (Stage 2) ── */}
            {project.topFixes && project.topFixes.length > 0 && (
                <div className="glass-card top-fixes-section">
                    <h2 className="card-title">🎯 Prioritized Refactoring Plan</h2>
                    <p className="section-subtitle">Ranked issues and recommended steps generated dynamically by structural models.</p>
                    <div className="top-fixes-list">
                        {project.topFixes.map((fix: any) => (
                            <div key={fix.rank} className={`top-fix-item impact-${fix.impact.toLowerCase()}`}>
                                <div className="top-fix-rank">#{fix.rank}</div>
                                <div className="top-fix-body">
                                    <div className="top-fix-header">
                                        <h3 className="top-fix-title">{fix.title}</h3>
                                        <span className={`impact-badge ${fix.impact.toLowerCase()}`}>
                                            {fix.impact} Impact
                                        </span>
                                    </div>
                                    <p className="top-fix-desc">{fix.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Score + AI ── */}
            <div className="top-row">
                <div className="glass-card score-card">
                    <h2 className="card-title">Project Health</h2>
                    <ScoreGauge score={project.projectScore} grade={project.projectGrade} />
                    <p className="project-summary-text">{project.summary}</p>
                    <div className="score-meta">
                        <div className="score-meta-item">
                            <span className="meta-label">Files</span>
                            <span className="meta-value">{project.totalFiles}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Functions</span>
                            <span className="meta-value">{project.totalFunctions}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Lines</span>
                            <span className="meta-value">{project.totalLines.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Explainable Scoring */}
                    <div className="explainable-scoring-card">
                        <h3 className="breakdown-title">Average Deductions per File</h3>
                        <div className="score-breakdown-list">
                            {complexityPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Complexity Penalty</span>
                                    <span className="breakdown-value penalty">-{complexityPenalty} pts</span>
                                </div>
                            )}
                            {lengthPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Function Length Penalty</span>
                                    <span className="breakdown-value penalty">-{lengthPenalty} pts</span>
                                </div>
                            )}
                            {nestingPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Nesting Penalty</span>
                                    <span className="breakdown-value penalty">-{nestingPenalty} pts</span>
                                </div>
                            )}
                            {duplicationPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Duplication Penalty</span>
                                    <span className="breakdown-value penalty">-{duplicationPenalty} pts</span>
                                </div>
                            )}
                            {unusedPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Unused Imports Penalty</span>
                                    <span className="breakdown-value penalty">-{unusedPenalty} pts</span>
                                </div>
                            )}
                            {complexityPenalty === 0 && lengthPenalty === 0 && nestingPenalty === 0 && duplicationPenalty === 0 && unusedPenalty === 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Deductions</span>
                                    <span className="breakdown-value boost">None</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* What-If Playbook */}
                    {whatIfs.length > 0 && (
                        <div className="what-if-playbook">
                            <h3 className="what-if-title">⚡ What-If Playbook</h3>
                            <ul className="what-if-list">
                                {whatIfs.map((w, idx) => {
                                    const proj = Math.min(project.projectScore + w.penalty, 100);
                                    return (
                                        <li key={idx} className="what-if-item">
                                            <span>{w.action}</span>
                                            <span className="what-if-projected">
                                                Projected: <strong>{proj} (+{w.penalty} pts)</strong>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="glass-card ai-card">
                    <h2 className="card-title">AI Insight</h2>
                    <AIInsight explanation={project.aiExplanation} />
                </div>
            </div>

            {/* ── Category Scores ── */}
            <div className="glass-card category-section">
                <h2 className="card-title">
                    <TrendingUp size={16} /> Category Breakdown
                </h2>
                <div className="category-bars">
                    {catItems.map(cat => (
                        <div key={cat.label} className="cat-bar-item">
                            <div className="cat-bar-header">
                                <span className="cat-bar-label">{cat.label}</span>
                                <span className="cat-bar-score" style={{ color: barColor(cat.value) }}>
                                    {getGrade(cat.value)} ({cat.value})
                                </span>
                            </div>
                            <div className="cat-bar-track">
                                <div className="cat-bar-fill" style={{ width: `${cat.value}%`, background: barColor(cat.value) }} />
                            </div>
                            <span className="cat-bar-hint">{cat.hint}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Top Improvements ── */}
            {project.topImprovements.length > 0 && (
                <div className="glass-card improvements-section">
                    <h2 className="card-title">
                        Here are the areas that would give you the biggest improvement
                    </h2>
                    <div className="improvements-list">
                        {project.topImprovements.map((imp: any, i: number) => (
                            <div key={i} className="improvement-item">
                                <div className="improvement-rank">#{i + 1}</div>
                                <div className="improvement-body">
                                    <div className="improvement-area">{imp.area}</div>
                                    <p className="improvement-desc">{imp.description}</p>
                                    <div className="improvement-meta">
                                        <span className="improvement-files">{imp.affectedFiles} file{imp.affectedFiles > 1 ? 's' : ''} affected</span>
                                        <span className="improvement-gain">~+{imp.potentialGain} pts potential</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Architectural Pattern Recognition ── */}
            {project.detectedPatterns && project.detectedPatterns.length > 0 && (
                <div className="glass-card patterns-section" style={{ maxWidth: '1100px', margin: '20px auto 0', padding: '24px' }}>
                    <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Code size={18} color="#3b82f6" /> Detected Architectural Patterns
                    </h2>
                    <p className="section-subtitle">Aurelin resolved project layout and imports to detect architectural patterns with confidence scores.</p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginTop: '16px' }}>
                        {project.detectedPatterns.map((pattern: any, idx: number) => (
                            <div key={idx} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-card-hover)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '15px' }}>{pattern.name}</strong>
                                    <span style={{
                                        color: pattern.confidence >= 80 ? '#22c55e' : pattern.confidence >= 60 ? '#f59e0b' : '#f87171',
                                        background: pattern.confidence >= 80 ? 'rgba(34, 197, 94, 0.1)' : pattern.confidence >= 60 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                    }}>
                                        {pattern.confidence}% Match
                                    </span>
                                </div>
                                <p style={{ fontSize: '13px', margin: 0, color: 'var(--text-muted)' }}>{pattern.description}</p>
                                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                    <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text)' }}>Evidence:</div>
                                    <ul style={{ margin: 0, paddingLeft: '16px', listStyleType: 'disc', color: 'var(--text-muted)' }}>
                                        {pattern.evidence.map((ev: string, i: number) => (
                                            <li key={i} style={{ marginBottom: '2px' }}>{ev}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Architecture Insights (Stage 2) ── */}
            {project.architectureInsights && (
                <div className="architecture-grid">
                    <div className="glass-card mermaid-card">
                        <h2 className="card-title">🔌 Module Dependency Graph</h2>
                        <p className="section-subtitle">Visualizing import couplings. Highlighted cycles and god modules are included.</p>
                        <Mermaid chart={project.architectureInsights.mermaidGraph} />
                    </div>

                    <div className="glass-card insights-card">
                        <h2 className="card-title">🔬 Structural Findings</h2>
                        
                        {project.architectureInsights.cycles && project.architectureInsights.cycles.length > 0 ? (
                            <div className="insight-block danger">
                                <h3 className="insight-block-title">🔄 Circular Dependencies ({project.architectureInsights.cycles.length})</h3>
                                <p className="insight-block-desc">Cyclical imports make code brittle and hard to test. Consider breaking these loops:</p>
                                <ul className="cycles-list">
                                    {project.architectureInsights.cycles.map((cycle: string[], idx: number) => (
                                        <li key={idx} className="cycle-item">
                                            {cycle.map((c: string) => c.split('/').pop()).join(' ➔ ')}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="insight-block success">
                                <h3 className="insight-block-title">✓ No Circular Dependencies</h3>
                                <p className="insight-block-desc">All module imports flow in a clean, acyclic direction.</p>
                            </div>
                        )}

                        {project.architectureInsights.godFiles && project.architectureInsights.godFiles.length > 0 && (
                            <div className="insight-block warning">
                                <h3 className="insight-block-title">⚖ God Files ({project.architectureInsights.godFiles.length})</h3>
                                <p className="insight-block-desc">Modules with very high complexity and coupling that act as central hubs:</p>
                                <ul className="god-files-list">
                                    {project.architectureInsights.godFiles.map((file: string, idx: number) => (
                                        <li key={idx} className="god-file-item">
                                            <strong>{file.split('/').pop()}</strong> <span className="text-muted">({file})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {project.architectureInsights.deadCode && project.architectureInsights.deadCode.length > 0 && (
                            <div className="insight-block info">
                                <h3 className="insight-block-title">👻 Unreferenced Files ({project.architectureInsights.deadCode.length})</h3>
                                <p className="insight-block-desc">Files not imported by any other project module (excluding app entry points):</p>
                                <ul className="dead-code-list">
                                    {project.architectureInsights.deadCode.map((file: string, idx: number) => (
                                        <li key={idx} className="dead-code-item">
                                            <strong>{file.split('/').pop()}</strong> <span className="text-muted">({file})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {project.rootCauseClusters && project.rootCauseClusters.length > 0 && (
                <div className="glass-card clusters-section">
                    <h2 className="card-title">📁 Directory Issue Clusters</h2>
                    <p className="section-subtitle">Groups of related issues identified within specific subdirectories.</p>
                    <div className="clusters-grid">
                        {project.rootCauseClusters.map((cluster: any, idx: number) => (
                            <div key={idx} className="cluster-card-item">
                                <div className="cluster-header">
                                    <h3 className="cluster-folder">{cluster.folder}</h3>
                                    <span className="cluster-badge">{cluster.issueCount} issue{cluster.issueCount > 1 ? 's' : ''}</span>
                                </div>
                                <div className="cluster-details">
                                    <p className="cluster-tip">💡 {cluster.architecturalTip || 'Simplify code structure inside this directory.'}</p>
                                    <div className="cluster-meta-info">
                                        <strong>Affected files:</strong> {cluster.affectedFiles.join(', ')}
                                    </div>
                                    <div className="cluster-meta-info">
                                        <strong>Refined categories:</strong> {cluster.categories.map((c: string) => c.replace(/_/g, ' ')).join(', ')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── File Breakdown ── */}
            <div className="glass-card file-table-section">
                <h2 className="card-title">File Breakdown</h2>
                <div className="file-table-wrap">
                    <table className="file-table">
                        <thead>
                            <tr>
                                <th>File</th><th>Score</th><th>Grade</th><th>Mode</th><th>Top Insight</th>
                            </tr>
                        </thead>
                        <tbody>
                            {project.fileResults.map((file: FileResult, i: number) => (
                                <tr key={i} className={(file.correctnessStatus === 'fail' || file.score < 60) ? 'row-warn' : ''}>
                                    <td className="file-name">{file.filename}</td>
                                    <td className="file-score">
                                        {scoreIcon(file.score)}
                                        <span style={{ color: barColor(file.score) }}>{file.score}</span>
                                    </td>
                                    <td>
                                        <span className="file-grade-badge" style={{ color: gradeColor[file.grade], borderColor: `${gradeColor[file.grade]}40`, background: `${gradeColor[file.grade]}12` }}>
                                            {file.grade}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`mode-chip ${file.mode}`}>
                                            {file.mode === 'deep' ? '🔬 Deep' : '⚡ Quick'}
                                        </span>
                                    </td>
                                    <td className="file-top-issue">
                                        {file.topIssue ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── CTA ── */}
            <div className="analyze-cta">
                <button className="analyze-btn" onClick={() => router.push('/')}>
                    <RefreshCw size={15} /> Analyze Another Project
                </button>
            </div>

            <footer className="cv-footer">Aurelin · AI-powered code health analysis</footer>

            {/* ── Share Modal ── */}
            {showShareModal && (
                <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title"><Share2 size={16} /> Share Report</span>
                            <button className="modal-close" onClick={() => setShowShareModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <p className="modal-desc">Choose what viewers can see in the shared link.</p>

                        <div className="modal-visibility-toggle">
                            <button
                                className={`vis-btn ${shareVisibility === 'summary' ? 'active' : ''}`}
                                onClick={() => setShareVisibility('summary')}
                            >
                                <strong>Summary</strong>
                                <span>Score, categories, top improvements</span>
                            </button>
                            <button
                                className={`vis-btn ${shareVisibility === 'full' ? 'active' : ''}`}
                                onClick={() => setShareVisibility('full')}
                            >
                                <strong>Full Report</strong>
                                <span>Includes file-by-file breakdown</span>
                            </button>
                        </div>

                        {shareLink ? (
                            <div className="modal-link-box">
                                <span className="modal-link-text">{shareLink}</span>
                                <button className="modal-copy-btn" onClick={copyLink}>
                                    {copied ? <><Check size={13} /> Copied!</> : <><Share2 size={13} /> Copy</>}
                                </button>
                            </div>
                        ) : (
                            <button
                                className="analyze-btn"
                                style={{ width: '100%', marginTop: 8 }}
                                onClick={handleShare}
                                disabled={saving}
                            >
                                {saving ? 'Generating link…' : 'Generate Share Link'}
                            </button>
                        )}

                        {!user && (
                            <p className="modal-signin-hint">
                                💡 <Link href="/sign-in">Sign in</Link> to save this scan to your dashboard and track progress over time.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
