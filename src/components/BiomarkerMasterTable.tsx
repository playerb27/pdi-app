'use client';
import React, { useMemo, useState } from 'react';
import { Printer, Download, Edit2, Check, X } from 'lucide-react';
import type { Study } from '@/lib/api';
import { normalizeBiomarkerName, tablaBiomarkerElementId } from '@/lib/biomarkers';
import { BIOMARKER_CATALOG, CATALOG_SYSTEMS, getCatalogEntry, computeFlag, type CatalogEntry } from '@/lib/biomarker-catalog';
import { updateBiomarker } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────
interface CellData {
  value: number;
  rawValue: string;
  flag: 'Normal' | 'Alto' | 'Bajo';
  biomarkerId?: string;
  studyId: string;
  isEdited?: boolean;
}

interface PivotRow {
  name: string;             // canonical name
  unit: string;
  refMin: number | null;
  refMax: number | null;
  system: string;
  isFromCatalog: boolean;
  cells: Record<string, CellData>;  // key = study date ISO string
}

interface Props {
  studies: Study[];
  patientBirthDate?: string;
  glowId?: string | null;
  onBiomarkerUpdated?: (studyId: string, biomarkerId: string, newValue: string, newFlag: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getStudyDate(s: Study): string {
  const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return (s as any).exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
}

function formatDateShort(iso: string): string {
  // If it's a plain date (YYYY-MM-DD), add noon time to avoid UTC→local shift
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso;
  const d = new Date(normalized);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
}

function getAgeAt(birthDate: string, studyDate: string): number {
  const b = new Date(birthDate);
  const s = new Date(studyDate);
  let age = s.getFullYear() - b.getFullYear();
  if (s.getMonth() < b.getMonth() || (s.getMonth() === b.getMonth() && s.getDate() < b.getDate())) age--;
  return age;
}

function cellBg(flag: 'Normal' | 'Alto' | 'Bajo'): string {
  if (flag === 'Alto') return 'rgba(239,68,68,0.18)';
  if (flag === 'Bajo') return 'rgba(59,130,246,0.18)';
  return 'transparent';
}

function cellColor(flag: 'Normal' | 'Alto' | 'Bajo'): string {
  if (flag === 'Alto') return '#f87171';
  if (flag === 'Bajo') return '#60a5fa';
  return 'var(--text-primary)';
}

// ─── Cell Editor (inline) ────────────────────────────────────────────────────
function EditableCell({ cell, row, onSave }: {
  cell: CellData;
  row: PivotRow;
  onSave: (biomarkerId: string, studyId: string, val: string, flag: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(cell.rawValue);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!cell.biomarkerId) return;
    const num = parseFloat(val.replace(',', '.'));
    const newFlag = isNaN(num) ? cell.flag : computeFlag(row.name, num);
    setSaving(true);
    await updateBiomarker(cell.biomarkerId, { value: val, flag: newFlag, originalValue: cell.rawValue });
    onSave(cell.biomarkerId, cell.studyId, val, newFlag);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 80 }}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 60, background: 'var(--bg-main)', border: '1px solid var(--gold-primary)', color: 'var(--text-primary)', borderRadius: 4, padding: '2px 5px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
        />
        <button onClick={handleSave} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 2, display: 'flex' }}>
          <Check size={11} />
        </button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, display: 'flex' }}>
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => cell.biomarkerId && setEditing(true)}
      title={cell.biomarkerId ? 'Clic para editar' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, cursor: cell.biomarkerId ? 'pointer' : 'default',
        padding: '3px 5px', borderRadius: 4, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (cell.biomarkerId) (e.currentTarget as HTMLDivElement).style.background = 'rgba(212,175,55,0.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: cellColor(cell.flag) }}>
        {cell.rawValue}
      </span>
      {cell.isEdited && <span title="Editado manualmente" style={{ fontSize: 8, color: 'var(--gold-primary)' }}>✏</span>}
      {cell.biomarkerId && (
        <Edit2 size={9} color="var(--text-muted)" style={{ opacity: 0, transition: 'opacity 0.15s' }} className="cell-edit-icon" />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BiomarkerMasterTable({ studies, patientBirthDate, glowId, onBiomarkerUpdated }: Props) {
  const [localStudies, setLocalStudies] = useState<Study[]>(studies);
  const [filterSystem, setFilterSystem] = useState<string | null>(null);

  // Keep local state in sync when parent changes
  useMemo(() => { setLocalStudies(studies); }, [studies]);

  // ── Build sorted study date columns ─────────────────────────────────────────
  const sortedStudies = useMemo(() =>
    [...localStudies].sort((a, b) => new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime()),
    [localStudies]
  );

  const studyDates = useMemo(() => sortedStudies.map(s => getStudyDate(s)), [sortedStudies]);

  // ── Build pivot rows ─────────────────────────────────────────────────────────
  const { catalogRows, unknownRows } = useMemo(() => {
    // First pass: collect all biomarker data keyed by canonical name
    const dataMap: Record<string, PivotRow> = {};

    for (const study of sortedStudies) {
      const dateKey = getStudyDate(study);
      for (const bm of (study.biomarkers ?? [])) {
        const canonical = normalizeBiomarkerName(bm.name);
        const num = parseFloat(String(bm.value).replace(',', '.'));
        const rawStr = String(bm.value ?? '').trim();
        // Accept numeric values OR meaningful text values (Negativo, Positivo, 1:80, etc.)
        // Skip only if truly empty or just whitespace
        const isMeaningfulText = isNaN(num) && rawStr.length > 0;
        if (isNaN(num) && !isMeaningfulText) continue;
        if ((bm as any).flag === 'Excluido') continue;  // doctor marked as "no graficar"

        const catalogEntry = getCatalogEntry(canonical);
        const flag = isNaN(num) ? (bm.flag as any) ?? 'Normal' : computeFlag(canonical, num);

        if (!dataMap[canonical]) {
          dataMap[canonical] = {
            name: canonical,
            unit: catalogEntry?.unit ?? bm.unit,
            refMin: catalogEntry?.refMin ?? null,
            refMax: catalogEntry?.refMax ?? null,
            system: catalogEntry?.system ?? bm.system ?? 'Otros Marcadores',
            isFromCatalog: !!catalogEntry,
            cells: {},
          };
        }

        // Only keep one value per study date (last write wins — avoids zigzag)
        dataMap[canonical].cells[dateKey] = {
          value: isNaN(num) ? 0 : num,
          rawValue: rawStr,
          flag,
          biomarkerId: (bm as any).id,
          studyId: study.id,
          isEdited: (bm as any).is_edited,
        };
      }
    }

    // Second pass: split into catalog order vs unknown
    const catalogNames = new Set(BIOMARKER_CATALOG.map(e => e.name.toLowerCase()));

    const catalogRows: PivotRow[] = BIOMARKER_CATALOG
      .filter(entry => dataMap[entry.name.toLowerCase()] || dataMap[entry.name])
      .map(entry => dataMap[entry.name] ?? dataMap[entry.name.toLowerCase()])
      .filter(Boolean);

    const unknownRows: PivotRow[] = Object.values(dataMap)
      .filter(row => !catalogNames.has(row.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { catalogRows, unknownRows };
  }, [sortedStudies]);

  const allRows = [...catalogRows, ...unknownRows];

  // Group by system
  const rowsBySystem = useMemo(() => {
    const map: Record<string, PivotRow[]> = {};
    for (const row of allRows) {
      if (!map[row.system]) map[row.system] = [];
      map[row.system].push(row);
    }
    return map;
  }, [allRows]);

  const visibleSystems = filterSystem
    ? [filterSystem]
    : [...CATALOG_SYSTEMS, ...(rowsBySystem['Otros Marcadores'] ? ['Otros Marcadores'] : [])];

  // Summary stats
  const totalMarkers = allRows.length;
  const alteredCells = allRows.flatMap(r => Object.values(r.cells)).filter(c => c.flag !== 'Normal').length;

  const handleCellSave = (biomarkerId: string, studyId: string, val: string, flag: string) => {
    setLocalStudies(prev => prev.map(s => s.id !== studyId ? s : {
      ...s,
      biomarkers: (s.biomarkers ?? []).map((b: any) =>
        b.id !== biomarkerId ? b : { ...b, value: val, flag, is_edited: true, original_value: b.original_value ?? b.value }
      ),
    }));
    onBiomarkerUpdated?.(studyId, biomarkerId, val, flag);
  };

  if (localStudies.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: 14 }}>Sube estudios de laboratorio para ver la tabla maestra.</p>
      </div>
    );
  }

  // ── System filter pills ──────────────────────────────────────────────────────
  const systemsWithData = new Set(allRows.map(r => r.system));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
            🧬 Tabla Maestra de Biomarcadores
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {totalMarkers} marcadores · {sortedStudies.length} estudios ·{' '}
            <span style={{ color: alteredCells > 0 ? '#f87171' : '#22c55e' }}>
              {alteredCells} valores alterados
            </span>
            {' '}· Clic en cualquier valor para editar
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={() => exportToCSV(allRows, studyDates, sortedStudies)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* System filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterSystem(null)}
          style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-main)', cursor: 'pointer', border: `1px solid ${filterSystem === null ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: filterSystem === null ? 'rgba(212,175,55,0.15)' : 'transparent', color: filterSystem === null ? 'var(--gold-primary)' : 'var(--text-muted)', transition: 'all 0.2s' }}
        >
          Todos
        </button>
        {[...CATALOG_SYSTEMS, 'Otros Marcadores'].filter(s => systemsWithData.has(s)).map(sys => (
          <button
            key={sys}
            onClick={() => setFilterSystem(sys === filterSystem ? null : sys)}
            style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-main)', cursor: 'pointer', border: `1px solid ${filterSystem === sys ? 'var(--gold-primary)' : 'var(--border-subtle)'}`, background: filterSystem === sys ? 'rgba(212,175,55,0.15)' : 'transparent', color: filterSystem === sys ? 'var(--gold-primary)' : 'var(--text-muted)', transition: 'all 0.2s' }}
          >
            {sys.split(' ')[0]}…
          </button>
        ))}
      </div>

      {/* ── The Table ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', borderRadius: 12, border: '1px solid var(--border-subtle)' }} className="pdi-master-table-scroll">
        <style>{`
          @media print {
            .pdi-master-table-scroll { overflow: visible !important; }
            .pdi-no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            .pdi-master-table th, .pdi-master-table td { border: 1px solid #ccc !important; }
          }
          .pdi-master-table { border-collapse: collapse; min-width: 100%; }
          .pdi-master-table th { position: sticky; top: 0; z-index: 10; background: var(--bg-surface); box-shadow: 0 1px 0 rgba(212,175,55,0.2); }
          @keyframes pdi-row-glow { 0%,100%{background:transparent} 20%{background:rgba(212,175,55,0.22)} 60%{background:rgba(212,175,55,0.1)} }
          .pdi-row-glow-active { animation: pdi-row-glow 2.8s ease !important; outline: 1.5px solid rgba(212,175,55,0.6) !important; }
          .pdi-master-table td:first-child,
          .pdi-master-table th:first-child { position: sticky; left: 0; z-index: 3; }
          .pdi-master-table td:nth-child(2),
          .pdi-master-table th:nth-child(2) { position: sticky; left: 160px; z-index: 3; }
          .pdi-master-table td:nth-child(3),
          .pdi-master-table th:nth-child(3) { position: sticky; left: 210px; z-index: 3; }
          .pdi-master-table td:nth-child(4),
          .pdi-master-table th:nth-child(4) { position: sticky; left: 260px; z-index: 3; }
        `}</style>

        <table className="pdi-master-table">
          {/* Column header */}
          <thead>
            <tr>
              <th style={thStyle('160px')}>Marcador</th>
              <th style={thStyle('50px', 'center')}>Unidad</th>
              <th style={thStyle('50px', 'center')}>Ref. Mín</th>
              <th style={thStyle('50px', 'center')}>Ref. Máx</th>
              {sortedStudies.map((s, i) => {
                const date = getStudyDate(s);
                const age = patientBirthDate ? getAgeAt(patientBirthDate, date) : null;
                return (
                  <th key={i} style={{ ...thStyle('90px', 'center'), minWidth: 90 }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--gold-primary)' }}>
                      {formatDateShort(date)}
                    </span>
                    {age !== null && (
                      <span style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
                        {age} años
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visibleSystems.map(system => {
              const rows = rowsBySystem[system];
              if (!rows || rows.length === 0) return null;
              return (
                <React.Fragment key={`group-${system}`}>
                  {/* System separator row */}
                  <tr>
                    <td colSpan={4 + sortedStudies.length} style={{
                      padding: '8px 14px',
                      background: 'rgba(212,175,55,0.08)',
                      borderTop: '2px solid rgba(212,175,55,0.25)',
                      borderBottom: '1px solid rgba(212,175,55,0.15)',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--gold-primary)',
                    }}>
                      {system}
                    </td>
                  </tr>

                  {rows.map((row, ri) => (
                    <tr key={`${system}-${row.name}`} id={tablaBiomarkerElementId(row.name)} className={glowId === tablaBiomarkerElementId(row.name) ? 'pdi-row-glow-active' : ''} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>

                      {/* Marker name */}
                      <td style={{ ...tdStyle('var(--bg-surface)'), fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', paddingLeft: 14, minWidth: 160 }}>
                        {row.name}
                        {!row.isFromCatalog && (
                          <span title="Marcador fuera del catálogo estándar" style={{ marginLeft: 5, fontSize: 9, color: 'var(--gold-primary)', opacity: 0.7 }}>★</span>
                        )}
                      </td>
                      {/* Unit */}
                      <td style={{ ...tdStyle('var(--bg-surface)'), fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', minWidth: 50 }}>
                        {row.unit}
                      </td>
                      {/* Ref min */}
                      <td style={{ ...tdStyle('var(--bg-surface)'), fontSize: 10, color: '#60a5fa', textAlign: 'center', minWidth: 50 }}>
                        {row.refMin ?? '—'}
                      </td>
                      {/* Ref max */}
                      <td style={{ ...tdStyle('var(--bg-surface)'), fontSize: 10, color: '#f87171', textAlign: 'center', minWidth: 50 }}>
                        {row.refMax ?? '—'}
                      </td>
                      {/* Data cells */}
                      {sortedStudies.map((s, ci) => {
                        const dateKey = getStudyDate(s);
                        const cell = row.cells[dateKey];
                        return (
                          <td key={ci} style={{
                            textAlign: 'center',
                            padding: '4px 6px',
                            background: cell ? cellBg(cell.flag) : 'transparent',
                            minWidth: 90,
                            verticalAlign: 'middle',
                          }}>
                            {cell ? (
                              <EditableCell cell={cell} row={row} onSave={handleCellSave} />
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11, opacity: 0.3 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)' }} />
          Alto
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.4)' }} />
          Bajo
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: 'var(--gold-primary)' }}>★</span> Marcador fuera del catálogo estándar (único/raro)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--gold-primary)' }}>✏</span> Editado manualmente
        </span>
      </div>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
function thStyle(width: string, align: 'left' | 'center' | 'right' = 'left'): React.CSSProperties {
  return {
    width,
    minWidth: width,
    padding: '10px 8px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid rgba(212,175,55,0.2)',
    color: 'var(--text-secondary)',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    textAlign: align,
    whiteSpace: 'nowrap',
  };
}

function tdStyle(bg = 'transparent'): React.CSSProperties {
  return {
    padding: '5px 8px',
    background: bg,
    verticalAlign: 'middle',
  };
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportToCSV(rows: PivotRow[], studyDates: string[], studies: Study[]) {
  const dateLabels = studyDates.map(d => new Date(d).toLocaleDateString('es-MX'));
  const header = ['Marcador', 'Unidad', 'Ref. Mín', 'Ref. Máx', ...dateLabels];

  const lines: string[][] = [header];
  let lastSystem = '';

  for (const row of rows) {
    if (row.system !== lastSystem) {
      lines.push([`--- ${row.system} ---`]);
      lastSystem = row.system;
    }
    const cells = studyDates.map(d => row.cells[d]?.rawValue ?? '');
    lines.push([
      row.name,
      row.unit,
      row.refMin?.toString() ?? '',
      row.refMax?.toString() ?? '',
      ...cells,
    ]);
  }

  const csv = lines.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PDI_Tabla_Biomarcadores_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
