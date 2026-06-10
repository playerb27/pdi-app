import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Validates the Supabase JWT sent by the browser in the Authorization header.
 *
 * Usage inside an API route:
 *   const authResult = await requireAuth(req);
 *   if (authResult instanceof NextResponse) return authResult; // 401
 *   // authResult is the authenticated user object
 *
 * The browser sends the token automatically because supabase.auth.getSession()
 * stores it in localStorage and we pass it via the Authorization header from
 * the updated fetch helpers in api.ts.
 */
export async function requireAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { error: 'No autorizado — sesión requerida' },
      { status: 401 }
    );
  }

  // Use ANON key to validate the JWT — never the service role key here
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await sb.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: 'No autorizado — token inválido o expirado' },
      { status: 401 }
    );
  }

  return user;
}
