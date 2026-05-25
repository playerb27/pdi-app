'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { Printer, Download, Edit2, Check, X, Eye } from 'lucide-react';
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
  originalValue?: string | null;
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
  patientId: string;
  patientBirthDate?: string;
  glowId?: string | null;
  onBiomarkerUpdated?: (studyId: string, biomarkerId: string, newValue: string, newFlag: string) => void;
  documents?: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getStudyDate(s: Study): string {
  const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return (s as any).exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
}

/** Normalize any date string → YYYY-MM-DD (used as grouping/column key). */
function toDateKey(dateStr: string): string {
  const m = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  // Fallback: parse as Date and extract YYYY-MM-DD
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return dateStr; // last resort
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
// ─── Cell Editor (inline) ────────────────────────────────────────────────────
function EditableCell({ cell, row, documents, onSave }: {
  cell: CellData;
  row: PivotRow;
  documents?: any[];
  onSave: (biomarkerId: string, studyId: string, val: string, flag: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(cell.rawValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(cell.rawValue);
  }, [cell.rawValue]);

  const handleSave = async () => {
    if (!cell.biomarkerId) return;
    const num = parseFloat(val.replace(',', '.'));
    const newFlag = isNaN(num) ? cell.flag : (computeFlag(row.name, num) ?? cell.flag);
    setSaving(true);
    // Clean replace — no originalValue tracking
    const ok = await updateBiomarker(cell.biomarkerId, {
      value: val,
      flag: newFlag,
    });
    if (!ok) {
      alert('❌ Error al guardar. Abre la consola (F12) para ver el error.');
      setSaving(false);
      return;
    }
    onSave(cell.biomarkerId, cell.studyId, val, newFlag);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    const doc = documents?.find(d => d.study_id === cell.studyId);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 90 }}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 55, background: 'var(--bg-main)', border: '1px solid var(--gold-primary)', color: 'var(--text-primary)', borderRadius: 4, padding: '2px 5px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
        />
        <button onClick={handleSave} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 2, display: 'flex' }}>
          <Check size={11} />
        </button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, display: 'flex' }}>
          <X size={11} />
        </button>
        {doc && (
          <a
            href={doc.public_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver Documento Original"
            style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--gold-primary)', padding: 2, transition: 'transform 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Eye size={12} />
          </a>
        )}
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
      {cell.isEdited && (
        <span
          title={`Corregido manualmente. Valor original: ${cell.originalValue?.split('|')[0] || cell.rawValue}`}
          style={{ fontSize: 9, color: 'var(--gold-primary)', cursor: 'help' }}
        >
          ✏️
        </span>
      )}
      {cell.biomarkerId && (
        <Edit2 size={9} color="var(--text-muted)" style={{ opacity: 0, transition: 'opacity 0.15s' }} className="cell-edit-icon" />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BiomarkerMasterTable({ studies, patientId, patientBirthDate, glowId, onBiomarkerUpdated, documents }: Props) {
  const [localStudies, setLocalStudies] = useState<Study[]>(studies);
  const [filterSystem, setFilterSystem] = useState<string | null>(null);

  // Keep local state in sync when parent changes.
  // IMPORTANT: Skip sync while glowId is active — re-rendering the table
  // destroys the CSS animation on the highlighted row.
  useEffect(() => {
    if (!glowId) {
      setLocalStudies(studies);
    }
  }, [studies, glowId]);

  // If a marker is searched (glowId is provided):
  // 1. Clear system filters so the row is rendered
  // 2. Scroll the row into view inside the table's own scroll container
  useEffect(() => {
    if (!glowId) return;
    setFilterSystem(null);
    // Wait one frame for the row to render with the correct filter, then scroll
    requestAnimationFrame(() => {
      const el = document.getElementById(glowId);
      const panel = document.getElementById('pdi-master-table-scroll');
      if (el && panel) {
        const elRect = el.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const scrollTarget = elRect.top - panelRect.top + panel.scrollTop - panel.clientHeight / 2 + el.clientHeight / 2;
        panel.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
      }
    });
  }, [glowId]);

  // ── Build sorted study date columns ─────────────────────────────────────────
  const sortedStudies = useMemo(() =>
    [...localStudies].sort((a, b) => new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime()),
    [localStudies]
  );

  // One column per UNIQUE calendar date (YYYY-MM-DD).
  // getStudyDate() may return full timestamps that differ per-study even on the
  // same day — toDateKey() strips the time component before deduplicating.
  const studyDates = useMemo(() => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of sortedStudies) {
      const key = toDateKey(getStudyDate(s));
      if (!seen.has(key)) { seen.add(key); unique.push(key); }
    }
    return unique;
  }, [sortedStudies]);


  // ── Build pivot rows ─────────────────────────────────────────────────────────
  const { catalogRows, unknownRows } = useMemo(() => {
    // First pass: collect all biomarker data keyed by canonical name
    const dataMap: Record<string, PivotRow> = {};

    for (const study of sortedStudies) {
      const dateKey = toDateKey(getStudyDate(study)); // always YYYY-MM-DD
      for (const bm of (study.biomarkers ?? [])) {
        // Use lowercase as the dataMap key for case-insensitive lookups
        const rawCanonical = (bm as any).canonical_name ?? normalizeBiomarkerName(bm.name);
        const canonical = rawCanonical.toLowerCase();
        const num = parseFloat(String(bm.value).replace(',', '.'));
        const rawStr = String(bm.value ?? '').trim();
        // Accept numeric values OR meaningful text values (Negativo, Positivo, 1:80, etc.)
        // Skip only if truly empty or just whitespace
        const isMeaningfulText = isNaN(num) && rawStr.length > 0;
        if (isNaN(num) && !isMeaningfulText) continue;
        if ((bm as any).flag === 'Excluido') continue;  // doctor marked as "no graficar"

        const catalogEntry = getCatalogEntry(canonical);
        const flag = isNaN(num) ? (bm.flag as any) ?? 'Normal' : (computeFlag(canonical, num) ?? (bm.flag as any) ?? 'Normal');
        // Use catalog's properly-cased name for display; fall back to original pre-lowercase canonical
        const displayName = catalogEntry?.name ?? rawCanonical;

        if (!dataMap[canonical]) {
          dataMap[canonical] = {
            name: displayName,
            unit: catalogEntry?.unit ?? bm.unit,
            refMin: catalogEntry?.refMin ?? null,
            refMax: catalogEntry?.refMax ?? null,
            system: catalogEntry?.system ?? (bm as any).canonical_system ?? bm.system ?? 'Otros Marcadores',
            isFromCatalog: !!catalogEntry,
            cells: {},
          };
        }

        // Keep one value per study date — prioritize is_edited rows over non-edited duplicates.
        // This ensures manually corrected values from the DB always win over raw duplicates.
        const incoming: CellData = {
          value: isNaN(num) ? 0 : num,
          rawValue: rawStr,
          flag,
          biomarkerId: (bm as any).id,
          studyId: study.id,
          isEdited: (bm as any).is_edited,
          originalValue: (bm as any).original_value || null,
        };
        const existing = dataMap[canonical].cells[dateKey];
        if (!existing || (incoming.isEdited && !existing.isEdited)) {
          // Accept: no existing cell, or incoming is edited and existing is not
          dataMap[canonical].cells[dateKey] = incoming;
        }
        // If existing is already edited and incoming is not, keep existing
      }
    }

    // Second pass: split into catalog order vs unknown
    const catalogNames = new Set(BIOMARKER_CATALOG.map(e => e.name.toLowerCase()));

    const catalogRows: PivotRow[] = BIOMARKER_CATALOG
      .filter(entry => !!dataMap[entry.name.toLowerCase()])
      .map(entry => dataMap[entry.name.toLowerCase()])
      .filter(Boolean) as PivotRow[];

    const unknownRows: PivotRow[] = Object.values(dataMap)
      .filter(row => !catalogNames.has(row.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { catalogRows, unknownRows };
  }, [sortedStudies, patientId]);

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
    // Patch local studies state so UI re-renders immediately with new value
    setLocalStudies(prev => prev.map(s => s.id !== studyId ? s : {
      ...s,
      biomarkers: (s.biomarkers ?? []).map((b: any) => {
        if (b.id !== biomarkerId) return b;
        return {
          ...b,
          value: val,
          flag,
          is_edited: true,
          original_value: null,  // wiped
        };
      }),
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
      <div id="pdi-master-table-scroll" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', borderRadius: 12, border: '1px solid var(--border-subtle)' }} className="pdi-master-table-scroll">
        <style>{`
          @media print {
            .pdi-master-table-scroll { overflow: visible !important; }
            .pdi-no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            .pdi-master-table th, .pdi-master-table td { border: 1px solid #ccc !important; }
          }
          .pdi-master-table { border-collapse: collapse; min-width: 100%; }
          .pdi-master-table th { position: sticky; top: 0; z-index: 10; background: var(--bg-surface); box-shadow: 0 1px 0 rgba(212,175,55,0.2); }
          @keyframes pdi-row-glow {
            0% { background: transparent; }
            5% { background: rgba(250, 204, 21, 0.35); }
            85% { background: rgba(250, 204, 21, 0.35); }
            100% { background: transparent; }
          }
          .pdi-row-glow-active {
            animation: pdi-row-glow 10s ease-in-out !important;
            outline: 2px solid rgba(250, 204, 21, 0.8) !important;
            outline-offset: -2px;
          }
          .pdi-row-glow-active td {
            background: rgba(250, 204, 21, 0.2) !important;
          }
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
              {studyDates.map((date) => {
                const age = patientBirthDate ? getAgeAt(patientBirthDate, date) : null;
                return (
                  <th key={date} style={{ ...thStyle('90px', 'center'), minWidth: 90 }}>
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
                    <td colSpan={4 + studyDates.length} style={{
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
                      {/* Data cells — one per unique date */}
                      {studyDates.map((date) => {
                        const cell = row.cells[date];
                        return (
                          <td key={date} style={{
                            textAlign: 'center',
                            padding: '4px 6px',
                            background: cell ? cellBg(cell.flag) : 'transparent',
                            minWidth: 90,
                            verticalAlign: 'middle',
                          }}>
                            {cell ? (
                              <EditableCell cell={cell} row={row} documents={documents} onSave={handleCellSave} />
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
  const dateLabels = studyDates.map(d => {
    // Add T12:00:00 to avoid UTC→local shift (same fix as formatDateShort)
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d;
    return new Date(normalized).toLocaleDateString('es-MX');
  });
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
