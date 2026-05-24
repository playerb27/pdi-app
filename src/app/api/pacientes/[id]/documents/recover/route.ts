import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pacientes/[id]/documents/recover
//
// Recovers orphaned documents — those whose study_id points to a study that
// has since been deleted (e.g. after a merge where docs were not re-linked).
//
// Algorithm:
// 1. Load all current studies for the patient from the DB.
// 2. Load the patient's index.json from Storage.
// 3. Find documents whose study_id is NOT in the current study IDs list
//    (these are orphaned).
// 4. For each orphaned doc, try to find the correct study:
//    a. Extract the date (YYYY-MM-DD) from the document's file_name.
//    b. Find a study whose file_name or exam_date contains the same date.
//    c. If found → re-link by updating study_id.
//    d. If no date match → link to the study whose created_at is closest to
//       the document's uploaded_at (last resort).
// 5. Save the updated index.json.
// 6. Return a report of what was recovered.
// ─────────────────────────────────────────────────────────────────────────────

const getClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractDate(str: string): string | null {
  const m = str.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getClient();
  try {
    const { id: patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    // ── Step 1: Load all current studies ─────────────────────────────────
    const { data: studies, error: studiesErr } = await sb
      .from('studies')
      .select('id, file_name, exam_date, created_at')
      .eq('patient_id', patientId);

    if (studiesErr) {
      return NextResponse.json({ error: studiesErr.message }, { status: 500 });
    }

    const studyIds = new Set((studies ?? []).map((s: any) => s.id as string));

    // ── Step 2: Load index.json ───────────────────────────────────────────
    const { data: indexData, error: indexErr } = await sb.storage
      .from('patient-documents')
      .download(`${patientId}/index.json`);

    if (indexErr || !indexData) {
      return NextResponse.json({ recovered: 0, failed: 0, message: 'No hay documentos para este paciente.' });
    }

    let documents: any[] = [];
    try {
      documents = JSON.parse(await indexData.text());
    } catch {
      return NextResponse.json({ error: 'Índice de documentos corrupto' }, { status: 500 });
    }

    // ── Step 3: Find orphaned documents ──────────────────────────────────
    const orphaned = documents.filter(
      (d) => d.study_id && !studyIds.has(d.study_id)
    );

    if (orphaned.length === 0) {
      return NextResponse.json({
        recovered: 0,
        failed: 0,
        message: 'No hay documentos huérfanos — todos están correctamente vinculados.',
      });
    }

    // Pre-build a date→study map for fast lookup
    const studyByDate: Record<string, any> = {};
    for (const s of (studies ?? [])) {
      const d1 = extractDate(s.exam_date ?? '');
      const d2 = extractDate(s.file_name ?? '');
      const d3 = extractDate(s.created_at ?? '');
      if (d1) studyByDate[d1] = s;
      if (d2 && !studyByDate[d2]) studyByDate[d2] = s;
      if (d3 && !studyByDate[d3]) studyByDate[d3] = s;
    }

    // ── Step 4: Try to re-link each orphaned doc ──────────────────────────
    let recovered = 0;
    let failed = 0;
    const recoveryLog: { file: string; linked_to: string; method: string }[] = [];

    for (const doc of orphaned) {
      // a. Try date match from filename
      const docDate = extractDate(doc.file_name ?? '');
      const matchByDate = docDate ? studyByDate[docDate] : null;

      if (matchByDate) {
        doc.study_id = matchByDate.id;
        recovered++;
        recoveryLog.push({ file: doc.file_name, linked_to: matchByDate.id, method: `date:${docDate}` });
        continue;
      }

      // b. Try date match from uploaded_at vs study created_at (closest in time)
      if ((studies ?? []).length > 0) {
        const uploadedAt = new Date(doc.uploaded_at ?? 0).getTime();
        let closest: any = null;
        let closestDiff = Infinity;
        for (const s of (studies ?? [])) {
          const diff = Math.abs(new Date(s.created_at).getTime() - uploadedAt);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = s;
          }
        }
        if (closest && closestDiff < 7 * 24 * 60 * 60 * 1000) { // within 7 days
          doc.study_id = closest.id;
          recovered++;
          recoveryLog.push({ file: doc.file_name, linked_to: closest.id, method: 'closest-time' });
          continue;
        }
      }

      // c. Could not match — link to the most recent study as fallback
      if ((studies ?? []).length > 0) {
        const sorted = [...(studies ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        doc.study_id = sorted[0].id;
        recovered++;
        recoveryLog.push({ file: doc.file_name, linked_to: sorted[0].id, method: 'fallback-latest' });
      } else {
        doc.study_id = null; // can't do anything without studies
        failed++;
      }
    }

    // ── Step 5: Save updated index.json ──────────────────────────────────
    const { error: saveErr } = await sb.storage
      .from('patient-documents')
      .upload(
        `${patientId}/index.json`,
        Buffer.from(JSON.stringify(documents, null, 2)),
        { contentType: 'application/json', upsert: true }
      );

    if (saveErr) {
      return NextResponse.json({ error: `Error guardando índice: ${saveErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      recovered,
      failed,
      log: recoveryLog,
      message: recovered > 0
        ? `✅ ${recovered} documento${recovered > 1 ? 's' : ''} recuperado${recovered > 1 ? 's' : ''} y vinculado${recovered > 1 ? 's' : ''} a sus estudios.${failed > 0 ? ` ⚠️ ${failed} no pudieron vincularse.` : ''}`
        : `⚠️ No se pudo recuperar ningún documento.`,
    });
  } catch (err: any) {
    console.error('Error POST recover documents:', err);
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
