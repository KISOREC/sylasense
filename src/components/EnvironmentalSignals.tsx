import React, { useMemo, useState } from 'react';
import { Activity, CloudOff, CloudSun, Radio } from 'lucide-react';
import { api } from '../services/api';
import type { AvailabilityStatus, SignalCategory, SystemSnapshot } from '../types/sylvasense';
import { formatCoord, formatTimestamp } from '../utils/formatters';

interface EnvironmentalSignalsProps {
  snapshot: SystemSnapshot;
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  onSnapshotUpdate: (next: SystemSnapshot) => void;
}

const CATEGORY_LABELS: Record<SignalCategory, string> = {
  satellite_vegetation: 'Satellite Vegetation',
  rainfall_variation: 'Rainfall Variation',
  temperature: 'Surface Temperature',
  soil_moisture: 'Soil Moisture',
  acoustic_observation: 'Acoustic Sensor',
  field_report: 'Field Patrol Report',
};

export const EnvironmentalSignals: React.FC<EnvironmentalSignalsProps> = ({
  snapshot,
  selectedRegionId,
  onSelectRegion,
  onSnapshotUpdate,
}) => {
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | AvailabilityStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SignalCategory>('all');
  const [syncingWeather, setSyncingWeather] = useState(false);
  const [weatherNotice, setWeatherNotice] = useState<string | null>(null);

  const targetRegionId = regionFilter !== 'all' ? regionFilter : selectedRegionId;
  const targetRegion = snapshot.regions.find((r) => r.id === targetRegionId) ?? snapshot.regions[0];

  const handleSyncWeather = async () => {
    setSyncingWeather(true);
    setWeatherNotice(null);
    try {
      const res = await api.syncRegionWeather(targetRegion.id);
      onSnapshotUpdate(res.snapshot);
      setWeatherNotice(res.message);
    } catch (err) {
      setWeatherNotice(err instanceof Error ? err.message : 'Weather sync failed.');
    } finally {
      setSyncingWeather(false);
    }
  };

  const filteredSignals = useMemo(() => {
    return snapshot.signals.filter((sig) => {
      if (regionFilter !== 'all' && sig.regionId !== regionFilter) return false;
      if (availabilityFilter !== 'all' && sig.availabilityStatus !== availabilityFilter) return false;
      if (categoryFilter !== 'all' && sig.category !== categoryFilter) return false;
      return true;
    });
  }, [snapshot.signals, regionFilter, availabilityFilter, categoryFilter]);

  const availableCount = snapshot.signals.filter((s) => s.availabilityStatus === 'available').length;
  const missingCount = snapshot.signals.filter((s) => s.availabilityStatus === 'missing').length;
  const occludedCount = snapshot.signals.filter(
    (s) => s.availabilityStatus === 'degraded' || s.availabilityStatus === 'cloud_occluded'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-cyan-400">
            Multi-Signal Environmental Fusion Engine · 6 Signal Modalities
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Environmental Signals &amp; Sensor Matrix
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1 max-w-3xl">
            Integrates optical NDVI, rainfall anomaly, thermal proxy, soil moisture, acoustic telemetry, and field reports. Missing or cloud-occluded feeds are tracked explicitly and never treated as evidence of disturbance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
          <span className="text-emerald-400">✓ {availableCount} Available</span>
          <span className="text-amber-400">◆ {occludedCount} Degraded/Occluded</span>
          <span className="text-[#8CA09A]">— {missingCount} Missing</span>
          <button
            onClick={handleSyncWeather}
            disabled={syncingWeather}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-medium bg-[#141C1E] hover:bg-[#1B2528] text-[#E6ECEA] border border-[#253236] rounded cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <CloudSun className="w-3.5 h-3.5 text-cyan-400" />
            {syncingWeather ? 'Syncing...' : `Sync OpenWeather (${targetRegion.code})`}
          </button>
        </div>
      </div>

      {weatherNotice && (
        <div className="p-3 bg-[#111719] border border-cyan-500/30 rounded text-xs text-cyan-200">
          {weatherNotice}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-[#111719] border border-[#1E282B] rounded-lg px-4 py-3">
        <select
          value={regionFilter}
          onChange={(e) => {
            setRegionFilter(e.target.value);
            if (e.target.value !== 'all') onSelectRegion(e.target.value);
          }}
          aria-label="Filter by monitoring region"
          className="px-3 py-1.5 text-xs bg-[#0B1011] border border-[#243135] rounded text-[#E6ECEA]"
        >
          <option value="all">All Monitoring Regions (6)</option>
          {snapshot.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} — {r.name}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | SignalCategory)}
          aria-label="Filter by signal category"
          className="px-3 py-1.5 text-xs bg-[#0B1011] border border-[#243135] rounded text-[#E6ECEA]"
        >
          <option value="all">All Signal Streams</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-[#0B1011] p-1 rounded border border-[#222E31]">
          {(
            [
              { id: 'all', label: 'All Statuses' },
              { id: 'available', label: 'Available' },
              { id: 'missing', label: 'Missing' },
              { id: 'cloud_occluded', label: 'Cloud Occluded' },
              { id: 'degraded', label: 'Degraded' },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              onClick={() => setAvailabilityFilter(st.id)}
              className={`px-2.5 py-1 text-xs rounded cursor-pointer whitespace-nowrap ${
                availabilityFilter === st.id
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'text-[#8CA09A] hover:text-[#E6ECEA]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {regionFilter !== selectedRegionId && (
          <button
            onClick={() => setRegionFilter(selectedRegionId)}
            className="ml-auto text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer whitespace-nowrap"
          >
            Focus Active Zone ({snapshot.regions.find((r) => r.id === selectedRegionId)?.code})
          </button>
        )}
      </div>

      {/* Signals Table */}
      <div className="bg-[#111719] border border-[#1E282B] rounded-lg overflow-hidden">
        {filteredSignals.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#7E948E]">
            No environmental signals match the selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1E282B] text-[11px] font-mono text-[#7E948E]">
                  <th className="py-3 px-4">Signal &amp; Stream</th>
                  <th className="py-3 px-3">Region / Coords</th>
                  <th className="py-3 px-3">Source &amp; Mode</th>
                  <th className="py-3 px-3 text-right">Measured Value</th>
                  <th className="py-3 px-3">Quality</th>
                  <th className="py-3 px-3 text-right">Conf.</th>
                  <th className="py-3 px-4">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A2326]">
                {filteredSignals.map((sig) => {
                  const region = snapshot.regions.find((r) => r.id === sig.regionId);
                  return (
                    <tr key={sig.id} className="hover:bg-[#161F22]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#EAEFED]">{sig.label}</div>
                        <div className="text-[11px] text-[#7E948E] mt-0.5">
                          {CATEGORY_LABELS[sig.category]} · {sig.baselineComparison}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#9FB2AC] tabular-nums">
                        <div className="text-[#D8E3E0]">{region?.code}</div>
                        <div>{formatCoord(sig.lat, sig.lng)}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-[#D8E3E0]">{sig.source}</div>
                        <div className="text-[11px] font-mono text-[#7E948E] tabular-nums">
                          {formatTimestamp(sig.timestamp)} · {sig.dataMode}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-[#F0F5F3] whitespace-nowrap">
                        {sig.measuredValue !== null ? `${sig.measuredValue} ${sig.unit}` : '—'}
                      </td>
                      <td className="py-3 px-3 capitalize text-[#B5C4BF]">{sig.dataQuality}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#9FB2AC]">
                        {sig.confidence > 0 ? `${(sig.confidence * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {sig.availabilityStatus === 'available' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <Radio className="w-3.5 h-3.5" /> Available
                          </span>
                        ) : sig.availabilityStatus === 'missing' ? (
                          <span className="inline-flex items-center gap-1 text-[#8CA09A] font-medium">
                            <CloudOff className="w-3.5 h-3.5" /> Missing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                            <Activity className="w-3.5 h-3.5" />{' '}
                            {sig.availabilityStatus === 'cloud_occluded'
                              ? 'Cloud Occluded'
                              : 'Degraded'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
