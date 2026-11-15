import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Layers,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  ArrowRight,
  Compass,
} from 'lucide-react';
import type { NavSection } from '../App';
import type { SystemSnapshot } from '../types/sylvasense';
import {
  formatCoord,
  formatShortDate,
  getRiskGlyph,
  getRiskTextColor,
} from '../utils/formatters';

interface ForestMapProps {
  snapshot: SystemSnapshot;
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  onNavigate: (section: NavSection) => void;
  onInspectAlert: (alertId: string) => void;
}

type BaseMapMode = 'dark' | 'osm' | 'satellite';
type TimeWindow = 'all' | '14d' | '30d';

export const ForestMap: React.FC<ForestMapProps> = ({
  snapshot,
  selectedRegionId,
  onSelectRegion,
  onNavigate,
  onInspectAlert,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const vectorGroupRef = useRef<L.LayerGroup | null>(null);

  const [baseLayer, setBaseLayer] = useState<BaseMapMode>('dark');
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);

  const filteredRegions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return snapshot.regions.filter((r) => {
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.district.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (timeWindow === '14d') {
        return r.lastPassDate >= '2026-11-01';
      }
      return true;
    });
  }, [snapshot.regions, searchQuery, timeWindow]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [10.45, 76.75],
      zoom: 7,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    const vectorGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    vectorGroupRef.current = vectorGroup;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      vectorGroupRef.current = null;
    };
  }, []);

  // Update Tile Layer when baseLayer changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
    if (baseLayer === 'osm') {
      url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
    } else if (baseLayer === 'satellite') {
      url =
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics';
    }

    const layer = L.tileLayer(url, {
      attribution,
      maxZoom: 18,
    }).addTo(map);

    tileLayerRef.current = layer;
  }, [baseLayer]);

  // Render Zone Polygons, Heatmap Halos & Suspicious Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = vectorGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    filteredRegions.forEach((region) => {
      const ass = snapshot.assessments.find((a) => a.regionId === region.id);
      const veg = snapshot.vegetationIndices.find((v) => v.regionId === region.id);
      const score = ass?.riskScore ?? 20;
      const isSelected = region.id === selectedRegionId;

      const strokeColor =
        score >= 75
          ? '#F43F5E'
          : score >= 55
            ? '#F59E0B'
            : score >= 30
              ? '#06B6D4'
              : '#10B981';

      if (showBoundaries) {
        const poly = L.polygon(region.boundary, {
          color: isSelected ? '#FFFFFF' : strokeColor,
          weight: isSelected ? 2.5 : 1.5,
          opacity: 0.9,
          fillColor: strokeColor,
          fillOpacity: isSelected ? 0.22 : 0.1,
          dashArray: isSelected ? undefined : '4 3',
        });

        poly.on('click', () => {
          onSelectRegion(region.id);
          setPanelOpen(true);
        });

        poly.bindTooltip(
          `<div style="font-family:JetBrains Mono,monospace;font-size:11px;"><strong>${region.code}</strong> · ${region.name}<br/>Risk: ${score.toFixed(1)} (${ass?.classification})</div>`,
          { sticky: true }
        );
        poly.addTo(group);
      }

      if (showHeatmap && veg) {
        const radiusMeters = score >= 75 ? 9500 : score >= 55 ? 7200 : score >= 30 ? 5200 : 3600;
        const heatOuter = L.circle([veg.hotspotLat, veg.hotspotLng], {
          radius: radiusMeters,
          color: 'transparent',
          fillColor: strokeColor,
          fillOpacity: score >= 55 ? 0.24 : 0.12,
          interactive: false,
        });
        const heatInner = L.circle([veg.hotspotLat, veg.hotspotLng], {
          radius: radiusMeters * 0.45,
          color: 'transparent',
          fillColor: strokeColor,
          fillOpacity: score >= 55 ? 0.36 : 0.18,
          interactive: false,
        });
        heatOuter.addTo(group);
        heatInner.addTo(group);
      }

      if (showMarkers && veg) {
        const marker = L.circleMarker([veg.hotspotLat, veg.hotspotLng], {
          radius: score >= 75 ? 9 : score >= 55 ? 7.5 : 6,
          color: '#0A0D0E',
          weight: 2,
          fillColor: strokeColor,
          fillOpacity: 1,
        });

        marker.on('click', () => {
          onSelectRegion(region.id);
          setPanelOpen(true);
          map.flyTo([veg.hotspotLat, veg.hotspotLng], 10, { duration: 0.6 });
        });

        marker.addTo(group);
      }
    });
  }, [
    filteredRegions,
    snapshot.assessments,
    snapshot.vegetationIndices,
    selectedRegionId,
    showBoundaries,
    showHeatmap,
    showMarkers,
    onSelectRegion,
  ]);

  const handleJumpToRegion = (regionId: string) => {
    onSelectRegion(regionId);
    setPanelOpen(true);
    const region = snapshot.regions.find((r) => r.id === regionId);
    const veg = snapshot.vegetationIndices.find((v) => v.regionId === regionId);
    if (region && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [veg?.hotspotLat ?? region.centerLat, veg?.hotspotLng ?? region.centerLng],
        10,
        { duration: 0.65 }
      );
    }
  };

  const selectedRegion =
    snapshot.regions.find((r) => r.id === selectedRegionId) ?? snapshot.regions[0];
  const selectedVeg = snapshot.vegetationIndices.find((v) => v.regionId === selectedRegion.id);
  const selectedRisk = snapshot.assessments.find((a) => a.regionId === selectedRegion.id);
  const selectedSignals = snapshot.signals.filter((s) => s.regionId === selectedRegion.id);
  const selectedAlert = snapshot.alerts.find((a) => a.regionId === selectedRegion.id);

  return (
    <div className="space-y-4">
      {/* Compact Top Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-[#111719] border border-[#1E282B] rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#7E948E] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Nilgiri, Anamalai, Kerala..."
              className="pl-8 pr-3 py-1.5 text-xs bg-[#0B1011] border border-[#243135] rounded text-[#E6ECEA] placeholder-[#657973] focus:outline-none focus:border-emerald-500 w-60"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#0B1011] p-1 rounded border border-[#222E31]">
            {(
              [
                { id: 'dark', label: 'Tactical Dark' },
                { id: 'osm', label: 'OpenStreetMap' },
                { id: 'satellite', label: 'Satellite Imagery' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                onClick={() => setBaseLayer(mode.id)}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap cursor-pointer ${
                  baseLayer === mode.id
                    ? 'bg-emerald-600 text-white font-medium'
                    : 'text-[#8CA09A] hover:text-[#E6ECEA]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#0B1011] p-1 rounded border border-[#222E31]">
            {(
              [
                { id: 'all', label: 'All Passes' },
                { id: '14d', label: 'Recent (Nov)' },
              ] as const
            ).map((tw) => (
              <button
                key={tw.id}
                onClick={() => setTimeWindow(tw.id)}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap cursor-pointer ${
                  timeWindow === tw.id
                    ? 'bg-[#1D282B] text-[#F0F5F3] font-medium'
                    : 'text-[#8CA09A] hover:text-[#E6ECEA]'
                }`}
              >
                {tw.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[#7E948E] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Layers:
          </span>
          <label className="inline-flex items-center gap-1.5 text-[#C8D5D1] cursor-pointer">
            <input
              type="checkbox"
              checked={showBoundaries}
              onChange={(e) => setShowBoundaries(e.target.checked)}
              className="accent-emerald-500"
            />
            Boundaries
          </label>
          <label className="inline-flex items-center gap-1.5 text-[#C8D5D1] cursor-pointer">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="accent-emerald-500"
            />
            Risk Heatmap
          </label>
          <label className="inline-flex items-center gap-1.5 text-[#C8D5D1] cursor-pointer">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={(e) => setShowMarkers(e.target.checked)}
              className="accent-emerald-500"
            />
            Hotspots
          </label>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="px-2.5 py-1 bg-[#172022] hover:bg-[#1F2B2E] border border-[#273538] rounded text-[#D7E2DE] cursor-pointer whitespace-nowrap"
          >
            {panelOpen ? 'Hide Intel Panel' : 'Show Intel Panel'}
          </button>
        </div>
      </div>

      {/* Main Map Canvas + Right Intelligence Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div
          className={`${
            panelOpen ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
          } relative bg-[#0A0E0F] border border-[#1E282B] rounded-lg overflow-hidden min-h-[540px] lg:h-[680px]`}
        >
          <div ref={mapContainerRef} className="w-full h-full min-h-[540px]" />

          {/* Floating Region Quick-Jump Strip */}
          <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap gap-1.5 pointer-events-none">
            {filteredRegions.map((r) => {
              const a = snapshot.assessments.find((x) => x.regionId === r.id);
              const active = r.id === selectedRegionId;
              return (
                <button
                  key={r.id}
                  onClick={() => handleJumpToRegion(r.id)}
                  className={`pointer-events-auto px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#0F1718]/95 border-emerald-400 text-white'
                      : 'bg-[#0F1718]/85 border-[#263438] text-[#BAC8C3] hover:border-[#3D5257]'
                  }`}
                >
                  {r.code} · {a?.riskScore.toFixed(0)}
                </button>
              );
            })}
          </div>

          {/* Map Legend & Sample Coordinate Disclaimer */}
          <div className="absolute bottom-3 right-3 z-[400] bg-[#0E1415]/92 border border-[#243033] rounded px-3 py-2 text-[11px] text-[#9FB2AC] space-y-1 max-w-xs">
            <div className="font-medium text-[#E2ECE9] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              Western Ghats Sample Coordinates (Demo)
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span className="text-rose-400">▲ Critical &ge;75</span>
              <span className="text-amber-400">◆ High 55–74</span>
              <span className="text-cyan-400">● Mod 30–54</span>
              <span className="text-emerald-400">✓ Low &lt;30</span>
            </div>
          </div>
        </div>

        {/* Selected Location Intelligence Drawer */}
        {panelOpen && (
          <div className="lg:col-span-5 xl:col-span-4 bg-[#111719] border border-[#1E282B] rounded-lg p-5 flex flex-col justify-between overflow-y-auto lg:max-h-[680px]">
            <div className="space-y-4">
              <div className="border-b border-[#1E282B] pb-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#7E948E]">
                  <span>
                    {selectedRegion.code} · {selectedRegion.state}
                  </span>
                  <span>Sample Demo Coord</span>
                </div>
                <h2 className="text-lg font-semibold text-[#F0F5F3] mt-1">
                  {selectedRegion.name}
                </h2>
                <div className="text-xs font-mono text-cyan-400 mt-1 tabular-nums">
                  {formatCoord(
                    selectedVeg?.hotspotLat ?? selectedRegion.centerLat,
                    selectedVeg?.hotspotLng ?? selectedRegion.centerLng
                  )}
                </div>
                <div className="text-xs text-[#7E948E] mt-1">
                  Observation date: {formatShortDate(selectedRegion.lastPassDate)} · Officer:{' '}
                  {selectedRegion.assignedOfficer}
                </div>
              </div>

              {/* NDVI Telemetry Block */}
              {selectedVeg && (
                <div className="grid grid-cols-3 gap-2 bg-[#0C1112] border border-[#1E282B] rounded p-3">
                  <div>
                    <div className="text-[11px] text-[#7E948E]">Prev NDVI</div>
                    <div className="text-base font-mono font-semibold tabular-nums text-[#D8E3E0]">
                      {selectedVeg.previousNdvi.toFixed(3)}
                    </div>
                    <div className="text-[10px] font-mono text-[#657973]">
                      {selectedVeg.previousDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#7E948E]">Curr NDVI</div>
                    <div className="text-base font-mono font-semibold tabular-nums text-[#F0F5F3]">
                      {selectedVeg.currentNdvi.toFixed(3)}
                    </div>
                    <div className="text-[10px] font-mono text-[#657973]">
                      {selectedVeg.currentDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#7E948E]">Change %</div>
                    <div
                      className={`text-base font-mono font-semibold tabular-nums ${
                        selectedVeg.changePercent <= -15 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {selectedVeg.changePercent > 0 ? '+' : ''}
                      {selectedVeg.changePercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] font-mono text-[#657973]">
                      {selectedVeg.affectedAreaHectares} ha
                    </div>
                  </div>
                </div>
              )}

              {/* Risk & Confidence */}
              {selectedRisk && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-[#7E948E]">Calculated Risk Score</div>
                      <div className="text-xl font-mono font-semibold tabular-nums text-[#F0F5F3]">
                        {selectedRisk.riskScore.toFixed(1)}{' '}
                        <span className={`text-xs font-sans font-medium ${getRiskTextColor(selectedRisk.classification)}`}>
                          · {selectedRisk.classification}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-[#7E948E]">Confidence</div>
                      <div className="text-xl font-mono font-semibold tabular-nums text-cyan-400">
                        {selectedRisk.confidence.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#B5C4BF] leading-relaxed">
                    {selectedRisk.explanation}
                  </p>

                  <div className="p-2.5 bg-amber-500/5 border border-amber-500/20 rounded text-[11px] text-amber-200/90 flex items-start gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{selectedRisk.incidentStatusNotice}</span>
                  </div>
                </div>
              )}

              {/* Environmental Observations */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#E2ECE9] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                  Environmental Signals ({selectedSignals.length})
                </h3>
                <div className="divide-y divide-[#1A2326] border border-[#1E282B] rounded bg-[#0D1214]">
                  {selectedSignals.map((sig) => (
                    <div key={sig.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#D8E3E0] font-medium truncate">{sig.label}</span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            sig.availabilityStatus === 'available'
                              ? 'text-[#F0F5F3]'
                              : 'text-[#7E948E]'
                          }`}
                        >
                          {sig.availabilityStatus === 'available' && sig.measuredValue !== null
                            ? `${sig.measuredValue} ${sig.unit}`
                            : sig.availabilityStatus.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#7E948E] mt-0.5">
                        {sig.source} · {sig.baselineComparison}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Field Verification */}
              {selectedRisk && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#E2ECE9]">
                    Recommended Field Verification
                  </div>
                  <p className="text-xs text-[#9FB2AC] leading-relaxed">
                    {selectedRisk.suggestedVerificationAction}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 mt-4 border-t border-[#1E282B] grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => onNavigate('satellite')}
                className="px-3 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer"
              >
                Satellite Analysis
              </button>
              {selectedAlert ? (
                <button
                  onClick={() => onInspectAlert(selectedAlert.id)}
                  className="px-3 py-2 text-xs font-medium bg-[#182224] hover:bg-[#1F2C2F] text-[#E6ECEA] border border-[#273538] rounded transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
                >
                  Open Alert
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={() => onNavigate('analyst')}
                  className="px-3 py-2 text-xs font-medium bg-[#182224] hover:bg-[#1F2C2F] text-[#E6ECEA] border border-[#273538] rounded transition-colors cursor-pointer"
                >
                  Ask AI Analyst
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
