'use client';
import { useState } from 'react';
import { X, Edit2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { updateBiomarker } from '@/lib/api';

export interface ChartPoint {
  date: string;
  value: number;
  flag: string;
  biomarkerId?: string;
  studyId?: string;
}

export interface ChartSeries {
  name: string;
  unit: string;
  referenceRange?: string;
  points: ChartPoint[];
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

function flagColor(flag: string) {
  return flag === 'Alto' ? '#ef4444' : flag === 'Bajo' ? '#3b82f6' : '#22c55e';
}

interface Props {
  series: ChartSeries;
  onClose: () => void;
  onValueUpdated?: (biomarkerId: string, newValue: string, newFlag: string, studyId: string) => void;
}

export default function ExpandedChartModal({ series, onClose, onValueUpdated }: Props) {
  const [points, setPoints] = useState<ChartPoint[]>(series.points);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editFlag, setEditFlag] = useState('');
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);

  const W = 720, H = 300;
  const PAD = { top: 40, right: 32, bottom: 48, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ref = parseRef(series.referenceRange);
  const values = points.map(p => p.value);
  const refVals = [ref.min, ref.max].filter(Boolean) as number[];
  const allVals = [...values, ...refVals];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.15 || 1;
  const minV = rawMin - pad;
  const maxV = rawMax + pad;
  const range = maxV - minV;

  const toX = (i: number) => PAD.left + (innerW / Math.max(points.length - 1, 1)) * i;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const polyline = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerH} ` + points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ') + ` ${toX(points.length - 1)},${PAD.top + innerH}`;

  const lastFlag = points[points.length - 1]?.flag ?? 'Normal';
  const lc = flagColor(lastFlag);

  const handleEdit = (i: number) => {
    setEditIdx(i);
    setEditVal(String(points[i].value));
    setEditFlag(points[i].flag);
    setTooltip(null);
  };

  const handleSave = async () => {
    if (editIdx === null) return;
    const pt = points[editIdx];
    if (!pt.biomarkerId) {
      // Update only locally
      setPoints(prev => prev.map((p, i) => i === editIdx ? { ...p, value: parseFloat(editVal) || p.value, flag: editFlag } : p));
      setEditIdx(null);
      return;
    }
    setSaving(true);
    await updateBiomarker(pt.biomarkerId, { value: editVal, flag: editFlag, originalValue: String(pt.value) });
    const updated = points.map((p, i) => i === editIdx ? { ...p, value: parseFloat(editVal) || p.value, flag: editFlag } : p);
    setPoints(updated);
    onValueUpdated?.(pt.biomarkerId, editVal, editFlag, pt.studyId ?? '');
    setSaving(false);
    setEditIdx(null);
  };

  const yGridLines = 5;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(145deg, #0f0f1a, #12121f)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '24px', padding: '36px 40px', width: '820px', maxWidth: '95vw', boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.1)', position: 'relative' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>{series.name}</h2>
            {series.referenceRange && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                Rango de referencia: <span style={{ color: 'rgba(255,255,255,0.7)' }}>{series.referenceRange} {series.unit}</span>
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '36px', fontWeight: 900, color: lc, fontFamily: 'monospace' }}>{points[points.length - 1]?.value}</span>
              <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>{series.unit}</span>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div style={{ position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', padding: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <svg width={W} height={H} style={{ overflow: 'visible', maxWidth: '100%' }}>
            <defs>
              <linearGradient id="exp-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lc} stopOpacity="0.3" />
                <stop offset="100%" stopColor={lc} stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="ref-band-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.07" />
              </linearGradient>
            </defs>

            {/* Y grid lines */}
            {Array.from({ length: yGridLines }).map((_, i) => {
              const v = minV + (range / (yGridLines - 1)) * i;
              const y = toY(v);
              return (
                <g key={i}>
                  <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.3)">{v.toFixed(1)}</text>
                </g>
              );
            })}

            {/* Reference band */}
            {(ref.min != null || ref.max != null) && (() => {
              const bandTop = toY(ref.max ?? maxV);
              const bandBot = toY(ref.min ?? minV);
              const bandH = bandBot - bandTop;
              return (
                <>
                  <rect x={PAD.left} y={bandTop} width={innerW} height={Math.max(bandH, 0)} fill="url(#ref-band-grad)" />
                  {ref.max != null && <line x1={PAD.left} y1={toY(ref.max)} x2={PAD.left + innerW} y2={toY(ref.max)} stroke="#22c55e" strokeWidth="1" strokeDasharray="6 4" opacity="0.5" />}
                  {ref.min != null && <line x1={PAD.left} y1={toY(ref.min)} x2={PAD.left + innerW} y2={toY(ref.min)} stroke="#22c55e" strokeWidth="1" strokeDasharray="6 4" opacity="0.5" />}
                  {ref.max != null && <text x={PAD.left + innerW + 6} y={toY(ref.max) + 4} fontSize="9" fill="#22c55e" opacity="0.7">máx {ref.max}</text>}
                  {ref.min != null && <text x={PAD.left + innerW + 6} y={toY(ref.min) + 4} fontSize="9" fill="#22c55e" opacity="0.7">mín {ref.min}</text>}
                </>
              );
            })()}

            {/* Area + line */}
            <polygon points={area} fill="url(#exp-area-grad)" />
            {points.length > 1 && <polyline points={polyline} fill="none" stroke={lc} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

            {/* Data points */}
            {points.map((pt, i) => (
              <g key={i} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({ i, x: toX(i), y: toY(pt.value) })}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => handleEdit(i)}>
                <circle cx={toX(i)} cy={toY(pt.value)} r={16} fill="transparent" />
                <circle cx={toX(i)} cy={toY(pt.value)} r={6} fill={flagColor(pt.flag)} stroke="#0f0f1a" strokeWidth="2" />
                <circle cx={toX(i)} cy={toY(pt.value)} r={10} fill="transparent" stroke={flagColor(pt.flag)} strokeWidth="1" opacity="0.4" />
              </g>
            ))}

            {/* X axis labels */}
            {points.map((pt, i) => (
              <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">
                {new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
              </text>
            ))}

            {/* Hover tooltip */}
            {tooltip && (
              <g>
                <rect x={toX(tooltip.i) - 44} y={tooltip.y - 42} width={88} height={36} rx="6" fill="#1a1a2e" stroke={flagColor(points[tooltip.i].flag)} strokeWidth="1" />
                <text x={toX(tooltip.i)} y={tooltip.y - 24} textAnchor="middle" fontSize="13" fontWeight="bold" fill={flagColor(points[tooltip.i].flag)}>{points[tooltip.i].value} {series.unit}</text>
                <text x={toX(tooltip.i)} y={tooltip.y - 11} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">
                  {new Date(points[tooltip.i].date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                </text>
                <text x={toX(tooltip.i)} y={tooltip.y - 44} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)">clic para editar</text>
              </g>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '20px', marginTop: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '24px', height: '3px', background: '#22c55e', opacity: 0.5, borderRadius: '2px', borderTop: '1px dashed #22c55e' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Rango normal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: lc }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Valor medido · clic para editar</span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{points.length} mediciones</span>
        </div>

        {/* Edit panel */}
        {editIdx !== null && (
          <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Editando — {new Date(points[editIdx].date).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
              <input
                type="text" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '8px', padding: '8px 14px', color: '#fff', fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, width: '140px', outline: 'none' }}
              />
              <span style={{ marginLeft: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{series.unit}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['Normal', 'Alto', 'Bajo'] as const).map(f => (
                <button key={f} onClick={() => setEditFlag(f)} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${editFlag === f ? (f === 'Normal' ? '#22c55e' : '#ef4444') : 'rgba(255,255,255,0.15)'}`, background: editFlag === f ? (f === 'Normal' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent', color: editFlag === f ? (f === 'Normal' ? '#22c55e' : '#ef4444') : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>{f}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditIdx(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>
                {saving ? '...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
