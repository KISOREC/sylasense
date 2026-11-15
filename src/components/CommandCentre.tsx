import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, MapPin, Satellite, ShieldAlert } from 'lucide-react';
import type { NavSection } from '../App';
import type { SystemSnapshot } from '../types/sylvasense';
import {
  formatCoord,
  formatNumber,
  formatShortDate,
  formatTimestamp,
  getRiskGlyph,
  getRiskTextColor,
  getStatusTextColor,
} from '../utils/formatters';

interface CommandCentreProps {
  snapshot: SystemSnapshot;
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  onNavigate: (section: NavSection) => void;
  onInspectAlert: (alertId: string) => void;
}

export const CommandCentre: React.FC<CommandCentreProps> = ({
  snapshot,
  selectedRegionId,
  onSelectRegion,
  onNavigate,
  onInspectAlert,
}) => {
  const { summary, regions, assessments, vegetationIndices, alerts, dataSources } = snapshot;

  // 1. Vegetation change over time (Nilgiri vs Anamalai vs Silent Valley)
  const timelineDates = ['2026-09-28', '2026-10-18', '2026-11-02', '2026-11-12'];
  const ndviTrendData = timelineDates.map((d, idx) => {
    const nil = vegetationIndices.find((v) => v.regionId === 'reg-nilgiri')?.timeSeries[idx === 0 ? 0 : idx === 1 ? 2 : idx === 2 ? 4 : 6];
    const ana = vegetationIndices.find((v) => v.regionId === 'reg-anamalai')?.timeSeries[Math.min(idx * 2, 5)];
    const sil = vegetationIndices.find((v) => v.regionId === 'reg-silentvalley')?.timeSeries[Math.min(idx, 3)];
    return {
      date: d.slice(5),
      Nilgiri: nil?.ndvi ?? null,
      Anamalai: ana?.ndvi ?? null,
      SilentValley: sil?.ndvi ?? null,
    };
  });

  // 2. Environmental risk distribution across regions
  const riskChartData = regions
    .map((r) => {
      const a = assessments.find((x) => x.regionId === r.id);
      return {
        name: r.code,
        fullName: r.name,
        score: a?.riskScore ?? 0,
        classification: a?.classification ?? 'Low risk',
        regionId: r.id,
      };
    })
    .sort((a, b) => b.score - a.score);

  // 3. Alert severity distribution
  const severityCounts = (['Critical priority', 'High priority', 'Moderate risk', 'Low risk'] as const).map(
    (tier) => ({
      tier: tier.replace(' priority', '').replace(' risk', ''),
      fullTier: tier,
      count: assessments.filter((a) => a.classification === tier).length,
    })
  );

  // 4. Historical observation timeline (observations + delta)
  const observationTimeline = snapshot.observations
    .slice()
    .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt))
    .map((obs) => {
      const region = regions.find((r) => r.id === obs.regionId);
      return {
        label: `${obs.acquiredAt.slice(5, 10)} · ${region?.code ?? obs.regionId}`,
        ndvi: obs.calculatedNdvi,
        cloud: obs.cloudCoverPercent,
      };
    });

  const sentinelSource = dataSources.find((d) => d.id === 'ds-sentinel2');
  const sortedAlerts = alerts.slice().sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="space-y-6">
      {/* Header & Action Strip */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-emerald-400 tracking-wide">
            Western Ghats Regional Command · Tamil Nadu &amp; Kerala
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Forest Intelligence Command Centre
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1 max-w-2xl">
            Proactive disturbance triage combining multi-pass Sentinel-2 vegetation trends, environmental signal fusion, and transparent risk prioritization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('map')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            Open Geospatial Map
          </button>
          <button
            onClick={() => onNavigate('analyst')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#141C1E] hover:bg-[#1B2528] text-[#D7E2DE] border border-[#253236] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Query Sylva Analyst
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-[#1E282B] border border-[#1E282B] rounded-lg overflow-hidden">
        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Monitored Forest Area</div>
          <div className="text-2xl font-mono font-semibold text-[#F0F5F3] tabular-nums mt-1.5">
            {formatNumber(summary.totalMonitoredAreaHa)}
            <span className="text-xs font-normal text-[#7E948E] ml-1">ha</span>
          </div>
          <div className="text-xs text-[#6B807A] mt-1">Sample biosphere sector</div>
        </div>

        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Geographic Zones</div>
          <div className="text-2xl font-mono font-semibold text-[#F0F5F3] tabular-nums mt-1.5">
            {summary.monitoredZonesCount}
          </div>
          <div className="text-xs text-[#6B807A] mt-1">3 Tamil Nadu · 3 Kerala</div>
        </div>

        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Suspicious Changes</div>
          <div className="text-2xl font-mono font-semibold text-amber-400 tabular-nums mt-1.5">
            {summary.suspiciousObservationsCount}
          </div>
          <div className="text-xs text-[#6B807A] mt-1">ΔNDVI &le; -0.100 threshold</div>
        </div>

        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">High / Critical Priority</div>
          <div className="text-2xl font-mono font-semibold text-rose-400 tabular-nums mt-1.5">
            {summary.highPriorityLocationsCount}
          </div>
          <div className="text-xs text-[#6B807A] mt-1">Unconfirmed until verified</div>
        </div>

        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Observation Coverage</div>
          <div className="text-2xl font-mono font-semibold text-cyan-400 tabular-nums mt-1.5">
            {summary.overallCoveragePercent.toFixed(1)}%
          </div>
          <div className="text-xs text-[#6B807A] mt-1">Cloud-screened footprint</div>
        </div>

        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Satellite Feed Status</div>
          <div className="text-sm font-medium text-[#E2ECE9] mt-2 flex items-center gap-1.5">
            <Satellite className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">
              {sentinelSource?.status === 'connected' ? 'Copernicus Live' : 'Demo Archive'}
            </span>
          </div>
          <div className="text-xs font-mono text-[#6B807A] mt-1.5 tabular-nums">
            Sync: {formatShortDate(summary.lastSyncTimestamp)}
          </div>
        </div>
      </div>

      {/* Primary Priority Investigation Queue + Active Region Snapshot */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 bg-[#111719] border border-[#1E282B] rounded-lg flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E282B]">
            <div>
              <h2 className="text-sm font-semibold text-[#F0F5F3]">
                Priority Investigation Queue
              </h2>
              <p className="text-xs text-[#7E948E]">
                Sorted by composite disturbance risk score · Click any location to inspect evidence
              </p>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium whitespace-nowrap cursor-pointer"
            >
              Open Full Inbox
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E282B] text-[11px] font-mono text-[#7E948E]">
                  <th className="py-2.5 px-4 font-medium">Zone / Alert</th>
                  <th className="py-2.5 px-3 font-medium">Classification</th>
                  <th className="py-2.5 px-3 font-medium text-right">Risk</th>
                  <th className="py-2.5 px-3 font-medium text-right">Conf.</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A2326] text-xs">
                {sortedAlerts.map((alert) => {
                  const region = regions.find((r) => r.id === alert.regionId);
                  return (
                    <tr
                      key={alert.id}
                      onClick={() => {
                        onSelectRegion(alert.regionId);
                      }}
                      className={`hover:bg-[#161F22] transition-colors cursor-pointer ${
                        selectedRegionId === alert.regionId ? 'bg-[#152021]' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#EAEFED]">{alert.title}</div>
                        <div className="text-[11px] text-[#7E948E] font-mono mt-0.5">
                          {region?.code} · {region?.state} · {formatCoord(alert.lat, alert.lng)}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`font-medium ${getRiskTextColor(alert.severity)}`}>
                          {getRiskGlyph(alert.severity)} {alert.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#F0F5F3] font-medium">
                        {alert.riskScore.toFixed(1)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#9FB2AC]">
                        {alert.confidence.toFixed(0)}%
                      </td>
                      <td className={`py-3 px-3 whitespace-nowrap font-medium ${getStatusTextColor(alert.status)}`}>
                        {alert.status}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRegion(alert.regionId);
                            onInspectAlert(alert.id);
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded transition-colors cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Region Quick Intelligence Brief */}
        <div className="xl:col-span-4 bg-[#111719] border border-[#1E282B] rounded-lg p-5 flex flex-col justify-between">
          {(() => {
            const region = regions.find((r) => r.id === selectedRegionId) ?? regions[0];
            const veg = vegetationIndices.find((v) => v.regionId === region.id);
            const ass = assessments.find((a) => a.regionId === region.id);
            return (
              <>
                <div>
                  <div className="flex items-center justify-between text-xs text-[#7E948E] font-mono">
                    <span>Selected Region · {region.code}</span>
                    <span>{region.state}</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#F0F5F3] mt-1.5">{region.name}</h3>
                  <p className="text-xs text-[#8CA09A] mt-0.5">
                    {region.biome} · {formatNumber(region.areaHectares)} ha · Sample coord{' '}
                    <span className="font-mono">{formatCoord(region.centerLat, region.centerLng)}</span>
                  </p>

                  <div className="grid grid-cols-3 gap-3 mt-4 py-3 border-y border-[#1E282B]">
                    <div>
                      <div className="text-[11px] text-[#7E948E]">Prev NDVI</div>
                      <div className="text-sm font-mono font-semibold tabular-nums text-[#D8E3E0] mt-0.5">
                        {veg?.previousNdvi.toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#7E948E]">Curr NDVI</div>
                      <div className="text-sm font-mono font-semibold tabular-nums text-[#F0F5F3] mt-0.5">
                        {veg?.currentNdvi.toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#7E948E]">Δ Change</div>
                      <div
                        className={`text-sm font-mono font-semibold tabular-nums mt-0.5 ${
                          (veg?.changePercent ?? 0) < -10 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {veg ? `${veg.changePercent > 0 ? '+' : ''}${veg.changePercent.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {ass && (
                    <div className="mt-4 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#8CA09A]">Disturbance Risk Score</span>
                        <span className={`font-mono font-semibold tabular-nums ${getRiskTextColor(ass.classification)}`}>
                          {ass.riskScore.toFixed(1)} / 100 · {ass.classification}
                        </span>
                      </div>
                      <p className="text-xs text-[#B5C4BF] leading-relaxed">{ass.explanation}</p>
                      <div className="pt-2 border-t border-[#1A2326] text-[11px] text-[#7E948E] flex items-start gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{ass.incidentStatusNotice}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 mt-5 pt-4 border-t border-[#1E282B]">
                  <button
                    onClick={() => onNavigate('satellite')}
                    className="px-3 py-2 text-xs font-medium bg-[#182224] hover:bg-[#1F2C2F] text-[#E2ECE9] border border-[#273538] rounded-md transition-colors cursor-pointer"
                  >
                    Compare Satellite
                  </button>
                  <button
                    onClick={() => onNavigate('risk')}
                    className="px-3 py-2 text-xs font-medium bg-[#182224] hover:bg-[#1F2C2F] text-[#E2ECE9] border border-[#273538] rounded-md transition-colors cursor-pointer"
                  >
                    Inspect Risk Model
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* 4 Telemetry & Analytical Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Forest Vegetation Change Over Time */}
        <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F0F5F3]">
                Forest Vegetation Change Over Time (NDVI)
              </h3>
              <p className="text-xs text-[#7E948E]">
                Multi-pass Sentinel-2 index comparing disturbed ridges vs stable Silent Valley control
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#7E948E]">Sep–Nov 2026</span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ndviTrendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#1E282B" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#6B807A" fontSize={11} />
                <YAxis domain={[0.3, 0.9]} stroke="#6B807A" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#13191B',
                    borderColor: '#253236',
                    fontSize: '12px',
                    color: '#E6ECEA',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="SilentValley"
                  name="Silent Valley (Control)"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="Anamalai"
                  name="Anamalai Corridor"
                  stroke="#F59E0B"
                  fill="#F59E0B"
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="Nilgiri"
                  name="Nilgiri Shola"
                  stroke="#F43F5E"
                  fill="#F43F5E"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Environmental Risk Distribution */}
        <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F0F5F3]">
                Environmental Risk Distribution by Zone
              </h3>
              <p className="text-xs text-[#7E948E]">
                Weighted multi-signal disturbance score (0–100) across monitored regions
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#7E948E]">Weighted Engine</span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#1E282B" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#6B807A" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#6B807A" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#13191B',
                    borderColor: '#253236',
                    fontSize: '12px',
                    color: '#E6ECEA',
                  }}
                />
                <Bar dataKey="score" name="Risk Score" radius={[3, 3, 0, 0]}>
                  {riskChartData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={
                        entry.score >= 75
                          ? '#F43F5E'
                          : entry.score >= 55
                            ? '#F59E0B'
                            : entry.score >= 30
                              ? '#06B6D4'
                              : '#10B981'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Alert Severity Distribution */}
        <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F0F5F3]">
                Zone Priority Tier Distribution
              </h3>
              <p className="text-xs text-[#7E948E]">
                Breakdown of all 6 monitored Western Ghats zones by current classification
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#7E948E]">6 Zones Total</span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={severityCounts}
                margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid stroke="#1E282B" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} stroke="#6B807A" fontSize={11} />
                <YAxis type="category" dataKey="tier" stroke="#8CA09A" fontSize={11} width={72} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#13191B',
                    borderColor: '#253236',
                    fontSize: '12px',
                    color: '#E6ECEA',
                  }}
                />
                <Bar dataKey="count" name="Zones" radius={[0, 3, 3, 0]}>
                  {severityCounts.map((s) => (
                    <Cell
                      key={s.tier}
                      fill={
                        s.fullTier === 'Critical priority'
                          ? '#F43F5E'
                          : s.fullTier === 'High priority'
                            ? '#F59E0B'
                            : s.fullTier === 'Moderate risk'
                              ? '#06B6D4'
                              : '#10B981'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Historical Observation Timeline */}
        <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F0F5F3]">
                Historical Observation Timeline (NDVI vs Cloud %)
              </h3>
              <p className="text-xs text-[#7E948E]">
                Chronological Sentinel-2 sample acquisitions and atmospheric cloud attenuation
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#7E948E]">
              Updated {formatTimestamp(summary.lastSyncTimestamp)}
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={observationTimeline} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#1E282B" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#6B807A" fontSize={10} />
                <YAxis yAxisId="left" domain={[0, 1]} stroke="#10B981" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#06B6D4" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#13191B',
                    borderColor: '#253236',
                    fontSize: '12px',
                    color: '#E6ECEA',
                  }}
                />
                <Bar yAxisId="left" dataKey="ndvi" name="NDVI" fill="#10B981" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="cloud" name="Cloud %" fill="#06B6D4" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
