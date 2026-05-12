/**
 * Shared biomarker utilities — used by EvolutionCharts and patient profile page.
 * Keeps ID generation consistent so search results can scroll to the right element.
 */

// ─── Canonical alias map ───────────────────────────────────────────────────────
// Each entry: [pattern, canonical name] — empty canonical = suffix stripper
const CANONICAL_ALIASES: [RegExp, string][] = [
  // ── TSH (many lab variants) ──────────────────────────────────────────────────
  [/tsh\s*(ultrasensible|hs|alta\s*sensibilidad|3\s*a\s*generación)?/i, 'TSH'],
  [/hormona\s*estimulante\s*(de\s*la\s*)?tiroides?\s*(\(tsh\))?\s*(en\s+sangre|en\s+suero)?/i, 'TSH'],
  [/tirotropina\s*(en\s+sangre|sérica)?/i, 'TSH'],
  [/thyroid\s*stimulating\s*hormone/i, 'TSH'],

  // ── T3 Total ─────────────────────────────────────────────────────────────────
  [/triyodotironina\s*(t3\s*total|total)?\s*(en\s+sangre|en\s+suero|sérica)?/i, 'T3 Total'],
  [/t3\s*total\s*(en\s+sangre)?/i, 'T3 Total'],

  // ── T3 Libre (FT3) ───────────────────────────────────────────────────────────
  [/triyodotironina\s*libre\s*(\(ft3\)|\(t3l\))?\s*(en\s+sangre)?/i, 'T3 Libre (FT3)'],
  [/ft3\s*(en\s+sangre)?/i, 'T3 Libre (FT3)'],
  [/t3\s*libre\s*(en\s+sangre)?/i, 'T3 Libre (FT3)'],

  // ── T4 Total ─────────────────────────────────────────────────────────────────
  [/tiroxina\s*(t4\s*total|total)?\s*\*{0,2}\s*(en\s+sangre|en\s+suero)?/i, 'T4 Total'],
  [/t4\s*total\s*(en\s+sangre)?/i, 'T4 Total'],

  // ── T4 Libre (FT4) ───────────────────────────────────────────────────────────
  [/tiroxina\s*libre\s*(\(ft4\)|\(t4l\))?\s*\*{0,2}\s*(en\s+sangre)?/i, 'T4 Libre (FT4)'],
  [/ft4\s*(en\s+sangre)?/i, 'T4 Libre (FT4)'],
  [/t4\s*libre\s*(en\s+sangre)?/i, 'T4 Libre (FT4)'],
  [/thyroxine\s*free/i, 'T4 Libre (FT4)'],

  // ── Vitamina D ───────────────────────────────────────────────────────────────
  [/vitamina\s*d\s*[\(\[]?\s*25[\s-]*hidro[xq]i?\s*[\)\]]?\s*(en\s+sangre|en\s+suero|sérica|plasmática)?/i, 'Vitamina D 25-Hidroxi'],
  [/25[\s-]*(oh|hidro[xq]i)\s*(vitamina\s*d\s*3?|d\s*3?)?/i, 'Vitamina D 25-Hidroxi'],
  [/calcifediol/i, 'Vitamina D 25-Hidroxi'],
  [/vitamina\s*d\s*(en\s+sangre|sérica)?\s*$/i, 'Vitamina D 25-Hidroxi'],

  // ── HbA1c ────────────────────────────────────────────────────────────────────
  [/hemoglobina\s*gl[iy]cosilada/i, 'HbA1c'],
  [/hb\s*a\s*1\s*c/i, 'HbA1c'],
  [/a1c/i, 'HbA1c'],

  // ── Colesterol ───────────────────────────────────────────────────────────────
  [/colesterol\s*ldl\s*(calculado|directo|en\s+sangre|en\s+suero|de\s+baja\s+densidad)?/i, 'Colesterol LDL'],
  [/ldl\s*colesterol/i, 'Colesterol LDL'],
  [/colesterol\s*hdl\s*(en\s+sangre|en\s+suero|de\s+alta\s+densidad)?/i, 'Colesterol HDL'],
  [/hdl\s*colesterol/i, 'Colesterol HDL'],
  [/colesterol\s*total\s*(en\s+sangre|en\s+suero)?/i, 'Colesterol Total'],
  [/colesterol\s*vldl\s*(en\s+sangre)?/i, 'Colesterol VLDL'],
  [/colesterol\s*de\s*muy\s*baja\s*densidad/i, 'Colesterol VLDL'],

  // ── Creatinina ───────────────────────────────────────────────────────────────
  [/creatinina\s*(en\s+sangre|sérica|en\s+suero)?/i, 'Creatinina'],

  // ── Urea / BUN ───────────────────────────────────────────────────────────────
  [/urea\s*(en\s+sangre|nitrógeno|bun)?/i, 'Urea'],
  [/nitrógeno\s*ur[ée]ico\s*(en\s+sangre)?/i, 'Urea'],

  // ── Glucosa ──────────────────────────────────────────────────────────────────
  [/glucosa\s*(en\s+sangre|en\s+suero|sérica|basal)?/i, 'Glucosa'],

  // ── Insulina ─────────────────────────────────────────────────────────────────
  [/insulina\s*(basal|en\s+ayuno|en\s+sangre|sérica)?/i, 'Insulina'],

  // ── Vitamina B12 ─────────────────────────────────────────────────────────────
  [/vitamina\s*b\s*12\s*(en\s+sangre|sérica)?/i, 'Vitamina B12'],
  [/cobalamina/i, 'Vitamina B12'],

  // ── Ferritina ────────────────────────────────────────────────────────────────
  [/ferritina\s*(en\s+sangre|sérica)?/i, 'Ferritina'],

  // ── Hierro ───────────────────────────────────────────────────────────────────
  [/hierro\s*(sérico|en\s+sangre|total)?/i, 'Hierro'],

  // ── Cortisol ─────────────────────────────────────────────────────────────────
  [/cortisol\s*(matutino|basal|am|8[:\s]?am|en\s+sangre|sérico)?/i, 'Cortisol'],

  // ── Generic suffix strippers (empty canonical → applied after specific rules)
  [/\s+(en\s+sangre|en\s+suero|en\s+plasma|séric[oa]|plasmátic[oa])\s*$/i, ''],
  [/\s*\*{1,2}\s*$/i, ''],  // trailing asterisks
];

export function normalizeBiomarkerName(raw: string): string {
  const trimmed = raw.trim();
  // Check specific canonical aliases first (those with non-empty canonical)
  for (const [pattern, canonical] of CANONICAL_ALIASES) {
    if (canonical !== '' && pattern.test(trimmed)) return canonical;
  }
  // Apply suffix-stripping passes (empty canonical replacements)
  let result = trimmed;
  for (const [pattern, replacement] of CANONICAL_ALIASES) {
    if (replacement === '') result = result.replace(pattern, '').trim();
  }
  return result || trimmed;
}

/** Converts any biomarker name into a DOM-safe ID fragment (no spaces or special chars). */
export function biomarkerSafeId(name: string): string {
  return normalizeBiomarkerName(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^\w\s-]/g, '')   // remove parens and special chars
    .replace(/\s+/g, '-')       // spaces → dashes
    .replace(/-+/g, '-')        // collapse multiple dashes
    .replace(/^-|-$/g, '');     // trim leading/trailing dashes
}

export function studyBiomarkerElementId(studyId: string, bmName: string): string {
  return `bm-study-${studyId}-${biomarkerSafeId(bmName)}`;
}

export function chartBiomarkerElementId(bmName: string): string {
  return `bm-chart-${biomarkerSafeId(bmName)}`;
}
