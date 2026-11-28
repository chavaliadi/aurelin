'use client';

import { useState, useCallback } from 'react';
import { X, Copy, Check, RefreshCw, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import type { Issue } from '@/lib/analyzer/types';
import type { AIFixResponse } from '@/lib/ai/types';

interface SuggestFixModalProps {
    issue: Issue;
    codeSnippet: string;
    language: string;
    onClose: () => void;
    onRerun?: () => void;   // CTA to re-run analysis
}

export default function SuggestFixModal({
    issue,
    codeSnippet,
    language,
    onClose,
    onRerun,
}: SuggestFixModalProps) {
    const [fix, setFix] = useState<AIFixResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [unavailableMsg, setUnavailableMsg] = useState('');
    const [copiedAfter, setCopiedAfter] = useState(false);
    const [lastClickTime, setLastClickTime] = useState(0);  // debounce guard

    const fetchFix = useCallback(async () => {
        // 2-second debounce — prevent rapid spam
        const now = Date.now();
        if (now - lastClickTime < 2000) return;
        setLastClickTime(now);

        setLoading(true);
        setError('');
        setUnavailableMsg('');
        setFix(null);

        try {
            const res = await fetch('/api/suggest-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue, codeSnippet, language }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? 'Failed to fetch suggestion.');
                return;
            }
            if (!data.available) {
                setUnavailableMsg(data.message ?? 'AI suggestion temporarily unavailable. Core analysis is unaffected.');
                return;
            }
            setFix(data.fix as AIFixResponse);

            // Log usage analytics (fire-and-forget)
            fetch('/api/analytics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'suggest_fix_clicked' }),
            }).catch(() => { }); // Silent fail — never block UI
        } catch {
            setError('Network error. AI suggestion temporarily unavailable. Core analysis is unaffected.');
        } finally {
            setLoading(false);
        }
    }, [issue, codeSnippet, language, lastClickTime]);

    // Auto-fetch on mount
    useState(() => { fetchFix(); });

    function copyAfter() {
        if (!fix) return;
        navigator.clipboard.writeText(fix.afterSnippet).then(() => {
            setCopiedAfter(true);
            setTimeout(() => setCopiedAfter(false), 2000);
        });
    }

    return (
        <div className="sfm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="sfm-modal" role="dialog" aria-modal="true" aria-label="Suggest Fix">

                {/* Header */}
                <div className="sfm-header">
                    <div className="sfm-header-left">
                        <Sparkles size={16} className="sfm-header-icon" />
                        <span className="sfm-title">AI Suggest Fix</span>
                        <span className="sfm-badge">Advisory · Not Auto-Applied</span>
                    </div>
                    <button className="sfm-close" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Issue context */}
                <div className="sfm-issue-context">
                    <span className="sfm-issue-type">{issue.type.replace('_', ' ')}</span>
                    {issue.name && <span className="sfm-issue-fn">&quot;{issue.name}&quot;</span>}
                    <p className="sfm-issue-msg">{issue.message}</p>
                </div>

                {/* Body */}
                <div className="sfm-body">
                    {loading && (
                        <div className="sfm-loading">
                            <Loader2 size={20} className="spin" />
                            <span>Generating suggestion…</span>
                        </div>
                    )}

                    {(error || unavailableMsg) && !loading && (
                        <div className="sfm-unavailable">
                            <AlertTriangle size={16} />
                            <span>{error || unavailableMsg}</span>
                        </div>
                    )}

                    {fix && !loading && (
                        <>
                            {/* Explanation */}
                            <p className="sfm-explanation">{fix.explanation}</p>

                            {/* Before / After */}
                            <div className="sfm-diff-grid">
                                <div className="sfm-diff-col">
                                    <div className="sfm-diff-label before">Before</div>
                                    <pre className="sfm-code before"><code>{fix.beforeSnippet}</code></pre>
                                </div>
                                <div className="sfm-diff-col">
                                    <div className="sfm-diff-label after">After</div>
                                    <pre className="sfm-code after"><code>{fix.afterSnippet}</code></pre>
                                </div>
                            </div>

                            {/* Why it helps */}
                            {fix.whyItHelps?.length > 0 && (
                                <div className="sfm-why">
                                    <p className="sfm-why-title">Why this improves your score</p>
                                    <ul className="sfm-why-list">
                                        {fix.whyItHelps.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Disclaimer */}
                            <p className="sfm-disclaimer">{fix.disclaimer}</p>
                        </>
                    )}
                </div>

                {/* Footer actions */}
                <div className="sfm-footer">
                    {fix && (
                        <button className="sfm-btn copy" onClick={copyAfter}>
                            {copiedAfter ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Improved Version</>}
                        </button>
                    )}
                    {!fix && !loading && (
                        <button className="sfm-btn retry" onClick={fetchFix}>
                            <RefreshCw size={14} /> Try Again
                        </button>
                    )}
                    {onRerun && (
                        <button className="sfm-btn rerun" onClick={() => { onClose(); onRerun(); }}>
                            <RefreshCw size={14} /> Re-run Analysis After Applying
                        </button>
                    )}
                    <button className="sfm-btn close" onClick={onClose}>
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}
