'use client';
import React, { useState, useEffect } from 'react';
import type { M2Data } from './Module2Renderer';

// ─── Types (mirrored from Module2Renderer) ────────────────────────────────────
type AlertLevel = 'normal' | 'moderate' | 'critical';
type TrendDir = 'mejorando' | 'empeorando' | 'estable' | 'fluctuante';

interface Module2EditorProps {
  content: string;
  onChange: (newJson: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseContent(content: string): M2Data | null {
  if (!content) return null;
  const strategies = [
    // 1. Properly fenced JSON block
    () => { const m = content.match(/```json\s*([\s\S]*?)\s*```/); return m ? JSON.parse(m[1]) : null; },
    // 2. Raw JSON object (no fences)
    () => { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
    // 3. JSON starting after ```json with no closing fence
    () => { const m = content.match(/```json\s*([\s\S]*)/); return m ? JSON.parse(m[1].trim()) : null; },
  ];
  for (const fn of strategies) {
    try { const r = fn(); if (r?.systems) return r; } catch {}
  }
  return null;
}

function serialize(data: M2Data): string {
  return '```json\n' + JSON.stringify(data, null, 2) + '\n```';
}

const ALERT_OPTIONS: { value: AlertLevel; label: string; color: string }[] = [
  { value: 'normal',   label: '✓ Homeostasis',        color: '#22c55e' },
  { value: 'moderate', label: '⚠ Vigilancia',          color: '#f59e0b' },
  { value: 'critical', label: '🔴 Atención Requerida', color: '#ef4444' },
];

const FLAG_OPTIONS = ['Normal', 'Alto', 'Bajo', 'Crítico', 'Borderline'];
const TREND_OPTIONS: { value: TrendDir; label: string }[] = [
  { value: 'estable',    label: '→ Estable' },
  { value: 'mejorando',  label: '↘ Mejorando' },
  { value: 'empeorando', label: '↗ Empeorando' },
  { value: 'fluctuante', label: '↔ Fluctuante' },
];

// ─── Shared field styles ──────────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px',
};
const textarea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px',
  color: '#f0ede6', fontSize: 13, lineHeight: 1.65, fontFamily: 'inherit',
  resize: 'vertical', outline: 'none',
};
const input: React.CSSProperties = {
  ...textarea, resize: 'none', minHeight: 'unset', padding: '8px 14px',
};
const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '7px 12px', color: '#f0ede6', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
};

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function Module2Editor({ content, onChange }: Module2EditorProps) {
  const [data, setData] = useState<M2Data | null>(() => parseContent(content));
  const [openSystems, setOpenSystems] = useState<number[]>([0]);

  // Re-parse if content prop changes externally
  useEffect(() => { setData(parseContent(content)); }, [content]);

  if (!data) {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        ⚠️ El contenido del módulo no está en formato editable todavía. Genera o regenera el módulo primero.
      </div>
    );
  }

  // Update helper — immutable update of nested data
  function update(updater: (d: M2Data) => M2Data) {
    setData(prev => {
      if (!prev) return prev;
      const next = updater(JSON.parse(JSON.stringify(prev)));
      onChange(serialize(next));
      return next;
    });
  }

  function toggleSystem(i: number) {
    setOpenSystems(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]);
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: 'var(--font-main, Inter, sans-serif)' }}>

      {/* ── Global fields ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28, padding: '16px 20px', borderRadius: 14, background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)' }}>
        <div>
          <label style={fieldLabel}>Estudios analizados</label>
          <input type="number" min={1} max={50} value={data.studyCount}
            onChange={e => update(d => { d.studyCount = Number(e.target.value); return d; })}
            style={{ ...input, width: 80 }} />
        </div>
        <div>
          <label style={fieldLabel}>Período de análisis</label>
          <input type="text" placeholder="Ej: 2024-01 a 2026-05" value={data.dateRange ?? ''}
            onChange={e => update(d => { d.dateRange = e.target.value; return d; })}
            style={{ ...input, width: '100%' }} />
        </div>
        <div>
          <label style={fieldLabel}>Índice Global de Salud (0-100)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={0} max={100} value={data.overallScore ?? 75}
              onChange={e => update(d => { d.overallScore = Number(e.target.value); return d; })}
              style={{ flex: 1 }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: (data.overallScore ?? 75) >= 75 ? '#22c55e' : (data.overallScore ?? 75) >= 50 ? '#f59e0b' : '#ef4444', minWidth: 40 }}>
              {data.overallScore ?? 75}
            </span>
          </div>
        </div>
      </div>

      {/* ── Systems ── */}
      {data.systems.map((sys, si) => {
        const isOpen = openSystems.includes(si);
        const alertOpt = ALERT_OPTIONS.find(o => o.value === sys.alertLevel) ?? ALERT_OPTIONS[0];

        return (
          <div key={si} style={{ marginBottom: 16, borderRadius: 16, border: `1px solid ${alertOpt.color}28`, overflow: 'hidden', background: 'rgba(255,255,255,0.015)' }}>

            {/* System header — always visible */}
            <button onClick={() => toggleSystem(si)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 28 }}>{sys.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f0ede6' }}>{sys.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                  {sys.heroBiomarkers.length} marcadores clave · {sys.otherBiomarkers.length} normales
                </p>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${alertOpt.color}18`, color: alertOpt.color }}>
                {alertOpt.label}
              </span>
              <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Expanded form */}
            {isOpen && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                {/* Vitality + Alert level row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18, marginBottom: 20 }}>
                  <div>
                    <label style={fieldLabel}>Índice de Vitalidad del Sistema (0-100)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="range" min={0} max={100} value={sys.vitalityScore}
                        onChange={e => update(d => { d.systems[si].vitalityScore = Number(e.target.value); return d; })}
                        style={{ flex: 1 }} />
                      <span style={{ fontSize: 20, fontWeight: 900, color: alertOpt.color, minWidth: 44 }}>{sys.vitalityScore}%</span>
                    </div>
                  </div>
                  <div>
                    <label style={fieldLabel}>Nivel de Alerta</label>
                    <select value={sys.alertLevel}
                      onChange={e => update(d => { d.systems[si].alertLevel = e.target.value as AlertLevel; return d; })}
                      style={selectStyle}>
                      {ALERT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Clinical interpretation */}
                <div style={{ marginBottom: 16 }}>
                  <label style={fieldLabel}>💡 Interpretación Clínica (para el médico)</label>
                  <textarea rows={3} value={sys.clinicalInterpretation}
                    onChange={e => update(d => { d.systems[si].clinicalInterpretation = e.target.value; return d; })}
                    style={textarea} />
                </div>

                {/* Key alert */}
                <div style={{ marginBottom: 20 }}>
                  <label style={fieldLabel}>⚡ Alerta de Seguimiento (dejar vacío si no aplica)</label>
                  <input type="text" value={sys.keyAlert ?? ''}
                    onChange={e => update(d => { d.systems[si].keyAlert = e.target.value || null; return d; })}
                    placeholder="Ej: Monitorear TFG en próximo estudio"
                    style={{ ...input, width: '100%' }} />
                </div>

                {/* Hero biomarkers */}
                {sys.heroBiomarkers.length > 0 && (
                  <div>
                    <p style={{ ...fieldLabel, marginBottom: 12 }}>📍 Biomarcadores Clave</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {sys.heroBiomarkers.map((bm, bi) => (
                        <div key={bi} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#f0ede6' }}>{bm.name}</span>
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{bm.value} {bm.unit}</span>
                            <select value={bm.flag}
                              onChange={e => update(d => { d.systems[si].heroBiomarkers[bi].flag = e.target.value; return d; })}
                              style={{ ...selectStyle, marginLeft: 'auto', fontSize: 11 }}>
                              {FLAG_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            {bm.trendDir && (
                              <select value={bm.trendDir}
                                onChange={e => update(d => { d.systems[si].heroBiomarkers[bi].trendDir = e.target.value as TrendDir; return d; })}
                                style={{ ...selectStyle, fontSize: 11 }}>
                                {TREND_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            )}
                          </div>
                          <label style={fieldLabel}>💬 Explicación para el paciente</label>
                          <textarea rows={2} value={bm.patientExplanation ?? ''}
                            onChange={e => update(d => { d.systems[si].heroBiomarkers[bi].patientExplanation = e.target.value; return d; })}
                            placeholder="Explicación en lenguaje simple y motivador para el paciente..."
                            style={textarea} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
