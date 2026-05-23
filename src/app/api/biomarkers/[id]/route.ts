import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/biomarkers/[id]
// Body: { value: string; flag: string }
//
// Uses service_role key (server-side only) so updates bypass RLS policies.
// This is the correct approach — client-side anon key updates are silently
// blocked by RLS, causing the "value reverts on reload" bug.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: biomarkerId } = await params;
    if (!biomarkerId) {
      return NextResponse.json({ error: 'Falta biomarkerId' }, { status: 400 });
    }

    const body = await req.json();
    const { value, flag } = body;

    if (value === undefined || flag === undefined) {
      return NextResponse.json({ error: 'Faltan campos: value y flag son requeridos' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuración de Supabase faltante en el servidor' }, { status: 500 });
    }

    // Use service_role — bypasses all RLS policies
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // MEDICAL SAFETY: original_value is always wiped to null on every edit.
    // The manually-corrected value IS the clinical truth — no old AI value should
    // persist anywhere in the database after a human correction.
    const payload: Record<string, any> = {
      value: String(value),
      flag: String(flag),
      is_edited: true,
      original_value: null,
    };

    const { data: updated, error } = await sb
      .from('biomarkers')
      .update(payload)
      .eq('id', biomarkerId)
      .select('id, value, flag, is_edited, original_value')
      .single();

    if (error) {
      console.error('[PATCH /api/biomarkers] Supabase error:', error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: `Biomarker con id "${biomarkerId}" no encontrado` },
        { status: 404 }
      );
    }

    // Verify the value actually changed in DB
    if (updated.value !== String(value)) {
      console.error('[PATCH /api/biomarkers] Value mismatch after update:', {
        expected: value,
        actual: updated.value,
      });
      return NextResponse.json(
        { error: 'El valor no se actualizó correctamente en la base de datos' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      biomarker: updated,
    });
  } catch (err: any) {
    console.error('[PATCH /api/biomarkers] Unexpected error:', err);
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/biomarkers/[id]
// Deletes a biomarker row entirely (used by "No graficar" / Exclude feature)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: biomarkerId } = await params;
    if (!biomarkerId) {
      return NextResponse.json({ error: 'Falta biomarkerId' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuración de Supabase faltante en el servidor' }, { status: 500 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await sb
      .from('biomarkers')
      .delete()
      .eq('id', biomarkerId);

    if (error) {
      console.error('[DELETE /api/biomarkers] Supabase error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/biomarkers] Unexpected error:', err);
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
