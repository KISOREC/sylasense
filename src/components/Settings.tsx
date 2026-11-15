import React, { useState } from 'react';
import { RotateCcw, Shield, TerminalSquare } from 'lucide-react';
import { api } from '../services/api';
import type { SystemSnapshot, User } from '../types/sylvasense';
import { formatTimestamp } from '../utils/formatters';

interface SettingsProps {
  snapshot: SystemSnapshot;
  activeUser: User;
  onChangeUser: (user: User) => void;
  onSnapshotUpdate: (next: SystemSnapshot) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  snapshot,
  activeUser,
  onChangeUser,
  onSnapshotUpdate,
}) => {
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleResetDemo = async () => {
    setResetting(true);
    setMessage(null);
    try {
      const next = await api.resetDemo();
      onSnapshotUpdate(next);
      setMessage('Demonstration dataset and risk weights restored to initial Western Ghats baseline.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E282B] pb-4">
        <p className="text-xs font-mono text-emerald-400">
          Workspace Configuration, Operator Role &amp; Audit Trail
        </p>
        <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
          Platform Settings &amp; Audit Logs
        </h1>
        <p className="text-sm text-[#8CA09A] mt-1">
          Switch active demonstration operator profile, reset seeded datasets, and inspect persisted action logs.
        </p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#F0F5F3] flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              Active Operator Profile
            </h2>
            <div className="space-y-2">
              {snapshot.users.map((u) => {
                const selected = u.id === activeUser.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => onChangeUser(u)}
                    className={`w-full text-left p-3 rounded border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#162122] border-emerald-500/70'
                        : 'bg-[#0C1112] border-[#1E282B] hover:border-[#2C3A3E]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#F0F5F3]">{u.name}</div>
                    <div className="text-[11px] text-[#8CA09A] mt-0.5">
                      {u.role} · {u.division}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#111719] border border-[#1E282B] rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#F0F5F3]">Demo State Controls</h2>
            <p className="text-xs text-[#8CA09A] leading-relaxed">
              Reset all investigation status changes, evidence attachments, and custom risk weights back to the initial Western Ghats seed state.
            </p>
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#182224] hover:bg-[#1F2C2F] text-[#E6ECEA] border border-[#273538] rounded cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resetting ? 'Resetting...' : 'Reset Demo Dataset'}
            </button>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="lg:col-span-7 bg-[#111719] border border-[#1E282B] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#1E282B] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F0F5F3] flex items-center gap-2">
              <TerminalSquare className="w-4 h-4 text-cyan-400" />
              System &amp; Investigation Audit Logs
            </h2>
            <span className="text-xs font-mono text-[#7E948E]">
              {snapshot.auditLogs.length} entries
            </span>
          </div>
          <div className="divide-y divide-[#1A2326] max-h-[520px] overflow-y-auto">
            {snapshot.auditLogs.map((log) => (
              <div key={log.id} className="p-3.5 text-xs">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#7E948E]">
                  <span>
                    {log.actor} · {log.targetType}
                  </span>
                  <span className="tabular-nums">{formatTimestamp(log.timestamp)}</span>
                </div>
                <div className="font-medium text-[#E6ECEA] mt-1">{log.action}</div>
                <div className="text-[#8CA09A] mt-0.5">{log.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
