import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-server';

// ─────────────────────────────────────────────────────────────────────────────
// /api/patient/ai-notes
//
// Stores AI notes inside the patients.comparative_groups JSONB column using a
// special sentinel entry { id: '__ai_notes__', type: 'ai_notes', notes: [...] }.
//
// Why: report_modules has a CHECK constraint (module_num 1-5 only), and the
// ai_notes column doesn't exist yet. comparative_groups is a JSONB column that
// definitely exists, and the service_role key bypasses RLS completely.
//
// The comparative groups UI filters out entries where type === 'ai_notes'.
// ─────────────────────────────────────────────────────────────────────────────

const AI_NOTES_SENTINEL = '__ai_notes__';

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server env vars');
  return createClient(url, key);
}

function extractNotes(groups: any[]): any[] {
  const sentinel = groups.find((g: any) => g.id === AI_NOTES_SENTINEL);
  return sentinel?.notes ?? [];
}

function mergeNotes(groups: any[], notes: any[]): any[] {
  const filtered = groups.filter((g: any) => g.id !== AI_NOTES_SENTINEL);
  if (notes.length === 0) return filtered;
  return [...filtered, { id: AI_NOTES_SENTINEL, type: 'ai_notes', notes }];
}

async function readGroups(sb: any, patientId: string): Promise<{ groups: any[]; error: any }> {
  const { data, error } = await sb
    .from('patients')
    .select('comparative_groups')
    .eq('id', patientId)
    .single();
  return { groups: data?.comparative_groups ?? [], error };
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get('patientId');
    if (!patientId) return NextResponse.json({ error: 'patientId requerido' }, { status: 400 });

    const sb = getServerClient();
    const { groups, error } = await readGroups(sb, patientId);
    if (error) {
      console.error('[GET ai-notes]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notes: extractNotes(groups) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { patientId, question, answer } = body;
    if (!patientId || !answer) {
      return NextResponse.json({ error: 'patientId y answer son requeridos' }, { status: 400 });
    }

    const sb = getServerClient();
    const { groups, error: readErr } = await readGroups(sb, patientId);
    if (readErr) {
      console.error('[POST ai-notes] read error:', readErr.message);
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    const existingNotes = extractNotes(groups);
    const newNote = {
      id: crypto.randomUUID(),
      question: question ?? '',
      answer,
      createdAt: new Date().toISOString(),
    };
    const updatedNotes = [...existingNotes, newNote];

    const { error: writeErr } = await sb
      .from('patients')
      .update({ comparative_groups: mergeNotes(groups, updatedNotes) })
      .eq('id', patientId);

    if (writeErr) {
      console.error('[POST ai-notes] write error:', writeErr.message);
      return NextResponse.json({ error: writeErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, note: newNote, total: updatedNotes.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { patientId, noteId } = body;
    if (!patientId || !noteId) {
      return NextResponse.json({ error: 'patientId y noteId son requeridos' }, { status: 400 });
    }

    const sb = getServerClient();
    const { groups, error: readErr } = await readGroups(sb, patientId);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const filtered = extractNotes(groups).filter((n: any) => n.id !== noteId);
    const { error: writeErr } = await sb
      .from('patients')
      .update({ comparative_groups: mergeNotes(groups, filtered) })
      .eq('id', patientId);

    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
