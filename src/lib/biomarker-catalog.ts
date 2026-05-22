/**
 * PDI Biomarker Catalog — fuente de verdad canónica
 * Cada entrada define nombre, unidad, rangos de referencia y sistema.
 * La tabla maestra usa este catálogo para filas fijas y coloreado.
 */

export interface CatalogEntry {
  name: string;          // nombre canónico exacto (debe coincidir con normalizeBiomarkerName)
  unit: string;
  refMin: number | null; // null = sin límite inferior
  refMax: number | null; // null = sin límite superior
  system: string;
  description?: string;
}

export const BIOMARKER_CATALOG: CatalogEntry[] = [
  // ── SISTEMA METABÓLICO Y ENERGÉTICO ───────────────────────────────────────────
  { name: 'Glucosa',                     unit: 'mg/dL',        refMin: 55,    refMax: 99,   system: 'Sistema Metabólico y Energético' },
  { name: 'HbA1c',                       unit: '%',            refMin: 4,     refMax: 5.7,  system: 'Sistema Metabólico y Energético' },
  { name: 'Insulina',                    unit: 'µUI/mL',       refMin: 2.6,   refMax: 24.9, system: 'Sistema Metabólico y Energético' },
  { name: 'HOMA-IR',                     unit: 'índice',       refMin: null,  refMax: 2.7,  system: 'Sistema Metabólico y Energético' },
  { name: 'Péptido C',                   unit: 'ng/mL',        refMin: 0.8,   refMax: 3.1,  system: 'Sistema Metabólico y Energético' },
  { name: 'Vitamina D 25-Hidroxi',      unit: 'ng/mL',        refMin: 30,    refMax: 100,  system: 'Sistema Metabólico y Energético' },

  // ── SISTEMAS RENAL, RESPIRATORIO Y OSTEOMUSCULAR ──────────────────────────────
  { name: 'Urea',                        unit: 'mg/dL',        refMin: 16.6,  refMax: 48.5, system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'BUN',                         unit: 'mg/dL',        refMin: 6,     refMax: 20,   system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Creatinina',                  unit: 'mg/dL',        refMin: 0.7,   refMax: 1.2,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Relación BUN/Creatinina',     unit: 'índice',       refMin: 13,    refMax: 17,   system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Filtración Glomerular',       unit: 'mL/min/1.73m²',refMin: 90,   refMax: null, system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Cistatina C',                 unit: 'mg/L',         refMin: 0.62,  refMax: 1.11, system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'TFG por Cistatina C',         unit: 'mL/min/1.73m²',refMin: 90,   refMax: null, system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Microalbuminuria',            unit: 'mg/g',         refMin: null,  refMax: 30,   system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Ácido Úrico',                 unit: 'mg/dL',        refMin: 3.4,   refMax: 7.0,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Fósforo',                     unit: 'mg/dL',        refMin: 2.5,   refMax: 4.5,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Calcio Total',                unit: 'mg/dL',        refMin: 8.6,   refMax: 10.0, system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Calcio Iónico',               unit: 'mmol/L',       refMin: 1.18,  refMax: 1.32, system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Magnesio',                    unit: 'mg/dL',        refMin: 1.6,   refMax: 2.6,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Sodio',                       unit: 'mEq/L',        refMin: 136,   refMax: 145,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Potasio',                     unit: 'mEq/L',        refMin: 3.5,   refMax: 5.1,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },
  { name: 'Cloro',                       unit: 'mEq/L',        refMin: 98,    refMax: 107,  system: 'Sistemas Renal, Respiratorio y Osteomuscular' },

  // ── SALUD CARDIOVASCULAR Y CIRCULATORIA ───────────────────────────────────────
  { name: 'Colesterol Total',            unit: 'mg/dL',        refMin: null,  refMax: 200,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Colesterol HDL',              unit: 'mg/dL',        refMin: 40,    refMax: 60,   system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Colesterol LDL',              unit: 'mg/dL',        refMin: null,  refMax: 100,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Triglicéridos',               unit: 'mg/dL',        refMin: null,  refMax: 150,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Colesterol VLDL',             unit: 'mg/dL',        refMin: null,  refMax: 35,   system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Colesterol No-HDL',           unit: 'mg/dL',        refMin: null,  refMax: 130,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Índice Aterogénico',          unit: 'índice',       refMin: null,  refMax: 4.5,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Relación LDL/HDL',            unit: 'índice',       refMin: null,  refMax: 3.0,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'sd LDL (pequeñas densas)',    unit: 'mg/dL',        refMin: null,  refMax: 1.38, system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Lípidos Totales',             unit: 'mg/dL',        refMin: 380,   refMax: 748,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Fosfolípidos',                unit: 'mg/dL',        refMin: 125,   refMax: 275,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'PCR Ultrasensible',           unit: 'mg/L',         refMin: null,  refMax: 1.0,  system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Homocisteína',                unit: 'µmol/L',       refMin: 5,     refMax: 15,   system: 'Salud Cardiovascular y Circulatoria' },
  { name: 'Fibrinógeno',                 unit: 'mg/dL',        refMin: 200,   refMax: 400,  system: 'Salud Cardiovascular y Circulatoria' },

  // ── DESINTOXICACIÓN Y ESTRÉS OXIDATIVO ─────────────────────────────────────────
  { name: 'Bilirrubina Total',          unit: 'mg/dL',        refMin: 0.1,   refMax: 1.2,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Bilirrubina Directa',        unit: 'mg/dL',        refMin: 0.09,  refMax: 0.3,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Bilirrubina Indirecta',      unit: 'mg/dL',        refMin: null,  refMax: 0.9,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'ALT (TGP)',                  unit: 'U/L',          refMin: null,  refMax: 41,   system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'AST (TGO)',                  unit: 'U/L',          refMin: null,  refMax: 40,   system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'GGT',                        unit: 'U/L',          refMin: null,  refMax: 61,   system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Fosfatasa Alcalina',         unit: 'U/L',          refMin: 40,    refMax: 150,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Proteínas Totales',          unit: 'g/dL',         refMin: 6.4,   refMax: 8.3,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Albúmina',                   unit: 'g/dL',         refMin: 3.5,   refMax: 5.0,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Globulinas',                 unit: 'g/dL',         refMin: 2.0,   refMax: 3.5,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Relación Albúmina/Globulina', unit: 'índice',       refMin: 1.1,   refMax: 2.5,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'LDH',                        unit: 'U/L',          refMin: 140,   refMax: 280,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Vitamina A',                 unit: 'µg/dL',        refMin: 30,    refMax: 80,   system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Vitamina E',                 unit: 'mg/L',         refMin: 5.0,   refMax: 20,   system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Vitamina C',                 unit: 'mg/dL',        refMin: 0.4,   refMax: 2.0,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Zinc',                       unit: 'µg/dL',        refMin: 60,    refMax: 120,  system: 'Desintoxicación y Estrés Oxidativo' },
  { name: 'Cobre',                      unit: 'µg/dL',        refMin: 70,    refMax: 140,  system: 'Desintoxicación y Estrés Oxidativo' },

  // ── SISTEMA INMUNE E INFLAMACIÓN ─────────────────────────────────────────────
  { name: 'Hemoglobina',                unit: 'g/dL',         refMin: 13.5,  refMax: 17.5, system: 'Sistema Inmune e Inflamación' },
  { name: 'Hematocrito',                unit: '%',            refMin: 41,    refMax: 53,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Eritrocitos (RBC)',          unit: 'x10⁶/µL',      refMin: 4.5,   refMax: 6.0,  system: 'Sistema Inmune e Inflamación' },
  { name: 'VCM',                        unit: 'fL',           refMin: 80,    refMax: 100,  system: 'Sistema Inmune e Inflamación' },
  { name: 'HCM',                        unit: 'pg',           refMin: 27,    refMax: 33,   system: 'Sistema Inmune e Inflamación' },
  { name: 'CHCM',                       unit: 'g/dL',         refMin: 32,    refMax: 36,   system: 'Sistema Inmune e Inflamación' },
  { name: 'RDW',                        unit: '%',            refMin: null,  refMax: 14.5, system: 'Sistema Inmune e Inflamación' },
  { name: 'Leucocitos (WBC)',           unit: 'x10³/µL',      refMin: 4.5,   refMax: 11.0, system: 'Sistema Inmune e Inflamación' },
  { name: 'Neutrófilos',                unit: '%',            refMin: 45,    refMax: 70,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Linfocitos',                 unit: '%',            refMin: 20,    refMax: 45,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Monocitos',                  unit: '%',            refMin: 2,     refMax: 10,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Eosinófilos',                unit: '%',            refMin: 1,     refMax: 6,    system: 'Sistema Inmune e Inflamación' },
  { name: 'Basófilos',                  unit: '%',            refMin: 0,     refMax: 1,    system: 'Sistema Inmune e Inflamación' },
  { name: 'Plaquetas',                  unit: 'x10³/µL',      refMin: 150,   refMax: 400,  system: 'Sistema Inmune e Inflamación' },
  { name: 'Hierro',                     unit: 'µg/dL',        refMin: 33,    refMax: 193,  system: 'Sistema Inmune e Inflamación' },
  { name: 'Ferritina',                  unit: 'ng/mL',        refMin: 22,    refMax: 322,  system: 'Sistema Inmune e Inflamación' },
  { name: 'Transferrina',               unit: 'mg/dL',        refMin: 200,   refMax: 360,  system: 'Sistema Inmune e Inflamación' },
  { name: 'TIBC',                       unit: 'µg/dL',        refMin: 250,   refMax: 370,  system: 'Sistema Inmune e Inflamación' },
  { name: 'Saturación de Transferrina',  unit: '%',            refMin: 20,    refMax: 50,   system: 'Sistema Inmune e Inflamación' },
  { name: 'PCR',                        unit: 'mg/dL',        refMin: null,  refMax: 0.5,  system: 'Sistema Inmune e Inflamación' },
  { name: 'VSG',                        unit: 'mm/hr',        refMin: null,  refMax: 20,   system: 'Sistema Inmune e Inflamación' },
  { name: 'IL-6',                       unit: 'pg/mL',        refMin: null,  refMax: 7.0,  system: 'Sistema Inmune e Inflamación' },
  { name: 'Factor Reumatoide',          unit: 'UI/mL',        refMin: null,  refMax: 14,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Anti-CCP',                   unit: 'U/mL',         refMin: null,  refMax: 7,    system: 'Sistema Inmune e Inflamación' },
  { name: 'ANA',                        unit: 'título',       refMin: null,  refMax: null, system: 'Sistema Inmune e Inflamación' },
  { name: 'IgA',                        unit: 'mg/dL',        refMin: 70,    refMax: 400,  system: 'Sistema Inmune e Inflamación' },
  { name: 'IgG',                        unit: 'mg/dL',        refMin: 700,   refMax: 1600, system: 'Sistema Inmune e Inflamación' },
  { name: 'IgM',                        unit: 'mg/dL',        refMin: 40,    refMax: 230,  system: 'Sistema Inmune e Inflamación' },

  // ── SISTEMA ENDOCRINO (HORMONAL) ──────────────────────────────────────────────
  { name: 'TSH',                        unit: 'mUI/L',        refMin: 0.27,  refMax: 4.2,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'T3 Total',                   unit: 'ng/dL',        refMin: 80,    refMax: 200,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'T3 Libre (FT3)',             unit: 'pg/mL',        refMin: 2.3,   refMax: 4.2,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'T4 Total',                   unit: 'µg/dL',        refMin: 5.1,   refMax: 14.1, system: 'Sistema Endocrino (Hormonal)' },
  { name: 'T4 Libre (FT4)',             unit: 'ng/dL',        refMin: 0.93,  refMax: 1.7,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'Cortisol',                   unit: 'µg/dL',        refMin: 6.2,   refMax: 19.4, system: 'Sistema Endocrino (Hormonal)' },
  { name: 'Testosterona Total',         unit: 'ng/dL',        refMin: 240,   refMax: 950,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'Testosterona Libre',         unit: 'pg/mL',        refMin: 9,     refMax: 30,   system: 'Sistema Endocrino (Hormonal)' },
  { name: 'DHEA-S',                     unit: 'µg/dL',        refMin: 80,    refMax: 560,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'Prolactina',                 unit: 'ng/mL',        refMin: 2,     refMax: 18,   system: 'Sistema Endocrino (Hormonal)' },
  { name: 'IGF-1',                      unit: 'ng/mL',        refMin: 115,   refMax: 307,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'Hormona del Crecimiento (GH)', unit: 'ng/mL',       refMin: null,  refMax: 3.0,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'PTH (Parathormona)',         unit: 'pg/mL',        refMin: 15,    refMax: 65,   system: 'Sistema Endocrino (Hormonal)' },

  // ── SALUD NEUROLÓGICA Y COGNITIVA ─────────────────────────────────────────────
  { name: 'Vitamina B12',               unit: 'pg/mL',        refMin: 200,   refMax: 900,  system: 'Salud Neurológica y Cognitiva' },
  { name: 'Ácido Fólico',               unit: 'ng/mL',        refMin: 4.0,   refMax: 20,   system: 'Salud Neurológica y Cognitiva' },
  { name: 'Vitamina B6',                unit: 'µg/L',         refMin: 5,     refMax: 50,   system: 'Salud Neurológica y Cognitiva' },
];

/** Todos los sistemas únicos en orden */
export const CATALOG_SYSTEMS = [...new Set(BIOMARKER_CATALOG.map(e => e.system))];

/** Lookup rápido por nombre canónico */
export const CATALOG_BY_NAME = Object.fromEntries(
  BIOMARKER_CATALOG.map(e => [e.name.toLowerCase(), e])
);

/** Obtiene la entrada del catálogo más cercana a un nombre dado */
export function getCatalogEntry(canonicalName: string): CatalogEntry | null {
  return CATALOG_BY_NAME[canonicalName.toLowerCase()] ?? null;
}

/**
 * Determina el flag correcto comparando el valor contra el catálogo.
 * Más confiable que el flag devuelto por la IA.
 */
export function computeFlag(canonicalName: string, value: number): 'Normal' | 'Alto' | 'Bajo' {
  const entry = getCatalogEntry(canonicalName);
  if (!entry) return 'Normal';
  if (entry.refMax !== null && value > entry.refMax) return 'Alto';
  if (entry.refMin !== null && value < entry.refMin) return 'Bajo';
  return 'Normal';
}
