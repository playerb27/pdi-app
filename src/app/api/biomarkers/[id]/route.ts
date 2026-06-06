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
    const { value, flag, reference_range } = body;

    // reference_range is optional — value+flag OR just reference_range can be sent
    const updatingValue = value !== undefined && flag !== undefined;
    const updatingRange = reference_range !== undefined;

    if (!updatingValue && !updatingRange) {
      return NextResponse.json({ error: 'Se requiere al menos value+flag o reference_range' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuración de Supabase faltante en el servidor' }, { status: 500 });
    }

    // Use service_role — bypasses all RLS policies
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Build update payload (original_value is always wiped to null on value edits)
    const payload: Record<string, any> = {};

    // FIX #8: Validate flag against allowed values before writing to DB
    if (updatingValue) {
      const VALID_FLAGS = ['Normal', 'Alto', 'Bajo', 'Excluido'];
      if (!VALID_FLAGS.includes(String(flag))) {
        return NextResponse.json(
          { error: `Flag inválido: "${flag}". Debe ser uno de: ${VALID_FLAGS.join(', ')}` },
          { status: 400 }
        );
      }
      payload.value = String(value);
      payload.flag = String(flag);
      payload.is_edited = true;
      payload.original_value = null;
    }
    if (updatingRange) {
      payload.reference_range = reference_range;
    }

    const { data: updated, error } = await sb
      .from('biomarkers')
      .update(payload)
      .eq('id', biomarkerId)
      .select('id, value, flag, is_edited, original_value, reference_range')
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

    // BUG-33 fix: compare numerically to avoid false-positives for '9.80' vs '9.8'
    if (updatingValue) {
      const expectedNum = parseFloat(String(value));
      const actualNum = parseFloat(updated.value ?? '');
      const mismatch = isNaN(expectedNum) ? updated.value !== String(value) : Math.abs(expectedNum - actualNum) > 0.000001;
      if (mismatch) {
        console.error('[PATCH /api/biomarkers] Value mismatch after update:', {
          expected: value,
          actual: updated.value,
        });
        return NextResponse.json(
          { error: 'El valor no se actualizó correctamente en la base de datos' },
          { status: 500 }
        );
      }
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

    // FIX #7: Use count to verify a row was actually deleted.
    // We do a SELECT first to check existence, then DELETE.
    const { data: existing } = await sb
      .from('biomarkers')
      .select('id')
      .eq('id', biomarkerId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: `Biomarker con id "${biomarkerId}" no encontrado` },
        { status: 404 }
      );
    }

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
