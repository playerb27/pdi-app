import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// ─── Physiological validation & unit normalization ────────────────────────────
const PHYSIO_RULES: { keywords: string[]; minVal: number; maxVal: number; mmolFactor?: number; unit: string }[] = [
  { keywords: ['glucosa', 'glucose', 'gluc'], minVal: 30, maxVal: 700, mmolFactor: 18.016, unit: 'mg/dL' },
  { keywords: ['colesterol total', 'cholesterol total', 'colesterol'], minVal: 60, maxVal: 600, mmolFactor: 38.67, unit: 'mg/dL' },
  { keywords: ['triglicérid', 'triglicer', 'triglyceri'], minVal: 20, maxVal: 5000, mmolFactor: 88.57, unit: 'mg/dL' },
  { keywords: ['hdl', 'hdl-c', 'colesterol hdl', 'alta densidad'], minVal: 10, maxVal: 200, mmolFactor: 38.67, unit: 'mg/dL' },
  { keywords: ['ldl', 'ldl-c', 'baja densidad'], minVal: 10, maxVal: 500, mmolFactor: 38.67, unit: 'mg/dL' },
  { keywords: ['creatinina', 'creatinine'], minVal: 0.3, maxVal: 20, mmolFactor: 0.0113, unit: 'mg/dL' },
  { keywords: ['urea'], minVal: 5, maxVal: 200, mmolFactor: 6.006, unit: 'mg/dL' },
  { keywords: ['bilirrubina', 'bilirubin'], minVal: 0.1, maxVal: 30, mmolFactor: 0.0585, unit: 'mg/dL' },
  { keywords: ['calcio', 'calcium'], minVal: 4, maxVal: 20, mmolFactor: 4.008, unit: 'mg/dL' },
  { keywords: ['hemoglobina', 'hemoglobin', 'hgb', 'hb'], minVal: 5, maxVal: 25, unit: 'g/dL' },
  { keywords: ['hematocrit', 'hematócrit'], minVal: 15, maxVal: 65, unit: '%' },
];

interface Biomarker { name: string; value: string; unit: string; referenceRange?: string; flag: string; system: string; }
interface ValidationIssue { marker: string; type: string; originalValue: string; correctedValue?: string; note: string; }

function validateAndNormalizeBiomarkers(biomarkers: Biomarker[]): { biomarkers: Biomarker[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const normalized = biomarkers.map(bm => {
    const nameLower = bm.name.toLowerCase();
    const rule = PHYSIO_RULES.find(r => r.keywords.some(k => nameLower.includes(k)));
    if (!rule) return bm;

    const num = parseFloat(String(bm.value).replace(',', '.'));
    if (isNaN(num)) return bm;

    // Unit conversion: value below physiological min but converts correctly via mmolFactor
    if (rule.mmolFactor && num < rule.minVal && num * rule.mmolFactor >= rule.minVal) {
      const converted = Math.round(num * rule.mmolFactor * 100) / 100;
      issues.push({
        marker: bm.name,
        type: 'unit_conversion',
        originalValue: `${num} (posiblemente mmol/L)`,
        correctedValue: `${converted} ${rule.unit}`,
        note: `Valor ${num} convertido automáticamente de mmol/L a ${rule.unit} (${num} × ${rule.mmolFactor} = ${converted}).`,
      });
      return { ...bm, value: String(converted), unit: rule.unit };
    }

    // Physiologically impossible value
    if (num < rule.minVal * 0.3 || num > rule.maxVal * 3) {
      issues.push({
        marker: bm.name,
        type: 'implausible_value',
        originalValue: String(num),
        note: `Valor ${num} ${bm.unit} parece fisiológicamente imposible (rango esperado: ${rule.minVal}–${rule.maxVal} ${rule.unit}). Revisar manualmente.`,
      });
    }

    return bm;
  });

  return { biomarkers: normalized, issues };
}

export async function POST(req: Request) {
  try {
    const { base64, mimeType } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta GEMINI_API_KEY en variables de entorno' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const prompt = `Eres el motor de análisis del Protocolo de Diagnóstico Integral (PDI), un sistema médico de élite con capacidad de lectura clínica avanzada.

PASO 1 — Comprende la estructura del documento:
Identifica qué columnas existen. Los laboratorios tienen:
- Columna RESULTADO/VALOR: el dato MEDIDO en este paciente
- Columna VALORES DE REFERENCIA/RANGO NORMAL: rangos esperados para la población

PASO 2 — Identifica valor del paciente vs referencia:
El VALOR DEL PACIENTE es único por marcador y es la medición de esa muestra.
Los VALORES DE REFERENCIA son rangos con umbrales numéricos (Normal, Alto, Deseable, etc.).

PASO 3 — Reglas de extracción:
✅ Extrae UNA entrada por marcador con el valor MEDIDO del paciente.
✅ Consolida la tabla de referencia en UN string legible (ej: "< 150 mg/dL", "74 - 106").
✅ El valor del paciente está en la MISMA LÍNEA que el nombre del marcador.
✅ Líneas "FCSI" son conversiones del laboratorio — IGNORAR COMPLETAMENTE.
❌ No extraigas filas de referencia como marcadores individuales.
❌ No extraigas notas metodológicas ni cálculos intermedios irrelevantes.

PASO 4 — NORMALIZACIÓN DE UNIDADES (CRÍTICO — LEE CON ATENCIÓN):
Los laboratorios pueden usar distintas unidades. SIEMPRE reporta en las unidades estándar en México:

⚠️ GLUCOSA: Rango normal en mg/dL es 70–100. Si ves un valor como 4.5, 5.05, 6.2 con unidad mmol/L:
   → MULTIPLICA por 18.016 para convertir a mg/dL
   → 5.05 mmol/L × 18.016 = 91.0 mg/dL ← esto es lo que debes reportar
   → NUNCA reportes glucosa como 5.05 mg/dL (eso sería glucemia de coma hipoglucémico)

⚠️ COLESTEROL/HDL/LDL: Si en mmol/L → multiplicar por 38.67 para mg/dL
   → 5.18 mmol/L × 38.67 = 200.3 mg/dL

⚠️ TRIGLICÉRIDOS: Si en mmol/L → multiplicar por 88.57 para mg/dL
   → 1.69 mmol/L × 88.57 = 149.7 mg/dL

⚠️ CREATININA: Si en μmol/L → dividir por 88.4 para mg/dL
   → 88 μmol/L ÷ 88.4 = 1.00 mg/dL

⚠️ BILIRRUBINA: Si en μmol/L → multiplicar por 0.0585 para mg/dL

⚠️ CALCIO: Si en mmol/L → multiplicar por 4.008 para mg/dL

La unit en el JSON DEBE coincidir con el valor post-conversión.

PASO 5 — VERIFICACIÓN FISIOLÓGICA:
Antes de devolver el JSON, verifica que cada valor sea posible en un paciente vivo:
- Glucosa (mg/dL): 40–700. Si es < 40, es error de unidades.
- Colesterol total (mg/dL): 60–600
- Triglicéridos (mg/dL): 20–2000
- HDL/LDL (mg/dL): 10–300
- Hemoglobina (g/dL): 5–25
- Creatinina (mg/dL): 0.3–20
Si un valor no pasa esta verificación, revisa las unidades antes de reportarlo.

PASO 6 — Para cada biomarcador extrae:
- name: nombre clínico limpio
- value: valor numérico exacto POST-normalización de unidades
- unit: unidad de medida POST-conversión
- referenceRange: resumen del rango de referencia en una expresión clara
- flag: "Normal", "Alto" o "Bajo" (comparando el valor normalizado vs rangos del documento)
- system: uno de estos 14 sistemas:
  1. "Fundamentos y Resumen Ejecutivo"
  2. "Sistema Metabólico y Energético"
  3. "Salud Cardiovascular y Circulatoria"
  4. "Sistema Endocrino (Hormonal)"
  5. "Función Digestiva y Microbiota"
  6. "Sistema Inmune e Inflamación"
  7. "Salud Neurológica y Cognitiva"
  8. "Salud Dental y Estomatognática"
  9. "Salud Visual y Retinografía"
  10. "Salud Dermatológica e Integumentaria"
  11. "Sistemas Renal, Respiratorio y Osteomuscular"
  12. "Desintoxicación y Estrés Oxidativo"
  13. "Protocolo Maestro de Intervención"
  14. "Anexos y Glosario"

PASO 7 — Fecha del examen:
Busca la fecha de realización (no entrega). Formato ISO: YYYY-MM-DD. Null si no encontrada.

Devuelve ESTRICTAMENTE un JSON válido sin bloques markdown:
{
  "exam_date": "2024-03-15",
  "biomarkers": [
    { "name": "Glucosa", "value": "91.0", "unit": "mg/dL", "referenceRange": "74 - 106", "flag": "Normal", "system": "Sistema Metabólico y Energético" }
  ],
  "summary": "Resumen clínico ejecutivo para el médico tratante."
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType: mimeType } }
    ]);

    const text = result.response.text();
    let parsedData: any = null;
    try {
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanText);
    } catch (e) {
      console.error("Error parsing JSON:", text);
      return NextResponse.json({ error: 'Error al interpretar la respuesta de la IA' }, { status: 500 });
    }

    // ── Server-side physiological validation & unit normalization ──────────────
    const { biomarkers: validatedBiomarkers, issues: validationIssues } = validateAndNormalizeBiomarkers(parsedData.biomarkers ?? []);
    parsedData.biomarkers = validatedBiomarkers;

    // ── AI Audit: second pass to verify extraction quality ─────────────────────
    const auditPrompt = `Eres el auditor de calidad médica del sistema PDI.
Se te proporciona el documento de laboratorio original Y los datos ya extraídos y normalizados.

DATOS EXTRAÍDOS (post-normalización):
${JSON.stringify(parsedData.biomarkers, null, 2)}

INSTRUCCIONES:
1. Verifica que cada valor coincida con el documento (considerando conversiones de unidades ya aplicadas)
2. Verifica que el FLAG (Normal/Alto/Bajo) sea correcto
3. Detecta marcadores importantes omitidos
4. Detecta valores todavía fisiológicamente imposibles
5. Detecta nombres de marcadores incorrectos

JSON de respuesta (sin markdown):
{
  "confidence": <0-100>,
  "status": "<ok|warning|error>",
  "issues": [
    { "marker": "<nombre>", "type": "<wrong_value|wrong_flag|wrong_unit|unit_conversion|implausible|wrong_name|missing>", "extracted": "<valor extraído>", "corrected": "<valor correcto>", "note": "<descripción>" }
  ],
  "missing_markers": ["<marcador omitido>"],
  "summary": "<resumen en 1-2 oraciones>"
}
Criterios: ok=confidence≥90 sin issues críticos; warning=70-89 o 1-2 issues; error=<70 o valores imposibles`;

    let audit: any = { confidence: 100, status: 'ok', issues: [], missing_markers: [], summary: 'Auditoría completada.' };
    try {
      const auditResult = await model.generateContent([
        auditPrompt,
        { inlineData: { data: base64, mimeType: mimeType } }
      ]);
      const auditText = auditResult.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
      audit = JSON.parse(auditText);
    } catch (e) {
      console.warn('Audit failed silently:', e);
    }

    // Merge server-side validation issues into audit report
    if (validationIssues.length > 0) {
      audit.issues = [...(audit.issues ?? []), ...validationIssues];
      if (audit.status === 'ok') audit.status = 'warning';
      audit.summary = `${validationIssues.length} corrección(es) de unidades aplicada(s) automáticamente. ${audit.summary ?? ''}`;
    }

    return NextResponse.json({ ...parsedData, audit });

  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
