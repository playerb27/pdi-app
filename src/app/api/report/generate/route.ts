import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─── Types ────────────────────────────────────────────────────────────────────
type BiomarkerRow = { name: string; value: string; unit: string; referenceRange?: string; flag: string; system: string };
type StudySnapshot = { date: string; name: string; biomarkers: BiomarkerRow[] };

// ─── Prompt builders per module ───────────────────────────────────────────────

function buildPrompt(
  moduleNum: number,
  patient: { full_name: string; birth_date: string; gender: string; status: string },
  biomarkers: BiomarkerRow[],
  allStudies: StudySnapshot[],
  interviewAnswers: Record<string, string>,
  approvedModules: Record<number, string>
): string {

  const age = (() => {
    if (!patient.birth_date) return '';
    const today = new Date();
    const birth = new Date(patient.birth_date);
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (today.getDate() < birth.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    return `${years} años y ${months} meses`;
  })();

  const alteredBiomarkers = biomarkers.filter(b => b.flag !== 'Normal');
  const biomarkersText = biomarkers.map(b =>
    `• ${b.name}: ${b.value} ${b.unit} [Ref: ${b.referenceRange ?? 'N/D'}] → ${b.flag}`
  ).join('\n');

  // Build longitudinal view: each study is treated as a SEPARATE snapshot regardless of upload date.
  // We use the file name as the identifier (it contains the clinical date like "2026-04-27a.pdf").
  function buildLongitudinalView(): string {
    const studies = allStudies.filter(s => s.biomarkers && s.biomarkers.length > 0);
    if (studies.length <= 1) return biomarkersText;

    // Group by biomarker name across all studies
    const byName: Record<string, { label: string; value: string; unit: string; flag: string }[]> = {};
    studies.forEach(study => {
      // Use file name (stripped of extension) as the label — it has the clinical date
      const label = study.name.replace(/\.[^.]+$/, '').slice(0, 20);
      study.biomarkers.forEach((b: BiomarkerRow) => {
        if (!byName[b.name]) byName[b.name] = [];
        byName[b.name].push({ label, value: b.value, unit: b.unit, flag: b.flag });
      });
    });

    const lines: string[] = [
      `HISTORIAL COMPARATIVO (${studies.length} estudios: ${studies.map(s => s.name.replace(/\.[^.]+$/, '')).join(', ')})\n`,
    ];
    Object.entries(byName).forEach(([name, readings]) => {
      const unit = readings[0]?.unit ?? '';
      if (readings.length === 1) {
        const r = readings[0];
        lines.push(`• ${name}: ${r.value} ${unit} → ${r.flag}`);
      } else {
        const hasAlert = readings.some(r => r.flag !== 'Normal');
        const lastFlag = readings.at(-1)!.flag;
        const firstFlag = readings[0].flag;
        const trendDir = !hasAlert ? '✓ estable'
          : lastFlag !== 'Normal' && firstFlag === 'Normal' ? '↗ empeorando'
          : lastFlag === 'Normal' && firstFlag !== 'Normal' ? '↘ mejorando'
          : '↔ fluctuante';
        const trend = readings.map(r => `[${r.label}]: ${r.value}${r.flag !== 'Normal' ? '⚠' : ''}`).join(' → ');
        lines.push(`• ${name} [${trendDir}]: ${trend} ${unit}`);
      }
    });
    return lines.join('\n');
  }

  const historialText = buildLongitudinalView();


  // Separate doctor notes (notes_s1..s14) from patient answers
  const doctorNotesEntries = Object.entries(interviewAnswers)
    .filter(([k, v]) => k.startsWith('notes_s') && v && v.trim());

  const doctorNotesText = doctorNotesEntries.length > 0
    ? doctorNotesEntries.map(([k, v]) => {
        const sNum = k.replace('notes_s', '');
        return `• [Sistema ${sNum}]: ${v.trim()}`;
      }).join('\n')
    : '';

  // Clean interview text — remove sXqY IDs, notes keys, and differential questions/answers
  const baseInterviewEntries = Object.entries(interviewAnswers)
    .filter(([k, v]) => !k.startsWith('notes_s') && k !== 'differential_questions' && !k.startsWith('diff_q_') && !k.startsWith('diff_a_') && v && v.trim());

  const interviewText = baseInterviewEntries
    .map(([, v]) => '• ' + v.replace(/\|\|/g, ', '))
    .join('\n');

  // Format differential questions and answers if present
  let differentialText = '';
  const diffQuestionsRaw = interviewAnswers['differential_questions'];
  if (diffQuestionsRaw) {
    try {
      const questionsList = JSON.parse(diffQuestionsRaw);
      if (Array.isArray(questionsList) && questionsList.length > 0) {
        const lines = questionsList.map((q: any) => {
          const answer = interviewAnswers[q.id.replace('diff_q_', 'diff_a_')] || interviewAnswers[q.id] || '';
          if (!answer.trim()) return '';
          return `• Pregunta de Diagnóstico Diferencial: ${q.question}\n  Justificación clínica: ${q.justification}\n  Respuesta: ${answer.trim()}`;
        }).filter(Boolean);
        if (lines.length > 0) {
          differentialText = `\nPREGUNTAS ADICIONALES DE DIAGNÓSTICO DIFERENCIAL:\n${lines.join('\n')}`;
        }
      }
    } catch (e) {
      console.error('Error parsing differential questions in report generator:', e);
    }
  }

  const base = `Paciente: ${patient.full_name} | ${age} | ${patient.gender === 'male' ? 'Masculino' : 'Femenino'} | ${patient.status}`;

  // Truncate long module content for use as context (avoid input token overflow)
  function truncate(text: string, maxChars = 3000): string {
    if (!text || text.length <= maxChars) return text;
    return text.slice(0, maxChars) + `\n[... contenido resumido por límite de tokens ...]`;
  }

  // Convert M2 JSON to readable clinical summary for use in M3/M4/M5 context
  function extractM2Summary(m2Content: string): string {
    if (!m2Content) return '';
    try {
      const match = m2Content.match(/```json\s*([\s\S]*?)\s*```/) ?? m2Content.match(/(\{[\s\S]*\})/);
      if (!match) return m2Content.slice(0, 2000); // fallback: truncate raw text
      const d = JSON.parse(match[1]);
      if (!d.systems) return m2Content.slice(0, 2000);
      const lines: string[] = [`Índice global de salud: ${d.overallScore ?? 'N/D'}%`];
      d.systems.forEach((s: any) => {
        lines.push(`\n[${s.alertLevel.toUpperCase()}] ${s.name} (vitalidad: ${s.vitalityScore}%)`);
        s.heroBiomarkers?.forEach((b: any) => {
          lines.push(`  • ${b.name}: ${b.value} ${b.unit} → ${b.flag}${b.trendDir ? ` [${b.trendDir}]` : ''}`);
        });
        if (s.clinicalInterpretation) lines.push(`  → ${s.clinicalInterpretation}`);
        if (s.keyAlert) lines.push(`  ⚡ ${s.keyAlert}`);
      });
      return lines.join('\n');
    } catch { return m2Content.slice(0, 2000); }
  }

  const style = `
INSTRUCCIONES DE ESTILO:
- Escribe en español médico de alto nivel, claro y directo.
- Usa formato Markdown: ##, ###, **negrita**, - listas.
- Sé clínico, preciso, sin frases genéricas ni relleno.
- Cada hallazgo debe tener evidencia explícita (citar valor o respuesta del paciente).
- NO incluyas disclaimers ni frases como "se recomienda consultar a un médico".
- NUNCA incluyas códigos de pregunta (s1q7, s2q3, etc.) en el texto generado.
`;

  switch (moduleNum) {

    case 1: return `${style}
Eres el redactor clínico senior del PDI (Protocolo de Diagnóstico Integral).

Genera el **MÓDULO 1 — PERFIL INTEGRAL DEL PACIENTE** del reporte médico.

${base}

DATOS DE LA ENTREVISTA CLÍNICA (respuestas del paciente):
${interviewText}
${differentialText}
${doctorNotesText ? `
OBSERVACIONES CLÍNICAS DEL MÉDICO (notas del exploración física y evaluación clínica directa):
${doctorNotesText}` : ''}

ESTRUCTURA OBLIGATORIA DEL MÓDULO:
## 1. Datos Generales
## 2. Motivo de Consulta y Expectativas
## 3. Antecedentes Heredofamiliares de Relevancia Clínica
## 4. Antecedentes Personales Patológicos
## 5. Medicamentos y Suplementos Actuales
## 6. Perfil de Riesgo Familiar Consolidado
## 7. Impresión Clínica Inicial (integra las observaciones del médico si las hay)

Sé exhaustivo con la información disponible. No inventes datos, usa solo lo que está en la entrevista.`;

    case 2: return `
Eres el médico internista del PDI. Genera el MÓDULO 2 — ANÁLISIS DE LABORATORIO POR SISTEMAS.

IMPORTANTE: Responde SOLO con el JSON, sin texto antes ni después. Mántente CONCISO: máximo 3 heroBiomarkers por sistema, patientExplanation máximo 1 oración.

JSON requerido (sé compacto en strings):
\`\`\`json
{
  "studyCount": N, "dateRange": "YYYY-MM a YYYY-MM", "overallScore": N,
  "systems": [{
    "name": "str", "icon": "emoji", "vitalityScore": N, "alertLevel": "normal|moderate|critical",
    "heroBiomarkers": [{
      "name": "str", "value": N_o_str, "unit": "str",
      "refMin": N_o_null, "refMax": N_o_null, "flag": "Normal|Alto|Bajo|Crítico",
      "patientExplanation": "1 oración simple",
      "trend": [{"date":"YYYY-MM","value":N}],
      "trendDir": "mejorando|empeorando|estable|fluctuante"
    }],
    "otherBiomarkers": [{"name":"str","value":"str","unit":"str","flag":"str"}],
    "clinicalInterpretation": "2 oraciones técnicas",
    "keyAlert": "str_o_null"
  }]
}
\`\`\`

REGLAS:
- heroBiomarkers: SOLO los 1-3 más importantes (alterados primero)
- otherBiomarkers: resto en rango normal (solo name/value/unit/flag)
- vitalityScore: 100 si todo normal, baja por cada alterado
- Si no hay tendencia longitudinal, trend: [] y omite trendDir
- Omite sistemas sin datos
- Ordena: critical primero

DATOS:
${base}

HISTORIAL (${allStudies.length} estudios):
${historialText}

BIOMARCADORES RECIENTES (${biomarkers.length} total, ${alteredBiomarkers.length} alterados):
${biomarkersText}
`;

    case 3: return `${style}
Eres el clínico integrador del PDI (Protocolo de Diagnóstico Integral).

Genera el **MÓDULO 3 — EVALUACIÓN CLÍNICA SISTÉMICA** del reporte médico.
Este módulo correlaciona los síntomas del paciente con los hallazgos de laboratorio, incluyendo la evolución histórica.

${base}

BIOMARCADORES ACTUALES ALTERADOS (estudio más reciente):
${alteredBiomarkers.length > 0
  ? alteredBiomarkers.map(b => `• ${b.name}: ${b.value} ${b.unit} (Ref: ${b.referenceRange ?? 'N/D'}) → ${b.flag}`).join('\n')
  : '• Ningún biomarcador alterado en el estudio más reciente.'}

HISTORIAL LONGITUDINAL (${allStudies.length} estudios — incluye biomarcadores que ya mejoraron):
${historialText}

RESPUESTAS DE ENTREVISTA CLÍNICA (voz del paciente):
${interviewText}
${differentialText}
${doctorNotesText ? `
OBSERVACIONES CLÍNICAS DEL MÉDICO (hallazgos directos, alta prioridad diagnóstica):
${doctorNotesText}
` : ''}

ESTRUCTURA OBLIGATORIA DEL MÓDULO:
Para cada sistema con síntomas O laboratorio alterado (actual O histórico):
### [Sistema]
- **Síntomas reportados**: (de la entrevista, sin mencionar códigos de pregunta)
- **Observación médica**: (si el médico anotó algo para este sistema, incorpóralo explícitamente)
- **Hallazgos de laboratorio**: (valores actuales relevantes; si hubo alteraciones pasadas que ya mejoraron, mencionarlas brevemente como "previamente alterado, actualmente en recuperación ↘ mejorando")
- **Correlación clínica**: análisis de cómo los síntomas y los labs se explican mutuamente
- **Nivel de preocupación**: 🔴 Alto / 🟡 Moderado / 🟢 Bajo (mejorando) — con justificación de 1 línea

INSTRUCCIÓN CLAVE: Si un biomarcador estuvo alterado en estudios anteriores pero ya normalizó, inclúyelo en el sistema correspondiente con tendencia "↘ mejorando" y nivel 🟢. No lo omitas — forma parte de la historia clínica del paciente.

Sé analítico y breve. Máximo 4 líneas por sección.`;


    case 4: return `${style}
Eres el médico diagnosticador del PDI (Protocolo de Diagnóstico Integral) con experiencia en medicina interna, endocrinología y medicina funcional.

Genera el **MÓDULO 4 — DIAGNÓSTICOS POSIBLES Y CORRELACIONES SISTÉMICAS** del reporte médico.
Este es el módulo más importante. Haz medicina real: razona, correlaciona, diagnostica.

${base}

CONTEXTO CLÍNICO APROBADO POR EL MÉDICO:
${approvedModules[1] ? `=== PERFIL DEL PACIENTE ===\n${truncate(approvedModules[1], 2000)}\n` : ''}
${approvedModules[2] ? `=== ANÁLISIS DE LABORATORIO ===\n${extractM2Summary(approvedModules[2])}\n` : ''}
${approvedModules[3] ? `=== EVALUACIÓN CLÍNICA ===\n${truncate(approvedModules[3], 3000)}\n` : ''}

BIOMARCADORES ALTERADOS (sólo los fuera de rango):
${alteredBiomarkers.map(b => `• ${b.name}: ${b.value} ${b.unit} → ${b.flag}`).join('\n') || 'Ninguno alterado en estudio reciente.'}

ESTRUCTURA OBLIGATORIA DEL MÓDULO:
## 1. Diagnósticos Primarios (alta probabilidad)
Para cada diagnóstico:
### [Número]. [Nombre del diagnóstico]
- **Evidencia de laboratorio**: (citar valores específicos)
- **Evidencia clínica**: (citar síntomas reportados, sin códigos de pregunta)
- **Probabilidad estimada**: Alta / Moderada
- **Criterios diagnósticos cumplidos**: (si aplica)

## 2. Diagnósticos Diferenciales (a descartar)
Lista con evidencia a favor y en contra de cada uno.

## 3. Patrones Multisistémicos Identificados
Correlaciones entre sistemas: ¿qué condición explica múltiples hallazgos?

## 4. Hallazgos que Requieren Atención Urgente
Solo si hay valores críticos o síntomas de alarma.

## 5. Factores de Riesgo Cardiovascular / Metabólico / Oncológico
Cuantificados con la evidencia disponible.

Sé valiente clínicamente. Un médico experto hace diagnósticos, no se esconde en generalidades.`;

    case 5: return `${style}
Eres el médico de intervención del PDI (Protocolo de Diagnóstico Integral).

Genera el **MÓDULO 5 — PLAN DE INTERVENCIÓN INTEGRAL** del reporte médico.

${base}

DIAGNÓSTICO Y CONTEXTO CLÍNICO:
${approvedModules[4] ? approvedModules[4] : 'Ver módulos anteriores.'}

TODOS LOS BIOMARCADORES:
${biomarkersText}

ESTRUCTURA OBLIGATORIA DEL MÓDULO:
## 1. Prioridades de Intervención Inmediata (0-4 semanas)
Acciones urgentes con justificación.

## 2. Plan Farmacológico / Suplementación
Para cada diagnóstico: opciones de tratamiento con dosis orientativas.

## 3. Intervenciones de Estilo de Vida por Sistema
### Nutrición y Alimentación
### Actividad Física
### Gestión del Sueño
### Manejo del Estrés

## 4. Estudios Adicionales Recomendados
Lista priorizada de estudios faltantes que completarían el diagnóstico.

## 5. Metas de Laboratorio a 3 y 6 meses
Para cada biomarcador alterado: meta numérica y cómo alcanzarla.

## 6. Seguimiento y Control
Frecuencia de visitas, qué monitorear y cuándo escalar.

Sé específico y accionable. Cada recomendación debe tener un "por qué" claro.`;

    default: return 'Módulo no reconocido.';
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { moduleNum, patient, biomarkers, allStudies, interviewAnswers, approvedModules } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: moduleNum === 2 ? 16000 : [4, 5].includes(moduleNum) ? 12000 : 8192
      }
    });

    const prompt = buildPrompt(moduleNum, patient, biomarkers, allStudies ?? [], interviewAnswers, approvedModules);
    const result = await model.generateContent(prompt);
    const content = result.response.text();

    return NextResponse.json({ content });

  } catch (error: any) {
    console.error('Report generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
