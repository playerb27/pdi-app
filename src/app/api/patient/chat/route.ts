import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { patient, studies, interviewAnswers, chatHistory, message, patientId } = body;

    // If only patientId was provided (e.g. from dashboard brief button), fetch everything
    if (patientId && !patient) {
      const { data: p } = await supabase.from('patients').select('*').eq('id', patientId).single();
      patient = p;
      const { data: studiesData } = await supabase
        .from('studies')
        .select('*, biomarkers(*)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      studies = studiesData ?? [];
      const { data: answers } = await supabase
        .from('interview_answers')
        .select('question_id, answer')
        .eq('patient_id', patientId);
      interviewAnswers = Object.fromEntries((answers ?? []).map((a: any) => [a.question_id, a.answer]));
    }

    if (!patient) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
    chatHistory = chatHistory ?? [];
    const age = (() => {
      if (!patient.birth_date) return '';
      const today = new Date();
      const birth = new Date(patient.birth_date);
      let years = today.getFullYear() - birth.getFullYear();
      let months = today.getMonth() - birth.getMonth();
      if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) { years--; months += 12; }
      if (today.getDate() < birth.getDate()) { months--; if (months < 0) months = 11; }
      return `${years} años y ${months} meses`;
    })();

    // Build the clinical context
    let contextStr = `Eres el Asistente Clínico de Inteligencia Artificial del PDI (Protocolo de Diagnóstico Integral).
Eres un médico especialista de muy alto nivel, experto en todas las ramas médicas y funcionales.
Tu objetivo es responder a las preguntas del usuario (un médico o clínico) sobre este paciente en específico.

REGLAS ESTRICTAS:
1. NO inventes ningún dato. Solo puedes opinar basándote en la información proporcionada a continuación.
2. Sé audaz para detectar problemas o correlaciones sistémicas, pero siempre mantén un tono científico y honesto.
3. Si el usuario pregunta algo que no está en los datos del paciente, dilo claramente, pero ofrece tu opinión médica sobre lo que podría significar en un contexto general.
4. Entiende el contexto clínico global del paciente.

DATOS DEL PACIENTE:
- Nombre: ${patient.full_name}
- Edad: ${age}
- Sexo: ${patient.gender === 'male' ? 'Masculino' : 'Femenino'}
- Estado actual: ${patient.status}

`;

    if (studies && studies.length > 0) {
      contextStr += `ESTUDIOS Y BIOMARCADORES:\n`;
      studies.forEach((study: any) => {
        contextStr += `- Estudio: ${study.name}\n`;
        const altered = study.biomarkers?.filter((b: any) => b.flag !== 'Normal') || [];
        if (altered.length > 0) {
          contextStr += `  Biomarcadores alterados:\n`;
          altered.forEach((b: any) => {
            contextStr += `    * ${b.name}: ${b.value} ${b.unit} (${b.flag}) [Ref: ${b.referenceRange ?? 'N/D'}]\n`;
          });
        }
        const normal = study.biomarkers?.filter((b: any) => b.flag === 'Normal') || [];
        if (normal.length > 0) {
          contextStr += `  Biomarcadores normales clave:\n`;
          normal.slice(0, 15).forEach((b: any) => {
             contextStr += `    * ${b.name}: ${b.value} ${b.unit}\n`;
          });
        }
      });
      contextStr += '\n';
    }

    if (interviewAnswers && Object.keys(interviewAnswers).length > 0) {
      contextStr += `RESPUESTAS A ENTREVISTA CLÍNICA PDI:\n`;
      Object.entries(interviewAnswers).forEach(([q, a]) => {
        contextStr += `- ${q}: ${a}\n`;
      });
      contextStr += '\n';
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    // Initialize chat session with history and system instruction context
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: contextStr + "\n\nEntendido. Ahora responderé únicamente basándome en este perfil clínico." }] },
        { role: 'model', parts: [{ text: "Comprendido. Actuaré como el Asistente Clínico Experto para analizar y opinar sobre este paciente basado estrictamente en sus datos. Estoy listo para tus preguntas." }] },
        ...chatHistory.map((h: any) => ({
          role: h.role, // 'user' or 'model'
          parts: [{ text: h.text }]
        }))
      ]
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    return NextResponse.json({ response: responseText });

  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
