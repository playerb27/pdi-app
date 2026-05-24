'use client';
import { useState, useEffect, use, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud, BrainCircuit, Activity, ChevronDown, ChevronRight, Edit2, X, RotateCcw, MessageSquare, Bot, Send, Loader2, GitCompare, FolderOpen, FileText, Trash2, Eye, Search, Paperclip, RefreshCw } from 'lucide-react';
import { getPatientById, updatePatient, createStudy, createBiomarkers, deleteBiomarkersForStudy, getStudiesWithBiomarkers, deleteStudy, updateBiomarker, getInterviewAnswers, getReportModules, saveComparativeMarkers, getCanonicalBuildStatus, Patient, Study } from '@/lib/api';
import { TOTAL_QUESTIONS, ALL_SECTIONS, HIDDEN_QUESTION_IDS } from '@/lib/questionnaire-data-ext';
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
  created_at?: string;       // database row creation timestamp
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

  const latestStudy = useMemo(() => {
    if (studies.length === 0) return null;
    return [...studies].sort((a, b) => {
      const getStudyDate = (s: Study) => {
        const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        const raw = (s as any).exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
      };
      return new Date(getStudyDate(b)).getTime() - new Date(getStudyDate(a)).getTime();
    })[0];
  }, [studies]);

  // Árbol sistémico
  const [expandedSystem, setExpandedSystem] = useState<number | null>(null);

  // Progress indicators
  const [interviewPct, setInterviewPct] = useState(0);
  const [reportPct, setReportPct] = useState(0);

  // Upload state — per-file progress
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'reading' | 'analyzing' | 'saving' | 'done' | 'error'; msg?: string }[]>([]);



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
  const [viewMode, setViewMode] = useState<'systems' | 'original'>('systems');
  const [showOnlySuspiciousCharts, setShowOnlySuspiciousCharts] = useState(false);

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 6000);
  };

  // Active tab in left panel
  const [activeTab, setActiveTab] = useState<'estudios' | 'evolucion' | 'tabla' | 'consulta' | 'documentos'>('estudios');
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [documentFilterType, setDocumentFilterType] = useState<string>('todos');
  const [documentSearchQuery, setDocumentSearchQuery] = useState<string>('');
  const [manualDocFile, setManualDocFile] = useState<File | null>(null);
  const [manualDocType, setManualDocType] = useState<string>('otros');
  const [manualDocNotes, setManualDocNotes] = useState<string>('');
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false);
  const [isTreeOpen, setIsTreeOpen] = useState(true);

  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparativeModal, setShowComparativeModal] = useState(false);
  const [addedToReport, setAddedToReport] = useState(false);
  // Processed series from EvolutionCharts — updated every time the chart re-renders
  const [readySeriesMap, setReadySeriesMap] = useState<Record<string, { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string; biomarkerId?: string; studyId?: string }[] }>>({});

  // Canonical build state
  type CanonicalStatus = 'none' | 'stale' | 'upToDate';
  const [canonicalStatus, setCanonicalStatus] = useState<CanonicalStatus>('none');
  const [canonicalLastBuilt, setCanonicalLastBuilt] = useState<Date | null>(null);
  const [isBuildingCanonical, setIsBuildingCanonical] = useState(false);
  const [canonicalMsg, setCanonicalMsg] = useState<string | null>(null);

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
        // Normal edit — replace value completely, wipe original_value
        : (s.biomarkers as any[]).map(b =>
            (b as any).id !== biomarkerId ? b : { ...b, value: newValue, flag: newFlag, is_edited: true, original_value: undefined }
          ),
    }));

    if (analysisResult) {
      setAnalysisResult(prev => prev ? {
        ...prev,
        biomarkers: newFlag === 'Excluido'
          ? prev.biomarkers.filter(b => b.id !== biomarkerId)
          : prev.biomarkers.map(b =>
            b.id !== biomarkerId ? b : { ...b, value: newValue, flag: newFlag, is_edited: true, original_value: undefined }
            )
      } : prev);
    }
    // NOTE: Do NOT call autoBuildCanonical() here — it triggers loadStudies()
    // which would overwrite the local state we just set.
  };


  // Biomarker inline edit state
  const [editBm, setEditBm] = useState<{ bm: Biomarker; studyId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editFlag, setEditFlag] = useState('');
  const [isSavingBm, setIsSavingBm] = useState(false);

  // Interview link state
  const [interviewToken, setInterviewToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [showTokenCopied, setShowTokenCopied] = useState(false);

  const handleSaveBiomarker = async () => {
    if (!editBm?.bm.id) return;
    setIsSavingBm(true);
    const ok = await updateBiomarker(editBm.bm.id, { value: editValue, flag: editFlag });
    if (ok) {
      // Update local state only after confirmed DB write.
      // original_value is wiped — the corrected value is the only clinical truth.
      setStudies(prev => prev.map(s => s.id !== editBm.studyId ? s : {
        ...s,
        biomarkers: (s.biomarkers as Biomarker[]).map(b =>
          b.id !== editBm.bm.id ? b : { ...b, value: editValue, flag: editFlag, is_edited: true, original_value: undefined }
        )
      }));
      if (analysisResult) {
        setAnalysisResult(prev => prev ? {
          ...prev,
          biomarkers: prev.biomarkers.map(b =>
            b.id !== editBm.bm.id ? b : { ...b, value: editValue, flag: editFlag, is_edited: true, original_value: undefined }
          )
        } : prev);
      }
    }
    // NOTE: Do NOT call autoBuildCanonical() here — it triggers loadStudies()
    // which would overwrite the local state we just set.
    setIsSavingBm(false);
    setEditBm(null);
  };

  const handleGenerateInterviewToken = async () => {
    setIsGeneratingToken(true);
    try {
      const res = await fetch(`/api/pacientes/${id}/interview-token`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.token) {
        setInterviewToken(data.token);
        // No auto-copy — user clicks "Link activo" to copy when ready
      } else {
        showError('No se pudo generar el link de entrevista');
      }
    } catch (e) {
      showError('Error de red al generar el link');
    }
    setIsGeneratingToken(false);
  };

  const handleRevokeInterviewToken = async () => {
    if (!confirm('¿Eliminar el link de entrevista? El paciente ya no podrá acceder con el link anterior.')) return;
    try {
      const res = await fetch(`/api/pacientes/${id}/interview-token`, { method: 'DELETE' });
      if (res.ok) {
        setInterviewToken(null);
      } else {
        showError('No se pudo eliminar el link');
      }
    } catch (e) {
      showError('Error de red al eliminar el link');
    }
  };

  const handleCopyInterviewLink = async () => {
    if (!interviewToken) return;
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/entrevista/${interviewToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setShowTokenCopied(true);
      setTimeout(() => setShowTokenCopied(false), 3000);
    } catch (e) {
      // Fallback: show URL in prompt
      prompt('Copia este link:', url);
    }
  };


  // Cargar historial de chat desde Supabase al cargar el perfil
  useEffect(() => {
    if (!patient?.chat_history) return;
    if (patient.chat_history.length > 0 && chatHistory.length === 0) {
      setChatHistory(patient.chat_history as {role: 'user'|'model', text: string, timestamp?: string}[]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id]);

  // Guardar historial en Supabase cada vez que cambia
  const saveChatToDb = async (history: {role: 'user'|'model', text: string, timestamp?: string}[]) => {
    if (!id) return;
    await updatePatient(id, { chat_history: history } as any);
  };

  useEffect(() => {
    if (!id || chatHistory.length === 0) return;
    saveChatToDb(chatHistory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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



  useEffect(() => { loadPatient(); loadStudies(); loadProgress(); loadDocuments(); }, [id]);

  // ── Migración automática de localStorage → Supabase ──────────────────────────
  // Runs ONCE after patient is loaded. If we find chat or Module 6 data in localStorage
  // that the DB does not already have, we upload it and remove the local copy.
  useEffect(() => {
    if (!patient || !id) return;

    const migrate = async () => {
      // 1. Chat history migration
      const localChatKey = `pdi_chat_${id}`;
      try {
        const localChat = localStorage.getItem(localChatKey);
        if (localChat) {
          const parsed = JSON.parse(localChat);
          const dbChat = patient.chat_history ?? [];
          // Only migrate if local has more messages than the DB
          if (Array.isArray(parsed) && parsed.length > dbChat.length) {
            console.log(`[PDI Migration] Uploading ${parsed.length} chat messages to Supabase for patient ${id}`);
            await updatePatient(id, { chat_history: parsed } as any);
            setChatHistory(parsed);
          }
          localStorage.removeItem(localChatKey);
        }
      } catch (e) { console.warn('[PDI Migration] Chat migration error:', e); }

      // 2. Module 6 comparative groups migration
      const localM6Key = `pdi_m6_${id}`;
      try {
        const localM6 = localStorage.getItem(localM6Key);
        if (localM6) {
          const parsed = JSON.parse(localM6);
          const dbGroups = patient.comparative_groups ?? [];
          if (Array.isArray(parsed) && parsed.length > dbGroups.length) {
            console.log(`[PDI Migration] Uploading ${parsed.length} comparative groups to Supabase for patient ${id}`);
            await updatePatient(id, { comparative_groups: parsed } as any);
          }
          localStorage.removeItem(localM6Key);
        }
      } catch (e) { console.warn('[PDI Migration] M6 migration error:', e); }

      // 3. Clean up old biomarker overrides key (deprecated — values are now in Supabase is_edited)
      const overridesKey = 'pdi_biomarker_overrides_v1';
      try {
        const raw = localStorage.getItem(overridesKey);
        if (raw) {
          // Note: overrides are now persisted via is_edited in Supabase.
          // We just clean up the local key.
          localStorage.removeItem(overridesKey);
          console.log('[PDI Migration] Cleaned up deprecated pdi_biomarker_overrides_v1 key');
        }
      } catch (e) { console.warn('[PDI Migration] Overrides cleanup error:', e); }
    };

    migrate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id]);

  const autoBuildCanonical = async () => {
    setIsBuildingCanonical(true);
    setCanonicalMsg(null);
    try {
      const res = await fetch('/api/build-canonical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCanonicalMsg(data.message ?? '✅ Tabla canónica construida');
      // Reload studies so the table re-renders with the fresh canonical_name values
      // from the DB. Without this the table keeps showing stale in-memory groupings.
      // All edits are safe: updateBiomarker() persists them to DB with is_edited=true,
      // so getStudiesWithBiomarkers() returns the correct edited values.
      await loadStudies();
    } catch (err: any) {
      setCanonicalMsg(`❌ Error: ${err.message}`);
      console.error('Error auto-building canonical:', err);
    } finally {
      setIsBuildingCanonical(false);
    }
  };

  const handleBuildCanonical = async () => {
    await autoBuildCanonical();
  };

  const loadPatient = async () => {
    const data = await getPatientById(id);
    if (!data) { router.push('/'); return; }
    setPatient(data);
    setEditFormData({ full_name: data.full_name, birth_date: data.birth_date, gender: data.gender, status: data.status });
    if (data && (data as any).interview_token) {
      setInterviewToken((data as any).interview_token);
    }
    setLoading(false);
  };

  const loadStudies = async () => {
    const data = await getStudiesWithBiomarkers(id);
    setStudies(data);
    if (data.length > 0) {
      // Sort by exam date to find the true newest study (not by created_at)
      const getStudyDate = (s: Study) => {
        const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        const raw = (s as any).exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
      };
      const sorted = [...data].sort((a, b) => new Date(getStudyDate(b)).getTime() - new Date(getStudyDate(a)).getTime());
      const newest = sorted[0];
      setActiveStudyId(newest.id);
      setAnalysisResult({ biomarkers: (newest.biomarkers ?? []) as Biomarker[], summary: newest.summary });
    }
  };

  const loadProgress = async () => {
    const [answers, reportMods] = await Promise.all([
      getInterviewAnswers(id),
      getReportModules(id),
    ]);
    const answered = ALL_SECTIONS.flatMap(s => s.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id)))
      .filter(q => answers[q.id!] && answers[q.id!] !== '').length;
    setInterviewPct(Math.min(100, Math.round((answered / TOTAL_QUESTIONS) * 100)));
    const approved = reportMods.filter(m => m.status === 'approved').length;
    const generated = reportMods.length;
    setReportPct(Math.round(((approved * 2 + (generated - approved)) / 10) * 100));
  };

  const loadDocuments = async () => {
    try {
      // Auto-recover any orphaned documents (e.g. from previous merges that
      // didn't re-link PDFs before deleting source studies). This is a no-op
      // if there are no orphans, so it's safe to call on every load.
      await fetch(`/api/pacientes/${id}/documents/recover`, { method: 'POST' });

      const res = await fetch(`/api/pacientes/${id}/documents`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error("Error loading patient documents:", e);
    }
  };

  const handleAttachDocument = async (studyId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', 'estudio_sangre');
      formData.append('notes', `Documento original de estudio adjuntado manualmente`);
      formData.append('study_id', studyId);

      const res = await fetch(`/api/pacientes/${id}/documents`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        await loadDocuments();
      } else {
        alert('Error al adjuntar el documento');
      }
    } catch (e) {
      console.error(e);
      alert('Error de red al adjuntar el documento');
    }
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

          // Auto-save original study file to patient documents
          const docFormData = new FormData();
          docFormData.append('file', file);
          docFormData.append('file_type', 'estudio_sangre');
          docFormData.append('notes', `Estudio de sangre analizado por IA el ${new Date().toLocaleDateString('es-MX')}`);
          docFormData.append('study_id', study.id);

          try {
            const uploadRes = await fetch(`/api/pacientes/${id}/documents`, {
              method: 'POST',
              body: docFormData
            });
            if (!uploadRes.ok) {
              console.error("Failed to auto-upload original study to patient documents");
            }
          } catch (e) {
            console.error("Error auto-uploading original study:", e);
          }

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

    await loadStudies(); // reload after structural change
    await loadDocuments();
    await autoBuildCanonical();
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
    // Explicitly scroll the correct panel container — scrollIntoView picks the wrong ancestor
    const tryScroll = (attemptsLeft: number) => {
      const el = document.getElementById(elementId);
      const panel = targetTab === 'tabla'
        ? document.getElementById('pdi-master-table-scroll')
        : document.getElementById('pdi-left-scroll');

      const elRect = el?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const isLayoutReady = el && panel && elRect && panelRect && elRect.height > 0 && panelRect.height > 0;

      if (isLayoutReady) {
        if (targetTab === 'tabla') {
          const leftPanel = document.getElementById('pdi-left-scroll');
          if (leftPanel) {
            leftPanel.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
        const scrollTarget = elRect.top - panelRect.top + panel.scrollTop - panel.clientHeight / 2 + el.clientHeight / 2;
        panel.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        setGlowId(elementId);
        setTimeout(() => setGlowId(null), 10000); // Highlight for 10 seconds
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
      setTimeout(() => tryScroll(15), 400); // Give 15 retries (~1.8s) for rendering tab switch
      return;
    }
    // If the result belongs to a specific study, activate it first, then scroll after render
    if (studyId && studyId !== activeStudyId) {
      const targetStudy = studies.find(s => s.id === studyId);
      if (targetStudy) {
        setActiveStudyId(studyId);
        setAnalysisResult({ biomarkers: (targetStudy.biomarkers ?? []) as Biomarker[], summary: targetStudy.summary });
      }
      setTimeout(() => tryScroll(8), 300);
    } else {
      setTimeout(() => tryScroll(8), 80);
    }
  };

  const searchResults = (() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results: { id: string; studyId?: string; label: string; sub: string; type: 'study' | 'chart' | 'tabla'; targetTab: typeof activeTab }[] = [];

    if (activeTab === 'estudios') {
      // One result per (study × canonical biomarker) — corrected values come from is_edited flag in DB

      studies.forEach(s => {
        const rawDate = (s as any).exam_date ?? null;
        const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        const studyDate = (rawDate ?? fileDate ?? s.created_at ?? '').slice(0, 10);
        const displayDate = studyDate
          ? new Date(studyDate + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
          : new Date(s.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

        // Deduplicate by canonical name within this study — edited entries win
        const seenInStudy = new Map<string, any>(); // canonical -> bm
        (s.biomarkers ?? []).forEach(bm => {
          const canonical = normalizeBiomarkerName(bm.name);
          const existing = seenInStudy.get(canonical);
          if (!existing || ((bm as any).is_edited && !existing.is_edited)) {
            seenInStudy.set(canonical, bm);
          }
        });
        seenInStudy.forEach((bm, canonical) => {
          const matches = bm.name.toLowerCase().includes(q) || canonical.toLowerCase().includes(q);
          if (!matches) return;

          const displayValue = `${bm.value} ${bm.unit}`;
          const editedMark = (bm as any).is_edited ? ' ✏️' : '';

          const elemId = studyBiomarkerElementId(s.id, bm.name);
          results.push({ id: elemId, studyId: s.id, label: bm.name, sub: `📊 Estudio del ${displayDate} · ${displayValue}${editedMark}`, type: 'study', targetTab: 'estudios' });
        });
      });
    } else if (activeTab === 'evolucion') {
      // One result per canonical biomarker name (deduplicated)
      // Match against BOTH the raw name AND the canonical name so users can
      // search "PCR" and find "Proteína C Reactiva Ultrasensible" (or vice versa)
      const seen = new Set<string>();
      studies.forEach(s => {
        (s.biomarkers ?? []).forEach(bm => {
          const canonical = normalizeBiomarkerName(bm.name);
          const matches = bm.name.toLowerCase().includes(q) || canonical.toLowerCase().includes(q);
          if (matches && !seen.has(canonical)) {
            seen.add(canonical);
            results.push({ id: chartBiomarkerElementId(bm.name), label: canonical, sub: `📈 Gráfica de evolución clínica`, type: 'chart', targetTab: 'evolucion' });
          }
        });
      });
    } else if (activeTab === 'tabla') {
      // One result per canonical name (row in the master table)
      // Match against BOTH the raw name AND the canonical name
      const seen = new Set<string>();
      studies.forEach(s => {
        (s.biomarkers ?? []).forEach(bm => {
          const canonical = normalizeBiomarkerName(bm.name);
          const matches = bm.name.toLowerCase().includes(q) || canonical.toLowerCase().includes(q);
          if (matches && !seen.has(canonical)) {
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
  // Primary: readySeriesMap populated by EvolutionCharts (deduped + overrides applied).
  // Fallback: build inline with median-dedup + localStorage overrides, so the modal
  //           never shows stale Supabase values even before EvolutionCharts fires.
  const comparativeSeries = useMemo(() => {
    const getStudyDate = (s: any) => {
      const fd = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
      const raw = s.exam_date ?? (fd ? fd + 'T12:00:00' : s.created_at);
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
    };
    const allOverrides: any[] = []; // overrides now come from is_edited flag in DB, not localStorage

    // Helper: apply DB-based edits (no-op since is_edited already reflects edits)
    const applyOverridesToSeries = (series: typeof readySeriesMap[string]) => series;

    return [...selectedForCompare].map(name => {
      // Prefer the already-processed series from EvolutionCharts
      if (readySeriesMap[name]) return applyOverridesToSeries(readySeriesMap[name]);

      // Fallback: build series inline
      const raw: { date: string; value: number; flag: string; biomarkerId?: string; studyId?: string; isEdited?: boolean }[] = [];
      for (const study of studies) {
        const dateStr = getStudyDate(study);
        const studyDate = dateStr.slice(0, 10);
        for (const bm of (study.biomarkers ?? [])) {
          const canonical = normalizeBiomarkerName(bm.name);
          if (canonical !== name) continue;
          const numVal = parseFloat(bm.value);
          if (isNaN(numVal)) continue;
          // Check override
      // Check DB is_edited flag
          const override = null; // is_edited already set on bm from Supabase
          raw.push({ date: dateStr, value: numVal, flag: bm.flag, biomarkerId: (bm as any).id, studyId: study.id, isEdited: (bm as any).is_edited });
        }
      }
      if (!raw.length) return null;

      // Median-dedup: same logic as EvolutionCharts
      const sortedVals = [...raw].map(p => p.value).sort((a, b) => a - b);
      const median = sortedVals[Math.floor(sortedVals.length / 2)];
      const byDay = new Map<string, typeof raw[0]>();
      for (const pt of raw) {
        const key = pt.date.slice(0, 10);
        const existing = byDay.get(key);
        if (!existing) { byDay.set(key, pt); }
        else if (pt.isEdited && !existing.isEdited) { byDay.set(key, pt); }
        else if (!pt.isEdited && existing.isEdited) { /* keep */ }
        else if (Math.abs(pt.value - median) < Math.abs(existing.value - median)) { byDay.set(key, pt); }
      }
      const points = [...byDay.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      // Find unit and referenceRange from the first matching biomarker
      let unit = '', referenceRange = '';
      for (const study of studies) {
        for (const bm of (study.biomarkers ?? [])) {
          if (normalizeBiomarkerName(bm.name) === name) { unit = bm.unit ?? ''; referenceRange = (bm as any).referenceRange ?? (bm as any).reference_range ?? ''; break; }
        }
        if (unit) break;
      }
      return { name, unit, referenceRange, points };
    }).filter(Boolean) as { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string; biomarkerId?: string; studyId?: string }[] }[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedForCompare, readySeriesMap, studies, id]);

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

      {editBm && (() => {
        // Find the source document linked to this study so we can show the eye button
        const sourceDoc = documents.find(
          (d: any) => d.study_id === editBm.studyId || (
            (() => {
              const study = studies.find(s => s.id === editBm.studyId);
              return study?.file_name && d.file_name === study.file_name;
            })()
          )
        );
        return (
          <div style={styles.modalOverlay} onClick={() => setEditBm(null)}>
            <div style={{ ...styles.modalContent, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ ...styles.sectionTitle, fontSize: '16px' }}>Editar Biomarcador</h2>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{editBm.bm.name}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Eye button — opens the original study document */}
                  {(sourceDoc?.public_url || sourceDoc?.url) && (
                    <a
                      href={sourceDoc.public_url ?? sourceDoc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver estudio original de laboratorio"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '36px', height: '36px', borderRadius: '8px',
                        border: '1px solid rgba(212,175,55,0.35)',
                        background: 'rgba(212,175,55,0.08)',
                        color: 'var(--gold-primary)',
                        textDecoration: 'none',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(212,175,55,0.18)'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(212,175,55,0.08)'}
                    >
                      <Eye size={16} />
                    </a>
                  )}
                  <button onClick={() => setEditBm(null)} style={styles.iconBtn}><X size={20} /></button>
                </div>
              </div>

              {/* Study date label */}
              {(() => {
                const study = studies.find(s => s.id === editBm.studyId);
                const studyDateLabel = study
                  ? (() => {
                      const raw = (study as any).exam_date ?? study.file_name?.match(/(\.\d{4}-\d{2}-\d{2})/)?.[1] ?? study.created_at?.slice(0, 10);
                      if (!raw) return null;
                      return new Date(raw + (raw.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
                    })()
                  : null;
                if (!studyDateLabel) return null;
                return (
                  <div style={{ padding: '7px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>📋</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Estudio del <strong style={{ color: 'var(--text-secondary)' }}>{studyDateLabel}</strong></span>
                    {study?.file_name && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'monospace', opacity: 0.6 }}>{study.file_name}</span>}
                  </div>
                );
              })()}

              {editBm.bm.is_edited && (
                <div style={{ padding: '7px 12px', borderRadius: '8px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px' }}>✏️</span>
                  <span style={{ fontSize: '11px', color: 'var(--gold-primary)' }}>Valor editado manualmente — el original de la IA fue eliminado</span>
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
        );
      })()}

      {/* ── Comparative Modal ── top-level, works from ANY tab ── */}
      {showComparativeModal && selectedForCompare.size > 0 && (
        <ComparativeModal
          series={comparativeSeries}
          patientId={id}
          onClose={() => setShowComparativeModal(false)}
          onAddToReport={handleAddToReport}
          onValueUpdated={handleBiomarkerUpdated}
          documents={documents}
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
              {/* ── Interview link buttons ── */}
              {!interviewToken ? (
                <button
                  onClick={handleGenerateInterviewToken}
                  disabled={isGeneratingToken}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                    border: '1px solid rgba(212,175,55,0.35)',
                    background: 'rgba(212,175,55,0.08)',
                    color: 'var(--gold-primary)',
                    cursor: isGeneratingToken ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-main)', opacity: isGeneratingToken ? 0.6 : 1, transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '12px' }}>🔗</span>
                  <span>{isGeneratingToken ? 'Generando...' : 'Generar link'}</span>
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={handleCopyInterviewLink}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                      border: showTokenCopied ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(212,175,55,0.35)',
                      background: showTokenCopied ? 'rgba(34,197,94,0.12)' : 'rgba(212,175,55,0.08)',
                      color: showTokenCopied ? '#22c55e' : 'var(--gold-primary)',
                      cursor: 'pointer', fontFamily: 'var(--font-main)', transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '12px' }}>🔗</span>
                    <span>{showTokenCopied ? '✓ Copiado' : 'Copiar link'}</span>
                  </button>
                  <button
                    onClick={handleRevokeInterviewToken}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                      border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
                      color: '#ef4444', cursor: 'pointer', fontFamily: 'var(--font-main)', transition: 'all 0.2s',
                    }}
                  >
                    <span>Eliminar link</span>
                  </button>
                </div>
              )}
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
        @keyframes pdi-glow {
          0%   { box-shadow: 0 0 0 rgba(212,175,55,0); transform: scale(1); }
          8%   { box-shadow: 0 0 0 6px rgba(212,175,55,0.7), 0 0 40px 8px rgba(212,175,55,0.5), 0 0 80px 16px rgba(212,175,55,0.2); transform: scale(1.03); }
          20%  { box-shadow: 0 0 0 4px rgba(212,175,55,0.4), 0 0 24px 4px rgba(212,175,55,0.25); transform: scale(1.01); }
          35%  { box-shadow: 0 0 0 6px rgba(212,175,55,0.65), 0 0 40px 8px rgba(212,175,55,0.4), 0 0 80px 16px rgba(212,175,55,0.15); transform: scale(1.025); }
          50%  { box-shadow: 0 0 0 3px rgba(212,175,55,0.3), 0 0 16px 2px rgba(212,175,55,0.2); transform: scale(1); }
          65%  { box-shadow: 0 0 0 5px rgba(212,175,55,0.5), 0 0 30px 6px rgba(212,175,55,0.3); transform: scale(1.015); }
          82%  { box-shadow: 0 0 0 2px rgba(212,175,55,0.25), 0 0 12px rgba(212,175,55,0.15); transform: scale(1); }
          100% { box-shadow: 0 0 0 2px rgba(212,175,55,0.35), 0 0 12px rgba(212,175,55,0.12); transform: scale(1); }
        }
        .pdi-glow-active {
          animation: pdi-glow 6s cubic-bezier(0.4,0,0.2,1) forwards !important;
          border: 2px solid rgba(212,175,55,0.95) !important;
          background: rgba(212,175,55,0.06) !important;
          z-index: 2;
          position: relative;
        }
        .pdi-glow-active::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(212,175,55,0.18) 0%, transparent 60%);
          pointer-events: none;
          z-index: 1;
        }
      `}</style>

      {/* ── Main content area ── */}
      <div id="pdi-left-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* ── Content ── */}
        <div style={{ padding: '28px 24px 28px 48px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── Tab bar ── */}
          <div style={{ display: 'flex', gap: 4, padding: '4px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
            {([['estudios', '📊 Estudios'], ['evolucion', '📈 Evolución Clínica'], ['tabla', '🧬 Tabla Maestra'], ['consulta', '🤖 Consulta IA'], ['documentos', '📂 Documentos']] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
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
                    patientId={id}
                    glowId={glowId}
                    compareMode={isCompareMode}
                    selectedForCompare={selectedForCompare}
                    onToggleCompare={toggleSelectForCompare}
                    showOnlySuspicious={showOnlySuspiciousCharts}
                    onSeriesReady={setReadySeriesMap}
                    documents={documents}
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
                patientId={id}
                patientBirthDate={patient?.birth_date}
                glowId={glowId}
                documents={documents}
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
                    <button onClick={() => { if (confirm('¿Limpiar historial?')) { saveChatToDb([]); setChatHistory([]); } }}
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

          {/* ── Documentos tab ── */}
          {activeTab === 'documentos' && (
            <section style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FolderOpen color="var(--gold-primary)" size={22} />
                  <div>
                    <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}>Expediente de Documentos</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Estudios, retinografías y archivos de soporte del paciente</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUploadForm(o => !o)}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: showUploadForm ? 'rgba(255,255,255,0.06)' : 'var(--gold-primary)', color: showUploadForm ? 'var(--text-primary)' : '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-main)', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                >
                  {showUploadForm ? '✕ Cancelar' : '＋ Subir Documento'}
                </button>
              </div>

              {/* Upload Form Box */}
              {showUploadForm && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--gold-primary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Nuevo Documento</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', gridTemplateRows: 'auto' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Tipo de Documento:</label>
                        <select
                          value={manualDocType}
                          onChange={e => setManualDocType(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-main)' }}
                        >
                          <option value="estudio_sangre">Estudio de sangre</option>
                          <option value="retinografia">Retinografía</option>
                          <option value="otros">Otro / Soporte</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Seleccionar Archivo:</label>
                        <input
                          type="file"
                          onChange={e => setManualDocFile(e.target.files?.[0] ?? null)}
                          style={{ width: '100%', fontSize: '12px', color: 'var(--text-muted)' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Notas u Observaciones (opcional):</label>
                      <input
                        type="text"
                        placeholder="Ej: Radiografía de tórax de control, Retinografía ojo izquierdo..."
                        value={manualDocNotes}
                        onChange={e => setManualDocNotes(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-main)', boxSizing: 'border-box' }}
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!manualDocFile) { alert('Por favor seleccione un archivo'); return; }
                        setIsUploadingDocument(true);
                        const formData = new FormData();
                        formData.append('file', manualDocFile);
                        formData.append('file_type', manualDocType);
                        formData.append('notes', manualDocNotes);
                        try {
                          const res = await fetch(`/api/pacientes/${id}/documents`, {
                            method: 'POST',
                            body: formData
                          });
                          if (res.ok) {
                            setManualDocFile(null);
                            setManualDocNotes('');
                            setShowUploadForm(false);
                            loadDocuments();
                          } else {
                            alert('Error al subir el documento');
                          }
                        } catch (e) {
                          console.error(e);
                          alert('Error de red al subir documento');
                        } finally {
                          setIsUploadingDocument(false);
                        }
                      }}
                      disabled={isUploadingDocument || !manualDocFile}
                      style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: (isUploadingDocument || !manualDocFile) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: 'fit-content', marginTop: '6px' }}
                    >
                      {isUploadingDocument ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                      {isUploadingDocument ? 'Subiendo...' : 'Subir y Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Filters & Search Header */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Search query input */}
                <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar por nombre o notas..."
                    value={documentSearchQuery}
                    onChange={e => setDocumentSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-main)', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Filter tags */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    ['todos', 'Todos'],
                    ['estudio_sangre', 'Estudios de Sangre'],
                    ['retinografia', 'Retinografías'],
                    ['otros', 'Otros']
                  ].map(([type, label]) => {
                    const isSelected = documentFilterType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setDocumentFilterType(type)}
                        style={{
                          padding: '6px 14px', borderRadius: '99px', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-main)', fontWeight: 600,
                          border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                          background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
                          color: isSelected ? 'var(--gold-primary)' : 'var(--text-muted)',
                          transition: 'all 0.15s'
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Documents Grid */}
              {(() => {
                const filteredDocs = documents.filter(doc => {
                  const matchesType = documentFilterType === 'todos' || doc.file_type === documentFilterType;
                  const matchesSearch = !documentSearchQuery.trim() ||
                    doc.file_name.toLowerCase().includes(documentSearchQuery.toLowerCase()) ||
                    (doc.notes && doc.notes.toLowerCase().includes(documentSearchQuery.toLowerCase()));
                  return matchesType && matchesSearch;
                });

                if (filteredDocs.length === 0) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', border: '1px dashed var(--border-subtle)', borderRadius: '12px', width: '100%' }}>
                      <FileText size={36} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '12px' }} />
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>No se encontraron documentos en esta sección.</p>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                    {filteredDocs.map((doc: any) => {
                      const badgeColors: Record<string, { bg: string, text: string, label: string }> = {
                        estudio_sangre: { bg: 'rgba(34,197,94,0.12)', text: '#4ade80', label: '🩸 Estudio de Sangre' },
                        retinografia: { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', label: '👁️ Retinografía' },
                        otros: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', label: '📂 Soporte / Otros' }
                      };
                      const badge = badgeColors[doc.file_type] || badgeColors.otros;

                      return (
                        <div key={doc.id} style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: badge.bg, color: badge.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{badge.label}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(doc.file_size / 1024).toFixed(1)} KB</span>
                            </div>
                            <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{doc.file_name}</h4>
                            <p style={{ margin: '0 0 8px', fontSize: '10px', color: 'var(--text-muted)' }}>Subido: {new Date(doc.uploaded_at).toLocaleString()}</p>
                            {doc.notes && (
                              <p style={{ margin: '0', fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', padding: '6px 10px', borderRadius: '6px', borderLeft: '2px solid var(--border-strong)' }}>{doc.notes}</p>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px', marginTop: '4px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <a
                                href={doc.public_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--gold-primary)', fontWeight: 700, textDecoration: 'none', background: 'rgba(212,175,55,0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.2)' }}
                              >
                                <Eye size={12} /> Ver
                              </a>

                              {doc.study_id && (
                                <button
                                  onClick={() => {
                                    setActiveTab('estudios');
                                    setActiveStudyId(doc.study_id);
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#60a5fa', fontWeight: 700, textDecoration: 'none', background: 'rgba(59,130,246,0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.2)', cursor: 'pointer', fontFamily: 'var(--font-main)' }}
                                >
                                  🔗 Estudio IA
                                </button>
                              )}
                            </div>

                            <button
                              onClick={async () => {
                                if (!confirm('¿Eliminar este documento permanentemente?')) return;
                                try {
                                  const res = await fetch(`/api/pacientes/${id}/documents?docId=${doc.id}`, {
                                    method: 'DELETE'
                                  });
                                  if (res.ok) {
                                    loadDocuments();
                                  } else {
                                    alert('Error al eliminar el documento');
                                  }
                                } catch (e) {
                                  console.error(e);
                                  alert('Error de red al eliminar');
                                }
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-main)' }}
                            >
                              <Trash2 size={12} /> Borrar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
              // Helper: extract YYYY-MM-DD from filename
              const datePrefix = (fileName: string) => {
                const match = fileName?.match(/(\d{4}-\d{2}-\d{2})/);
                return match ? match[1] : null;
              };

              // Sort newest-first
              const sorted = [...studies].sort((a, b) => {
                const getT = (s: typeof studies[0]) => {
                  const d = (s as any).exam_date ?? s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? s.created_at;
                  return new Date(d).getTime();
                };
                return getT(b) - getT(a);
              });

              // Build ordered groups (preserves newest-first order)
              const groupOrder: string[] = [];
              const byDate: Record<string, typeof studies> = {};
              for (const s of sorted) {
                const key = datePrefix(s.file_name ?? '') ?? `uid-${s.id}`;
                if (!byDate[key]) { byDate[key] = []; groupOrder.push(key); }
                byDate[key].push(s);
              }

              // Render one study pill — used solo and inside brackets
              const renderPill = (s: typeof studies[0]) => {
                const rawDate = (s as any).exam_date ?? null;
                const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
                const bestDate = rawDate ?? fileDate;
                const examDate = bestDate
                  ? new Date(bestDate + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                  : null;
                const uploadDate = new Date(s.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
                const isActive = activeStudyId === s.id;
                const originalDoc = documents.find((d) => d.study_id === s.id);

                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '20px', border: `1px solid ${isActive ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: isActive ? 'rgba(212,175,55,0.1)' : 'transparent', overflow: 'hidden' }}>
                    <button
                      onClick={() => { setActiveStudyId(s.id); setAnalysisResult({ biomarkers: s.biomarkers as Biomarker[] ?? [], summary: s.summary }); }}
                      style={{ padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-main)', textAlign: 'left' }}
                    >
                      {examDate ? (
                        <>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: isActive ? 'var(--gold-primary)' : 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>📅 {examDate}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>subido {uploadDate}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: '11px', color: isActive ? 'var(--gold-primary)' : 'var(--text-muted)' }}>{uploadDate}</span>
                      )}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, paddingRight: '8px', gap: '4px' }}>
                      {originalDoc ? (
                        <a
                          href={originalDoc.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Ver PDF original: ${originalDoc.file_name}`}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', color: 'var(--gold-primary)', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          <Eye size={12} />
                        </a>
                      ) : (
                        <label
                          title="Adjuntar PDF de estudio original"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = 'var(--gold-primary)'; (e.currentTarget as HTMLLabelElement).style.color = 'var(--gold-primary)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLLabelElement).style.color = 'var(--text-muted)'; }}
                        >
                          <Paperclip size={12} />
                          <input
                            type="file"
                            accept="application/pdf"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              await handleAttachDocument(s.id, file);
                            }}
                          />
                        </label>
                      )}
                      {deleteConfirmId === s.id ? (
                        <>
                          <button
                            onClick={async () => {
                              setDeleteConfirmId(null);
                              try {
                                const relatedDoc = documents.find(d => d.study_id === s.id);
                                if (relatedDoc) {
                                  await fetch(`/api/pacientes/${id}/documents?docId=${relatedDoc.id}`, { method: 'DELETE' });
                                }
                                await deleteStudy(s.id);
                                if (activeStudyId === s.id) { setAnalysisResult(null); setActiveStudyId(null); }
                                await loadStudies();
                                await loadDocuments();
                                await autoBuildCanonical();
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
                          >✕</button>
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
              };

              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  {groupOrder.map(key => {
                    const group = byDate[key];
                    // Single study for this date → compact pill (auto width)
                    if (group.length === 1) return renderPill(group[0]);

                    // Multiple studies from same date → full-width bracket
                    const dp = datePrefix(group[0].file_name ?? '');
                    const dateLabel = dp
                      ? new Date(dp + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                      : key;
                    return (
                      <div
                        key={key}
                        style={{
                          width: '100%',
                          borderRadius: '10px',
                          border: '1px solid rgba(212,175,55,0.2)',
                          background: 'rgba(212,175,55,0.04)',
                          padding: '8px 10px 6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gold-primary)', opacity: 0.7, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {group.length} estudios · {dateLabel}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {group.map(s => renderPill(s))}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                <button
                  onClick={handleBuildCanonical}
                  disabled={isBuildingCanonical}
                  title="Re-procesa los nombres de biomarcadores para unificar sinónimos en la tabla maestra"
                  style={{ fontSize: '12px', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: isBuildingCanonical ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: isBuildingCanonical ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-main)', transition: 'all 0.2s' }}
                >
                  {isBuildingCanonical ? (
                    <><span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', borderTop: '2px solid transparent', borderRight: '2px solid var(--text-muted)', borderBottom: '2px solid var(--text-muted)', borderLeft: '2px solid var(--text-muted)', animation: 'spin 0.8s linear infinite' }} /> Procesando…</>
                  ) : (
                    <><RefreshCw size={12} /> Reconstruir tabla</>
                  )}
                </button>
                {canonicalMsg && (
                  <span style={{ fontSize: '11px', color: canonicalMsg.startsWith('❌') ? '#ef4444' : '#22c55e', fontFamily: 'var(--font-main)' }}>
                    {canonicalMsg}
                  </span>
                )}
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
            const rawActiveBms: Biomarker[] = (studies.find(s => s.id === activeStudyId)?.biomarkers ?? latestStudy?.biomarkers ?? []) as Biomarker[];

            // \u2500\u2500 Apply localStorage overrides (same source of truth as charts + table) \u2500\u2500
            // Find the study date for the active study so we can match override records
            const activeStudy = studies.find(s => s.id === activeStudyId) ?? latestStudy;
            const activeStudyDate = activeStudy ? (() => {
              const fd = (activeStudy as any).file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
              const raw = (activeStudy as any).exam_date ?? (fd ? fd + 'T12:00:00' : (activeStudy as any).created_at);
              return raw ? String(raw).slice(0, 10) : '';
            })() : '';
            const activeBms: Biomarker[] = rawActiveBms.map(b => b); // values come directly from DB (is_edited flag preserved)

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
              {/* Filter & View Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '16px' }}>
                {/* Left side: filter buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filtrar:</span>
                  {([
                    ['all', `Todo (${activeBms.length})`, 'var(--text-secondary)', 'rgba(255,255,255,0.06)'],
                    ['altered', `⚠️ Alterados (${alteredInStudy})`, '#ef4444', 'rgba(239,68,68,0.12)'],
                    ['edited', `✏️ Editados (${editedInStudy})`, 'var(--gold-primary)', 'rgba(212,175,55,0.12)'],
                    ['suspicious', `◇ Sospechosos (${suspiciousInStudy})`, '#f97316', 'rgba(249,115,22,0.12)'],
                  ] as const).map(([mode, label, color, bg]) => (
                    <button key={mode} onClick={() => setBmFilter(mode)} style={{
                      padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 700,
                      fontFamily: 'var(--font-main)', cursor: 'pointer', transition: 'all 0.15s',
                      border: `1px solid ${bmFilter === mode ? color : 'var(--border-subtle)'}`,
                      background: bmFilter === mode ? bg : 'transparent',
                      color: bmFilter === mode ? color : 'var(--text-muted)',
                    }}>{label}</button>
                  ))}
                </div>

                <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} className="pdi-filter-divider" />

                {/* Right side: view mode toggle buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vista:</span>
                  {(['systems', 'original'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 700,
                        fontFamily: 'var(--font-main)', cursor: 'pointer', transition: 'all 0.15s',
                        border: `1px solid ${viewMode === mode ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                        background: viewMode === mode ? 'rgba(212,175,55,0.12)' : 'transparent',
                        color: viewMode === mode ? 'var(--gold-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {mode === 'systems' ? '📁 Por Sistemas' : '📄 Orden del Estudio'}
                    </button>
                  ))}
                </div>

                {bmFilter !== 'all' && filteredBms.length === 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 'auto' }}>Ningún biomarcador.</span>
                )}
                {bmFilter === 'suspicious' && suspiciousInStudy === 0 && studies.length < 5 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 'auto' }}>(≥5 estudios req.)</span>
                )}
              </div>

              {viewMode === 'original' ? (
                <section style={styles.card}>
                  <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', margin: '0 0 16px 0' }}>
                    📄 Biomarcadores en Orden del Estudio Original
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {[...filteredBms].sort((a, b) => {
                      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return tA - tB;
                    }).map((b, i) => {
                      const elemId = studyBiomarkerElementId(activeStudyId ?? latestStudy?.id ?? '', b.name);
                      const isGlowing = glowId === elemId;
                      const isAlt = b.flag !== 'Normal';
                      return (
                        <div
                          key={i} id={elemId}
                           className={isGlowing ? 'pdi-glow-active' : ''}
                          onClick={() => { setEditBm({ bm: b, studyId: activeStudyId ?? latestStudy?.id ?? '' }); setEditValue(b.value); setEditFlag(b.flag); }}
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
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                              🏷️ {b.system}
                            </span>
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
              ) : (
                Object.entries(grouped).map(([system, bms]) => (
                  <section key={system} style={styles.card}>
                    <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', margin: '0 0 16px 0' }}>
                      {MASTER_INDEX.find(s => s.name === system)?.icon} {system}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                      {bms.map((b, i) => {
                        const elemId = studyBiomarkerElementId(activeStudyId ?? latestStudy?.id ?? '', b.name);
                        const isGlowing = glowId === elemId;
                        const isAlt = b.flag !== 'Normal';
                        return (
                          <div
                            key={i} id={elemId}
                            className={isGlowing ? 'pdi-glow-active' : ''}
                            onClick={() => { setEditBm({ bm: b, studyId: activeStudyId ?? latestStudy?.id ?? '' }); setEditValue(b.value); setEditFlag(b.flag); }}
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
                ))
              )}
            </>;
          })()}


          {/* Comparative Modal moved to top-level — see below */}


          </> /* end estudios tab */}
        </div>

      </div>{/* end main content area */}

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
              onClick={() => { if (confirm('¿Limpiar historial de consultas de este paciente?')) { saveChatToDb([]); setChatHistory([]); } }}
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
