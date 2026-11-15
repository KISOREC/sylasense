import type { MonitoringRegion, SatelliteObservation } from '../../src/types/sylvasense.ts';
import { computeSentinel2Ndvi } from './ndvi.ts';

const CDSE_TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const CDSE_STAC_URL = 'https://catalogue.dataspace.copernicus.eu/stac/search';

export interface CopernicusSyncResult {
  mode: 'Live' | 'Demo';
  observation: SatelliteObservation | null;
  sceneCount: number;
  message: string;
  error?: string;
}

export function hasCopernicusCredentials(): boolean {
  const id = process.env.COPERNICUS_CLIENT_ID?.trim();
  const secret = process.env.COPERNICUS_CLIENT_SECRET?.trim();
  return Boolean(id && secret && id.length > 4 && secret.length > 4);
}

async function fetchCopernicusToken(): Promise<string> {
  const clientId = process.env.COPERNICUS_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET?.trim() ?? '';

  if (!clientId || !clientSecret) {
    throw new Error('Missing COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET.');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(CDSE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error_description?: string;
      error?: string;
    };

    if (!res.ok || !data.access_token) {
      throw new Error(
        data.error_description || data.error || `CDSE OAuth2 rejected credentials (HTTP ${res.status}).`
      );
    }
    return data.access_token;
  } finally {
    clearTimeout(timer);
  }
}

export async function testCopernicusConnection(): Promise<{
  ok: boolean;
  state: 'Live' | 'Disconnected' | 'Error';
  message: string;
  details?: string;
}> {
  if (!hasCopernicusCredentials()) {
    return {
      ok: false,
      state: 'Disconnected',
      message: 'COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET are not configured.',
      details: 'Operating in labeled Demo mode using Western Ghats Sentinel-2 sample archive.',
    };
  }

  try {
    await fetchCopernicusToken();
    return {
      ok: true,
      state: 'Live',
      message: 'Authenticated with Copernicus Data Space Ecosystem (CDSE OAuth2).',
      details: 'Sentinel-2 L2A STAC catalog queries are live.',
    };
  } catch (err) {
    return {
      ok: false,
      state: 'Error',
      message: err instanceof Error ? err.message : 'Copernicus authentication failed.',
      details: 'Fallback active: serving labeled sample Sentinel-2 observations.',
    };
  }
}

export async function fetchRegionSentinel2Scene(
  region: MonitoringRegion,
  fallbackObservation: SatelliteObservation | undefined
): Promise<CopernicusSyncResult> {
  if (!hasCopernicusCredentials()) {
    return {
      mode: 'Demo',
      observation: fallbackObservation ?? null,
      sceneCount: fallbackObservation ? 1 : 0,
      message:
        'Copernicus credentials not configured — returning labeled Western Ghats Sentinel-2 sample scene.',
    };
  }

  try {
    const token = await fetchCopernicusToken();
    const lats = region.boundary.map((p) => p[0]);
    const lngs = region.boundary.map((p) => p[1]);
    const bbox = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];

    const endIso = new Date().toISOString();
    const startIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const stacRes = await fetch(CDSE_STAC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          collections: ['SENTINEL-2'],
          bbox,
          datetime: `${startIso}/${endIso}`,
          limit: 5,
        }),
        signal: controller.signal,
      });

      if (!stacRes.ok) {
        throw new Error(`Copernicus STAC search failed (HTTP ${stacRes.status}).`);
      }

      const stacData = (await stacRes.json()) as {
        features?: Array<{
          id?: string;
          properties?: {
            datetime?: string;
            'eo:cloud_cover'?: number;
            platform?: string;
            'product:type'?: string;
          };
        }>;
      };

      const features = stacData.features ?? [];
      if (features.length === 0) {
        return {
          mode: 'Live',
          observation: fallbackObservation ?? null,
          sceneCount: 0,
          message: `Connected to Copernicus STAC: 0 new scenes found in last 30 days for ${region.code}; retaining baseline telemetry.`,
        };
      }

      const best = features[0];
      const cloudCover = Number(best.properties?.['eo:cloud_cover'] ?? 12);
      const acquiredAt = best.properties?.datetime ?? new Date().toISOString();
      const baseRed = fallbackObservation?.bandB4Red ?? 0.065;
      const baseNir = fallbackObservation?.bandB8Nir ?? 0.405;
      const qualityFlag: SatelliteObservation['qualityFlag'] =
        cloudCover >= 40 ? 'occluded' : cloudCover >= 20 ? 'partial_cloud' : 'nominal';

      const liveObs: SatelliteObservation = {
        id: `obs-cdse-${Date.now()}`,
        regionId: region.id,
        sensor: `${best.properties?.platform ?? 'Sentinel-2'} (${best.properties?.['product:type'] ?? 'L2A'})`,
        tileId: (best.id ?? 'CDSE-SCENE').slice(0, 26),
        acquiredAt,
        cloudCoverPercent: Math.round(cloudCover * 10) / 10,
        bandB4Red: baseRed,
        bandB8Nir: baseNir,
        calculatedNdvi: computeSentinel2Ndvi({
          bandB4Red: baseRed,
          bandB8Nir: baseNir,
          cloudCoverPercent: cloudCover,
        }).ndvi,
        qualityFlag,
        dataMode: 'live',
        notes: `Live Copernicus STAC catalog scene (${features.length} scenes in 30d window). Reflectance calibration awaits Statistical API raster fetch.`,
      };

      return {
        mode: 'Live',
        observation: liveObs,
        sceneCount: features.length,
        message: `Retrieved ${features.length} live Sentinel-2 catalog scene(s) from Copernicus CDSE for ${region.name}.`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Copernicus request failed.';
    return {
      mode: 'Demo',
      observation: fallbackObservation ?? null,
      sceneCount: 0,
      message: `Copernicus live query failed (${errMsg}) — fell back gracefully to labeled demo observation.`,
      error: errMsg,
    };
  }
}
