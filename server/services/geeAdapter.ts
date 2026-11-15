import crypto from 'node:crypto';
import type { MonitoringRegion } from '../../src/types/sylvasense.ts';
import { computeSentinel2Ndvi } from './ndvi.ts';

interface GeeServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface GeeHealthStatus {
  ok: boolean;
  state: 'Live' | 'Disconnected' | 'Error';
  demoMode: boolean;
  fallbackActive: boolean;
  configured: boolean;
  projectIdConfigured: boolean;
  message: string;
  details?: string;
  latencyMs: number;
}

function decodeGeeJson(rawValue: string): Partial<GeeServiceAccount> | null {
  const cleaned = rawValue.trim();
  if (!cleaned) return null;

  const candidates = [cleaned];
  if (!cleaned.startsWith('{')) {
    try {
      candidates.push(Buffer.from(cleaned, 'base64').toString('utf-8').trim());
    } catch {
      // Ignore base64 decode errors
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<GeeServiceAccount>;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function parseGeeCredentials(): (GeeServiceAccount & { resolvedProjectId: string }) | null {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw || raw.length < 20) return null;

  const parsed = decodeGeeJson(raw);
  if (!parsed?.client_email || !parsed?.private_key) {
    return null;
  }

  const envProjectId = process.env.GEE_PROJECT_ID?.trim();
  const resolvedProjectId = envProjectId || parsed.project_id?.trim() || '';
  if (!resolvedProjectId) {
    return null;
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    project_id: parsed.project_id,
    resolvedProjectId,
  };
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function checkGeeHealth(): Promise<GeeHealthStatus> {
  const started = Date.now();
  const rawJson = process.env.GEE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
  const envProjectId = process.env.GEE_PROJECT_ID?.trim() ?? '';

  // Optional delegation to FastAPI GEE microservice if configured
  const fastapiUrl = process.env.FASTAPI_GEE_URL?.trim();
  if (fastapiUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(`${fastapiUrl.replace(/\/$/, '')}/api/gee/health`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const remote = (await res.json()) as GeeHealthStatus;
        return {
          ...remote,
          latencyMs: remote.latencyMs ?? Date.now() - started,
        };
      }
    } catch {
      // Fall through to local server-side check cleanly without logging secrets
    } finally {
      clearTimeout(timer);
    }
  }

  if (!rawJson) {
    return {
      ok: false,
      state: 'Disconnected',
      demoMode: true,
      fallbackActive: true,
      configured: false,
      projectIdConfigured: Boolean(envProjectId),
      message:
        'Optional GEE_SERVICE_ACCOUNT_JSON is not configured. Preserving Demo mode.',
      details: 'Fallback geospatial processing pipeline active (local NDVI & polygon engine).',
      latencyMs: Date.now() - started,
    };
  }

  const decoded = decodeGeeJson(rawJson);
  if (!decoded || !decoded.client_email || !decoded.private_key) {
    return {
      ok: false,
      state: 'Error',
      demoMode: true,
      fallbackActive: true,
      configured: true,
      projectIdConfigured: Boolean(envProjectId),
      message:
        'GEE_SERVICE_ACCOUNT_JSON is malformed or missing required service account fields.',
      details: 'Fallback geospatial processing pipeline remains active in Demo mode.',
      latencyMs: Date.now() - started,
    };
  }

  const projectId = envProjectId || decoded.project_id?.trim() || '';
  if (!projectId) {
    return {
      ok: false,
      state: 'Error',
      demoMode: true,
      fallbackActive: true,
      configured: true,
      projectIdConfigured: false,
      message:
        'GEE_PROJECT_ID is not configured and no project_id was found in service account credentials.',
      details: 'Set GEE_PROJECT_ID in server environment. Fallback geospatial pipeline active.',
      latencyMs: Date.now() - started,
    };
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(
      JSON.stringify({
        iss: decoded.client_email,
        scope: 'https://www.googleapis.com/auth/earthengine.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 300,
      })
    );

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = base64Url(sign.sign(decoded.private_key));
    const assertion = `${header}.${payload}.${signature}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: controller.signal,
      });

      const tokenData = (await tokenRes.json().catch(() => ({}))) as {
        access_token?: string;
        error?: string;
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error || `OAuth2 token exchange failed (HTTP ${tokenRes.status}).`);
      }

      // Verify Earth Engine API access using projects.algorithms.list (matches ee.Initialize)
      const eeRes = await fetch(
        `https://earthengine.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/algorithms`,
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
          signal: controller.signal,
        }
      );

      if (!eeRes.ok) {
        const eeErr = (await eeRes.json().catch(() => ({}))) as {
          error?: { message?: string; status?: string };
        };
        const detail = eeErr.error?.message || `HTTP ${eeRes.status}`;
        throw new Error(`Earth Engine API check failed (${detail}).`);
      }

      return {
        ok: true,
        state: 'Live',
        demoMode: false,
        fallbackActive: false,
        configured: true,
        projectIdConfigured: true,
        message: 'Google Earth Engine service account authenticated and project verified.',
        details: 'Earth Engine readonly API probe succeeded.',
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Sanitize error so no credential material ever leaks to logs or client
    const safeReason =
      err instanceof Error ? err.message.replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, '[REDACTED]') : 'GEE auth error';
    return {
      ok: false,
      state: 'Error',
      demoMode: true,
      fallbackActive: true,
      configured: true,
      projectIdConfigured: Boolean(projectId),
      message: `Earth Engine authentication failed: ${safeReason}`,
      details: 'Preserving Demo mode via fallback geospatial processing pipeline.',
      latencyMs: Date.now() - started,
    };
  }
}

export async function testGeeConnection(): Promise<{
  ok: boolean;
  state: 'Live' | 'Disconnected' | 'Error';
  message: string;
  details?: string;
}> {
  const health = await checkGeeHealth();
  return {
    ok: health.ok,
    state: health.state,
    message: health.message,
    details: health.details,
  };
}

/**
 * Fallback Geospatial Processing Pipeline (runs locally with zero external dependencies)
 * Computes geodesic polygon bounding box, approximate spherical polygon area (ha),
 * and deterministic Sentinel-2 Band B8/B4 NDVI statistics.
 */
export function runFallbackGeospatialPipeline(params: {
  region: MonitoringRegion;
  bandB8Nir: number;
  bandB4Red: number;
  cloudCoverPercent: number;
}) {
  const { region, bandB8Nir, bandB4Red, cloudCoverPercent } = params;
  const lats = region.boundary.map((p) => p[0]);
  const lngs = region.boundary.map((p) => p[1]);

  const R = 6371000;
  let areaSqM = 0;
  const ring = region.boundary;
  if (ring.length >= 3) {
    for (let i = 0; i < ring.length; i++) {
      const [lat1, lng1] = ring[i];
      const [lat2, lng2] = ring[(i + 1) % ring.length];
      const phi1 = (lat1 * Math.PI) / 180;
      const phi2 = (lat2 * Math.PI) / 180;
      const dLambda = ((lng2 - lng1) * Math.PI) / 180;
      areaSqM += dLambda * (2 + Math.sin(phi1) + Math.sin(phi2));
    }
    areaSqM = Math.abs((areaSqM * R * R) / 2);
  }

  const ndviResult = computeSentinel2Ndvi({
    bandB8Nir,
    bandB4Red,
    cloudCoverPercent,
  });

  return {
    pipeline: 'Local Fallback Geospatial Pipeline (Spherical + Sentinel-2 Band Engine)',
    regionCode: region.code,
    bbox: [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ],
    computedFootprintHa: Math.round(areaSqM / 10000),
    ...ndviResult,
  };
}
