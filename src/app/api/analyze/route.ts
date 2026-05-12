import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { base64, mimeType } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta GEMINI_API_KEY en variables de entorno' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const prompt = `Eres el motor de análisis del Protocolo de Diagnóstico Integral (PDI), un sistema médico de élite con capacidad de lectura clínica avanzada.

PASO 1 — Comprende la estructura del documento antes de extraer:
Antes de extraer cualquier dato, identifica qué columnas existen en el documento. Los laboratorios clínicos suelen tener:
- Una columna de RESULTADO o VALOR (el dato MEDIDO en este paciente específico)
- Una columna de VALORES DE REFERENCIA, RANGO NORMAL, REFERENCIA (rangos esperados para la población)
Estas columnas pueden estar en cualquier orden o disposición.

PASO 2 — Identifica qué es el valor del paciente vs qué es referencia:
El VALOR DEL PACIENTE es único por marcador y corresponde a la medición realizada en esa muestra.
Los VALORES DE REFERENCIA son rangos o categorías (Normal, Límite alto, Alto, Muy alto, Deseable, Óptimo, Riesgo alto, etc.) con sus umbrales numéricos.

PASO 3 — Reglas de extracción:
✅ Extrae UNA entrada por marcador con el valor MEDIDO del paciente.
✅ Consolida toda la tabla de referencia de ese marcador en UN SOLO string de referencia legible (ej: "< 150 mg/dL", "74 - 106", "< 200 deseable").
✅ El valor del paciente para cada marcador está en la MISMA LÍNEA que el nombre del marcador (o inmediatamente a su derecha en formato tabular).
❌ IGNORA completamente las filas de conversión de unidades: líneas que contienen "FCSI", "Factor de conversión", "= X nmol/L", "= X pmol/L", "= X mmol/L" o similares. Estas NO son resultados — son conversiones matemáticas del laboratorio. NO las uses como valores ni como nombres de marcadores.
❌ No extraigas las filas de referencia (Normal, Límite alto, Alto, Muy alto, Mayor a, Menor a, Deseable, Óptimo) como si fueran marcadores individuales.
❌ No extraigas notas metodológicas (Método: Colorimétrico, Método: Cinética, etc.).
❌ No extraigas cálculos intermedios que no sean resultados clínicos relevantes (salvo que sean un marcador reconocido como BUN/Creatinina, Índice aterogénico, etc.).
❌ NUNCA uses el valor de una fila FCSI o de conversión como el valor de un marcador.

EJEMPLO DE FORMATO CON FCSI (común en laboratorios mexicanos):
  TIROXINA LIBRE (FT4) EN SANGRE    0.98    ng/dL    0.70 - 1.48
  FCSI = 12.87    12.61 nmol/L                              ← IGNORAR COMPLETAMENTE
  HORMONA ESTIMULANTE (TSH)         5.276   µIU/mL   0.300 - 4.200
→ FT4 = 0.98 ng/dL ✅ | TSH = 5.276 µIU/mL ✅ (nunca confundir entre sí)

PASO 4 — Para cada biomarcador real extrae:
- name: nombre clínico limpio del marcador
- value: valor numérico exacto medido en el paciente (de la misma línea que el nombre)
- unit: unidad de medida
- referenceRange: resumen del rango de referencia en una sola expresión clara (ej: "74 - 106", "< 150", "< 200 deseable / 200-239 límite")
- flag: "Normal", "Alto" o "Bajo" — determinado comparando el valor del paciente contra los rangos de referencia del documento
- system: clasifícalo en UNO de estos 14 sistemas:
  1. "Fundamentos y Resumen Ejecutivo"
  2. "Sistema Metabólico y Energético"
  3. "Salud Cardiovascular y Circulatoria"
  4. "Sistema Endocrino (Hormonal)"
  5. "Función Digestiva y Microbiota"
  6. "Sistema Inmune e Inflamación"
  7. "Salud Neurológica y Cognitiva"
  8. "Salud Dental y Estomatognática"
  9. "Salud Visual y Retinografía"
  10. "Salud Dermatológica e Integumentaria"
  11. "Sistemas Renal, Respiratorio y Osteomuscular"
  12. "Desintoxicación y Estrés Oxidativo"
  13. "Protocolo Maestro de Intervención"
  14. "Anexos y Glosario"

PASO 5 — Fecha del examen:
Busca en el documento la FECHA en que se realizó el examen (no la fecha de entrega ni de impresión si son diferentes).
Busca campos como: "Fecha de toma", "Fecha de muestra", "Fecha", "F. Recepción", "Date", etc.
Devuelve la fecha en formato ISO YYYY-MM-DD. Si no encuentras fecha, devuelve null.

Devuelve ESTRICTAMENTE un JSON válido sin bloques markdown.

Formato:
{
  "exam_date": "2024-03-15",
  "biomarkers": [
    { "name": "Glucosa", "value": "100.0", "unit": "mg/dL", "referenceRange": "74 - 106", "flag": "Normal", "system": "Sistema Metabólico y Energético" },
    { "name": "Triglicéridos", "value": "99.0", "unit": "mg/dL", "referenceRange": "< 150 Normal / 150-199 Límite / 200-499 Alto", "flag": "Normal", "system": "Salud Cardiovascular y Circulatoria" }
  ],
  "summary": "Resumen clínico ejecutivo dirigido al médico tratante, destacando hallazgos alterados y correlaciones clínicas relevantes."
}`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64,
          mimeType: mimeType
        }
      }
    ]);

    const text = result.response.text();
    
    let parsedData = null;
    try {
      // Limpiar markdown si la IA insiste en ponerlo
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanText);
    } catch (e) {
      console.error("Error parsing JSON:", text);
      return NextResponse.json({ error: 'Error al interpretar la respuesta de la IA' }, { status: 500 });
    }

    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
