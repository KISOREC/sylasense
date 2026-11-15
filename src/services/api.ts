import type {
  Alert,
  AnalystStructuredResponse,
  DataSourceTestResult,
  EvidenceRecord,
  InvestigationStatus,
  RiskWeights,
  SatelliteObservation,
  SystemSnapshot,
} from '../types/sylvasense';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getSnapshot: (): Promise<SystemSnapshot> => requestJson<SystemSnapshot>('/api/snapshot'),

  testDataSource: (sourceId: string) =>
    requestJson<{ result: DataSourceTestResult; snapshot: SystemSnapshot }>(
      `/api/datasources/${encodeURIComponent(sourceId)}/test`,
      { method: 'POST' }
    ),

  testAllDataSources: () =>
    requestJson<{ results: DataSourceTestResult[]; snapshot: SystemSnapshot }>(
      '/api/datasources/test-all',
      { method: 'POST' }
    ),

  syncRegionSatellite: (regionId: string) =>
    requestJson<{
      mode: 'Live' | 'Demo';
      observation: SatelliteObservation | null;
      sceneCount: number;
      message: string;
      error?: string;
      geospatialFallback: {
        pipeline: string;
        computedFootprintHa: number;
        ndvi: number;
        formula: string;
      };
      snapshot: SystemSnapshot;
    }>(`/api/regions/${encodeURIComponent(regionId)}/sync-satellite`, { method: 'POST' }),

  syncRegionWeather: (regionId: string) =>
    requestJson<{
      mode: 'Live' | 'Demo';
      message: string;
      error?: string;
      snapshot: SystemSnapshot;
    }>(`/api/regions/${encodeURIComponent(regionId)}/sync-weather`, { method: 'POST' }),

  calculateNdvi: (payload: {
    bandB8Nir: number;
    bandB4Red: number;
    previousNdvi?: number;
    cloudCoverPercent?: number;
  }) =>
    requestJson<{
      ndvi: number;
      formula: string;
      vegetationClass: string;
      cloudQualityWarning: string | null;
      deltaFromPrevious: number | null;
      changePercent: number | null;
      isReliable: boolean;
    }>('/api/ndvi/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recalculateRisk: (weights: RiskWeights) =>
    requestJson<{ riskWeights: RiskWeights; snapshot: SystemSnapshot }>('/api/risk/recalculate', {
      method: 'POST',
      body: JSON.stringify(weights),
    }),

  updateAlert: (
    alertId: string,
    payload: {
      status?: InvestigationStatus;
      assignedOfficer?: string;
      verificationAction?: string;
      noteText?: string;
      author?: string;
    }
  ) =>
    requestJson<{ alert: Alert; snapshot: SystemSnapshot }>(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addEvidence: (
    alertId: string,
    payload: {
      kind: EvidenceRecord['kind'];
      title: string;
      summary: string;
      source: string;
      recordedBy: string;
    }
  ) =>
    requestJson<{ record: EvidenceRecord; snapshot: SystemSnapshot }>(
      `/api/alerts/${alertId}/evidence`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  queryAnalyst: (payload: { question: string; regionId?: string; alertId?: string }) =>
    requestJson<AnalystStructuredResponse>('/api/analyst/query', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetDemo: (): Promise<SystemSnapshot> =>
    requestJson<SystemSnapshot>('/api/system/reset-demo', { method: 'POST' }),
};
