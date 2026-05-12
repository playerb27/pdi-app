import { supabase } from './supabase';

export interface Patient {
  id: string;
  full_name: string;
  birth_date: string;
  gender: string;
  status: string;
  top_red_flags?: any;
  clinical_summary?: string;
  created_at: string;
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
  flag: string;
  system: string;
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
  const rows = biomarkers.map(b => ({
    study_id: studyId,
    name: b.name,
    value: b.value,
    unit: b.unit,
    reference_range: b.reference_range ?? (b as any).referenceRange ?? null,
    flag: b.flag,
    system: b.system,
  }));
  const { error } = await supabase.from('biomarkers').insert(rows);
  if (error) { console.error("Error inserting biomarkers:", error.message); return false; }
  return true;
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
  if (error) { console.error("Error deleting study:", error.message); return false; }
  return true;
}

export async function updateBiomarker(
  biomarkerId: string,
  updates: { value: string; flag: string; originalValue?: string }
): Promise<boolean> {
  const payload: Record<string, string | boolean> = {
    value: updates.value,
    flag: updates.flag,
    is_edited: true,
  };
  if (updates.originalValue !== undefined) payload.original_value = updates.originalValue;
  const { error } = await supabase.from('biomarkers').update(payload).eq('id', biomarkerId);
  if (error) { console.error("Error updating biomarker:", error.message); return false; }
  return true;
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
    supabase.from('interviews').select('patient_id').in('patient_id', patientIds),
    supabase.from('report_modules').select('patient_id, status').in('patient_id', patientIds),
    supabase.from('studies').select('patient_id').in('patient_id', patientIds),
  ]);
  const result: Record<string, { interviewCount: number; reportApproved: number; reportGenerated: number; studyCount: number }> = {};
  patientIds.forEach(id => { result[id] = { interviewCount: 0, reportApproved: 0, reportGenerated: 0, studyCount: 0 }; });
  (interviews || []).forEach((r: any) => { if (result[r.patient_id]) result[r.patient_id].interviewCount++; });
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
