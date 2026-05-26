import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { ALL_SECTIONS } from '@/lib/questionnaire-data-ext';
import { normalizeBiomarkerName } from '@/lib/biomarkers';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─── Types ────────────────────────────────────────────────────────────────────
type BiomarkerRow = { name: string; value: string; unit: string; referenceRange?: string; flag: string; system: string };

// Canonical pivot row — one per normalized biomarker name, across all study dates
type CanonicalRow = {
  name: string;           // display name (from catalog or first occurrence)
  canonical: string;      // normalized key
  unit: string;
  refMin: number | null;
  refMax: number | null;
  system: string;
  readings: { date: string; value: string; flag: string }[];  // sorted oldest → newest
};

type CanonicalTable = {
  studyDates: string[];   // sorted YYYY-MM-DD strings
  latestDate: string;     // most recent study date
  rows: CanonicalRow[];
  rowsBySystem: Record<string, CanonicalRow[]>;
};

// ─── Server-side canonical table builder ──────────────────────────────────────
// Mirrors BiomarkerMasterTable pivot logic — groups by canonical_name,
// sorts chronologically, respects is_edited priority, excludes 'Excluido'.
async function buildCanonicalTable(patientId: string): Promise<CanonicalTable | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch studies with full biomarker data (same fields as BiomarkerMasterTable uses)
  const { data: studies, error } = await sb
    .from('studies')
    .select('id, file_name, exam_date, created_at, biomarkers(id, name, raw_name, canonical_name, canonical_system, value, unit, reference_range, flag, is_edited)')
    .eq('patient_id', patientId)
    .order('exam_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error || !studies || studies.length === 0) return null;

  // Resolve study date — same logic as BiomarkerMasterTable / getStudyDate()
  const getStudyDate = (s: any): string => {
    if (s.exam_date) return s.exam_date.slice(0, 10);
    const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    return fileDate ?? s.created_at?.slice(0, 10) ?? '1970-01-01';
  };

  // Sort studies chronologically
  const sortedStudies = [...studies].sort((a, b) => {
    return getStudyDate(a) < getStudyDate(b) ? -1 : 1;
  });

  // Unique dates (one column per study date)
  const seenDates = new Set<string>();
  const studyDates: string[] = [];
  for (const s of sortedStudies) {
    const d = getStudyDate(s);
    if (!seenDates.has(d)) { seenDates.add(d); studyDates.push(d); }
  }

  // Pivot: group by canonical name
  type Cell = { value: string; flag: string; isEdited: boolean };
  const byCanonical: Map<string, {
    displayName: string;
    unit: string;
    system: string;
    cells: Record<string, Cell>; // date → cell
  }> = new Map();

  for (const study of sortedStudies) {
    const dateKey = getStudyDate(study);
    for (const bm of (study.biomarkers ?? [])) {
      if (bm.flag === 'Excluido') continue;
      const rawStr = String(bm.value ?? '').trim();
      if (!rawStr) continue;

      // Use canonical_name from DB if available; otherwise normalize on the fly
      const canonical = (bm.canonical_name
        ? bm.canonical_name.toLowerCase()
        : normalizeBiomarkerName(bm.raw_name ?? bm.name).toLowerCase()
      );

      const displayName = bm.canonical_name ?? normalizeBiomarkerName(bm.raw_name ?? bm.name);
      const system = bm.canonical_system ?? 'Otros Marcadores';

      if (!byCanonical.has(canonical)) {
        byCanonical.set(canonical, { displayName, unit: bm.unit ?? '', system, cells: {} });
      }
      const entry = byCanonical.get(canonical)!;

      // is_edited wins over non-edited for same date (mirrors BiomarkerMasterTable logic)
      const existing = entry.cells[dateKey];
      const incoming: Cell = { value: rawStr, flag: bm.flag ?? 'Normal', isEdited: !!(bm as any).is_edited };
      if (!existing || (incoming.isEdited && !existing.isEdited)) {
        entry.cells[dateKey] = incoming;
      }
    }
  }

  // Build canonical rows with ordered readings
  const rows: CanonicalRow[] = [];
  byCanonical.forEach((entry, canonical) => {
    const readings = studyDates
      .filter(d => entry.cells[d])
      .map(d => ({
        date: d,
        value: entry.cells[d].value,
        flag: entry.cells[d].flag,
      }));
    if (readings.length === 0) return;
    rows.push({
      name: entry.displayName,
      canonical,
      unit: entry.unit,
      refMin: null,  // not critical for AI context
      refMax: null,
      system: entry.system,
      readings,
    });
  });

  // Group by system
  const rowsBySystem: Record<string, CanonicalRow[]> = {};
  for (const row of rows) {
    if (!rowsBySystem[row.system]) rowsBySystem[row.system] = [];
    rowsBySystem[row.system].push(row);
  }

  return {
    studyDates,
    latestDate: studyDates[studyDates.length - 1] ?? '',
    rows,
    rowsBySystem,
  };
}

// ─── Canonical table → AI prompt text ───────────────────────────────────────
function canonicalTableToText(table: CanonicalTable): string {
  const fmt = (d: string) => {
    // "2026-04-27" → "27-abr-26"
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const [y, m, day] = d.split('-');
    return `${day}-${months[parseInt(m) - 1]}-${y.slice(2)}`;
  };

  const lines: string[] = [
    `TABLA DE LABORATORIO — ${table.studyDates.length} estudios (${fmt(table.studyDates[0])} → ${fmt(table.latestDate)})`,
    `ESTUDIO MÁS RECIENTE: ${table.latestDate} (columna más a la derecha = estado ACTUAL)`,
    '',
  ];

  for (const [system, rows] of Object.entries(table.rowsBySystem)) {
    lines.push(`─── ${system.toUpperCase()} ${'─'.repeat(Math.max(0, 50 - system.length))}`);
    for (const row of rows) {
      const header = `${row.name} (${row.unit})`;
      const cells = row.readings.map(r => `${fmt(r.date)}: ${r.value}${r.flag !== 'Normal' ? '⚠' : '✓'}`);
      lines.push(`  ${header}`);
      lines.push(`    ${cells.join('  |  ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Latest study summary → "current values" for the AI ─────────────────────
function latestStudySummary(table: CanonicalTable): { total: number; altered: number; text: string } {
  const current = table.rows
    .map(r => {
      const last = r.readings[r.readings.length - 1];
      return last ? { name: r.name, unit: r.unit, ...last } : null;
    })
    .filter(Boolean) as { name: string; unit: string; date: string; value: string; flag: string }[];

  const altered = current.filter(c => c.flag !== 'Normal');
  const text = current
    .map(c => `• ${c.name}: ${c.value} ${c.unit} → ${c.flag === 'Normal' ? '✓ Normal' : `⚠ ${c.flag}`}`)
    .join('\n');

  return { total: current.length, altered: altered.length, text };
}

// ─── Clinical history text for modules 3/4/5 ─────────────────────────────────
// Vertical format — one block per biomarker, ALL historical values listed.
// Each reading is labeled with its study index so the AI cannot collapse them.
function buildClinicalHistoryText(table: CanonicalTable): string {
  const totalStudies = table.studyDates.length;

  const lines: string[] = [
    `═══ HISTORIAL CLÍNICO COMPLETO — ${totalStudies} estudios ═══`,
    `INSTRUCCIÓN CRÍTICA: Este historial contiene ${totalStudies} estudios. Debes analizar y citar TODOS los estudios intermedios, no solo el primero y el último.`,
    `Fechas de los ${totalStudies} estudios: ${table.studyDates.map((d, i) => `Estudio ${i + 1} (${d})`).join(' | ')}`,
    `ESTUDIO ACTUAL (más reciente): ${table.latestDate} = Estudio ${totalStudies}`,
    '',
  ];

  for (const [system, rows] of Object.entries(table.rowsBySystem)) {
    lines.push(`▶ ${system.toUpperCase()}`);
    for (const row of rows) {
      if (row.readings.length === 0) continue;
      const last = row.readings[row.readings.length - 1];
      const isActual = (r: { date: string }) => r.date === table.latestDate;

      // Compute trend across ALL readings (not just first vs last)
      let trendTag = '';
      if (row.readings.length > 1) {
        const firstFlag = row.readings[0].flag;
        const lastFlag = last.flag;
        const anyAltered = row.readings.some(r => r.flag !== 'Normal');
        const numAltered = row.readings.filter(r => r.flag !== 'Normal').length;
        const trendNote = row.readings.length > 2
          ? ` — ${numAltered}/${row.readings.length} estudios alterados`
          : '';
        trendTag = !anyAltered ? ` [↔ siempre normal en ${row.readings.length} estudios]`
          : lastFlag === 'Normal' && firstFlag !== 'Normal' ? ` [↘ MEJORÓ — era ${firstFlag}, ahora Normal${trendNote}]`
          : lastFlag !== 'Normal' && firstFlag === 'Normal' ? ` [↗ EMPEORÓ — era Normal, ahora ${lastFlag}${trendNote}]`
          : ` [⇿ fluctuante${trendNote}]`;
      }

      // Label each reading with its study number so AI can't collapse to first/last
      lines.push(`  ${row.name} (${row.unit}) — ${row.readings.length} mediciones${trendTag}`);
      for (const r of row.readings) {
        const studyIdx = table.studyDates.indexOf(r.date) + 1;
        const marker = isActual(r) ? ' ◄ ACTUAL' : '';
        const flag = r.flag !== 'Normal' ? ` ⚠ ${r.flag}` : ' ✓';
        lines.push(`    [Estudio ${studyIdx}/${totalStudies}] ${r.date}: ${r.value}${flag}${marker}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Module 2 post-processor ─────────────────────────────────────────────────
// The AI cannot be trusted to pick the right numeric value from a text table.
// After the AI generates the JSON, we overwrite every heroBiomarker's value,
// flag, and trend array with ground-truth data straight from canonicalTable.
function fixModule2Json(raw: string, table: CanonicalTable): string {
  try {
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
    const data = JSON.parse(jsonStr);
    if (!data.systems) return raw;

    // Index canonical rows by every possible name variant for fast lookup
    const byKey = new Map<string, CanonicalRow>();
    for (const row of table.rows) {
      byKey.set(row.canonical.toLowerCase(), row);
      byKey.set(row.name.toLowerCase(), row);
    }

    const findRow = (aiName: string): CanonicalRow | undefined => {
      const key = aiName.toLowerCase().trim();
      if (byKey.has(key)) return byKey.get(key);
      // Partial match — find the canonical row whose name is contained in the AI name or vice-versa
      for (const [k, row] of byKey) {
        if (key.includes(k) || k.includes(key)) return row;
      }
      return undefined;
    };

    // Helper: compute months elapsed since a YYYY-MM-DD date string
    const monthsSince = (dateStr: string): number => {
      const d = new Date(dateStr + 'T12:00:00');
      if (isNaN(d.getTime())) return 0;
      const now = new Date();
      return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    };

    for (const system of data.systems) {
      for (const hero of (system.heroBiomarkers ?? [])) {
        const row = findRow(hero.name ?? '');
        if (!row || row.readings.length === 0) continue;
        const last = row.readings[row.readings.length - 1];
        // Override value and flag with DB ground truth
        hero.value = isNaN(Number(last.value)) ? last.value : Number(last.value);
        hero.flag = last.flag;
        // Attach data age so the UI can show a staleness warning
        hero.dataAgeMonths = monthsSince(last.date);
        // Override trend with ALL readings from DB
        hero.trend = row.readings.map(r => ({
          date: r.date.slice(0, 7),   // YYYY-MM
          value: isNaN(Number(r.value)) ? r.value : Number(r.value),
        }));
        // Recalculate trendDir from actual readings
        if (row.readings.length > 1) {
          const first = row.readings[0].flag;
          const lastF = last.flag;
          const anyAltered = row.readings.some(r => r.flag !== 'Normal');
          hero.trendDir = !anyAltered ? 'estable'
            : lastF === 'Normal' && first !== 'Normal' ? 'mejorando'
            : lastF !== 'Normal' && first === 'Normal' ? 'empeorando'
            : 'fluctuante';
        }
      }
      // Fix otherBiomarkers too
      for (const other of (system.otherBiomarkers ?? [])) {
        const row = findRow(other.name ?? '');
        if (!row || row.readings.length === 0) continue;
        const last = row.readings[row.readings.length - 1];
        other.value = last.value;
        other.flag = last.flag;
      }
    }

    // Fix top-level dateRange and studyCount
    data.studyCount = table.studyDates.length;
    if (table.studyDates.length > 0) {
      data.dateRange = `${table.studyDates[0].slice(0,7)} a ${table.latestDate.slice(0,7)}`;
    }

    return JSON.stringify(data);
  } catch {
    return raw; // If anything fails, return original
  }
}

// ─── Prompt builders per module ───────────────────────────────────────────────

function buildPrompt(
  moduleNum: number,
  patient: { full_name: string; birth_date: string; gender: string; status: string },
  canonicalTable: CanonicalTable,
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

  const labTableText = canonicalTableToText(canonicalTable);
  const clinicalHistoryText = buildClinicalHistoryText(canonicalTable);

  const latest = latestStudySummary(canonicalTable);
  const alteredBiomarkersText = canonicalTable.rows
    .map(r => { const l = r.readings[r.readings.length - 1]; return l && l.flag !== 'Normal' ? `• ${r.name}: ${l.value} ${r.unit} → ${l.flag}` : null; })
    .filter(Boolean)
    .join('\n') || '• Ninguno alterado en el estudio más reciente.';

  // Separate doctor notes (notes_s1..s14) from patient answers
  const doctorNotesEntries = Object.entries(interviewAnswers)
    .filter(([k, v]) => k.startsWith('notes_s') && v && v.trim());

  const doctorNotesText = doctorNotesEntries.length > 0
    ? doctorNotesEntries.map(([k, v]) => {
        const sNum = k.replace('notes_s', '');
        return `• [Sistema ${sNum}]: ${v.trim()}`;
      }).join('\n')
    : '';

  // Build a lookup map: questionId → { label, sectionNum, sectionTitle }
  type QMeta = { label: string; sectionNum: number; sectionTitle: string };
  const questionMeta: Record<string, QMeta> = {};
  for (const section of ALL_SECTIONS) {
    for (const q of section.questions) {
      if (q.id && q.label) {
        questionMeta[q.id] = { label: q.label, sectionNum: section.num, sectionTitle: section.title };
      }
    }
  }

  // Build interview text GROUPED BY SECTION — each section = one clinical domain
  // Skip: notes keys, differential keys, empty values
  const filteredEntries = Object.entries(interviewAnswers)
    .filter(([k, v]) =>
      !k.startsWith('notes_s') &&
      k !== 'differential_questions' &&
      !k.startsWith('diff_q_') &&
      !k.startsWith('diff_a_') &&
      v && v.trim()
    );

  // Group by section
  const bySection: Record<number, { title: string; lines: string[] }> = {};
  for (const [k, v] of filteredEntries) {
    const meta = questionMeta[k];
    const sNum = meta?.sectionNum ?? 99;
    const sTitle = meta?.sectionTitle ?? 'Otros datos';
    const label = meta?.label ?? k;
    if (!bySection[sNum]) bySection[sNum] = { title: sTitle, lines: [] };
    bySection[sNum].lines.push(`  • ${label}: ${v.replace(/\|\|/g, ', ')}`);
  }

  const interviewText = Object.entries(bySection)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, { title, lines }]) => `[${title}]\n${lines.join('\n')}`)
    .join('\n\n');

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

    case 1: return `
Eres el clínico redactor del PDI (Protocolo de Diagnóstico Integral). Tu tarea es construir el MÓDULO 1 — PERFIL INTEGRAL DEL PACIENTE, que sirve como la historia clínica de apertura del reporte médico. Este documento será leído por el médico tratante y debe reflejar con precisión y profundidad quién es este paciente, qué lo trae aquí, y cuál es su contexto clínico completo.

PACIENTE: ${patient.full_name} | ${age} | ${patient.gender === 'male' ? 'Masculino' : 'Femenino'}

════════════════════════════════════════
ENTREVISTA CLÍNICA COMPLETA (organizada por sistema)
════════════════════════════════════════
${interviewText}
${differentialText ? `\n════════════════════════════════════════\nPREGUNTAS DE DIAGNÓSTICO DIFERENCIAL\n════════════════════════════════════════\n${differentialText}` : ''}
${doctorNotesText ? `\n════════════════════════════════════════\nNOTAS CLÍNICAS DEL MÉDICO (hallazgos directos de la exploración)\n════════════════════════════════════════\n${doctorNotesText}` : ''}

════════════════════════════════════════
INSTRUCCIONES DE FORMATO Y REDACCIÓN
════════════════════════════════════════

FORMATO OBLIGATORIO — el renderer del sistema procesa Markdown enriquecido:
- ## para títulos de sección (h2 con línea inferior)
- ### para subsecciones de sistema (h3 dorado)
- **negrita** para valores, hallazgos claves y términos clínicos importantes
- Tablas Markdown (| Col | Col |) para datos demográficos y medicamentos
- Líneas > al inicio para callouts de hallazgos claves importantes (se renderizan como cajas doradas)
- --- para separadores entre secciones cuando mejore la lectura
- Listas con - solo para elementos enumerables (antecedentes, diagnósticos, medicamentos)
- El resto: párrafos cortos y densos (máx 4-5 líneas cada uno), NUNCA texto corrido largo

ESTILO: Español médico de alto nivel. Preciso, directo, sin relleno. NUNCA menciones códigos de pregunta (s1q7, etc.). NUNCA disclaimers.

REGLA CRÍTICA: Solo incluye lo que está en la entrevista. Las respuestas negativas clínicamente relevantes ("no fuma", "sin cirugías previas") se mencionan brevemente como contexto protector — no silencio, sino afirmación positiva.

════════════════════════════════════════
ESTRUCTURA OBLIGATORIA
════════════════════════════════════════

## 1. Datos Generales
Genera una tabla Markdown con las columnas | Campo | Valor | para todos los datos disponibles:
- Nombre completo, Edad exacta, Sexo, Estado civil, Ocupación
- Si hay: Peso, Talla, IMC (calcula: peso/talla²), Circunferencia de cintura
- Interpretación del IMC entre paréntesis: <18.5 Bajo peso | 18.5–24.9 Normopeso | 25–29.9 Sobrepeso | ≥30 Obesidad
- Si hay: Lateralidad, Etnia, Tensión arterial conocida
Después de la tabla, 1-2 oraciones de contexto ocupacional si aportan relevancia clínica.

---

## 2. Motivo de Consulta y Expectativas
Párrafo de 3-4 oraciones: motivo principal, última vez que tuvo checkup, autopercepción de salud (escala: 1-3=mala, 4-6=regular, 7-8=buena, 9-10=excelente), metas que desea lograr.

> Si hay síntomas principales que el paciente menciona explícitamente como motivo, destacarlos aquí en este callout.

---

## 3. Antecedentes Heredofamiliares
Lista con - de las enfermedades familiares reportadas. Si hay cáncer, especifica tipo y parentesco.
Si no hay antecedentes: "Sin antecedentes heredofamiliares de relevancia reportados."

> Si hay acumulación de riesgo (ej: diabetes + hipertensión + infarto en familia directa), señalarlo como hallazgo de alerta.

---

## 4. Antecedentes Personales Patológicos
Lista con - los diagnósticos actuales conocidos, hospitalizaciones previas (con causa), cirugías previas (con año), alergias. Solo los que estén presentes en la entrevista.

---

## 5. Medicamentos y Suplementos Actuales
Tabla Markdown con columnas | Medicamento / Suplemento | Dosis | Frecuencia | si los datos están disponibles. Si no hay ninguno: "Sin medicamentos ni suplementos activos reportados."

---

## 6. Perfil Clínico Multisistémico
Este es el corazón del módulo. Documenta TODOS los sistemas con datos en la entrevista. Para cada uno:

### ⚡ Sistema Metabólico y Energético
(peso, composición corporal, energía, sueño, nutrición, actividad física) — 3-5 oraciones. **Negrita** para hallazgos relevantes.

Repite el mismo patrón para:
### ❤️ Salud Cardiovascular y Circulatoria
### 🧬 Sistema Endocrino / Hormonal
(tiroides, glucosa, hormonas sexuales, vitamina D)
### 🦠 Función Digestiva y Microbiota
### 🛡️ Sistema Inmune e Inflamación
(autoinmunidad, alergias, infecciones, historial COVID)
### 🧠 Salud Neurológica y Cognitiva
(memoria, concentración, salud mental, cefaleas, neuropatía periférica)
### 🦷 Salud Dental y Estomatognática
### 👁️ Salud Visual y Oftalmológica
### 🧴 Salud Dermatológica e Integumentaria
### 🫁 Sistema Renal, Respiratorio y Osteomuscular
### 🔬 Desintoxicación y Estrés Oxidativo
(alcohol, tabaco, sustancias, exposición a tóxicos)
### 📌 Motivación, Metas y Disposición para el Cambio

Para cada sistema: 3-5 oraciones que capturen síntomas presentes, hábitos, diagnósticos previos, nivel de función, factores de riesgo y factores protectores. Los sistemas sanos se documentan brevemente en positivo (1-2 oraciones). Usa **negrita** para hallazgos clínicamente relevantes.

> Si hay un hallazgo destacado en un sistema, anótalo en un callout > inmediatamente después del párrafo.

Omite un sistema SOLO si la sección de la entrevista correspondiente está completamente vacía.

---

## 7. Impresión Clínica Inicial
${doctorNotesText ? 'Integra primero las notas clínicas del médico con la información de la entrevista. ' : ''}Párrafo de 4-6 oraciones: quién es este paciente, su carga de riesgo global, sus fortalezas de salud, y los sistemas que merecen mayor atención diagnóstica. Esta sección sirve como hilo conductor hacia los módulos siguientes.

> Destaca aquí el hallazgo o patrón más relevante de todo el perfil que el médico no debe perder de vista.`;

    case 2: return `
Eres el médico internista del PDI. Genera el MÓDULO 2 — ANÁLISIS DE LABORATORIO POR SISTEMAS.

IMPORTANTE: Responde SOLO con el JSON, sin texto antes ni después. Sé conciso: máximo 3 heroBiomarkers por sistema, patientExplanation máximo 1 oración.

📌 ENFOQUE: Analiza el CASO COMPLETO — no solo el último estudio. Un médico revisa el historial completo, identifica tendencias y da un diagnóstico del estado del paciente en el tiempo. Los scores y la interpretación clínica deben reflejar este panorama completo.

JSON requerido:
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
    "clinicalInterpretation": "2 oraciones técnicas considerando la historia completa del paciente",
    "keyAlert": "str_o_null"
  }]
}
\`\`\`

REGLAS:
- heroBiomarkers: los 1-3 más importantes (alterados primero, o con tendencia preocupante aunque ahora estén normales)
- trend: incluye TODOS los estudios donde el marcador aparece, en orden cronológico
- trendDir: basado en la dirección del historial completo
- vitalityScore: 100 = perfecto; baja por alteraciones actuales Y por historial de problemas
- clinicalInterpretation: analiza el patrón de todo el caso, no solo el último resultado
- Omite sistemas sin datos. Ordena: critical primero.
- ANTIGÜEDAD DE DATOS: Si el único dato disponible de un marcador es de hace >18 meses, NO uses alertLevel "critical" solo por ese marcador. Baja el alertLevel a "moderate" y en keyAlert indica "Dato de [año] — requiere actualización". Un dato antiguo puede haber cambiado; no iguales datos viejos a alarmas actuales.

DATOS DEL PACIENTE:
${base}

HISTORIAL COMPLETO DE LABORATORIO (TODAS las fechas — usa para calcular trend y trendDir):
${labTableText}

⚠️ PARA EL CAMPO "value": usa el valor más reciente disponible del marcador.
Lista de valores del estudio más reciente (${canonicalTable.latestDate}):
${latest.text}

Total último estudio: ${latest.total} marcadores | ${latest.altered} alterados.
`;

    case 3: return `${style}
Eres el clínico integrador del PDI (Protocolo de Diagnóstico Integral).

Genera el **MÓDULO 3 — EVALUACIÓN CLÍNICA SISTÉMICA** del reporte médico.

⚠️ REGLA CRÍTICA — ANÁLISIS DE TODOS LOS ESTUDIOS:
Este paciente tiene ${canonicalTable.studyDates.length} estudios (${canonicalTable.studyDates.join(', ')}).
DEBES analizar y citar los valores de CADA UNO de los ${canonicalTable.studyDates.length} estudios para cada biomarcador.
PROHIBIDO resumir el historial mostrando solo el primer y último valor — eso borra la evolución clínica real.
Si un marcador tiene 5 mediciones, muestra las 5. Si tiene 3, muestra las 3.

📌 MISIÓN: Haz la clínica del caso COMPLETO. Eres un médico que lee todo el expediente, identifica tendencias en el tiempo, y conecta cada síntoma con su evidencia de laboratorio a lo largo de la historia del paciente.

${base}

════════════════════════════════════════════════════════
DATOS DE LABORATORIO — HISTORIAL COMPLETO DEL PACIENTE
(Cada biomarcador lista TODOS sus estudios en orden cronológico [Estudio 1/N → Estudio N/N].
 El marcador ◄ ACTUAL indica el estudio más reciente: ${canonicalTable.latestDate})
════════════════════════════════════════════════════════
${clinicalHistoryText}

BIOMARCADORES ALTERADOS EN EL ESTUDIO ACTUAL (${canonicalTable.latestDate}):
${alteredBiomarkersText}

════════════════════════════════════════════════════════
ENTREVISTA CLÍNICA — VOZ DEL PACIENTE
════════════════════════════════════════════════════════
${interviewText}
${differentialText}
${doctorNotesText ? `
OBSERVACIONES DIRECTAS DEL MÉDICO (prioridad alta):
${doctorNotesText}
` : ''}

ESTRUCTURA OBLIGATORIA DEL MÓDULO:
Para cada sistema con síntomas O laboratorio alterado (actual O histórico):
### [Sistema]
- **Síntomas reportados**: (de la entrevista, sin mencionar códigos)
- **Observación médica**: (si el médico anotó algo, incorpóralo)
- **Hallazgos de laboratorio**: Lista TODOS los valores de CADA estudio del paciente en orden cronológico.
  Formato obligatorio: "[Estudio 1] fecha: valor → [Estudio 2] fecha: valor → ... → [Estudio N] fecha: valor ◄ actual"
  NUNCA omitas estudios intermedios. Si un marcador tiene 5 mediciones, escríbelas todas.
  Si el valor mejoró: documenta el valor alterado original, los intermedios, Y el actual normalizado.
- **Correlación clínica**: cómo los síntomas y los labs se explican mutuamente a través del tiempo, citando la evolución completa
- **Nivel de preocupación**: 🔴 Alto / 🟡 Moderado / 🟢 Bajo (mejorando) — justificación de 1 línea basada en la tendencia COMPLETA

REGLAS:
- Usa los valores exactos del historial de arriba (no inventes ni estimes valores)
- Un marcador que mejoró NO desaparece — se documenta como "↘ en recuperación" con nivel 🟢
- Marca tendencias BASADAS EN TODOS LOS ESTUDIOS: ↗ empeorando | ↘ mejorando | ↔ estable | ⇿ fluctuante
- Si un marcador estuvo alterado en estudios intermedios pero no en el primero o el último, eso es clinicamente importante — menciónalo
- Conecta siempre los síntomas del paciente con los datos de laboratorio de toda la historia

Sé analítico y preciso. Máximo 5 líneas por sección.`;



    case 4: return `${style}
Eres el médico diagnosticador del PDI (Protocolo de Diagnóstico Integral) con experiencia en medicina interna, endocrinología y medicina funcional.

Genera el **MÓDULO 4 — DIAGNÓSTICOS POSIBLES Y CORRELACIONES SISTÉMICAS** del reporte médico.
Este es el módulo más importante. Haz medicina real: razona, correlaciona, diagnostica.

${base}

CONTEXTO CLÍNICO APROBADO POR EL MÉDICO:
${approvedModules[1] ? `=== PERFIL DEL PACIENTE ===\n${truncate(approvedModules[1], 2000)}\n` : ''}
${approvedModules[2] ? `=== ANÁLISIS DE LABORATORIO ===\n${extractM2Summary(approvedModules[2])}\n` : ''}
${approvedModules[3] ? `=== EVALUACIÓN CLÍNICA ===\n${truncate(approvedModules[3], 3000)}\n` : ''}

BIOMARCADORES ALTERADOS (estudio más reciente):
${alteredBiomarkersText}

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

TABLA CANÓNICA DE LABORATORIO:
${labTableText}

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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { moduleNum, patient, patientId, interviewAnswers, approvedModules } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 });
    }

    // Build canonical table server-side — same data as the master table the doctor sees.
    const resolvedPatientId = patientId ?? patient?.id;
    console.log('[report/generate] patientId:', resolvedPatientId, '| SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL, '| SERVICE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    const canonicalTable = resolvedPatientId
      ? await buildCanonicalTable(resolvedPatientId)
      : null;

    console.log('[report/generate] canonicalTable:', canonicalTable
      ? `✅ ${canonicalTable.rows.length} filas | fechas: ${canonicalTable.studyDates.join(', ')} | última: ${canonicalTable.latestDate}`
      : '❌ NULL — query falló o no hay datos'
    );

    if (canonicalTable) {
      // Log TSH specifically to trace the issue
      const tsh = canonicalTable.rows.find(r => r.canonical.includes('tsh') || r.canonical.includes('tiroides'));
      if (tsh) console.log('[report/generate] TSH row:', JSON.stringify(tsh.readings));
    }

    if (!canonicalTable || canonicalTable.rows.length === 0) {
      return NextResponse.json(
        { error: 'No hay datos de laboratorio disponibles. Asegúrate de que los estudios estén guardados.' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: moduleNum === 1 ? 16000 : moduleNum === 2 ? 16000 : [4, 5].includes(moduleNum) ? 12000 : 8192
      }
    });

    const prompt = buildPrompt(moduleNum, patient, canonicalTable, interviewAnswers, approvedModules);
    const result = await model.generateContent(prompt);
    let content = result.response.text();

    // Module 2: override all numeric values with ground-truth from canonical table.
    // The AI is only trusted for interpretive text, never for numbers.
    if (moduleNum === 2) {
      content = fixModule2Json(content, canonicalTable);
    }

    return NextResponse.json({ content });

  } catch (error: any) {
    console.error('Report generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
