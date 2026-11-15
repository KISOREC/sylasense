import React, { useEffect, useState } from 'react';
import { Send, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import type { AnalystStructuredResponse, SystemSnapshot } from '../types/sylvasense';

interface AiAnalystProps {
  snapshot: SystemSnapshot;
  selectedRegionId: string;
  selectedAlertId: string;
  autoRunPrompt?: string | null;
  onClearAutoRunPrompt?: () => void;
}

const EXAMPLE_QUESTIONS = [
  'Which monitoring zones show the greatest vegetation decline?',
  'Why was Nilgiri Shola-Grassland Mosaic marked as critical priority?',
  'Summarize the latest satellite observations across all 6 zones.',
  'Compare Nilgiri Shola and Anamalai Valparai Corridor.',
  'Generate an investigation report for the selected alert.',
  'What additional evidence is required to verify the Anamalai and Periyar assessments?',
];

export const AiAnalyst: React.FC<AiAnalystProps> = ({
  snapshot,
  selectedRegionId,
  selectedAlertId,
  autoRunPrompt,
  onClearAutoRunPrompt,
}) => {
  const [question, setQuestion] = useState(EXAMPLE_QUESTIONS[1]);
  const [focusRegionId, setFocusRegionId] = useState<string>(selectedRegionId);
  const [focusAlertId, setFocusAlertId] = useState<string>(selectedAlertId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalystStructuredResponse | null>(null);

  const geminiSource = snapshot.dataSources.find((d) => d.id === 'ds-gemini');

  useEffect(() => {
    setFocusRegionId(selectedRegionId);
    setFocusAlertId(selectedAlertId);
  }, [selectedRegionId, selectedAlertId]);

  const runQuery = async (qText: string, regId?: string, altId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.queryAnalyst({
        question: qText,
        regionId: regId || undefined,
        alertId: altId || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Sylva Intelligence Analyst.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRunPrompt) {
      setQuestion(autoRunPrompt);
      setFocusRegionId(selectedRegionId);
      setFocusAlertId(selectedAlertId);
      runQuery(autoRunPrompt, selectedRegionId, selectedAlertId);
      onClearAutoRunPrompt?.();
    }
  }, [autoRunPrompt, selectedRegionId, selectedAlertId, onClearAutoRunPrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    runQuery(question, focusRegionId, focusAlertId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-cyan-400">
            Server-Side Google Gemini Structured Synthesis · Strictly Grounded in Supplied Evidence
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Sylva Intelligence Analyst
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1 max-w-3xl">
            Ask natural-language analytical questions over live SylvaSense observations, NDVI indices, environmental signals, and investigation records.
          </p>
        </div>

        <div className="text-xs font-mono">
          {geminiSource?.state === 'Live' ? (
            <span className="text-emerald-400">● Gemini Service Live</span>
          ) : geminiSource?.state === 'Error' ? (
            <span className="text-rose-400">▲ Gemini Service Error</span>
          ) : (
            <span className="text-amber-400">◆ Gemini Disconnected (Key Required)</span>
          )}
        </div>
      </div>

      {/* Query Composer */}
      <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-[#8CA09A]">Focus Region Context</span>
              <select
                value={focusRegionId}
                onChange={(e) => setFocusRegionId(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
              >
                <option value="">All Western Ghats Regions</option>
                {snapshot.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="text-[#8CA09A]">Focus Alert Context</span>
              <select
                value={focusAlertId}
                onChange={(e) => setFocusAlertId(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
              >
                <option value="">No specific alert filter</option>
                {snapshot.alerts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} — {a.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Sylva Intelligence Analyst about regions, NDVI changes, or verification requirements..."
              className="flex-1 px-3.5 py-2.5 text-sm bg-[#0B1011] border border-[#253236] rounded text-[#F0F5F3] placeholder-[#657973] focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              {loading ? 'Synthesizing...' : 'Analyze Evidence'}
            </button>
          </div>
        </form>

        {/* Quick Example Prompts */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono text-[#7E948E]">Suggested Analytical Queries:</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuestion(q);
                  runQuery(q, focusRegionId, focusAlertId);
                }}
                className="px-2.5 py-1 text-xs bg-[#0B1011] hover:bg-[#172124] border border-[#222E31] rounded text-[#BAC8C3] transition-colors cursor-pointer text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-200 space-y-1">
          <div className="font-semibold">Analyst Service Error</div>
          <p>{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-6 space-y-3">
          <div className="text-xs font-mono text-cyan-400">
            Evaluating supplied satellite observations, environmental signals, and risk breakdowns...
          </div>
          <div className="h-3 bg-[#1A2326] rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-[#1A2326] rounded w-1/2 animate-pulse" />
        </div>
      )}

      {/* Structured Output */}
      {result && !loading && (
        <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E282B] pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F5F3]">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Evidence-Grounded Intelligence Brief
            </div>
            <div className="text-[11px] font-mono text-[#7E948E]">
              Model: {result.modelUsed} · Grounded JSON output
            </div>
          </div>

          <p className="text-sm text-[#EAEFED] leading-relaxed">{result.answer}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
            <div>
              <h3 className="text-xs font-semibold text-emerald-400 mb-2">Key Empirical Findings</h3>
              <ul className="space-y-1.5 text-xs text-[#C8D5D1]">
                {result.keyFindings.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-cyan-400 mb-2">
                Recommended Verification Steps
              </h3>
              <ul className="space-y-1.5 text-xs text-[#C8D5D1]">
                {result.recommendedNextSteps.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {result.evidenceCitations.length > 0 && (
            <div className="pt-3 border-t border-[#1E282B]">
              <h3 className="text-xs font-semibold text-[#E2ECE9] mb-2">
                Grounded Evidence Citations
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.evidenceCitations.map((cit, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-[#0C1112] border border-[#1E282B] rounded text-xs"
                  >
                    <div className="font-mono text-[11px] text-cyan-400">
                      {cit.sourceType} · {cit.referenceId}
                    </div>
                    <div className="text-[#C8D5D1] mt-0.5">{cit.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.missingDataCaveats.length > 0 && (
            <div className="pt-3 border-t border-[#1E282B]">
              <h3 className="text-xs font-semibold text-amber-400 mb-1.5">
                Missing Data &amp; Epistemic Caveats
              </h3>
              <ul className="space-y-1 text-xs text-[#B5C4BF]">
                {result.missingDataCaveats.map((cav, i) => (
                  <li key={i}>· {cav}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 bg-[#0C1112] border border-[#1E282B] rounded text-xs text-[#9FB2AC] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{result.confidenceStatement}</span>
          </div>
        </div>
      )}
    </div>
  );
};
