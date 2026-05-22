import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBiomarkerName } from '@/lib/biomarkers';
import { getCatalogEntry } from '@/lib/biomarker-catalog';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/build-canonical
// Body: { patientId: string }
//
// Uses ONLY normalizeBiomarkerName (regex) — NO AI.
// AI was removed because it returned names that didn't match the internal
// catalog, causing biomarker data to appear missing from the table.
// The regex is the exact same function used by EvolutionCharts and
// BiomarkerMasterTable, so canonical_name always matches what they expect.
// ─────────────────────────────────────────────────────────────────────────────
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

    // ── Step 1: Load all biomarkers ───────────────────────────────────────
    const { data: studies, error: studiesErr } = await sb
      .from('studies')
      .select('id, biomarkers(id, name, raw_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true });

    if (studiesErr) return NextResponse.json({ error: studiesErr.message }, { status: 500 });
    if (!studies || studies.length === 0) {
      // Clean up canonical builds for this patient
      await sb.from('canonical_builds').delete().eq('patient_id', patientId);
      return NextResponse.json({
        success: true,
        stats: {
          totalBiomarkers: 0,
          uniqueNames: 0,
          normalizedByRegex: 0,
          updateErrors: 0,
        },
        message: 'No hay estudios para este paciente. Tabla canónica vacía.',
      });
    }

    const allBiomarkers = studies.flatMap((s: any) =>
      (s.biomarkers ?? []).map((b: any) => ({
        id: b.id as string,
        rawName: (b.raw_name ?? b.name) as string,
      }))
    );

    if (allBiomarkers.length === 0) {
      return NextResponse.json({ error: 'No hay biomarcadores para canonicalizar' }, { status: 404 });
    }

    // ── Step 2: Normalize with regex only ────────────────────────────────
    // normalizeBiomarkerName() = same function as EvolutionCharts & BiomarkerMasterTable
    // → canonical_name will always match what those components expect
    // → data can never "disappear"
    const uniqueRawNames = [...new Set(allBiomarkers.map(b => b.rawName))];
    const canonicalMap: Record<string, { canonical_name: string; canonical_system: string }> = {};

    for (const rawName of uniqueRawNames) {
      const canonical = normalizeBiomarkerName(rawName);
      const system = getCatalogEntry(canonical)?.system ?? 'Otros Marcadores';
      canonicalMap[rawName] = { canonical_name: canonical, canonical_system: system };
    }

    // ── Step 3: Group by canonical result → 1 DB call per group ─────────
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

    // ── Step 4: Parallel batch updates ───────────────────────────────────
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

    // ── Step 5: Record build ──────────────────────────────────────────────
    const studyIds = studies.map((s: any) => s.id);
    await sb.from('canonical_builds').insert({
      patient_id: patientId,
      study_ids: studyIds,
      study_count: studyIds.length,
      marker_count: allBiomarkers.length,
      method: 'regex-only-v3',
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
