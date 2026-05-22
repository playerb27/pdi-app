/**
 * biomarker-overrides.ts
 *
 * Sistema de overrides para valores editados manualmente.
 * Cuando el usuario edita un valor, se guarda en localStorage
 * además de la DB. Al cargar la página, los overrides se aplican
 * DESPUÉS del dedup, garantizando que siempre se muestre el valor editado.
 */

const STORAGE_KEY = 'pdi_biomarker_overrides_v1';

export interface BiomarkerOverride {
  patientId: string;
  studyId: string;
  biomarkerId: string;
  canonicalName: string;
  studyDate: string; // YYYY-MM-DD
  value: string;
  numValue: number;
  flag: string;
  savedAt: string;
}

function readAll(): BiomarkerOverride[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeAll(overrides: BiomarkerOverride[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** Save or update an override for a biomarker edit */
export function saveOverride(override: Omit<BiomarkerOverride, 'savedAt'>) {
  const all = readAll();
  // Remove any existing override for the same biomarkerId OR same patient+date+name
  const filtered = all.filter(o =>
    o.biomarkerId !== override.biomarkerId &&
    !(o.patientId === override.patientId &&
      o.studyDate === override.studyDate &&
      o.canonicalName === override.canonicalName)
  );
  filtered.push({ ...override, savedAt: new Date().toISOString() });
  writeAll(filtered);
}

/** Get all overrides for a patient */
export function getOverridesForPatient(patientId: string): BiomarkerOverride[] {
  return readAll().filter(o => o.patientId === patientId);
}

/** Remove override when a value is reset/deleted */
export function removeOverride(biomarkerId: string) {
  writeAll(readAll().filter(o => o.biomarkerId !== biomarkerId));
}

/**
 * Apply overrides to a record of chart series.
 * For each override that matches a series name + study date, replace the point's value.
 * This runs AFTER dedup, so it always wins regardless of what the dedup picked.
 */
export function applyOverridesToSeriesMap<T extends { name: string; unit: string; referenceRange?: string; points: any[] }>(
  seriesMap: Record<string, T>,
  patientId: string
): Record<string, T> {
  const overrides = getOverridesForPatient(patientId);
  if (overrides.length === 0) return seriesMap;

  const result: Record<string, T> = {};
  for (const [key, series] of Object.entries(seriesMap)) {
    const newPoints = series.points.map(pt => {
      const ptDate = pt.date ? pt.date.slice(0, 10) : '';
      const override = overrides.find(o =>
        o.canonicalName === series.name && o.studyDate === ptDate
      );
      if (!override) return pt;
      return {
        ...pt,
        value: override.numValue,
        flag: override.flag,
        isEdited: true,
        biomarkerId: override.biomarkerId,
        originalValue: pt.originalValue ?? String(pt.value),
      };
    });
    result[key] = { ...series, points: newPoints } as T;
  }
  return result;
}
