import type {
  EnvironmentalSignal,
  MonitoringRegion,
  RiskAssessment,
  RiskFactorBreakdown,
  RiskTier,
  RiskWeights,
  SatelliteObservation,
  VegetationIndexSummary,
} from '../../src/types/sylvasense.ts';
import { fuseEnvironmentalSignals } from './signalFusion.ts';

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  magnitude: 0.34,
  persistence: 0.22,
  environmentalContext: 0.22,
  supportingObservations: 0.22,
  dataQualityPenalty: 0.12,
  uncertaintyPenalty: 0.10,
};

export function classifyRiskScore(score: number): RiskTier {
  if (score >= 75) return 'Critical priority';
  if (score >= 55) return 'High priority';
  if (score >= 30) return 'Moderate risk';
  return 'Low risk';
}

/**
 * Transparent, deterministic weighted disturbance risk scoring model.
 * Explicitly distinguishes calculated disturbance risk from confirmed field incidents.
 */
export function evaluateRegionRisk(params: {
  region: MonitoringRegion;
  vegetation: VegetationIndexSummary;
  observations: SatelliteObservation[];
  signals: EnvironmentalSignal[];
  weights: RiskWeights;
  existingAssessmentId?: string;
}): RiskAssessment {
  const { region, vegetation, observations, signals, weights } = params;
  const fusion = fuseEnvironmentalSignals(region.id, signals);

  // 1. Magnitude of vegetation decline (only negative NDVI delta increases disturbance risk)
  const ndviDrop = Math.max(0, -vegetation.deltaNdvi);
  const normalizedMagnitude = Math.min(1, ndviDrop / 0.32); // 0.32 drop = max magnitude

  // 2. Persistence across consecutive satellite passes
  const normalizedPersistence = Math.min(1, vegetation.persistencePasses / 4);

  // 3. Environmental context (rainfall deficit, thermal anomaly, low soil moisture)
  const normalizedEnvContext = fusion.weightedEnvironmentalScore;

  // 4. Independent supporting observations (acoustic detections, field ranger notes)
  const independentSignals = signals.filter(
    (s) =>
      s.regionId === region.id &&
      s.availabilityStatus === 'available' &&
      (s.category === 'acoustic_observation' || s.category === 'field_report')
  );
  const independentScore =
    independentSignals.length > 0
      ? Math.min(
          1,
          independentSignals.reduce((acc, s) => acc + s.anomalyScore * s.confidence, 0) /
            independentSignals.length
        )
      : 0;

  // 5. Data quality penalty (cloud cover / degraded observations)
  const regionObs = observations.filter((o) => o.regionId === region.id);
  const latestObs = regionObs[regionObs.length - 1];
  const cloudFactor = latestObs ? Math.min(1, latestObs.cloudCoverPercent / 60) : 0.4;

  // 6. Uncertainty penalty from missing sensors
  const uncertaintyFactor = fusion.uncertaintyPenalty;

  const positiveWeightSum =
    weights.magnitude +
    weights.persistence +
    weights.environmentalContext +
    weights.supportingObservations;

  const normFactor = positiveWeightSum > 0 ? 1 / positiveWeightSum : 1;

  const cMag = normalizedMagnitude * weights.magnitude * normFactor * 100;
  const cPers = normalizedPersistence * weights.persistence * normFactor * 100;
  const cEnv = normalizedEnvContext * weights.environmentalContext * normFactor * 100;
  const cSupp = independentScore * weights.supportingObservations * normFactor * 100;

  const qualityDeduction = cloudFactor * weights.dataQualityPenalty * 100;
  const uncertaintyDeduction = uncertaintyFactor * weights.uncertaintyPenalty * 100;

  const rawScore = cMag + cPers + cEnv + cSupp - qualityDeduction * 0.35 - uncertaintyDeduction * 0.25;
  const riskScore = Math.round(Math.min(98, Math.max(4, rawScore)) * 10) / 10;
  const classification = classifyRiskScore(riskScore);

  const confidenceRaw =
    (fusion.averageSignalConfidence * 0.55 +
      (1 - cloudFactor) * 0.25 +
      (1 - uncertaintyFactor) * 0.2) *
    100;
  const confidence = Math.round(Math.min(96, Math.max(18, confidenceRaw)) * 10) / 10;
  const uncertaintyIndex = Math.round((100 - confidence) * 10) / 10;

  const breakdown: RiskFactorBreakdown[] = [
    {
      factor: 'Vegetation Change Magnitude (ΔNDVI)',
      rawValue: Math.round(normalizedMagnitude * 100),
      weight: weights.magnitude,
      weightedContribution: Math.round(cMag * 10) / 10,
      rationale:
        ndviDrop > 0
          ? `NDVI declined by ${vegetation.deltaNdvi.toFixed(3)} (${vegetation.changePercent.toFixed(1)}%) across ${vegetation.affectedAreaHectares} ha.`
          : 'No net negative NDVI decline detected over the comparison window.',
    },
    {
      factor: 'Multi-Pass Temporal Persistence',
      rawValue: Math.round(normalizedPersistence * 100),
      weight: weights.persistence,
      weightedContribution: Math.round(cPers * 10) / 10,
      rationale: `Observed across ${vegetation.persistencePasses} consecutive cloud-screened passes.`,
    },
    {
      factor: 'Environmental Context (Climate & Soil)',
      rawValue: Math.round(normalizedEnvContext * 100),
      weight: weights.environmentalContext,
      weightedContribution: Math.round(cEnv * 10) / 10,
      rationale: `Fused available rainfall, LST thermal, and soil moisture deviation index = ${(normalizedEnvContext * 100).toFixed(0)}%.`,
    },
    {
      factor: 'Independent Ground & Acoustic Corroboration',
      rawValue: Math.round(independentScore * 100),
      weight: weights.supportingObservations,
      weightedContribution: Math.round(cSupp * 10) / 10,
      rationale:
        independentSignals.length > 0
          ? `${independentSignals.length} independent field/acoustic observation(s) available.`
          : 'No ground or acoustic corroboration currently available; score relies on remote sensing alone.',
    },
    {
      factor: 'Data Quality & Cloud Attenuation Penalty',
      rawValue: Math.round(cloudFactor * 100),
      weight: -weights.dataQualityPenalty,
      weightedContribution: -Math.round(qualityDeduction * 0.35 * 10) / 10,
      rationale: latestObs
        ? `Latest pass cloud cover is ${latestObs.cloudCoverPercent.toFixed(1)}% (${latestObs.qualityFlag}).`
        : 'Limited optical pass metadata.',
    },
    {
      factor: 'Sensor Missingness & Uncertainty Adjustment',
      rawValue: Math.round(uncertaintyFactor * 100),
      weight: -weights.uncertaintyPenalty,
      weightedContribution: -Math.round(uncertaintyDeduction * 0.25 * 10) / 10,
      rationale: `${fusion.missingCount} missing and ${fusion.degradedOrCloudCount} degraded/occluded sensor feeds accounted for without inflating risk.`,
    },
  ];

  const hasVerifiedFieldSignal = independentSignals.some(
    (s) => s.category === 'field_report' && s.anomalyScore >= 0.7
  );

  let suggestedVerificationAction = 'Continue automated Sentinel-2 5-day revisit monitoring.';
  if (classification === 'Critical priority') {
    suggestedVerificationAction =
      'Dispatch beat forest officer patrol to hotspot coordinates with GPS photo log and acoustic sensor check within 24 hours.';
  } else if (classification === 'High priority') {
    suggestedVerificationAction =
      'Schedule range patrol inspection along nearest access trail and cross-check Sentinel-1 SAR backscatter.';
  } else if (classification === 'Moderate risk') {
    suggestedVerificationAction =
      'Verify against seasonal deciduous phenology and await next cloud-free optical acquisition.';
  }

  const explanation =
    `${region.name} (${region.state}) registers a ${classification.toLowerCase()} composite score of ${riskScore}/100 ` +
    `with ${confidence}% model confidence. Primary driver: ${
      ndviDrop >= 0.1
        ? `persistent NDVI decline of ${vegetation.changePercent.toFixed(1)}% over ${vegetation.persistencePasses} passes`
        : 'minor spectral fluctuation within seasonal variance'
    }${
      independentSignals.length > 0
        ? `, partially corroborated by ${independentSignals.length} non-optical observation(s).`
        : '; awaits ground or acoustic verification.'
    }`;

  return {
    id: params.existingAssessmentId ?? `risk-${region.id}`,
    regionId: region.id,
    assessedAt: new Date().toISOString(),
    riskScore,
    classification,
    confidence,
    uncertaintyIndex,
    isConfirmedIncident: hasVerifiedFieldSignal && riskScore >= 75,
    incidentStatusNotice:
      'Risk score indicates statistical environmental anomaly requiring verification — not a confirmed illegal logging incident until ground-verified.',
    supportingObservations: fusion.availableEvidenceDescriptions,
    missingEvidence: fusion.missingEvidenceDescriptions,
    explanation,
    suggestedVerificationAction,
    breakdown,
  };
}
