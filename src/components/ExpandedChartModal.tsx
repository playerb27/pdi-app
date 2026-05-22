'use client';
import { useState, useEffect } from 'react';
import { X, Edit2, Check, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { updateBiomarker, deleteBiomarker } from '@/lib/api';
import { saveOverride, removeOverride } from '@/lib/biomarker-overrides';

export interface ChartPoint {
  date: string;
  value: number;
  flag: string;
  biomarkerId?: string;
  studyId?: string;
  isEdited?: boolean;
  originalValue?: string | null;
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

function flagColor(flag: string, isEdited?: boolean) {
  if (isEdited) return '#d4af37';
  return flag === 'Alto' ? '#ef4444' : flag === 'Bajo' ? '#3b82f6' : '#22c55e';
}

interface Props {
  series: ChartSeries;
  patientId: string;
  onClose: () => void;
  onValueUpdated?: (biomarkerId: string, newValue: string, newFlag: string, studyId: string) => void;
  documents?: any[];
}

export default function ExpandedChartModal({ series, patientId, onClose, onValueUpdated, documents }: Props) {
  const [points, setPoints] = useState<ChartPoint[]>(series.points.filter(p => p.flag !== 'Excluido'));
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editFlag, setEditFlag] = useState('');
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Sync internal points when parent series changes
  useEffect(() => {
    if (editIdx === null && !saving) {
      setPoints(series.points.filter(p => p.flag !== 'Excluido'));
    }
  }, [series.points]);

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

  const lastPoint = points[points.length - 1];
  const lc = flagColor(lastPoint?.flag ?? 'Normal', lastPoint?.isEdited);

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
      setSaveStatus({ ok: false, msg: '⚠️ Este punto no tiene ID en la base de datos. No se guardará al recargar la página.' });
      setEditIdx(null);
      return;
    }
    setSaving(true);
    setSaveStatus(null);

    const ok = await updateBiomarker(pt.biomarkerId, {
      value: editVal,
      flag: editFlag,
      originalValue: pt.isEdited ? pt.originalValue : String(pt.value)
    });

    if (!ok) {
      setSaveStatus({ ok: false, msg: '❌ Error al guardar en la base de datos. El valor NO se guardó. Por favor intenta de nuevo.' });
      setSaving(false);
      setEditIdx(null);
      return;
    }

    // Only update local state AFTER confirmed DB save
    const newNumVal = parseFloat(editVal);
    const safeNewVal = isNaN(newNumVal) ? pt.value : newNumVal;
    const cleanOrig = pt.isEdited ? String(pt.originalValue).split('|')[0] : String(pt.value);
    const timestamp = new Date().toISOString();
    const updated = points.map((p, i) => i === editIdx ? {
      ...p,
      value: safeNewVal,
      flag: editFlag,
      isEdited: true,
      originalValue: `${cleanOrig}|${timestamp}`
    } : p);
    setPoints(updated);
    onValueUpdated?.(pt.biomarkerId, editVal, editFlag, pt.studyId ?? '');

    // ── OVERRIDE LAYER ─────────────────────────────────────────────────────
    // Save to localStorage so this value ALWAYS survives page reloads,
    // regardless of what the dedup logic picks from the DB.
    saveOverride({
      patientId,
      studyId: pt.studyId ?? '',
      biomarkerId: pt.biomarkerId,
      canonicalName: series.name,
      studyDate: pt.date.slice(0, 10),
      value: editVal,
      numValue: safeNewVal,
      flag: editFlag,
    });

    setSaveStatus({ ok: true, msg: `✅ Guardado correctamente. Valor: ${editVal} — persistirá al recargar.` });
    setSaving(false);
    setEditIdx(null);
  };

  const handleExclude = async () => {
    if (editIdx === null) return;
    const pt = points[editIdx];

    if (!pt.biomarkerId) {
      alert('Este punto no tiene ID en la base de datos.\nEdita su valor manualmente o elimina el estudio completo.');
      setEditIdx(null);
      return;
    }

    setSaving(true);
    // DELETE the row from Supabase — the only approach that guarantees
    // the point never reappears on page reload.
    const ok = await deleteBiomarker(pt.biomarkerId);

    if (!ok) {
      alert('No se pudo eliminar de la base de datos. El punto sigue activo.');
      setSaving(false);
      return;
    }

    // Confirmed deleted — remove from local view and notify parent
    setPoints(prev => prev.filter((_, i) => i !== editIdx));
    onValueUpdated?.(pt.biomarkerId, String(pt.value), 'Excluido', pt.studyId ?? '');
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
                <circle cx={toX(i)} cy={toY(pt.value)} r={6} fill={flagColor(pt.flag, pt.isEdited)} stroke="#0f0f1a" strokeWidth="2" />
                <circle cx={toX(i)} cy={toY(pt.value)} r={10} fill="transparent" stroke={flagColor(pt.flag, pt.isEdited)} strokeWidth="1" opacity="0.4" />
              </g>
            ))}

            {/* X axis labels */}
            {points.map((pt, i) => (
              <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">
                {new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
              </text>
            ))}

            {/* Hover tooltip */}
            {tooltip && (() => {
              const pt = points[tooltip.i];
              const strokeColor = flagColor(pt.flag, pt.isEdited);
              const rectW = pt.isEdited ? 120 : 88;
              const rectH = pt.isEdited ? 46 : 36;
              return (
                <g>
                  <rect x={toX(tooltip.i) - rectW / 2} y={tooltip.y - rectH - 6} width={rectW} height={rectH} rx="6" fill="#1a1a2e" stroke={strokeColor} strokeWidth="1" />
                  {pt.isEdited && (
                    <text x={toX(tooltip.i)} y={tooltip.y - rectH + 4} textAnchor="middle" fontSize="7.5" fill="#d4af37" fontWeight="bold">✏️ Corregido a mano</text>
                  )}
                  <text x={toX(tooltip.i)} y={tooltip.y - 24} textAnchor="middle" fontSize="13" fontWeight="bold" fill={strokeColor}>{pt.value} {series.unit}</text>
                  <text x={toX(tooltip.i)} y={tooltip.y - 12} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">
                    {new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </text>
                  <text x={toX(tooltip.i)} y={tooltip.y - rectH - 10} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)">clic para editar</text>
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '20px', marginTop: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '24px', height: '3px', background: '#22c55e', opacity: 0.5, borderRadius: '2px', borderTop: '1px dashed #22c55e' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Rango normal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: lc }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Valor medido · clic para editar</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#d4af37' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Corregido manualmente</span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{points.length} mediciones</span>
        </div>

        {/* Edit panel */}
        {editIdx !== null && (
          <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => setEditIdx(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
                <button
                  onClick={handleExclude}
                  disabled={saving}
                  title="El valor se guarda en la base de datos pero ya no aparece en la gráfica"
                  style={{ padding: '8px 16px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '8px', color: '#f97316', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                >
                  {saving ? '...' : '◇ No graficar'}
                </button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>
                  {saving ? '...' : 'Guardar'}
                </button>
              </div>
            </div>

            {/* Audit trail + Eye button */}
            {editIdx !== null && (points[editIdx].isEdited || documents?.some(d => d.study_id === points[editIdx].studyId)) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', width: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  {points[editIdx].isEdited && points[editIdx].originalValue && (() => {
                    const parts = points[editIdx].originalValue!.split('|');
                    const origVal = parts[0];
                    const dateStr = parts[1] ? new Date(parts[1]).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Desconocida';
                    return (
                      <p style={{ margin: 0, fontSize: '11px', color: '#d4af37', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✏️</span> <span><strong>Corregido manualmente:</strong> El valor extraído originalmente era <strong>{origVal}</strong> (modificado el {dateStr}).</span>
                      </p>
                    );
                  })()}
                </div>
                {(() => {
                  const pt = points[editIdx];
                  const doc = documents?.find(d => d.study_id === pt.studyId);
                  if (!doc) return null;
                  return (
                    <a
                      href={doc.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: 'rgba(212,175,55,0.12)',
                        border: '1px solid rgba(212,175,55,0.3)',
                        color: 'var(--gold-primary)',
                        fontSize: '12px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(212,175,55,0.2)';
                        e.currentTarget.style.borderColor = 'var(--gold-primary)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(212,175,55,0.12)';
                        e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)';
                      }}
                    >
                      <Eye size={14} /> Ver Documento Original
                    </a>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Save status banner — shows success or error after every save attempt */}
        {saveStatus && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: saveStatus.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${saveStatus.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            color: saveStatus.ok ? '#22c55e' : '#f87171',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            {saveStatus.msg}
          </div>
        )}
      </div>
    </div>
  );
}
