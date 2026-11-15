import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BellRing,
  Database,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Satellite,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { AiAnalyst } from './components/AiAnalyst';
import { AlertsInvestigations } from './components/AlertsInvestigations';
import { CommandCentre } from './components/CommandCentre';
import { DataSources } from './components/DataSources';
import { EnvironmentalSignals } from './components/EnvironmentalSignals';
import { ForestMap } from './components/ForestMap';
import { RiskIntelligence } from './components/RiskIntelligence';
import { SatelliteAnalysis } from './components/SatelliteAnalysis';
import { Settings } from './components/Settings';
import { api } from './services/api';
import type { SystemSnapshot, User } from './types/sylvasense';

export type NavSection =
  | 'command'
  | 'map'
  | 'satellite'
  | 'risk'
  | 'signals'
  | 'alerts'
  | 'analyst'
  | 'sources'
  | 'settings';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'command', label: 'Command Centre', icon: LayoutDashboard },
  { id: 'map', label: 'Forest Intelligence Map', icon: MapIcon },
  { id: 'satellite', label: 'Satellite Analysis', icon: Satellite },
  { id: 'risk', label: 'Risk Intelligence', icon: ShieldAlert },
  { id: 'signals', label: 'Environmental Signals', icon: Activity },
  { id: 'alerts', label: 'Alerts & Investigations', icon: BellRing },
  { id: 'analyst', label: 'AI Analyst', icon: Sparkles },
  { id: 'sources', label: 'Data Sources', icon: Database },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('command');
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [selectedRegionId, setSelectedRegionId] = useState<string>('reg-nilgiri');
  const [selectedAlertId, setSelectedAlertId] = useState<string>('alt-nil-01');
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [analystAutoPrompt, setAnalystAutoPrompt] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.getSnapshot();
      setSnapshot(data);
      setActiveUser((prev) => prev ?? data.users[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SylvaSense telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot(false);
  }, [loadSnapshot]);

  const handleNavigate = (section: NavSection) => {
    setActiveSection(section);
    setMobileNavOpen(false);
  };

  const handleInspectAlert = (alertId: string) => {
    setSelectedAlertId(alertId);
    const alert = snapshot?.alerts.find((a) => a.id === alertId);
    if (alert) setSelectedRegionId(alert.regionId);
    setActiveSection('alerts');
    setMobileNavOpen(false);
  };

  const handleAskAnalystForAlert = (alertId: string, regionId: string) => {
    setSelectedAlertId(alertId);
    setSelectedRegionId(regionId);
    setAnalystAutoPrompt(
      `Generate a concise, evidence-grounded investigation brief for alert ${alertId}, citing observed NDVI changes, environmental signals, missing evidence, and recommended next verification steps.`
    );
    setActiveSection('analyst');
  };

  if (loading && !snapshot) {
    return (
      <div className="min-h-screen bg-[#0A0D0E] text-[#E6ECEA] flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-3 text-center">
          <div className="text-base font-display font-semibold tracking-tight text-emerald-400">
            SYLVASENSE
          </div>
          <div className="text-sm text-[#8CA09A]">
            Loading Western Ghats environmental intelligence telemetry...
          </div>
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="min-h-screen bg-[#0A0D0E] text-[#E6ECEA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#111719] border border-rose-500/30 rounded-lg p-6 space-y-3">
          <div className="text-sm font-semibold text-rose-400">Backend Connection Error</div>
          <p className="text-xs text-[#B5C4BF]">{error}</p>
          <button
            onClick={() => loadSnapshot(false)}
            className="px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const activeRegion =
    snapshot.regions.find((r) => r.id === selectedRegionId) ?? snapshot.regions[0];
  const openAlertsCount = snapshot.alerts.filter(
    (a) => a.status !== 'Verified' && a.status !== 'Dismissed'
  ).length;

  return (
    <div className="min-h-screen bg-[#0A0D0E] text-[#E6ECEA] flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0E1315] border-b border-[#1E282B] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="p-1.5 text-[#D8E3E0] hover:text-white cursor-pointer"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-display font-bold tracking-tight text-base text-[#F0F5F3]">
            SYLVASENSE
          </span>
        </div>
        <span className="text-[11px] font-mono text-amber-300">DEMO DATA</span>
      </div>

      {/* Left Navigation Sidebar */}
      <aside
        className={`${
          mobileNavOpen ? 'fixed inset-0 top-12 z-40 block' : 'hidden'
        } lg:block lg:w-64 lg:shrink-0 bg-[#0D1214] border-r border-[#1E282B] flex flex-col justify-between`}
      >
        <div className="p-5 space-y-6">
          {/* Brand Block */}
          <div className="hidden lg:block border-b border-[#1E282B] pb-4">
            <div className="font-display font-bold tracking-tight text-lg text-[#F0F5F3] whitespace-nowrap">
              SYLVASENSE
            </div>
            <div className="text-[11px] text-[#7E948E] mt-0.5">
              Detect the signals. Protect the forests.
            </div>
            <div className="text-[11px] font-mono text-[#657973] mt-1">By ZENVORA</div>
          </div>

          {/* 9 Navigation Modules */}
          <nav className="space-y-1" aria-label="Primary Sidebar Navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#172424] text-emerald-300 font-semibold border border-emerald-500/30'
                      : 'text-[#9FB2AC] hover:text-[#F0F5F3] hover:bg-[#131A1C] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'alerts' && openAlertsCount > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-amber-300">
                      {openAlertsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Operator & Provenance Footer */}
        <div className="p-4 border-t border-[#1E282B] text-xs space-y-2 bg-[#0B1011]">
          <div
            className={`text-[11px] font-mono ${
              snapshot.provenanceMode === 'live' ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {snapshot.provenanceMode === 'live'
              ? 'LIVE TELEMETRY ACTIVE'
              : snapshot.provenanceMode === 'hybrid'
                ? 'DEMO DATA + LIVE FEEDS'
                : 'DEMO DATA · SAMPLE COORDINATES'}
          </div>
          {activeUser && (
            <div>
              <div className="font-medium text-[#E6ECEA] truncate">{activeUser.name}</div>
              <div className="text-[11px] text-[#7E948E] truncate">{activeUser.role}</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Context Ribbon */}
        <header className="hidden lg:flex items-center justify-between gap-6 px-6 py-3 bg-[#0D1214] border-b border-[#1E282B]">
          <div className="flex items-center gap-2 text-xs text-[#8CA09A] min-w-0">
            <span className="text-[#F0F5F3] font-medium whitespace-nowrap">
              {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
            </span>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-cyan-400 truncate">
              {activeRegion.code} · {activeRegion.name}
            </span>
          </div>

          <div className="flex items-center gap-5 text-xs shrink-0">
            <span
              className={`font-mono whitespace-nowrap ${
                snapshot.provenanceMode === 'live' ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {snapshot.provenanceMode === 'live'
                ? 'LIVE DATA MODE'
                : snapshot.provenanceMode === 'hybrid'
                  ? 'DEMO DATA + LIVE FEEDS'
                  : 'DEMO DATA MODE — Simulated Western Ghats Archive'}
            </span>
            <button
              onClick={() => handleNavigate('sources')}
              className="text-xs font-medium text-[#D8E3E0] hover:text-emerald-300 whitespace-nowrap cursor-pointer"
            >
              Data Source Manager
            </button>
          </div>
        </header>

        {/* Active Module Canvas */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {activeSection === 'command' && (
            <CommandCentre
              snapshot={snapshot}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onNavigate={handleNavigate}
              onInspectAlert={handleInspectAlert}
            />
          )}

          {activeSection === 'map' && (
            <ForestMap
              snapshot={snapshot}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onNavigate={handleNavigate}
              onInspectAlert={handleInspectAlert}
            />
          )}

          {activeSection === 'satellite' && (
            <SatelliteAnalysis
              snapshot={snapshot}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onSnapshotUpdate={setSnapshot}
            />
          )}

          {activeSection === 'risk' && (
            <RiskIntelligence
              snapshot={snapshot}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onSnapshotUpdate={setSnapshot}
            />
          )}

          {activeSection === 'signals' && (
            <EnvironmentalSignals
              snapshot={snapshot}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onSnapshotUpdate={setSnapshot}
            />
          )}

          {activeSection === 'alerts' && (
            <AlertsInvestigations
              snapshot={snapshot}
              selectedAlertId={selectedAlertId}
              onSelectAlert={setSelectedAlertId}
              onSnapshotUpdate={setSnapshot}
              onAskAnalystForAlert={handleAskAnalystForAlert}
            />
          )}

          {activeSection === 'analyst' && (
            <AiAnalyst
              snapshot={snapshot}
              selectedRegionId={selectedRegionId}
              selectedAlertId={selectedAlertId}
              autoRunPrompt={analystAutoPrompt}
              onClearAutoRunPrompt={() => setAnalystAutoPrompt(null)}
            />
          )}

          {activeSection === 'sources' && (
            <DataSources
              snapshot={snapshot}
              onRefresh={() => loadSnapshot(true)}
              onSnapshotUpdate={setSnapshot}
              refreshing={refreshing}
            />
          )}

          {activeSection === 'settings' && activeUser && (
            <Settings
              snapshot={snapshot}
              activeUser={activeUser}
              onChangeUser={setActiveUser}
              onSnapshotUpdate={setSnapshot}
            />
          )}
        </main>
      </div>
    </div>
  );
}
