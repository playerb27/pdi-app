'use client';
import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Study } from '@/lib/api';

interface BiomarkerTimeSeries {
  name: string;
  unit: string;
  system: string;
  referenceRange?: string;
  points: { date: string; value: number; flag: string }[];
}

interface Props {
  studies: Study[];
  glowId?: string | null;
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

// ─── Mini SVG sparkline for a single biomarker ────────────────────────────────
function BiomarkerSparkline({ series, isGlowing }: { series: BiomarkerTimeSeries; isGlowing?: boolean }) {
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
  const flagColor = (flag: string) => flag === 'Alto' ? '#ef4444' : flag === 'Bajo' ? '#3b82f6' : '#22c55e';
  const lineColor = flagColor(lastPt.flag);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; pt: typeof lastPt } | null>(null);

  return (
    <div style={{ background: 'var(--bg-main)', borderRadius: '10px', border: `1px solid ${isGlowing ? 'rgba(212,175,55,0.8)' : lastPt.flag !== 'Normal' ? `${lineColor}40` : 'var(--border-subtle)'}`, padding: '14px 16px', minWidth: '280px', transition: 'border-color 0.3s', animation: isGlowing ? 'pdi-glow 2.5s ease' : 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: lastPt.flag !== 'Normal' ? lineColor : 'var(--text-primary)' }}>{series.name}</p>
          {series.referenceRange && <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>Ref: {series.referenceRange} {series.unit}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '17px', fontWeight: 800, color: lineColor, fontFamily: 'monospace' }}>{lastPt.value}</span>
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
          {/* Area fill */}
          <defs>
            <linearGradient id={`grad-${series.name.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#grad-${series.name.replace(/\s/g, '')})`} />

          {/* Line */}
          {series.points.length > 1 && (
            <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Data points with hover */}
          {series.points.map((pt, i) => (
            <g key={i}
              onMouseEnter={() => setTooltip({ x: toX(i), y: toY(pt.value), pt })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={toX(i)} cy={toY(pt.value)} r={8} fill="transparent" />
              <circle cx={toX(i)} cy={toY(pt.value)} r={4} fill={lineColor} stroke="var(--bg-surface)" strokeWidth="2" />
            </g>
          ))}

          {/* X-axis labels */}
          {series.points.map((pt, i) => (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
              {new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
            </text>
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: tooltip.x - 40,
            top: tooltip.y - 52,
            background: 'var(--bg-surface)',
            border: `1px solid ${flagColor(tooltip.pt.flag)}`,
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '11px',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontWeight: 700, color: flagColor(tooltip.pt.flag) }}>{tooltip.pt.value} {series.unit}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{new Date(tooltip.pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            {tooltip.pt.flag !== 'Normal' && <span style={{ marginLeft: '6px', color: flagColor(tooltip.pt.flag) }}>({tooltip.pt.flag})</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EvolutionCharts({ studies, glowId }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);

  // Build time series per biomarker across all studies
  const timeSeriesMap = useMemo<Record<string, BiomarkerTimeSeries>>(() => {
    const map: Record<string, BiomarkerTimeSeries> = {};

    // Sort studies by exam_date (preferred) or created_at ascending
    const sortedStudies = [...studies].sort((a, b) => {
      const da = new Date((a as any).exam_date ?? a.created_at).getTime();
      const db = new Date((b as any).exam_date ?? b.created_at).getTime();
      return da - db;
    });

    for (const study of sortedStudies) {
      if (!study.biomarkers) continue;
      for (const bm of study.biomarkers) {
        const numVal = parseFloat(bm.value);
        if (isNaN(numVal)) continue;
        if (!map[bm.name]) {
          map[bm.name] = {
            name: bm.name,
            unit: bm.unit,
            system: bm.system,
            referenceRange: (bm as any).referenceRange ?? (bm as any).reference_range,
            points: [],
          };
        }
        map[bm.name].points.push({
          date: (study as any).exam_date ?? study.created_at,
          value: numVal,
          flag: bm.flag,
        });
      }
    }
    return map;
  }, [studies]);

  // Only show biomarkers with ≥2 data points in the main section (but still show 1-point in a grid below)
  const allSeries = Object.values(timeSeriesMap);
  const multiPointSeries = allSeries.filter(s => s.points.length >= 2);
  const singlePointSeries = allSeries.filter(s => s.points.length === 1);

  const systems = [...new Set(allSeries.map(s => s.system))];

  const filteredMulti = selectedSystem ? multiPointSeries.filter(s => s.system === selectedSystem) : multiPointSeries;
  const filteredSingle = selectedSystem ? singlePointSeries.filter(s => s.system === selectedSystem) : singlePointSeries;

  // Group both filtered by system for rendering
  const groupBySys = (list: BiomarkerTimeSeries[]) =>
    list.reduce((acc, s) => {
      if (!acc[s.system]) acc[s.system] = [];
      acc[s.system].push(s);
      return acc;
    }, {} as Record<string, BiomarkerTimeSeries[]>);

  const multiGrouped = groupBySys(filteredMulti);
  const singleGrouped = groupBySys(filteredSingle);

  if (studies.length === 0) return null;

  return (
    <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', padding: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '22px' }}>📈</span>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}>Evolución Clínica</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {studies.length} estudio{studies.length !== 1 ? 's' : ''} · {allSeries.length} marcadores · {multiPointSeries.length} con evolución medible
            </p>
          </div>
        </div>

        {/* System filter pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%' }}>
          <button
            onClick={() => setSelectedSystem(null)}
            style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)', cursor: 'pointer', border: `1px solid ${selectedSystem === null ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: selectedSystem === null ? 'rgba(212,175,55,0.15)' : 'transparent', color: selectedSystem === null ? 'var(--gold-primary)' : 'var(--text-muted)', transition: 'all 0.2s' }}
          >
            Todos
          </button>
          {systems.map(sys => (
            <button key={sys}
              onClick={() => setSelectedSystem(sys === selectedSystem ? null : sys)}
              style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)', cursor: 'pointer', border: `1px solid ${selectedSystem === sys ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: selectedSystem === sys ? 'rgba(212,175,55,0.15)' : 'transparent', color: selectedSystem === sys ? 'var(--gold-primary)' : 'var(--text-muted)', transition: 'all 0.2s' }}
            >
              {MASTER_INDEX[sys] ?? '🔬'} {sys.split(' ')[0]}...
            </button>
          ))}
        </div>
      </div>

      {/* Multi-point: graphed over time */}
      {filteredMulti.length > 0 && (
        <>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px', fontWeight: 600 }}>
            📊 Evolución en el tiempo ({filteredMulti.length} marcadores)
          </p>
          {Object.entries(multiGrouped).map(([sys, list]) => (
            <div key={sys} style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                {MASTER_INDEX[sys] ?? '🔬'} {sys}
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {list.map(series => {
                  const elemId = `bm-chart-${series.name.replace(/\s+/g, '-')}`;
                  return (
                    <div key={series.name} id={elemId}>
                      <BiomarkerSparkline series={series} isGlowing={glowId === elemId} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Single-point: shown as a compact value grid */}
      {filteredSingle.length > 0 && (
        <>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px', marginTop: filteredMulti.length > 0 ? '8px' : '0', fontWeight: 600 }}>
            📌 Medición única ({filteredSingle.length} marcadores — aparecerán en gráfica cuando tengan más estudios)
          </p>
          {Object.entries(singleGrouped).map(([sys, list]) => (
            <div key={sys} style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                {MASTER_INDEX[sys] ?? '🔬'} {sys}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                {list.map(series => {
                  const pt = series.points[0];
                  const flagColor = pt.flag === 'Alto' ? '#ef4444' : pt.flag === 'Bajo' ? '#3b82f6' : 'var(--text-primary)';
                  return (
                    <div key={series.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-main)', border: `1px solid ${pt.flag !== 'Normal' ? `${flagColor}30` : 'var(--border-subtle)'}` }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '12px', color: flagColor, fontWeight: 500 }}>{series.name}</p>
                        {series.referenceRange && <p style={{ margin: '1px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>Ref: {series.referenceRange} {series.unit}</p>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: flagColor }}>{pt.value}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '3px' }}>{series.unit}</span>
                        {pt.flag !== 'Normal' && <div><span style={{ fontSize: '9px', background: `${flagColor}20`, color: flagColor, padding: '1px 5px', borderRadius: '4px' }}>{pt.flag}</span></div>}
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
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '13px' }}>
          No hay marcadores en este sistema todavía.
        </p>
      )}
    </section>
  );
}
