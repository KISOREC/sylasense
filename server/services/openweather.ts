import type { EnvironmentalSignal, MonitoringRegion } from '../../src/types/sylvasense.ts';

const OPENWEATHER_CURRENT_URL = 'https://api.openweathermap.org/data/2.5/weather';

export interface OpenWeatherSyncResult {
  mode: 'Live' | 'Demo';
  updatedSignals: EnvironmentalSignal[];
  message: string;
  error?: string;
}

export function hasOpenWeatherKey(): boolean {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  return Boolean(key && key.length > 8 && key !== 'MY_OPENWEATHER_API_KEY');
}

async function fetchOpenWeatherAtCoord(lat: number, lng: number) {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY is not configured.');
  }

  const url = `${OPENWEATHER_CURRENT_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
    lng
  )}&units=metric&appid=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as {
      cod?: number | string;
      message?: string;
      name?: string;
      main?: { temp?: number; humidity?: number };
      rain?: { '1h'?: number; '3h'?: number };
      weather?: Array<{ description?: string }>;
    };

    if (!res.ok) {
      throw new Error(data.message || `OpenWeather API error (HTTP ${res.status}).`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function testOpenWeatherConnection(): Promise<{
  ok: boolean;
  state: 'Live' | 'Disconnected' | 'Error';
  message: string;
  details?: string;
}> {
  if (!hasOpenWeatherKey()) {
    return {
      ok: false,
      state: 'Disconnected',
      message: 'OPENWEATHER_API_KEY is not configured.',
      details: 'Operating in labeled Demo mode using Western Ghats sample weather archive.',
    };
  }

  try {
    // Probe Nilgiris coordinates on the backend
    const data = await fetchOpenWeatherAtCoord(11.4102, 76.695);
    const temp = data.main?.temp;
    const desc = data.weather?.[0]?.description ?? 'telemetry active';
    return {
      ok: true,
      state: 'Live',
      message: `Connected to OpenWeather API (${temp !== undefined ? `${temp.toFixed(1)}°C` : 'OK'}, ${desc}).`,
      details: 'Real-time regional temperature and precipitation feeds available.',
    };
  } catch (err) {
    return {
      ok: false,
      state: 'Error',
      message: err instanceof Error ? err.message : 'OpenWeather connection check failed.',
      details: 'Fallback active: serving labeled sample weather signals.',
    };
  }
}

export async function syncRegionWeatherSignals(
  region: MonitoringRegion,
  existingSignals: EnvironmentalSignal[]
): Promise<OpenWeatherSyncResult> {
  const regionFallback = existingSignals.filter(
    (s) =>
      s.regionId === region.id &&
      (s.category === 'temperature' || s.category === 'rainfall_variation')
  );

  if (!hasOpenWeatherKey()) {
    return {
      mode: 'Demo',
      updatedSignals: regionFallback,
      message:
        'OPENWEATHER_API_KEY not configured — retaining labeled Western Ghats demo weather signals.',
    };
  }

  try {
    const data = await fetchOpenWeatherAtCoord(region.centerLat, region.centerLng);
    const nowIso = new Date().toISOString();
    const tempC = data.main?.temp ?? 22.0;
    const humidity = data.main?.humidity ?? 70;
    const rainMm = data.rain?.['1h'] ?? data.rain?.['3h'] ?? 0;
    const condition = data.weather?.[0]?.description ?? 'clear';

    // Western Ghats montane mean baseline ~21°C
    const tempDelta = Math.round((tempC - 21.0) * 10) / 10;
    const tempAnomalyScore = Math.min(1, Math.max(0.05, tempDelta > 0 ? tempDelta / 6 : 0.1));
    const rainAnomalyScore = rainMm === 0 && humidity < 55 ? 0.52 : rainMm > 0 ? 0.1 : 0.25;

    const updatedSignals: EnvironmentalSignal[] = [
      {
        id: `sig-ow-temp-${region.id}`,
        regionId: region.id,
        category: 'temperature',
        label: 'Ambient Air Temperature (Live)',
        source: `OpenWeather (${data.name || region.district})`,
        timestamp: nowIso,
        lat: region.centerLat,
        lng: region.centerLng,
        measuredValue: `${tempC.toFixed(1)}`,
        unit: '°C',
        baselineComparison: `${tempDelta >= 0 ? '+' : ''}${tempDelta.toFixed(1)}°C vs 21°C montane norm (${condition})`,
        anomalyScore: Math.round(tempAnomalyScore * 100) / 100,
        dataQuality: 'high',
        confidence: 0.9,
        availabilityStatus: 'available',
        dataMode: 'live',
      },
      {
        id: `sig-ow-rain-${region.id}`,
        regionId: region.id,
        category: 'rainfall_variation',
        label: 'Precipitation & Humidity (Live)',
        source: `OpenWeather (${data.name || region.district})`,
        timestamp: nowIso,
        lat: region.centerLat,
        lng: region.centerLng,
        measuredValue: `${rainMm.toFixed(1)} mm · ${humidity}% RH`,
        unit: '1h precip',
        baselineComparison: rainMm > 0 ? 'Active rainfall detected' : 'Dry current interval',
        anomalyScore: Math.round(rainAnomalyScore * 100) / 100,
        dataQuality: 'high',
        confidence: 0.88,
        availabilityStatus: 'available',
        dataMode: 'live',
      },
    ];

    return {
      mode: 'Live',
      updatedSignals,
      message: `Synced live OpenWeather telemetry for ${region.name}: ${tempC.toFixed(1)}°C, ${humidity}% RH (${condition}).`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'OpenWeather sync failed.';
    return {
      mode: 'Demo',
      updatedSignals: regionFallback,
      message: `OpenWeather sync failed (${errMsg}) — fell back gracefully to demo signals.`,
      error: errMsg,
    };
  }
}
