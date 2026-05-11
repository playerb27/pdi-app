'use client';
import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud, BrainCircuit, Activity, ChevronDown, ChevronRight, Edit2, X, RotateCcw } from 'lucide-react';
import { getPatientById, updatePatient, createStudy, createBiomarkers, deleteBiomarkersForStudy, getStudiesWithBiomarkers, deleteStudy, getInterviewAnswers, getReportModules, Patient, Study } from '@/lib/api';
import { TOTAL_QUESTIONS } from '@/lib/questionnaire-data-ext';

// ─── Índice Maestro PDI ───────────────────────────────────────────────────────
const MASTER_INDEX = [
  { id: 1,  name: 'Fundamentos y Resumen Ejecutivo',              icon: '📋' },
  { id: 2,  name: 'Sistema Metabólico y Energético',              icon: '⚡' },
  { id: 3,  name: 'Salud Cardiovascular y Circulatoria',          icon: '❤️' },
  { id: 4,  name: 'Sistema Endocrino (Hormonal)',                 icon: '🧬' },
  { id: 5,  name: 'Función Digestiva y Microbiota',               icon: '🦠' },
  { id: 6,  name: 'Sistema Inmune e Inflamación',                 icon: '🛡️' },
  { id: 7,  name: 'Salud Neurológica y Cognitiva',                icon: '🧠' },
  { id: 8,  name: 'Salud Dental y Estomatognática',               icon: '🦷' },
  { id: 9,  name: 'Salud Visual y Retinografía',                  icon: '👁️' },
  { id: 10, name: 'Salud Dermatológica e Integumentaria',         icon: '🧴' },
  { id: 11, name: 'Sistemas Renal, Respiratorio y Osteomuscular', icon: '🫁' },
  { id: 12, name: 'Desintoxicación y Estrés Oxidativo',           icon: '🔬' },
  { id: 13, name: 'Protocolo Maestro de Intervención',            icon: '📌' },
  { id: 14, name: 'Anexos y Glosario',                            icon: '📎' },
];

interface Biomarker {
  name: string;
  value: string;
  unit: string;
  referenceRange?: string;
  flag: 'Normal' | 'Alto' | 'Bajo';
  system: string;
}

export default function PatientProfile({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ full_name: '', birth_date: '', gender: 'male', status: '' });

  // AI state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ biomarkers: Biomarker[], summary: string } | null>(null);

  // Studies history
  const [studies, setStudies] = useState<Study[]>([]);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Árbol sistémico
  const [expandedSystem, setExpandedSystem] = useState<number | null>(null);

  // Progress indicators
  const [interviewPct, setInterviewPct] = useState(0);
  const [reportPct, setReportPct] = useState(0);

  // Upload state — per-file progress
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'reading' | 'analyzing' | 'saving' | 'done' | 'error'; msg?: string }[]>([]);

  // Undo merge state
  type MergeSnapshot = { target: any; sources: any[]; secondsLeft: number };
  const [mergeUndo, setMergeUndo] = useState<MergeSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown for undo
  useEffect(() => {
    if (!mergeUndo) return;
    undoTimerRef.current = setInterval(() => {
      setMergeUndo(prev => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) { clearInterval(undoTimerRef.current!); return null; }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(undoTimerRef.current!);
  }, [mergeUndo?.target?.id]); // reset only when a new merge happens

  useEffect(() => { loadPatient(); loadStudies(); loadProgress(); }, [id]);

  const loadPatient = async () => {
    const data = await getPatientById(id);
    if (!data) { router.push('/'); return; }
    setPatient(data);
    setEditFormData({ full_name: data.full_name, birth_date: data.birth_date, gender: data.gender, status: data.status });
    setLoading(false);
  };

  const loadStudies = async () => {
    const data = await getStudiesWithBiomarkers(id);
    setStudies(data);
    if (data.length > 0 && !activeStudyId) {
      setActiveStudyId(data[0].id);
      setAnalysisResult({ biomarkers: data[0].biomarkers as Biomarker[] ?? [], summary: data[0].summary });
    }
  };

  const loadProgress = async () => {
    const [answers, reportMods] = await Promise.all([
      getInterviewAnswers(id),
      getReportModules(id),
    ]);
    const answered = Object.keys(answers).length;
    setInterviewPct(Math.min(100, Math.round((answered / TOTAL_QUESTIONS) * 100)));
    const approved = reportMods.filter(m => m.status === 'approved').length;
    const generated = reportMods.length;
    setReportPct(Math.round(((approved * 2 + (generated - approved)) / 10) * 100));
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: updated, error } = await updatePatient(id, editFormData);
    if (updated) { setPatient(updated); setIsEditModalOpen(false); }
    else alert('Error al actualizar: ' + error);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';

    setUploadQueue(files.map(f => ({ name: f.name, status: 'reading' as const })));
    setIsAnalyzing(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const update = (status: 'reading' | 'analyzing' | 'saving' | 'done' | 'error', msg?: string) =>
        setUploadQueue(q => q.map((item, idx) => idx === i ? { ...item, status, msg } : item));

      try {
        update('reading');
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve((r.result as string).split(',')[1]);
          r.onerror = reject;
          r.readAsDataURL(file);
        });

        update('analyzing');
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: file.type })
        });
        const aiData = await res.json();
        if (!res.ok) { update('error', aiData.error); continue; }

        update('saving');
        // Always create a separate study — user can manually merge afterwards
        const study = await createStudy(id, file.name, aiData.summary);
        if (study) {
          await createBiomarkers(study.id, aiData.biomarkers);
          update('done');
        }
        setAnalysisResult(aiData);
      } catch (err: any) {
        update('error', err.message ?? 'Error desconocido');
      }
    }

    await loadStudies();
    setIsAnalyzing(false);
    setTimeout(() => setUploadQueue([]), 4000);
  };


  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) { years--; months += 12; }
    if (today.getDate() < birth.getDate()) { months--; if (months < 0) months = 11; }
    return `${years} años, ${months} meses`;
  };

  const getBiomarkersForSystem = (systemName: string) =>
    analysisResult?.biomarkers.filter(b => b.system === systemName) ?? [];

  const getSystemStatus = (systemName: string) => {
    const bms = getBiomarkersForSystem(systemName);
    if (bms.length === 0) return 'empty';
    if (bms.some(b => b.flag !== 'Normal')) return 'alert';
    return 'ok';
  };

  // Group biomarkers by system for the global view
  const biomarkersBySystem = analysisResult?.biomarkers.reduce((acc, b) => {
    if (!acc[b.system]) acc[b.system] = [];
    acc[b.system].push(b);
    return acc;
  }, {} as Record<string, Biomarker[]>) ?? {};

  const alteredCount = analysisResult?.biomarkers.filter(b => b.flag !== 'Normal').length ?? 0;

  if (loading || !patient) {
    return <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><p>Cargando expediente...</p></div>;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-main)' }}>

      {/* ── Edit Modal ── */}
      {isEditModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={styles.sectionTitle}>Editar Paciente</h2>
              <button onClick={() => setIsEditModalOpen(false)} style={styles.iconBtn}><X size={22} /></button>
            </div>
            <form onSubmit={handleUpdatePatient}>
              <div style={styles.formGroup}><label style={styles.label}>Nombre Completo</label>
                <input type="text" style={styles.input} value={editFormData.full_name} onChange={e => setEditFormData({...editFormData, full_name: e.target.value})} required /></div>
              <div style={styles.formGroup}><label style={styles.label}>Fecha de Nacimiento</label>
                <input type="date" style={styles.input} value={editFormData.birth_date} onChange={e => setEditFormData({...editFormData, birth_date: e.target.value})} required /></div>
              <div style={styles.formGroup}><label style={styles.label}>Género</label>
                <select style={styles.input} value={editFormData.gender} onChange={e => setEditFormData({...editFormData, gender: e.target.value})}>
                  <option value="male">Masculino</option>
                  <option value="female">Femenino</option>
                  <option value="other">Otro</option>
                </select></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ padding: '12px 32px' }}>Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 48px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={() => router.push('/')} style={styles.iconBtn}><ArrowLeft size={24} /></button>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-strong)' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '26px', margin: 0, color: 'var(--text-primary)' }}>{patient.full_name}</h1>
              <button onClick={() => setIsEditModalOpen(true)} style={{ ...styles.iconBtn, color: 'var(--gold-primary)' }}><Edit2 size={16} /></button>
            </div>
            <p style={{ color: 'var(--gold-primary)', fontSize: '13px', marginTop: '4px', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'var(--font-main)' }}>
              {patient.gender === 'male' ? 'Hombre' : patient.gender === 'female' ? 'Mujer' : 'Otro'} · {calculateAge(patient.birth_date)} · {patient.status}
            </p>
          </div>
        </div>
        {analysisResult && (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={styles.statChip}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gold-primary)' }}>{analysisResult.biomarkers.length}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Marcadores</span>
            </div>
            <div style={styles.statChip}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: alteredCount > 0 ? '#ef4444' : '#22c55e' }}>{alteredCount}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Alterados</span>
            </div>
            <div style={styles.statChip}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>{studies.length}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Estudios</span>
            </div>
          </div>
        )}
        {/* Entrevista button — premium progress */}
        <button
          onClick={() => router.push(`/pacientes/${id}/entrevista`)}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(212,175,55,0.5)', background: 'rgba(212,175,55,0.06)', color: 'var(--gold-primary)', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '190px', transition: 'background 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.75, lineHeight: 1.3 }}>📋 Entrevista<br/>Clínica</span>
            <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>{interviewPct}<span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>%</span></span>
          </div>
          <div style={{ height: '3px', borderRadius: '99px', background: 'rgba(212,175,55,0.15)', overflow: 'hidden', width: '100%' }}>
            <div style={{ height: '100%', width: `${interviewPct}%`, background: 'linear-gradient(90deg, rgba(212,175,55,0.7), var(--gold-primary))', borderRadius: '99px', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
          </div>
        </button>

        {/* Reporte button — premium progress */}
        <button
          onClick={() => router.push(`/pacientes/${id}/reporte`)}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px', padding: '12px 20px', borderRadius: '12px', border: 'none', background: 'var(--gold-primary)', color: '#1a1a18', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '190px', transition: 'opacity 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.65, lineHeight: 1.3 }}>📄 Reporte<br/>Maestro</span>
            <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>{reportPct}<span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.6 }}>%</span></span>
          </div>
          <div style={{ height: '3px', borderRadius: '99px', background: 'rgba(0,0,0,0.18)', overflow: 'hidden', width: '100%' }}>
            <div style={{ height: '100%', width: `${reportPct}%`, background: 'rgba(0,0,0,0.45)', borderRadius: '99px', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
          </div>
        </button>
      </header>

      {/* ── Main Grid — dual scroll ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '0', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT: scrollable independently ── */}
        <div style={{ overflowY: 'auto', padding: '28px 24px 28px 48px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Upload section */}
          <section style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <BrainCircuit color="var(--gold-primary)" size={22} />
              <h2 style={styles.sectionTitle}>Análisis Clínico con IA</h2>
            </div>

            {studies.length > 0 && (() => {
              // Group by DATE PREFIX in filename (e.g. "2026-04-27" from "2026-04-27a.pdf")
              // This correctly detects same-lab-date studies regardless of upload date
              const datePrefix = (fileName: string) => {
                const match = fileName?.match(/(\d{4}-\d{2}-\d{2})/);
                return match ? match[1] : null;
              };
              const byFileName: Record<string, typeof studies> = {};
              studies.forEach(s => {
                const prefix = datePrefix(s.file_name ?? '') ?? `uid-${s.id}`;
                if (!byFileName[prefix]) byFileName[prefix] = [];
                byFileName[prefix].push(s);
              });
              const mergeableDates = Object.entries(byFileName).filter(([key, arr]) => arr.length > 1 && !key.startsWith('uid-'));

              const handleMerge = async (group: typeof studies) => {
                const dateStr = datePrefix(group[0].file_name ?? '') ?? 'esta fecha';
                if (!confirm(`¿Fusionar ${group.length} estudios del ${dateStr}?\n\nLos biomarcadores se unirán en el primero y los demás se eliminarán.\n\n⚠️ Tendrás 60 segundos para deshacer.`)) return;

                // --- Snapshot BEFORE merge (for undo) ---
                const [target, ...sources] = group;
                const snapshot: MergeSnapshot = {
                  target: { ...target, biomarkers: [...(target.biomarkers ?? [])] },
                  sources: sources.map(s => ({ ...s, biomarkers: [...(s.biomarkers ?? [])] })),
                  secondsLeft: 60,
                };

                // --- Perform merge ---
                for (const src of sources) {
                  await createBiomarkers(target.id, src.biomarkers as any ?? []);
                  await deleteStudy(src.id);
                }
                await loadStudies();

                // --- Arm undo ---
                clearInterval(undoTimerRef.current!);
                setMergeUndo(snapshot);
              };

              const handleUndoMerge = async () => {
                if (!mergeUndo) return;
                clearInterval(undoTimerRef.current!);
                setMergeUndo(null);
                // 1. Wipe target biomarkers back to original
                await deleteBiomarkersForStudy(mergeUndo.target.id);
                await createBiomarkers(mergeUndo.target.id, mergeUndo.target.biomarkers);
                // 2. Recreate each source study with its original biomarkers
                for (const src of mergeUndo.sources) {
                  const newStudy = await createStudy(id, src.file_name, src.summary);
                  if (newStudy) await createBiomarkers(newStudy.id, src.biomarkers);
                }
                await loadStudies();
              };

              return (
                <>
                  {/* Undo banner */}
                  {mergeUndo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: '10px' }}>
                      <RotateCcw size={14} color="#ef4444" />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>Estudios fusionados. ¿Deshacer?</span>
                      <span style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444', minWidth: '28px', textAlign: 'center', lineHeight: 1 }}>{mergeUndo.secondsLeft}<span style={{ fontSize: '10px', fontWeight: 400 }}>s</span></span>
                      <button onClick={handleUndoMerge} style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <RotateCcw size={12} /> Deshacer
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {studies.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '20px', border: `1px solid ${activeStudyId === s.id ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: activeStudyId === s.id ? 'rgba(212,175,55,0.1)' : 'transparent', overflow: 'hidden' }}>
                        <button onClick={() => { setActiveStudyId(s.id); setAnalysisResult({ biomarkers: s.biomarkers as Biomarker[] ?? [], summary: s.summary }); }} style={{ padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: activeStudyId === s.id ? 'var(--gold-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-main)' }}>
                          {new Date(s.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'2-digit' })}
                          {' · '}{s.file_name?.split('.')[0]?.slice(0,18)}
                        </button>
                        <button onClick={async () => {
                          if (!confirm('¿Eliminar este estudio? Esta acción no se puede deshacer.')) return;
                          await deleteStudy(s.id);
                          if (activeStudyId === s.id) { setAnalysisResult(null); setActiveStudyId(null); }
                          await loadStudies();
                        }} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1 }} title="Eliminar estudio">×</button>
                      </div>
                    ))}
                  </div>
                  {mergeableDates.map(([date, group]) => (
                    <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#3b82f6' }}>🔗 {group.length} estudios del {date} pueden fusionarse</span>
                      <button onClick={() => handleMerge(group)} style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)' }}>Fusionar</button>
                    </div>
                  ))}
                </>
              );
            })()}

            {analysisResult ? (
              <div>
                <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', marginBottom: '16px', borderLeft: '3px solid var(--gold-primary)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.7, margin: 0 }}>{analysisResult.summary}</p>
                </div>
                {/* Upload progress queue */}
                {uploadQueue.length > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {uploadQueue.map((item, i) => {
                      const icons: Record<string, string> = { reading: '📂', analyzing: '🧠', saving: '💾', done: '✅', error: '❌' };
                      const colors: Record<string, string> = { reading: 'var(--text-muted)', analyzing: 'var(--gold-primary)', saving: '#3b82f6', done: '#22c55e', error: '#ef4444' };
                      const labels: Record<string, string> = { reading: 'Leyendo archivo...', analyzing: 'Analizando con IA...', saving: 'Guardando...', done: item.msg ?? 'Listo', error: item.msg ?? 'Error' };
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-main)', border: `1px solid ${colors[item.status]}30` }}>
                          <span style={{ fontSize: '14px' }}>{icons[item.status]}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                            <p style={{ margin: 0, fontSize: '10px', color: colors[item.status] }}>{labels[item.status]}</p>
                          </div>
                          {(item.status === 'reading' || item.status === 'analyzing' || item.status === 'saving') && (
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', borderTop: '2px solid transparent', borderRight: `2px solid ${colors[item.status]}`, borderBottom: `2px solid ${colors[item.status]}`, borderLeft: `2px solid ${colors[item.status]}`, animation: 'spin 0.8s linear infinite' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <label style={{ cursor: 'pointer' }}>
                  <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} onChange={handleFileUpload} disabled={isAnalyzing} />
                  <span className="btn-secondary" style={{ fontSize: '12px', padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <UploadCloud size={14} /> Agregar estudio(s)
                  </span>
                </label>
              </div>
            ) : (
              <label style={{ ...styles.dropzone, opacity: isAnalyzing ? 0.7 : 1, cursor: isAnalyzing ? 'not-allowed' : 'pointer' }}>
                <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} onChange={handleFileUpload} disabled={isAnalyzing} />
                {isAnalyzing ? (
                  <>
                    <Activity size={40} color="var(--gold-primary)" style={{ marginBottom: '12px' }} />
                    <p style={{ color: 'var(--gold-primary)', fontFamily: 'var(--font-main)', fontWeight: 600 }}>Procesando archivos...</p>
                    {uploadQueue.length > 0 && (
                      <div style={{ marginTop: '12px', width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {uploadQueue.map((item, i) => {
                          const labels: Record<string, string> = { reading: '📂 Leyendo...', analyzing: '🧠 IA analizando...', saving: '💾 Guardando...', done: '✅ Listo', error: '❌ Error' };
                          return <p key={i} style={{ margin: 0, fontSize: '11px', color: item.status === 'done' ? '#22c55e' : item.status === 'error' ? '#ef4444' : 'var(--text-muted)', textAlign: 'center' }}>{labels[item.status]} {item.name}</p>;
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <UploadCloud size={40} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-main)' }}>Haz clic para subir laboratorios</p>
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-main)', fontSize: '12px', marginTop: '4px' }}>PDF o imagen · Puedes seleccionar varios archivos</p>
                  </>
                )}
              </label>
            )}
          </section>

          {/* Global Biomarker Cards — grouped by system */}
          {analysisResult && Object.entries(biomarkersBySystem).map(([system, bms]) => (
            <section key={system} style={styles.card}>
              <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', margin: '0 0 16px 0' }}>
                {MASTER_INDEX.find(s => s.name === system)?.icon} {system}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {bms.map((b, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: '8px',
                    border: `1px solid ${b.flag !== 'Normal' ? 'rgba(239,68,68,0.4)' : 'var(--border-subtle)'}`,
                    background: b.flag !== 'Normal' ? 'rgba(239,68,68,0.05)' : 'var(--bg-main)'
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '13px', color: b.flag !== 'Normal' ? '#ef4444' : 'var(--text-primary)', fontWeight: 500 }}>{b.name}</p>
                      {b.referenceRange && <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Ref: {b.referenceRange} {b.unit}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: b.flag !== 'Normal' ? '#ef4444' : 'var(--text-primary)' }}>
                        {b.value} <span style={{ fontSize: '11px', fontWeight: 400 }}>{b.unit}</span>
                      </p>
                      {b.flag !== 'Normal' && (
                        <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: '4px' }}>{b.flag}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── RIGHT: Árbol Sistémico — scrollable independently ── */}
        <div style={{ overflowY: 'auto', padding: '28px 48px 28px 0', borderLeft: '1px solid var(--border-subtle)' }}>
          <section style={{ ...styles.card, position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <Activity color="var(--gold-primary)" size={22} />
              <h2 style={styles.sectionTitle}>Árbol Sistémico PDI</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {MASTER_INDEX.map((sys) => {
                const bms = getBiomarkersForSystem(sys.name);
                const status = getSystemStatus(sys.name);
                const isOpen = expandedSystem === sys.id;
                const hasAlert = status === 'alert';
                const hasData  = status !== 'empty';

                return (
                  <div key={sys.id} style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${hasAlert ? 'rgba(239,68,68,0.35)' : hasData ? 'rgba(212,175,55,0.3)' : 'var(--border-subtle)'}` }}>
                    <button
                      onClick={() => setExpandedSystem(isOpen ? null : sys.id)}
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: hasAlert ? 'rgba(239,68,68,0.06)' : hasData ? 'rgba(212,175,55,0.04)' : 'var(--bg-main)',
                        border: 'none', cursor: 'pointer', fontFamily: 'var(--font-main)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '16px' }}>{sys.icon}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: hasAlert ? '#ef4444' : hasData ? 'var(--text-primary)' : 'var(--text-muted)', textAlign: 'left' }}>{sys.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {bms.length > 0 && (
                          <span style={{ fontSize: '10px', background: hasAlert ? 'rgba(239,68,68,0.15)' : 'rgba(212,175,55,0.15)', color: hasAlert ? '#ef4444' : 'var(--gold-primary)', padding: '2px 7px', borderRadius: '10px' }}>
                            {bms.length}
                          </span>
                        )}
                        {hasData ? (isOpen ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />) : null}
                      </div>
                    </button>

                    {isOpen && bms.length > 0 && (
                      <div style={{ padding: '4px 14px 12px', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {bms.map((b, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '6px', background: b.flag !== 'Normal' ? 'rgba(239,68,68,0.06)' : 'var(--bg-surface)', border: `1px solid ${b.flag !== 'Normal' ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)'}` }}>
                            <span style={{ fontSize: '11px', color: b.flag !== 'Normal' ? '#ef4444' : 'var(--text-secondary)' }}>{b.name}</span>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: b.flag !== 'Normal' ? '#ef4444' : 'var(--text-primary)', fontWeight: 600 }}>{b.value} {b.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isOpen && bms.length === 0 && (
                      <div style={{ padding: '8px 14px 12px', background: 'var(--bg-main)' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Sin datos en este estudio</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: 'var(--bg-surface)',
    borderRadius: '12px',
    border: '1px solid var(--border-subtle)',
    padding: '28px',
  },
  sectionTitle: {
    fontSize: '18px',
    margin: 0,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-main)',
  },
  dropzone: {
    border: '2px dashed var(--border-strong)',
    borderRadius: '10px',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.02)',
    transition: 'all 0.2s',
  },
  statChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '12px 20px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  formGroup: { marginBottom: '20px' },
  label: { display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-main)' },
  input: {
    width: '100%', padding: '12px 16px', borderRadius: '8px',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-main)',
    color: 'var(--text-primary)', fontFamily: 'var(--font-main)',
    fontSize: '14px', boxSizing: 'border-box',
  },
  cancelBtn: { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '12px 24px', fontFamily: 'var(--font-main)' },
  modalOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface)', borderRadius: '16px',
    border: '1px solid var(--border-subtle)', padding: '40px',
    width: '100%', maxWidth: '480px',
  },
};
