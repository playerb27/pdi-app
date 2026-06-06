'use client';
import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, ZoomIn, Check } from 'lucide-react';
import type { Study } from '@/lib/api';
import { normalizeBiomarkerName, chartBiomarkerElementId } from '@/lib/biomarkers';
import { getCatalogEntry } from '@/lib/biomarker-catalog';
import ExpandedChartModal, { type ChartSeries } from './ExpandedChartModal';


interface BiomarkerTimeSeries {
  name: string;
  unit: string;
  system: string;
  referenceRange?: string;
  points: {
    date: string;
    value: number;
    flag: string;
    biomarkerId?: string;
    studyId?: string;
    suspicious?: boolean;
    isEdited?: boolean;
    originalValue?: string | null;
  }[];
}

interface Props {
  studies: Study[];
  patientId: string;
  glowId?: string | null;
  compareMode?: boolean;
  selectedForCompare?: Set<string>;
  onToggleCompare?: (name: string) => void;
  onBiomarkerUpdated?: (studyId: string, biomarkerId: string, newValue: string, newFlag: string) => void;
  /** Called when the user saves new reference limits in the modal.
   *  Receives the canonical biomarker name and the new range string (e.g. "20 - 450").
   *  The page should propagate this to setStudies so BiomarkerMasterTable updates too. */
  onBiomarkerRangeUpdated?: (biomarkerName: string, newRange: string) => void;
  showOnlySuspicious?: boolean;
  showOnlyOutOfRange?: boolean;
  onSeriesReady?: (map: Record<string, { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string; biomarkerId?: string; studyId?: string; isEdited?: boolean; originalValue?: string | null }[] }>) => void;
  documents?: any[];
}

const MASTER_INDEX: Record<string, string> = {
  'Fundamentos y Resumen Ejecutivo': '📋',
  'Sistema Metabólico y Energético': '⚡',
  'Salud Cardiovascular y Circulatoria': '❤️',
  'Sistema Endocrino (Hormonal)': '🧬',
  'Función Digestiva y Microbiota': '🦠',
  'Sistema Inmune e Inflamación': '🛡️',
  'Salud Neurológica y Cognitiva': '🧠',
  'Salud Dental y Estomatognática': '🦷',
  'Salud Visual y Retinografía': '👁️',
  'Salud Dermatológica e Integumentaria': '🧴',
  'Sistemas Renal, Respiratorio y Osteomuscular': '🫁',
  'Desintoxicación y Estrés Oxidativo': '🔬',
  'Protocolo Maestro de Intervención': '📌',
  'Anexos y Glosario': '📎',
};

function flagColor(flag: string, isEdited?: boolean) {
  if (isEdited) return '#d4af37';
  return flag === 'Alto' ? '#ef4444' : flag === 'Bajo' ? '#3b82f6' : '#22c55e';
}

function BiomarkerSparkline({
  series, isGlowing, compareMode, isSelected, onToggle, onClick,
}: {
  series: BiomarkerTimeSeries;
  isGlowing?: boolean;
  compareMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
}) {
  const W = 280, H = 90;
  const PAD = { top: 10, right: 14, bottom: 28, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = series.points.map(p => p.value);
  const minV = Math.min(...values) * 0.92;
  const maxV = Math.max(...values) * 1.08;
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (innerW / Math.max(series.points.length - 1, 1)) * i;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const polyline = series.points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerH} ` + series.points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ') + ` ${toX(series.points.length - 1)},${PAD.top + innerH}`;

  const lastPt = series.points[series.points.length - 1];
  const firstPt = series.points[0];
  const trend = lastPt.value - firstPt.value;
  const trendPct = firstPt.value !== 0 ? ((trend / firstPt.value) * 100).toFixed(1) : '0';
  const lc = flagColor(lastPt.flag, lastPt.isEdited);
  const [hovered, setHovered] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; pt: typeof lastPt } | null>(null);

  return (
    <div
      style={{
        position: 'relative',
        background: isSelected ? 'rgba(212,175,55,0.07)' : 'var(--bg-main)',
        borderRadius: '10px',
        border: `${isGlowing ? '2px' : '1px'} solid ${isSelected ? 'rgba(212,175,55,0.6)' : isGlowing ? 'rgba(212,175,55,0.95)' : lastPt.flag !== 'Normal' ? `${lc}40` : 'var(--border-subtle)'}`,
        padding: '14px 16px',
        minWidth: '280px',
        transition: 'border 0.3s, background 0.3s',
        cursor: compareMode ? 'pointer' : 'default',
        zIndex: isGlowing ? 2 : 'auto' as any,
        transform: hovered && !compareMode ? 'translateY(-1px)' : 'none',
        boxShadow: hovered && !compareMode ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
      }}
      className={isGlowing ? 'pdi-glow-active' : ''}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={compareMode ? onToggle : undefined}
    >
      {/* Compare select circle */}
      {compareMode && (
        <div
          style={{
            position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px',
            borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--gold-primary)' : 'rgba(255,255,255,0.2)'}`,
            background: isSelected ? 'var(--gold-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, transition: 'all 0.2s',
          }}
        >
          {isSelected && <Check size={12} color="#000" />}
        </div>
      )}

      {/* Expand button (non-compare mode) */}
      {!compareMode && hovered && (
        <button
          onClick={onClick}
          style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: 'var(--gold-primary)', display: 'flex', zIndex: 2 }}
          title="Ver gráfica completa"
        >
          <ZoomIn size={13} />
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: lastPt.flag !== 'Normal' ? lc : 'var(--text-primary)' }}>{series.name}</p>
          {series.referenceRange && <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>Ref: {series.referenceRange} {series.unit}</p>}
        </div>
        <div style={{ textAlign: 'right', paddingRight: compareMode || hovered ? '28px' : '0' }}>
          <span style={{ fontSize: '17px', fontWeight: 800, color: lc, fontFamily: 'monospace' }}>{lastPt.value}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '3px' }}>{series.unit}</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px', marginTop: '2px' }}>
            {series.points.length > 1 && (
              trend > 0 ? <TrendingUp size={11} color={lastPt.flag === 'Alto' ? '#ef4444' : '#22c55e'} /> :
              trend < 0 ? <TrendingDown size={11} color={lastPt.flag === 'Bajo' ? '#3b82f6' : '#22c55e'} /> :
              <Minus size={11} color="var(--text-muted)" />
            )}
            {series.points.length > 1 && (
              <span style={{ fontSize: '9px', color: trend > 0 ? (lastPt.flag === 'Alto' ? '#ef4444' : '#22c55e') : trend < 0 ? (lastPt.flag === 'Bajo' ? '#3b82f6' : '#22c55e') : 'var(--text-muted)' }}>
                {trend > 0 ? '+' : ''}{trendPct}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ position: 'relative' }}>
        <svg width={W} height={H} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={`grad-${series.name.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lc} stopOpacity="0.25" />
              <stop offset="100%" stopColor={lc} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#grad-${series.name.replace(/\s/g, '')})`} />
          {series.points.length > 1 && (
            <polyline points={polyline} fill="none" stroke={lc} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          )}
          {series.points.map((pt, i) => (
            <g key={i} onMouseEnter={() => setTooltip({ x: toX(i), y: toY(pt.value), pt })} onMouseLeave={() => setTooltip(null)} style={{ cursor: 'pointer' }}>
              <circle cx={toX(i)} cy={toY(pt.value)} r={8} fill="transparent" />
              {pt.suspicious ? (
                // Hollow orange diamond for suspicious values
                <>
                  <polygon
                    points={`${toX(i)},${toY(pt.value)-6} ${toX(i)+5},${toY(pt.value)} ${toX(i)},${toY(pt.value)+6} ${toX(i)-5},${toY(pt.value)}`}
                    fill="none" stroke="#f97316" strokeWidth="1.5"
                  />
                  <text x={toX(i)} y={toY(pt.value)-9} textAnchor="middle" fontSize="8" fill="#f97316">⚠</text>
                </>
              ) : (
                <circle cx={toX(i)} cy={toY(pt.value)} r={4} fill={flagColor(pt.flag, pt.isEdited)} stroke="var(--bg-surface)" strokeWidth="2" />
              )}
            </g>
          ))}
          {series.points.map((pt, i) => (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
              {new Date(/^\d{4}-\d{2}-\d{2}$/.test(pt.date) ? pt.date + 'T12:00:00' : pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
            </text>
          ))}
        </svg>
        {tooltip && (
          <div style={{ position: 'absolute', left: tooltip.x - 40, top: tooltip.y - 66, background: 'var(--bg-surface)', border: `1px solid ${tooltip.pt.isEdited ? '#d4af37' : tooltip.pt.suspicious ? '#f97316' : flagColor(tooltip.pt.flag)}`, borderRadius: '8px', padding: '6px 10px', fontSize: '11px', color: 'var(--text-primary)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            {tooltip.pt.isEdited && (
              <div style={{ fontSize: '10px', color: '#d4af37', marginBottom: '3px', fontWeight: 700 }}>✏️ Corregido manualmente</div>
            )}
            {tooltip.pt.suspicious && !tooltip.pt.isEdited && (
              <div style={{ fontSize: '10px', color: '#f97316', marginBottom: '3px', fontWeight: 700 }}>⚠️ Valor inusual — verificar extracción</div>
            )}
            <span style={{ fontWeight: 700, color: tooltip.pt.isEdited ? '#d4af37' : tooltip.pt.suspicious ? '#f97316' : flagColor(tooltip.pt.flag) }}>{tooltip.pt.value} {series.unit}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{new Date(/^\d{4}-\d{2}-\d{2}$/.test(tooltip.pt.date) ? tooltip.pt.date + 'T12:00:00' : tooltip.pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ZONE BAR CHART (single-point, Ultrahuman/Apple Health style) ─────────────
// Colored zone bar (Bajo/Normal/Alto) with a large glowing marker showing
// exactly where the value lands. Dramatically more visual than a dot on a line.
function ZoneBarChart({
  series,
  isGlowing,
  compareMode,
  isSelected,
  onToggle,
  onClick,
}: {
  series: BiomarkerTimeSeries;
  isGlowing?: boolean;
  compareMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
}) {
  const W = 280;
  const BAR_L = 16, BAR_R = 264;
  const barW = BAR_R - BAR_L;
  const barY = 54, barH = 22, barR = 11;
  const SVG_H = barY + barH + 26;

  const pt = series.points[0];
  const fc = flagColor(pt.flag, pt.isEdited);
  const [hovered, setHovered] = useState(false);

  // Priority: DB value (series.referenceRange from Supabase) > catalog defaults
  // The catalog is only a fallback when the DB has no stored range.
  const catalog = getCatalogEntry(series.name);
  let refMin: number | null = null;
  let refMax: number | null = null;

  if (series.referenceRange) {
    // Parse from DB first — this is always the source of truth
    const rr = series.referenceRange;
    const rangeMatch = rr.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
    const ltMatch = rr.match(/[<≤]\s*(\d+\.?\d*)/);
    const gtMatch = rr.match(/[>≥]\s*(\d+\.?\d*)/);
    if (rangeMatch) { refMin = parseFloat(rangeMatch[1]); refMax = parseFloat(rangeMatch[2]); }
    else if (ltMatch) { refMax = parseFloat(ltMatch[1]); }
    else if (gtMatch) { refMin = parseFloat(gtMatch[1]); }
  }

  // Fall back to catalog only if DB had nothing useful
  if (refMin === null && refMax === null && catalog) {
    refMin = catalog.refMin ?? null;
    refMax = catalog.refMax ?? null;
  }

  // Axis: value + refs with 25% breathing room on each side
  const allVals = [pt.value];
  if (refMin !== null) allVals.push(refMin);
  if (refMax !== null) allVals.push(refMax);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const spread = dataMax - dataMin || Math.abs(dataMax) * 0.4 || 1;
  const axisMin = dataMin - spread * 0.28;
  const axisMax = dataMax + spread * 0.28;
  const axisSpan = axisMax - axisMin;

  const toX = (v: number) => BAR_L + Math.max(0, Math.min(1, (v - axisMin) / axisSpan)) * barW;

  const valX = toX(pt.value);
  const refMinX = refMin !== null ? toX(refMin) : BAR_L;
  const refMaxX = refMax !== null ? toX(refMax) : BAR_R;

  const hasLow  = refMin !== null && (refMinX - BAR_L) > 3;
  const hasHigh = refMax !== null && (BAR_R - refMaxX) > 3;

  const normalStart = hasLow  ? refMinX : BAR_L;
  const normalEnd   = hasHigh ? refMaxX : BAR_R;

  const needleX = Math.max(BAR_L + 2, Math.min(BAR_R - 2, valX));
  const uid = `zb-${series.name.replace(/[^a-zA-Z0-9]/g, '')}`;

  const dateStr = new Date(/^\d{4}-\d{2}-\d{2}$/.test(pt.date) ? pt.date + 'T12:00:00' : pt.date)
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <div
      style={{
        position: 'relative',
        background: isSelected ? 'rgba(212,175,55,0.07)' : 'var(--bg-main)',
        borderRadius: '12px',
        border: `${isGlowing ? '2px' : '1px'} solid ${
          isSelected ? 'rgba(212,175,55,0.6)'
          : isGlowing ? 'rgba(212,175,55,0.95)'
          : pt.flag !== 'Normal' ? `${fc}35`
          : 'var(--border-subtle)'
        }`,
        padding: '14px 0 0',
        minWidth: '280px',
        overflow: 'hidden',
        transition: 'border 0.25s, box-shadow 0.25s, transform 0.15s',
        cursor: compareMode ? 'pointer' : 'default',
        zIndex: isGlowing ? 2 : 'auto' as any,
        transform: hovered && !compareMode ? 'translateY(-2px)' : 'none',
        boxShadow: hovered && !compareMode
          ? `0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px ${fc}18`
          : isGlowing ? `0 0 24px ${fc}28` : 'none',
      }}
      className={isGlowing ? 'pdi-glow-active' : ''}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={compareMode ? onToggle : undefined}
    >
      {/* Compare circle */}
      {compareMode && (
        <div style={{ position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--gold-primary)' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? 'var(--gold-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          {isSelected && <Check size={9} color="#000" />}
        </div>
      )}

      {/* Expand button */}
      {!compareMode && hovered && (
        <button onClick={onClick} style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: 'var(--gold-primary)', display: 'flex', zIndex: 2 }} title="Ver y editar valor">
          <ZoomIn size={13} />
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: '16px', paddingRight: hovered || compareMode ? '40px' : '16px', marginBottom: '0px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: pt.flag !== 'Normal' ? fc : 'var(--text-primary)', lineHeight: 1.3 }}>{series.name}</p>
          {series.referenceRange && (
            <p style={{ margin: '1px 0 0', fontSize: '9px', color: 'var(--text-muted)' }}>
              Ref: {series.referenceRange} {series.unit}
            </p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ lineHeight: 1 }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: fc, fontFamily: 'monospace' }}>{pt.value}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '3px' }}>{series.unit}</span>
          </div>
          {pt.flag !== 'Normal' && (
            <div style={{ marginTop: '3px' }}>
              <span style={{ fontSize: '9px', background: `${fc}22`, color: fc, padding: '1px 7px', borderRadius: '20px', fontWeight: 700, letterSpacing: '0.3px' }}>{pt.flag}</span>
            </div>
          )}
        </div>
      </div>

      {/* Zone bar SVG */}
      <svg width={W} height={SVG_H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={`${uid}-clip`}>
            <rect x={BAR_L} y={barY} width={barW} height={barH} rx={barR} />
          </clipPath>
          <filter id={`${uid}-glow`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id={`${uid}-low`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.48" />
          </linearGradient>
          <linearGradient id={`${uid}-norm`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id={`${uid}-high`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* Track background */}
        <rect x={BAR_L} y={barY} width={barW} height={barH} rx={barR} fill="rgba(255,255,255,0.04)" />

        {/* ── Color zones ── */}
        {hasLow && (
          <rect x={BAR_L} y={barY} width={refMinX - BAR_L} height={barH}
            fill={`url(#${uid}-low)`} clipPath={`url(#${uid}-clip)`} />
        )}
        <rect x={normalStart} y={barY} width={normalEnd - normalStart} height={barH}
          fill={`url(#${uid}-norm)`} clipPath={`url(#${uid}-clip)`} />
        {hasHigh && (
          <rect x={refMaxX} y={barY} width={BAR_R - refMaxX} height={barH}
            fill={`url(#${uid}-high)`} clipPath={`url(#${uid}-clip)`} />
        )}

        {/* Zone dividers */}
        {hasLow && (
          <line x1={refMinX} y1={barY} x2={refMinX} y2={barY + barH}
            stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
        )}
        {hasHigh && (
          <line x1={refMaxX} y1={barY} x2={refMaxX} y2={barY + barH}
            stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
        )}

        {/* Bar border */}
        <rect x={BAR_L} y={barY} width={barW} height={barH} rx={barR}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />

        {/* Ref value labels above bar */}
        {hasLow && (
          <text x={refMinX} y={barY - 5} textAnchor="middle" fontSize="7.5" fill="rgba(59,130,246,0.65)" fontWeight="600">{refMin}</text>
        )}
        {hasHigh && (
          <text x={refMaxX} y={barY - 5} textAnchor="middle" fontSize="7.5" fill="rgba(239,68,68,0.65)" fontWeight="600">{refMax}</text>
        )}

        {/* Needle line */}
        <line x1={needleX} y1={barY - 16} x2={needleX} y2={barY + barH + 2}
          stroke={fc} strokeWidth="1.5" strokeOpacity="0.55" />

        {/* Value label above needle */}
        <text x={needleX} y={barY - 20} textAnchor="middle" fontSize="9.5" fontWeight="800" fill={fc}
          style={{ filter: `drop-shadow(0 0 4px ${fc}88)` }}>
          {pt.value}
        </text>

        {/* Glowing needle circle */}
        <circle cx={needleX} cy={barY + barH / 2} r={10}
          fill={fc} filter={`url(#${uid}-glow)`} stroke="var(--bg-main)" strokeWidth="2.5" />

        {/* Zone labels below bar */}
        {hasLow && (refMinX - BAR_L) > 28 && (
          <text x={(BAR_L + refMinX) / 2} y={barY + barH + 14}
            textAnchor="middle" fontSize="8" fill="rgba(59,130,246,0.75)" fontWeight="600">Bajo</text>
        )}
        {(normalEnd - normalStart) > 24 && (
          <text x={(normalStart + normalEnd) / 2} y={barY + barH + 14}
            textAnchor="middle" fontSize="8" fill="rgba(34,197,94,0.75)" fontWeight="600">Normal</text>
        )}
        {hasHigh && (BAR_R - refMaxX) > 28 && (
          <text x={(refMaxX + BAR_R) / 2} y={barY + barH + 14}
            textAnchor="middle" fontSize="8" fill="rgba(239,68,68,0.75)" fontWeight="600">Alto</text>
        )}

        {/* Date bottom right */}
        <text x={BAR_R} y={barY + barH + 14} textAnchor="end" fontSize="7.5" fill="var(--text-muted)">
          {dateStr}
        </text>
      </svg>
    </div>
  );
}

export default function EvolutionCharts({ studies, patientId, glowId, compareMode, selectedForCompare, onToggleCompare, onBiomarkerUpdated, onBiomarkerRangeUpdated, showOnlySuspicious, showOnlyOutOfRange, onSeriesReady, documents }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<ChartSeries | null>(null);
  // Local overrides for reference ranges — applied on top of timeSeriesMap
  // so mini-cards update immediately after the user saves new limits in the modal.
  const [rangeOverrides, setRangeOverrides] = useState<Record<string, string>>({});

  const timeSeriesMap = useMemo<Record<string, BiomarkerTimeSeries>>(() => {
    const map: Record<string, BiomarkerTimeSeries> = {};
    const getStudyDate = (s: Study) => {
      const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
      const raw = (s as any).exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
      // Normalize bare YYYY-MM-DD to local noon to avoid UTC→local shift
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
    };
    const sortedStudies = [...studies].sort((a, b) => new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime());

    for (const study of sortedStudies) {
      if (!study.biomarkers) continue;
      for (const bm of study.biomarkers) {
        const numVal = parseFloat(bm.value);
        if (isNaN(numVal)) continue;
        if (bm.flag === 'Excluido') continue;  // doctor explicitly removed from chart
        const canonicalName = (bm as any).canonical_name ?? normalizeBiomarkerName(bm.name);
        if (!map[canonicalName]) {
          map[canonicalName] = {
            name: canonicalName,
            unit: bm.unit,
            system: getCatalogEntry(canonicalName)?.system ?? bm.system ?? (bm as any).canonical_system ?? 'Otros Marcadores',
            referenceRange: (bm as any).referenceRange ?? (bm as any).reference_range ?? undefined,
            points: [],
          };
        } else {
          // Always update referenceRange with newest non-null value — studies are sorted
          // chronologically so the last one encountered wins, which is what the doctor edited most recently.
          const freshRange = (bm as any).referenceRange ?? (bm as any).reference_range;
          if (freshRange) map[canonicalName].referenceRange = freshRange;
        }
        map[canonicalName].points.push({
          date: getStudyDate(study),
          value: numVal,
          flag: bm.flag,
          biomarkerId: (bm as any).id,
          studyId: study.id,
          isEdited: (bm as any).is_edited || false,
          originalValue: (bm as any).original_value || null,
        });
      }
    }

    // ── INTELLIGENT POST-PROCESSING ───────────────────────────────────────────────
    //
    // Problem: multiple studies from the same exam date (or the same study
    // containing both serum and urine values for the same biomarker name)
    // produce two data points per date, creating an absurd zigzag in the chart.
    //
    // Solution: for each biomarker series—
    //   Step 1. Compute the series MEDIAN (robust central tendency).
    //   Step 2. Group all points by day (YYYY-MM-DD). For each day that has
    //           multiple points, keep ONLY the one whose value is closest to
    //           the series median. This picks 141 over 0.07 for Sodio, 9.8
    //           over 4.1 for Calcio, 86 over 43 for Colesterol HDL, etc.
    //   Step 3. Apply a 3×IQR statistical fence on the deduped series to
    //           remove any extreme extraction errors that survived step 2.
    // ─────────────────────────────────────────────────────────────────────
    for (const series of Object.values(map)) {
      if (series.points.length < 2) continue;

      // Step 1: series median
      const sortedVals = [...series.points].map(p => p.value).sort((a, b) => a - b);
      const median = sortedVals[Math.floor(sortedVals.length / 2)];

      // Step 2: per-day deduplication — keep point closest to median, but ALWAYS prioritize edited points!
      const byDay = new Map<string, typeof series.points[0]>();
      for (const pt of series.points) {
        const key = pt.date.slice(0, 10);
        const existing = byDay.get(key);
        if (!existing) {
          byDay.set(key, pt);
        } else {
          if (pt.isEdited && !existing.isEdited) {
            byDay.set(key, pt);
          } else if (!pt.isEdited && existing.isEdited) {
            // Keep existing
          } else if (Math.abs(pt.value - median) < Math.abs(existing.value - median)) {
            byDay.set(key, pt);
          }
        }
      }
      let deduped = [...byDay.values()].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Step 3: IQR analysis — MARK suspicious values instead of removing them.
      // A suspicious value is shown differently in the chart (hollow orange diamond +
      // warning tooltip) but is NEVER deleted — the doctor sees it and decides.
      if (deduped.length >= 5) {
        const fv = deduped.map(p => p.value).sort((a, b) => a - b);
        const q1 = fv[Math.floor(fv.length * 0.25)];
        const q3 = fv[Math.floor(fv.length * 0.75)];
        const iqr = q3 - q1;
        if (iqr > 0) {
          const lo = q1 - 3 * iqr;
          const hi = q3 + 3 * iqr;
          deduped = deduped.map(p => ({
            ...p,
            suspicious: p.value < lo || p.value > hi,
          }));
        }
      }

      // Step 4: Catalog absolute-bounds check.
      // IQR fails when most historical data is itself wrong (extraction errors that
      // look consistent with each other). This check uses the catalog's reference
      // range as a physiological ground truth — independent of patient history.
      // A point is suspicious if it is MORE than 2× above the catalog max,
      // or LESS than 40% of the catalog min. These are biologically impossible
      // values for a living human (e.g. Eritrocitos=12 when max is 5.8,
      // Globulina=15 when max is 3.1, Plaquetas=50 when min is 150).
      const catalogEntry = getCatalogEntry(series.name);
      if (catalogEntry) {
        const { refMin, refMax } = catalogEntry;
        deduped = deduped.map(p => {
          if (p.suspicious) return p; // already caught by IQR
          let suspicious = false;
          if (refMax !== null && p.value > refMax * 2.0) suspicious = true;
          if (refMin !== null && refMin > 0 && p.value < refMin * 0.4) suspicious = true;
          if (refMin === null && refMax !== null && refMax > 0 && p.value < refMax * 0.20) suspicious = true;
          return suspicious ? { ...p, suspicious: true } : p;
        });
      }

      // Step 5: Final trust override.
      // If Gemini read the lab's own reference range and certified the value as
      // 'Normal', it cannot be an extraction error — clear any suspicious flag.
      // This handles catalog/unit mismatches (e.g. catalog uses ng/dL but data
      // is stored as ng/mL, causing false positives in Step 4).
      deduped = deduped.map(p =>
        p.suspicious && p.flag === 'Normal' ? { ...p, suspicious: false } : p
      );

      series.points = deduped;
    }

    return map;
  }, [studies]);

  // Apply rangeOverrides on top of timeSeriesMap so mini-cards show updated limits
  // immediately without a page reload.
  const displaySeriesMap = useMemo(() => {
    if (Object.keys(rangeOverrides).length === 0) return timeSeriesMap;
    const patched: Record<string, BiomarkerTimeSeries> = {};
    for (const [key, series] of Object.entries(timeSeriesMap)) {
      patched[key] = rangeOverrides[key]
        ? { ...series, referenceRange: rangeOverrides[key] }
        : series;
    }
    return patched;
  }, [timeSeriesMap, rangeOverrides]);

  // Notify parent whenever the processed (+ overrides applied) map changes
  // so ComparativeModal always sees the same data as the mini-cards.
  // Uses displaySeriesMap (not timeSeriesMap) so range overrides are included.
  // Must be useEffect (not useMemo) — calling parent setState during render is illegal in React 19
  useEffect(() => { onSeriesReady?.(displaySeriesMap); }, [displaySeriesMap, onSeriesReady]);

  const allSeries = Object.values(displaySeriesMap);
  const hasSuspicious = (s: BiomarkerTimeSeries) => s.points.some(p => p.suspicious);
  const hasOutOfRange = (s: BiomarkerTimeSeries) => s.points.some(p => p.flag !== 'Normal' && !p.suspicious);
  const hasAnyAbnormal = (s: BiomarkerTimeSeries) => s.points.some(p => p.flag !== 'Normal');
  const multiPointSeries = allSeries.filter(s => s.points.length >= 2);
  const singlePointSeries = allSeries.filter(s => s.points.length === 1);
  const systems = [...new Set(allSeries.map(s => s.system))];

  // Apply active filter
  const applyFilter = (list: BiomarkerTimeSeries[]) => {
    if (showOnlySuspicious) return list.filter(hasSuspicious);
    if (showOnlyOutOfRange) {
      // Keep markers with any abnormal value; sort out-of-range ones first
      const filtered = list.filter(hasAnyAbnormal);
      return [
        ...filtered.filter(s => !hasSuspicious(s)), // true out-of-range first
        ...filtered.filter(s => hasSuspicious(s)),  // then suspicious ones
      ];
    }
    return list;
  };

  const baseMulti = applyFilter(multiPointSeries);
  const baseSingle = applyFilter(singlePointSeries);
  const filteredMulti = selectedSystem ? baseMulti.filter(s => s.system === selectedSystem) : baseMulti;
  const filteredSingle = selectedSystem ? baseSingle.filter(s => s.system === selectedSystem) : baseSingle;
  const groupBySys = (list: BiomarkerTimeSeries[]) => list.reduce((acc, s) => { if (!acc[s.system]) acc[s.system] = []; acc[s.system].push(s); return acc; }, {} as Record<string, BiomarkerTimeSeries[]>);
  const multiGrouped = groupBySys(filteredMulti);
  const singleGrouped = groupBySys(filteredSingle);

  if (studies.length === 0) return null;

  return (
    <>
      <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: `1px solid ${compareMode ? 'rgba(212,175,55,0.4)' : 'var(--border-subtle)'}`, padding: '28px', transition: 'border-color 0.3s' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px' }}>📈</span>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}>Evolución Clínica</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {studies.length} estudio{studies.length !== 1 ? 's' : ''} · {allSeries.length} marcadores · {multiPointSeries.length} con evolución medible
                {compareMode && <span style={{ marginLeft: '8px', color: 'var(--gold-primary)', fontWeight: 600 }}>· Modo comparativa activo — selecciona las gráficas</span>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '55%' }}>
            <button onClick={() => setSelectedSystem(null)} style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)', cursor: 'pointer', border: `1px solid ${selectedSystem === null ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: selectedSystem === null ? 'rgba(212,175,55,0.15)' : 'transparent', color: selectedSystem === null ? 'var(--gold-primary)' : 'var(--text-muted)', transition: 'all 0.2s' }}>Todos</button>
            {systems.map(sys => (
              <button key={sys} onClick={() => setSelectedSystem(sys === selectedSystem ? null : sys)} style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)', cursor: 'pointer', border: `1px solid ${selectedSystem === sys ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: selectedSystem === sys ? 'rgba(212,175,55,0.15)' : 'transparent', color: selectedSystem === sys ? 'var(--gold-primary)' : 'var(--text-muted)', transition: 'all 0.2s' }}>
                {MASTER_INDEX[sys] ?? '🔬'} {sys.split(' ')[0]}...
              </button>
            ))}
          </div>
        </div>

        {/* Multi-point */}
        {filteredMulti.length > 0 && (
          <>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px', fontWeight: 600 }}>📊 Evolución en el tiempo ({filteredMulti.length} marcadores)</p>
            {Object.entries(multiGrouped).map(([sys, list]) => (
              <div key={sys} style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                  {MASTER_INDEX[sys] ?? '🔬'} {sys}
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {list.map(series => {
                    const elemId = chartBiomarkerElementId(series.name);
                    const isSelected = selectedForCompare?.has(series.name) ?? false;
                    return (
                      <div key={series.name} id={elemId}>
                        <BiomarkerSparkline
                          series={series}
                          isGlowing={glowId === elemId}
                          compareMode={compareMode}
                          isSelected={isSelected}
                          onToggle={() => onToggleCompare?.(series.name)}
                          onClick={() => setExpandedSeries({ name: series.name, unit: series.unit, referenceRange: series.referenceRange, points: series.points })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Single-point */}
        {filteredSingle.length > 0 && (
          <>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px', marginTop: filteredMulti.length > 0 ? '8px' : '0', fontWeight: 600 }}>
              📌 Medición única ({filteredSingle.length} marcadores)
            </p>
            {Object.entries(singleGrouped).map(([sys, list]) => (
              <div key={sys} style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                  {MASTER_INDEX[sys] ?? '🔬'} {sys}
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {list.map(series => {
                    const elemId = chartBiomarkerElementId(series.name);
                    const isSelected = selectedForCompare?.has(series.name) ?? false;
                    return (
                      <div key={series.name} id={elemId}>
                        <ZoneBarChart
                          series={series}
                          isGlowing={glowId === elemId}
                          compareMode={compareMode}
                          isSelected={isSelected}
                          onToggle={() => onToggleCompare?.(series.name)}
                          onClick={() => setExpandedSeries({ name: series.name, unit: series.unit, referenceRange: series.referenceRange, points: series.points })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {filteredMulti.length === 0 && filteredSingle.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '13px' }}>No hay marcadores en este sistema todavía.</p>
        )}
      </section>

      {expandedSeries && (
        <ExpandedChartModal
          series={expandedSeries}
          patientId={patientId}
          documents={documents}
          onClose={() => setExpandedSeries(null)}
          onValueUpdated={(biomarkerId, newValue, newFlag, studyId) => {
            // Propagate to parent so studies state + timeSeriesMap rebuild
            onBiomarkerUpdated?.(studyId, biomarkerId, newValue, newFlag);
            // Also patch expandedSeries in-place so it stays correct if the modal
            // stays open, and so re-opening doesn't need a full page reload
            if (newFlag === 'Excluido') {
              setExpandedSeries(prev => prev
                ? { ...prev, points: prev.points.filter(p => p.biomarkerId !== biomarkerId) }
                : null
              );
            } else {
              setExpandedSeries(prev => prev
                ? {
                    ...prev,
                    points: prev.points.map(p => {
                      if (p.biomarkerId !== biomarkerId) return p;
                      const cleanOrig = p.originalValue ? String(p.originalValue).split('|')[0] : String(p.value);
                      const timestamp = new Date().toISOString();
                      return {
                        ...p,
                        value: parseFloat(newValue) || p.value,
                        flag: newFlag,
                        isEdited: true,
                        originalValue: `${cleanOrig}|${timestamp}`
                      };
                    })
                  }
                : null
              );
            }
          }}
          onRangeUpdated={(newRange) => {
            if (!expandedSeries) return;
            // 1. Update the modal's own series so the chart re-renders immediately
            setExpandedSeries(prev => prev ? { ...prev, referenceRange: newRange } : null);
            // 2. Propagate to all mini-cards via local overrides (instant, no reload)
            setRangeOverrides(prev => ({ ...prev, [expandedSeries.name]: newRange }));
            // 3. Propagate to page-level setStudies — same path as value edits —
            //    so BiomarkerMasterTable also updates without a page reload.
            onBiomarkerRangeUpdated?.(expandedSeries.name, newRange);
          }}
        />
      )}
    </>
  );
}
