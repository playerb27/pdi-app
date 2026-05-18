import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Biomarker {
  name: string;
  value: string;
  unit: string;
  referenceRange?: string;
  flag: string;
  system: string;
}

interface ConflictCandidate {
  value: string;
  unit: string;
  flag: string;
  system: string;
  referenceRange?: string;
  context: string;
}

interface MarkerConflict {
  name: string;
  candidates: ConflictCandidate[];
  recommendedIndex: number;
}

interface ExtremeOutlier {
  name: string;
  value: string;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  severity: 'warning' | 'critical';
  factor: number;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication — groups by exact name, no hardcoded rules
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Groups biomarkers by name.
 * - Identical value+unit across all occurrences → silently merge (true PDF page duplicate)
 * - Different values → send to doctor for resolution (no auto-discard)
 */
function deduplicateBiomarkers(biomarkers: Biomarker[]): {
  biomarkers: Biomarker[];
  conflicts: MarkerConflict[];
  autoRemoved: string[];
} {
  const seen = new Map<string, Biomarker[]>();

  for (const bm of biomarkers) {
    const key = bm.name.toLowerCase().trim();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(bm);
  }

  const result: Biomarker[] = [];
  const conflicts: MarkerConflict[] = [];
  const autoRemoved: string[] = [];

  for (const [, group] of seen) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Check if all entries are identical (same value + same unit, modulo whitespace)
    const normalize = (b: Biomarker) =>
      `${String(b.value).trim().replace(',', '.')}|${b.unit?.trim().toLowerCase()}`;
    const signatures = new Set(group.map(normalize));

    if (signatures.size === 1) {
      // Truly identical — the PDF just repeated the same data (header + detail page, etc.)
      result.push(group[0]);
      autoRemoved.push(
        ...group.slice(1).map(b =>
          `${b.name}: duplicado idéntico eliminado (${b.value} ${b.unit})`
        )
      );
      continue;
    }

    // Different values — doctor must choose
    // Use the entry with the most complete referenceRange as recommended
    const sortedGroup = [...group].sort((a, b) => {
      const aScore = (a.referenceRange && a.referenceRange.length > 2 ? 1 : 0);
      const bScore = (b.referenceRange && b.referenceRange.length > 2 ? 1 : 0);
      return bScore - aScore;
    });

    result.push(sortedGroup[0]); // tentative — overwritten when doctor confirms

    conflicts.push({
      name: group[0].name,
      recommendedIndex: 0,
      candidates: sortedGroup.map((b, i) => ({
        value: b.value,
        unit: b.unit,
        flag: b.flag,
        system: b.system,
        referenceRange: b.referenceRange,
        context: i === 0
          ? (b.referenceRange && b.referenceRange.length > 2 ? 'Panel con rango de referencia (recomendado)' : 'Primera aparición en el documento')
          : `Aparición adicional en el documento`,
      })),
    });
  }

  return { biomarkers: result, conflicts, autoRemoved };
}

// ─────────────────────────────────────────────────────────────────────────────
// Outlier detection — uses the document's OWN reference ranges
// No hardcoded rules. Works for any lab, any country, any unit system.
// ─────────────────────────────────────────────────────────────────────────────
function parseReferenceRange(ref: string | undefined): { min: number | null; max: number | null } {
  if (!ref) return { min: null, max: null };

  // "X - Y" or "X – Y" or "X a Y"
  const rangeMatch = ref.match(/([\d.,]+)\s*[-–a]\s*([\d.,]+)/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1].replace(',', '.')),
      max: parseFloat(rangeMatch[2].replace(',', '.')),
    };
  }

  // "< X" or "≤ X"
  const ltMatch = ref.match(/[<≤]\s*=?\s*([\d.,]+)/);
  if (ltMatch) return { min: null, max: parseFloat(ltMatch[1].replace(',', '.')) };

  // "> X" or "≥ X"
  const gtMatch = ref.match(/[>≥]\s*=?\s*([\d.,]+)/);
  if (gtMatch) return { min: parseFloat(gtMatch[1].replace(',', '.')), max: null };

  return { min: null, max: null };
}

function detectExtremeOutliers(biomarkers: Biomarker[]): ExtremeOutlier[] {
  const outliers: ExtremeOutlier[] = [];

  for (const bm of biomarkers) {
    const num = parseFloat(String(bm.value).replace(',', '.'));
    if (isNaN(num)) continue; // qualitative value — skip

    const { min: refMin, max: refMax } = parseReferenceRange(bm.referenceRange);

    // Need at least one bound to compare
    if (refMax === null && refMin === null) continue;
    // Skip if bounds are zero or negative (meaningless)
    if (refMax !== null && refMax <= 0) continue;

    // Too high: value > 3× the upper bound
    if (refMax !== null && num > refMax * 3) {
      const factor = Math.round((num / refMax) * 10) / 10;
      outliers.push({
        name: bm.name,
        value: bm.value,
        unit: bm.unit,
        refMin,
        refMax,
        severity: num > refMax * 10 ? 'critical' : 'warning',
        factor,
        description: `${factor}× por encima del límite superior de referencia del laboratorio (${refMax} ${bm.unit})`,
      });
      continue;
    }

    // Too low: value < 10% of the lower bound (only when lower bound is meaningful, > 0)
    if (refMin !== null && refMin > 0 && num < refMin * 0.1) {
      const factor = Math.round((refMin / Math.max(num, 0.0001)) * 10) / 10;
      outliers.push({
        name: bm.name,
        value: bm.value,
        unit: bm.unit,
        refMin,
        refMax,
        severity: num < refMin * 0.02 ? 'critical' : 'warning',
        factor,
        description: `${factor}× por debajo del límite inferior de referencia del laboratorio (${refMin} ${bm.unit})`,
      });
    }
  }

  return outliers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction prompt (module-level so the anonymization handler can use it)
// ─────────────────────────────────────────────────────────────────────────────
const prompt = `Eres el motor de extracción de datos del Protocolo de Diagnóstico Integral (PDI).
Tu misión: extraer con precisión absoluta todos los biomarcadores de este resultado de laboratorio.

════════════════════════════════════════════════════════
PASO 1 — ENTIENDE LA ESTRUCTURA DEL DOCUMENTO
════════════════════════════════════════════════════════
Los laboratorios clínicos pueden tener formatos muy distintos:
• Tablas con columnas separadas: Nombre | Resultado | Unidad | Referencia
• Tablas con columnas de estado: Nombre | Bajo(LR) | Dentro(LR) | Alto(LR) | Límites de referencia
• Formato lineal: "Glucosa: 91 mg/dL (Ref: 55-99)"
• PDFs internacionales con distintas convenciones de unidades

⚠️ REGLA CRÍTICA PARA TABLAS MULTI-COLUMNA (ej. Laboratorios Chopo, México):
Las columnas "Bajo (LR)", "Dentro (LR)", "Sobre (LR)" contienen el VALOR DEL PACIENTE.
La columna "Límites de referencia" contiene rangos poblacionales — NO son el valor del paciente.
El valor del paciente aparece en UNA SOLA de esas tres columnas (la que corresponde a su estado).
NUNCA combines números de diferentes columnas de la misma fila.

Ejemplo de tabla Chopo:
  Prueba          | Bajo (LR) | Dentro (LR) | Sobre (LR) | Límites de referencia
  Colesterol HDL  |           |     51      |            | 40 - 60 mg/dL
→ CORRECTO: valor=51, referencia="40 - 60 mg/dL"
→ INCORRECTO: valor=1972 o valor=4060 (no combines columnas)

════════════════════════════════════════════════════════
PASO 2 — REGLAS DE EXTRACCIÓN
════════════════════════════════════════════════════════
✅ Extrae TODOS los marcadores de TODAS las secciones del documento.
✅ Si el mismo nombre aparece en múltiples secciones con valores diferentes → extráelo de cada sección (el sistema detectará el conflicto y preguntará al médico).
✅ Valores cualitativos ("Negativo", "Ausente", "Reactivo", "Positivo") son válidos — extráelos tal cual.
✅ El referenceRange debe incluir la unidad: "40 - 60 mg/dL", "< 200 mg/dL", "> 60 mL/min".

❌ NO extraigas: encabezados de sección, notas metodológicas, pie de página del laboratorio,
   nombres del médico, datos del paciente, ni texto legal/administrativo.
❌ NO inventes valores ni rangos que no están en el documento.

════════════════════════════════════════════════════════
PASO 3 — NORMALIZACIÓN DE UNIDADES
════════════════════════════════════════════════════════
El documento puede usar distintas unidades. Conviértelas a la unidad estándar clínica:

• Glucosa: si en mmol/L → multiplica × 18.016 → reporta en mg/dL
  Ejemplo: 5.05 mmol/L × 18.016 = 91 mg/dL
• Colesterol/HDL/LDL: si en mmol/L → × 38.67 → mg/dL
• Triglicéridos: si en mmol/L → × 88.57 → mg/dL
• Creatinina: si en µmol/L → ÷ 88.4 → mg/dL
• Bilirrubina: si en µmol/L → × 0.0585 → mg/dL
• Calcio: si en mmol/L → × 4.008 → mg/dL
• Hemoglobina: si en g/L → ÷ 10 → g/dL
• T3 total (Triiodotironina): unidad estándar = ng/mL, rango típico 0.8-2.0
• T4 total (Tiroxina): unidad estándar = µg/dL, rango típico 5-14
• T4 libre: unidad estándar = ng/dL, rango típico 0.8-1.8
• T3 libre: unidad estándar = pg/mL, rango típico 2.3-4.2
• TSH: unidad estándar = mUI/L o µUI/mL (equivalentes), rango típico 0.4-4.0
• Vitamina B12: si en pmol/L → × 1.355 → pg/mL
• Folato: si en nmol/L → × 0.441 → ng/mL

Si el documento ya usa la unidad estándar, NO conviertas — reporta exactamente lo que dice.
Incluye la unidad correcta en el campo "unit".

════════════════════════════════════════════════════════
PASO 4 — VERIFICACIÓN ANTES DE REPORTAR
════════════════════════════════════════════════════════
Revisa cada valor contra rangos de supervivencia humana (valores completamente imposibles en un paciente vivo):
Si el valor viola estos rangos, es probable un error de parseo — revisa y corrige:
- Glucosa: 20-1200 mg/dL       - Colesterol total: 50-900 mg/dL
- HDL: 5-200 mg/dL             - LDL: 5-600 mg/dL
- Hemoglobina: 3-25 g/dL       - Sodio: 100-180 mEq/L
- Potasio: 1.5-9.0 mEq/L       - Creatinina: 0.1-30 mg/dL
- T3: 0.1-8 ng/mL              - T4: 0.5-30 µg/dL
- TSH: 0.001-200 mUI/L         - HbA1c: 2-20 %

════════════════════════════════════════════════════════
PASO 5 — CLASIFICACIÓN EN SISTEMA PDI
════════════════════════════════════════════════════════
Para el campo "system", elige el más apropiado:
"Fundamentos y Resumen Ejecutivo" | "Sistema Metabólico y Energético" | "Salud Cardiovascular y Circulatoria" | "Sistema Endocrino (Hormonal)" | "Función Digestiva y Microbiota" | "Sistema Inmune e Inflamación" | "Salud Neurológica y Cognitiva" | "Salud Dental y Estomatognática" | "Salud Visual y Retinografía" | "Salud Dermatológica e Integumentaria" | "Sistemas Renal, Respiratorio y Osteomuscular" | "Desintoxicación y Estrés Oxidativo" | "Protocolo Maestro de Intervención" | "Anexos y Glosario"

════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
════════════════════════════════════════════════════════
Devuelve ÚNICAMENTE un JSON válido, sin markdown, sin texto adicional:
{
  "exam_date": "YYYY-MM-DD",
  "biomarkers": [
    {
      "name": "Nombre exacto del marcador",
      "value": "valor numérico o cualitativo como string",
      "unit": "unidad post-conversión",
      "referenceRange": "rango del documento incluyendo unidad",
      "flag": "Normal|Alto|Bajo",
      "system": "sistema PDI correspondiente"
    }
  ],
  "summary": "Resumen clínico ejecutivo en 2-3 oraciones para el médico tratante."
}

Fecha del examen: busca la fecha de REALIZACIÓN del estudio (no la de entrega). Formato ISO YYYY-MM-DD. Si no la encuentras, usa null.`;

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { base64, mimeType, patientName } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta GEMINI_API_KEY en variables de entorno' }, { status: 500 });
    }

    // ── Step 0: Anonymize PDF before sending to Google ────────────────────────
    // For PDFs with a text layer, we extract the text, redact the patient name,
    // and send sanitized text to Gemini. For scanned/image PDFs (no text layer)
    // we fall back to binary but document in the audit log.
    let anonymized = false;
    let anonymizationFailed = false;
    let geminiContent: any[];

    const isPDF = mimeType === 'application/pdf';

    if (isPDF && patientName?.trim()) {
      try {
        // Dynamic require for pdf-parse (CJS-only package in server context)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
        const pdfBuffer = Buffer.from(base64, 'base64');
        const pdfData = await pdfParse(pdfBuffer);
        const rawText = pdfData.text ?? '';

        if (rawText.trim().length > 80) {
          // PDF has a usable text layer — sanitize it
          const nameTokens = patientName
            .trim()
            .split(/\s+/)
            .filter((t: string) => t.length > 2)
            .map((t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

          let sanitizedText = rawText;
          // Replace full name (all orderings), individual tokens, and ALL-CAPS variants
          const patterns = [
            patientName.trim(),
            patientName.trim().toUpperCase(),
            ...nameTokens,
            ...nameTokens.map((t: string) => t.toUpperCase()),
          ];
          for (const p of patterns) {
            if (p.length > 2) {
              sanitizedText = sanitizedText.replace(
                new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                '[PACIENTE]'
              );
            }
          }

          anonymized = true;
          geminiContent = [
            prompt,
            `\n\nCONTENIDO DEL LABORATORIO (texto extraído del PDF, datos del paciente anonimizados):\n${sanitizedText}`,
          ];
        } else {
          // Scanned PDF — no text layer, must send binary
          anonymizationFailed = true;
          geminiContent = [prompt, { inlineData: { data: base64, mimeType } }];
        }
      } catch {
        // pdf-parse error — fall back to binary
        anonymizationFailed = true;
        geminiContent = [prompt, { inlineData: { data: base64, mimeType } }];
      }
    } else {
      // Image file (JPG/PNG) or no patient name provided — send binary as-is
      anonymizationFailed = isPDF && !patientName?.trim();
      geminiContent = [prompt, { inlineData: { data: base64, mimeType } }];
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // gemini-2.5-pro: best PDF table comprehension available
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const extractResult = await model.generateContent(geminiContent);

    const extractText = extractResult.response.text();
    let parsedData: any = null;
    try {
      const clean = extractText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(clean);
    } catch {
      console.error('JSON parse error:', extractText);
      return NextResponse.json({ error: 'Error al interpretar la respuesta de la IA. Por favor intenta de nuevo.' }, { status: 500 });
    }

    // ── Step 2: Deduplication (structure-aware, no hardcoded rules) ───────────
    const { biomarkers: dedupedBiomarkers, conflicts, autoRemoved } = deduplicateBiomarkers(
      parsedData.biomarkers ?? []
    );
    parsedData.biomarkers = dedupedBiomarkers;

    // ── Step 3: Outlier detection (uses document's own reference ranges) ──────
    const extremeOutliers = detectExtremeOutliers(parsedData.biomarkers);

    // ── Step 4: Build result summary (no extra AI call needed) ───────────────
    const msgs: string[] = [];
    if (anonymized) msgs.push('✅ Nombre del paciente anonimizado antes de enviarse a Google');
    if (anonymizationFailed) msgs.push('⚠️ PDF escaneado: no fue posible anonimizar el nombre antes del envío');
    if (autoRemoved.length > 0) msgs.push(`${autoRemoved.length} duplicado(s) idéntico(s) eliminado(s)`);
    if (conflicts.length > 0) msgs.push(`${conflicts.length} conflicto(s) requieren revisión médica`);
    if (extremeOutliers.length > 0) msgs.push(`${extremeOutliers.length} valor(es) extremo(s) detectado(s)`);

    const audit = {
      confidence: conflicts.length > 0 || extremeOutliers.length > 0 ? 80 : 95,
      status: conflicts.length > 0 || extremeOutliers.length > 0 ? 'warning' : 'ok',
      issues: [],
      missing_markers: [],
      summary: msgs.length > 0 ? msgs.join('. ') + '.' : 'Extracción completada sin conflictos.',
      anonymized,
      anonymizationFailed,
    };

    return NextResponse.json({
      ...parsedData,
      audit,
      conflicts,
      extremeOutliers,
      suspiciousMarkers: [],
      deduplicationLog: autoRemoved,
    });

  } catch (error: any) {
    console.error('Analyze API error:', error);
    return NextResponse.json({ error: error.message ?? 'Error interno' }, { status: 500 });
  }
}

