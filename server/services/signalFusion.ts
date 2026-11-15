import type { EnvironmentalSignal } from '../../src/types/sylvasense.ts';

export interface SignalFusionSummary {
  regionId: string;
  availableCount: number;
  missingCount: number;
  degradedOrCloudCount: number;
  weightedEnvironmentalScore: number; // 0..1
  corroborationRatio: number; // 0..1
  averageSignalConfidence: number; // 0..1
  uncertaintyPenalty: number; // 0..1
  availableEvidenceDescriptions: string[];
  missingEvidenceDescriptions: string[];
}

/**
 * Multi-signal fusion engine.
 * Explicitly separates missing/cloud-occluded sensors from anomaly evidence
 * so missing telemetry never triggers false disturbance alerts.
 */
export function fuseEnvironmentalSignals(
  regionId: string,
  signals: EnvironmentalSignal[]
): SignalFusionSummary {
  const regionSignals = signals.filter((s) => s.regionId === regionId);

  const available = regionSignals.filter((s) => s.availabilityStatus === 'available');
  const missing = regionSignals.filter((s) => s.availabilityStatus === 'missing');
  const degradedOrCloud = regionSignals.filter(
    (s) => s.availabilityStatus === 'degraded' || s.availabilityStatus === 'cloud_occluded'
  );

  // Exclude satellite_vegetation when computing secondary environmental corroboration
  const nonSatelliteAvailable = available.filter((s) => s.category !== 'satellite_vegetation');

  let weightedSum = 0;
  let weightTotal = 0;

  for (const sig of nonSatelliteAvailable) {
    const qualityFactor =
      sig.dataQuality === 'high' ? 1.0 : sig.dataQuality === 'moderate' ? 0.75 : 0.45;
    const w = sig.confidence * qualityFactor;
    weightedSum += sig.anomalyScore * w;
    weightTotal += w;
  }

  const weightedEnvironmentalScore =
    weightTotal > 0 ? Math.min(1, Math.max(0, weightedSum / weightTotal)) : 0;

  // Corroboration: fraction of non-satellite available signals showing meaningful anomaly (>= 0.45)
  const corroborating = nonSatelliteAvailable.filter((s) => s.anomalyScore >= 0.45);
  const corroborationRatio =
    nonSatelliteAvailable.length > 0 ? corroborating.length / nonSatelliteAvailable.length : 0;

  const avgConf =
    available.length > 0
      ? available.reduce((acc, s) => acc + s.confidence, 0) / available.length
      : 0.25;

  // Uncertainty increases when sensors are missing or cloud-occluded
  const totalExpected = Math.max(regionSignals.length, 6);
  const unavailableFraction = (missing.length + degradedOrCloud.length * 0.6) / totalExpected;
  const uncertaintyPenalty = Math.min(1, Math.max(0, unavailableFraction));

  const availableEvidenceDescriptions = available.map((s) => {
    const valStr = s.measuredValue !== null ? `${s.measuredValue} ${s.unit}`.trim() : 'N/A';
    return `${s.label}: ${valStr} (${s.baselineComparison}, ${s.source}, quality: ${s.dataQuality})`;
  });

  const missingEvidenceDescriptions = [
    ...missing.map(
      (s) => `${s.label} unavailable (${s.source} — treated as missing data, not disturbance evidence)`
    ),
    ...degradedOrCloud.map(
      (s) => `${s.label} degraded/occluded (${s.source} — excluded from high-confidence scoring)`
    ),
  ];

  return {
    regionId,
    availableCount: available.length,
    missingCount: missing.length,
    degradedOrCloudCount: degradedOrCloud.length,
    weightedEnvironmentalScore: Math.round(weightedEnvironmentalScore * 1000) / 1000,
    corroborationRatio: Math.round(corroborationRatio * 1000) / 1000,
    averageSignalConfidence: Math.round(avgConf * 1000) / 1000,
    uncertaintyPenalty: Math.round(uncertaintyPenalty * 1000) / 1000,
    availableEvidenceDescriptions,
    missingEvidenceDescriptions,
  };
}
