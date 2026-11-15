import crypto from 'node:crypto';
import type { MonitoringRegion } from '../../src/types/sylvasense.ts';
import { computeSentinel2Ndvi } from './ndvi.ts';

interface GeeServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export function parseGeeCredentials(): GeeServiceAccount | null {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw || raw.length < 20) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GeeServiceAccount>;
    if (parsed.client_email && parsed.private_key) {
      return parsed as GeeServiceAccount;
    }
    return null;
  } catch {
    return null;
  }
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function testGeeConnection(): Promise<{
  ok: boolean;
  state: 'Live' | 'Disconnected' | 'Error';
  message: string;
  details?: string;
}> {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return {
      ok: false,
      state: 'Disconnected',
      message: 'Optional GEE_SERVICE_ACCOUNT_JSON not configured.',
      details: 'Fallback geospatial processing pipeline active (local NDVI & polygon engine).',
    };
  }

  const creds = parseGeeCredentials();
  if (!creds) {
    return {
      ok: false,
      state: 'Error',
      message: 'GEE_SERVICE_ACCOUNT_JSON is present but invalid JSON or missing client_email/private_key.',
      details: 'Fallback geospatial processing pipeline active.',
    };
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(
      JSON.stringify({
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/earthengine.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 300,
      })
    );

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = base64Url(sign.sign(creds.private_key));
    const assertion = `${header}.${payload}.${signature}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        error_description?: string;
        error?: string;
      };

      if (!res.ok || !data.access_token) {
        throw new Error(data.error_description || data.error || `OAuth2 HTTP ${res.status}`);
      }

      return {
        ok: true,
        state: 'Live',
        message: `GEE Service Account verified (${creds.project_id ?? creds.client_email}).`,
        details: 'Earth Engine readonly scope token acquired.',
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      ok: false,
      state: 'Error',
      message: err instanceof Error ? err.message : 'GEE token exchange failed.',
      details: 'Fallback geospatial processing pipeline remains active.',
    };
  }
}

/**
 * Fallback Geospatial Processing Pipeline (runs locally with zero external dependencies)
 * Computes geodesic polygon bounding box, approximate spherical polygon area (km² & ha),
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

  // Spherical excess approximation for polygon area in hectares
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
