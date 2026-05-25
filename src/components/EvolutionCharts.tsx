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
  showOnlySuspicious?: boolean;
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

export default function EvolutionCharts({ studies, patientId, glowId, compareMode, selectedForCompare, onToggleCompare, onBiomarkerUpdated, showOnlySuspicious, onSeriesReady, documents }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<ChartSeries | null>(null);

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
            referenceRange: (bm as any).referenceRange ?? (bm as any).reference_range,
            points: [],
          };
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

  // Notify parent whenever the processed series map changes
  // so ComparativeModal always gets the correctly-deduplicated data
  // Must be useEffect (not useMemo) — calling parent setState during render is illegal in React 19
  useEffect(() => { onSeriesReady?.(timeSeriesMap); }, [timeSeriesMap, onSeriesReady]);

  // Apply localStorage overrides AFTER dedup — user edits always win
  // NOTE: overrides now come from Supabase (is_edited flag), no localStorage needed.
  const displaySeriesMap = timeSeriesMap;

  const allSeries = Object.values(displaySeriesMap);
  const hasSuspicious = (s: BiomarkerTimeSeries) => s.points.some(p => p.suspicious);
  const multiPointSeries = allSeries.filter(s => s.points.length >= 2);
  const singlePointSeries = allSeries.filter(s => s.points.length === 1);
  const systems = [...new Set(allSeries.map(s => s.system))];

  const baseMulti = showOnlySuspicious ? multiPointSeries.filter(hasSuspicious) : multiPointSeries;
  const baseSingle = showOnlySuspicious ? singlePointSeries.filter(hasSuspicious) : singlePointSeries;
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                  {list.map(series => {
                    const pt = series.points[0];
                    const fc = flagColor(pt.flag, pt.isEdited);
                    const isSelected = selectedForCompare?.has(series.name) ?? false;
                    return (
                      <div
                        key={series.name}
                        onClick={compareMode ? () => onToggleCompare?.(series.name) : undefined}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', background: isSelected ? 'rgba(212,175,55,0.07)' : 'var(--bg-main)', border: `1px solid ${isSelected ? 'rgba(212,175,55,0.5)' : pt.flag !== 'Normal' ? `${fc}30` : 'var(--border-subtle)'}`, cursor: compareMode ? 'pointer' : 'default', position: 'relative', transition: 'all 0.2s' }}
                      >
                        {compareMode && (
                          <div style={{ position: 'absolute', top: '6px', right: '6px', width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--gold-primary)' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? 'var(--gold-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected && <Check size={9} color="#000" />}
                          </div>
                        )}
                        <div>
                          <p style={{ margin: 0, fontSize: '12px', color: fc, fontWeight: 500 }}>{series.name}</p>
                          {series.referenceRange && <p style={{ margin: '1px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>Ref: {series.referenceRange} {series.unit}</p>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: fc }}>{pt.value}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '3px' }}>{series.unit}</span>
                          {pt.flag !== 'Normal' && <div><span style={{ fontSize: '9px', background: `${fc}20`, color: fc, padding: '1px 5px', borderRadius: '4px' }}>{pt.flag}</span></div>}
                        </div>
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
        />
      )}
    </>
  );
}
