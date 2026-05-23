import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ALL_SECTIONS } from '@/lib/questionnaire-data-ext';

export const dynamic = 'force-dynamic';

// Build question label map
const questionLabelMap: Record<string, string> = {};
ALL_SECTIONS.forEach(section => {
  section.questions.forEach(q => {
    if (q.id && q.label) {
      questionLabelMap[q.id] = q.label;
    }
  });
});

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const sb = getSupabase();
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const { token } = await params;

  try {
    // Validate token and get patient
    const { data: patient, error: patientError } = await sb
      .from('patients')
      .select('id, full_name, gender, birth_date')
      .eq('interview_token', token)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
    }

    // Fetch all interview answers for patient
    const { data: interviewRows, error: interviewError } = await sb
      .from('interviews')
      .select('question_id, answer')
      .eq('patient_id', patient.id);

    if (interviewError) {
      return NextResponse.json({ error: 'Error al obtener respuestas' }, { status: 500 });
    }

    const rows = interviewRows || [];

    // Check if differential_questions already exists
    const existingDiff = rows.find(r => r.question_id === 'differential_questions');
    if (existingDiff) {
      try {
        const questions = JSON.parse(existingDiff.answer);
        return NextResponse.json({ success: true, questions });
      } catch (e) {
        // If parsing fails, regenerate below
      }
    }

    // Build answers map (excluding notes_s*, diff_a_*, differential_questions)
    const answers: Record<string, string> = {};
    for (const row of rows) {
      if (
        !row.question_id.startsWith('notes_s') &&
        !row.question_id.startsWith('diff_a_') &&
        row.question_id !== 'differential_questions'
      ) {
        answers[row.question_id] = row.answer;
      }
    }

    // Format Q&A text for prompt
    const qaText = Object.entries(answers)
      .map(([qId, answer]) => {
        const label = questionLabelMap[qId] || qId;
        return `Pregunta: ${label}\nRespuesta: ${answer}`;
      })
      .join('\n\n');

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
      },
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

    // Normalize IDs to diff_q_1, diff_q_2, etc.
    questions = questions.map((q, idx) => ({
      ...q,
      id: `diff_q_${idx + 1}`,
    }));

    // Save to interviews table
    const { error: upsertErr } = await sb.from('interviews').upsert(
      {
        patient_id: patient.id,
        question_id: 'differential_questions',
        answer: JSON.stringify(questions),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'patient_id,question_id' }
    );

    if (upsertErr) {
      console.error('Error saving differential questions:', upsertErr);
      return NextResponse.json({ error: `Error al guardar preguntas: ${upsertErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, questions });
  } catch (err: any) {
    console.error('Error generating differential questions:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
