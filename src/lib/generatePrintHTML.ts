// ─── PDF/Print HTML Generator ──────────────────────────────────────────────────
// Generates a clean, white, print-optimized HTML document from report modules.

interface ModuleDef { num: number; icon: string; title: string; color: string; }
interface ReportModule { module_num: number; content: string; status: string; title: string; }
export interface ComparativeGroupForPrint { id: string; markers: string[]; }

const MODULE_DEFS: ModuleDef[] = [
  { num: 1, icon: '👤', title: 'Perfil Integral del Paciente', color: '#1e40af' },
  { num: 2, icon: '🔬', title: 'Análisis de Laboratorio por Sistemas', color: '#6d28d9' },
  { num: 3, icon: '🩺', title: 'Evaluación Clínica Sistémica', color: '#0e7490' },
  { num: 4, icon: '🧠', title: 'Diagnósticos Posibles y Correlaciones', color: '#b45309' },
  { num: 5, icon: '📌', title: 'Plan de Intervención Integral', color: '#15803d' },
];

// ─── Inline SVG chart builder (mirrors FullWidthChart logic) ─────────────────
function parseRef(ref?: string): { min: number | null; max: number | null } {
  if (!ref) return { min: null, max: null };
  const m = ref.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  const lt = ref.match(/[<≤]\s*(\d+\.?\d*)/);
  if (lt) return { min: null, max: parseFloat(lt[1]) };
  const gt = ref.match(/[>≥]\s*(\d+\.?\d*)/);
  if (gt) return { min: parseFloat(gt[1]), max: null };
  return { min: null, max: null };
}

export function svgForSeries(s: { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string }[] }): string {
  const W = 700, H = 220;
  const PAD = { top: 28, right: 48, bottom: 44, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const ref = parseRef(s.referenceRange);
  const values = s.points.map(p => p.value);
  const refVals = [ref.min, ref.max].filter((v): v is number => v !== null);
  const allVals = [...values, ...refVals];
  if (allVals.length === 0) return '';
  const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.18 || 1;
  const minV = rawMin - pad, maxV = rawMax + pad, range = maxV - minV;
  const toX = (i: number) => PAD.left + (innerW / Math.max(s.points.length - 1, 1)) * i;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;
  const lastFlag = s.points[s.points.length - 1]?.flag ?? 'Normal';
  const lc = lastFlag === 'Alto' ? '#ef4444' : lastFlag === 'Bajo' ? '#3b82f6' : '#22c55e';
  const gradId = `g${s.name.replace(/[^a-z0-9]/gi, '')}`;
  const polyline = s.points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerH} ${polyline} ${toX(s.points.length - 1).toFixed(1)},${PAD.top + innerH}`;

  let refBand = '';
  if (ref.min !== null || ref.max !== null) {
    const bandTop = toY(ref.max ?? maxV), bandBot = toY(ref.min ?? minV);
    refBand += `<rect x="${PAD.left}" y="${bandTop.toFixed(1)}" width="${innerW}" height="${Math.max(bandBot - bandTop, 0).toFixed(1)}" fill="rgba(34,197,94,0.12)"/>`;
    if (ref.max !== null) refBand += `<line x1="${PAD.left}" y1="${toY(ref.max).toFixed(1)}" x2="${PAD.left+innerW}" y2="${toY(ref.max).toFixed(1)}" stroke="#22c55e" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.7"/><text x="${PAD.left+innerW+4}" y="${(toY(ref.max)+4).toFixed(1)}" font-size="9" fill="#22c55e">máx ${ref.max}</text>`;
    if (ref.min !== null) refBand += `<line x1="${PAD.left}" y1="${toY(ref.min).toFixed(1)}" x2="${PAD.left+innerW}" y2="${toY(ref.min).toFixed(1)}" stroke="#22c55e" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.7"/><text x="${PAD.left+innerW+4}" y="${(toY(ref.min)+4).toFixed(1)}" font-size="9" fill="#22c55e">mín ${ref.min}</text>`;
  }

  let yGrid = '';
  [0, 0.33, 0.66, 1].forEach(t => {
    const v = minV + range * t, y = toY(v);
    yGrid += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left+innerW}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
    yGrid += `<text x="${PAD.left-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.35)">${v.toFixed(1)}</text>`;
  });

  const dots = s.points.map((pt, i) => {
    const fc = pt.flag === 'Alto' ? '#ef4444' : pt.flag === 'Bajo' ? '#3b82f6' : '#22c55e';
    return `<circle cx="${toX(i).toFixed(1)}" cy="${toY(pt.value).toFixed(1)}" r="6" fill="${fc}" stroke="#0a0a15" stroke-width="2"/>`;
  }).join('');

  const xlabels = s.points.map((pt, i) => {
    const d = new Date(pt.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
    return `<text x="${toX(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)">${d}</text>`;
  }).join('');

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible;display:block;background:#0f0f1a;border-radius:10px">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lc}" stop-opacity="0.35"/><stop offset="100%" stop-color="${lc}" stop-opacity="0.03"/></linearGradient></defs>
    ${yGrid}${refBand}
    <polygon points="${area}" fill="url(#${gradId})"/>
    ${s.points.length > 1 ? `<polyline points="${polyline}" fill="none" stroke="${lc}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${dots}${xlabels}
  </svg>`;
}

// Build a series from allStudies for a given marker name
export function buildSeriesForPrint(
  markerName: string,
  allStudies: any[],
): { name: string; unit: string; referenceRange?: string; points: { date: string; value: number; flag: string }[] } | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(markerName);
  const points: { date: string; value: number; flag: string }[] = [];
  let unit = '', refRange: string | undefined;
  for (const study of allStudies) {
    const bm = (study.biomarkers ?? []).find((b: any) => norm(b.name) === target);
    if (!bm) continue;
    const v = parseFloat(bm.value);
    if (isNaN(v)) continue;
    points.push({ date: study.study_date ?? study.created_at, value: v, flag: bm.flag ?? 'Normal' });
    if (!unit) unit = bm.unit ?? '';
    if (!refRange && bm.reference_range) refRange = bm.reference_range;
  }
  if (points.length === 0) return null;
  points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { name: markerName, unit, referenceRange: refRange, points };
}

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

// Maps system names to safe fallback emojis
const SYSTEM_EMOJI_MAP: Record<string, string> = {
  lipid: '🫀', lípid: '🫀', grasa: '🫀', colesterol: '🫀',
  hepátic: '🫁', hígad: '🫁', hepat: '🫁',
  renal: '🫘', riñón: '🫘', riñon: '🫘',
  tiroid: '🦋',
  glucos: '🩸', diabét: '🩸', glucemi: '🩸', hemoglobin: '🩸', sangr: '🩸',
  cardiovascular: '❤️', corazón: '❤️', cardiaco: '❤️',
  inmun: '🛡️', inflamac: '🛡️',
  hormon: '⚗️', endocrin: '⚗️',
  hematolog: '💉', eritrocit: '💉', leucocit: '💉',
  mineral: '⚡', electrolít: '⚡',
  vitam: '💊',
  muscul: '💪', protein: '💪',
  digestiv: '🫃', intestin: '🫃',
  nervios: '🧠', neurolog: '🧠',
};

function sanitizeIcon(icon: string, systemName: string): string {
  // Accept only single/double character sequences that are likely emoji
  // Emoji are typically 1-2 Unicode code points. If the icon has > 4 chars it's likely text.
  const stripped = icon?.trim() ?? '';
  // Check if it's a valid emoji-like string (short, no Arabic/Hebrew/CJK text blocks)
  const hasNonEmojiText = /[\u0600-\u06FF\u0590-\u05FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(stripped) || stripped.length > 6;
  if (!hasNonEmojiText && stripped.length > 0) return stripped;
  // Fallback: find emoji by system name keyword
  const nameLower = systemName.toLowerCase();
  for (const [key, emoji] of Object.entries(SYSTEM_EMOJI_MAP)) {
    if (nameLower.includes(key)) return emoji;
  }
  return '🔬'; // generic fallback
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
          <span class="m2-icon">${sanitizeIcon(sys.icon, sys.name)}</span>
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
  generatedAt: Date = new Date(),
  m6Groups: ComparativeGroupForPrint[] = [],
  allStudies: any[] = [],
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

  // Module 6 — Comparative Charts (from localStorage via m6Groups)
  let m6Section = '';
  if (m6Groups.length > 0 && allStudies.length > 0) {
    const groupsHtml = m6Groups.map((group, gi) => {
      const seriesHtml = group.markers.map(markerName => {
        const s = buildSeriesForPrint(markerName, allStudies);
        if (!s) return '';
        const lastVal = s.points[s.points.length - 1];
        const lc = lastVal?.flag === 'Alto' ? '#ef4444' : lastVal?.flag === 'Bajo' ? '#3b82f6' : '#22c55e';
        return `
        <div style="margin-bottom:16px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
          <div style="background:#0f0f1a;padding:12px 16px 6px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
              <strong style="color:${lc};font-size:14px">${s.name}</strong>
              <span style="color:${lc};font-size:22px;font-weight:900;font-family:monospace">${lastVal?.value ?? '—'} <span style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.4)">${s.unit}</span></span>
            </div>
            ${s.referenceRange ? `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px">Ref: ${s.referenceRange} ${s.unit}</div>` : ''}
          </div>
          ${svgForSeries(s)}
        </div>`;
      }).join('');
      return `
      <div style="margin-bottom:24px;border:1px solid rgba(212,175,55,0.2);border-radius:14px;overflow:hidden;page-break-inside:avoid">
        <div style="background:rgba(212,175,55,0.06);padding:10px 16px;border-bottom:1px solid rgba(212,175,55,0.15)">
          <strong style="color:#d4af37;font-size:12px">📊 Comparativa ${gi + 1}: ${group.markers.join(' · ')}</strong>
        </div>
        <div style="padding:12px 16px;background:#0a0a15">${seriesHtml}</div>
      </div>`;
    }).join('');

    m6Section = `
    <div class="module-section" id="module-6" style="background:#0a0a15;color:white">
      <div class="module-header" style="border-color:#d4af37">
        <span class="module-num" style="background:#b8922a">MÓDULO 6</span>
        <h2 class="module-title" style="color:#f0ede6">📊 Gráficas Comparativas</h2>
      </div>
      <div class="module-body">${groupsHtml}</div>
    </div>`;
  }

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
  ${m6Section}

</body>
</html>`;
}
