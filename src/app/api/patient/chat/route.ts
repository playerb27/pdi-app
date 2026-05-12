import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { patient, studies, interviewAnswers, chatHistory, message } = await req.json();

    if (!patient) return NextResponse.json({ error: 'Datos del paciente requeridos' }, { status: 400 });

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

`;

    if (studies && studies.length > 0) {
      contextStr += `ESTUDIOS Y BIOMARCADORES:\n`;
      studies.forEach((study: any) => {
        const dateLabel = study.exam_date ?? study.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? study.created_at?.slice(0, 10);
        contextStr += `- Estudio (${dateLabel}):\n`;
        const altered = study.biomarkers?.filter((b: any) => b.flag !== 'Normal') || [];
        if (altered.length > 0) {
          contextStr += `  Biomarcadores alterados:\n`;
          altered.forEach((b: any) => {
            contextStr += `    * ${b.name}: ${b.value} ${b.unit} (${b.flag}) [Ref: ${b.referenceRange ?? b.reference_range ?? 'N/D'}]\n`;
          });
        }
        const normal = study.biomarkers?.filter((b: any) => b.flag === 'Normal') || [];
        if (normal.length > 0) {
          contextStr += `  Biomarcadores normales:\n`;
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

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: contextStr + '\n\nEntendido. Ahora responderé únicamente basándome en este perfil clínico.' }] },
        { role: 'model', parts: [{ text: 'Comprendido. Actuaré como el Asistente Clínico Experto para analizar y opinar sobre este paciente basado estrictamente en sus datos. Estoy listo para tus preguntas.' }] },
        ...(chatHistory ?? []).map((h: any) => ({
          role: h.role,
          parts: [{ text: h.text }]
        }))
      ]
    });

    const result = await chat.sendMessage(message);
    return NextResponse.json({ response: result.response.text() });

  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
