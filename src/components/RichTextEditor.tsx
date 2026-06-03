'use client';
/**
 * RichTextEditor — WYSIWYG editor styled to match the PDF output.
 * Uses Tiptap on top of ProseMirror. Accepts markdown, emits markdown.
 * Internally converts: markdown → HTML (via marked) for editing,
 * and HTML → markdown (via Turndown) on change.
 */

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { useEffect, useRef, useCallback } from 'react';
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Minus, Undo, Redo,
  Table as TableIcon,
} from 'lucide-react';

// ── Turndown setup ──────────────────────────────────────────────────────────
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
// Keep tables in GFM format
turndown.addRule('table', {
  filter: ['table'],
  replacement(_content, node) {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';
    const toMd = (row: Element) =>
      '| ' + Array.from(row.querySelectorAll('th,td')).map(c => c.textContent?.trim() ?? '').join(' | ') + ' |';
    const header = toMd(rows[0]);
    const separator = '| ' + Array.from(rows[0].querySelectorAll('th,td')).map(() => '---').join(' | ') + ' |';
    const body = rows.slice(1).map(toMd).join('\n');
    return '\n\n' + header + '\n' + separator + (body ? '\n' + body : '') + '\n\n';
  },
});

// ── marked setup ────────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: false });

function mdToHtml(md: string): string {
  try {
    return marked.parse(md) as string;
  } catch {
    return `<p>${md}</p>`;
  }
}

function htmlToMd(html: string): string {
  return turndown.turndown(html);
}

// ── Toolbar button ──────────────────────────────────────────────────────────
function ToolBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '32px', height: '32px', borderRadius: '6px', border: 'none',
        background: active ? 'rgba(212,175,55,0.18)' : 'transparent',
        color: active ? '#d4af37' : '#374151',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = active ? 'rgba(212,175,55,0.25)' : '#f3f4f6';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = active ? 'rgba(212,175,55,0.18)' : 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: '1px', height: '22px', background: '#e5e7eb', margin: '0 4px', flexShrink: 0 }} />;
}

// ── Toolbar ─────────────────────────────────────────────────────────────────
function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '2px',
      padding: '6px 12px',
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      borderRadius: '10px 10px 0 0',
      flexWrap: 'wrap',
      position: 'sticky', top: 0, zIndex: 10,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* History */}
      <ToolBtn title="Deshacer (⌘Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo size={15} />
      </ToolBtn>
      <ToolBtn title="Rehacer (⌘⇧Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo size={15} />
      </ToolBtn>

      <Divider />

      {/* Text style */}
      <ToolBtn title="Negrita (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={15} />
      </ToolBtn>
      <ToolBtn title="Cursiva (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={15} />
      </ToolBtn>

      <Divider />

      {/* Headings */}
      <ToolBtn
        title="Sección principal (##)"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={15} />
      </ToolBtn>
      <ToolBtn
        title="Subsección (###)"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={15} />
      </ToolBtn>

      <Divider />

      {/* Lists */}
      <ToolBtn title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={15} />
      </ToolBtn>
      <ToolBtn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={15} />
      </ToolBtn>

      <Divider />

      {/* Table */}
      <ToolBtn
        title="Insertar tabla"
        active={editor.isActive('table')}
        onClick={() => {
          if (editor.isActive('table')) {
            editor.chain().focus().deleteTable().run();
          } else {
            editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
          }
        }}
      >
        <TableIcon size={15} />
      </ToolBtn>

      {/* Table row/col controls — only when cursor is in a table */}
      {editor.isActive('table') && (
        <>
          <Divider />
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >+ Col</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >+ Fila</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >− Fila</button>
        </>
      )}

      <Divider />

      {/* HR */}
      <ToolBtn title="Separador horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={15} />
      </ToolBtn>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface RichTextEditorProps {
  /** Current markdown content */
  content: string;
  /** Called with new markdown every time the content changes */
  onChange: (markdown: string) => void;
  /** Estimated A4 page height in pixels at screen resolution (default 1122px ≈ A4 at 96dpi) */
  pageHeightPx?: number;
}

export default function RichTextEditor({ content, onChange, pageHeightPx = 1122 }: RichTextEditorProps) {
  const initialHtml = useRef(mdToHtml(content));
  const suppressChange = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        horizontalRule: {},
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Escribe aquí el contenido del módulo…' }),
    ],
    content: initialHtml.current,
    onUpdate({ editor: e }) {
      if (suppressChange.current) return;
      const html = e.getHTML();
      onChange(htmlToMd(html));
    },
    editorProps: {
      attributes: {
        class: 'pdi-rich-editor',
        spellcheck: 'true',
      },
    },
  });

  // If parent pushes new content (e.g. regenerate), update editor without loop
  useEffect(() => {
    if (!editor) return;
    const newHtml = mdToHtml(content);
    if (newHtml !== editor.getHTML()) {
      suppressChange.current = true;
      editor.commands.setContent(newHtml, { emitUpdate: false });
      suppressChange.current = false;
    }
  }, [content, editor]);

  if (!editor) return null;

  // ── Page break indicator lines ─────────────────────────────────────────────
  // We'll draw these as CSS pseudo-elements using a style tag injected once.
  // A4 at 96dpi = 1122px tall; minus top/bottom margins (15mm = ~57px each) → content ≈ 1008px.
  // But the editor has its own padding, so we use pageHeightPx as configurable.

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <Toolbar editor={editor} />

      {/* Editor surface styled to match PDF */}
      <div style={{
        background: '#ffffff',
        minHeight: '600px',
        position: 'relative',
      }}>
        <EditorContent editor={editor} />
      </div>

      {/* Page-break indicator — purely visual, not printed */}
      <div style={{
        padding: '4px 16px',
        background: '#f9fafb',
        borderTop: '1px solid #e5e7eb',
        borderRadius: '0 0 10px 10px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>
          Las líneas punteadas azules indican los saltos de página aproximados del PDF (A4)
        </span>
      </div>

      <style>{`
        /* ── Editor content styles — match PDF exactly ── */
        .pdi-rich-editor {
          padding: 40px 52px;
          min-height: 560px;
          outline: none;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          line-height: 1.75;
          color: #374151;
          position: relative;
        }

        /* Page-break visual guide lines */
        .pdi-rich-editor::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          background-image: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent calc(${pageHeightPx}px - 2px),
            #dbeafe calc(${pageHeightPx}px - 2px),
            #dbeafe ${pageHeightPx}px
          );
          z-index: 0;
        }

        .pdi-rich-editor > * {
          position: relative;
          z-index: 1;
        }

        /* ── Headings — same as PDF ── */
        .pdi-rich-editor h1 {
          font-size: 22px; font-weight: 800; color: #111827;
          margin: 28px 0 12px; line-height: 1.25;
        }
        .pdi-rich-editor h2 {
          font-size: 17px; font-weight: 700; color: #111827;
          margin: 28px 0 10px; padding-bottom: 6px;
          border-bottom: 2px solid #e5e7eb;
        }
        .pdi-rich-editor h3 {
          font-size: 14px; font-weight: 700; color: #92400e;
          margin: 20px 0 8px; padding: 8px 14px;
          border-left: 4px solid #b8922a;
          background: #fffbeb;
          border-radius: 0 8px 8px 0;
        }
        .pdi-rich-editor h4 {
          font-size: 12px; font-weight: 700; color: #374151;
          margin: 14px 0 4px; text-transform: uppercase; letter-spacing: 0.05em;
        }

        /* ── Body text ── */
        .pdi-rich-editor p {
          margin: 0 0 10px; color: #374151; line-height: 1.75;
        }
        .pdi-rich-editor strong { color: #111827; font-weight: 700; }
        .pdi-rich-editor em { color: #4b5563; }

        /* ── Lists ── */
        .pdi-rich-editor ul, .pdi-rich-editor ol {
          padding-left: 22px; margin: 8px 0 14px;
        }
        .pdi-rich-editor li { margin-bottom: 5px; color: #374151; }
        .pdi-rich-editor ul > li::marker { color: #b8922a; }
        .pdi-rich-editor ol > li::marker { color: #b8922a; font-weight: 700; }

        /* ── Blockquote ── */
        .pdi-rich-editor blockquote {
          margin: 12px 0; padding: 10px 16px;
          border-left: 4px solid #b8922a; background: #fffbeb;
          border-radius: 0 6px 6px 0; color: #78350f; font-style: italic;
        }

        /* ── Horizontal rule ── */
        .pdi-rich-editor hr {
          border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;
        }

        /* ── Tables — same as PDF ── */
        .pdi-rich-editor table {
          width: 100%; border-collapse: collapse; margin: 14px 0;
          font-size: 12px;
        }
        .pdi-rich-editor th {
          padding: 8px 12px; text-align: left; font-weight: 700;
          color: #1e293b; background: #f1f5f9;
          border: 1px solid #e2e8f0;
        }
        .pdi-rich-editor td {
          padding: 7px 12px; color: #374151;
          border: 1px solid #e2e8f0;
        }
        .pdi-rich-editor tr:nth-child(even) td { background: #f8fafc; }

        /* ── Table selected cell highlight ── */
        .pdi-rich-editor .selectedCell { background: #e0f2fe !important; }

        /* ── Placeholder ── */
        .pdi-rich-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #9ca3af; pointer-events: none; float: left; height: 0;
        }

        /* ── Focus ring ── */
        .pdi-rich-editor:focus-visible { outline: none; }
      `}</style>
    </div>
  );
}
