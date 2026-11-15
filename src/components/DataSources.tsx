import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  PlugZap,
  RefreshCw,
  ServerCrash,
} from 'lucide-react';
import { api } from '../services/api';
import type { DataSourceState, DataSourceTestResult, SystemSnapshot } from '../types/sylvasense';
import { formatTimestamp } from '../utils/formatters';

interface DataSourcesProps {
  snapshot: SystemSnapshot;
  onRefresh: () => Promise<void>;
  onSnapshotUpdate: (next: SystemSnapshot) => void;
  refreshing: boolean;
}

function getStateDisplay(state: DataSourceState): {
  color: string;
  icon: React.ReactNode;
} {
  switch (state) {
    case 'Live':
      return {
        color: 'text-emerald-400',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      };
    case 'Demo':
      return {
        color: 'text-amber-300',
        icon: <FlaskConical className="w-3.5 h-3.5" />,
      };
    case 'Disconnected':
      return {
        color: 'text-slate-400',
        icon: <ServerCrash className="w-3.5 h-3.5" />,
      };
    case 'Error':
      return {
        color: 'text-rose-400',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
      };
  }
}

export const DataSources: React.FC<DataSourcesProps> = ({
  snapshot,
  onRefresh,
  onSnapshotUpdate,
  refreshing,
}) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, DataSourceTestResult>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const handleTestOne = async (sourceId: string) => {
    setTestingId(sourceId);
    setActionError(null);
    try {
      const res = await api.testDataSource(sourceId);
      setTestResults((prev) => ({ ...prev, [sourceId]: res.result }));
      onSnapshotUpdate(res.snapshot);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Connection test failed.');
    } finally {
      setTestingId(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    setActionError(null);
    try {
      const res = await api.testAllDataSources();
      const map: Record<string, DataSourceTestResult> = {};
      for (const r of res.results) {
        map[r.sourceId] = r;
      }
      setTestResults(map);
      onSnapshotUpdate(res.snapshot);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Batch connection check failed.');
    } finally {
      setTestingAll(false);
    }
  };

  const counts = {
    Live: snapshot.dataSources.filter((d) => d.state === 'Live').length,
    Demo: snapshot.dataSources.filter((d) => d.state === 'Demo').length,
    Disconnected: snapshot.dataSources.filter((d) => d.state === 'Disconnected').length,
    Error: snapshot.dataSources.filter((d) => d.state === 'Error').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-cyan-400">
            Central Data-Source Status Manager · Live / Demo / Disconnected / Error States
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Data Sources &amp; Connectivity Diagnostics
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1 max-w-3xl">
            Run backend connection checks for Copernicus Sentinel-2, OpenWeather, optional Google Earth Engine, and Gemini AI. Missing credentials fall back gracefully to labeled Demo data without blocking any workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={handleTestAll}
            disabled={testingAll}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded cursor-pointer whitespace-nowrap"
          >
            <PlugZap className="w-3.5 h-3.5" />
            {testingAll ? 'Running Diagnostics...' : 'Test All Connections'}
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#141C1E] hover:bg-[#1B2528] text-[#E6ECEA] border border-[#253236] rounded cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Snapshot'}
          </button>
        </div>
      </div>

      {/* Central Status Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1E282B] border border-[#1E282B] rounded-lg overflow-hidden">
        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Live Connectors</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-emerald-400 mt-1">
            {counts.Live}
          </div>
        </div>
        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Demo Fallback Active</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-amber-300 mt-1">
            {counts.Demo}
          </div>
        </div>
        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Disconnected</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-[#9FB2AC] mt-1">
            {counts.Disconnected}
          </div>
        </div>
        <div className="bg-[#111719] p-4">
          <div className="text-xs text-[#7E948E]">Auth / Upstream Errors</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-rose-400 mt-1">
            {counts.Error}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {snapshot.dataSources.map((ds) => {
          const stateDisplay = getStateDisplay(ds.state);
          const latestTest = testResults[ds.id];
          const isTesting = testingId === ds.id || testingAll;

          return (
            <div
              key={ds.id}
              className="bg-[#111719] border border-[#1E282B] rounded-lg p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-[#7E948E] uppercase">
                    {ds.category}
                    {ds.optional ? ' · optional' : ''}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 font-medium ${stateDisplay.color}`}>
                    {stateDisplay.icon}
                    {ds.state}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#F0F5F3]">{ds.name}</h2>
                    <div className="text-xs text-[#8CA09A] mt-0.5">
                      {ds.provider} · Payload:{' '}
                      <span className="font-mono text-[#D8E3E0]">
                        {ds.dataMode.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTestOne(ds.id)}
                    disabled={isTesting}
                    className="px-3 py-1.5 text-xs font-medium bg-[#172022] hover:bg-[#1F2C2F] border border-[#273538] rounded text-[#E6ECEA] cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>

                {/* Live Test Diagnostic Result or Error / Fallback Explanation */}
                {latestTest ? (
                  <div
                    className={`p-2.5 rounded border text-xs space-y-1 ${
                      latestTest.ok && latestTest.state === 'Live'
                        ? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-200'
                        : latestTest.state === 'Error'
                          ? 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                          : 'bg-[#0C1112] border-[#243033] text-[#C8D5D1]'
                    }`}
                  >
                    <div className="font-medium flex items-center justify-between gap-2">
                      <span>{latestTest.message}</span>
                      <span className="font-mono text-[11px] tabular-nums shrink-0">
                        {latestTest.latencyMs}ms
                      </span>
                    </div>
                    {latestTest.details && (
                      <div className="text-[11px] opacity-85">{latestTest.details}</div>
                    )}
                  </div>
                ) : ds.errorStatus ? (
                  <div className="p-2.5 bg-[#0C1112] border border-[#243033] rounded text-xs text-[#B5C4BF]">
                    {ds.errorStatus}
                  </div>
                ) : (
                  <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded text-xs text-emerald-200/90">
                    Connector operational and verified in server runtime.
                  </div>
                )}

                <div className="text-[11px] text-[#8CA09A] flex items-start gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#C8D5D1]">Fallback behavior:</strong> {ds.fallbackBehavior}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#1E282B] text-[11px] font-mono text-[#7E948E] space-y-1">
                <div className="flex justify-between gap-2">
                  <span>Freshness:</span>
                  <span className="text-[#D8E3E0]">{ds.freshnessLabel}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Last Tested:</span>
                  <span className="text-[#D8E3E0] tabular-nums">
                    {ds.lastTestedAt ? formatTimestamp(ds.lastTestedAt) : 'Not tested yet'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Last Sync:</span>
                  <span className="text-[#D8E3E0] tabular-nums">
                    {formatTimestamp(ds.lastSuccessfulUpdate)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Env Vars:</span>
                  <span className="text-cyan-400 truncate max-w-[260px]">
                    {ds.envVars.length > 0 ? ds.envVars.join(', ') : 'None required'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
