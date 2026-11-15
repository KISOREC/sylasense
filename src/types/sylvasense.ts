export type DataMode = 'live' | 'cached' | 'simulated';
export type AvailabilityStatus = 'available' | 'missing' | 'degraded' | 'cloud_occluded';
export type SignalCategory =
  | 'satellite_vegetation'
  | 'rainfall_variation'
  | 'temperature'
  | 'soil_moisture'
  | 'acoustic_observation'
  | 'field_report';

export type RiskTier =
  | 'Low risk'
  | 'Moderate risk'
  | 'High priority'
  | 'Critical priority';

export type InvestigationStatus =
  | 'New'
  | 'Under Review'
  | 'Field Verification Required'
  | 'Verified'
  | 'Dismissed';

export interface User {
  id: string;
  name: string;
  role: 'Chief Forest Conservator' | 'GIS Analyst' | 'Range Officer' | 'Ecological Researcher';
  division: string;
  email: string;
}

export interface MonitoringRegion {
  id: string;
  code: string;
  name: string;
  state: 'Tamil Nadu' | 'Kerala';
  district: string;
  biome: string;
  areaHectares: number;
  centerLat: number;
  centerLng: number;
  boundary: [number, number][]; // [lat, lng] polygon ring
  isSampleCoordinate: boolean;
  assignedOfficer: string;
  lastPassDate: string;
  coveragePercent: number;
}

export interface SatelliteObservation {
  id: string;
  regionId: string;
  sensor: string;
  tileId: string;
  acquiredAt: string;
  cloudCoverPercent: number;
  bandB4Red: number; // 0..1 reflectance
  bandB8Nir: number; // 0..1 reflectance
  calculatedNdvi: number;
  qualityFlag: 'nominal' | 'partial_cloud' | 'haze_corrected' | 'occluded';
  dataMode: DataMode;
  notes: string;
}

export interface NdviTimePoint {
  date: string;
  ndvi: number;
  baselineNdvi: number;
  cloudCoverPercent: number;
  b4Red: number;
  b8Nir: number;
  status: 'nominal' | 'suspicious_drop' | 'cloud_masked';
}

export interface VegetationIndexSummary {
  id: string;
  regionId: string;
  previousDate: string;
  currentDate: string;
  previousNdvi: number;
  currentNdvi: number;
  deltaNdvi: number;
  changePercent: number;
  persistencePasses: number;
  affectedAreaHectares: number;
  hotspotLat: number;
  hotspotLng: number;
  timeSeries: NdviTimePoint[];
}

export interface EnvironmentalSignal {
  id: string;
  regionId: string;
  category: SignalCategory;
  label: string;
  source: string;
  timestamp: string;
  lat: number;
  lng: number;
  measuredValue: string | number | null;
  unit: string;
  baselineComparison: string;
  anomalyScore: number; // 0..1 contribution when available
  dataQuality: 'high' | 'moderate' | 'low' | 'unavailable';
  confidence: number; // 0..1
  availabilityStatus: AvailabilityStatus;
  dataMode: DataMode;
}

export interface RiskWeights {
  magnitude: number;
  persistence: number;
  environmentalContext: number;
  supportingObservations: number;
  dataQualityPenalty: number;
  uncertaintyPenalty: number;
}

export interface RiskFactorBreakdown {
  factor: string;
  rawValue: number;
  weight: number;
  weightedContribution: number;
  rationale: string;
}

export interface RiskAssessment {
  id: string;
  regionId: string;
  assessedAt: string;
  riskScore: number; // 0..100
  classification: RiskTier;
  confidence: number; // 0..100
  uncertaintyIndex: number; // 0..100
  isConfirmedIncident: boolean;
  incidentStatusNotice: string;
  supportingObservations: string[];
  missingEvidence: string[];
  explanation: string;
  suggestedVerificationAction: string;
  breakdown: RiskFactorBreakdown[];
}

export interface EvidenceRecord {
  id: string;
  alertId: string;
  regionId: string;
  kind: 'satellite_spectral' | 'acoustic_clip' | 'weather_anomaly' | 'ranger_note' | 'soil_telemetry';
  title: string;
  summary: string;
  source: string;
  recordedAt: string;
  recordedBy: string;
  lat: number;
  lng: number;
  dataMode: DataMode;
}

export interface InvestigationNote {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  text: string;
  actionTaken?: string;
}

export interface Investigation {
  id: string;
  alertId: string;
  regionId: string;
  assignedOfficer: string;
  status: InvestigationStatus;
  verificationAction: string;
  notes: InvestigationNote[];
  updatedAt: string;
}

export interface Alert {
  id: string;
  regionId: string;
  assessmentId: string;
  title: string;
  severity: RiskTier;
  status: InvestigationStatus;
  assignedOfficer: string;
  riskScore: number;
  confidence: number;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
  summary: string;
}

export type DataSourceState = 'Live' | 'Demo' | 'Disconnected' | 'Error';

export interface DataSourceTestResult {
  sourceId: string;
  state: DataSourceState;
  ok: boolean;
  message: string;
  testedAt: string;
  latencyMs: number;
  details?: string;
}

export interface DataSourceStatus {
  id: string;
  name: string;
  provider: string;
  category: 'satellite' | 'weather' | 'sensor' | 'field' | 'ai' | 'geospatial';
  state: DataSourceState;
  status: 'connected' | 'disconnected' | 'degraded';
  dataMode: DataMode;
  optional: boolean;
  lastSuccessfulUpdate: string | null;
  lastTestedAt: string | null;
  lastLatencyMs: number | null;
  freshnessLabel: string;
  errorStatus: string | null;
  fallbackBehavior: string;
  credentialRequirement: string;
  envVars: string[];
  endpointInfo: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  targetType: 'alert' | 'investigation' | 'risk_engine' | 'evidence' | 'ai_analyst' | 'ndvi_calc' | 'datasource';
  targetId: string;
  detail: string;
  timestamp: string;
}

export interface SystemSnapshot {
  isDemoMode: boolean;
  provenanceMode: 'demo' | 'hybrid' | 'live';
  demoNotice: string;
  summary: {
    totalMonitoredAreaHa: number;
    monitoredZonesCount: number;
    suspiciousObservationsCount: number;
    highPriorityLocationsCount: number;
    overallCoveragePercent: number;
    lastSyncTimestamp: string;
    activeSatelliteConstellation: string;
  };
  users: User[];
  regions: MonitoringRegion[];
  observations: SatelliteObservation[];
  vegetationIndices: VegetationIndexSummary[];
  signals: EnvironmentalSignal[];
  riskWeights: RiskWeights;
  assessments: RiskAssessment[];
  alerts: Alert[];
  investigations: Investigation[];
  evidence: EvidenceRecord[];
  dataSources: DataSourceStatus[];
  auditLogs: AuditLog[];
}

export interface AnalystStructuredResponse {
  answer: string;
  keyFindings: string[];
  evidenceCitations: {
    sourceType: string;
    referenceId: string;
    detail: string;
  }[];
  missingDataCaveats: string[];
  recommendedNextSteps: string[];
  confidenceStatement: string;
  modelUsed: string;
  generatedAt: string;
}
