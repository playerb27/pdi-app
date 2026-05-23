import { supabase } from './supabase';
import { HIDDEN_QUESTION_IDS } from './questionnaire-data-ext';

export interface Patient {
  id: string;
  full_name: string;
  birth_date: string;
  gender: string;
  status: string;
  top_red_flags?: any;
  clinical_summary?: string;
  created_at: string;
  chat_history?: any[];
  comparative_groups?: any[];
}

export async function getPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching patients:", error.message, error.details, error.hint);
    return [];
  }
  return data || [];
}

export async function createPatient(patientData: Partial<Patient>): Promise<{data: Patient | null, error: string | null}> {
  const { data, error } = await supabase
    .from('patients')
    .insert([patientData])
    .select()
    .single();

  if (error) {
    console.error("Error creating patient:", error.message, error.details, error.hint);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export async function getPatientById(id: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error("Error fetching patient:", error.message);
    return null;
  }
  return data;
}

export async function updatePatient(id: string, patientData: Partial<Patient>): Promise<{data: Patient | null, error: string | null}> {
  const { data, error } = await supabase
    .from('patients')
    .update(patientData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error updating patient:", error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

// ─── Studies & Biomarkers ─────────────────────────────────────────────────────

export interface Study {
  id: string;
  patient_id: string;
  file_name: string;
  summary: string;
  created_at: string;
  exam_date?: string;   // fecha real del examen (extraída del documento)
  biomarkers?: Biomarker[];
}

export interface Biomarker {
  id?: string;
  study_id?: string;
  name: string;
  value: string;
  unit: string;
  reference_range?: string;
  flag: string;       // 'Normal' | 'Alto' | 'Bajo' | 'Excluido'
  system: string;
  is_edited?: boolean;
  original_value?: string;
  excluded_from_chart?: boolean; // convenience derived from flag === 'Excluido'
  created_at?: string;
}

export async function createStudy(patientId: string, fileName: string, summary: string, examDate?: string): Promise<Study | null> {
  const { data, error } = await supabase
    .from('studies')
    .insert([{ patient_id: patientId, file_name: fileName, summary, ...(examDate ? { exam_date: examDate } : {}) }])
    .select()
    .single();
  if (error) { console.error("Error creating study:", error.message); return null; }
  return data;
}

export async function createBiomarkers(studyId: string, biomarkers: Biomarker[]): Promise<boolean> {
  const baseTime = new Date();
  const rows = biomarkers.map((b, index) => ({
    study_id: studyId,
    name: b.name,
    raw_name: b.name,          // preserve exact name from document, never overwritten
    value: b.value,
    unit: b.unit,
    reference_range: b.reference_range ?? (b as any).referenceRange ?? null,
    flag: b.flag,
    system: b.system ?? 'Sin clasificar',
    created_at: new Date(baseTime.getTime() + index).toISOString(), // sequence order via incrementing milliseconds
    // canonical_name and canonical_system are set later by /api/build-canonical
  }));
  const { error } = await supabase.from('biomarkers').insert(rows);
  if (error) { console.error("Error inserting biomarkers:", error.message); return false; }
  return true;
}

// ─── Canonical build status ───────────────────────────────────────────────────

export async function getCanonicalBuildStatus(
  patientId: string,
  currentStudyIds: string[]
): Promise<{ status: 'none' | 'stale' | 'upToDate'; lastBuiltAt: Date | null; studyIdsInBuild: string[] }> {
  const { data } = await supabase
    .from('canonical_builds')
    .select('built_at, study_ids')
    .eq('patient_id', patientId)
    .order('built_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { status: 'none', lastBuiltAt: null, studyIdsInBuild: [] };

  const builtIds: string[] = data.study_ids ?? [];
  const isStale = currentStudyIds.some(id => !builtIds.includes(id));

  return {
    status: isStale ? 'stale' : 'upToDate',
    lastBuiltAt: new Date(data.built_at),
    studyIdsInBuild: builtIds,
  };
}

export async function getStudiesWithBiomarkers(patientId: string): Promise<Study[]> {
  const { data: studies, error } = await supabase
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  if (error) { console.error("Error fetching studies:", error.message); return []; }
  return studies || [];
}

export async function deleteStudy(studyId: string): Promise<boolean> {
  const { error } = await supabase.from('studies').delete().eq('id', studyId);
  if (error) {
    console.error('Error deleting study:', error.message, error.code);
    throw new Error(error.message ?? 'No se pudo eliminar el estudio. Verifica los permisos.');
  }
  return true;
}

// ─── Biomarker edits — server-side route (bypasses RLS) ─────────────────────
//
// CRITICAL: Do NOT use the browser Supabase client (anon key) for biomarker
// updates. Supabase RLS policies silently block UPDATE/DELETE for anon users,
// returning no error but also making no change. The UI would show "✅ Guardado"
// but the value would revert on page reload.
//
// Solution: route all writes through /api/biomarkers/[id] which runs server-side
// with the service_role key and has full access to the table.

export async function updateBiomarker(
  biomarkerId: string,
  updates: { value: string; flag: string; originalValue?: string | null }
): Promise<boolean> {
  try {
    const res = await fetch(`/api/biomarkers/${biomarkerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: updates.value,
        flag: updates.flag,
        originalValue: updates.originalValue,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error('[updateBiomarker] Server error:', err.error);
      return false;
    }

    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[updateBiomarker] Network error:', err);
    return false;
  }
}

export async function deleteBiomarker(biomarkerId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/biomarkers/${biomarkerId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error('[deleteBiomarker] Server error:', err.error);
      return false;
    }

    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[deleteBiomarker] Network error:', err);
    return false;
  }
}

// ─── Interview / Questionnaire ────────────────────────────────────────────────

export async function upsertInterviewAnswer(
  patientId: string,
  questionId: string,
  answer: string
): Promise<void> {
  await supabase.from('interviews').upsert(
    { patient_id: patientId, question_id: questionId, answer, updated_at: new Date().toISOString() },
    { onConflict: 'patient_id,question_id' }
  );
}

export async function getInterviewAnswers(
  patientId: string
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('interviews')
    .select('question_id, answer')
    .eq('patient_id', patientId);
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.question_id, r.answer]));
}

export async function deleteInterviewAnswers(patientId: string): Promise<void> {
  await supabase.from('interviews').delete().eq('patient_id', patientId);
}

// ─── Report Modules ────────────────────────────────────────────────────────────

export interface ReportModule {
  id: string;
  patient_id: string;
  module_num: number;
  title: string;
  content: string;
  status: 'pending' | 'approved';
  updated_at: string;
}

export async function getReportModules(patientId: string): Promise<ReportModule[]> {
  const { data } = await supabase
    .from('report_modules')
    .select('*')
    .eq('patient_id', patientId)
    .order('module_num');
  return data || [];
}

export async function upsertReportModule(
  patientId: string,
  moduleNum: number,
  title: string,
  content: string,
  status: 'pending' | 'approved' = 'pending'
): Promise<boolean> {
  const { error } = await supabase.from('report_modules').upsert(
    { patient_id: patientId, module_num: moduleNum, title, content, status, updated_at: new Date().toISOString() },
    { onConflict: 'patient_id,module_num' }
  );
  if (error) { console.error('Error saving report module:', error.message); return false; }
  return true;
}

export async function deleteReportModules(patientId: string): Promise<void> {
  await supabase.from('report_modules').delete().eq('patient_id', patientId);
}

export async function getPatientProgressBatch(
  patientIds: string[]
): Promise<Record<string, { interviewCount: number; reportApproved: number; reportGenerated: number; studyCount: number }>> {
  if (patientIds.length === 0) return {};
  const [{ data: interviews }, { data: reports }, { data: studies }] = await Promise.all([
    supabase.from('interviews').select('patient_id, question_id, answer').in('patient_id', patientIds),
    supabase.from('report_modules').select('patient_id, status').in('patient_id', patientIds),
    supabase.from('studies').select('patient_id').in('patient_id', patientIds),
  ]);
  const result: Record<string, { interviewCount: number; reportApproved: number; reportGenerated: number; studyCount: number }> = {};
  patientIds.forEach(id => { result[id] = { interviewCount: 0, reportApproved: 0, reportGenerated: 0, studyCount: 0 }; });
  
  (interviews || []).forEach((r: any) => {
    if (result[r.patient_id]) {
      if (r.question_id && !HIDDEN_QUESTION_IDS.includes(r.question_id) && r.answer !== '') {
        result[r.patient_id].interviewCount++;
      }
    }
  });

  (reports || []).forEach((r: any) => {
    if (result[r.patient_id]) {
      result[r.patient_id].reportGenerated++;
      if (r.status === 'approved') result[r.patient_id].reportApproved++;
    }
  });
  (studies || []).forEach((r: any) => { if (result[r.patient_id]) result[r.patient_id].studyCount++; });
  return result;
}

// Deletes all biomarkers for a study — used by undo-merge to restore original state
export async function deleteBiomarkersForStudy(studyId: string): Promise<void> {
  await supabase.from('biomarkers').delete().eq('study_id', studyId);
}

// ─── Module 6 (Comparative Charts) — stored in Supabase database ─────────────
// The report_modules table has a check constraint allowing only module_num 1-5.
// We store comparative chart GROUPS in the patients table under comparative_groups JSONB column.
// Each "Agregar al reporte" call saves a new independent comparison group.

export interface ComparativeGroup {
  id: string;
  markers: string[];
  createdAt: string;
}

export async function getComparativeGroups(patientId: string): Promise<ComparativeGroup[]> {
  const patient = await getPatientById(patientId);
  return patient?.comparative_groups ?? [];
}

export async function saveComparativeGroup(patientId: string, markers: string[]): Promise<void> {
  const patient = await getPatientById(patientId);
  if (!patient) return;
  const existing = patient.comparative_groups ?? [];
  const newGroup: ComparativeGroup = {
    id: Date.now().toString(),
    markers,
    createdAt: new Date().toISOString(),
  };
  await updatePatient(patientId, {
    comparative_groups: [...existing, newGroup]
  });
}

export async function removeComparativeGroup(patientId: string, groupId: string): Promise<void> {
  const patient = await getPatientById(patientId);
  if (!patient) return;
  const existing = patient.comparative_groups ?? [];
  await updatePatient(patientId, {
    comparative_groups: existing.filter(g => g.id !== groupId)
  });
}

export async function clearComparativeGroups(patientId: string): Promise<void> {
  await updatePatient(patientId, {
    comparative_groups: []
  });
}

// Legacy compat shims
export const saveComparativeMarkers = saveComparativeGroup;
export async function getComparativeMarkers(patientId: string): Promise<string[]> {
  const groups = await getComparativeGroups(patientId);
  return groups.flatMap(g => g.markers);
}
export const clearComparativeMarkers = clearComparativeGroups;
