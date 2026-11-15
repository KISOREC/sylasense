import type { InvestigationStatus, RiskTier } from '../types/sylvasense';

export function formatNumber(val: number): string {
  return new Intl.NumberFormat('en-IN').format(val);
}

export function formatCoord(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Unavailable';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getRiskTextColor(tier: RiskTier): string {
  switch (tier) {
    case 'Critical priority':
      return 'text-rose-400';
    case 'High priority':
      return 'text-amber-400';
    case 'Moderate risk':
      return 'text-cyan-400';
    case 'Low risk':
      return 'text-emerald-400';
  }
}

export function getRiskGlyph(tier: RiskTier): string {
  switch (tier) {
    case 'Critical priority':
      return '▲';
    case 'High priority':
      return '◆';
    case 'Moderate risk':
      return '●';
    case 'Low risk':
      return '✓';
  }
}

export function getStatusTextColor(status: InvestigationStatus): string {
  switch (status) {
    case 'New':
      return 'text-cyan-400';
    case 'Under Review':
      return 'text-amber-300';
    case 'Field Verification Required':
      return 'text-rose-400';
    case 'Verified':
      return 'text-emerald-400';
    case 'Dismissed':
      return 'text-slate-400';
  }
}
