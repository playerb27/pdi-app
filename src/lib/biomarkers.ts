/**
 * Shared biomarker utilities — used by EvolutionCharts and patient profile page.
 * Keeps ID generation consistent so search results can scroll to the right element.
 */

// ─── Canonical alias map ───────────────────────────────────────────────────────
// Each entry: [pattern, canonical name] — empty canonical = suffix stripper
const CANONICAL_ALIASES: [RegExp, string][] = [
  // Vitamina D variants
  [/vitamina\s*d\s*[\(\[]?\s*25[\s-]*hidro[xq]i?\s*[\)\]]?\s*(en\s+sangre|en\s+suero|sérica|plasmática)?/i, 'Vitamina D 25-Hidroxi'],
  [/25[\s-]*(oh|hidro[xq]i)\s*(vitamina\s*d\s*3?|d\s*3?)?/i, 'Vitamina D 25-Hidroxi'],
  [/calcifediol/i, 'Vitamina D 25-Hidroxi'],
  // HbA1c
  [/hemoglobina\s*gl[iy]cosilada/i, 'HbA1c'],
  [/hb\s*a\s*1\s*c/i, 'HbA1c'],
  [/a1c/i, 'HbA1c'],
  // Cholesterol
  [/colesterol\s*ldl\s*(calculado|directo|en\s+sangre|en\s+suero)?/i, 'Colesterol LDL'],
  [/colesterol\s*hdl\s*(en\s+sangre|en\s+suero)?/i, 'Colesterol HDL'],
  [/colesterol\s*total\s*(en\s+sangre|en\s+suero)?/i, 'Colesterol Total'],
  // Creatinine
  [/creatinina\s*(en\s+sangre|sérica|en\s+suero)?/i, 'Creatinina'],
  // Urea / BUN
  [/urea\s*(en\s+sangre|nitrógeno|bun)?/i, 'Urea'],
  [/nitrógeno\s*ur[ée]ico\s*(en\s+sangre)?/i, 'Urea'],
  // Glucose
  [/glucosa\s*(en\s+sangre|en\s+suero|sérica)?/i, 'Glucosa'],
  // TSH
  [/tsh\s*(ultrasensible|hs|alta\s*sensibilidad)?/i, 'TSH'],
  // Vitamina B12
  [/vitamina\s*b\s*12\s*(en\s+sangre|sérica)?/i, 'Vitamina B12'],
  // Ferritin
  [/ferritina\s*(en\s+sangre|sérica)?/i, 'Ferritina'],
  // Iron
  [/hierro\s*(sérico|en\s+sangre|total)?/i, 'Hierro'],
  // Generic suffix strippers (empty canonical)
  [/\s+(en\s+sangre|en\s+suero|en\s+plasma|séric[oa]|plasmátic[oa])\s*$/i, ''],
];

export function normalizeBiomarkerName(raw: string): string {
  const trimmed = raw.trim();
  for (const [pattern, canonical] of CANONICAL_ALIASES) {
    if (canonical !== '' && pattern.test(trimmed)) return canonical;
  }
  // Apply suffix-stripping passes
  let result = trimmed;
  for (const [pattern, replacement] of CANONICAL_ALIASES) {
    if (replacement === '') result = result.replace(pattern, '').trim();
  }
  return result || trimmed;
}

/** Converts any biomarker name into a DOM-safe ID fragment (no spaces or special chars). */
export function biomarkerSafeId(name: string): string {
  return normalizeBiomarkerName(name)
    .replace(/[^\w\s-]/g, '')   // remove parens, accented chars, etc.
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
