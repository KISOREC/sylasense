import { Router } from 'express';
import { db } from '../db.ts';
import { querySylvaAnalyst } from '../services/geminiAnalyst.ts';
import { computeSentinel2Ndvi } from '../services/ndvi.ts';
import { DEFAULT_RISK_WEIGHTS } from '../services/riskEngine.ts';
import { dataSourceManager } from '../services/dataSourceManager.ts';
import { checkGeeHealth } from '../services/geeAdapter.ts';
import type { Alert, EvidenceRecord, RiskWeights } from '../../src/types/sylvasense.ts';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sylvasense-api', timestamp: new Date().toISOString() });
});

apiRouter.get('/gee/health', async (_req, res) => {
  const status = await checkGeeHealth();
  res.json(status);
});

apiRouter.get('/snapshot', (_req, res) => {
  res.json(db.getSnapshot());
});

apiRouter.get('/datasources', (_req, res) => {
  const dataSources = db.getDataSources();
  const provenance = dataSourceManager.getProvenanceSummary(dataSources);
  res.json({ dataSources, provenance });
});

apiRouter.post('/datasources/test-all', async (_req, res) => {
  try {
    const results = await dataSourceManager.testAll();
    db.addAuditLog({
      actor: 'Data Source Manager',
      action: 'Executed connection diagnostics across all 6 integrations',
      targetType: 'datasource',
      targetId: 'all',
      detail: results.map((r) => `${r.sourceId}: ${r.state}`).join(' · '),
    });
    res.json({ results, snapshot: db.getSnapshot() });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to test data sources.',
    });
  }
});

apiRouter.post('/datasources/:id/test', async (req, res) => {
  try {
    const result = await dataSourceManager.testSource(req.params.id);
    db.addAuditLog({
      actor: 'Data Source Manager',
      action: `Tested connector ${req.params.id} (${result.state})`,
      targetType: 'datasource',
      targetId: req.params.id,
      detail: result.message,
    });
    res.json({ result, snapshot: db.getSnapshot() });
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : 'Data source not found.',
    });
  }
});

apiRouter.post('/regions/:regionId/sync-satellite', async (req, res) => {
  try {
    const payload = await db.syncRegionSatellite(req.params.regionId);
    res.json(payload);
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : 'Satellite sync failed.',
    });
  }
});

apiRouter.post('/regions/:regionId/sync-weather', async (req, res) => {
  try {
    const payload = await db.syncRegionWeather(req.params.regionId);
    res.json(payload);
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : 'Weather sync failed.',
    });
  }
});

apiRouter.post('/ndvi/calculate', (req, res) => {
  try {
    const { bandB8Nir, bandB4Red, previousNdvi, cloudCoverPercent } = req.body ?? {};
    if (bandB8Nir === undefined || bandB4Red === undefined) {
      return res.status(400).json({ error: 'Both bandB8Nir and bandB4Red reflectance values are required.' });
    }
    const result = computeSentinel2Ndvi({
      bandB8Nir: Number(bandB8Nir),
      bandB4Red: Number(bandB4Red),
      previousNdvi: previousNdvi !== undefined && previousNdvi !== '' ? Number(previousNdvi) : undefined,
      cloudCoverPercent: cloudCoverPercent !== undefined ? Number(cloudCoverPercent) : 0,
    });
    db.addAuditLog({
      actor: 'GIS Analyst',
      action: 'Executed Sentinel-2 NDVI spectral calculation',
      targetType: 'ndvi_calc',
      targetId: 'manual-eval',
      detail: result.formula,
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid NDVI parameters.' });
  }
});

apiRouter.post('/risk/recalculate', (req, res) => {
  try {
    const body = req.body ?? {};
    const weights: RiskWeights = {
      magnitude: Number(body.magnitude ?? DEFAULT_RISK_WEIGHTS.magnitude),
      persistence: Number(body.persistence ?? DEFAULT_RISK_WEIGHTS.persistence),
      environmentalContext: Number(body.environmentalContext ?? DEFAULT_RISK_WEIGHTS.environmentalContext),
      supportingObservations: Number(body.supportingObservations ?? DEFAULT_RISK_WEIGHTS.supportingObservations),
      dataQualityPenalty: Number(body.dataQualityPenalty ?? DEFAULT_RISK_WEIGHTS.dataQualityPenalty),
      uncertaintyPenalty: Number(body.uncertaintyPenalty ?? DEFAULT_RISK_WEIGHTS.uncertaintyPenalty),
    };

    for (const [k, v] of Object.entries(weights)) {
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        return res.status(400).json({ error: `Weight '${k}' must be a valid number between 0 and 1.` });
      }
    }

    const assessments = db.recalculateRisk(weights);
    return res.json({
      riskWeights: weights,
      assessments,
      snapshot: db.getSnapshot(),
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to recalculate risk.' });
  }
});

apiRouter.patch('/alerts/:alertId', (req, res) => {
  try {
    const { alertId } = req.params;
    const { status, assignedOfficer, verificationAction, noteText, author } = req.body ?? {};

    const validStatuses: Alert['status'][] = [
      'New',
      'Under Review',
      'Field Verification Required',
      'Verified',
      'Dismissed',
    ];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid investigation status value.' });
    }

    const updated = db.updateAlertAndInvestigation({
      alertId,
      status,
      assignedOfficer,
      verificationAction,
      noteText,
      author,
    });

    return res.json({
      ...updated,
      snapshot: db.getSnapshot(),
    });
  } catch (err) {
    return res.status(404).json({ error: err instanceof Error ? err.message : 'Alert update failed.' });
  }
});

apiRouter.post('/alerts/:alertId/evidence', (req, res) => {
  try {
    const { alertId } = req.params;
    const { kind, title, summary, source, recordedBy } = req.body ?? {};
    const validKinds: EvidenceRecord['kind'][] = [
      'satellite_spectral',
      'acoustic_clip',
      'weather_anomaly',
      'ranger_note',
      'soil_telemetry',
    ];
    if (!kind || !validKinds.includes(kind)) {
      return res.status(400).json({ error: 'Valid evidence kind is required.' });
    }
    if (!title || !summary) {
      return res.status(400).json({ error: 'Evidence title and summary are required.' });
    }

    const record = db.addEvidenceRecord({
      alertId,
      kind,
      title,
      summary,
      source: source || 'Field Verification Unit',
      recordedBy: recordedBy || 'Range Officer',
    });

    return res.status(201).json({
      record,
      snapshot: db.getSnapshot(),
    });
  } catch (err) {
    return res.status(404).json({ error: err instanceof Error ? err.message : 'Failed to attach evidence.' });
  }
});

apiRouter.post('/analyst/query', async (req, res) => {
  try {
    const { question, regionId, alertId } = req.body ?? {};
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Please enter a valid analytical question.' });
    }

    const snapshot = db.getSnapshot();
    const result = await querySylvaAnalyst({
      question: question.trim(),
      regionId: typeof regionId === 'string' && regionId ? regionId : undefined,
      alertId: typeof alertId === 'string' && alertId ? alertId : undefined,
      snapshot,
    });

    db.addAuditLog({
      actor: 'Sylva Intelligence Analyst',
      action: 'Generated evidence-grounded Gemini synthesis',
      targetType: 'ai_analyst',
      targetId: alertId || regionId || 'network',
      detail: question.trim().slice(0, 120),
    });

    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini Analyst request failed.';
    return res.status(503).json({ error: msg });
  }
});

apiRouter.post('/system/reset-demo', (_req, res) => {
  db.resetToSeed();
  res.json(db.getSnapshot());
});
