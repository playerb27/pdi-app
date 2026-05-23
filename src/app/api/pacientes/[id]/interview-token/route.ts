import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getSupabase();
  const { id: patientId } = await params;

  const newToken = crypto.randomUUID();

  const { error } = await sb
    .from('patients')
    .update({ interview_token: newToken })
    .eq('id', patientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pdi-app.vercel.app';

  return NextResponse.json({
    token: newToken,
    url: `${baseUrl}/entrevista/${newToken}`,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getSupabase();
  const { id: patientId } = await params;

  const { error } = await sb
    .from('patients')
    .update({ interview_token: null })
    .eq('id', patientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
