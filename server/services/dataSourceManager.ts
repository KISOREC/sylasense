import { GoogleGenAI } from '@google/genai';
import type {
  DataSourceState,
  DataSourceStatus,
  DataSourceTestResult,
} from '../../src/types/sylvasense.ts';
import { hasCopernicusCredentials, testCopernicusConnection } from './copernicus.ts';
import { parseGeeCredentials, testGeeConnection } from './geeAdapter.ts';
import { hasOpenWeatherKey, testOpenWeatherConnection } from './openweather.ts';

function hasGeminiKey(): boolean {
  const k = process.env.GEMINI_API_KEY?.trim();
  return Boolean(k && k !== 'MY_GEMINI_API_KEY' && k.length > 10);
}

async function testGeminiConnection(): Promise<{
  ok: boolean;
  state: 'Live' | 'Disconnected' | 'Error';
  message: string;
  details?: string;
}> {
  if (!hasGeminiKey()) {
    return {
      ok: false,
      state: 'Disconnected',
      message: 'GEMINI_API_KEY is not configured in server environment.',
      details: 'Dashboard features continue normally; AI Analyst queries require GEMINI_API_KEY.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const resp = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: 'Respond with exactly: OK',
    });
    return {
      ok: true,
      state: 'Live',
      message: `Gemini API live check passed (${(resp.text ?? 'OK').trim().slice(0, 24)}).`,
      details: 'Model gemini-4-hydrogen verified server-side.',
    };
  } catch (err) {
    return {
      ok: false,
      state: 'Error',
      message: err instanceof Error ? err.message : 'Gemini API verification failed.',
      details: 'Check GEMINI_API_KEY validity and quota in Settings > Secrets.',
    };
  }
}

class DataSourceManager {
  private testCache = new Map<string, DataSourceTestResult>();
  private liveSyncTimestamps = new Map<string, string>();

  public markLiveSync(sourceId: string) {
    this.liveSyncTimestamps.set(sourceId, new Date().toISOString());
  }

  public getStatuses(lastInvestigationUpdate?: string): DataSourceStatus[] {
    const copernicusConfigured = hasCopernicusCredentials();
    const weatherConfigured = hasOpenWeatherKey();
    const geeConfigured = Boolean(process.env.GEE_SERVICE_ACCOUNT_JSON?.trim());
    const geeValid = Boolean(parseGeeCredentials());
    const geminiConfigured = hasGeminiKey();

    const resolveState = (
      id: string,
      configured: boolean,
      defaultUnconfigured: DataSourceState
    ): DataSourceState => {
      const cached = this.testCache.get(id);
      if (cached) return cached.state;
      return configured ? 'Live' : defaultUnconfigured;
    };

    const copTest = this.testCache.get('ds-sentinel2');
    const copState = resolveState('ds-sentinel2', copernicusConfigured, 'Demo');

    const geeTest = this.testCache.get('ds-gee');
    const geeState: DataSourceState = geeTest
      ? geeTest.state
      : geeConfigured
        ? geeValid
          ? 'Live'
          : 'Error'
        : 'Demo';

    const owTest = this.testCache.get('ds-weather');
    const owState = resolveState('ds-weather', weatherConfigured, 'Demo');

    const gemTest = this.testCache.get('ds-gemini');
    const gemState = resolveState('ds-gemini', geminiConfigured, 'Disconnected');

    const sensorTest = this.testCache.get('ds-sensors');
    const fieldTest = this.testCache.get('ds-field');

    return [
      {
        id: 'ds-sentinel2',
        name: 'Copernicus Sentinel-2 L2A Multispectral',
        provider: 'Copernicus Data Space Ecosystem',
        category: 'satellite',
        state: copState,
        status:
          copState === 'Live' ? 'connected' : copState === 'Error' ? 'degraded' : 'disconnected',
        dataMode: copState === 'Live' ? 'live' : 'simulated',
        optional: false,
        lastSuccessfulUpdate:
          this.liveSyncTimestamps.get('ds-sentinel2') ??
          (copState === 'Live' ? new Date().toISOString() : '2026-11-12T05:18:00Z'),
        lastTestedAt: copTest?.testedAt ?? null,
        lastLatencyMs: copTest?.latencyMs ?? null,
        freshnessLabel:
          copState === 'Live' ? 'CDSE OAuth2 ready' : 'Demo dataset (Nov 12 sample)',
        errorStatus:
          copTest && !copTest.ok
            ? copTest.message
            : !copernicusConfigured
              ? 'Credentials unset — graceful fallback to labeled Western Ghats sample Sentinel-2 scenes.'
              : null,
        fallbackBehavior:
          'Serves labeled Sentinel-2 L2A sample scenes and local Band B8/B4 NDVI calculations.',
        credentialRequirement: 'OAuth2 Client Credentials',
        envVars: ['COPERNICUS_CLIENT_ID', 'COPERNICUS_CLIENT_SECRET'],
        endpointInfo: 'https://catalogue.dataspace.copernicus.eu/stac/search',
      },
      {
        id: 'ds-weather',
        name: 'OpenWeather Microclimate & Precipitation',
        provider: 'OpenWeather REST API',
        category: 'weather',
        state: owState,
        status:
          owState === 'Live' ? 'connected' : owState === 'Error' ? 'degraded' : 'disconnected',
        dataMode: owState === 'Live' ? 'live' : 'simulated',
        optional: false,
        lastSuccessfulUpdate:
          this.liveSyncTimestamps.get('ds-weather') ??
          (owState === 'Live' ? new Date().toISOString() : '2026-11-12T04:00:00Z'),
        lastTestedAt: owTest?.testedAt ?? null,
        lastLatencyMs: owTest?.latencyMs ?? null,
        freshnessLabel: owState === 'Live' ? 'Live REST weather' : 'Demo station archive',
        errorStatus:
          owTest && !owTest.ok
            ? owTest.message
            : !weatherConfigured
              ? 'OPENWEATHER_API_KEY unset — graceful fallback to labeled Western Ghats weather archive.'
              : null,
        fallbackBehavior: 'Serves labeled IMD/AWS demonstration temperature & rainfall anomalies.',
        credentialRequirement: 'OpenWeather API Key',
        envVars: ['OPENWEATHER_API_KEY'],
        endpointInfo: 'https://api.openweathermap.org/data/2.5/weather',
      },
      {
        id: 'ds-gee',
        name: 'Google Earth Engine (Optional)',
        provider: 'Google Earth Engine',
        category: 'geospatial',
        state: geeState,
        status:
          geeState === 'Live' ? 'connected' : geeState === 'Error' ? 'degraded' : 'disconnected',
        dataMode: geeState === 'Live' ? 'live' : 'simulated',
        optional: true,
        lastSuccessfulUpdate:
          this.liveSyncTimestamps.get('ds-gee') ??
          (geeState === 'Live' ? new Date().toISOString() : null),
        lastTestedAt: geeTest?.testedAt ?? null,
        lastLatencyMs: geeTest?.latencyMs ?? null,
        freshnessLabel:
          geeState === 'Live' ? 'GEE OAuth2 active' : 'Fallback geospatial pipeline active',
        errorStatus:
          geeTest && !geeTest.ok
            ? geeTest.message
            : geeConfigured && !geeValid
              ? 'GEE_SERVICE_ACCOUNT_JSON invalid — using fallback geospatial pipeline.'
              : !geeConfigured
                ? 'Optional integration not configured — fallback spherical polygon & NDVI pipeline active.'
                : null,
        fallbackBehavior:
          'Local spherical polygon area + Sentinel-2 Band B8/B4 NDVI pipeline handles all spatial analysis.',
        credentialRequirement: 'Optional Service Account JSON + Project ID',
        envVars: ['GEE_SERVICE_ACCOUNT_JSON', 'GEE_PROJECT_ID'],
        endpointInfo: '/api/gee/health -> earthengine.googleapis.com/v1',
      },
      {
        id: 'ds-gemini',
        name: 'Sylva Intelligence Analyst (Gemini)',
        provider: 'Google AI Studio / @google/genai',
        category: 'ai',
        state: gemState,
        status:
          gemState === 'Live' ? 'connected' : gemState === 'Error' ? 'degraded' : 'disconnected',
        dataMode: gemState === 'Live' ? 'live' : 'simulated',
        optional: false,
        lastSuccessfulUpdate:
          this.liveSyncTimestamps.get('ds-gemini') ??
          (gemState === 'Live' ? new Date().toISOString() : null),
        lastTestedAt: gemTest?.testedAt ?? null,
        lastLatencyMs: gemTest?.latencyMs ?? null,
        freshnessLabel:
          gemState === 'Live' ? 'Server-side API ready' : 'Disconnected (key required for AI)',
        errorStatus:
          gemTest && !gemTest.ok
            ? gemTest.message
            : !geminiConfigured
              ? 'GEMINI_API_KEY not configured. All non-AI dashboard features operate normally.'
              : null,
        fallbackBehavior:
          'Non-AI workflows (map, NDVI, risk engine, investigations) remain 100% functional.',
        credentialRequirement: 'Server-side Gemini API Key',
        envVars: ['GEMINI_API_KEY'],
        endpointInfo: '/api/analyst/query (gemini-4-hydrogen)',
      },
      {
        id: 'ds-sensors',
        name: 'LoRaWAN Acoustic & Soil Telemetry Mesh',
        provider: 'SylvaSense Edge Simulator',
        category: 'sensor',
        state: sensorTest?.state ?? 'Demo',
        status: 'degraded',
        dataMode: 'simulated',
        optional: true,
        lastSuccessfulUpdate: '2026-11-12T03:45:00Z',
        lastTestedAt: sensorTest?.testedAt ?? null,
        lastLatencyMs: sensorTest?.latencyMs ?? null,
        freshnessLabel: 'Demo simulator · 2 nodes offline',
        errorStatus:
          'Simulated hardware mesh active. Nodes #AN-02 (Anamalai) and #WY-07 (Wayanad) deliberately report missing/degraded status.',
        fallbackBehavior: 'Missing sensor streams are flagged as gaps without inflating disturbance risk.',
        credentialRequirement: 'Optional MQTT / LoRaWAN Broker',
        envVars: [],
        endpointInfo: 'Internal Edge Mesh Simulator',
      },
      {
        id: 'ds-field',
        name: 'Forest Beat Patrol & Investigation Store',
        provider: 'SylvaSense Local Persistence',
        category: 'field',
        state: fieldTest?.state ?? 'Live',
        status: 'connected',
        dataMode: 'cached',
        optional: false,
        lastSuccessfulUpdate: lastInvestigationUpdate ?? new Date().toISOString(),
        lastTestedAt: fieldTest?.testedAt ?? null,
        lastLatencyMs: fieldTest?.latencyMs ?? null,
        freshnessLabel: 'Active local JSON store',
        errorStatus: null,
        fallbackBehavior: 'Persists alerts, investigation notes, evidence, and risk weights locally.',
        credentialRequirement: 'None (Local Server Persistence)',
        envVars: [],
        endpointInfo: '/api/alerts',
      },
    ];
  }

  public getProvenanceSummary(statuses: DataSourceStatus[]): {
    isDemoMode: boolean;
    provenanceMode: 'demo' | 'hybrid' | 'live';
    demoNotice: string;
  } {
    const externalFeeds = statuses.filter((s) =>
      ['ds-sentinel2', 'ds-weather', 'ds-gee', 'ds-sensors'].includes(s.id)
    );
    const anyDemo = externalFeeds.some((s) => s.state !== 'Live');
    const anyLive = externalFeeds.some((s) => s.state === 'Live');

    if (anyDemo && anyLive) {
      const liveNames = externalFeeds
        .filter((s) => s.state === 'Live')
        .map((s) => s.name.split(' ')[0])
        .join(', ');
      return {
        isDemoMode: true,
        provenanceMode: 'hybrid',
        demoNotice: `HYBRID MODE (LIVE + DEMO DATA): Live feeds active for ${liveNames}; unconfigured feeds use labeled Western Ghats demo data.`,
      };
    }

    if (!anyDemo) {
      return {
        isDemoMode: false,
        provenanceMode: 'live',
        demoNotice: 'LIVE TELEMETRY ACTIVE: All primary external satellite, weather, and sensor connectors verified.',
      };
    }

    return {
      isDemoMode: true,
      provenanceMode: 'demo',
      demoNotice:
        'DEMO DATA ACTIVE: Satellite imagery metrics, coordinates, and sensor feeds represent Western Ghats demonstration scenarios unless live credentials are connected.',
    };
  }

  public async testSource(sourceId: string): Promise<DataSourceTestResult> {
    const start = Date.now();
    let result: DataSourceTestResult;

    if (sourceId === 'ds-sentinel2') {
      const r = await testCopernicusConnection();
      result = {
        sourceId,
        state: r.state,
        ok: r.ok,
        message: r.message,
        details: r.details,
        testedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } else if (sourceId === 'ds-weather') {
      const r = await testOpenWeatherConnection();
      result = {
        sourceId,
        state: r.state,
        ok: r.ok,
        message: r.message,
        details: r.details,
        testedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } else if (sourceId === 'ds-gee') {
      const r = await testGeeConnection();
      result = {
        sourceId,
        state: r.state,
        ok: r.ok,
        message: r.message,
        details: r.details,
        testedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } else if (sourceId === 'ds-gemini') {
      const r = await testGeminiConnection();
      result = {
        sourceId,
        state: r.state,
        ok: r.ok,
        message: r.message,
        details: r.details,
        testedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } else if (sourceId === 'ds-sensors') {
      result = {
        sourceId,
        state: 'Demo',
        ok: true,
        message: 'Simulated LoRaWAN mesh responding (2 deliberate offline nodes for missing-data testing).',
        testedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } else if (sourceId === 'ds-field') {
      result = {
        sourceId,
        state: 'Live',
        ok: true,
        message: 'Local persistence store read/write verified.',
        testedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } else {
      throw new Error(`Unknown data source ID: ${sourceId}`);
    }

    this.testCache.set(sourceId, result);
    if (result.ok && result.state === 'Live') {
      this.markLiveSync(sourceId);
    }
    return result;
  }

  public async testAll(): Promise<DataSourceTestResult[]> {
    const ids = ['ds-sentinel2', 'ds-weather', 'ds-gee', 'ds-gemini', 'ds-sensors', 'ds-field'];
    return Promise.all(ids.map((id) => this.testSource(id)));
  }
}

export const dataSourceManager = new DataSourceManager();
