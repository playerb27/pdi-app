'use client';
import { X, BarChart2, FileText, Check } from 'lucide-react';
import type { ChartSeries } from './ExpandedChartModal';

function flagColor(flag: string) {
  return flag === 'Alto' ? '#ef4444' : flag === 'Bajo' ? '#3b82f6' : '#22c55e';
}

function parseRef(ref?: string): { min: number | null; max: number | null } {
  if (!ref) return { min: null, max: null };
  const m = ref.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  const lt = ref.match(/[<≤]\s*(\d+\.?\d*)/);
  if (lt) return { min: null, max: parseFloat(lt[1]) };
  const gt = ref.match(/[>≥]\s*(\d+\.?\d*)/);
  if (gt) return { min: parseFloat(gt[1]), max: null };
  return { min: null, max: null };
}

function MiniComparativeChart({ series, width = 320, height = 180 }: { series: ChartSeries; width?: number; height?: number }) {
  const W = width, H = height;
  const PAD = { top: 24, right: 24, bottom: 36, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ref = parseRef(series.referenceRange);
  const values = series.points.map(p => p.value);
  const refVals = [ref.min, ref.max].filter(Boolean) as number[];
  const allVals = [...values, ...refVals];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.18 || 1;
  const minV = rawMin - pad;
  const maxV = rawMax + pad;
  const range = maxV - minV;

  const toX = (i: number) => PAD.left + (innerW / Math.max(series.points.length - 1, 1)) * i;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const polyline = series.points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerH} ` + series.points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ') + ` ${toX(series.points.length - 1)},${PAD.top + innerH}`;

  const lastFlag = series.points[series.points.length - 1]?.flag ?? 'Normal';
  const lc = flagColor(lastFlag);
  const gradId = `cmp-${series.name.replace(/\s+/g, '')}`;

  return (
    <svg width={W} height={H} style={{ overflow: 'visible', maxWidth: '100%' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lc} stopOpacity="0.35" />
          <stop offset="100%" stopColor={lc} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {[0, 0.5, 1].map((t, i) => {
        const v = minV + range * t;
        const y = toY(v);
        return <g key={i}>
          <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">{v.toFixed(1)}</text>
        </g>;
      })}

      {/* Reference band */}
      {(ref.min != null || ref.max != null) && (() => {
        const bandTop = toY(ref.max ?? maxV);
        const bandBot = toY(ref.min ?? minV);
        return <>
          <rect x={PAD.left} y={bandTop} width={innerW} height={Math.max(bandBot - bandTop, 0)} fill="rgba(34,197,94,0.07)" />
          {ref.max != null && <line x1={PAD.left} y1={toY(ref.max)} x2={PAD.left + innerW} y2={toY(ref.max)} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />}
          {ref.min != null && <line x1={PAD.left} y1={toY(ref.min)} x2={PAD.left + innerW} y2={toY(ref.min)} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />}
        </>;
      })()}

      <polygon points={area} fill={`url(#${gradId})`} />
      {series.points.length > 1 && <polyline points={polyline} fill="none" stroke={lc} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

      {series.points.map((pt, i) => (
        <circle key={i} cx={toX(i)} cy={toY(pt.value)} r={4} fill={flagColor(pt.flag)} stroke="#0f0f1a" strokeWidth="1.5" />
      ))}

      {series.points.map((pt, i) => (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.25)">
          {new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
        </text>
      ))}
    </svg>
  );
}

interface Props {
  series: ChartSeries[];
  onClose: () => void;
  onAddToReport: (names: string[]) => void;
  addedToReport?: boolean;
}

export default function ComparativeModal({ series, onClose, onAddToReport, addedToReport }: Props) {
  const names = series.map(s => s.name);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(145deg, #0a0a15, #0f0f20)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '24px', padding: '36px 40px', width: '92vw', maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 40px 100px rgba(0,0,0,0.8)', position: 'relative' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={22} color="var(--gold-primary)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>Análisis Comparativo</h2>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{series.length} marcadores seleccionados</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => onAddToReport(names)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', borderRadius: '12px', border: 'none', background: addedToReport ? 'rgba(34,197,94,0.2)' : 'linear-gradient(135deg, #d4af37, #b8922a)', color: addedToReport ? '#22c55e' : '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 800, boxShadow: addedToReport ? 'none' : '0 4px 20px rgba(212,175,55,0.4)', transition: 'all 0.3s' }}
            >
              {addedToReport ? <><Check size={16} /> Agregado al reporte</> : <><FileText size={16} /> Agregar al reporte maestro</>}
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Charts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: series.length === 1 ? '1fr' : series.length === 2 ? '1fr 1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {series.map(s => {
            const lastPt = s.points[s.points.length - 1];
            const lc = flagColor(lastPt?.flag ?? 'Normal');
            const trend = s.points.length > 1 ? s.points[s.points.length - 1].value - s.points[0].value : 0;
            const trendPct = s.points[0]?.value ? ((trend / s.points[0].value) * 100).toFixed(1) : '0';

            return (
              <div key={s.name} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${lastPt?.flag !== 'Normal' ? `${lc}30` : 'rgba(255,255,255,0.08)'}`, borderRadius: '16px', padding: '20px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: lc }}>{s.name}</p>
                    {s.referenceRange && <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Ref: {s.referenceRange} {s.unit}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '24px', fontWeight: 900, color: lc, fontFamily: 'monospace' }}>{lastPt?.value}</span>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginLeft: '4px' }}>{s.unit}</span>
                    {s.points.length > 1 && (
                      <p style={{ margin: '2px 0 0', fontSize: '10px', color: trend > 0 ? (lastPt?.flag === 'Alto' ? '#ef4444' : '#22c55e') : '#3b82f6', textAlign: 'right' }}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(Number(trendPct))}%
                      </p>
                    )}
                  </div>
                </div>
                <MiniComparativeChart series={s} width={series.length === 1 ? 680 : 320} height={160} />
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={{ margin: '24px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          La franja verde indica el rango de referencia normal · Los puntos fuera de la franja indican valores alterados
        </p>
      </div>
    </div>
  );
}
