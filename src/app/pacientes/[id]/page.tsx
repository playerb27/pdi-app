'use client';
import { useState, useEffect, use, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud, BrainCircuit, Activity, ChevronDown, ChevronRight, Edit2, X, RotateCcw, MessageSquare, Bot, Send, Loader2, GitCompare } from 'lucide-react';
import { getPatientById, updatePatient, createStudy, createBiomarkers, deleteBiomarkersForStudy, getStudiesWithBiomarkers, deleteStudy, updateBiomarker, getInterviewAnswers, getReportModules, saveComparativeMarkers, Patient, Study } from '@/lib/api';
import { TOTAL_QUESTIONS } from '@/lib/questionnaire-data-ext';
import EvolutionCharts from '@/components/EvolutionCharts';
import ComparativeModal from '@/components/ComparativeModal';
import BiomarkerMasterTable from '@/components/BiomarkerMasterTable';
import { normalizeBiomarkerName, studyBiomarkerElementId, chartBiomarkerElementId, tablaBiomarkerElementId } from '@/lib/biomarkers';

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
  id?: string;               // Supabase row id (for editing)
  name: string;
  value: string;
  unit: string;
  referenceRange?: string;   // from AI response
  reference_range?: string;  // from Supabase (snake_case)
  flag: string;
  system: string;
  is_edited?: boolean;       // marked when manually corrected
  original_value?: string;   // preserved original AI value
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

  // Chat Assistant State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'model', text: string, timestamp?: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Smart search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [glowId, setGlowId] = useState<string | null>(null);

  // Fix #3 — Pre-save confirmation modal
  type PendingSave = {
    file: File;
    hash: string;
    aiData: any;
    fileIndex: number;
    update: (status: 'reading' | 'analyzing' | 'saving' | 'done' | 'error', msg?: string) => void;
    resolve: (confirmed: boolean) => void;
  };
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [conflictSelections, setConflictSelections] = useState<Record<string, number>>({});
  const [outlierCorrections, setOutlierCorrections] = useState<Record<string, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [bmFilter, setBmFilter] = useState<'all' | 'altered' | 'edited' | 'suspicious'>('all');
  const [showOnlySuspiciousCharts, setShowOnlySuspiciousCharts] = useState(false);

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 6000);
  };

  // Active tab in left panel
  const [activeTab, setActiveTab] = useState<'estudios' | 'evolucion' | 'tabla' | 'consulta'>('estudios');
  const [isTreeOpen, setIsTreeOpen] = useState(true);

  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparativeModal, setShowComparativeModal] = useState(false);
  const [addedToReport, setAddedToReport] = useState(false);
  // Processed series from EvolutionCharts — updated every time the chart re-renders
  const [readySeriesMap, setReadySeriesMap] = useState<Record<string, { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string; biomarkerId?: string; studyId?: string }[] }>>({});

  const toggleCompareMode = () => {
    setIsCompareMode(prev => !prev);
    setSelectedForCompare(new Set());
    setShowComparativeModal(false);
    setAddedToReport(false);
  };

  const toggleSelectForCompare = (name: string) => {
    setSelectedForCompare(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleAddToReport = async (names: string[]): Promise<boolean> => {
    try {
      saveComparativeMarkers(id, names);
      setAddedToReport(true);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Single source of truth for updating a biomarker value across all views
  const handleBiomarkerUpdated = (biomarkerId: string, newValue: string, newFlag: string, studyId: string) => {
    setStudies(prev => prev.map(s => s.id !== studyId ? s : {
      ...s,
      biomarkers: newFlag === 'Excluido'
        // Biomarker was deleted from Supabase — remove from local state too
        ? (s.biomarkers as any[]).filter(b => (b as any).id !== biomarkerId)
        // Normal edit — update value and flag in place
        : (s.biomarkers as any[]).map(b =>
            (b as any).id !== biomarkerId ? b : { ...b, value: newValue, flag: newFlag, is_edited: true, original_value: (b as any).original_value ?? b.value }
          ),
    }));
  };

  // Biomarker inline edit state
  const [editBm, setEditBm] = useState<{ bm: Biomarker; studyId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editFlag, setEditFlag] = useState('');
  const [isSavingBm, setIsSavingBm] = useState(false);

  const handleSaveBiomarker = async () => {
    if (!editBm?.bm.id) return;
    setIsSavingBm(true);
    const originalValue = editBm.bm.is_edited ? editBm.bm.original_value : editBm.bm.value;
    await updateBiomarker(editBm.bm.id, { value: editValue, flag: editFlag, originalValue });
    // Update local state
    setStudies(prev => prev.map(s => s.id !== editBm.studyId ? s : {
      ...s,
      biomarkers: (s.biomarkers as Biomarker[]).map(b =>
        b.id !== editBm.bm.id ? b : { ...b, value: editValue, flag: editFlag, is_edited: true, original_value: originalValue }
      )
    }));
    if (analysisResult) {
      setAnalysisResult(prev => prev ? {
        ...prev,
        biomarkers: prev.biomarkers.map(b =>
          b.id !== editBm.bm.id ? b : { ...b, value: editValue, flag: editFlag, is_edited: true, original_value: originalValue }
        )
      } : prev);
    }
    setIsSavingBm(false);
    setEditBm(null);
  };

  // Cargar historial guardado al entrar al perfil del paciente
  useEffect(() => {
    if (!id) return;
    try {
      const saved = localStorage.getItem(`pdi_chat_${id}`);
      if (saved) setChatHistory(JSON.parse(saved));
    } catch {}
  }, [id]);

  // Guardar historial cada vez que cambia
  useEffect(() => {
    if (!id || chatHistory.length === 0) return;
    localStorage.setItem(`pdi_chat_${id}`, JSON.stringify(chatHistory));
  }, [chatHistory, id]);

  // Persist active tab across refreshes
  useEffect(() => {
    const key = `pdi_tab_${id}`;
    const saved = localStorage.getItem(key) as typeof activeTab | null;
    if (saved && ['estudios', 'evolucion', 'tabla', 'consulta'].includes(saved)) {
      setActiveTab(saved);
      if (saved === 'tabla') setIsTreeOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    localStorage.setItem(`pdi_tab_${id}`, activeTab);
  }, [activeTab, id]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatOpen]);

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
    if (data.length > 0) {
      // Always show the most recent study in the left panel
      const newest = data[0];
      setActiveStudyId(newest.id);
      setAnalysisResult({ biomarkers: (newest.biomarkers ?? []) as Biomarker[], summary: newest.summary });
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

  // ─── Duplicate detection helpers ─────────────────────────────────────────────
  const sha256 = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const isBiomarkerDuplicate = (
    aiMarkers: { name: string; value: string }[],
    existingStudy: Study
  ): boolean => {
    const existing = (existingStudy.biomarkers ?? []) as { name: string; value: string }[];
    if (existing.length === 0) return false;
    const matches = aiMarkers.filter(bm =>
      existing.some(e => e.name === bm.name && e.value === bm.value)
    );
    return matches.length >= Math.min(5, Math.floor(aiMarkers.length * 0.4));
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

        // ── Layer 1: SHA-256 hash check (exact duplicate) ──────────────────────
        const hash = await sha256(file);
        const hashDuplicate = studies.find(s => (s as any).file_hash === hash);
        if (hashDuplicate) {
          const dateLabel = (hashDuplicate as any).exam_date ?? hashDuplicate.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? hashDuplicate.created_at?.slice(0, 10);
          update('error', `⚠️ Archivo idéntico ya subido (${dateLabel}). Sube una versión diferente.`);
          continue;
        }

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
          body: JSON.stringify({ base64, mimeType: file.type, patientName: patient?.full_name ?? '' })
        });
        const aiData = await res.json();
        if (!res.ok) { update('error', aiData.error); continue; }

        // ── Layer 2: Semantic duplicate (same exam date + similar biomarkers) ──
        const examDate = aiData.exam_date ?? file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        if (examDate) {
          const sameDateStudy = studies.find(s => {
            const sd = (s as any).exam_date ?? s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
            return sd === examDate;
          });
          if (sameDateStudy && isBiomarkerDuplicate(aiData.biomarkers ?? [], sameDateStudy)) {
            const proceed = confirm(
              `⚠️ Posible duplicado detectado\n\nYa existe un estudio del ${examDate} con biomarcadores muy similares.\n\n¿Deseas subirlo de todas formas?`
            );
            if (!proceed) { update('error', 'Cancelado por duplicado detectado'); continue; }
          }
        }

        // ── Fix #3: Show confirmation modal if suspicious values detected ────
        const suspicious = aiData.suspiciousMarkers ?? [];
        if (suspicious.length > 0) {
          update('saving', `⚠️ ${suspicious.length} valor(es) sospechoso(s) — esperando confirmación...`);
          const confirmed = await new Promise<boolean>(resolve => {
            setPendingSave({ file, hash, aiData, fileIndex: i, update, resolve });
          });
          if (!confirmed) {
            update('error', 'Subida cancelada por el usuario — valores no confirmados.');
            continue;
          }
        }

        update('saving');
        const study = await createStudy(id, file.name, aiData.summary, aiData.exam_date ?? undefined);
        if (study) {
          await (async () => {
            const { supabase: sb } = await import('@/lib/supabase');
            await sb.from('studies').update({ file_hash: hash }).eq('id', study.id);
          })();
          await createBiomarkers(study.id, aiData.biomarkers);

          // Show audit result
          const audit = aiData.audit;
          if (audit) {
            const icon = audit.status === 'ok' ? '✅' : audit.status === 'warning' ? '⚠️' : '🔴';
            const label = audit.status === 'ok' ? 'Extracción verificada' : audit.status === 'warning' ? 'Revisar extracción' : 'Errores detectados';
            const issuesText = audit.issues?.length ? ` · ${audit.issues.length} issue(s)` : '';
            update('done', `${icon} ${label} · ${audit.confidence}% confianza${issuesText} · ${audit.summary}`);
          } else {
            update('done');
          }
        }
        setAnalysisResult(aiData);
      } catch (err: any) {
        update('error', err.message ?? 'Error desconocido');
      }
    }

    await loadStudies();
    setIsAnalyzing(false);
    setTimeout(() => setUploadQueue([]), 8000);
  };


  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    const timestamp = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg, timestamp }]);
    setIsChatLoading(true);

    try {
      const interviewAnswers = await getInterviewAnswers(id);
      const res = await fetch('/api/patient/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient, studies, interviewAnswers, chatHistory, message: userMsg })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const ts = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      setChatHistory(prev => [...prev, { role: 'model', text: data.response, timestamp: ts }]);
    } catch (err: any) {
      alert("Error en el asistente: " + err.message);
    } finally {
      setIsChatLoading(false);
    }
  };


  // ─── Smart Biomarker Search ──────────────────────────────────────────────────
  const scrollToMarker = (elementId: string, targetTab: typeof activeTab, studyId?: string) => {
    // Explicitly scroll the left panel container — scrollIntoView picks the wrong ancestor
    const tryScroll = (attemptsLeft: number) => {
      const el = document.getElementById(elementId);
      if (el) {
        const panel = document.getElementById('pdi-left-scroll');
        if (panel) {
          const panelRect = panel.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const scrollTarget = elRect.top - panelRect.top + panel.scrollTop - panel.clientHeight / 2 + el.clientHeight / 2;
          panel.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setGlowId(elementId);
        setTimeout(() => setGlowId(null), 2800);
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryScroll(attemptsLeft - 1), 120);
      }
    };
    setIsSearchOpen(false);
    setSearchQuery('');
    // Switch to the right tab first
    if (activeTab !== targetTab) {
      setActiveTab(targetTab);
      if (targetTab === 'tabla') setIsTreeOpen(false);
      else setIsTreeOpen(true);
      setTimeout(() => tryScroll(5), 350);
      return;
    }
    // If the result belongs to a specific study, activate it first, then scroll after render
    if (studyId && studyId !== activeStudyId) {
      const targetStudy = studies.find(s => s.id === studyId);
      if (targetStudy) {
        setActiveStudyId(studyId);
        setAnalysisResult({ biomarkers: (targetStudy.biomarkers ?? []) as Biomarker[], summary: targetStudy.summary });
      }
      setTimeout(() => tryScroll(5), 350);
    } else {
      setTimeout(() => tryScroll(3), 80);
    }
  };

  const searchResults = (() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results: { id: string; studyId?: string; label: string; sub: string; type: 'study' | 'chart' | 'tabla'; targetTab: typeof activeTab }[] = [];

    if (activeTab === 'estudios') {
      // One result per study that has the matching marker
      studies.forEach(s => {
        const rawDate = (s as any).exam_date ?? null;
        const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        const displayDate = (rawDate ?? fileDate)
          ? new Date((rawDate ?? fileDate) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
          : new Date(s.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        (s.biomarkers ?? []).forEach(bm => {
          if (bm.name.toLowerCase().includes(q)) {
            const elemId = studyBiomarkerElementId(s.id, bm.name);
            results.push({ id: elemId, studyId: s.id, label: bm.name, sub: `📊 Estudio del ${displayDate} · ${bm.value} ${bm.unit}`, type: 'study', targetTab: 'estudios' });
          }
        });
      });
    } else if (activeTab === 'evolucion') {
      // One result per canonical biomarker name (deduplicated)
      const seen = new Set<string>();
      studies.forEach(s => {
        (s.biomarkers ?? []).forEach(bm => {
          const canonical = normalizeBiomarkerName(bm.name);
          if (bm.name.toLowerCase().includes(q) && !seen.has(canonical)) {
            seen.add(canonical);
            results.push({ id: chartBiomarkerElementId(bm.name), label: canonical, sub: `📈 Gráfica de evolución clínica`, type: 'chart', targetTab: 'evolucion' });
          }
        });
      });
    } else if (activeTab === 'tabla') {
      // One result per canonical name (row in the master table)
      const seen = new Set<string>();
      studies.forEach(s => {
        (s.biomarkers ?? []).forEach(bm => {
          const canonical = normalizeBiomarkerName(bm.name);
          if (bm.name.toLowerCase().includes(q) && !seen.has(canonical)) {
            seen.add(canonical);
            results.push({ id: tablaBiomarkerElementId(canonical), label: canonical, sub: `🧬 Fila en Tabla Maestra`, type: 'tabla', targetTab: 'tabla' });
          }
        });
      });
    }

    return results.slice(0, 14);
  })();

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

  // ─── Build series for Comparative Modal ──────────────────────────────────────
  // readySeriesMap is populated by EvolutionCharts via onSeriesReady — same data
  // the sparklines show, with all deduplication and IQR processing already applied.
  const comparativeSeries = [...selectedForCompare]
    .map(name => readySeriesMap[name])
    .filter(Boolean) as { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string; biomarkerId?: string; studyId?: string }[] }[];

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

      {/* ── Biomarker Edit Modal ── */}
      {editBm && (
        <div style={styles.modalOverlay} onClick={() => setEditBm(null)}>
          <div style={{ ...styles.modalContent, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ ...styles.sectionTitle, fontSize: '16px' }}>Editar Biomarcador</h2>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{editBm.bm.name}</p>
              </div>
              <button onClick={() => setEditBm(null)} style={styles.iconBtn}><X size={20} /></button>
            </div>
            {editBm.bm.is_edited && (
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', marginBottom: '16px' }}>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--gold-primary)' }}>
                  ✏️ Valor original de la IA: <strong>{editBm.bm.original_value}</strong>
                </p>
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Valor</label>
              <input type="text" style={styles.input} value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Ej: 5.276" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: 36 }}>Flag</span>
              {(['Normal', 'Alto', 'Bajo'] as const).map(f => (
                <button key={f} onClick={() => setEditFlag(f)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px',
                  border: `1px solid ${editFlag === f ? (f === 'Normal' ? '#22c55e' : '#ef4444') : 'var(--border-subtle)'}`,
                  background: editFlag === f ? (f === 'Normal' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)') : 'transparent',
                  color: editFlag === f ? (f === 'Normal' ? '#22c55e' : '#ef4444') : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
                }}>{f}</button>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 20px' }}>
              Ref: {editBm.bm.reference_range ?? editBm.bm.referenceRange ?? 'N/D'} {editBm.bm.unit}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEditBm(null)} style={styles.cancelBtn}>Cancelar</button>
              <button onClick={handleSaveBiomarker} disabled={isSavingBm || !editBm.bm.id} className="btn-primary" style={{ padding: '10px 24px', opacity: isSavingBm ? 0.7 : 1 }}>
                {isSavingBm ? 'Guardando...' : !editBm.bm.id ? 'Sin ID' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Comparative Modal ── top-level, works from ANY tab ── */}
      {showComparativeModal && selectedForCompare.size > 0 && (
        <ComparativeModal
          series={comparativeSeries}
          onClose={() => setShowComparativeModal(false)}
          onAddToReport={handleAddToReport}
          onValueUpdated={handleBiomarkerUpdated}
        />
      )}

      {/* ── Error Toast ── */}
      {errorToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1e1e1e', border: '1px solid rgba(239,68,68,0.6)', borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxWidth: 480 }}>
          <span style={{ fontSize: 16 }}>🔴</span>
          <span style={{ fontSize: 13, color: '#f87171', fontFamily: 'var(--font-main)', flex: 1 }}>{errorToast}</span>
          <button onClick={() => setErrorToast(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Pre-save Clinical Review Modal ── */}
      {pendingSave && (() => {
        const conflicts: { name: string; candidates: { value: string; unit: string; flag: string; context: string }[]; recommendedIndex: number }[] = pendingSave.aiData.conflicts ?? [];
        const outliers: { name: string; value: string; unit: string; severity: 'warning' | 'critical'; factor: number; description: string }[] = pendingSave.aiData.extremeOutliers ?? [];
        const suspicious: { marker: string; value: string; corrected?: string; reason: string }[] = pendingSave.aiData.suspiciousMarkers ?? [];
        const autoRemoved: string[] = pendingSave.aiData.deduplicationLog ?? [];
        const needsReview = conflicts.length > 0 || outliers.length > 0 || suspicious.length > 0;
        if (!needsReview) { pendingSave.resolve(true); setPendingSave(null); return null; }

        const handleConfirm = (ok: boolean) => {
          if (ok) {
            // Apply conflict selections
            if (conflicts.length > 0) {
              for (const conflict of conflicts) {
                const sel = conflictSelections[conflict.name] ?? conflict.recommendedIndex;
                const chosen = conflict.candidates[sel];
                if (!chosen) continue;
                const bms = pendingSave.aiData.biomarkers as any[];
                const idx = bms.findIndex((b: any) => b.name.toLowerCase() === conflict.name.toLowerCase());
                if (idx !== -1) { bms[idx] = { ...bms[idx], value: chosen.value, unit: chosen.unit, flag: chosen.flag }; }
              }
            }
            // Apply outlier manual corrections
            for (const [markerName, correctedVal] of Object.entries(outlierCorrections)) {
              if (!correctedVal.trim()) continue;
              const bms = pendingSave.aiData.biomarkers as any[];
              const idx = bms.findIndex((b: any) => b.name.toLowerCase() === markerName.toLowerCase());
              if (idx !== -1) { bms[idx] = { ...bms[idx], value: correctedVal.trim(), is_edited: true, original_value: bms[idx].value }; }
            }
          }
          setConflictSelections({});
          setOutlierCorrections({});
          pendingSave.resolve(ok);
          setPendingSave(null);
        };

        return (
          <div style={styles.modalOverlay}>
            <div style={{ ...styles.modalContent, maxWidth: '620px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'var(--font-main)', color: 'var(--text-primary)' }}>🩺 Revisión Clínica Requerida</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--gold-primary)' }}>{pendingSave.file.name}</strong>
                    {conflicts.length > 0 && <span> · {conflicts.length} conflicto(s) a resolver</span>}
                    {outliers.length > 0 && <span> · {outliers.length} valor(es) extremo(s)</span>}
                  </p>
                </div>
                <button onClick={() => handleConfirm(false)} style={styles.iconBtn}><X size={20} /></button>
              </div>

              {/* Conflicts */}
              {conflicts.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f97316' }}>🔀 Marcadores duplicados — ¿cuál es el correcto?</p>
                  {conflicts.map((conflict, ci) => (
                    <div key={ci} style={{ borderRadius: 12, border: '1px solid rgba(249,115,22,0.35)', background: 'rgba(249,115,22,0.04)', padding: '12px 14px', marginBottom: 8 }}>
                      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{conflict.name}</p>
                      {conflict.candidates.map((c, ci2) => {
                        const selected = (conflictSelections[conflict.name] ?? conflict.recommendedIndex) === ci2;
                        return (
                          <label key={ci2} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: selected ? 'rgba(212,175,55,0.08)' : 'var(--bg-main)', transition: 'all 0.15s', marginBottom: 4 }}>
                            <input type="radio" name={`conflict-${ci}`} checked={selected} onChange={() => setConflictSelections(prev => ({ ...prev, [conflict.name]: ci2 }))} style={{ accentColor: 'var(--gold-primary)', width: 14, height: 14 }} />
                            <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: selected ? 'var(--gold-primary)' : 'var(--text-primary)' }}>{c.value} <span style={{ fontSize: 11, fontWeight: 400 }}>{c.unit}</span></span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>{c.context}</span>
                            {c.flag !== 'Normal' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: c.flag === 'Alto' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: c.flag === 'Alto' ? '#f87171' : '#60a5fa' }}>{c.flag}</span>}
                            {ci2 === conflict.recommendedIndex && <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 700 }}>✓ REC</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* Extreme outliers */}
              {outliers.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ef4444' }}>🚨 Valores extremadamente alterados — ¿deseas corregirlo?</p>
                  {outliers.map((o, oi) => {
                    const isCrit = o.severity === 'critical';
                    const corrected = outlierCorrections[o.name] ?? '';
                    return (
                      <div key={oi} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${isCrit ? 'rgba(239,68,68,0.6)' : 'rgba(249,115,22,0.4)'}`, background: isCrit ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.05)', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: isCrit ? '#ef4444' : '#f97316' }}>{o.name}</span>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 800, background: isCrit ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.15)', color: isCrit ? '#ef4444' : '#f97316' }}>{isCrit ? '🔴 CRÍTICO' : '🟠 MUY ALTERADO'}</span>
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: isCrit ? '#ef4444' : '#f97316' }}>{o.value} <span style={{ fontSize: 11, fontWeight: 400 }}>{o.unit}</span></span>
                        </div>
                        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{o.description}</p>
                        {/* Inline correction field */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Corregir a:</span>
                          <input
                            type="text"
                            placeholder={`ej: ${(parseFloat(o.value) / 10).toFixed(2)}`}
                            value={corrected}
                            onChange={e => setOutlierCorrections(prev => ({ ...prev, [o.name]: e.target.value }))}
                            style={{ flex: 1, background: 'var(--bg-main)', border: `1px solid ${corrected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{o.unit}</span>
                          {corrected && (
                            <button onClick={() => setOutlierCorrections(prev => { const n = {...prev}; delete n[o.name]; return n; })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}>✕</button>
                          )}
                        </div>
                        {corrected && <p style={{ margin: '4px 0 0', fontSize: 10, color: '#22c55e' }}>✓ Se guardará como {corrected} {o.unit}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unit conversions */}
              {suspicious.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa' }}>🔧 Conversiones aplicadas</p>
                  {suspicious.map((s, idx) => (
                    <div key={idx} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{s.marker}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f87171', textDecoration: 'line-through', opacity: 0.7 }}>{s.value}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>{s.corrected ?? '?'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-removed */}
              {autoRemoved.length > 0 && (
                <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#60a5fa' }}>🔁 Duplicados eliminados automáticamente:</p>
                  {autoRemoved.map((d, idx) => <p key={idx} style={{ margin: '1px 0', fontSize: 10, color: 'var(--text-muted)' }}>• {d}</p>)}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                <button onClick={() => handleConfirm(false)} style={styles.cancelBtn}>Cancelar subida</button>
                <button
                  onClick={() => handleConfirm(true)}
                  className="btn-primary"
                  style={{ padding: '12px 28px', background: outliers.some(o => o.severity === 'critical') ? '#ef4444' : '#f97316', boxShadow: `0 4px 14px ${outliers.some(o => o.severity === 'critical') ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.35)'}` }}
                >
                  ✓ {conflicts.length > 0 ? 'Confirmar selecciones y guardar' : 'Entendido — guardar estudio'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
            <p style={{ fontSize: '13px', marginTop: '4px', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'var(--font-main)' }}>
              <span style={{ color: 'var(--gold-primary)' }}>
                {patient.gender === 'male' ? 'Hombre' : patient.gender === 'female' ? 'Mujer' : 'Otro'} · {calculateAge(patient.birth_date)}
              </span>
              {' · '}
              <span style={{ color: interviewPct === 100 ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
                {interviewPct === 100 ? '✓ Entrevista completa' : interviewPct > 0 ? `Entrevista ${interviewPct}%` : 'Entrevista pendiente'}
              </span>
            </p>
          </div>
        </div>
        {/* Action Buttons row — Buscar + Comparativa + Entrevista + Reporte */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          {/* Buscar marcador */}
          <button onClick={() => setIsSearchOpen(true)} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '140px', transition: 'background 0.2s, border-color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,175,55,0.07)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; }}
          >
            <span style={{ fontSize: '22px' }}>🔍</span>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.3, textAlign: 'center' }}>Buscar<br/>Marcador</span>
          </button>

          {/* Comparativa button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
            <button
              onClick={toggleCompareMode}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '10px 16px', borderRadius: '12px', border: `1px solid ${isCompareMode ? 'rgba(212,175,55,0.6)' : 'var(--border-subtle)'}`, background: isCompareMode ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)', color: isCompareMode ? 'var(--gold-primary)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-main)', transition: 'all 0.2s', position: 'relative' }}
            >
              <GitCompare size={20} />
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.3, textAlign: 'center' }}>Comparativa</span>
              {selectedForCompare.size > 0 && (
                <span style={{ position: 'absolute', top: '6px', right: '6px', background: 'var(--gold-primary)', color: '#000', fontSize: '10px', fontWeight: 800, borderRadius: '99px', padding: '1px 6px', minWidth: '18px', textAlign: 'center' }}>
                  {selectedForCompare.size}
                </span>
              )}
            </button>
            {isCompareMode && selectedForCompare.size > 0 && (
              <button
                onClick={() => setShowComparativeModal(true)}
                style={{ padding: '7px 12px', borderRadius: '10px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '11px', fontWeight: 800, textAlign: 'center', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(212,175,55,0.35)' }}
              >
                Comparar ({selectedForCompare.size})
              </button>
            )}
          </div>
          <button onClick={() => router.push(`/pacientes/${id}/entrevista`)} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(212,175,55,0.5)', background: 'rgba(212,175,55,0.06)', color: 'var(--gold-primary)', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '190px', transition: 'background 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.75, lineHeight: 1.3 }}>📋 Entrevista<br/>Clínica</span>
              <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>{interviewPct}<span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>%</span></span>
            </div>
            <div style={{ height: '3px', borderRadius: '99px', background: 'rgba(212,175,55,0.15)', overflow: 'hidden', width: '100%' }}>
              <div style={{ height: '100%', width: `${interviewPct}%`, background: 'linear-gradient(90deg, rgba(212,175,55,0.7), var(--gold-primary))', borderRadius: '99px', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
            </div>
          </button>
          <button onClick={() => router.push(`/pacientes/${id}/reporte`)} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px', padding: '12px 20px', borderRadius: '12px', border: 'none', background: 'var(--gold-primary)', color: '#1a1a18', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '190px', transition: 'opacity 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.65, lineHeight: 1.3 }}>📄 Reporte<br/>Maestro</span>
              <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>{reportPct}<span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.6 }}>%</span></span>
            </div>
            <div style={{ height: '3px', borderRadius: '99px', background: 'rgba(0,0,0,0.18)', overflow: 'hidden', width: '100%' }}>
              <div style={{ height: '100%', width: `${reportPct}%`, background: 'rgba(0,0,0,0.45)', borderRadius: '99px', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
            </div>
          </button>
        </div>
      </header>

      {/* ── Smart Search Overlay ── */}
      {isSearchOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'center', paddingTop: '80px' }} onClick={() => setIsSearchOpen(false)}>
          <div style={{ width: '560px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden', height: 'fit-content', maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '18px' }}>🔍</span>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'estudios' ? '📊 Buscar en Estudios...' : activeTab === 'evolucion' ? '📈 Buscar gráfica...' : '🧬 Buscar en Tabla Maestra...'}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '16px', fontFamily: 'var(--font-main)' }}
              />
              <button onClick={() => setIsSearchOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>ESC</button>
            </div>
            {activeTab === 'consulta' && (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <p style={{ color: 'var(--gold-primary)', fontSize: '14px', margin: '0 0 6px' }}>🔍 Búsqueda de marcadores</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>Cambia a <strong style={{ color: 'var(--text-secondary)' }}>Estudios</strong>, <strong style={{ color: 'var(--text-secondary)' }}>Evolución Clínica</strong> o <strong style={{ color: 'var(--text-secondary)' }}>Tabla Maestra</strong> para buscar biomarcadores.</p>
              </div>
            )}
            {activeTab !== 'consulta' && searchResults.length === 0 && searchQuery.length >= 2 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '14px' }}>No se encontró ningún marcador con ese nombre</p>
            )}
            {activeTab !== 'consulta' && searchResults.length === 0 && searchQuery.length < 2 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '13px' }}>Ingresa 2+ caracteres para iniciar la búsqueda</p>
            )}
            <div style={{ overflowY: 'auto', maxHeight: 'calc(70vh - 70px)' }}>
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => scrollToMarker(r.id, r.targetTab, r.studyId)}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 20px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '20px' }}>{r.type === 'study' ? '📊' : r.type === 'chart' ? '📈' : '🧬'}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{r.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Glow CSS */}
      <style>{`
        @keyframes pdi-glow { 0%,100%{box-shadow:0 0 0 rgba(212,175,55,0)} 30%{box-shadow:0 0 0 4px rgba(212,175,55,0.5),0 0 24px rgba(212,175,55,0.3)} }
        .pdi-glow-active { animation: pdi-glow 2.5s ease !important; border-color: rgba(212,175,55,0.8) !important; }
      `}</style>

      {/* ── Main Grid — dual scroll ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isTreeOpen ? '1fr 400px' : '1fr 0px', gap: 0, flex: 1, overflow: 'hidden', transition: 'grid-template-columns 0.35s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* ── LEFT: scrollable independently ── */}
        <div id="pdi-left-scroll" style={{ overflowY: 'auto', padding: '28px 24px 28px 48px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── Tab bar ── */}
          <div style={{ display: 'flex', gap: 4, padding: '4px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
            {([['estudios', '📊 Estudios'], ['evolucion', '📈 Evolución Clínica'], ['tabla', '🧬 Tabla Maestra'], ['consulta', '🤖 Consulta IA']] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'tabla') setIsTreeOpen(false);
                  else if (tab !== 'consulta') setIsTreeOpen(true);
                }}
                style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: activeTab === tab ? 'var(--gold-primary)' : 'transparent', color: activeTab === tab ? '#000' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: 13, fontWeight: 700, transition: 'all 0.2s', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Evolución Clínica tab ── */}
          {activeTab === 'evolucion' && (
            <section style={styles.card}>
              {studies.length > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filtrar gráficas:</span>
                    <button onClick={() => setShowOnlySuspiciousCharts(false)} style={{
                      padding: '5px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700,
                      fontFamily: 'var(--font-main)', cursor: 'pointer', transition: 'all 0.15s',
                      border: `1px solid ${!showOnlySuspiciousCharts ? 'var(--text-secondary)' : 'var(--border-subtle)'}`,
                      background: !showOnlySuspiciousCharts ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: !showOnlySuspiciousCharts ? 'var(--text-secondary)' : 'var(--text-muted)',
                    }}>Todas las gráficas</button>
                    <button onClick={() => setShowOnlySuspiciousCharts(true)} style={{
                      padding: '5px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700,
                      fontFamily: 'var(--font-main)', cursor: 'pointer', transition: 'all 0.15s',
                      border: `1px solid ${showOnlySuspiciousCharts ? '#f97316' : 'var(--border-subtle)'}`,
                      background: showOnlySuspiciousCharts ? 'rgba(249,115,22,0.12)' : 'transparent',
                      color: showOnlySuspiciousCharts ? '#f97316' : 'var(--text-muted)',
                    }}>◇ Solo con valores sospechosos</button>
                  </div>
                  <EvolutionCharts
                    studies={studies}
                    glowId={glowId}
                    compareMode={isCompareMode}
                    selectedForCompare={selectedForCompare}
                    onToggleCompare={toggleSelectForCompare}
                    showOnlySuspicious={showOnlySuspiciousCharts}
                    onSeriesReady={setReadySeriesMap}
                    onBiomarkerUpdated={(studyId, biomarkerId, newValue, newFlag) => {
                      handleBiomarkerUpdated(biomarkerId, newValue, newFlag, studyId);
                    }}
                  />
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '32px' }}>Sube estudios para ver la evolución clínica.</p>
              )}
            </section>
          )}

          {/* ── Tabla Maestra tab ── */}
          {activeTab === 'tabla' && (
            <section style={styles.card}>
              <BiomarkerMasterTable
                studies={studies}
                patientBirthDate={patient?.birth_date}
                glowId={glowId}
                onBiomarkerUpdated={(studyId, biomarkerId, newValue, newFlag) =>
                  handleBiomarkerUpdated(biomarkerId, newValue, newFlag, studyId)
                }
              />
            </section>
          )}

          {/* ── Consulta IA tab ── */}
          {activeTab === 'consulta' && (
            <section style={{ ...styles.card, minHeight: '60vh' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Bot color="var(--gold-primary)" size={22} />
                  <div>
                    <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}>Historial de Consultas</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{chatHistory.filter(m => m.role === 'user').length} preguntas registradas</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {chatHistory.length > 0 && (
                    <button onClick={() => { if (confirm('¿Limpiar historial?')) { setChatHistory([]); localStorage.removeItem(`pdi_chat_${id}`); } }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-main)' }}>
                      Limpiar
                    </button>
                  )}
                  <button onClick={() => setIsChatOpen(true)}
                    style={{ padding: '6px 18px', borderRadius: '8px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-main)' }}>
                    + Nueva Consulta
                  </button>
                </div>
              </div>
              {chatHistory.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <Bot size={40} color="rgba(212,175,55,0.3)" />
                  <p style={{ fontSize: '15px', margin: 0 }}>Aún no hay consultas registradas</p>
                  <button onClick={() => setIsChatOpen(true)}
                    style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-main)' }}>
                    Hacer primera consulta
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {chatHistory.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? 'var(--gold-primary)' : 'rgba(212,175,55,0.1)', border: msg.role === 'model' ? '1px solid rgba(212,175,55,0.3)' : 'none' }}>
                        {msg.role === 'user' ? <span style={{ fontSize: '14px' }}>👤</span> : <Bot size={16} color="var(--gold-primary)" />}
                      </div>
                      <div style={{ flex: 1, maxWidth: '85%' }}>
                        <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.7, backgroundColor: msg.role === 'user' ? 'rgba(212,175,55,0.08)' : 'var(--bg-main)', border: `1px solid ${msg.role === 'user' ? 'rgba(212,175,55,0.2)' : 'var(--border-subtle)'}`, color: 'var(--text-primary)' }}>
                          {msg.text.split('\n').filter(l => l.trim()).map((line, j) => <p key={j} style={{ margin: '0 0 6px 0' }}>{line}</p>)}
                        </div>
                        {msg.timestamp && <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)', textAlign: msg.role === 'user' ? 'right' : 'left' }}>{msg.timestamp}</p>}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </section>
          )}

          {/* ── Estudios & Evolución tab ── */}
          {activeTab === 'estudios' && <>

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
                    {[...studies].sort((a, b) => {
                      const da = new Date((a as any).exam_date ?? a.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? a.created_at).getTime();
                      const db = new Date((b as any).exam_date ?? b.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? b.created_at).getTime();
                      return db - da;
                    }).map((s) => {
                      const rawDate = (s as any).exam_date ?? null;
                      const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
                      const bestDate = rawDate ?? fileDate;
                      const examDate = bestDate
                        ? new Date(bestDate + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                        : null;
                      const uploadDate = new Date(s.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
                      const isActive = activeStudyId === s.id;
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '20px', border: `1px solid ${isActive ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: isActive ? 'rgba(212,175,55,0.1)' : 'transparent', overflow: 'hidden' }}>
                          <button onClick={() => { setActiveStudyId(s.id); setAnalysisResult({ biomarkers: s.biomarkers as Biomarker[] ?? [], summary: s.summary }); }} style={{ padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-main)', textAlign: 'left' }}>
                            {examDate ? (
                              <>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: isActive ? 'var(--gold-primary)' : 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>📅 {examDate}</span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>subido {uploadDate}</span>
                              </>
                            ) : (
                              <span style={{ fontSize: '11px', color: isActive ? 'var(--gold-primary)' : 'var(--text-muted)' }}>{uploadDate}</span>
                            )}
                          </button>
                          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            {deleteConfirmId === s.id ? (
                              <>
                                <button
                                  onClick={async () => {
                                    setDeleteConfirmId(null);
                                    try {
                                      await deleteStudy(s.id);
                                      if (activeStudyId === s.id) { setAnalysisResult(null); setActiveStudyId(null); }
                                      await loadStudies();
                                    } catch (err: any) {
                                      showError(`Error al eliminar: ${err.message}`);
                                    }
                                  }}
                                  style={{ padding: '3px 8px', background: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-main)' }}
                                >
                                  Eliminar
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  style={{ padding: '3px 7px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(s.id)}
                                style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1 }}
                                title="Eliminar estudio"
                              >×</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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

          {/* Global Biomarker Cards — grouped by system (uses most recent study) */}
          {analysisResult && studies.length > 0 && (() => {
            const activeBms: Biomarker[] = (studies.find(s => s.id === activeStudyId)?.biomarkers ?? studies[0]?.biomarkers ?? []) as Biomarker[];
            const alteredInStudy = activeBms.filter(b => b.flag !== 'Normal').length;
            const editedInStudy = activeBms.filter(b => b.is_edited).length;

            // Compute suspicious names: cross-study IQR analysis per canonical biomarker
            const seriesHistoryMap: Record<string, number[]> = {};
            for (const study of studies) {
              for (const bm of (study.biomarkers ?? [])) {
                const canonical = normalizeBiomarkerName(bm.name);
                const v = parseFloat(bm.value);
                if (!isNaN(v)) {
                  if (!seriesHistoryMap[canonical]) seriesHistoryMap[canonical] = [];
                  seriesHistoryMap[canonical].push(v);
                }
              }
            }
            const suspiciousNames = new Set<string>();
            for (const bm of activeBms) {
              const canonical = normalizeBiomarkerName(bm.name);
              const vals = (seriesHistoryMap[canonical] ?? []).sort((a, b) => a - b);
              if (vals.length < 5) continue;
              const q1 = vals[Math.floor(vals.length * 0.25)];
              const q3 = vals[Math.floor(vals.length * 0.75)];
              const iqr = q3 - q1;
              const v = parseFloat(bm.value);
              if (iqr > 0 && !isNaN(v) && (v < q1 - 3 * iqr || v > q3 + 3 * iqr)) {
                suspiciousNames.add(canonical);
              }
            }
            const suspiciousInStudy = suspiciousNames.size;

            const filteredBms = bmFilter === 'altered'
              ? activeBms.filter(b => b.flag !== 'Normal')
              : bmFilter === 'edited'
              ? activeBms.filter(b => b.is_edited)
              : bmFilter === 'suspicious'
              ? activeBms.filter(b => suspiciousNames.has(normalizeBiomarkerName(b.name)))
              : activeBms;

            const grouped = filteredBms.reduce((acc: Record<string, Biomarker[]>, b) => {
              if (!acc[b.system]) acc[b.system] = [];
              acc[b.system].push(b);
              return acc;
            }, {});

            return <>
              {/* Filter bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filtrar:</span>
                {([
                  ['all', `Todo (${activeBms.length})`, 'var(--text-secondary)', 'rgba(255,255,255,0.06)'],
                  ['altered', `⚠️ Alterados (${alteredInStudy})`, '#ef4444', 'rgba(239,68,68,0.12)'],
                  ['edited', `✏️ Editados (${editedInStudy})`, 'var(--gold-primary)', 'rgba(212,175,55,0.12)'],
                  ['suspicious', `◇ Sospechosos (${suspiciousInStudy})`, '#f97316', 'rgba(249,115,22,0.12)'],
                ] as const).map(([mode, label, color, bg]) => (
                  <button key={mode} onClick={() => setBmFilter(mode)} style={{
                    padding: '5px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700,
                    fontFamily: 'var(--font-main)', cursor: 'pointer', transition: 'all 0.15s',
                    border: `1px solid ${bmFilter === mode ? color : 'var(--border-subtle)'}`,
                    background: bmFilter === mode ? bg : 'transparent',
                    color: bmFilter === mode ? color : 'var(--text-muted)',
                  }}>{label}</button>
                ))}
                {bmFilter !== 'all' && filteredBms.length === 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Ningún biomarcador en esta categoría.</span>
                )}
                {bmFilter === 'suspicious' && suspiciousInStudy === 0 && studies.length < 5 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>(Se necesitan ≥5 estudios con el mismo marcador para calcular sospechosos.)</span>
                )}
              </div>

              {Object.entries(grouped).map(([system, bms]) => (
              <section key={system} style={styles.card}>
                <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', margin: '0 0 16px 0' }}>
                  {MASTER_INDEX.find(s => s.name === system)?.icon} {system}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {bms.map((b, i) => {
                    const elemId = studyBiomarkerElementId(activeStudyId ?? studies[0].id, b.name);
                    const isGlowing = glowId === elemId;
                    const isAlt = b.flag !== 'Normal';
                    return (
                      <div
                        key={i} id={elemId}
                        className={isGlowing ? 'pdi-glow-active' : ''}
                        onClick={() => { setEditBm({ bm: b, studyId: activeStudyId ?? studies[0].id }); setEditValue(b.value); setEditFlag(b.flag); }}
                        title="Clic para editar este valor"
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '12px 16px', borderRadius: '8px', cursor: 'pointer',
                          border: `1px solid ${isAlt ? 'rgba(239,68,68,0.4)' : b.is_edited ? 'rgba(212,175,55,0.35)' : 'var(--border-subtle)'}`,
                          background: isAlt ? 'rgba(239,68,68,0.05)' : b.is_edited ? 'rgba(212,175,55,0.04)' : 'var(--bg-main)',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = isAlt ? 'rgba(239,68,68,0.7)' : 'rgba(212,175,55,0.5)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = isAlt ? 'rgba(239,68,68,0.4)' : b.is_edited ? 'rgba(212,175,55,0.35)' : 'var(--border-subtle)'}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <p style={{ margin: 0, fontSize: '13px', color: isAlt ? '#ef4444' : 'var(--text-primary)', fontWeight: 500 }}>{b.name}</p>
                            {!!b.is_edited && <span title={`Editado · Original IA: ${b.original_value ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center' }}><Edit2 size={10} color="var(--gold-primary)" /></span>}
                          </div>
                          {(b.reference_range || b.referenceRange) && <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Ref: {b.reference_range ?? b.referenceRange} {b.unit}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: isAlt ? '#ef4444' : b.is_edited ? 'var(--gold-primary)' : 'var(--text-primary)' }}>
                            {b.value} <span style={{ fontSize: '11px', fontWeight: 400 }}>{b.unit}</span>
                          </p>
                          {isAlt && <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: '4px' }}>{b.flag}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </>;
          })()}


          {/* Comparative Modal moved to top-level — see below */}


          </> /* end estudios tab */}
        </div>

        {/* ── RIGHT: Árbol Sistémico — sliding drawer ── */}
        <div style={{ position: 'relative', overflow: 'hidden', borderLeft: isTreeOpen ? '1px solid var(--border-subtle)' : 'none', transition: 'border 0.35s' }}>

          {/* Toggle tab — floats on left edge of panel */}
          <button
            onClick={() => setIsTreeOpen(o => !o)}
            title={isTreeOpen ? 'Cerrar árbol' : 'Abrir árbol sistémico'}
            style={{
              position: 'fixed',
              right: isTreeOpen ? 406 : 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 50,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRight: 'none',
              borderLeft: '3px solid var(--gold-primary)',
              borderRadius: '12px 0 0 12px',
              padding: '20px 10px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              boxShadow: '-6px 0 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,175,55,0.1)',
              transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
              color: 'var(--gold-primary)',
              minHeight: 100,
            }}
          >
            <Activity size={18} color="var(--gold-primary)" />
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', writingMode: 'vertical-rl', textOrientation: 'mixed', color: 'var(--text-secondary)' }}>
              {isTreeOpen ? '▶ Cerrar' : '◀ Árbol'}
            </span>
          </button>

          {/* Panel content — slides with overflow */}
          <div style={{ width: 400, overflowY: 'auto', padding: '28px 20px 28px 16px', height: '100%', opacity: isTreeOpen ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: isTreeOpen ? 'auto' : 'none' }}>
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
          </div>{/* end inner panel content */}
        </div>{/* end drawer outer */}
      </div>{/* end main grid */}

      {/* Floating Chat Button */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        style={{
          position: 'fixed', bottom: '40px', right: '40px',
          width: '60px', height: '60px', borderRadius: '50%',
          backgroundColor: 'var(--gold-primary)', border: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100
        }}
      >
        {isChatOpen ? <X size={28} color="#000" /> : <Bot size={28} color="#000" />}
      </button>

      {/* Chat Window — grande y legible */}
      {isChatOpen && (
        <div style={{
          position: 'fixed', bottom: '120px', right: '40px', width: '560px', height: '720px',
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '16px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 100
        }}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Bot size={26} color="var(--gold-primary)" />
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>Asistente Clínico PDI</h3>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Expediente: {patient.full_name}</span>
            </div>
            <button
              onClick={() => { if (confirm('¿Limpiar historial de consultas de este paciente?')) { setChatHistory([]); localStorage.removeItem(`pdi_chat_${id}`); } }}
              style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-main)' }}
            >
              Limpiar
            </button>
          </div>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {chatHistory.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '16px', marginTop: '40px', lineHeight: 1.6 }}>
                🧠 Hola, soy el asistente clínico.<br/>Conozco todos los estudios y respuestas de este paciente.<br/>
                <span style={{ fontSize: '14px' }}>¿Qué deseas consultar?</span>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <div style={{
                  padding: '14px 18px', borderRadius: '14px', fontSize: '15px', lineHeight: 1.65,
                  backgroundColor: msg.role === 'user' ? 'var(--gold-primary)' : 'var(--bg-main)',
                  color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
                  borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px',
                  borderBottomLeftRadius: msg.role === 'model' ? '4px' : '14px',
                }}>
                  {msg.text.split('\n').map((line, j) => line.trim() ? <p key={j} style={{ margin: '0 0 8px 0' }}>{line}</p> : null)}
                </div>
                {msg.timestamp && <p style={{ margin: '4px 4px 0', fontSize: '10px', color: 'var(--text-muted)', textAlign: msg.role === 'user' ? 'right' : 'left' }}>{msg.timestamp}</p>}
              </div>
            ))}
            {isChatLoading && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '10px', alignItems: 'center', padding: '14px 18px', backgroundColor: 'var(--bg-main)', borderRadius: '14px', borderBottomLeftRadius: '4px' }}>
                <Loader2 size={18} className="spin" color="var(--gold-primary)" />
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Analizando expediente...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleChatSubmit} style={{ padding: '18px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', display: 'flex', gap: '12px' }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Haz una pregunta clínica..."
              style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px 18px', color: 'var(--text-primary)', fontSize: '15px', outline: 'none', fontFamily: 'var(--font-main)' }}
              disabled={isChatLoading}
            />
            <button type="submit" disabled={isChatLoading || !chatInput.trim()} style={{ background: 'var(--gold-primary)', border: 'none', borderRadius: '10px', width: '50px', height: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: (isChatLoading || !chatInput.trim()) ? 'not-allowed' : 'pointer', opacity: (isChatLoading || !chatInput.trim()) ? 0.5 : 1 }}>
              <Send size={20} color="#000" />
            </button>
          </form>
        </div>
      )}

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
