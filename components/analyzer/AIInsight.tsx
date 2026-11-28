'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

interface AIInsightProps {
    explanation: string;
    model?: string;
}

function parseExplanation(raw: string): {
    summary: string;
    actions: string[];
    effort: string;
} {
    const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]+?)(?=TOP_ACTIONS:|EFFORT:|$)/);
    const actionsMatch = raw.match(/TOP_ACTIONS:\s*([\s\S]+?)(?=EFFORT:|$)/);
    const effortMatch = raw.match(/EFFORT:\s*(.+)/);

    const actions = actionsMatch
        ? actionsMatch[1]
            .split('\n')
            .map((l) => l.replace(/^\d+\.\s*/, '').trim())
            .filter(Boolean)
        : [];

    return {
        summary: summaryMatch ? summaryMatch[1].trim() : raw,
        actions,
        effort: effortMatch ? effortMatch[1].trim() : '',
    };
}

export default function AIInsight({ explanation, model }: AIInsightProps) {
    const { summary, actions, effort } = parseExplanation(explanation);
    const [progress, setProgress] = useState<{ text: string; len: number }>({ text: '', len: 0 });

    // Typewriter for summary
    useEffect(() => {
        let idx = 0;
        const interval = setInterval(() => {
            idx++;
            setProgress({ text: summary, len: idx });
            if (idx >= summary.length) clearInterval(interval);
        }, 18);
        return () => clearInterval(interval);
    }, [summary]);

    const displayed = progress.text === summary ? summary.slice(0, progress.len) : '';

    const effortColor =
        effort.toLowerCase().startsWith('low') ? '#22c55e' :
            effort.toLowerCase().startsWith('medium') ? '#f59e0b' :
                '#ef4444';

    return (
        <div className="ai-insight-card">
            <div className="ai-insight-header">
                <Bot size={18} color="#818cf8" />
                <span>AI Engineering Insight</span>
                {model && <span className="ai-badge">{model}</span>}
            </div>

            <p className="ai-summary">{displayed}<span className="cursor-blink">|</span></p>

            {actions.length > 0 && (
                <div className="ai-actions">
                    <p className="ai-actions-title">Recommended Actions</p>
                    <ol className="ai-actions-list">
                        {actions.map((action, i) => (
                            <li key={i}>{action}</li>
                        ))}
                    </ol>
                </div>
            )}

            {effort && (
                <div className="ai-effort">
                    <span className="ai-effort-label">Refactor Effort:</span>
                    <span style={{ color: effortColor, fontWeight: 600 }}>{effort}</span>
                </div>
            )}
        </div>
    );
}
