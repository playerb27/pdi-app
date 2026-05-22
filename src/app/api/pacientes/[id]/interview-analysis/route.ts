import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ALL_SECTIONS } from '@/lib/questionnaire-data-ext';



// Map question IDs to their human-readable labels
const questionLabelMap: Record<string, string> = {};
ALL_SECTIONS.forEach(section => {
  section.questions.forEach(q => {
    if (q.id && q.label) {
      questionLabelMap[q.id] = q.label;
    }
  });
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  try {
    const { id: patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // Body may be empty
    }

    const stage = body.stage || 'generate_report';

    // 1. Fetch patient basic info
    const { data: patient, error: patientError } = await sb
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
    }

    // Calculate age
    const age = (() => {
      if (!patient.birth_date) return 'N/D';
      const today = new Date();
      const birth = new Date(patient.birth_date);
      let years = today.getFullYear() - birth.getFullYear();
      let months = today.getMonth() - birth.getMonth();
      if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) { years--; months += 12; }
      if (today.getDate() < birth.getDate()) { months--; if (months < 0) months = 11; }
      return `${years} años y ${months} meses`;
    })();

    if (stage === 'suggest_questions') {
      // --- STAGE 1: SUGGEST DIFFERENTIAL QUESTIONS ---

      // Fetch all interview answers for the patient
      const { data: interviewRows, error: interviewError } = await sb
        .from('interviews')
        .select('question_id, answer')
        .eq('patient_id', patientId);

      if (interviewError || !interviewRows || interviewRows.length === 0) {
        return NextResponse.json({ error: 'No se encontraron respuestas de la entrevista para este paciente' }, { status: 400 });
      }

      // Convert rows to key-value answers map (filter out meta keys)
      const answers = Object.fromEntries(
        interviewRows
          .filter(r => r.question_id !== 'differential_questions' && !r.question_id.startsWith('diff_a_'))
          .map(r => [r.question_id, r.answer])
      );

      // Format Q&A list for prompt
      const qaText = Object.entries(answers)
        .map(([qId, answer]) => {
          const label = questionLabelMap[qId] || qId;
          return `Pregunta: ${label}\nRespuesta: ${answer}`;
        })
        .join('\n\n');

      const prompt = `
Eres un médico especialista de primer nivel y consultor clínico senior para el PDI (Protocolo de Diagnóstico Integral).
Analiza las respuestas de la entrevista clínica del paciente y genera todas las preguntas específicas de diagnóstico diferencial que consideres indispensables de aclarar según sus respuestas previas. El objetivo es ofrecer la mejor atención médica posible al paciente, así que genera todas las preguntas que consideres críticamente necesarias (sin un límite forzado de cantidad).

DATOS DEL PACIENTE:
• Nombre completo: ${patient.full_name}
• Edad: ${age}
• Género: ${patient.gender === 'male' ? 'Masculino' : 'Femenino'}

RESPUESTAS DE LA ENTREVISTA CLÍNICA BASE (Voz del paciente):
${qaText}

Debes responder ÚNICAMENTE con un JSON array válido. Cada objeto del array debe tener la siguiente estructura:
[
  {
    "id": "diff_q_1",
    "question": "Escribe aquí la pregunta clínica sugerida de forma clara, directa y respetuosa para el paciente.",
    "justification": "Escribe aquí la justificación clínica detallada de por qué esta pregunta es indispensable para el diagnóstico diferencial."
  }
]

No incluyas explicaciones de texto, bloques de código markdown (\`\`\`json ... \`\`\`), ni caracteres extraños fuera del JSON array.
`;

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: {
          responseMimeType: 'application/json',
        }
      });
      const result = await model.generateContent(prompt);
      const outputText = result.response.text();

      let questions: any[] = [];
      try {
        questions = JSON.parse(outputText);
      } catch (err: any) {
        console.error('Error parsing Gemini json output:', outputText, err);
        return NextResponse.json({ error: 'La IA devolvió un JSON inválido. Intente de nuevo.' }, { status: 500 });
      }

      // Add indexes to IDs to ensure order matches
      questions = questions.map((q, idx) => ({
        ...q,
        id: `diff_q_${idx + 1}`
      }));

      // Save to database
      const { error: upsertErr } = await sb.from('interviews').upsert({
        patient_id: patientId,
        question_id: 'differential_questions',
        answer: JSON.stringify(questions),
        updated_at: new Date().toISOString()
      }, { onConflict: 'patient_id,question_id' });

      if (upsertErr) {
        console.error('Error saving differential questions:', upsertErr);
        return NextResponse.json({ error: `Error al guardar preguntas: ${upsertErr.message}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        stage: 'suggest_questions',
        questions
      });

    } else {
      // --- STAGE 2: GENERATE FINAL REPORT ---
      const differentialAnswers = body.differentialAnswers || {};

      // 1. Persist the answers to Supabase if any are provided
      const upsertRows = Object.entries(differentialAnswers).map(([qId, ans]) => ({
        patient_id: patientId,
        question_id: qId,
        answer: ans as string,
        updated_at: new Date().toISOString()
      }));

      if (upsertRows.length > 0) {
        const { error: answersUpsertErr } = await sb
          .from('interviews')
          .upsert(upsertRows, { onConflict: 'patient_id,question_id' });

        if (answersUpsertErr) {
          console.error('Error saving differential answers:', answersUpsertErr);
          return NextResponse.json({ error: `Error al guardar respuestas adicionales: ${answersUpsertErr.message}` }, { status: 500 });
        }
      }

      // 2. Fetch all interview rows
      const { data: interviewRows, error: interviewError } = await sb
        .from('interviews')
        .select('question_id, answer')
        .eq('patient_id', patientId);

      if (interviewError || !interviewRows || interviewRows.length === 0) {
        return NextResponse.json({ error: 'No se encontraron respuestas para este paciente' }, { status: 400 });
      }

      const answers = Object.fromEntries(interviewRows.map(r => [r.question_id, r.answer]));

      // Get differential questions from DB
      let diffQuestions: any[] = [];
      if (answers['differential_questions']) {
        try {
          diffQuestions = JSON.parse(answers['differential_questions']);
        } catch (e) {
          console.error('Error parsing differential questions from DB:', e);
        }
      }

      // Filter standard Q&As
      const standardQaText = Object.entries(answers)
        .filter(([qId]) => qId !== 'differential_questions' && !qId.startsWith('diff_q_') && !qId.startsWith('diff_a_'))
        .map(([qId, answer]) => {
          const label = questionLabelMap[qId] || qId;
          return `Pregunta: ${label}\nRespuesta: ${answer}`;
        })
        .join('\n\n');

      // Format differential Q&As
      const diffQaText = diffQuestions.map((q: any) => {
        const ans = answers[q.id.replace('diff_q_', 'diff_a_')] || answers[q.id] || '(No respondida)';
        return `Pregunta de Diagnóstico Diferencial de la IA: ${q.question}\nJustificación clínica: ${q.justification}\nRespuesta: ${ans}`;
      }).join('\n\n');

      // 3. Build Prompt for Gemini
      const prompt = `
Eres un médico especialista de primer nivel y consultor clínico senior para el PDI (Protocolo de Diagnóstico Integral).
Analiza todas las respuestas de la entrevista clínica del paciente (tanto la entrevista base como las preguntas de diagnóstico diferencial sugeridas) y genera un reporte clínico estructurado completo en formato Markdown.

DATOS DEL PACIENTE:
• Nombre completo: ${patient.full_name}
• Edad: ${age}
• Género: ${patient.gender === 'male' ? 'Masculino' : 'Femenino'}

1. RESPUESTAS DE LA ENTREVISTA CLÍNICA BASE (Voz del paciente):
${standardQaText}

${diffQaText ? `2. RESPUESTAS A PREGUNTAS DE DIAGNÓSTICO DIFERENCIAL (IA-Refinamiento):
${diffQaText}` : ''}

ESTRUCTURA REQUERIDA PARA EL REPORTE:

# Análisis Clínico de la Entrevista y Diagnóstico Diferencial
*Generado automáticamente al finalizar la entrevista clínica.*

## 1. Perfil Clínico y Resumen de Hallazgos Clave
Consolida y resume los hallazgos positivos más importantes organizados por sistemas biológicos o áreas de salud relevantes (por ejemplo, cardiovascular, metabólico, sueño, digestivo, endocrino, heredofamiliares). Sé clínico y técnico, citando de manera natural la evidencia provista en la entrevista.

${diffQaText ? `## 2. Hallazgos y Respuestas del Diagnóstico Diferencial Dirigido
Analiza las respuestas dadas a las preguntas adicionales de diagnóstico diferencial. Explica cómo estas respuestas cambian, refinan, confirman o descartan tus sospechas iniciales. Sé muy analítico en esta sección.` : ''}

## 3. Sospechas Diagnósticas Principales y Diagnósticos Diferenciales
Identifica qué posibles diagnósticos médicos o síndromes se sospechan con base en todos los datos (por ejemplo: resistencia a la insulina, disfunción tiroidea, apnea obstructiva del sueño, síndrome de colon irritable, disautonomía, etc.). Justifica clínicamente cada sospecha correlacionando detalladamente los síntomas y antecedentes indicados por el paciente.

## 4. Preguntas Clínicas Adicionales Recomendadas para Consulta Presencial
Genera una lista/tabla de 5 a 10 preguntas específicas y dirigidas que el médico debe realizar en la consulta presencial para terminar de confirmar o descartar las sospechas diagnósticas y orientar el diagnóstico diferencial final.
Para cada pregunta, especifica con total precisión la **Razón médica / Justificación clínica** de por qué es relevante y qué patología o marcador ayuda a diferenciar.

REGLAS CLÍNICAS DE ESCRITURA:
- Escribe en español médico formal, preciso y con alto nivel técnico.
- Evita justificaciones generales, ve al grano de la fisiopatología.
- NO menciones códigos internos de preguntas (s1q8, s5q2, etc.).
- Mantén una estructura de Markdown muy limpia, utilizando encabezados, listas y tablas si es necesario.
`;

      // Call Gemini
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      const result = await model.generateContent(prompt);
      const analysisMarkdown = result.response.text();

      // 4. Save the generated analysis to patient-documents
      const docId = crypto.randomUUID();
      const cleanFileName = `Analisis_Entrevista_${new Date().toISOString().slice(0,10)}.md`;
      const storagePath = `${patientId}/${docId}_${cleanFileName}`;
      const fileBuffer = Buffer.from(analysisMarkdown, 'utf-8');

      // Upload to Supabase Storage
      const { error: uploadErr } = await sb.storage
        .from('patient-documents')
        .upload(storagePath, fileBuffer, {
          contentType: 'text/markdown',
          upsert: true,
        });

      if (uploadErr) {
        console.error('Error uploading interview analysis:', uploadErr);
        return NextResponse.json({ error: `Error guardando archivo: ${uploadErr.message}` }, { status: 500 });
      }

      // Get public URL
      const { data: { publicUrl } } = sb.storage
        .from('patient-documents')
        .getPublicUrl(storagePath);

      // 5. Update patient documents index
      let documents: any[] = [];
      const { data: indexData, error: indexDownloadErr } = await sb.storage
        .from('patient-documents')
        .download(`${patientId}/index.json`);

      if (!indexDownloadErr && indexData) {
        try {
          documents = JSON.parse(await indexData.text());
        } catch (e) {
          documents = [];
        }
      }

      const newDoc = {
        id: docId,
        file_name: cleanFileName,
        file_type: 'otro',
        file_size: fileBuffer.length,
        uploaded_at: new Date().toISOString(),
        notes: 'Análisis clínico de la entrevista y propuesta de preguntas diagnósticas diferenciales generadas por IA.',
        study_id: null,
        storage_path: storagePath,
        public_url: publicUrl,
      };

      documents.push(newDoc);

      const { error: indexUploadErr } = await sb.storage
        .from('patient-documents')
        .upload(`${patientId}/index.json`, Buffer.from(JSON.stringify(documents, null, 2)), {
          contentType: 'application/json',
          upsert: true,
        });

      if (indexUploadErr) {
        console.error('Error saving index with interview analysis:', indexUploadErr);
        return NextResponse.json({ error: `Error guardando índice de documentos: ${indexUploadErr.message}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        document: newDoc,
        analysis: analysisMarkdown
      });
    }

  } catch (err: any) {
    console.error('Error running interview analysis:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
