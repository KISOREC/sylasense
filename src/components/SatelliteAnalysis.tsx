import React, { useEffect, useRef, useState } from 'react';
import { Calculator, CloudAlert, Layers, MoveHorizontal, Satellite } from 'lucide-react';
import { api } from '../services/api';
import type { SystemSnapshot } from '../types/sylvasense';
import { formatShortDate } from '../utils/formatters';

interface SatelliteAnalysisProps {
  snapshot: SystemSnapshot;
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  onSnapshotUpdate: (next: SystemSnapshot) => void;
}

export const SatelliteAnalysis: React.FC<SatelliteAnalysisProps> = ({
  snapshot,
  selectedRegionId,
  onSelectRegion,
  onSnapshotUpdate,
}) => {
  const region =
    snapshot.regions.find((r) => r.id === selectedRegionId) ?? snapshot.regions[0];
  const veg = snapshot.vegetationIndices.find((v) => v.regionId === region.id)!;
  const regionObs = snapshot.observations.filter((o) => o.regionId === region.id);
  const latestObs = regionObs[regionObs.length - 1] ?? snapshot.observations[0];

  const [sliderPercent, setSliderPercent] = useState(52);
  const [overlayMode, setOverlayMode] = useState<'true_color' | 'ndvi_heatmap'>('true_color');
  const [isDragging, setIsDragging] = useState(false);
  const compareRef = useRef<HTMLDivElement | null>(null);

  const [syncingSat, setSyncingSat] = useState(false);
  const [satSyncNotice, setSatSyncNotice] = useState<string | null>(null);

  // Interactive NDVI spectral calculator inputs synced to selected region
  const [b8Nir, setB8Nir] = useState(String(latestObs.bandB8Nir));
  const [b4Red, setB4Red] = useState(String(latestObs.bandB4Red));
  const [prevNdvi, setPrevNdvi] = useState(String(veg.previousNdvi));
  const [cloudCover, setCloudCover] = useState(String(latestObs.cloudCoverPercent));
  const [calcResult, setCalcResult] = useState<{
    ndvi: number;
    formula: string;
    vegetationClass: string;
    cloudQualityWarning: string | null;
    deltaFromPrevious: number | null;
    changePercent: number | null;
    isReliable: boolean;
  } | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    setB8Nir(String(latestObs.bandB8Nir));
    setB4Red(String(latestObs.bandB4Red));
    setPrevNdvi(String(veg.previousNdvi));
    setCloudCover(String(latestObs.cloudCoverPercent));
    setCalcResult(null);
    setCalcError(null);
    setSatSyncNotice(null);
  }, [region.id, latestObs.bandB8Nir, latestObs.bandB4Red, latestObs.cloudCoverPercent, veg.previousNdvi]);

  const handleSyncSatellite = async () => {
    setSyncingSat(true);
    setSatSyncNotice(null);
    try {
      const res = await api.syncRegionSatellite(region.id);
      onSnapshotUpdate(res.snapshot);
      setSatSyncNotice(
        `${res.message} · Geospatial pipeline: ${res.geospatialFallback.pipeline} (${res.geospatialFallback.computedFootprintHa} ha footprint).`
      );
    } catch (err) {
      setSatSyncNotice(err instanceof Error ? err.message : 'Satellite sync failed.');
    } finally {
      setSyncingSat(false);
    }
  };

  const updateSliderFromPointer = (clientX: number) => {
    if (!compareRef.current) return;
    const rect = compareRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSliderPercent(Math.min(96, Math.max(4, Math.round(pct * 10) / 10)));
  };

  const handleComputeNdvi = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalculating(true);
    setCalcError(null);
    try {
      const res = await api.calculateNdvi({
        bandB8Nir: Number(b8Nir),
        bandB4Red: Number(b4Red),
        previousNdvi: prevNdvi !== '' ? Number(prevNdvi) : undefined,
        cloudCoverPercent: Number(cloudCover),
      });
      setCalcResult(res);
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'NDVI calculation failed.');
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-cyan-400">
            Sentinel-2 L2A Multispectral Analysis · Copernicus Adapter + Local Fallback Pipeline
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Satellite Change Intelligence &amp; NDVI Lab
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1">
            Compare pre- and post-disturbance canopy acquisitions and compute Sentinel-2 NDVI using Band B8 (NIR) and Band B4 (Red).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={region.id}
            onChange={(e) => onSelectRegion(e.target.value)}
            aria-label="Select monitoring region"
            className="px-3 py-2 text-xs bg-[#111719] border border-[#253236] rounded text-[#E6ECEA] focus:outline-none focus:border-emerald-500"
          >
            {snapshot.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleSyncSatellite}
            disabled={syncingSat}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#141C1E] hover:bg-[#1B2528] text-[#E6ECEA] border border-[#253236] rounded cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Satellite className="w-3.5 h-3.5 text-cyan-400" />
            {syncingSat ? 'Querying Copernicus...' : 'Fetch Sentinel-2 Pass'}
          </button>

          <div className="flex items-center gap-1 bg-[#111719] p-1 rounded border border-[#222E31]">
            <button
              onClick={() => setOverlayMode('true_color')}
              className={`px-3 py-1 text-xs rounded cursor-pointer whitespace-nowrap ${
                overlayMode === 'true_color'
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'text-[#8CA09A] hover:text-[#E6ECEA]'
              }`}
            >
              True Color (B4/B3/B2)
            </button>
            <button
              onClick={() => setOverlayMode('ndvi_heatmap')}
              className={`px-3 py-1 text-xs rounded cursor-pointer whitespace-nowrap ${
                overlayMode === 'ndvi_heatmap'
                  ? 'bg-cyan-600 text-white font-medium'
                  : 'text-[#8CA09A] hover:text-[#E6ECEA]'
              }`}
            >
              NDVI False-Color Overlay
            </button>
          </div>
        </div>
      </div>

      {satSyncNotice && (
        <div className="p-3 bg-[#111719] border border-cyan-500/30 rounded text-xs text-cyan-200">
          {satSyncNotice}
        </div>
      )}

      {/* Main Before/After Slider + Spectral Calculator */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left: Draggable Before/After Comparison Slider */}
        <div className="xl:col-span-8 bg-[#111719] border border-[#1E282B] rounded-lg p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-xs text-[#B5C4BF] flex items-center gap-2">
              <Satellite className="w-4 h-4 text-emerald-400" />
              <span>
                <strong>{region.name}</strong> · Tile {latestObs.tileId} · Simulated Sentinel-2 comparison
              </span>
            </div>
            <div className="text-xs font-mono text-[#7E948E] tabular-nums">
              Before: {veg.previousDate} (NDVI {veg.previousNdvi.toFixed(3)}) · After: {veg.currentDate} (NDVI{' '}
              {veg.currentNdvi.toFixed(3)})
            </div>
          </div>

          <div
            ref={compareRef}
            onPointerDown={(e) => {
              setIsDragging(true);
              updateSliderFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (isDragging) updateSliderFromPointer(e.clientX);
            }}
            onPointerUp={() => setIsDragging(false)}
            onPointerLeave={() => setIsDragging(false)}
            className="relative w-full aspect-video rounded overflow-hidden border border-[#243135] select-none cursor-ew-resize bg-[#0A0E0F]"
          >
            {/* AFTER image (full background) */}
            <img
              src="/src/assets/images/sat_canopy_after_1794765780557.jpg"
              alt="Post-observation canopy satellite orthophoto"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {overlayMode === 'ndvi_heatmap' && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse 18% 58% at 58% 55%, rgba(244,63,94,0.58) 0%, rgba(245,158,11,0.34) 42%, rgba(16,185,129,0.22) 100%)',
                  mixBlendMode: 'screen',
                }}
              />
            )}

            {/* BEFORE image (clipped to left sliderPercent%) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPercent}% 0 0)` }}
            >
              <img
                src="/src/assets/images/sat_canopy_before_1794765779417.jpg"
                alt="Baseline healthy forest canopy satellite orthophoto"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {overlayMode === 'ndvi_heatmap' && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'rgba(16, 185, 129, 0.24)',
                    mixBlendMode: 'screen',
                  }}
                />
              )}
            </div>

            {/* Cloud Cover Simulation Mask for Periyar or high-cloud selection */}
            {latestObs.cloudCoverPercent >= 25 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 68% 36%, rgba(226,232,240,0.48) 0%, rgba(226,232,240,0.18) 38%, transparent 70%)',
                }}
              />
            )}

            {/* Labels */}
            <div className="absolute top-3 left-3 px-2.5 py-1 bg-[#0B1011]/85 border border-[#273538] rounded text-[11px] font-mono text-[#E6ECEA] pointer-events-none">
              Baseline · {veg.previousDate}
            </div>
            <div className="absolute top-3 right-3 px-2.5 py-1 bg-[#0B1011]/85 border border-[#273538] rounded text-[11px] font-mono text-[#E6ECEA] pointer-events-none">
              Latest Pass · {veg.currentDate}
            </div>

            {/* Draggable Handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none"
              style={{ left: `${sliderPercent}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#0F1718] border-2 border-emerald-400 flex items-center justify-center shadow-lg">
                <MoveHorizontal className="w-4 h-4 text-emerald-300" />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[220px]">
              <span className="text-xs font-mono text-[#7E948E]">Split: {sliderPercent.toFixed(0)}%</span>
              <input
                type="range"
                min={4}
                max={96}
                value={sliderPercent}
                onChange={(e) => setSliderPercent(Number(e.target.value))}
                aria-label="Before and after comparison split slider"
                className="flex-1 accent-emerald-500"
              />
            </div>
            <div className="text-xs text-[#8CA09A]">
              Demo imagery depicts canopy change geometry for visual inspection; spectral values reflect regional telemetry.
            </div>
          </div>
        </div>

        {/* Right: Sentinel-2 NDVI Band Calculator & Cloud QA */}
        <div className="xl:col-span-4 bg-[#111719] border border-[#1E282B] rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F5F3]">
              <Calculator className="w-4 h-4 text-cyan-400" />
              Sentinel-2 NDVI Spectral Calculator
            </div>
            <p className="text-xs text-[#7E948E] mt-1 font-mono">
              NDVI = (B8_NIR - B4_RED) / (B8_NIR + B4_RED)
            </p>

            <form onSubmit={handleComputeNdvi} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="text-[#9FB2AC]">Band B8 (NIR, 842nm)</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="1"
                    value={b8Nir}
                    onChange={(e) => setB8Nir(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded font-mono text-xs text-[#F0F5F3] focus:outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-[#9FB2AC]">Band B4 (Red, 665nm)</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="1"
                    value={b4Red}
                    onChange={(e) => setB4Red(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded font-mono text-xs text-[#F0F5F3] focus:outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="text-[#9FB2AC]">Previous NDVI</span>
                  <input
                    type="number"
                    step="0.001"
                    min="-1"
                    max="1"
                    value={prevNdvi}
                    onChange={(e) => setPrevNdvi(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded font-mono text-xs text-[#F0F5F3] focus:outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-[#9FB2AC]">Cloud Cover %</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={cloudCover}
                    onChange={(e) => setCloudCover(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded font-mono text-xs text-[#F0F5F3] focus:outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={calculating}
                className="w-full py-2 px-4 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded transition-colors cursor-pointer"
              >
                {calculating ? 'Computing Band Ratio...' : 'Compute NDVI via Backend'}
              </button>
            </form>

            {calcError && (
              <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                {calcError}
              </div>
            )}

            {calcResult && (
              <div className="mt-4 p-3.5 bg-[#0C1112] border border-[#243135] rounded space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#8CA09A]">Computed NDVI</span>
                  <span className="text-xl font-mono font-semibold tabular-nums text-emerald-400">
                    {calcResult.ndvi.toFixed(3)}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#9FB2AC]">{calcResult.formula}</div>
                <div className="text-xs text-[#D8E3E0]">
                  Class: <strong>{calcResult.vegetationClass}</strong>
                </div>
                {calcResult.deltaFromPrevious !== null && (
                  <div className="text-xs font-mono tabular-nums text-[#B5C4BF]">
                    Δ vs Previous: {calcResult.deltaFromPrevious > 0 ? '+' : ''}
                    {calcResult.deltaFromPrevious.toFixed(3)} ({calcResult.changePercent?.toFixed(1)}%)
                  </div>
                )}
                {calcResult.cloudQualityWarning && (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/25 rounded text-[11px] text-amber-200 flex items-start gap-1.5">
                    <CloudAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{calcResult.cloudQualityWarning}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cloud & Missing Data Note */}
          <div className="pt-3 border-t border-[#1E282B] text-xs text-[#8CA09A] space-y-1">
            <div className="font-medium text-[#D8E3E0] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Cloud &amp; Atmospheric QA Handling
            </div>
            <p className="text-[11px] leading-relaxed">
              Passes exceeding 20% cloud cover trigger atmospheric QA60 warnings; passes &ge;40% are flagged unreliable so cloud shadow is not misclassified as deforestation.
            </p>
          </div>
        </div>
      </div>

      {/* Temporal Observation Table for Selected Region */}
      <div className="bg-[#111719] border border-[#1E282B] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1E282B] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#F0F5F3]">
            Temporal Observation History — {region.name}
          </h2>
          <span className="text-xs font-mono text-[#7E948E]">
            {veg.timeSeries.length} Sentinel-2 sample passes
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E282B] text-[11px] font-mono text-[#7E948E]">
                <th className="py-2.5 px-4">Acquisition Date</th>
                <th className="py-2.5 px-3 text-right">Band B4 (Red)</th>
                <th className="py-2.5 px-3 text-right">Band B8 (NIR)</th>
                <th className="py-2.5 px-3 text-right">Observed NDVI</th>
                <th className="py-2.5 px-3 text-right">Seasonal Baseline</th>
                <th className="py-2.5 px-3 text-right">Cloud %</th>
                <th className="py-2.5 px-4">QA Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2326] font-mono tabular-nums">
              {veg.timeSeries.map((pt) => (
                <tr key={pt.date} className="hover:bg-[#161F22]">
                  <td className="py-2.5 px-4 text-[#E6ECEA]">{formatShortDate(pt.date)}</td>
                  <td className="py-2.5 px-3 text-right text-[#9FB2AC]">{pt.b4Red.toFixed(3)}</td>
                  <td className="py-2.5 px-3 text-right text-[#9FB2AC]">{pt.b8Nir.toFixed(3)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-[#F0F5F3]">
                    {pt.ndvi.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#7E948E]">
                    {pt.baselineNdvi.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#9FB2AC]">{pt.cloudCoverPercent}%</td>
                  <td className="py-2.5 px-4 font-sans">
                    {pt.status === 'suspicious_drop' ? (
                      <span className="text-rose-400 font-medium">▲ Canopy decline</span>
                    ) : pt.status === 'cloud_masked' ? (
                      <span className="text-amber-400 font-medium">◆ Cloud-masked</span>
                    ) : (
                      <span className="text-emerald-400 font-medium">✓ Nominal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
