import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAuth } from '@/lib/auth-server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

interface DataPoint {
  date: string;
  value: number;
  flag: string;
}

interface SeriesInput {
  name: string;
  unit: string;
  referenceRange?: string;
  points: DataPoint[];
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const { series }: { series: SeriesInput[] } = await req.json();
    if (!series?.length) {
      return NextResponse.json({ error: 'No series data provided' }, { status: 400 });
    }

    // Build a concise data summary for the prompt
    const dataSummary = series.map(s => {
      const sorted = [...s.points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const trend = last && first ? last.value - first.value : 0;
      const trendPct = first?.value ? ((trend / first.value) * 100).toFixed(1) : '0';
      const trendDir = trend > 0 ? 'ascendente' : trend < 0 ? 'descendente' : 'estable';
      const allFlags = sorted.map(p => p.flag);
      const hasAltered = allFlags.some(f => f !== 'Normal');
      const latestFlag = last?.flag ?? 'Normal';

      const pointsDesc = sorted.map(p => {
        const dateStr = new Date(/^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date + 'T12:00:00' : p.date)
          .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        return `  ${dateStr}: ${p.value} ${s.unit} [${p.flag}]`;
      }).join('\n');

      return `
MARCADOR: ${s.name}
Rango de referencia: ${s.referenceRange ?? 'No especificado'} ${s.unit}
Tendencia: ${trendDir} (${trendPct > '0' ? '+' : ''}${trendPct}% desde el primer registro)
Valor más reciente: ${last?.value} ${s.unit} — Estado: ${latestFlag}
${hasAltered ? '⚠ Presenta valores fuera de rango en algún punto del seguimiento' : '✓ Siempre dentro del rango normal'}
Historial cronológico:
${pointsDesc}`;
    }).join('\n\n---\n');

    // Use gemini-2.0-flash: no thinking mode, no token leakage, cheaper and faster
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { maxOutputTokens: 250, temperature: 0.3 },
    });

    const prompt = `Eres médico especialista. Redacta una nota clínica en español de máximo 3 oraciones sobre estos marcadores de laboratorio. Solo texto corrido, sin markdown, sin encabezados, sin inglés.

${dataSummary}

Nota clínica:`;

    const result = await model.generateContent(prompt);
    const note = result.response.text().trim();

    return NextResponse.json({ note });
  } catch (err: any) {
    console.error('[comparative-note] Error:', err);
    return NextResponse.json({ error: err.message ?? 'Error generating note' }, { status: 500 });
  }
}
