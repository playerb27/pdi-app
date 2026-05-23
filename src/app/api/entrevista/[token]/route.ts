import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const sb = getSupabase();
  const { token } = await params;

  // Validate token and get patient
  const { data: patient, error: patientError } = await sb
    .from('patients')
    .select('id, full_name, gender, birth_date')
    .eq('interview_token', token)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
  }

  // Fetch interview answers
  const { data: interviewRows, error: interviewError } = await sb
    .from('interviews')
    .select('question_id, answer')
    .eq('patient_id', patient.id);

  if (interviewError) {
    return NextResponse.json({ error: 'Error al obtener respuestas' }, { status: 500 });
  }

  // Filter out doctor notes (keys starting with 'notes_s')
  const answers: Record<string, string> = {};
  for (const row of interviewRows || []) {
    if (!row.question_id.startsWith('notes_s')) {
      answers[row.question_id] = row.answer;
    }
  }

  return NextResponse.json({
    patientId: patient.id,
    patientName: patient.full_name,
    gender: patient.gender,
    birthDate: patient.birth_date,
    answers,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const sb = getSupabase();
  const { token } = await params;

  // Validate token and get patient
  const { data: patient, error: patientError } = await sb
    .from('patients')
    .select('id')
    .eq('interview_token', token)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
  }

  const body = await req.json();
  const { questionId, answer } = body as { questionId: string; answer: string };

  if (!questionId || answer === undefined) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  // Block saving doctor notes
  if (questionId.startsWith('notes_s')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { error: upsertError } = await sb
    .from('interviews')
    .upsert(
      {
        patient_id: patient.id,
        question_id: questionId,
        answer,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'patient_id,question_id' }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
