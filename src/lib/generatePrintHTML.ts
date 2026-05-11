// ─── PDF/Print HTML Generator ──────────────────────────────────────────────────
// Generates a clean, white, print-optimized HTML document from report modules.

interface ModuleDef { num: number; icon: string; title: string; color: string; }
interface ReportModule { module_num: number; content: string; status: string; title: string; }

const MODULE_DEFS: ModuleDef[] = [
  { num: 1, icon: '👤', title: 'Perfil Integral del Paciente', color: '#1e40af' },
  { num: 2, icon: '🔬', title: 'Análisis de Laboratorio por Sistemas', color: '#6d28d9' },
  { num: 3, icon: '🩺', title: 'Evaluación Clínica Sistémica', color: '#0e7490' },
  { num: 4, icon: '🧠', title: 'Diagnósticos Posibles y Correlaciones', color: '#b45309' },
  { num: 5, icon: '📌', title: 'Plan de Intervención Integral', color: '#15803d' },
];

// Markdown → print HTML (no CSS variables, fully static colors)
function mdToHtml(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])(.*)/gm, (_, line) => line.trim() ? `<p>${line}</p>` : '')
    .replace(/🔴/g, '<span class="badge badge-red">🔴</span>')
    .replace(/🟡/g, '<span class="badge badge-amber">🟡</span>')
    .replace(/🟢/g, '<span class="badge badge-green">🟢</span>');
}

// Convert M2 JSON to print-friendly HTML
function m2JsonToHtml(content: string): string {
  try {
    const strategies = [
      () => { const m = content.match(/```json\s*([\s\S]*?)\s*```/); return m ? JSON.parse(m[1]) : null; },
      () => { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
    ];
    let data: any = null;
    for (const fn of strategies) { try { const r = fn(); if (r?.systems) { data = r; break; } } catch {} }
    if (!data?.systems) return mdToHtml(content);

    const alertLabel: Record<string, string> = { normal: 'Homeostasis', moderate: 'Vigilancia', critical: 'Atención Requerida' };
    const alertColor: Record<string, string> = { normal: '#15803d', moderate: '#b45309', critical: '#dc2626' };

    let html = `<div class="m2-overview">
      <p class="m2-meta">${data.studyCount} estudio(s) analizados${data.dateRange ? ` · ${data.dateRange}` : ''}${data.overallScore != null ? ` · Índice Global de Salud: <strong>${data.overallScore}%</strong>` : ''}</p>
    </div>`;

    const sorted = [...data.systems].sort((a: any, b: any) => {
      const o: Record<string, number> = { critical: 0, moderate: 1, normal: 2 };
      return o[a.alertLevel] - o[b.alertLevel];
    });

    for (const sys of sorted) {
      const bc = alertColor[sys.alertLevel] ?? '#15803d';
      html += `
      <div class="m2-system" style="border-left:4px solid ${bc}">
        <div class="m2-system-header">
          <span class="m2-icon">${sys.icon}</span>
          <div>
            <h3 class="m2-system-title">${sys.name}</h3>
            <span class="m2-badge" style="color:${bc};border-color:${bc}">${alertLabel[sys.alertLevel] ?? ''} · Vitalidad: ${sys.vitalityScore}%</span>
          </div>
        </div>`;

      if (sys.heroBiomarkers?.length) {
        html += `<div class="m2-hero-grid">`;
        for (const bm of sys.heroBiomarkers) {
          const flagCss = (bm.flag ?? '').toLowerCase() === 'normal' ? '#15803d' : '#dc2626';
          html += `
          <div class="m2-hero-card" style="border-color:${flagCss}40">
            <div class="m2-hero-name">${bm.name}</div>
            <div class="m2-hero-value" style="color:${flagCss}">${bm.value} <span class="m2-hero-unit">${bm.unit}</span></div>
            <div class="m2-flag" style="color:${flagCss}">${bm.flag}${bm.trendDir ? ` · ${bm.trendDir}` : ''}</div>
            ${bm.patientExplanation ? `<div class="m2-explanation">💬 ${bm.patientExplanation}</div>` : ''}
            ${bm.refMin != null && bm.refMax != null ? `<div class="m2-ref">Referencia: ${bm.refMin} – ${bm.refMax} ${bm.unit}</div>` : ''}
          </div>`;
        }
        html += `</div>`;
      }

      if (sys.otherBiomarkers?.length) {
        html += `<div class="m2-others"><strong>En rango normal:</strong> ${sys.otherBiomarkers.map((b: any) => `${b.name} (${b.value} ${b.unit})`).join(' · ')}</div>`;
      }

      html += `<div class="m2-interp"><strong>Interpretación clínica:</strong> ${sys.clinicalInterpretation}</div>`;
      if (sys.keyAlert) html += `<div class="m2-alert">⚡ Seguimiento: ${sys.keyAlert}</div>`;
      html += `</div>`;
    }
    return html;
  } catch { return mdToHtml(content); }
}

export function generatePrintHTML(
  patient: { full_name: string; birth_date?: string; gender?: string },
  modules: Record<number, ReportModule>,
  generatedAt: Date = new Date()
): string {
  const patientAge = (() => {
    if (!patient.birth_date) return null;
    const today = new Date();
    const birth = new Date(patient.birth_date);
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) { years--; months += 12; }
    if (today.getDate() < birth.getDate()) { months--; if (months < 0) months = 11; }
    return `${years} años y ${months} meses`;
  })();
  const dateStr = generatedAt.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const approvedDefs = MODULE_DEFS.filter(d => modules[d.num]?.status === 'approved');

  const moduleSections = approvedDefs.map(def => {
    const mod = modules[def.num];
    const isM2Json = def.num === 2 && mod.content.includes('"systems"');
    const bodyHtml = isM2Json ? m2JsonToHtml(mod.content) : mdToHtml(mod.content);

    return `
    <div class="module-section" id="module-${def.num}">
      <div class="module-header" style="border-color:${def.color}">
        <span class="module-num" style="background:${def.color}">MÓDULO ${def.num}</span>
        <h2 class="module-title">${def.icon} ${def.title}</h2>
      </div>
      <div class="module-body">${bodyHtml}</div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reporte PDI — ${patient.full_name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      color: #1a1a2e;
      background: #fff;
      font-size: 13px;
      line-height: 1.7;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Cover page ── */
    .cover {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 60px;
      background: linear-gradient(145deg, #0a0a1a 0%, #1e1e3f 50%, #0a0a1a 100%);
      color: white;
      page-break-after: always;
    }
    .cover-logo { font-size: 11px; letter-spacing: 3px; color: rgba(255,255,255,0.4); margin-bottom: 60px; text-transform: uppercase; }
    .cover-label { font-size: 11px; letter-spacing: 3px; color: #d4af37; text-transform: uppercase; margin-bottom: 16px; }
    .cover-title { font-family: 'Playfair Display', serif; font-size: 48px; font-weight: 900; line-height: 1.1; margin-bottom: 12px; }
    .cover-title span { color: #d4af37; }
    .cover-subtitle { font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 60px; }
    .cover-patient-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(212,175,55,0.2); border-radius: 16px; padding: 28px 32px; max-width: 480px; }
    .cover-patient-name { font-size: 22px; font-weight: 800; color: #f0ede6; margin-bottom: 8px; }
    .cover-patient-meta { font-size: 13px; color: rgba(255,255,255,0.5); }
    .cover-date { margin-top: 40px; font-size: 11px; color: rgba(255,255,255,0.3); letter-spacing: 1px; }
    .cover-modules { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 8px; }
    .cover-module-pill { padding: 4px 12px; border-radius: 99px; font-size: 10px; font-weight: 700; border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.5); }

    /* ── Module sections ── */
    .module-section { padding: 48px 60px; page-break-before: always; }
    .module-header { border-left: 4px solid; padding-left: 16px; margin-bottom: 32px; }
    .module-num { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 10px; font-weight: 800; color: white; letter-spacing: 1.5px; margin-bottom: 8px; }
    .module-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: #1a1a2e; }

    /* ── Body content ── */
    .module-body h2 { font-size: 17px; font-weight: 700; color: #1a1a2e; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    .module-body h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 20px 0 6px; }
    .module-body p { margin-bottom: 10px; color: #374151; }
    .module-body ul { padding-left: 20px; margin: 8px 0 14px; }
    .module-body li { margin-bottom: 6px; color: #374151; }
    .module-body strong { color: #111827; font-weight: 700; }

    /* ── M2 components ── */
    .m2-overview { background: #f9f7f0; border: 1px solid #d4af37; border-radius: 10px; padding: 14px 18px; margin-bottom: 28px; }
    .m2-meta { font-size: 13px; color: #4b5563; }
    .m2-system { margin-bottom: 28px; padding: 20px 24px; border-radius: 12px; background: #fafafa; border-left: 4px solid; page-break-inside: avoid; }
    .m2-system-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px; }
    .m2-icon { font-size: 28px; flex-shrink: 0; }
    .m2-system-title { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .m2-badge { font-size: 11px; font-weight: 700; border: 1px solid; border-radius: 99px; padding: 2px 10px; }
    .m2-hero-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 12px 0; }
    .m2-hero-card { border: 1px solid; border-radius: 10px; padding: 14px; page-break-inside: avoid; }
    .m2-hero-name { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 4px; }
    .m2-hero-value { font-size: 26px; font-weight: 900; line-height: 1; margin-bottom: 4px; }
    .m2-hero-unit { font-size: 12px; font-weight: 400; color: #9ca3af; }
    .m2-flag { font-size: 11px; font-weight: 700; margin-bottom: 8px; }
    .m2-explanation { font-size: 11px; font-style: italic; color: #92400e; background: #fffbeb; border-radius: 6px; padding: 6px 10px; margin-top: 8px; line-height: 1.5; }
    .m2-ref { font-size: 10px; color: #9ca3af; margin-top: 4px; }
    .m2-others { font-size: 11px; color: #6b7280; margin: 10px 0; padding: 8px 12px; background: #f3f4f6; border-radius: 6px; }
    .m2-interp { font-size: 12px; color: #374151; background: #f9f7f0; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 14px; margin: 10px 0; line-height: 1.6; }
    .m2-alert { font-size: 12px; color: #dc2626; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 8px 14px; margin-top: 8px; font-weight: 600; }

    /* ── Page header/footer (print only) ── */
    @page {
      margin: 15mm 20mm;
      size: A4;
    }

    /* ── Print overrides ── */
    @media print {
      .cover { min-height: 100vh; }
      .no-print { display: none !important; }
      .module-section { padding: 32px 40px; }
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover">
    <div class="cover-logo">PDI · Protocolo de Diagnóstico Integral</div>
    <div class="cover-label">Reporte Médico Personalizado</div>
    <h1 class="cover-title">Análisis Integral<br/><span>de Salud</span></h1>
    <p class="cover-subtitle">Diagnóstico basado en evidencia clínica y de laboratorio</p>
    <div class="cover-patient-card">
      <div class="cover-patient-name">${patient.full_name}</div>
      <div class="cover-patient-meta">
        ${patientAge ? `${patientAge} · ` : ''}${patient.gender === 'male' ? 'Masculino' : patient.gender === 'female' ? 'Femenino' : ''}
      </div>
      <div class="cover-modules" style="margin-top:16px">
        ${approvedDefs.map(d => `<div class="cover-module-pill" style="border-color:${d.color}40;color:${d.color}">${d.icon} ${d.title}</div>`).join('')}
      </div>
    </div>
    <div class="cover-date">Generado el ${dateStr}</div>
  </div>

  <!-- Module Sections -->
  ${moduleSections}

</body>
</html>`;
}
