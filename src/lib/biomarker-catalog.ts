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
  // ── GLUCOSA Y METABOLISMO ────────────────────────────────────────────────────
  { name: 'Glucosa',                     unit: 'mg/dL',        refMin: 55,    refMax: 99,   system: 'Glucosa y Metabolismo' },
  { name: 'HbA1c',                       unit: '%',            refMin: 4,     refMax: 5.7,  system: 'Glucosa y Metabolismo' },
  { name: 'Insulina',                    unit: 'µUI/mL',       refMin: 2.6,   refMax: 24.9, system: 'Glucosa y Metabolismo' },
  { name: 'HOMA-IR',                     unit: 'índice',       refMin: null,  refMax: 2.7,  system: 'Glucosa y Metabolismo' },
  { name: 'Péptido C',                   unit: 'ng/mL',        refMin: 0.8,   refMax: 3.1,  system: 'Glucosa y Metabolismo' },

  // ── FUNCIÓN RENAL ────────────────────────────────────────────────────────────
  { name: 'Urea',                        unit: 'mg/dL',        refMin: 16.6,  refMax: 48.5, system: 'Función Renal' },
  { name: 'Nitrógeno de Urea (BUN)',     unit: 'mg/dL',        refMin: 6,     refMax: 20,   system: 'Función Renal' },
  { name: 'Creatinina',                  unit: 'mg/dL',        refMin: 0.7,   refMax: 1.2,  system: 'Función Renal' },
  { name: 'Relación BUN/Creatinina',     unit: 'índice',       refMin: 13,    refMax: 17,   system: 'Función Renal' },
  { name: 'TFG (MDRD/CKD-EPI)',          unit: 'mL/min/1.73m²',refMin: 90,   refMax: null, system: 'Función Renal' },
  { name: 'Cistatina C',                 unit: 'mg/L',         refMin: 0.62,  refMax: 1.11, system: 'Función Renal' },
  { name: 'TFG por Cistatina C',         unit: 'mL/min/1.73m²',refMin: 90,   refMax: null, system: 'Función Renal' },
  { name: 'Microalbuminuria (relación)', unit: 'mg/g',         refMin: null,  refMax: 30,   system: 'Función Renal' },
  { name: 'Ácido Úrico',                 unit: 'mg/dL',        refMin: 3.4,   refMax: 7.0,  system: 'Función Renal' },

  // ── ELECTROLITOS Y MINERALES ─────────────────────────────────────────────────
  { name: 'Fósforo',                     unit: 'mg/dL',        refMin: 2.5,   refMax: 4.5,  system: 'Electrolitos y Minerales' },
  { name: 'Calcio Total',                unit: 'mg/dL',        refMin: 8.6,   refMax: 10.0, system: 'Electrolitos y Minerales' },
  { name: 'Calcio Iónico',               unit: 'mmol/L',       refMin: 1.18,  refMax: 1.32, system: 'Electrolitos y Minerales' },
  { name: 'Magnesio',                    unit: 'mg/dL',        refMin: 1.6,   refMax: 2.6,  system: 'Electrolitos y Minerales' },
  { name: 'Sodio',                       unit: 'mEq/L',        refMin: 136,   refMax: 145,  system: 'Electrolitos y Minerales' },
  { name: 'Potasio',                     unit: 'mEq/L',        refMin: 3.5,   refMax: 5.1,  system: 'Electrolitos y Minerales' },
  { name: 'Cloro',                       unit: 'mEq/L',        refMin: 98,    refMax: 107,  system: 'Electrolitos y Minerales' },
  { name: 'Hierro',                      unit: 'µg/dL',        refMin: 33,    refMax: 193,  system: 'Electrolitos y Minerales' },
  { name: 'Ferritina',                   unit: 'ng/mL',        refMin: 22,    refMax: 322,  system: 'Electrolitos y Minerales' },
  { name: 'Transferrina',                unit: 'mg/dL',        refMin: 200,   refMax: 360,  system: 'Electrolitos y Minerales' },
  { name: 'TIBC',                        unit: 'µg/dL',        refMin: 250,   refMax: 370,  system: 'Electrolitos y Minerales' },
  { name: 'Saturación de Transferrina',  unit: '%',            refMin: 20,    refMax: 50,   system: 'Electrolitos y Minerales' },
  { name: 'Zinc',                        unit: 'µg/dL',        refMin: 60,    refMax: 120,  system: 'Electrolitos y Minerales' },
  { name: 'Cobre',                       unit: 'µg/dL',        refMin: 70,    refMax: 140,  system: 'Electrolitos y Minerales' },

  // ── PERFIL LIPÍDICO Y CARDIOVASCULAR ────────────────────────────────────────
  { name: 'Colesterol Total',            unit: 'mg/dL',        refMin: null,  refMax: 200,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Colesterol HDL',              unit: 'mg/dL',        refMin: 40,    refMax: 60,   system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Colesterol LDL',             unit: 'mg/dL',        refMin: null,  refMax: 100,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Triglicéridos',              unit: 'mg/dL',        refMin: null,  refMax: 150,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Colesterol VLDL',            unit: 'mg/dL',        refMin: null,  refMax: 35,   system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Colesterol no-HDL',          unit: 'mg/dL',        refMin: null,  refMax: 130,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Índice Aterogénico',         unit: 'índice',       refMin: null,  refMax: 4.5,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Relación LDL/HDL',          unit: 'índice',       refMin: null,  refMax: 3.0,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'sd LDL (pequeñas densas)',  unit: 'mg/dL',        refMin: null,  refMax: 1.38, system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Lípidos Totales',           unit: 'mg/dL',        refMin: 380,   refMax: 748,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Fosfolípidos',              unit: 'mg/dL',        refMin: 125,   refMax: 275,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'PCR Ultrasensible',         unit: 'mg/L',         refMin: null,  refMax: 1.0,  system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Homocisteína',              unit: 'µmol/L',       refMin: 5,     refMax: 15,   system: 'Perfil Lipídico y Cardiovascular' },
  { name: 'Fibrinógeno',               unit: 'mg/dL',        refMin: 200,   refMax: 400,  system: 'Perfil Lipídico y Cardiovascular' },

  // ── FUNCIÓN HEPÁTICA Y PROTEÍNAS ─────────────────────────────────────────────
  { name: 'Bilirrubina Total',          unit: 'mg/dL',        refMin: 0.1,   refMax: 1.2,  system: 'Función Hepática y Proteínas' },
  { name: 'Bilirrubina Directa',        unit: 'mg/dL',        refMin: 0.09,  refMax: 0.3,  system: 'Función Hepática y Proteínas' },
  { name: 'Bilirrubina Indirecta',      unit: 'mg/dL',        refMin: null,  refMax: 0.9,  system: 'Función Hepática y Proteínas' },
  { name: 'ALT (TGP)',                  unit: 'U/L',          refMin: null,  refMax: 41,   system: 'Función Hepática y Proteínas' },
  { name: 'AST (TGO)',                  unit: 'U/L',          refMin: null,  refMax: 40,   system: 'Función Hepática y Proteínas' },
  { name: 'GGT',                        unit: 'U/L',          refMin: null,  refMax: 61,   system: 'Función Hepática y Proteínas' },
  { name: 'Fosfatasa Alcalina',         unit: 'U/L',          refMin: 40,    refMax: 150,  system: 'Función Hepática y Proteínas' },
  { name: 'Proteínas Totales',          unit: 'g/dL',         refMin: 6.4,   refMax: 8.3,  system: 'Función Hepática y Proteínas' },
  { name: 'Albúmina',                   unit: 'g/dL',         refMin: 3.5,   refMax: 5.0,  system: 'Función Hepática y Proteínas' },
  { name: 'Globulinas',                 unit: 'g/dL',         refMin: 2.0,   refMax: 3.5,  system: 'Función Hepática y Proteínas' },
  { name: 'Relación A/G',              unit: 'índice',       refMin: 1.1,   refMax: 2.5,  system: 'Función Hepática y Proteínas' },
  { name: 'LDH',                        unit: 'U/L',          refMin: 140,   refMax: 280,  system: 'Función Hepática y Proteínas' },

  // ── BIOMETRÍA HEMÁTICA ────────────────────────────────────────────────────────
  { name: 'Hemoglobina',                unit: 'g/dL',         refMin: 13.5,  refMax: 17.5, system: 'Biometría Hemática' },
  { name: 'Hematocrito',               unit: '%',            refMin: 41,    refMax: 53,   system: 'Biometría Hemática' },
  { name: 'Eritrocitos (RBC)',          unit: 'x10⁶/µL',     refMin: 4.5,   refMax: 6.0,  system: 'Biometría Hemática' },
  { name: 'VCM',                        unit: 'fL',           refMin: 80,    refMax: 100,  system: 'Biometría Hemática' },
  { name: 'HCM',                        unit: 'pg',           refMin: 27,    refMax: 33,   system: 'Biometría Hemática' },
  { name: 'CHCM',                       unit: 'g/dL',         refMin: 32,    refMax: 36,   system: 'Biometría Hemática' },
  { name: 'ADE (RDW)',                  unit: '%',            refMin: null,  refMax: 14.5, system: 'Biometría Hemática' },
  { name: 'Leucocitos (WBC)',           unit: 'x10³/µL',     refMin: 4.5,   refMax: 11.0, system: 'Biometría Hemática' },
  { name: 'Neutrófilos',               unit: '%',            refMin: 45,    refMax: 70,   system: 'Biometría Hemática' },
  { name: 'Linfocitos',                unit: '%',            refMin: 20,    refMax: 45,   system: 'Biometría Hemática' },
  { name: 'Monocitos',                 unit: '%',            refMin: 2,     refMax: 10,   system: 'Biometría Hemática' },
  { name: 'Eosinófilos',               unit: '%',            refMin: 1,     refMax: 6,    system: 'Biometría Hemática' },
  { name: 'Basófilos',                 unit: '%',            refMin: 0,     refMax: 1,    system: 'Biometría Hemática' },
  { name: 'Plaquetas',                 unit: 'x10³/µL',     refMin: 150,   refMax: 400,  system: 'Biometría Hemática' },

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
  { name: 'Hormona del Crecimiento',    unit: 'ng/mL',        refMin: null,  refMax: 3.0,  system: 'Sistema Endocrino (Hormonal)' },
  { name: 'PTH',                        unit: 'pg/mL',        refMin: 15,    refMax: 65,   system: 'Sistema Endocrino (Hormonal)' },

  // ── VITAMINAS Y MICRONUTRIENTES ───────────────────────────────────────────────
  { name: 'Vitamina D 25-Hidroxi',      unit: 'ng/mL',        refMin: 30,    refMax: 100,  system: 'Vitaminas y Micronutrientes' },
  { name: 'Vitamina B12',               unit: 'pg/mL',        refMin: 200,   refMax: 900,  system: 'Vitaminas y Micronutrientes' },
  { name: 'Folato (B9)',                unit: 'ng/mL',        refMin: 4.0,   refMax: 20,   system: 'Vitaminas y Micronutrientes' },
  { name: 'Vitamina B6',               unit: 'µg/L',         refMin: 5,     refMax: 50,   system: 'Vitaminas y Micronutrientes' },
  { name: 'Vitamina A',                unit: 'µg/dL',        refMin: 30,    refMax: 80,   system: 'Vitaminas y Micronutrientes' },
  { name: 'Vitamina E',                unit: 'mg/L',         refMin: 5.0,   refMax: 20,   system: 'Vitaminas y Micronutrientes' },
  { name: 'Vitamina C',                unit: 'mg/dL',        refMin: 0.4,   refMax: 2.0,  system: 'Vitaminas y Micronutrientes' },

  // ── SISTEMA INMUNE E INFLAMACIÓN ─────────────────────────────────────────────
  { name: 'PCR',                        unit: 'mg/dL',        refMin: null,  refMax: 0.5,  system: 'Sistema Inmune e Inflamación' },
  { name: 'VSG',                        unit: 'mm/hr',        refMin: null,  refMax: 20,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Interleucina-6 (IL-6)',      unit: 'pg/mL',        refMin: null,  refMax: 7.0,  system: 'Sistema Inmune e Inflamación' },
  { name: 'Factor Reumatoide',          unit: 'UI/mL',        refMin: null,  refMax: 14,   system: 'Sistema Inmune e Inflamación' },
  { name: 'Anti-CCP',                   unit: 'U/mL',         refMin: null,  refMax: 7,    system: 'Sistema Inmune e Inflamación' },
  { name: 'ANA',                        unit: 'título',       refMin: null,  refMax: null, system: 'Sistema Inmune e Inflamación' },
  { name: 'IgA',                        unit: 'mg/dL',        refMin: 70,    refMax: 400,  system: 'Sistema Inmune e Inflamación' },
  { name: 'IgG',                        unit: 'mg/dL',        refMin: 700,   refMax: 1600, system: 'Sistema Inmune e Inflamación' },
  { name: 'IgM',                        unit: 'mg/dL',        refMin: 40,    refMax: 230,  system: 'Sistema Inmune e Inflamación' },
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
