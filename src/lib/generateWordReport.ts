import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, BorderStyle, ShadingType, PageBreak,
  ImageRun, Header, Footer, PageNumber, NumberFormat, WidthType, VerticalAlign,
  convertInchesToTwip,
} from 'docx';
import { normalizeBiomarkerName } from './biomarkers';

// ─── Color palette ─────────────────────────────────────────────────────────────
const C = {
  gold: 'C9A84C', black: '0A0A1A', white: 'FFFFFF',
  gray100: 'F3F4F6', gray200: 'E5E7EB', gray700: '374151', gray900: '111827',
  blue: '1E40AF', purple: '6D28D9', teal: '0E7490', amber: 'B45309', green: '15803D',
  red: 'DC2626', redLight: 'FEF2F2', amberLight: 'FFFBEB', greenLight: 'F0FDF4',
};

const MODULE_COLORS: Record<number, string> = {
  1: C.blue, 2: C.purple, 3: C.teal, 4: C.amber, 5: C.green,
};
const MODULE_TITLES: Record<number, string> = {
  1: 'Perfil Integral del Paciente',
  2: 'Análisis de Laboratorio por Sistemas',
  3: 'Evaluación Clínica Sistémica',
  4: 'Diagnósticos Posibles y Correlaciones',
  5: 'Plan de Intervención Integral',
};
const MODULE_ICONS: Record<number, string> = {
  1: 'MÓDULO 1', 2: 'MÓDULO 2', 3: 'MÓDULO 3', 4: 'MÓDULO 4', 5: 'MÓDULO 5',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noBorder() {
  const s = { style: BorderStyle.NONE, size: 0, color: 'auto' };
  return { top: s, bottom: s, left: s, right: s, insideH: s, insideV: s };
}

function colorBorder(hex: string, size = 8) {
  const s = { style: BorderStyle.SINGLE, size, color: hex };
  return { top: s, bottom: s, left: s, right: s, insideH: s, insideV: s };
}

function shading(hex: string): { type: typeof ShadingType.SOLID; color: string; fill: string } {
  return { type: ShadingType.SOLID, color: hex, fill: hex };
}

function run(text: string, opts: Partial<{
  bold: boolean; color: string; size: number; italics: boolean;
}> = {}): TextRun {
  return new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size ?? 24, italics: opts.italics, font: 'Calibri' });
}

function para(children: TextRun[], opts: Partial<{
  alignment: typeof AlignmentType[keyof typeof AlignmentType];
  spaceBefore: number; spaceAfter: number; heading: typeof HeadingLevel[keyof typeof HeadingLevel];
  keepNext: boolean; indent: { left: number };
}> = {}): Paragraph {
  return new Paragraph({
    children,
    alignment: opts.alignment,
    heading: opts.heading,
    keepNext: opts.keepNext,
    spacing: { before: opts.spaceBefore ?? 0, after: opts.spaceAfter ?? 120 },
    indent: opts.indent,
    style: 'Normal',
  });
}

function spacer(lines = 1): Paragraph {
  return new Paragraph({ children: [], spacing: { before: 0, after: lines * 120 } });
}

function divider(color = C.gray200): Paragraph {
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color } },
    spacing: { before: 120, after: 120 },
  });
}

// ─── Markdown → Word paragraphs ────────────────────────────────────────────────
function mdToParagraphs(text: string): Paragraph[] {
  const lines = text.split('\n');
  const result: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { result.push(spacer()); continue; }

    // ## H2
    if (line.startsWith('## ')) {
      result.push(new Paragraph({
        children: [run(line.slice(3), { bold: true, size: 28, color: C.gray900 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.gray200 } },
        keepNext: true,
      }));
      continue;
    }

    // ### H3
    if (line.startsWith('### ')) {
      result.push(new Paragraph({
        children: [run(line.slice(4), { bold: true, size: 26, color: C.gray700 })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 80 },
        keepNext: true,
      }));
      continue;
    }

    // bullet
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.slice(2);
      result.push(new Paragraph({
        children: parseBoldInline(content, 22),
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        indent: { left: convertInchesToTwip(0.25) },
      }));
      continue;
    }

    // plain
    result.push(new Paragraph({
      children: parseBoldInline(line, 22),
      spacing: { before: 0, after: 80 },
    }));
  }
  return result;
}

function parseBoldInline(text: string, size: number): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map(p => {
    if (p.startsWith('**') && p.endsWith('**')) return run(p.slice(2, -2), { bold: true, size });
    return run(p, { size });
  });
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function buildCover(patient: any, approvedNums: number[], dateStr: string): Paragraph[] {
  const age = (() => {
    if (!patient.birth_date) return null;
    const today = new Date();
    const birth = new Date(patient.birth_date);
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) { years--; months += 12; }
    if (today.getDate() < birth.getDate()) { months--; if (months < 0) months = 11; }
    return `${years} años y ${months} meses`;
  })();

  return [
    new Paragraph({
      children: [run('PDI · PROTOCOLO DE DIAGNÓSTICO INTEGRAL', { size: 18, color: 'AAAAAA', bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 800 },
    }),
    new Paragraph({
      children: [run('REPORTE MÉDICO PERSONALIZADO', { size: 20, color: C.gold, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    }),
    new Paragraph({
      children: [run('Análisis Integral de Salud', { size: 52, bold: true, color: C.gray900 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 600 },
    }),
    new Paragraph({
      children: [run(patient.full_name ?? 'Paciente', { size: 36, bold: true, color: C.gray900 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
    }),
    new Paragraph({
      children: [run([age ? age : '', patient.gender === 'male' ? 'Masculino' : patient.gender === 'female' ? 'Femenina' : ''].filter(Boolean).join(' · '), { size: 22, color: '6B7280' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 600 },
    }),
    new Paragraph({
      children: [run(`Generado el ${dateStr}`, { size: 20, color: '9CA3AF', italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
    }),
    new Paragraph({
      children: [run('Módulos incluidos: ' + approvedNums.map(n => MODULE_TITLES[n]).join(' · '), { size: 18, color: C.gray700 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
    }),
    new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }),
  ];
}

// ─── Module header banner ─────────────────────────────────────────────────────
function buildModuleHeader(num: number): Table {
  const color = MODULE_COLORS[num];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorder(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: shading(color),
            borders: noBorder(),
            margins: { top: 120, bottom: 120, left: 240, right: 240 },
            children: [
              new Paragraph({
                children: [
                  run(MODULE_ICONS[num], { size: 18, color: C.white, bold: true }),
                  run('  ·  ', { size: 18, color: C.white }),
                  run(MODULE_TITLES[num], { size: 26, color: C.white, bold: true }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ─── Module 2: JSON → Word ─────────────────────────────────────────────────────
function buildM2Tables(content: string): (Paragraph | Table)[] {
  let data: any = null;
  const strategies = [
    () => { const m = content.match(/```json\s*([\s\S]*?)\s*```/); return m ? JSON.parse(m[1]) : null; },
    () => { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
  ];
  for (const fn of strategies) { try { const r = fn(); if (r?.systems) { data = r; break; } } catch {} }
  if (!data?.systems) return mdToParagraphs(content);

  const out: (Paragraph | Table)[] = [];

  // Overview
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: colorBorder(C.gold, 4),
    rows: [new TableRow({
      children: [new TableCell({
        shading: shading('FEF9E7'),
        margins: { top: 120, bottom: 120, left: 240, right: 240 },
        children: [new Paragraph({
          children: [
            run(`📊 ${data.studyCount} estudio(s) analizados`, { bold: true, size: 22, color: C.gray900 }),
            ...(data.dateRange ? [run(`  ·  Período: ${data.dateRange}`, { size: 22, color: C.gray700 })] : []),
            ...(data.overallScore != null ? [run(`  ·  Índice Global: ${data.overallScore}%`, { bold: true, size: 22, color: C.green })] : []),
          ],
        })],
      })],
    })],
  }));
  out.push(spacer());

  const alertLabel: Record<string, string> = { normal: 'Homeostasis ✓', moderate: 'Vigilancia ⚠', critical: 'Atención Requerida 🔴' };
  const alertHex: Record<string, string> = { normal: C.green, moderate: C.amber, critical: C.red };
  const alertBg: Record<string, string> = { normal: C.greenLight, moderate: C.amberLight, critical: C.redLight };

  const sorted = [...data.systems].sort((a: any, b: any) => {
    const o: Record<string, number> = { critical: 0, moderate: 1, normal: 2 };
    return o[a.alertLevel] - o[b.alertLevel];
  });

  for (const sys of sorted) {
    const bc = alertHex[sys.alertLevel] ?? C.green;
    const bgc = alertBg[sys.alertLevel] ?? C.greenLight;

    // System header
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { ...noBorder(), left: { style: BorderStyle.SINGLE, size: 16, color: bc } },
      rows: [new TableRow({
        children: [new TableCell({
          shading: shading(bgc.replace('#', '')),
          margins: { top: 100, bottom: 100, left: 200, right: 200 },
          children: [
            new Paragraph({
              children: [run(`${sys.icon ?? '•'}  ${sys.name}`, { bold: true, size: 28, color: C.gray900 })],
              spacing: { before: 0, after: 60 },
            }),
            new Paragraph({
              children: [
                run(alertLabel[sys.alertLevel] ?? '', { size: 20, color: bc, bold: true }),
                run(`  ·  Vitalidad: ${sys.vitalityScore}%`, { size: 20, color: C.gray700 }),
              ],
              spacing: { before: 0, after: 0 },
            }),
          ],
        })],
      })],
    }));
    out.push(spacer());

    // Hero biomarkers as a grid table
    if (sys.heroBiomarkers?.length) {
      const heroes = sys.heroBiomarkers;
      // Pair them 2-per-row
      for (let i = 0; i < heroes.length; i += 2) {
        const cells = [heroes[i], heroes[i + 1]].filter(Boolean).map((bm: any) => {
          const fc = (bm.flag ?? '').toLowerCase() === 'normal' ? C.green
            : (bm.flag ?? '').toLowerCase().includes('crít') ? C.red : C.amber;
          const fbg = (bm.flag ?? '').toLowerCase() === 'normal' ? C.greenLight
            : (bm.flag ?? '').toLowerCase().includes('crít') ? C.redLight : C.amberLight;
          return new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: shading(fbg),
            borders: colorBorder(fc, 4),
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({ children: [run(bm.name, { size: 18, color: '6B7280', bold: true })], spacing: { before: 0, after: 40 } }),
              new Paragraph({ children: [run(`${bm.value}`, { size: 40, bold: true, color: fc }), run(` ${bm.unit}`, { size: 20, color: '9CA3AF' })], spacing: { before: 0, after: 60 } }),
              new Paragraph({ children: [run(bm.flag + (bm.trendDir ? ` · ${bm.trendDir}` : ''), { size: 20, bold: true, color: fc })], spacing: { before: 0, after: 60 } }),
              ...(bm.refMin != null && bm.refMax != null ? [new Paragraph({ children: [run(`Ref: ${bm.refMin} – ${bm.refMax} ${bm.unit}`, { size: 18, color: '9CA3AF' })], spacing: { before: 0, after: 60 } })] : []),
              ...(bm.patientExplanation ? [new Paragraph({ children: [run(`💬 ${bm.patientExplanation}`, { size: 18, italics: true, color: '92400E' })], spacing: { before: 60, after: 0 } })] : []),
            ],
          });
        });
        // Pad to 2 cells if odd
        if (cells.length === 1) cells.push(new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorder(), children: [spacer()] }));
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorder(), rows: [new TableRow({ children: cells })] }));
        out.push(spacer());
      }
    }

    // Other biomarkers (compact list)
    if (sys.otherBiomarkers?.length) {
      out.push(new Paragraph({
        children: [run('En rango normal: ', { bold: true, size: 20, color: C.green }), run(sys.otherBiomarkers.map((b: any) => `${b.name} (${b.value} ${b.unit})`).join(' · '), { size: 20, color: C.gray700 })],
        spacing: { before: 0, after: 120 },
      }));
    }

    // Clinical interpretation
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: colorBorder(C.gold, 4),
      rows: [new TableRow({
        children: [new TableCell({
          shading: shading('FEFCE8'),
          margins: { top: 80, bottom: 80, left: 200, right: 200 },
          children: [new Paragraph({ children: [run('💡 Interpretación Clínica: ', { bold: true, size: 20, color: C.gray900 }), run(sys.clinicalInterpretation, { size: 20, color: C.gray700 })], spacing: { before: 0, after: 0 } })],
        })],
      })],
    }));

    if (sys.keyAlert) {
      out.push(spacer());
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: colorBorder(C.red, 4),
        rows: [new TableRow({
          children: [new TableCell({
            shading: shading('FEF2F2'),
            margins: { top: 80, bottom: 80, left: 200, right: 200 },
            children: [new Paragraph({ children: [run(`⚡ Seguimiento: ${sys.keyAlert}`, { bold: true, size: 20, color: C.red })], spacing: { before: 0, after: 0 } })],
          })],
        })],
      }));
    }

    out.push(spacer(2));
    out.push(divider(bc));
    out.push(spacer());
  }

  return out;
}

// ─── Evolution charts via QuickChart.io ──────────────────────────────────────
async function buildEvolutionCharts(studies: any[]): Promise<(Paragraph | Table)[]> {
  // Group biomarker values across studies by normalized name
  const map = new Map<string, { date: string; value: number; unit: string; flag: string }[]>();

  for (const study of studies) {
    const dateLabel = study.exam_date
      ? new Date(study.exam_date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
      : new Date(study.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });

    for (const bm of (study.biomarkers ?? [])) {
      const num = parseFloat(String(bm.value).replace(',', '.'));
      if (isNaN(num)) continue;
      const canonical = normalizeBiomarkerName(bm.name);
      if (!map.has(canonical)) map.set(canonical, []);
      map.get(canonical)!.push({ date: dateLabel, value: num, unit: bm.unit ?? '', flag: bm.flag ?? 'Normal' });
    }
  }

  // Only markers with 2+ data points — prioritise altered ones
  const series = [...map.entries()]
    .filter(([, pts]) => pts.length >= 2)
    .sort((a, b) => {
      const aAlt = a[1].some(p => p.flag !== 'Normal') ? 0 : 1;
      const bAlt = b[1].some(p => p.flag !== 'Normal') ? 0 : 1;
      return aAlt - bAlt;
    })
    .slice(0, 12); // max 12 charts

  if (!series.length) return [];

  const out: (Paragraph | Table)[] = [
    new Paragraph({
      children: [run('EVOLUCIÓN CLÍNICA EN EL TIEMPO', { size: 26, bold: true, color: C.gray900 })],
      spacing: { before: 480, after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.gold } },
    }),
    spacer(),
  ];

  // Render 2 charts per row
  for (let i = 0; i < series.length; i += 2) {
    const pair = series.slice(i, i + 2);
    const cells: TableCell[] = [];

    for (const [name, pts] of pair) {
      const lastFlag = pts[pts.length - 1]?.flag ?? 'Normal';
      const lineHex = lastFlag === 'Alto' ? 'ef4444' : lastFlag === 'Bajo' ? '3b82f6' : '22c55e';
      const sortedPts = [...pts].sort((a, b) => a.date.localeCompare(b.date));
      const hasAlt = pts.some(p => p.flag !== 'Normal');

      // Per-point colors based on flag
      const pointColors = sortedPts.map(p =>
        p.flag === 'Alto' ? '#ef4444' : p.flag === 'Bajo' ? '#3b82f6' : '#22c55e'
      );

      const chartCfg = {
        type: 'line',
        data: {
          labels: sortedPts.map(p => p.date),
          datasets: [{
            label: name,
            data: sortedPts.map(p => p.value),
            borderColor: `#${lineHex}`,
            backgroundColor: `#${lineHex}33`,
            pointRadius: 6,
            pointBackgroundColor: pointColors,
            pointBorderColor: '#0f0f1a',
            pointBorderWidth: 2,
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
          }],
        },
        options: {
          plugins: { legend: { labels: { font: { size: 12 } } } },
          scales: {
            y: { ticks: { font: { size: 11 } } },
            x: { ticks: { font: { size: 11 } } },
          },
        },
      };

      let imageData: Buffer | null = null;
      try {
        const url = `https://quickchart.io/chart?w=460&h=240&bkg=%230f0f1a&c=${encodeURIComponent(JSON.stringify(chartCfg))}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) imageData = Buffer.from(await resp.arrayBuffer());
      } catch { /* skip chart if fetch fails */ }

      if (imageData) {
        cells.push(new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: colorBorder(lastFlag === 'Alto' ? C.red : lastFlag === 'Bajo' ? '3b82f6' : C.green, 4),
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [run(name, { bold: true, size: 20, color: lastFlag === 'Alto' ? C.red : lastFlag === 'Bajo' ? '3b82f6' : C.green })],
              spacing: { before: 0, after: 80 },
            }),
            new Paragraph({
              children: [new ImageRun({ data: imageData, transformation: { width: 320, height: 178 }, type: 'png' })],
              spacing: { before: 0, after: 60 },
            }),
            new Paragraph({
              children: [run(`${sortedPts.length} mediciones · ${sortedPts[0].unit}`, { size: 16, color: '9CA3AF', italics: true })],
              spacing: { before: 0, after: 0 },
            }),
          ],
        }));
      }
    }

    if (cells.length) {
      // Pad to 2 cells
      while (cells.length < 2) {
        cells.push(new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: { ...noBorder() }, children: [spacer()] }));
      }
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorder(), rows: [new TableRow({ children: cells })] }));
      out.push(spacer());
    }
  }

  return out;
}

// ─── Main generator ────────────────────────────────────────────────────────────
export async function generateWordReport(
  patient: { full_name: string; birth_date?: string; gender?: string },
  modules: Record<number, { module_num: number; content: string; status: string }>,
  studies: any[] = [],
  m6Markers: string[] = [],
  m6Groups: Array<{ id: string; markers: string[]; chartImages?: { marker: string; pngBase64: string }[] }> = [],
): Promise<Buffer> {
  const dateStr = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const approvedNums = [1, 2, 3, 4, 5].filter(n => modules[n]?.status === 'approved');
  // Add module 6 if comparative groups were passed from localStorage
  if (m6Groups.length > 0 || m6Markers.length > 0) approvedNums.push(6);

  const children: (Paragraph | Table)[] = [
    ...buildCover(patient, approvedNums, dateStr),
  ];

  for (const num of approvedNums) {
    const mod = modules[num];
    const color = MODULE_COLORS[num];

    if (num === 6) {
      // Module 6: use pre-rendered PNG images sent from the browser (exact same charts as app & PDF)
      const groups = (m6Groups ?? []) as Array<{ id: string; markers: string[]; chartImages?: { marker: string; pngBase64: string }[] }>;
      if (groups.length > 0) {
        children.push(buildModuleHeader(6));
        children.push(spacer(2));

        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          // Group heading
          children.push(new Paragraph({
            children: [run(`📊 Comparativa ${gi + 1}: ${group.markers.join(' · ')}`, { bold: true, size: 22, color: 'b8922a' })],
            spacing: { before: 320, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'd4af37' } },
          }));
          children.push(spacer());

          if (group.chartImages && group.chartImages.length > 0) {
            // Use pre-rendered PNGs — identical to what's shown in the app and PDF
            for (const { marker, pngBase64 } of group.chartImages) {
              const imgBuf = Buffer.from(pngBase64, 'base64');
              children.push(new Paragraph({
                children: [run(marker, { bold: true, size: 20, color: C.gray900 })],
                spacing: { before: 120, after: 60 },
              }));
              children.push(new Paragraph({
                children: [new ImageRun({ data: imgBuf, transformation: { width: 580, height: 197 }, type: 'png' })],
                spacing: { before: 0, after: 160 },
              }));
            }
          } else {
            // Fallback: build via QuickChart for this group's markers
            const filteredStudies = studies.map((s: any) => ({
              ...s,
              biomarkers: (s.biomarkers ?? []).filter((b: any) =>
                group.markers.map((m: string) => normalizeBiomarkerName(m)).includes(normalizeBiomarkerName(b.name))
              ),
            })).filter((s: any) => s.biomarkers.length > 0);
            if (filteredStudies.length > 0) {
              const cmpCharts = await buildEvolutionCharts(filteredStudies);
              children.push(...cmpCharts);
            }
          }
        }
      }
    } else if (num === 2 && mod.content.includes('"systems"')) {
      children.push(buildModuleHeader(num));
      children.push(spacer(2));
      children.push(...buildM2Tables(mod.content));
    } else {
      children.push(buildModuleHeader(num));
      children.push(spacer(2));
      children.push(...mdToParagraphs(mod.content));
    }

    // Page break after each module (except last)
    if (num !== approvedNums[approvedNums.length - 1]) {
      children.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));
    }
  }

  // ── Evolution charts section (all studies, after all modules) ─────────────
  if (studies.length >= 2) {
    children.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));
    const charts = await buildEvolutionCharts(studies);
    children.push(...charts);
  }

  const doc = new Document({
    creator: 'PDI · Protocolo de Diagnóstico Integral',
    title: `Reporte PDI — ${patient.full_name}`,
    description: `Reporte médico integral generado el ${dateStr}`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: C.gray700 } },
        heading1: { run: { font: 'Calibri', size: 52, bold: true, color: C.gray900 }, paragraph: { spacing: { before: 480, after: 240 } } },
        heading2: { run: { font: 'Calibri', size: 28, bold: true, color: C.gray900 }, paragraph: { spacing: { before: 360, after: 120 } } },
        heading3: { run: { font: 'Calibri', size: 24, bold: true, color: C.gray700 }, paragraph: { spacing: { before: 240, after: 80 } } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { ...noBorder(), bottom: { style: BorderStyle.SINGLE, size: 4, color: C.gray200 } },
              rows: [new TableRow({
                children: [
                  new TableCell({ borders: noBorder(), children: [new Paragraph({ children: [run('PDI · Protocolo de Diagnóstico Integral', { size: 16, color: 'AAAAAA' })], spacing: { before: 0, after: 80 } })] }),
                  new TableCell({ borders: noBorder(), children: [new Paragraph({ children: [run(patient.full_name ?? '', { size: 16, color: 'AAAAAA' })], alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 80 } })] }),
                ],
              })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { ...noBorder(), top: { style: BorderStyle.SINGLE, size: 4, color: C.gray200 } },
              rows: [new TableRow({
                children: [
                  new TableCell({ borders: noBorder(), children: [new Paragraph({ children: [run(`Generado el ${dateStr}`, { size: 16, color: 'AAAAAA' })], spacing: { before: 80, after: 0 } })] }),
                  new TableCell({ borders: noBorder(), children: [new Paragraph({ children: [run('Página ', { size: 16, color: 'AAAAAA' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: 'AAAAAA', font: 'Calibri' }), run(' de ', { size: 16, color: 'AAAAAA' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: 'AAAAAA', font: 'Calibri' })], alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 0 } })] }),
                ],
              })],
            }),
          ],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
