import React, { useEffect, useMemo, useState } from 'react';
import { Download, FilePlus2, Sparkles, UserCheck } from 'lucide-react';
import { api } from '../services/api';
import type {
  EvidenceRecord,
  InvestigationStatus,
  RiskTier,
  SystemSnapshot,
} from '../types/sylvasense';
import {
  formatCoord,
  formatTimestamp,
  getRiskGlyph,
  getRiskTextColor,
  getStatusTextColor,
} from '../utils/formatters';

interface AlertsInvestigationsProps {
  snapshot: SystemSnapshot;
  selectedAlertId: string;
  onSelectAlert: (alertId: string) => void;
  onSnapshotUpdate: (next: SystemSnapshot) => void;
  onAskAnalystForAlert: (alertId: string, regionId: string) => void;
}

const ALL_STATUSES: InvestigationStatus[] = [
  'New',
  'Under Review',
  'Field Verification Required',
  'Verified',
  'Dismissed',
];

export const AlertsInvestigations: React.FC<AlertsInvestigationsProps> = ({
  snapshot,
  selectedAlertId,
  onSelectAlert,
  onSnapshotUpdate,
  onAskAnalystForAlert,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | RiskTier>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | InvestigationStatus>('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'Tamil Nadu' | 'Kerala'>('all');

  const filteredAlerts = useMemo(() => {
    return snapshot.alerts.filter((a) => {
      const reg = snapshot.regions.find((r) => r.id === a.regionId);
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (stateFilter !== 'all' && reg?.state !== stateFilter) return false;
      return true;
    });
  }, [snapshot.alerts, snapshot.regions, severityFilter, statusFilter, stateFilter]);

  const activeAlert =
    filteredAlerts.find((a) => a.id === selectedAlertId) ??
    snapshot.alerts.find((a) => a.id === selectedAlertId) ??
    filteredAlerts[0] ??
    snapshot.alerts[0];

  const activeRegion = snapshot.regions.find((r) => r.id === activeAlert?.regionId);
  const activeInvestigation = snapshot.investigations.find(
    (i) => i.alertId === activeAlert?.id
  );
  const activeEvidence = snapshot.evidence.filter((e) => e.alertId === activeAlert?.id);
  const activeAssessment = snapshot.assessments.find((a) => a.regionId === activeAlert?.regionId);

  const [nextStatus, setNextStatus] = useState<InvestigationStatus>(
    activeAlert?.status ?? 'Under Review'
  );
  const [assignedOfficer, setAssignedOfficer] = useState<string>(
    activeAlert?.assignedOfficer ?? 'Arjun Menon'
  );
  const [verificationAction, setVerificationAction] = useState<string>(
    activeInvestigation?.verificationAction ?? ''
  );

  useEffect(() => {
    if (activeAlert) {
      setNextStatus(activeAlert.status);
      setAssignedOfficer(activeAlert.assignedOfficer);
    }
    if (activeInvestigation) {
      setVerificationAction(activeInvestigation.verificationAction);
    }
  }, [activeAlert?.id, activeAlert?.status, activeAlert?.assignedOfficer, activeInvestigation?.verificationAction]);
  const [noteText, setNoteText] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Evidence attachment form state
  const [evKind, setEvKind] = useState<EvidenceRecord['kind']>('ranger_note');
  const [evTitle, setEvTitle] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [addingEvidence, setAddingEvidence] = useState(false);

  const handleSelectAlertItem = (alertId: string) => {
    onSelectAlert(alertId);
    const al = snapshot.alerts.find((x) => x.id === alertId);
    const inv = snapshot.investigations.find((x) => x.alertId === alertId);
    if (al) {
      setNextStatus(al.status);
      setAssignedOfficer(al.assignedOfficer);
    }
    if (inv) {
      setVerificationAction(inv.verificationAction);
    }
    setFeedbackMsg(null);
    setErrorMsg(null);
  };

  const handleSaveInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlert) return;
    setSavingUpdate(true);
    setFeedbackMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.updateAlert(activeAlert.id, {
        status: nextStatus,
        assignedOfficer,
        verificationAction,
        noteText,
        author: assignedOfficer,
      });
      onSnapshotUpdate(res.snapshot);
      setNoteText('');
      setFeedbackMsg(`Updated investigation status to "${nextStatus}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update investigation.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlert || !evTitle.trim() || !evSummary.trim()) return;
    setAddingEvidence(true);
    setFeedbackMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.addEvidence(activeAlert.id, {
        kind: evKind,
        title: evTitle,
        summary: evSummary,
        source: 'Officer Field Log',
        recordedBy: assignedOfficer,
      });
      onSnapshotUpdate(res.snapshot);
      setEvTitle('');
      setEvSummary('');
      setFeedbackMsg('Evidence record attached to investigation file.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to attach evidence.');
    } finally {
      setAddingEvidence(false);
    }
  };

  const handleExportReport = () => {
    if (!activeAlert || !activeRegion) return;
    const reportObj = {
      exportedAt: new Date().toISOString(),
      disclaimer: snapshot.demoNotice,
      alert: activeAlert,
      region: activeRegion,
      riskAssessment: activeAssessment,
      investigation: activeInvestigation,
      evidenceRecords: activeEvidence,
    };
    const blob = new Blob([JSON.stringify(reportObj, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sylvasense-investigation-${activeAlert.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[#1E282B] pb-4">
        <div>
          <p className="text-xs font-mono text-emerald-400">
            Evidence-Driven Triage &amp; Case Resolution Workflow
          </p>
          <h1 className="text-2xl font-semibold text-[#F0F5F3] tracking-tight mt-1">
            Alerts &amp; Investigations Inbox
          </h1>
          <p className="text-sm text-[#8CA09A] mt-1">
            Review suspicious environmental alerts, examine attached telemetry, assign range officers, and record ground verification outcomes.
          </p>
        </div>

        {activeAlert && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onAskAnalystForAlert(activeAlert.id, activeAlert.regionId)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Summarize with Sylva Analyst
            </button>
            <button
              onClick={handleExportReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#141C1E] hover:bg-[#1B2528] text-[#E6ECEA] border border-[#253236] rounded cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export Case File
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-[#111719] border border-[#1E282B] rounded-lg px-4 py-3">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | RiskTier)}
          aria-label="Filter by severity"
          className="px-3 py-1.5 text-xs bg-[#0B1011] border border-[#243135] rounded text-[#E6ECEA]"
        >
          <option value="all">All Severities</option>
          <option value="Critical priority">Critical priority</option>
          <option value="High priority">High priority</option>
          <option value="Moderate risk">Moderate risk</option>
          <option value="Low risk">Low risk</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | InvestigationStatus)}
          aria-label="Filter by investigation status"
          className="px-3 py-1.5 text-xs bg-[#0B1011] border border-[#243135] rounded text-[#E6ECEA]"
        >
          <option value="all">All Investigation Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as 'all' | 'Tamil Nadu' | 'Kerala')}
          aria-label="Filter by state"
          className="px-3 py-1.5 text-xs bg-[#0B1011] border border-[#243135] rounded text-[#E6ECEA]"
        >
          <option value="all">All States (TN &amp; KL)</option>
          <option value="Tamil Nadu">Tamil Nadu</option>
          <option value="Kerala">Kerala</option>
        </select>
      </div>

      {/* Inbox Split View */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="xl:col-span-5 bg-[#111719] border border-[#1E282B] rounded-lg divide-y divide-[#1A2326]">
          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#7E948E]">
              No alerts match the selected filters.
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const region = snapshot.regions.find((r) => r.id === alert.regionId);
              const isSelected = activeAlert?.id === alert.id;
              return (
                <button
                  key={alert.id}
                  onClick={() => handleSelectAlertItem(alert.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#162122]' : 'hover:bg-[#151D1F]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className={getRiskTextColor(alert.severity)}>
                      {getRiskGlyph(alert.severity)} {alert.severity} · {alert.riskScore.toFixed(1)}
                    </span>
                    <span className={getStatusTextColor(alert.status)}>{alert.status}</span>
                  </div>
                  <div className="text-sm font-medium text-[#F0F5F3] mt-1">{alert.title}</div>
                  <div className="text-xs text-[#7E948E] mt-1 font-mono">
                    {region?.code} · {region?.state} · Officer: {alert.assignedOfficer}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail Workspace */}
        {activeAlert && (
          <div className="xl:col-span-7 bg-[#111719] border border-[#1E282B] rounded-lg p-5 space-y-5">
            <div className="border-b border-[#1E282B] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span className={getRiskTextColor(activeAlert.severity)}>
                  {getRiskGlyph(activeAlert.severity)} {activeAlert.severity} · Risk{' '}
                  {activeAlert.riskScore.toFixed(1)}/100 · Conf {activeAlert.confidence.toFixed(0)}%
                </span>
                <span className="text-[#7E948E]">
                  {activeRegion?.name} · {formatCoord(activeAlert.lat, activeAlert.lng)}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-[#F0F5F3] mt-1.5">{activeAlert.title}</h2>
              <p className="text-xs text-[#B5C4BF] mt-1.5 leading-relaxed">{activeAlert.summary}</p>
            </div>

            {feedbackMsg && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300">
                {feedbackMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            {/* Update Investigation Form */}
            <form onSubmit={handleSaveInvestigation} className="space-y-3 border-b border-[#1E282B] pb-5">
              <h3 className="text-xs font-semibold text-[#E2ECE9] flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                Record Verification Action &amp; Status Update
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="text-[#8CA09A]">Investigation Status</span>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as InvestigationStatus)}
                    className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs">
                  <span className="text-[#8CA09A]">Assigned Officer</span>
                  <select
                    value={assignedOfficer}
                    onChange={(e) => setAssignedOfficer(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                  >
                    {snapshot.users.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs">
                <span className="text-[#8CA09A]">Verification Action</span>
                <input
                  type="text"
                  value={verificationAction}
                  onChange={(e) => setVerificationAction(e.target.value)}
                  placeholder="e.g., Dispatched beat patrol for GPS photo verification"
                  className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                />
              </label>

              <label className="block text-xs">
                <span className="text-[#8CA09A]">Add Investigation Note</span>
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Document field verification observations, boundary checks, or rationale..."
                  className="mt-1 w-full px-2.5 py-1.5 bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                />
              </label>

              <button
                type="submit"
                disabled={savingUpdate}
                className="px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer disabled:opacity-60"
              >
                {savingUpdate ? 'Saving Update...' : 'Save Investigation Update'}
              </button>
            </form>

            {/* Evidence Records + Attach Evidence */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#E2ECE9]">
                Attached Evidence Records ({activeEvidence.length})
              </h3>
              <div className="divide-y divide-[#1A2326] border border-[#1E282B] rounded bg-[#0C1112]">
                {activeEvidence.length === 0 ? (
                  <div className="p-3 text-xs text-[#7E948E]">
                    No evidence attachments recorded yet for this alert.
                  </div>
                ) : (
                  activeEvidence.map((ev) => (
                    <div key={ev.id} className="p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#EAEFED]">{ev.title}</span>
                        <span className="font-mono text-[11px] text-[#7E948E]">
                          {ev.kind.replace('_', ' ')} · {ev.dataMode}
                        </span>
                      </div>
                      <p className="text-[#9FB2AC] mt-1">{ev.summary}</p>
                      <div className="text-[11px] font-mono text-[#6B807A] mt-1">
                        {ev.source} · Recorded by {ev.recordedBy} · {formatTimestamp(ev.recordedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddEvidence} className="pt-2 space-y-2.5">
                <div className="text-xs font-medium text-[#D8E3E0] flex items-center gap-1.5">
                  <FilePlus2 className="w-3.5 h-3.5 text-cyan-400" />
                  Attach Field / Sensor Evidence
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={evKind}
                    onChange={(e) => setEvKind(e.target.value as EvidenceRecord['kind'])}
                    className="px-2.5 py-1.5 text-xs bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                  >
                    <option value="ranger_note">Ranger Field Note</option>
                    <option value="satellite_spectral">Satellite Spectral</option>
                    <option value="acoustic_clip">Acoustic Clip</option>
                    <option value="weather_anomaly">Weather Anomaly</option>
                    <option value="soil_telemetry">Soil Telemetry</option>
                  </select>
                  <input
                    type="text"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="Evidence title..."
                    className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={evSummary}
                    onChange={(e) => setEvSummary(e.target.value)}
                    placeholder="Concise summary of observed field or sensor evidence..."
                    className="flex-1 px-2.5 py-1.5 text-xs bg-[#0B1011] border border-[#253236] rounded text-[#E6ECEA]"
                  />
                  <button
                    type="submit"
                    disabled={addingEvidence || !evTitle.trim() || !evSummary.trim()}
                    className="px-3.5 py-1.5 text-xs font-medium bg-[#182224] hover:bg-[#1F2C2F] text-[#E6ECEA] border border-[#273538] rounded cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {addingEvidence ? 'Attaching...' : 'Attach'}
                  </button>
                </div>
              </form>
            </div>

            {/* Investigation Timeline Notes */}
            {activeInvestigation && activeInvestigation.notes.length > 0 && (
              <div className="pt-3 border-t border-[#1E282B] space-y-2">
                <h3 className="text-xs font-semibold text-[#E2ECE9]">Investigation Log</h3>
                <div className="space-y-2">
                  {activeInvestigation.notes.map((n) => (
                    <div key={n.id} className="text-xs bg-[#0C1112] border border-[#1A2326] rounded p-2.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#7E948E]">
                        <span>
                          {n.author} ({n.role})
                        </span>
                        <span>{formatTimestamp(n.timestamp)}</span>
                      </div>
                      <p className="text-[#C8D5D1] mt-1">{n.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
