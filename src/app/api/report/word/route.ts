import { generateWordReport } from '@/lib/generateWordReport';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { patient, modules } = await req.json();
    const buffer = await generateWordReport(patient, modules);
    // Convert Node Buffer → Uint8Array so NextResponse (BodyInit) accepts it
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="PDI_Reporte_${(patient.full_name ?? 'Paciente').replace(/\s+/g, '_')}.docx"`,
      },
    });
  } catch (err: any) {
    console.error('Word generation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
