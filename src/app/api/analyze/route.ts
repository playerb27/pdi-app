import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
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
}

interface ConflictCandidate {
  value: string;
  unit: string;
  flag: string;
  context: string;
  referenceRange?: string;
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
// JSON Schema for Gemini structured output
// ─────────────────────────────────────────────────────────────────────────────
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    exam_date: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'Fecha de realización del estudio en formato YYYY-MM-DD, o null si no se encuentra',
    },
    biomarkers: {
      type: SchemaType.ARRAY,
      description: 'Lista de todos los biomarcadores encontrados en el documento',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: 'Nombre exacto del marcador como aparece en el documento',
          },
          value: {
            type: SchemaType.STRING,
            description: 'Valor exacto como aparece en el documento',
          },
          unit: {
            type: SchemaType.STRING,
            description: 'Unidad exacta como aparece en el documento',
          },
          referenceRange: {
            type: SchemaType.STRING,
            nullable: true,
            description: 'Rango de referencia exacto como aparece en el documento',
          },
          flag: {
            type: SchemaType.STRING,
            enum: ['Normal', 'Alto', 'Bajo'],
            description: 'Estado del valor comparado con el rango del documento',
          },
        },
        required: ['name', 'value', 'unit', 'flag'],
      },
    },
  },
  required: ['biomarkers'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Extraction prompt — pure transcription, no interpretation
// ─────────────────────────────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `Eres un sistema de transcripción de resultados de laboratorio clínico.

MISIÓN ÚNICA: Extraer todos los valores del documento con exactitud fotográfica.

════════════════════════════════════════════════════════
REGLAS ABSOLUTAS
════════════════════════════════════════════════════════
✅ Copia el nombre del marcador EXACTAMENTE como aparece en el documento
✅ Copia el valor EXACTAMENTE como aparece (no conviertas unidades)
✅ Copia la unidad EXACTAMENTE como aparece
✅ Copia el rango de referencia EXACTAMENTE como aparece
✅ Extrae TODOS los marcadores de TODAS las secciones del documento
✅ Valores cualitativos ("Negativo", "Positivo", "Reactivo") son válidos — extráelos
✅ flag = compara el valor vs el rango del documento → Normal/Alto/Bajo
✅ Preserva estrictamente el orden secuencial en el que aparecen los marcadores de arriba a abajo y página a página en el documento. La lista de salida "biomarkers" debe seguir exactamente este orden de lectura original de la página 1 a la última página.

❌ NO normalices nombres de marcadores
❌ NO conviertas unidades (si dice mmol/L, reporta mmol/L)
❌ NO clasifiques en sistemas clínicos
❌ NO interpretes — solo transcribe

════════════════════════════════════════════════════════
REGLA CRÍTICA para tablas de columnas múltiples (Chopo, etc.)
════════════════════════════════════════════════════════
Las columnas "Bajo(LR)", "Dentro(LR)", "Sobre(LR)" son MUTUAMENTE EXCLUYENTES.
El valor del paciente aparece en UNA SOLA de esas tres columnas.
La columna "Límites de referencia" contiene el RANGO POBLACIONAL, no el valor del paciente.
NUNCA combines números de diferentes columnas de la misma fila.

Ejemplo:
  Prueba         | Bajo(LR) | Dentro(LR) | Sobre(LR) | Límites referencia
  Colesterol HDL |          |     51      |           | 40 - 60 mg/dL
→ name="Colesterol HDL", value="51", unit="mg/dL", referenceRange="40 - 60 mg/dL", flag="Normal"

════════════════════════════════════════════════════════
exam_date
════════════════════════════════════════════════════════
Busca la fecha de REALIZACIÓN del estudio (no la de entrega ni impresión).
Formato: YYYY-MM-DD. Si no la encuentras con certeza, devuelve null.`;

// ─────────────────────────────────────────────────────────────────────────────
// Extract text from PDF using pdfjs-dist (preserves table structure better)
// Returns null if the PDF has no usable text layer (scanned)
// ─────────────────────────────────────────────────────────────────────────────
async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    // pdfjs-dist requires a Node-compatible environment
    // We import dynamically to avoid bundler issues
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any).catch(() => null);
    if (!pdfjsLib) return null;

    const data = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
    const pdf = await loadingTask.promise;

    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items by approximate Y position to preserve row structure
      // Items within 3px of each other are on the same row
      const rows = new Map<number, { x: number; text: string }[]>();
      for (const item of textContent.items as any[]) {
        if (!item.str?.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3; // snap to 3px grid
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push({ x: item.transform[4], text: item.str });
      }

      // Sort rows by Y descending (top of page first in PDF coords), then items by X
      const sortedRows = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) =>
          items
            .sort((a, b) => a.x - b.x)
            .map(i => i.text)
            .join('  ')
            .trim()
        )
        .filter(Boolean);

      pageTexts.push(sortedRows.join('\n'));
    }

    const fullText = pageTexts.join('\n\n--- PÁGINA SIGUIENTE ---\n\n').trim();
    // If less than 80 chars, the PDF is effectively a scanned image with no usable text
    return fullText.length >= 80 ? fullText : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication — groups by exact name, preserves conflicts for doctor review
// ─────────────────────────────────────────────────────────────────────────────
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

    // Check if all entries are identical (same value + same unit)
    const normalize = (b: Biomarker) =>
      `${String(b.value).trim().replace(',', '.')}|${b.unit?.trim().toLowerCase()}`;
    const signatures = new Set(group.map(normalize));

    if (signatures.size === 1) {
      // Truly identical — PDF page duplication
      result.push(group[0]);
      autoRemoved.push(
        ...group.slice(1).map(b =>
          `${b.name}: duplicado idéntico eliminado (${b.value} ${b.unit})`
        )
      );
      continue;
    }

    // Different values — doctor must choose
    const sortedGroup = [...group].sort((a, b) => {
      const aScore = a.referenceRange && a.referenceRange.length > 2 ? 1 : 0;
      const bScore = b.referenceRange && b.referenceRange.length > 2 ? 1 : 0;
      return bScore - aScore;
    });

    result.push(sortedGroup[0]);

    conflicts.push({
      name: group[0].name,
      recommendedIndex: 0,
      candidates: sortedGroup.map((b, i) => ({
        value: b.value,
        unit: b.unit,
        flag: b.flag,
        referenceRange: b.referenceRange,
        context:
          i === 0
            ? b.referenceRange && b.referenceRange.length > 2
              ? 'Panel con rango de referencia (recomendado)'
              : 'Primera aparición en el documento'
            : 'Aparición adicional en el documento',
      })),
    });
  }

  return { biomarkers: result, conflicts, autoRemoved };
}

// ─────────────────────────────────────────────────────────────────────────────
// Outlier detection — uses the document's own reference ranges
// ─────────────────────────────────────────────────────────────────────────────
function parseReferenceRange(ref: string | undefined): { min: number | null; max: number | null } {
  if (!ref) return { min: null, max: null };

  const rangeMatch = ref.match(/([\d.,]+)\s*[-–a]\s*([\d.,]+)/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1].replace(',', '.')),
      max: parseFloat(rangeMatch[2].replace(',', '.')),
    };
  }

  const ltMatch = ref.match(/[<≤]\s*=?\s*([\d.,]+)/);
  if (ltMatch) return { min: null, max: parseFloat(ltMatch[1].replace(',', '.')) };

  const gtMatch = ref.match(/[>≥]\s*=?\s*([\d.,]+)/);
  if (gtMatch) return { min: parseFloat(gtMatch[1].replace(',', '.')), max: null };

  return { min: null, max: null };
}

function detectExtremeOutliers(biomarkers: Biomarker[]): ExtremeOutlier[] {
  const outliers: ExtremeOutlier[] = [];

  for (const bm of biomarkers) {
    const num = parseFloat(String(bm.value).replace(',', '.'));
    if (isNaN(num)) continue;

    const { min: refMin, max: refMax } = parseReferenceRange(bm.referenceRange);

    if (refMax === null && refMin === null) continue;
    if (refMax !== null && refMax <= 0) continue;

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
// POST handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { base64, mimeType, patientName } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Falta GEMINI_API_KEY en variables de entorno' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // gemini-2.5-pro: best multimodal document comprehension
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0,                         // deterministic extraction
        responseMimeType: 'application/json',   // guaranteed valid JSON
        responseSchema: RESPONSE_SCHEMA as any,
      },
    });

    // ── Route 1: PDF with text layer ──────────────────────────────────────────
    // Extract structured text first; only fall back to binary if no text layer
    let geminiContent: any[];
    let extractionMode: 'text' | 'multimodal-pdf' | 'multimodal-image';
    let anonymized = false;
    let anonymizationFailed = false;

    const isPDF = mimeType === 'application/pdf';

    if (isPDF) {
      const pdfBuffer = Buffer.from(base64, 'base64');
      const extractedText = await extractPdfText(pdfBuffer);

      if (extractedText) {
        // ── Route 1a: PDF with text layer — sanitize + send as text ────────
        let sanitizedText = extractedText;

        if (patientName?.trim()) {
          const nameTokens = patientName
            .trim()
            .split(/\s+/)
            .filter((t: string) => t.length > 2)
            .map((t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

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
        }

        extractionMode = 'text';
        geminiContent = [
          EXTRACTION_PROMPT,
          `\n\nCONTENIDO DEL LABORATORIO (texto extraído del PDF con estructura de tabla preservada):\n\n${sanitizedText}`,
        ];
      } else {
        // ── Route 1b: Scanned PDF — send binary as multimodal ──────────────
        extractionMode = 'multimodal-pdf';
        anonymizationFailed = !!patientName?.trim();
        geminiContent = [EXTRACTION_PROMPT, { inlineData: { data: base64, mimeType } }];
      }
    } else {
      // ── Route 2: Image (JPG/PNG) — send binary as multimodal ─────────────
      extractionMode = 'multimodal-image';
      anonymizationFailed = isPDF && !!patientName?.trim();
      geminiContent = [EXTRACTION_PROMPT, { inlineData: { data: base64, mimeType } }];
    }

    // ── Call Gemini ───────────────────────────────────────────────────────────
    const extractResult = await model.generateContent(geminiContent);
    const extractText = extractResult.response.text();

    let parsedData: any = null;
    try {
      // With responseMimeType: 'application/json', the response should always be valid JSON
      // But we still clean just in case an older SDK version wraps it
      const clean = extractText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(clean);
    } catch {
      console.error('JSON parse error (unexpected):', extractText.slice(0, 500));
      return NextResponse.json(
        { error: 'Error al interpretar la respuesta de la IA. Por favor intenta de nuevo.' },
        { status: 500 }
      );
    }

    // Ensure biomarkers is always an array
    if (!Array.isArray(parsedData.biomarkers)) parsedData.biomarkers = [];

    // Validate exam_date
    if (
      parsedData.exam_date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(parsedData.exam_date) ||
        new Date(parsedData.exam_date) > new Date())
    ) {
      parsedData.exam_date = null;
    }

    // ── Deduplication ─────────────────────────────────────────────────────────
    const { biomarkers: dedupedBiomarkers, conflicts, autoRemoved } = deduplicateBiomarkers(
      parsedData.biomarkers
    );
    parsedData.biomarkers = dedupedBiomarkers;

    // ── Outlier detection ─────────────────────────────────────────────────────
    const extremeOutliers = detectExtremeOutliers(parsedData.biomarkers);

    // ── Build audit summary ───────────────────────────────────────────────────
    const msgs: string[] = [];
    if (anonymized) msgs.push('✅ Nombre del paciente anonimizado antes de enviarse a Google');
    if (anonymizationFailed)
      msgs.push('⚠️ PDF escaneado: no fue posible anonimizar el nombre antes del envío');
    const modeLabel =
      extractionMode === 'text'
        ? '📄 Extracción de texto estructurado (máxima precisión)'
        : extractionMode === 'multimodal-pdf'
        ? '🖼️ Extracción multimodal (PDF escaneado)'
        : '🖼️ Extracción multimodal (imagen)';
    msgs.push(modeLabel);
    if (autoRemoved.length > 0) msgs.push(`${autoRemoved.length} duplicado(s) idéntico(s) eliminado(s)`);
    if (conflicts.length > 0) msgs.push(`${conflicts.length} conflicto(s) requieren revisión médica`);
    if (extremeOutliers.length > 0) msgs.push(`${extremeOutliers.length} valor(es) extremo(s) detectado(s)`);

    // Add clinical summary (generated from extracted data, no extra AI call)
    if (!parsedData.summary) {
      const altered = dedupedBiomarkers.filter(b => b.flag !== 'Normal');
      parsedData.summary =
        altered.length > 0
          ? `${dedupedBiomarkers.length} marcadores extraídos. ${altered.length} alterados: ${altered.slice(0, 3).map(b => `${b.name} (${b.flag})`).join(', ')}${altered.length > 3 ? `, y ${altered.length - 3} más` : ''}.`
          : `${dedupedBiomarkers.length} marcadores extraídos. Todos dentro de rangos de referencia.`;
    }

    const audit = {
      confidence: conflicts.length > 0 || extremeOutliers.length > 0 ? 80 : 95,
      status: conflicts.length > 0 || extremeOutliers.length > 0 ? 'warning' : 'ok',
      issues: [],
      missing_markers: [],
      summary: msgs.join(' · '),
      anonymized,
      anonymizationFailed,
      extractionMode,
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
