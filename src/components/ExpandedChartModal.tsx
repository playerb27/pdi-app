'use client';
import { useState, useEffect } from 'react';
import { X, Edit2, Check, ChevronLeft, ChevronRight, Eye, Settings2 } from 'lucide-react';
import { updateBiomarker, updateBiomarkerRange, deleteBiomarker } from '@/lib/api';

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
  if (flag === 'Excluido') return 'rgba(255,255,255,0.2)';
  return flag === 'Alto' ? '#ef4444' : flag === 'Bajo' ? '#3b82f6' : '#22c55e';
}

interface Props {
  series: ChartSeries;
  patientId: string;
  onClose: () => void;
  onValueUpdated?: (biomarkerId: string, newValue: string, newFlag: string, studyId: string) => void;
  onRangeUpdated?: (newRange: string) => void;
  documents?: any[];
}

export default function ExpandedChartModal({ series, patientId, onClose, onValueUpdated, onRangeUpdated, documents }: Props) {
  const gradId = `exp-area-grad-${series.name.replace(/\W/g, '')}`;
  const [points, setPoints] = useState<ChartPoint[]>(series.points.filter(p => p.flag !== 'Excluido'));
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editFlag, setEditFlag] = useState('');
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Reference range local state (editable)
  const [refRange, setRefRange] = useState(series.referenceRange ?? '');
  const [showRangeEdit, setShowRangeEdit] = useState(false);
  const [refMinEdit, setRefMinEdit] = useState('');
  const [refMaxEdit, setRefMaxEdit] = useState('');
  const [savingRange, setSavingRange] = useState(false);
  const [rangeStatus, setRangeStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (editIdx === null && !saving) {
      setPoints(series.points.filter(p => p.flag !== 'Excluido'));
    }
  }, [series.points, series.name]);

  // When opening range editor pre-fill with current values
  useEffect(() => {
    if (showRangeEdit) {
      const parsed = parseRef(refRange);
      setRefMinEdit(parsed.min !== null ? String(parsed.min) : '');
      setRefMaxEdit(parsed.max !== null ? String(parsed.max) : '');
    }
  }, [showRangeEdit]);

  const W = 720, H = 300;
  const PAD = { top: 40, right: 32, bottom: 48, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ref = parseRef(refRange);
  const values = points.map(p => p.value);
  const refVals = [ref.min, ref.max].filter((v): v is number => v !== null && v !== undefined) as number[];
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
      setSaveStatus({ ok: false, msg: '⚠️ Este punto no tiene ID en la base de datos.' });
      setEditIdx(null);
      return;
    }
    setSaving(true);
    setSaveStatus(null);

    const ok = await updateBiomarker(pt.biomarkerId, { value: editVal, flag: editFlag });

    if (!ok) {
      setSaveStatus({ ok: false, msg: '❌ Error al guardar. El valor NO se actualizó. Intenta de nuevo.' });
      setSaving(false);
      setEditIdx(null);
      return;
    }

    const newNumVal = parseFloat(editVal);
    const safeNewVal = isNaN(newNumVal) ? pt.value : newNumVal;
    const updated = points.map((p, i) => i === editIdx ? {
      ...p,
      value: safeNewVal,
      flag: editFlag,
      isEdited: true,
      originalValue: null,
    } : p);
    setPoints(updated);
    onValueUpdated?.(pt.biomarkerId, editVal, editFlag, pt.studyId ?? '');

    setSaveStatus({ ok: true, msg: `✅ Guardado. Valor en base de datos: ${editVal}` });
    setSaving(false);
    setEditIdx(null);
  };

  const handleExclude = async () => {
    if (editIdx === null) return;
    const pt = points[editIdx];
    if (!pt.biomarkerId) {
      alert('Este punto no tiene ID en la base de datos.');
      setEditIdx(null);
      return;
    }
    setSaving(true);
    const ok = await deleteBiomarker(pt.biomarkerId);
    if (!ok) {
      alert('No se pudo eliminar de la base de datos.');
      setSaving(false);
      return;
    }
    setPoints(prev => prev.filter((_, i) => i !== editIdx));
    onValueUpdated?.(pt.biomarkerId, String(pt.value), 'Excluido', pt.studyId ?? '');
    setSaving(false);
    setEditIdx(null);
  };

  // Save reference range to ALL biomarker rows in the series
  const handleSaveRange = async () => {
    const minVal = refMinEdit.trim() !== '' ? parseFloat(refMinEdit) : null;
    const maxVal = refMaxEdit.trim() !== '' ? parseFloat(refMaxEdit) : null;

    if ((refMinEdit.trim() !== '' && isNaN(minVal!)) || (refMaxEdit.trim() !== '' && isNaN(maxVal!))) {
      setRangeStatus({ ok: false, msg: '⚠️ Ingresa valores numéricos válidos.' });
      return;
    }

    let newRange = '';
    if (minVal !== null && maxVal !== null) newRange = `${minVal} - ${maxVal}`;
    else if (maxVal !== null) newRange = `< ${maxVal}`;
    else if (minVal !== null) newRange = `> ${minVal}`;

    const ids = points.map(p => p.biomarkerId).filter((id): id is string => !!id);
    if (ids.length === 0) {
      setRangeStatus({ ok: false, msg: '⚠️ No se encontraron IDs de base de datos para actualizar.' });
      return;
    }

    setSavingRange(true);
    setRangeStatus(null);
    const ok = await updateBiomarkerRange(ids, newRange);

    if (!ok) {
      setRangeStatus({ ok: false, msg: '❌ Error al guardar los límites. Intenta de nuevo.' });
      setSavingRange(false);
      return;
    }

    setRefRange(newRange);
    onRangeUpdated?.(newRange);
    setRangeStatus({ ok: true, msg: `✅ Límites actualizados: ${newRange || 'sin límites'}` });
    setSavingRange(false);
    setShowRangeEdit(false);
  };

  const yGridLines = 5;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(145deg, #0f0f1a, #12121f)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '24px', padding: '36px 40px', width: '820px', maxWidth: '95vw', maxHeight: '95vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.1)', position: 'relative' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>{series.name}</h2>
            {refRange && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                Rango de referencia: <span style={{ color: 'rgba(255,255,255,0.7)' }}>{refRange} {series.unit}</span>
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
          {points.length === 1 ? (() => {
            // ── EPIC ZONE BAR for single measurement ──────────────────────────
            const spt = points[0];
            const WBAR = 704, HBAR = 200;
            const BL = 40, BR = 664, bW = BR - BL;
            const bY = 90, bH = 56, bRad = 28;

            const allV = [spt.value];
            if (ref.min !== null) allV.push(ref.min);
            if (ref.max !== null) allV.push(ref.max);
            const dMin = Math.min(...allV), dMax = Math.max(...allV);
            const sp = dMax - dMin || Math.abs(dMax) * 0.4 || 1;
            const aMin = dMin - sp * 0.28, aMax = dMax + sp * 0.28;
            const aSpan = aMax - aMin;
            const tX = (v: number) => BL + Math.max(0, Math.min(1, (v - aMin) / aSpan)) * bW;

            const vX = tX(spt.value);
            const rMinX = ref.min !== null ? tX(ref.min) : BL;
            const rMaxX = ref.max !== null ? tX(ref.max) : BR;
            const hLow  = ref.min !== null && (rMinX - BL) > 4;
            const hHigh = ref.max !== null && (BR - rMaxX) > 4;
            const nStart = hLow ? rMinX : BL;
            const nEnd   = hHigh ? rMaxX : BR;
            const nX = Math.max(BL + 4, Math.min(BR - 4, vX));
            const sc = flagColor(spt.flag, spt.isEdited);
            const dateLabel = new Date(/^\d{4}-\d{2}-\d{2}$/.test(spt.date) ? spt.date + 'T12:00:00' : spt.date)
              .toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

            return (
              <div style={{ padding: '8px 0' }}>
                {/* Clickable big value — triggers edit panel */}
                <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                  <button
                    onClick={() => handleEdit(0)}
                    title="Clic para editar valor"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 12px', borderRadius: '12px', transition: 'background 0.2s', display: 'inline-block' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontSize: '56px', fontWeight: 900, color: sc, fontFamily: 'monospace', lineHeight: 1, filter: `drop-shadow(0 0 24px ${sc}55)` }}>{spt.value}</span>
                    <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.35)', marginLeft: '8px' }}>{series.unit}</span>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Edit2 size={10} /> clic para editar
                    </div>
                  </button>
                  {spt.flag !== 'Normal' && (
                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '13px', background: `${sc}22`, color: sc, padding: '4px 16px', borderRadius: '24px', fontWeight: 800, letterSpacing: '0.5px' }}>{spt.flag}</span>
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginTop: '6px' }}>{dateLabel}</div>
                </div>

                {/* Zone bar */}
                <svg width={WBAR} height={HBAR} style={{ overflow: 'visible', maxWidth: '100%', display: 'block', margin: '0 auto' }}>
                  <defs>
                    <clipPath id="modal-zb-clip"><rect x={BL} y={bY} width={bW} height={bH} rx={bRad} /></clipPath>
                    <filter id="modal-zb-glow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="7" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <linearGradient id="modal-zb-low" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
                    </linearGradient>
                    <linearGradient id="modal-zb-norm" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.22" />
                      <stop offset="50%" stopColor="#22c55e" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.22" />
                    </linearGradient>
                    <linearGradient id="modal-zb-high" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
                    </linearGradient>
                  </defs>

                  <rect x={BL} y={bY} width={bW} height={bH} rx={bRad} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  {hLow && <rect x={BL} y={bY} width={rMinX - BL} height={bH} fill="url(#modal-zb-low)" clipPath="url(#modal-zb-clip)" />}
                  <rect x={nStart} y={bY} width={nEnd - nStart} height={bH} fill="url(#modal-zb-norm)" clipPath="url(#modal-zb-clip)" />
                  {hHigh && <rect x={rMaxX} y={bY} width={BR - rMaxX} height={bH} fill="url(#modal-zb-high)" clipPath="url(#modal-zb-clip)" />}
                  {hLow  && <line x1={rMinX} y1={bY} x2={rMinX} y2={bY + bH} stroke="rgba(255,255,255,0.15)" strokeWidth="2" />}
                  {hHigh && <line x1={rMaxX} y1={bY} x2={rMaxX} y2={bY + bH} stroke="rgba(255,255,255,0.15)" strokeWidth="2" />}
                  {hLow && (rMinX - BL) > 80 && (
                    <text x={(BL + rMinX) / 2} y={bY + bH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="800" fill="rgba(59,130,246,0.85)" letterSpacing="1.5">BAJO</text>
                  )}
                  {(nEnd - nStart) > 80 && (
                    <text x={(nStart + nEnd) / 2} y={bY + bH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="800" fill="rgba(34,197,94,0.85)" letterSpacing="1.5">NORMAL</text>
                  )}
                  {hHigh && (BR - rMaxX) > 80 && (
                    <text x={(rMaxX + BR) / 2} y={bY + bH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="800" fill="rgba(239,68,68,0.85)" letterSpacing="1.5">ALTO</text>
                  )}
                  {hLow && <text x={rMinX} y={bY - 10} textAnchor="middle" fontSize="12" fill="rgba(59,130,246,0.6)" fontWeight="700">{ref.min}</text>}
                  {hHigh && <text x={rMaxX} y={bY - 10} textAnchor="middle" fontSize="12" fill="rgba(239,68,68,0.6)" fontWeight="700">{ref.max}</text>}
                  <line x1={nX} y1={bY - 38} x2={nX} y2={bY + bH + 12} stroke={sc} strokeWidth="2.5" strokeOpacity="0.45" />
                  <circle cx={nX} cy={bY + bH / 2} r={20} fill={sc} filter="url(#modal-zb-glow)" stroke="#0f0f1a" strokeWidth="3.5" />
                  <text x={nX} y={bY + bH / 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="monospace">{spt.value}</text>
                </svg>
              </div>
            );
          })() : (
          <svg width={W} height={H} style={{ overflow: 'visible', maxWidth: '100%' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lc} stopOpacity="0.3" />
                <stop offset="100%" stopColor={lc} stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="ref-band-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.07" />
              </linearGradient>
            </defs>

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

            <polygon points={area} fill={`url(#${gradId})`} />
            {points.length > 1 && <polyline points={polyline} fill="none" stroke={lc} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

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

            {points.map((pt, i) => (
              <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">
              {new Date(/^\d{4}-\d{2}-\d{2}$/.test(pt.date) ? pt.date + 'T12:00:00' : pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
              </text>
            ))}

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
                    {new Date(/^\d{4}-\d{2}-\d{2}$/.test(pt.date) ? pt.date + 'T12:00:00' : pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </text>
                  <text x={toX(tooltip.i)} y={tooltip.y - rectH - 10} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)">clic para editar</text>
                </g>
              );
            })()}
          </svg>
          )}
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

        {/* ── Configure limits panel ─────────────────────────────────────────── */}
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => { setShowRangeEdit(v => !v); setRangeStatus(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: showRangeEdit ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showRangeEdit ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', color: showRangeEdit ? 'var(--gold-primary)' : 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}
          >
            <Settings2 size={14} />
            Configurar límites de referencia
          </button>

          {showRangeEdit && (
            <div style={{ marginTop: '12px', padding: '20px', background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: '14px' }}>
              <p style={{ margin: '0 0 14px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Límites de referencia — se guardan en todos los estudios de este marcador
              </p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {/* Min */}
                <div>
                  <label style={{ fontSize: '11px', color: 'rgba(59,130,246,0.8)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Límite inferior (Bajo)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      value={refMinEdit}
                      onChange={e => setRefMinEdit(e.target.value)}
                      placeholder="sin límite"
                      style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '16px', fontFamily: 'monospace', fontWeight: 700, width: '120px', outline: 'none' }}
                    />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{series.unit}</span>
                  </div>
                </div>

                {/* Max */}
                <div>
                  <label style={{ fontSize: '11px', color: 'rgba(239,68,68,0.8)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Límite superior (Alto)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      value={refMaxEdit}
                      onChange={e => setRefMaxEdit(e.target.value)}
                      placeholder="sin límite"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '16px', fontFamily: 'monospace', fontWeight: 700, width: '120px', outline: 'none' }}
                    />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{series.unit}</span>
                  </div>
                </div>

                {/* Preview */}
                <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ fontSize: '10px', display: 'block', marginBottom: '2px', color: 'rgba(255,255,255,0.3)' }}>Vista previa</span>
                  {refMinEdit || refMaxEdit
                    ? `${refMinEdit || '—'} → ${refMaxEdit || '—'} ${series.unit}`
                    : 'sin límites'}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button onClick={() => setShowRangeEdit(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px' }}>
                    Cancelar
                  </button>
                  <button onClick={handleSaveRange} disabled={savingRange} style={{ padding: '8px 20px', background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>
                    {savingRange ? '...' : 'Guardar límites'}
                  </button>
                </div>
              </div>

              {rangeStatus && (
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: rangeStatus.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${rangeStatus.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: rangeStatus.ok ? '#22c55e' : '#f87171', fontSize: '12px', fontWeight: 600 }}>
                  {rangeStatus.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit panel (for value editing) */}
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
                  <button key={f} onClick={() => setEditFlag(f)} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${editFlag === f ? (f === 'Normal' ? '#22c55e' : f === 'Alto' ? '#ef4444' : '#3b82f6') : 'rgba(255,255,255,0.15)'}`, background: editFlag === f ? (f === 'Normal' ? 'rgba(34,197,94,0.15)' : f === 'Alto' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)') : 'transparent', color: editFlag === f ? (f === 'Normal' ? '#22c55e' : f === 'Alto' ? '#ef4444' : '#3b82f6') : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>{f}</button>
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

            {/* Document viewer */}
            {editIdx !== null && documents?.some(d => d.study_id === points[editIdx].studyId) && (() => {
              const pt = points[editIdx];
              const doc = documents?.find(d => d.study_id === pt.studyId);
              if (!doc) return null;
              return (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                  <a
                    href={doc.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--gold-primary)', fontSize: '12px', fontWeight: 700, textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.2)'; e.currentTarget.style.borderColor = 'var(--gold-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.12)'; e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)'; }}
                  >
                    <Eye size={14} /> Ver Documento Original
                  </a>
                </div>
              );
            })()}
          </div>
        )}

        {/* Save status banner */}
        {saveStatus && (
          <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '10px', background: saveStatus.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${saveStatus.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`, color: saveStatus.ok ? '#22c55e' : '#f87171', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {saveStatus.msg}
          </div>
        )}
      </div>
    </div>
  );
}
