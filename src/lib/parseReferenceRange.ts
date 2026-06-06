/**
 * Centralized reference range parser for the PDI app.
 *
 * Handles all formats the AI or doctor might produce:
 *   "5.0 - 10.0"   → { min: 5, max: 10 }
 *   "5,0 - 10,0"   → { min: 5, max: 10 }   (Latin American commas)
 *   "5.0-10.0"     → { min: 5, max: 10 }   (no spaces)
 *   "0.5–1.5"      → { min: 0.5, max: 1.5 } (en-dash)
 *   "< 10"         → { min: null, max: 10 }
 *   "≤ 10"         → { min: null, max: 10 }
 *   "> 5"          → { min: 5, max: null }
 *   "≥ 5"          → { min: 5, max: null }
 *   "10"           → { min: null, max: 10 } (single value = upper bound)
 *   null / ""      → { min: null, max: null }
 *
 * Always returns numbers (not strings). Comma decimals are normalized.
 */
export function parseReferenceRange(ref?: string | null): { min: number | null; max: number | null } {
  if (!ref || !ref.trim()) return { min: null, max: null };

  // Normalize: replace comma-decimals (5,0) with dot-decimals (5.0)
  // We detect comma-as-decimal by: digit,digit (e.g. "5,0") vs digit, digit (e.g. "5, 10")
  const normalized = ref.replace(/(\d),(\d)/g, '$1.$2');

  // Number token: integer or decimal
  const NUM = '[\\d]+(?:\\.[\\d]+)?';

  // Range: 5 - 10, 5–10, 5-10
  const rangeRe = new RegExp(`(${NUM})\\s*[-\u2013\u2014]\\s*(${NUM})`);
  const rangeMatch = normalized.match(rangeRe);
  if (rangeMatch) {
    return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
  }

  // Less than / at most: < 10, ≤ 10, <= 10
  const ltRe = new RegExp(`[<\u2264]\\s*=?\\s*(${NUM})`);
  const ltMatch = normalized.match(ltRe);
  if (ltMatch) return { min: null, max: parseFloat(ltMatch[1]) };

  // Greater than / at least: > 5, ≥ 5, >= 5
  const gtRe = new RegExp(`[>\u2265]\\s*=?\\s*(${NUM})`);
  const gtMatch = normalized.match(gtRe);
  if (gtMatch) return { min: parseFloat(gtMatch[1]), max: null };

  // Single number (treat as upper bound, e.g. "PSA: 4")
  const singleRe = new RegExp(`^\\s*(${NUM})\\s*$`);
  const singleMatch = normalized.match(singleRe);
  if (singleMatch) return { min: null, max: parseFloat(singleMatch[1]) };

  return { min: null, max: null };
}

/**
 * Compute the clinical flag (Alto/Bajo/Normal) for a numeric value
 * given a reference range string from the DB or catalog.
 * Returns null if the range string is unparseable (caller decides fallback).
 */
export function computeFlagFromRange(
  value: number,
  referenceRange: string | null | undefined,
): 'Normal' | 'Alto' | 'Bajo' | null {
  const { min, max } = parseReferenceRange(referenceRange);
  if (min === null && max === null) return null;
  if (max !== null && value > max) return 'Alto';
  if (min !== null && value < min) return 'Bajo';
  return 'Normal';
}
