'use client';
import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type AlertLevel = 'normal' | 'moderate' | 'critical';
type TrendDir = 'mejorando' | 'empeorando' | 'estable' | 'fluctuante';

interface TrendPoint { date: string; value: number; }
interface HeroBiomarker {
  name: string; value: number | string; unit: string;
  refMin?: number | null; refMax?: number | null; flag: string;
  patientExplanation?: string; trend?: TrendPoint[]; trendDir?: TrendDir;
}
interface OtherBiomarker { name: string; value: string | number; unit: string; flag: string; }
interface SystemData {
  name: string; icon: string; vitalityScore: number; alertLevel: AlertLevel;
  heroBiomarkers: HeroBiomarker[]; otherBiomarkers: OtherBiomarker[];
  clinicalInterpretation: string; keyAlert?: string | null;
}
export interface M2Data {
  studyCount: number; dateRange?: string; overallScore?: number; systems: SystemData[];
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function alertColor(l: AlertLevel) {
  return l === 'critical' ? '#ef4444' : l === 'moderate' ? '#f59e0b' : '#22c55e';
}
function flagColor(flag: string) {
  const f = (flag ?? '').toLowerCase();
  if (f === 'normal' || f === 'negativo' || f === 'ausentes') return '#22c55e';
  if (f.includes('crít') || f.includes('crit')) return '#ef4444';
  return '#f59e0b';
}

// ─── VitalityRing ─────────────────────────────────────────────────────────────
function VitalityRing({ score, level, icon, size = 80 }: { score: number; level: AlertLevel; icon: string; size?: number }) {
  const safeScore = isNaN(score) ? 0 : Math.max(0, Math.min(100, score));
  // Validate icon is an emoji (reject Arabic/multi-letter text the AI sometimes returns)
  const isEmoji = icon.length <= 8 && !/[a-zA-Z\u0600-\u06FF]{2,}/.test(icon);
  const fallbackIcon = level === 'critical' ? '🚨' : level === 'moderate' ? '⚠️' : '✅';
  const safeIcon = isEmoji ? icon : fallbackIcon;
  const r = size * 0.41;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (safeScore / 100) * circ;
  const c = alertColor(level);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={size * 0.085} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={size * 0.085}
          strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`}
          style={{ filter: `drop-shadow(0 0 ${size * 0.07}px ${c}90)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color: c, lineHeight: 1 }}>{safeScore}</span>
        <span style={{ fontSize: size * 0.24, lineHeight: 1 }}>{safeIcon}</span>
      </div>
    </div>
  );
}

// ─── RangeBar ─────────────────────────────────────────────────────────────────
function RangeBar({ value, refMin, refMax, flag }: { value: number | string; refMin?: number | null; refMax?: number | null; flag: string }) {
  const c = flagColor(flag);
  const numVal = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numVal) || refMin == null || refMax == null) {
    return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: `${c}22`, color: c, border: `1px solid ${c}40` }}>{flag}</span>;
  }
  const range = refMax - refMin || 1;
  const margin = range * 0.35;
  const low = refMin - margin;
  const high = refMax + margin;
  const pct = Math.min(100, Math.max(0, ((numVal - low) / (high - low)) * 100));
  const nStart = ((refMin - low) / (high - low)) * 100;
  const nWidth = ((refMax - refMin) / (high - low)) * 100;
  return (
    <div style={{ paddingBottom: 14 }}>
      <div style={{ position: 'relative', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'absolute', top: 0, left: `${nStart}%`, width: `${nWidth}%`, height: '100%', borderRadius: 99, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: c, border: '2px solid rgba(0,0,0,0.6)', boxShadow: `0 0 8px ${c}90`, zIndex: 2 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>Bajo</span>
        <span style={{ fontSize: 9, color: 'rgba(34,197,94,0.5)' }}>Normal: {refMin}–{refMax}</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>Alto</span>
      </div>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ trend, flag }: { trend: TrendPoint[]; flag: string }) {
  // Sanitize: convert to numbers and filter NaN
  const clean = (trend ?? [])
    .map(t => ({ date: t.date, value: parseFloat(String(t.value)) }))
    .filter(t => !isNaN(t.value));
  if (clean.length < 2) return null;

  const c = flagColor(flag);
  const vals = clean.map(t => t.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const rng = maxV - minV || 1;
  const W = 140, H = 40;
  const pts = clean.map((t, i) => ({
    x: parseFloat(((i / (clean.length - 1)) * W).toFixed(2)),
    y: parseFloat((H - ((t.value - minV) / rng) * (H - 10) - 5).toFixed(2)),
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${W},${H} L0,${H}Z`;
  const uid = `sg${Math.random().toString(36).slice(2, 7)}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.35} />
          <stop offset="100%" stopColor={c} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid})`} />
      <path d={line} fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4 : 2.5}
          fill={i === pts.length - 1 ? c : 'rgba(15,15,20,0.9)'}
          stroke={c} strokeWidth={1.5}
          style={i === pts.length - 1 ? { filter: `drop-shadow(0 0 5px ${c})` } : {}} />
      ))}
      {[0, clean.length - 1].map(i => (
        <text key={i} x={pts[i].x} y={H} textAnchor={i === 0 ? 'start' : 'end'}
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
          {clean[i].date}
        </text>
      ))}
    </svg>
  );
}

// ─── TrendBadge ───────────────────────────────────────────────────────────────
function TrendBadge({ dir }: { dir: TrendDir }) {
  const MAP: Record<TrendDir, { icon: string; color: string; label: string }> = {
    mejorando: { icon: '↘', color: '#22c55e', label: 'Mejorando' },
    empeorando: { icon: '↗', color: '#ef4444', label: 'Empeorando' },
    estable: { icon: '→', color: '#3b82f6', label: 'Estable' },
    fluctuante: { icon: '↔', color: '#f59e0b', label: 'Fluctuante' },
  };
  const d = MAP[dir] ?? MAP.estable;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}30` }}>
      {d.icon} {d.label}
    </span>
  );
}

// ─── HeroBiomarkerCard ────────────────────────────────────────────────────────
function HeroBiomarkerCard({ bm }: { bm: HeroBiomarker }) {
  const c = flagColor(bm.flag);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${c}28`, borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -40, right: -40, width: 110, height: 110, borderRadius: '50%', background: `${c}07`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: 1.3 }}>{bm.name}</p>
        <div style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: `${c}22`, color: c, border: `1px solid ${c}40`, flexShrink: 0, marginLeft: 8 }}>{bm.flag}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: c, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{bm.value}</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{bm.unit}</span>
      </div>
      <RangeBar value={bm.value} refMin={bm.refMin} refMax={bm.refMax} flag={bm.flag} />
      {bm.trend && bm.trend.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Evolución temporal</span>
            {/* Only show negative trend badge if current state is not Normal */}
            {bm.trendDir && !(bm.flag?.toLowerCase() === 'normal' && bm.trendDir === 'empeorando') && <TrendBadge dir={bm.trendDir} />}
          </div>
          <Sparkline trend={bm.trend} flag={bm.flag} />
        </div>
      )}
      {bm.patientExplanation && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: 6 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(212,175,55,0.85)', fontStyle: 'italic', lineHeight: 1.65 }}>💬 {bm.patientExplanation}</p>
        </div>
      )}
    </div>
  );
}

// ─── NormalPill ───────────────────────────────────────────────────────────────
function NormalPill({ bm }: { bm: OtherBiomarker }) {
  const c = flagColor(bm.flag);
  const isNorm = (bm.flag ?? '').toLowerCase() === 'normal';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: `1px solid ${isNorm ? 'rgba(255,255,255,0.06)' : c + '30'}` }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', flex: 1 }}>{bm.name}</span>
      <span style={{ fontSize: 12, color: c, fontWeight: 700, whiteSpace: 'nowrap' }}>{bm.value} <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>{bm.unit}</span></span>
    </div>
  );
}

// ─── SystemCard ───────────────────────────────────────────────────────────────
function SystemCard({ sys }: { sys: SystemData }) {
  const [showOthers, setShowOthers] = useState(false);
  const bc = alertColor(sys.alertLevel);
  const alertLabels: Record<AlertLevel, string> = { normal: 'Homeostasis', moderate: 'Vigilancia', critical: 'Atención Requerida' };
  const alertIcons: Record<AlertLevel, string> = { normal: '✓', moderate: '⚠', critical: '🔴' };

  return (
    <div style={{ borderRadius: 20, border: `1px solid ${bc}20`, overflow: 'hidden', marginBottom: 28, background: 'rgba(255,255,255,0.015)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, borderBottom: `1px solid rgba(255,255,255,0.05)`, background: `linear-gradient(135deg, ${bc}08 0%, transparent 100%)` }}>
        <VitalityRing score={sys.vitalityScore} level={sys.alertLevel} icon={sys.icon} size={76} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f0ede6', letterSpacing: '-0.3px' }}>{sys.name}</h3>
            <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: `${bc}18`, color: bc, border: `1px solid ${bc}35` }}>
              {alertIcons[sys.alertLevel]} {alertLabels[sys.alertLevel]}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {sys.heroBiomarkers?.length ?? 0} marcadores clave · {sys.otherBiomarkers?.length ?? 0} en rango normal
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Vitalidad</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: bc }}>{sys.vitalityScore}<span style={{ fontSize: 12 }}>%</span></p>
        </div>
      </div>

      {/* Hero biomarkers */}
      {sys.heroBiomarkers?.length > 0 && (
        <div style={{ padding: '20px 24px 4px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>Marcadores Clave</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {sys.heroBiomarkers.map((bm, i) => <HeroBiomarkerCard key={i} bm={bm} />)}
          </div>
        </div>
      )}

      {/* Other biomarkers collapsible */}
      {sys.otherBiomarkers?.length > 0 && (
        <div style={{ padding: '12px 24px 0' }}>
          <button onClick={() => setShowOthers(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
              {showOthers ? '−' : '+'}
            </span>
            {showOthers ? 'Ocultar' : 'Ver'} {sys.otherBiomarkers.length} marcadores en rango normal
          </button>
          {showOthers && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6, paddingBottom: 16, paddingTop: 8 }}>
              {sys.otherBiomarkers.map((bm, i) => <NormalPill key={i} bm={bm} />)}
            </div>
          )}
        </div>
      )}

      {/* Clinical interpretation */}
      <div style={{ margin: '16px 24px', padding: '14px 18px', borderRadius: 12, background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, color: 'rgba(212,175,55,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>💡 Interpretación Clínica</p>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>{sys.clinicalInterpretation}</p>
      </div>

      {/* Key alert */}
      {sys.keyAlert && (
        <div style={{ margin: '0 24px 20px', padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚡ Seguimiento: {sys.keyAlert}</p>
        </div>
      )}
    </div>
  );
}

// ─── OverviewBar ──────────────────────────────────────────────────────────────
function OverviewBar({ data }: { data: M2Data }) {
  const overall = data.overallScore ?? 0;
  const overallColor = overall >= 75 ? '#22c55e' : overall >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginBottom: 36, padding: '20px 24px', borderRadius: 16, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(212,175,55,0.7)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>Panorama de Sistemas</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {data.studyCount} estudio(s) analizados{data.dateRange ? ` · ${data.dateRange}` : ''}
          </p>
        </div>
        {data.overallScore != null && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Índice Global</p>
            <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: overallColor }}>
              {data.overallScore}<span style={{ fontSize: 14 }}>%</span>
            </p>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {data.systems.map((s, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <VitalityRing score={s.vitalityScore} level={s.alertLevel} icon={s.icon} size={52} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textAlign: 'center', maxWidth: 60, lineHeight: 1.3 }}>
              {s.name.replace('Sistema ', '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Renderer ────────────────────────────────────────────────────────────
export default function Module2Renderer({ content }: { content: string }) {
  let data: M2Data | null = null;
  const strategies = [
    () => { const m = content.match(/```json\s*([\s\S]*?)\s*```/); return m ? JSON.parse(m[1]) : null; },
    () => { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
    () => { const m = content.match(/```json\s*([\s\S]*)/); return m ? JSON.parse(m[1].trim()) : null; },
  ];
  for (const fn of strategies) {
    try { const r = fn(); if (r?.systems) { data = r; break; } } catch {}
  }

  if (!data?.systems) {
    return (
      <div style={{ padding: '28px 36px', color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.8 }}>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{content}</pre>
      </div>
    );
  }

  const sorted = [...data.systems].sort((a, b) => {
    const o: Record<AlertLevel, number> = { critical: 0, moderate: 1, normal: 2 };
    return o[a.alertLevel] - o[b.alertLevel];
  });

  return (
    <div style={{ padding: '24px 28px', fontFamily: 'var(--font-main, Inter, sans-serif)' }}>
      <OverviewBar data={data} />
      {sorted.map((sys, i) => <SystemCard key={i} sys={sys} />)}
    </div>
  );
}
