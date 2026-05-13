'use client';
import { useState } from 'react';
import { X, BarChart2, FileText, Check, Loader2 } from 'lucide-react';
import type { ChartSeries } from './ExpandedChartModal';
import ExpandedChartModal from './ExpandedChartModal';

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

export function FullWidthChart({ series, onClick }: { series: ChartSeries; onClick: () => void }) {
  const W = 700, H = 220;
  const PAD = { top: 28, right: 40, bottom: 44, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);

  const ref = parseRef(series.referenceRange);
  const values = series.points.map(p => p.value);
  const refVals = [ref.min, ref.max].filter(Boolean) as number[];
  const allVals = [...values, ...refVals];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.18 || 1;
  const minV = rawMin - pad, maxV = rawMax + pad, range = maxV - minV;

  const toX = (i: number) => PAD.left + (innerW / Math.max(series.points.length - 1, 1)) * i;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;
  const polyline = series.points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerH} ` + series.points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ') + ` ${toX(series.points.length - 1)},${PAD.top + innerH}`;

  const lastFlag = series.points[series.points.length - 1]?.flag ?? 'Normal';
  const lc = flagColor(lastFlag);
  const gradId = `cmp2-${series.name.replace(/\s+/g, '')}`;
  const trend = series.points.length > 1 ? series.points[series.points.length - 1].value - series.points[0].value : 0;
  const trendPct = series.points[0]?.value ? ((trend / series.points[0].value) * 100).toFixed(1) : '0';

  return (
    <div
      onClick={onClick}
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${lastFlag !== 'Normal' ? `${lc}30` : 'rgba(255,255,255,0.1)'}`, borderRadius: '16px', padding: '20px 24px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'}
    >
      {/* hint */}
      <div style={{ position: 'absolute', top: '14px', right: '14px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', color: 'rgba(212,175,55,0.7)' }}>
        clic para editar valores
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: lc }}>{series.name}</p>
          {series.referenceRange && <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Ref: {series.referenceRange} {series.unit}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '32px', fontWeight: 900, color: lc, fontFamily: 'monospace' }}>{series.points[series.points.length - 1]?.value}</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginLeft: '5px' }}>{series.unit}</span>
          {series.points.length > 1 && (
            <p style={{ margin: '3px 0 0', fontSize: '11px', color: trend > 0 ? (lastFlag === 'Alto' ? '#ef4444' : '#22c55e') : '#3b82f6', textAlign: 'right' }}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(Number(trendPct))}% desde el inicio
            </p>
          )}
        </div>
      </div>

      {/* Full-width SVG */}
      <div style={{ position: 'relative' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lc} stopOpacity="0.35" />
              <stop offset="100%" stopColor={lc} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Y grid */}
          {[0, 0.33, 0.66, 1].map((t, i) => {
            const v = minV + range * t; const y = toY(v);
            return <g key={i}>
              <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.3)">{v.toFixed(1)}</text>
            </g>;
          })}

          {/* Reference band */}
          {(ref.min != null || ref.max != null) && (() => {
            const bandTop = toY(ref.max ?? maxV);
            const bandBot = toY(ref.min ?? minV);
            return <>
              <rect x={PAD.left} y={bandTop} width={innerW} height={Math.max(bandBot - bandTop, 0)} fill="rgba(34,197,94,0.07)" />
              {ref.max != null && <>
                <line x1={PAD.left} y1={toY(ref.max)} x2={PAD.left + innerW} y2={toY(ref.max)} stroke="#22c55e" strokeWidth="1" strokeDasharray="6 4" opacity="0.45" />
                <text x={PAD.left + innerW + 8} y={toY(ref.max) + 4} fontSize="9" fill="#22c55e" opacity="0.6">máx {ref.max}</text>
              </>}
              {ref.min != null && <>
                <line x1={PAD.left} y1={toY(ref.min)} x2={PAD.left + innerW} y2={toY(ref.min)} stroke="#22c55e" strokeWidth="1" strokeDasharray="6 4" opacity="0.45" />
                <text x={PAD.left + innerW + 8} y={toY(ref.min) + 4} fontSize="9" fill="#22c55e" opacity="0.6">mín {ref.min}</text>
              </>}
            </>;
          })()}

          <polygon points={area} fill={`url(#${gradId})`} />
          {series.points.length > 1 && <polyline points={polyline} fill="none" stroke={lc} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

          {series.points.map((pt, i) => (
            <g key={i}
              onMouseEnter={e => { e.stopPropagation(); setTooltip({ i, x: toX(i), y: toY(pt.value) }); }}
              onMouseLeave={() => setTooltip(null)}
            >
              <circle cx={toX(i)} cy={toY(pt.value)} r={14} fill="transparent" />
              <circle cx={toX(i)} cy={toY(pt.value)} r={6} fill={flagColor(pt.flag)} stroke="#0a0a15" strokeWidth="2" />
              <circle cx={toX(i)} cy={toY(pt.value)} r={10} fill="transparent" stroke={flagColor(pt.flag)} strokeWidth="1" opacity="0.35" />
            </g>
          ))}

          {series.points.map((pt, i) => (
            <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.25)">
              {new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
            </text>
          ))}

          {tooltip && (
            <g>
              <rect x={toX(tooltip.i) - 48} y={tooltip.y - 44} width={96} height={38} rx="6" fill="#1a1a2e" stroke={flagColor(series.points[tooltip.i].flag)} strokeWidth="1" />
              <text x={toX(tooltip.i)} y={tooltip.y - 26} textAnchor="middle" fontSize="13" fontWeight="bold" fill={flagColor(series.points[tooltip.i].flag)}>
                {series.points[tooltip.i].value} {series.unit}
              </text>
              <text x={toX(tooltip.i)} y={tooltip.y - 12} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">
                {new Date(series.points[tooltip.i].date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

interface Props {
  series: ChartSeries[];
  onClose: () => void;
  onAddToReport: (names: string[]) => Promise<boolean>;
}

export default function ComparativeModal({ series: initialSeries, onClose, onAddToReport }: Props) {
  // Keep a mutable local copy so edits from ExpandedChartModal persist in the comparative view
  const [localSeries, setLocalSeries] = useState<ChartSeries[]>(initialSeries);
  const [expandedSeries, setExpandedSeries] = useState<ChartSeries | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const names = localSeries.map(s => s.name);

  // Called when ExpandedChartModal saves an edited point
  const handleValueUpdated = (biomarkerId: string, newValue: string, newFlag: string, studyId: string) => {
    const updatedValue = parseFloat(newValue);
    if (isNaN(updatedValue)) return;
    // Update localSeries
    setLocalSeries(prev => prev.map(s => ({
      ...s,
      points: s.points.map(p =>
        p.biomarkerId === biomarkerId && p.studyId === studyId
          ? { ...p, value: updatedValue, flag: newFlag }
          : p
      ),
    })));
    // Also update the currently-open expanded series so it reflects the change
    setExpandedSeries(prev => prev ? {
      ...prev,
      points: prev.points.map(p =>
        p.biomarkerId === biomarkerId && p.studyId === studyId
          ? { ...p, value: updatedValue, flag: newFlag }
          : p
      ),
    } : null);
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      const ok = await onAddToReport(names);
      if (ok) {
        setSaved(true);
      } else {
        alert('Error al guardar las gráficas en el reporte. Revisa la consola.');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)' }} onClick={onClose}>
        <div style={{ background: 'linear-gradient(145deg, #0a0a15, #0f0f20)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '24px', padding: '32px 36px', width: '860px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 40px 100px rgba(0,0,0,0.8)', position: 'relative' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart2 size={20} color="var(--gold-primary)" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff' }}>Análisis Comparativo</h2>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{localSeries.length} marcadores · clic en cada gráfica para editar valores</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleAdd}
                disabled={saving || saved}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 22px', borderRadius: '12px', border: 'none', background: saved ? 'rgba(34,197,94,0.2)' : saving ? 'rgba(212,175,55,0.3)' : 'linear-gradient(135deg, #d4af37, #b8922a)', color: saved ? '#22c55e' : '#000', cursor: saving || saved ? 'default' : 'pointer', fontSize: '13px', fontWeight: 800, boxShadow: saved || saving ? 'none' : '0 4px 20px rgba(212,175,55,0.4)', transition: 'all 0.3s' }}
              >
                {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={15} /> : <FileText size={15} />}
                {saving ? 'Guardando...' : saved ? 'Agregado al reporte' : 'Agregar al reporte maestro'}
              </button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Stacked charts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {localSeries.map(s => (
              <FullWidthChart key={s.name} series={s} onClick={() => setExpandedSeries(s)} />
            ))}
          </div>

          <p style={{ margin: '20px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
            La franja verde indica el rango de referencia normal · Clic en cada gráfica para ver detalles y editar
          </p>
        </div>
      </div>

      {/* Nested expanded modal */}
      {expandedSeries && (
        <ExpandedChartModal
          series={expandedSeries}
          onClose={() => setExpandedSeries(null)}
          onValueUpdated={handleValueUpdated}
        />
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </>
  );
}
