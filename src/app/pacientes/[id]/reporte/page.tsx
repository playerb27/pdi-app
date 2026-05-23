'use client';
import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, CheckCircle2, Clock, Loader2,
  ChevronDown, ChevronUp, Printer, RotateCcw, Save, Trash2
} from 'lucide-react';
import {
  getPatientById, getStudiesWithBiomarkers, getInterviewAnswers,
  getReportModules, upsertReportModule, deleteReportModules,
  Patient, Study, ReportModule, getComparativeGroups, removeComparativeGroup, clearComparativeGroups, type ComparativeGroup
} from '@/lib/api';
import Module2Renderer from '@/components/Module2Renderer';
import Module2Editor from '@/components/Module2Editor';
import { generatePrintHTML, svgForSeries, buildSeriesForPrint } from '@/lib/generatePrintHTML';
import ExpandedChartModal, { type ChartSeries } from '@/components/ExpandedChartModal';
import { FullWidthChart } from '@/components/ComparativeModal';
import { normalizeBiomarkerName } from '@/lib/biomarkers';


// ─── SVG → PNG conversion (browser-only) ─────────────────────────────────────
function svgToPngBase64(svgString: string, width = 700, height = 240): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(''); return; }
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, width, height);
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png').split(',')[1] ?? '');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

// ─── Module definitions ───────────────────────────────────────────────────────
const MODULE_DEFS = [
  { num: 1, icon: '👤', title: 'Perfil Integral del Paciente', desc: 'Datos generales, antecedentes, medicamentos y perfil de riesgo familiar.', color: '#3b82f6', isComparative: false },
  { num: 2, icon: '🔬', title: 'Análisis de Laboratorio por Sistemas', desc: 'Interpretación clínica de todos los biomarcadores agrupados por sistema.', color: '#8b5cf6', isComparative: false },
  { num: 3, icon: '🩺', title: 'Evaluación Clínica Sistémica', desc: 'Correlación entre síntomas (entrevista) y hallazgos de laboratorio.', color: '#06b6d4', isComparative: false },
  { num: 4, icon: '🧠', title: 'Diagnósticos Posibles y Correlaciones', desc: 'Diagnóstico diferencial, patrones multisistémicos y factores de riesgo.', color: '#f59e0b', isComparative: false },
  { num: 5, icon: '📌', title: 'Plan de Intervención Integral', desc: 'Tratamiento, suplementación, estilo de vida, estudios adicionales y seguimiento.', color: '#22c55e', isComparative: false },
  { num: 6, icon: '📊', title: 'Gráficas Comparativas', desc: 'Gráficas de evolución comparativas seleccionadas desde el perfil del paciente.', color: '#d4af37', isComparative: true },
];

// ─── Simple Markdown renderer ─────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;margin:24px 0 10px;color:var(--text-primary)">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:var(--gold-primary)">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, s => `<ul style="padding-left:20px;margin:8px 0">${s}</ul>`)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/🔴/g, '<span style="color:#ef4444">🔴</span>')
    .replace(/🟡/g, '<span style="color:#f59e0b">🟡</span>')
    .replace(/🟢/g, '<span style="color:#22c55e">🟢</span>');
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [biomarkers, setBiomarkers] = useState<any[]>([]); // latest study
  const [allStudies, setAllStudies] = useState<any[]>([]); // full history
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({});
  const [modules, setModules] = useState<Record<number, ReportModule>>({});
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<Record<number, boolean>>({});
  const [editContent, setEditContent] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [expandedChart6, setExpandedChart6] = useState<ChartSeries | null>(null);
  const [m6Groups, setM6Groups] = useState<ComparativeGroup[]>([]);

  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const handleResetReport = async () => {
    try {
      await deleteReportModules(id);
      await loadAll();
      setExpanded(null);
      setShowResetModal(false);
      setConfirmChecked(false);
      alert('Se ha restablecido el reporte maestro correctamente de forma definitiva.');
    } catch (e: any) {
      alert('Error al restablecer el reporte: ' + e.message);
    }
  };

  // Load comparative groups from Supabase when patient ID is known
  useEffect(() => {
    if (!id) return;
    getComparativeGroups(id).then(groups => setM6Groups(groups));
  }, [id]);

  // Build a ChartSeries from allStudies for a given canonical marker name,
  // then apply any localStorage overrides so manually-edited values always show.
  // Build a ChartSeries from allStudies for a given canonical marker name.
  const buildSeriesForMarker = (markerName: string): ChartSeries | null => {
    const rawPoints: { date: string; value: number; flag: string; biomarkerId: string; studyId: string; isEdited?: boolean }[] = [];
    const getStudyDate = (s: any) => { const fd = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null; return s.exam_date ?? (fd ? fd + 'T12:00:00' : s.created_at); };
    const sorted = [...allStudies].sort((a, b) => new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime());
    let unit = '', refRange = '';
    for (const study of sorted) {
      for (const bm of (study.biomarkers ?? [])) {
        const num = parseFloat(bm.value); if (isNaN(num)) continue;
        if (normalizeBiomarkerName(bm.name) !== markerName) continue;
        if (!unit) unit = bm.unit ?? '';
        if (!refRange) refRange = (bm as any).referenceRange ?? (bm as any).reference_range ?? '';
        rawPoints.push({ date: getStudyDate(study), value: num, flag: bm.flag, biomarkerId: bm.id, studyId: study.id, isEdited: (bm as any).is_edited ?? false });
      }
    }
    if (!rawPoints.length) return null;

    // ── Median-dedup per day ────────────────
    const allVals = rawPoints.map(p => p.value).sort((a, b) => a - b);
    const median = allVals[Math.floor(allVals.length / 2)];
    const byDay = new Map<string, typeof rawPoints[0]>();
    for (const pt of rawPoints) {
      const key = pt.date.slice(0, 10);
      const existing = byDay.get(key);
      if (!existing) { byDay.set(key, pt); }
      else if (pt.isEdited && !existing.isEdited) { byDay.set(key, pt); }
      else if (!pt.isEdited && existing.isEdited) { /* keep existing */ }
      else if (Math.abs(pt.value - median) < Math.abs(existing.value - median)) { byDay.set(key, pt); }
    }
    const patched = [...byDay.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { name: markerName, unit, referenceRange: refRange, points: patched };
  };

  useEffect(() => { loadAll(); }, [id]);

  const autoBuildCanonical = async () => {
    try {
      await fetch('/api/build-canonical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: id }),
      });
    } catch (err) {
      console.error('Error auto-building canonical:', err);
    }
  };

  const loadAll = async () => {
    const [pat, studies, interview, savedModules] = await Promise.all([
      getPatientById(id),
      getStudiesWithBiomarkers(id),
      getInterviewAnswers(id),
      getReportModules(id),
    ]);
    if (pat) setPatient(pat);
    // Keep all studies for longitudinal analysis
    setAllStudies(studies);
    // Latest study for quick access (chronological sorting fallback)
    if (studies.length > 0) {
      const getStudyDate = (s: any) => {
        const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        const raw = (s as any).exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
      };
      const sortedStudies = [...studies].sort((a, b) => new Date(getStudyDate(b)).getTime() - new Date(getStudyDate(a)).getTime());
      setBiomarkers((sortedStudies[0] as any).biomarkers ?? []);
    }
    setInterviewAnswers(interview);
    const moduleMap: Record<number, ReportModule> = {};
    savedModules.forEach(m => { moduleMap[m.module_num] = m; });
    setModules(moduleMap);
  };

  const approvedModules = useCallback((): Record<number, string> => {
    const result: Record<number, string> = {};
    Object.entries(modules).forEach(([k, v]) => {
      if (v.status === 'approved') result[Number(k)] = v.content;
    });
    return result;
  }, [modules]);

  const generateModule = async (num: number) => {
    if (!patient) return;
    setGenerating(prev => ({ ...prev, [num]: true }));
    setExpanded(num);
    try {
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleNum: num,
          patient,
          biomarkers,
          allStudies: allStudies.map(s => {
            // Use the real clinical exam date (not the upload timestamp)
            const fileDate = (s as any).file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
            const clinicalDate = (s as any).exam_date?.slice(0, 10)
              ?? fileDate
              ?? (s as any).created_at?.slice(0, 10)
              ?? '';
            return {
              date: clinicalDate,
              name: (s as any).file_name ?? (s as any).name ?? 'Estudio',
              biomarkers: (s as any).biomarkers ?? [],
            };
          }),
          interviewAnswers,
          approvedModules: approvedModules(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const def = MODULE_DEFS.find(d => d.num === num)!;
      await upsertReportModule(id, num, def.title, data.content, 'pending');
      await loadAll();
    } catch (e: any) {
      alert('Error generando módulo: ' + e.message);
    } finally {
      setGenerating(prev => ({ ...prev, [num]: false }));
    }
  };

  const approveModule = async (num: number) => {
    const mod = modules[num];
    if (!mod) return;
    // Only use in-memory editContent if the user is actively in edit mode.
    // Otherwise use the persisted content from DB to avoid approving stale drafts.
    const content = editMode[num] ? (editContent[num] ?? mod.content) : mod.content;
    await upsertReportModule(id, num, mod.title, content, 'approved');
    setEditMode(prev => ({ ...prev, [num]: false }));
    await loadAll();
  };

  const saveEdit = async (num: number) => {
    const mod = modules[num];
    if (!mod) return;
    setSaving(prev => ({ ...prev, [num]: true }));
    await upsertReportModule(id, num, mod.title, editContent[num] ?? mod.content, mod.status);
    setSaving(prev => ({ ...prev, [num]: false }));
    await loadAll();
  };

  const resetModule = async (num: number) => {
    if (!confirm('¿Regenerar este módulo? Se perderá el contenido actual.')) return;
    await generateModule(num);
  };

  const printReport = () => {
    if (!patient) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permite ventanas emergentes para generar el PDF.'); return; }
    const html = generatePrintHTML(patient, modules, new Date(), m6Groups, allStudies, biomarkers);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.addEventListener('load', () => setTimeout(() => win.print(), 800));
  };

  const [downloadingWord, setDownloadingWord] = useState(false);
  const downloadWord = async () => {
    if (!patient || downloadingWord) return;
    setDownloadingWord(true);
    try {
      // Pre-render Module 6 charts as PNG images (same SVG as the app & PDF)
      const m6GroupsWithImages = await Promise.all(
        m6Groups.map(async (group) => {
          const chartImages = await Promise.all(
            group.markers.map(async (markerName) => {
              const series = buildSeriesForPrint(markerName, allStudies);
              if (!series) return { marker: markerName, pngBase64: '' };
              const svgStr = svgForSeries(series);
              const pngBase64 = await svgToPngBase64(svgStr);
              return { marker: markerName, pngBase64 };
            })
          );
          return { ...group, chartImages: chartImages.filter(c => c.pngBase64) };
        })
      );

      const res = await fetch('/api/report/word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient,
          modules,
          studies: allStudies,
          biomarkers,
          m6Markers: m6Groups.flatMap(g => g.markers),
          m6Groups: m6GroupsWithImages,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PDI_Reporte_${patient.full_name.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error generando Word:', e);
      alert('Error generando el archivo. Revisa la consola.');
    } finally {
      setDownloadingWord(false);
    }
  };

  const approvedCount = Object.values(modules).filter(m => m.status === 'approved').length;
  // Module 6 (Comparative Charts) is optional — allApproved only needs 1-5
  const allApproved = [1,2,3,4,5].every(n => modules[n]?.status === 'approved');

  if (!patient) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={32} color="var(--gold-primary)" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  );

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-module { page-break-after: always; padding: 40px; }
          .print-module h2 { color: #1a1a18 !important; }
          .print-module h3 { color: #0f6e56 !important; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', fontFamily: 'var(--font-main)' }}>

        {/* ── Header ── */}
        <header className="no-print" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => router.push(`/pacientes/${id}`)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Reporte Maestro PDI</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{patient.full_name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Progress */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {MODULE_DEFS.map(d => {
                const mod = modules[d.num];
                const isApproved = mod?.status === 'approved';
                const hasContent = !!mod?.content;
                return (
                  <div key={d.num} style={{ width: '28px', height: '6px', borderRadius: '3px', background: isApproved ? '#22c55e' : hasContent ? 'var(--gold-primary)' : 'var(--border-subtle)' }} title={`Módulo ${d.num}: ${isApproved ? 'Aprobado' : hasContent ? 'Generado' : 'Pendiente'}`} />
                );
              })}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{approvedCount}/5 aprobados</span>
            <button
              onClick={() => setShowResetModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'transparent',
                color: '#ef4444',
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                fontSize: '13px',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              <Trash2 size={16} /> Restablecer Reporte
            </button>
            <button
              onClick={printReport}
              disabled={!allApproved}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: `1px solid ${allApproved ? 'var(--gold-primary)' : 'transparent'}`, background: allApproved ? 'rgba(212,175,55,0.15)' : 'var(--border-subtle)', color: allApproved ? 'var(--gold-primary)' : 'var(--text-muted)', cursor: allApproved ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-main)', fontSize: '13px', fontWeight: 700, transition: 'all 0.2s' }}
            >
              <Printer size={16} /> Vista Previa PDF
            </button>
            <button
              onClick={downloadWord}
              disabled={!allApproved || downloadingWord}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '8px', border: 'none', background: allApproved ? 'var(--gold-primary)' : 'var(--border-subtle)', color: allApproved ? '#000' : 'var(--text-muted)', cursor: allApproved && !downloadingWord ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-main)', fontSize: '13px', fontWeight: 800, transition: 'all 0.2s' }}
            >
              {downloadingWord
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generando...</>
                : <><FileText size={16} /> Descargar Word</>}
            </button>
          </div>
        </header>

        {/* ── Intro bar ── */}
        <div className="no-print" style={{ background: 'rgba(212,175,55,0.05)', borderBottom: '1px solid rgba(212,175,55,0.15)', padding: '12px 48px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Genera cada módulo → revisa y edita si es necesario → aprueba → cuando los 5 estén aprobados, exporta el PDF final.
            · <strong style={{ color: 'var(--gold-primary)' }}>{biomarkers.length}</strong> biomarcadores cargados
            · <strong style={{ color: 'var(--gold-primary)' }}>{Object.keys(interviewAnswers).length}</strong> respuestas de entrevista
          </p>
        </div>

        {/* ── Modules ── */}
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 48px 64px' }}>
          {MODULE_DEFS.map((def) => {
            const mod = modules[def.num];
            const isGenerating = generating[def.num];
            // Module 6 uses localStorage groups, not Supabase
            const hasContent = def.num === 6 ? m6Groups.length > 0 : !!mod?.content;
            const isApproved = def.num === 6 ? m6Groups.length > 0 : mod?.status === 'approved';
            const isExpanded = expanded === def.num;
            const isEditing = editMode[def.num];
            const canGenerate = def.num <= 3 || def.num === 4
              ? true
              : Object.values(modules).filter(m => m.status === 'approved').length >= 3;

            // For mod 4, warn if not enough approved
            const needsApproval = def.num === 4 && Object.values(modules).filter(m => m.status === 'approved' && m.module_num <= 3).length < 2;
            const needsApproval5 = def.num === 5 && !modules[4]?.status?.includes('approved');

            return (
              <div key={def.num} className="print-module" style={{ marginBottom: '16px', borderRadius: '14px', border: `1px solid ${isApproved ? 'rgba(34,197,94,0.3)' : hasContent ? `rgba(212,175,55,0.25)` : 'var(--border-subtle)'}`, background: isApproved ? 'rgba(34,197,94,0.03)' : 'var(--bg-surface)', overflow: 'hidden', transition: 'all 0.2s' }}>

                {/* Module header */}
                <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', cursor: hasContent ? 'pointer' : 'default' }}
                  onClick={() => hasContent && setExpanded(isExpanded ? null : def.num)}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${def.color}15`, border: `1px solid ${def.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                    {def.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: def.color, background: `${def.color}12`, border: `1px solid ${def.color}25`, padding: '2px 8px', borderRadius: '99px' }}>
                        MÓDULO {def.num}
                      </span>
                      {isApproved && <span style={{ fontSize: '11px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Aprobado</span>}
                      {hasContent && !isApproved && <span style={{ fontSize: '11px', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Pendiente de aprobación</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{def.title}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{def.desc}</p>
                  </div>

                  {/* Actions */}
                  <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    {def.isComparative ? (
                      /* Module 6: no AI generate — only expand chevron */
                      <>
                        {!hasContent && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Agrega gráficas desde el perfil del paciente
                          </span>
                        )}
                        {hasContent && (
                          <button onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : def.num); }}
                            style={{ padding: '7px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.3)', background: 'transparent', color: 'var(--gold-primary)', cursor: 'pointer', display: 'flex' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </>
                    ) : isGenerating ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold-primary)', fontSize: '12px' }}>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Generando con IA...
                      </div>
                    ) : (
                      <>
                        {hasContent && (
                          <button onClick={e => { e.stopPropagation(); resetModule(def.num); }} style={{ padding: '7px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }} title="Regenerar">
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); generateModule(def.num); }}
                          disabled={!!needsApproval || !!needsApproval5}
                          title={needsApproval ? 'Aprueba primero módulos 1-3' : needsApproval5 ? 'Aprueba el módulo 4 primero' : ''}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: needsApproval || needsApproval5 ? 'var(--border-subtle)' : `${def.color}`, color: needsApproval || needsApproval5 ? 'var(--text-muted)' : '#fff', cursor: needsApproval || needsApproval5 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-main)', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <FileText size={13} /> {hasContent ? 'Regenerar' : 'Generar'}
                        </button>
                        {hasContent && !isApproved && (
                          <button onClick={e => { e.stopPropagation(); approveModule(def.num); }}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={13} /> Aprobar
                          </button>
                        )}
                        {hasContent && (
                          <button onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : def.num); }}
                            style={{ padding: '7px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Generating skeleton */}
                {isGenerating && (
                  <div style={{ padding: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                    {[80, 60, 90, 50, 75].map((w, i) => (
                      <div key={i} style={{ height: '12px', borderRadius: '6px', background: 'var(--border-subtle)', width: `${w}%`, marginBottom: '12px', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                )}

                {/* Content area */}
                {hasContent && isExpanded && !isGenerating && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    {def.isComparative ? (
                      /* Module 6: each comparative group as an independent section */
                      (() => {
                        return (
                          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Global clear button */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                                {m6Groups.length} comparativa{m6Groups.length !== 1 ? 's' : ''} · clic en cada gráfica para editar valores
                              </p>
                              <button
                                onClick={async () => { await clearComparativeGroups(id); setM6Groups([]); setExpanded(null); }}
                                style={{ padding: '4px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', fontSize: '11px' }}
                              >
                                Limpiar todo
                              </button>
                            </div>

                            {m6Groups.map((group, gi) => {
                              const builtSeries = group.markers.map(m => buildSeriesForMarker(m)).filter(Boolean) as ChartSeries[];
                              return (
                                <div key={group.id} style={{ border: '1px solid rgba(212,175,55,0.15)', borderRadius: '14px', overflow: 'hidden' }}>
                                  {/* Group header */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'rgba(212,175,55,0.05)', borderBottom: '1px solid rgba(212,175,55,0.1)' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-primary)' }}>
                                      📊 Comparativa {gi + 1}: {group.markers.join(' · ')}
                                    </span>
                                    <button
                                      onClick={async () => {
                                        await removeComparativeGroup(id, group.id);
                                        setM6Groups(prev => prev.filter(g => g.id !== group.id));
                                      }}
                                      style={{ padding: '3px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: '10px' }}
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                  {/* Stacked charts */}
                                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {builtSeries.map(s => (
                                      <FullWidthChart key={s.name} series={s} onClick={() => setExpandedChart6(s)} />
                                    ))}
                                    {builtSeries.length === 0 && (
                                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
                                        Sin datos para los marcadores seleccionados.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        {/* Edit toolbar */}
                        <div className="no-print" style={{ padding: '10px 24px', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <button onClick={() => {
                            setEditMode(prev => ({ ...prev, [def.num]: !isEditing }));
                            if (!isEditing) setEditContent(prev => ({ ...prev, [def.num]: mod.content }));
                          }} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: isEditing ? 'rgba(212,175,55,0.1)' : 'transparent', color: isEditing ? 'var(--gold-primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-main)' }}>
                            {isEditing ? '👁 Ver preview' : '✏️ Editar'}
                          </button>
                          {isEditing && (
                            <button onClick={() => saveEdit(def.num)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {saving[def.num] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Guardar
                            </button>
                          )}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            Última edición: {new Date(mod.updated_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {(() => {
                          const isM2Json = def.num === 2 && mod.content.includes('"systems"');
                          const viewContent = mod.content;
                          const editVal = editContent[def.num] ?? mod.content;
                          if (isEditing && isM2Json) return (<div style={{ background: '#0c0c14' }}><Module2Editor content={editVal} onChange={newJson => setEditContent(prev => ({ ...prev, [def.num]: newJson }))} /></div>);
                          if (isEditing) return (<textarea value={editVal} onChange={e => setEditContent(prev => ({ ...prev, [def.num]: e.target.value }))} style={{ width: '100%', minHeight: '400px', padding: '24px', background: 'var(--bg-main)', color: 'var(--text-primary)', border: 'none', outline: 'none', fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box' }} />);
                          if (isM2Json) return (<div style={{ background: '#0a0a12' }}><Module2Renderer content={viewContent} /></div>);
                          return (<div style={{ padding: '28px 36px', lineHeight: 1.8, color: 'var(--text-secondary)', fontSize: '14px' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(editVal) }} />);
                        })()}
                      </>
                    )}
                  </div>
                )}

              </div>
            );
          })}

          {/* Final CTA */}
          {allApproved && (
            <div style={{ textAlign: 'center', padding: '32px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '14px', marginTop: '8px' }}>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e', margin: '0 0 8px' }}>✅ Todos los módulos aprobados</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>El reporte está listo para ser exportado como PDF profesional.</p>
              <button onClick={printReport} style={{ padding: '14px 40px', borderRadius: '10px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                <Printer size={18} /> Generar PDF Final
              </button>
            </div>
          )}
        </div>
      </div>
      {expandedChart6 && (
        <ExpandedChartModal
          series={expandedChart6}
          patientId={id}
          onClose={() => setExpandedChart6(null)}
          onValueUpdated={async (biomarkerId, newValue, newFlag, studyId) => {
            // Sync allStudies state so all chart re-renders reflect the edit
            setAllStudies(prev => prev.map(s => s.id !== studyId ? s : {
              ...s,
              biomarkers: (s.biomarkers as any[]).map(b =>
                (b as any).id !== biomarkerId ? b : { ...b, value: newValue, flag: newFlag, is_edited: true, original_value: (b as any).original_value ?? b.value }
              ),
            }));
            // Sync biomarkers state (active study biomarkers) so the report generation gets updated data
            setBiomarkers(prev => prev.map(b =>
              (b as any).id !== biomarkerId ? b : { ...b, value: newValue, flag: newFlag, is_edited: true, original_value: (b as any).original_value ?? b.value }
            ));
            // Also update the expanded series itself so chart re-draws immediately
            setExpandedChart6(prev => prev ? {
              ...prev,
              points: prev.points.map(p =>
                p.biomarkerId === biomarkerId && p.studyId === studyId
                  ? { ...p, value: parseFloat(newValue) || p.value, flag: newFlag, isEdited: true }
                  : p
              ),
            } : null);
            // Rebuild canonical table in DB
            await autoBuildCanonical();
          }}
        />
      )}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '32px', width: '480px', maxWidth: '90vw', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--font-main)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
              ⚠️ Restablecer Reporte Maestro
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Esta acción eliminará de forma permanente todos los módulos aprobados y en borrador del Reporte Maestro de este paciente. <strong>La entrevista clínica no se verá afectada.</strong> Esta acción no se puede deshacer.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '24px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={e => setConfirmChecked(e.target.checked)}
                style={{ marginTop: '3px', cursor: 'pointer' }}
              />
              <span>Confirmo que deseo borrar toda la información actual del Reporte Maestro y comenzar de cero.</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px' }}>
              <button
                onClick={handleResetReport}
                disabled={!confirmChecked}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: confirmChecked ? '#ef4444' : 'var(--border-subtle)',
                  color: confirmChecked ? '#fff' : 'var(--text-muted)',
                  cursor: confirmChecked ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-main)',
                  transition: 'background 0.2s'
                }}
              >
                Restablecer Definitivamente
              </button>
              <button
                onClick={() => { setShowResetModal(false); setConfirmChecked(false); }}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-main)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
