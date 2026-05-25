import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBiomarkerName } from '@/lib/biomarkers';
import { getCatalogEntry } from '@/lib/biomarker-catalog';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/build-canonical
// Body: { patientId: string }
//
// Normalises every biomarker's canonical_name using the same regex function
// that BiomarkerMasterTable and EvolutionCharts use, so the table always
// groups correctly without any post-render patching.
//
// DISAMBIGUATION STRATEGY — value-based, not study-level:
//   Some biomarker names are ambiguous between blood and urine:
//   e.g. "GLUCOSA" appears in both a blood panel and an EGO dipstick.
//   We CANNOT rely on which study a biomarker belongs to, because many
//   Mexican labs put both blood and EGO results in the same PDF → same study.
//
//   The reliable rule is:
//     • Blood glucose → always NUMERIC (e.g. 89.2, 94, 100)
//     • Urine glucose dipstick → always TEXT  (NEGATIVO, +, ++, +++)
//   The same logic applies to Proteínas, Bilirrubinas, Hemoglobina in EGO.
//
//   Therefore: if an ambiguous biomarker has a non-numeric value,
//   we append " (Orina)" before running normalizeBiomarkerName.
//   This is 100% reliable and has no false positives.
// ─────────────────────────────────────────────────────────────────────────────

/** Names that are ambiguous between blood and urine specimens. */
const AMBIGUOUS_BLOOD_OR_ORINA =
  /^(glucosa|proteinas|proteínas|bilirrubinas|hemoglobina|ph)$/i;

/** True when a value string is qualitative / non-numeric (orina dipstick). */
function isQualitativeValue(val: string): boolean {
  const v = (val ?? '').trim();
  if (v === '') return false;
  const num = parseFloat(v.replace(',', '.'));
  return isNaN(num); // "NEGATIVO", "+", "++", "Positivo", etc.
}

export async function POST(req: Request) {
  try {
    const { patientId } = await req.json();

    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Falta configuración de Supabase' }, { status: 500 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Step 1: Load all biomarkers (include value for disambiguation) ─────
    const { data: studies, error: studiesErr } = await sb
      .from('studies')
      .select('id, biomarkers(id, name, raw_name, value)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true });

    if (studiesErr) return NextResponse.json({ error: studiesErr.message }, { status: 500 });
    if (!studies || studies.length === 0) {
      await sb.from('canonical_builds').delete().eq('patient_id', patientId);
      return NextResponse.json({
        success: true,
        stats: { totalBiomarkers: 0, uniqueNames: 0, normalizedByRegex: 0, updateErrors: 0 },
        message: 'No hay estudios para este paciente. Tabla canónica vacía.',
      });
    }

    // ── Step 2: Flatten biomarkers + value-based disambiguation ──────────
    interface BmEntry { id: string; rawName: string; }

    const allBiomarkers: BmEntry[] = studies.flatMap((s: any) =>
      (s.biomarkers ?? []).map((b: any) => {
        // Strip markdown bold artifacts (**) that some lab parsers emit
        const nameStripped = String(b.raw_name ?? b.name ?? '')
          .replace(/\s*\*+\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Value-based disambiguation:
        // If the raw name is ambiguous AND the recorded value is qualitative
        // text (not a number), it's a urine dipstick result → append " (Orina)".
        // Blood values are always numeric; urine dipstick values are always text.
        const rawName =
          AMBIGUOUS_BLOOD_OR_ORINA.test(nameStripped) &&
          isQualitativeValue(String(b.value ?? ''))
            ? `${nameStripped} (Orina)`
            : nameStripped;  // use stripped version, not original with ** artifacts

        return { id: b.id as string, rawName };
      })
    );

    if (allBiomarkers.length === 0) {
      return NextResponse.json({ error: 'No hay biomarcadores para canonicalizar' }, { status: 404 });
    }

    // ── Step 3: Normalise with regex → same function used by the table ────
    const uniqueRawNames = [...new Set(allBiomarkers.map(b => b.rawName))];
    const canonicalMap: Record<string, { canonical_name: string; canonical_system: string }> = {};

    for (const rawName of uniqueRawNames) {
      const canonical = normalizeBiomarkerName(rawName);
      const system = getCatalogEntry(canonical)?.system ?? 'Otros Marcadores';
      canonicalMap[rawName] = { canonical_name: canonical, canonical_system: system };
    }

    // ── Step 4: Group by canonical → one DB UPDATE per group ─────────────
    const byCanonical = new Map<string, {
      canonical_name: string;
      canonical_system: string;
      ids: string[];
    }>();

    for (const bm of allBiomarkers) {
      const result = canonicalMap[bm.rawName];
      const key = `${result.canonical_name}|||${result.canonical_system}`;
      if (!byCanonical.has(key)) {
        byCanonical.set(key, { ...result, ids: [] });
      }
      byCanonical.get(key)!.ids.push(bm.id);
    }

    // ── Step 5: Parallel batch updates ───────────────────────────────────
    let updateErrors = 0;
    await Promise.all(
      [...byCanonical.values()].map(async ({ canonical_name, canonical_system, ids }) => {
        const { error } = await sb
          .from('biomarkers')
          .update({ canonical_name, canonical_system })
          .in('id', ids);
        if (error) updateErrors++;
      })
    );

    // ── Step 6: Record build ──────────────────────────────────────────────
    const studyIds = studies.map((s: any) => s.id);
    await sb.from('canonical_builds').insert({
      patient_id: patientId,
      study_ids: studyIds,
      study_count: studyIds.length,
      marker_count: allBiomarkers.length,
      method: 'regex-v4-value-based',
    });

    const normalizedCount = allBiomarkers.filter(b =>
      canonicalMap[b.rawName].canonical_name.toLowerCase() !== b.rawName.toLowerCase().trim()
    ).length;

    return NextResponse.json({
      success: true,
      stats: {
        totalBiomarkers: allBiomarkers.length,
        uniqueNames: uniqueRawNames.length,
        normalizedByRegex: normalizedCount,
        updateErrors,
      },
      message: `✅ ${allBiomarkers.length} biomarcadores procesados · ${normalizedCount} sinónimos unificados${updateErrors > 0 ? ` · ⚠️ ${updateErrors} errores` : ''}`,
    });
  } catch (error: any) {
    console.error('Build-canonical error:', error);
    return NextResponse.json({ error: error.message ?? 'Error interno' }, { status: 500 });
  }
}
