import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pacientes/[id]/documents/recover
//
// Recovers orphaned documents — those whose study_id points to a study that
// has since been deleted (e.g. after a merge where docs were not re-linked).
//
// Matching priority (highest confidence first):
//   1. EXACT filename match: doc.file_name === study.file_name
//   2. Partial name similarity: largest common token between filenames
//   3. Date match + highest biomarker count (merged study absorbs most)
//   4. Nothing matched → leave as study_id = null (unlinked, no false assign)
//
// Deliberately avoids weak heuristics (temporal proximity, "most recent study")
// that cause false assignments — better to leave a doc unlinked than link it
// to the wrong study.
// ─────────────────────────────────────────────────────────────────────────────

const getClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractDate(str: string): string | null {
  const m = (str ?? '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Tokenise a filename into lowercase words (strips extension, separators). */
function tokenise(name: string): Set<string> {
  return new Set(
    (name ?? '')
      .replace(/\.[^/.]+$/, '')           // remove extension
      .toLowerCase()
      .split(/[\s_\-.()/\\]+/)            // split on separators
      .filter(t => t.length > 2)          // skip tiny tokens
  );
}

/** Count shared tokens between two filenames. */
function sharedTokens(a: string, b: string): number {
  const ta = tokenise(a);
  const tb = tokenise(b);
  let count = 0;
  for (const t of ta) if (tb.has(t)) count++;
  return count;
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

    // ── Step 1: Load studies WITH biomarker counts (to prefer merged study) ─
    const { data: studies, error: studiesErr } = await sb
      .from('studies')
      .select('id, file_name, exam_date, created_at, biomarkers(count)')
      .eq('patient_id', patientId);

    if (studiesErr) {
      return NextResponse.json({ error: studiesErr.message }, { status: 500 });
    }

    const studyList = (studies ?? []).map((s: any) => ({
      id: s.id as string,
      file_name: (s.file_name ?? '') as string,
      exam_date: (s.exam_date ?? '') as string,
      created_at: (s.created_at ?? '') as string,
      biomarkerCount: Array.isArray(s.biomarkers)
        ? s.biomarkers[0]?.count ?? 0
        : 0,
    }));

    const studyIds = new Set(studyList.map(s => s.id));

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

    // ── Step 4: Match each orphaned doc to the best study ────────────────
    let recovered = 0;
    let failed = 0;
    const recoveryLog: { file: string; linked_to: string; method: string }[] = [];

    for (const doc of orphaned) {
      const docDate = extractDate(doc.file_name ?? '');

      // ── 4a. Exact filename match ─────────────────────────────────────
      const exactMatch = studyList.find(
        s => s.file_name && s.file_name === doc.file_name
      );
      if (exactMatch) {
        doc.study_id = exactMatch.id;
        recovered++;
        recoveryLog.push({ file: doc.file_name, linked_to: exactMatch.id, method: 'exact-filename' });
        continue;
      }

      // ── 4b. Best token similarity (among studies with same date, or all) ─
      // Candidates: prefer studies sharing the same date, fallback to all
      const dateCandidates = docDate
        ? studyList.filter(
            s =>
              extractDate(s.file_name) === docDate ||
              extractDate(s.exam_date) === docDate
          )
        : [];
      const candidates = dateCandidates.length > 0 ? dateCandidates : studyList;

      // Score each candidate: shared tokens + bonus for higher biomarker count
      // (the merged study typically has the highest count)
      let bestStudy: typeof studyList[0] | null = null;
      let bestScore = -1;

      for (const s of candidates) {
        const tokens = sharedTokens(doc.file_name ?? '', s.file_name);
        // Add a small bonus so that among equal token matches, we prefer the
        // study with more biomarkers (the merge target)
        const score = tokens + s.biomarkerCount * 0.001;
        if (score > bestScore) {
          bestScore = score;
          bestStudy = s;
        }
      }

      // Only use the match if there's at least ONE shared meaningful token
      // (avoids linking to a completely unrelated study via 0-token "match")
      if (bestStudy && bestScore >= 1) {
        doc.study_id = bestStudy.id;
        recovered++;
        recoveryLog.push({
          file: doc.file_name,
          linked_to: bestStudy.id,
          method: `tokens(${Math.floor(bestScore)})+date(${docDate ?? 'none'})`,
        });
        continue;
      }

      // ── 4c. Date match alone (if only one study for that date) ────────
      if (dateCandidates.length === 1) {
        doc.study_id = dateCandidates[0].id;
        recovered++;
        recoveryLog.push({ file: doc.file_name, linked_to: dateCandidates[0].id, method: `date-unique:${docDate}` });
        continue;
      }

      // ── 4d. No confident match → leave unlinked ──────────────────────
      // Better to show no eye icon than to show the WRONG PDF.
      doc.study_id = null;
      failed++;
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
        ? `✅ ${recovered} documento${recovered > 1 ? 's' : ''} recuperado${recovered > 1 ? 's' : ''}.${failed > 0 ? ` ${failed} sin coincidencia segura (se dejan sin vincular).` : ''}`
        : `No se encontraron coincidencias seguras para ${failed} documento${failed > 1 ? 's' : ''} huérfano${failed > 1 ? 's' : ''}.`,
    });
  } catch (err: any) {
    console.error('Error POST recover documents:', err);
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
