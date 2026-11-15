import React, { useState } from 'react';
import { RefreshCw, RotateCcw, ShieldAlert, Sliders } from 'lucide-react';
import { api } from '../services/api';
import type { RiskWeights, SystemSnapshot } from '../types/sylvasense';
import { getRiskGlyph, getRiskTextColor } from '../utils/formatters';

interface RiskIntelligenceProps {
  snapshot: SystemSnapshot;
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  onSnapshotUpdate: (next: SystemSnapshot) => void;
}

const DEFAULT_WEIGHTS: RiskWeights = {
  magnitude: 0.34,
  persistence: 0.22,
  environmentalContext: 0.22,
  supportingObservations: 0.22,
  dataQualityPenalty: 0.12,
  uncertaintyPenalty: 0.10,
};

export const RiskIntelligence: React.FC<RiskIntelligenceProps> = ({
  snapshot,
  selectedRegionId,
  onSelectRegion,
  onSnapshotUpdate,
}) => {
  const [weights, setWeights] = useState<RiskWeights>(snapshot.riskWeights);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedMsg, setLastUpdatedMsg] = useState<string | null>(null);

  const selectedAssessment =
    snapshot.assessments.find((a) => a.regionId === selectedRegionId) ?? snapshot.assessments[0];
  const selectedRegion =
    snapshot.regions.find((r) => r.id === selectedAssessment.regionId) ?? snapshot.regions[0];

  const handleRecalculate = async () => {
    setSaving(true);
    setError(null);
    setLastUpdatedMsg(null);
    try {
      const res = await api.recalculateRisk(weights);
      onSnapshotUpdate(res.snapshot);
      setLastUpdatedMsg('Risk scores recalculated across all 6 monitoring regions.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recalculate risk weights.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetWeights = async () => {
    setWeights(DEFAULT_WEIGHTS);
    setSaving(true);
    setError(null);
    try {
      const res = await api.recalculateRisk(DEFAULT_WEIGHTS);
      onSnapshotUpdate(res.snapshot);
      setLastUpdatedMsg('Restored baseline scoring weights.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset weights.');
    } finally {
      setSaving(false);
    }
  };

  const weightControls: Array<{
    key: keyof RiskWeights;
    label: string;
    desc: string;
    max: number;
  }> = [
    {
      key: 'magnitude',
      label: 'Vegetation Change Magnitude (ΔNDVI)',
      desc: 'Weight assigned to negative canopy index drop vs baseline.',
      max: 0.6,
    },
    {
      key: 'persistence',
      label: 'Multi-Pass Persistence',
      desc: 'Weight for sustained decline across consecutive Sentinel-2 dates.',
      max: 0.5,
    },
    {
      key: 'environmentalContext',
      label: 'Environmental Context',
      desc: 'Weight for fused rainfall deficit, thermal anomaly, and soil moisture.',
      max: 0.5,
    },
    {
      key: 'supportingObservations',
      label: 'Independent Corroboration',
      desc: 'Weight for bioacoustic spikes and ground patrol notes.',
      max: 0.5,
    },
    {
      key: 'dataQualityPenalty',
      label: 'Cloud & Quality Attenuation Penalty',
      desc: 'Dampens scores when optical cloud cover reduces spectral reliability.',
      max: 0.35,
    },
    {
      key: 'uncertaintyPenalty',
      label: 'Missing Sensor Uncertainty Penalty',
      desc: 'Prevents missing sensors from artificially inflating priority.',
      max: 0.35,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-emerald-400">
            Explainable Weighted Scoring Model · No Unverified Black-Box ML Claims
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Forest Disturbance Risk Engine
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1">
            Adjust model factor weights and inspect transparent risk breakdowns, confidence intervals, and missing evidence per region.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleResetWeights}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#141C1E] hover:bg-[#1B2528] text-[#D7E2DE] border border-[#253236] rounded cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Weights
          </button>
          <button
            onClick={handleRecalculate}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Recalculating...' : 'Recalculate Network Risk'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
          {error}
        </div>
      )}
      {lastUpdatedMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300">
          {lastUpdatedMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Weight Configuration Panel */}
        <div className="xl:col-span-4 bg-[#111719] border border-[#1E282B] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F5F3]">
            <Sliders className="w-4 h-4 text-emerald-400" />
            Configurable Scoring Weights
          </div>

          <div className="space-y-4">
            {weightControls.map((ctrl) => (
              <div key={ctrl.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#D8E3E0] font-medium">{ctrl.label}</span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {weights[ctrl.key].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={ctrl.max}
                  step={0.02}
                  value={weights[ctrl.key]}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [ctrl.key]: Number(e.target.value) }))
                  }
                  className="w-full accent-emerald-500"
                />
                <p className="text-[11px] text-[#7E948E]">{ctrl.desc}</p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[#1E282B] text-[11px] text-[#8CA09A] space-y-1">
            <div>Classification Thresholds:</div>
            <div className="font-mono grid grid-cols-2 gap-1 text-[10px]">
              <span className="text-rose-400">▲ Critical: &ge; 75</span>
              <span className="text-amber-400">◆ High: 55 – 74.9</span>
              <span className="text-cyan-400">● Moderate: 30 – 54.9</span>
              <span className="text-emerald-400">✓ Low: &lt; 30</span>
            </div>
          </div>
        </div>

        {/* Regional Risk Breakdown Inspector */}
        <div className="xl:col-span-8 space-y-5">
          {/* Region Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {snapshot.regions.map((r) => {
              const a = snapshot.assessments.find((x) => x.regionId === r.id)!;
              const active = r.id === selectedRegion.id;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelectRegion(r.id)}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#162122] border-emerald-500/70'
                      : 'bg-[#111719] border-[#1E282B] hover:border-[#2E3D42]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#7E948E]">
                    <span>{r.code}</span>
                    <span className={getRiskTextColor(a.classification)}>
                      {getRiskGlyph(a.classification)} {a.riskScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-[#E6ECEA] truncate mt-1">
                    {r.name}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Assessment Detailed Card */}
          <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1E282B] pb-4">
              <div>
                <div className="text-xs font-mono text-[#7E948E]">
                  {selectedRegion.code} · {selectedRegion.state} · {selectedRegion.district}
                </div>
                <h2 className="text-lg font-semibold text-[#F0F5F3] mt-0.5">
                  {selectedRegion.name}
                </h2>
              </div>

              <div className="flex items-center gap-6 font-mono tabular-nums">
                <div>
                  <div className="text-[11px] text-[#7E948E]">Risk Score</div>
                  <div className={`text-2xl font-semibold ${getRiskTextColor(selectedAssessment.classification)}`}>
                    {selectedAssessment.riskScore.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#7E948E]">Confidence</div>
                  <div className="text-2xl font-semibold text-cyan-400">
                    {selectedAssessment.confidence.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#7E948E]">Uncertainty</div>
                  <div className="text-2xl font-semibold text-[#9FB2AC]">
                    {selectedAssessment.uncertaintyIndex.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded text-xs text-amber-200/90 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Assessment vs Confirmed Incident:</strong> {selectedAssessment.incidentStatusNotice}{' '}
                Current status:{' '}
                <span className="font-mono underline">
                  {selectedAssessment.isConfirmedIncident
                    ? 'Ground-corroborated high-risk anomaly'
                    : 'Unconfirmed statistical risk'}
                </span>
                .
              </div>
            </div>

            {/* Factor-by-factor Breakdown */}
            <div>
              <h3 className="text-xs font-semibold text-[#E2ECE9] mb-3">
                Factor-by-Factor Contribution Breakdown
              </h3>
              <div className="space-y-3">
                {selectedAssessment.breakdown.map((b) => (
                  <div key={b.factor} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#D8E3E0] font-medium">{b.factor}</span>
                      <span className="font-mono tabular-nums text-[#F0F5F3]">
                        {b.weightedContribution >= 0 ? '+' : ''}
                        {b.weightedContribution.toFixed(1)} pts (weight {b.weight.toFixed(2)})
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#0A0E0F] rounded overflow-hidden">
                      <div
                        className={`h-full ${
                          b.weightedContribution < 0
                            ? 'bg-cyan-500/70'
                            : b.rawValue >= 70
                              ? 'bg-rose-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.abs(b.rawValue))}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#7E948E]">{b.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Supporting vs Missing Evidence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#1E282B]">
              <div>
                <h4 className="text-xs font-semibold text-emerald-400 mb-2">
                  Supporting Observations ({selectedAssessment.supportingObservations.length})
                </h4>
                <ul className="space-y-1.5 text-xs text-[#BAC8C3]">
                  {selectedAssessment.supportingObservations.map((obs, i) => (
                    <li key={i} className="leading-relaxed">
                      · {obs}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-amber-400 mb-2">
                  Missing or Degraded Evidence ({selectedAssessment.missingEvidence.length})
                </h4>
                {selectedAssessment.missingEvidence.length === 0 ? (
                  <p className="text-xs text-[#7E948E]">
                    All configured signal streams reported nominal availability for this window.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-xs text-[#BAC8C3]">
                    {selectedAssessment.missingEvidence.map((miss, i) => (
                      <li key={i} className="leading-relaxed">
                        · {miss}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#1E282B] text-xs">
              <span className="text-[#7E948E]">Suggested Verification Action: </span>
              <span className="text-[#EAEFED]">{selectedAssessment.suggestedVerificationAction}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
