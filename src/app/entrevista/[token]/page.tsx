'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { ALL_SECTIONS, HIDDEN_QUESTION_IDS } from '@/lib/questionnaire-data-ext';
import { QuestionItem } from '@/lib/questionnaire-data';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffQuestion {
  id: string;
  question: string;
  justification: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#D4AF37';
const PATIENT_SECTIONS = ALL_SECTIONS.filter((s) => s.num <= 13);

// Questions visible to patients: has id, not in HIDDEN_QUESTION_IDS, id doesn't start with 'notes_s'
function isPatientQuestion(q: QuestionItem): q is QuestionItem & { id: string } {
  return (
    !!q.id &&
    !HIDDEN_QUESTION_IDS.includes(q.id) &&
    !q.id.startsWith('notes_s')
  );
}

const ALL_PATIENT_QUESTIONS = PATIENT_SECTIONS.flatMap((s) =>
  s.questions.filter(isPatientQuestion)
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#f0f0f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    overflowX: 'hidden',
  },
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '0 16px 80px',
  },
  header: {
    padding: '20px 16px 0',
    maxWidth: '720px',
    margin: '0 auto',
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  logo: {
    fontSize: '13px',
    fontWeight: 700,
    color: GOLD,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    background: 'rgba(212,175,55,0.1)',
    padding: '4px 10px',
    borderRadius: '6px',
    border: `1px solid rgba(212,175,55,0.3)`,
  },
  headerTitle: {
    fontSize: '14px',
    color: '#888',
    fontWeight: 400,
  },
  patientName: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#f0f0f0',
    margin: '4px 0 20px',
  },
  progressWrap: {
    height: '4px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressBar: {
    height: '100%',
    background: `linear-gradient(90deg, ${GOLD}, #f0c93a)`,
    borderRadius: '2px',
    transition: 'width 0.4s ease',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '16px',
  },
  tabsWrap: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto' as const,
    paddingBottom: '12px',
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
    marginBottom: '4px',
  },
  tab: {} as React.CSSProperties, // placeholder – use tabStyle() function below
  sectionCard: {
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  sectionIcon: {
    fontSize: '24px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f0f0f0',
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: '12px',
    color: '#888',
    margin: '2px 0 0',
  },
  subsectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: GOLD,
    margin: '20px 0 12px',
    opacity: 0.8,
  },
  questionWrap: {
    marginBottom: '20px',
  },
  questionLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#f0f0f0',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  checkmark: {
    color: '#22c55e',
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
  },
  hint: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '8px',
    fontStyle: 'italic' as const,
  },
  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#f0f0f0',
    fontSize: '14px',
    padding: '10px 12px',
    resize: 'vertical' as const,
    minHeight: '72px',
    outline: 'none',
    fontFamily: "'Inter', system-ui, sans-serif",
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#f0f0f0',
    fontSize: '14px',
    padding: '10px 12px',
    outline: 'none',
    fontFamily: "'Inter', system-ui, sans-serif",
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  },
  pillsWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  pill: {} as React.CSSProperties, // placeholder – use pillStyle() function below
  diffSection: {
    background: '#0f0f1a',
    border: `1px solid rgba(212,175,55,0.25)`,
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '16px',
  },
  diffTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: GOLD,
    marginBottom: '4px',
  },
  diffSubtitle: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '20px',
  },
  diffQuestion: {
    marginBottom: '20px',
    padding: '16px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  diffQuestionText: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#f0f0f0',
    marginBottom: '10px',
  },
  finishBtn: {
    display: 'block',
    width: '100%',
    padding: '16px',
    background: GOLD,
    color: '#0a0a0a',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
    marginTop: '24px',
    transition: 'opacity 0.2s',
    letterSpacing: '0.02em',
  },
  spinnerWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '40px 0',
    gap: '16px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: `3px solid rgba(212,175,55,0.2)`,
    borderTop: `3px solid ${GOLD}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorPage: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
    padding: '40px 24px',
    textAlign: 'center' as const,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '20px',
  },
  errorTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#f0f0f0',
    marginBottom: '12px',
  },
  errorMsg: {
    fontSize: '15px',
    color: '#888',
    maxWidth: '400px',
    lineHeight: 1.6,
  },
  completionPage: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
    padding: '40px 24px',
    textAlign: 'center' as const,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  completionCard: {
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    padding: '40px 32px',
    maxWidth: '480px',
    width: '100%',
  },
  completionIcon: {
    fontSize: '56px',
    marginBottom: '16px',
  },
  completionTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#f0f0f0',
    marginBottom: '12px',
  },
  completionMsg: {
    fontSize: '15px',
    color: '#aaa',
    lineHeight: 1.6,
    marginBottom: '8px',
  },
  completionSmall: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '28px',
  },
  reviewBtn: {
    padding: '12px 24px',
    background: 'rgba(212,175,55,0.1)',
    border: `1px solid rgba(212,175,55,0.4)`,
    color: GOLD,
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};

function tabStyle(active: boolean, done: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    border: done && !active ? '1px solid rgba(34,197,94,0.4)' : 'none',
    outline: 'none',
    transition: 'all 0.2s',
    background: active ? GOLD : done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
    color: active ? '#0a0a0a' : done ? '#22c55e' : '#888',
  };
}

function pillStyle(selected: boolean): React.CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: selected ? `1.5px solid ${GOLD}` : '1.5px solid rgba(255,255,255,0.12)',
    background: selected ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
    color: selected ? GOLD : '#aaa',
    transition: 'all 0.18s',
    userSelect: 'none',
  };
}

// ─── Component helpers ─────────────────────────────────────────────────────────

function PillGroup({
  options,
  value,
  multi,
  onChange,
}: {
  options: string[];
  value: string;
  multi: boolean;
  onChange: (v: string) => void;
}) {
  const selected = value ? value.split('||') : [];

  function toggle(opt: string) {
    if (!multi) {
      onChange(opt === value ? '' : opt);
    } else {
      const next = selected.includes(opt)
        ? selected.filter((o) => o !== opt)
        : [...selected, opt];
      onChange(next.join('||'));
    }
  }

  return (
    <div style={styles.pillsWrap}>
      {options.map((opt) => (
        <button
          key={opt}
          style={pillStyle(selected.includes(opt))}
          onClick={() => toggle(opt)}
          type="button"
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// Scale question
function ScaleQuestion({
  min = 1,
  max = 10,
  minLabel = '',
  maxLabel = '',
  value,
  onChange,
}: {
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n) === value ? '' : String(n))}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: String(n) === value ? `1.5px solid ${GOLD}` : '1.5px solid rgba(255,255,255,0.12)',
              background: String(n) === value ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
              color: String(n) === value ? GOLD : '#aaa',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.18s',
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: '#666' }}>{minLabel}</span>
          <span style={{ fontSize: '11px', color: '#666' }}>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

// ─── Question renderer ─────────────────────────────────────────────────────────

function QuestionRenderer({
  q,
  answers,
  onSave,
}: {
  q: QuestionItem & { id: string };
  answers: Record<string, string>;
  onSave: (id: string, val: string) => void;
}) {
  const val = answers[q.id] ?? '';
  const isAnswered = !!val.trim();

  // Special cases
  if (q.id === 's1q10') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <textarea
          style={styles.textarea}
          defaultValue={val}
          placeholder="Describa sus antecedentes heredofamiliares..."
          onBlur={(e) => onSave(q.id, e.target.value)}
        />
      </div>
    );
  }

  if (q.id === 's1q11') {
    const detail = answers['s1q12'] ?? '';
    const showDetail = val === 'Sí';
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <PillGroup options={['No', 'Sí']} value={val} multi={false} onChange={(v) => onSave(q.id, v)} />
        {showDetail && (
          <textarea
            style={{ ...styles.textarea, marginTop: '10px' }}
            defaultValue={detail}
            placeholder="¿Cuál fue la causa? ¿Cuándo?"
            onBlur={(e) => onSave('s1q12', e.target.value)}
          />
        )}
      </div>
    );
  }

  if (q.id === 's1q12') return null; // rendered inside s1q11

  if (q.id === 's1q13') {
    const detail = answers['s1q14'] ?? '';
    const showDetail = val === 'Sí';
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <PillGroup options={['No', 'Sí']} value={val} multi={false} onChange={(v) => onSave(q.id, v)} />
        {showDetail && (
          <textarea
            style={{ ...styles.textarea, marginTop: '10px' }}
            defaultValue={detail}
            placeholder="Liste sus cirugías y año aproximado"
            onBlur={(e) => onSave('s1q14', e.target.value)}
          />
        )}
      </div>
    );
  }

  if (q.id === 's1q14') return null; // rendered inside s1q13

  if (q.id === 's1q15') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <textarea
          style={styles.textarea}
          defaultValue={val}
          placeholder="Escriba 'ninguna' si no tiene"
          onBlur={(e) => onSave(q.id, e.target.value)}
        />
      </div>
    );
  }

  if (q.id === 's1q16') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <textarea
          style={styles.textarea}
          defaultValue={val}
          placeholder="Liste sus medicamentos actuales (nombre, dosis, frecuencia)"
          onBlur={(e) => onSave(q.id, e.target.value)}
        />
      </div>
    );
  }

  if (q.id === 's6q6_vax') {
    const detail = answers['s6q6_vax_detail'] ?? '';
    const showDetail = val === 'Sí' || val === 'Otros';
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <PillGroup options={['No', 'Sí', 'Otros']} value={val} multi={false} onChange={(v) => onSave(q.id, v)} />
        {showDetail && (
          <textarea
            style={{ ...styles.textarea, marginTop: '10px' }}
            defaultValue={detail}
            placeholder="¿Cuántas dosis? ¿Qué marca(s)?"
            onBlur={(e) => onSave('s6q6_vax_detail', e.target.value)}
          />
        )}
      </div>
    );
  }

  if (q.id === 's6q6_vax_detail') return null; // rendered inside s6q6_vax

  // Generic rendering by type
  const type = q.type;

  if (type === 'opts') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <PillGroup options={q.options ?? []} value={val} multi={false} onChange={(v) => onSave(q.id, v)} />
      </div>
    );
  }

  if (type === 'multiopt') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <PillGroup options={q.options ?? []} value={val} multi onChange={(v) => onSave(q.id, v)} />
      </div>
    );
  }

  if (type === 'scale') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
        </div>
        <ScaleQuestion
          min={q.min}
          max={q.max}
          minLabel={q.minLabel}
          maxLabel={q.maxLabel}
          value={val}
          onChange={(v) => onSave(q.id, v)}
        />
      </div>
    );
  }

  if (type === 'num') {
    return (
      <div style={styles.questionWrap}>
        <div style={styles.questionLabel}>
          {isAnswered && <span style={styles.checkmark}>✓</span>}
          {q.label}
          {q.unit && <span style={{ color: '#888', fontWeight: 400, fontSize: '12px' }}> ({q.unit})</span>}
        </div>
        <input
          type="number"
          style={styles.input}
          defaultValue={val}
          onBlur={(e) => onSave(q.id, e.target.value)}
        />
      </div>
    );
  }

  // text or anything else
  const isLong = type === 'text' && (q.hint?.length ?? 0) > 30;
  return (
    <div style={styles.questionWrap}>
      <div style={styles.questionLabel}>
        {isAnswered && <span style={styles.checkmark}>✓</span>}
        {q.label}
      </div>
      {q.hint && <div style={styles.hint}>{q.hint}</div>}
      {isLong ? (
        <textarea
          style={styles.textarea}
          defaultValue={val}
          onBlur={(e) => onSave(q.id, e.target.value)}
        />
      ) : (
        <input
          type="text"
          style={styles.input}
          defaultValue={val}
          onBlur={(e) => onSave(q.id, e.target.value)}
        />
      )}
    </div>
  );
}

// ─── Section completeness check ────────────────────────────────────────────────

function isSectionComplete(sectionNum: number, answers: Record<string, string>): boolean {
  const section = PATIENT_SECTIONS.find((s) => s.num === sectionNum);
  if (!section) return false;
  const qs = section.questions.filter(isPatientQuestion);
  if (qs.length === 0) return true;
  // Section is "complete" if at least 50% of questions are answered
  const answered = qs.filter((q) => !!answers[q.id]?.trim()).length;
  return answered > 0 && answered >= Math.ceil(qs.length * 0.5);
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function EntrevistaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [gender, setGender] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentSection, setCurrentSection] = useState(0);
  const [differentialQuestions, setDifferentialQuestions] = useState<DiffQuestion[]>([]);
  const [diffAnswers, setDiffAnswers] = useState<Record<string, string>>({});
  const [isDone, setIsDone] = useState(false);
  const [generatingDiff, setGeneratingDiff] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadInterview() {
      try {
        const res = await fetch(`/api/entrevista/${token}`);
        if (!res.ok) {
          setError('Este link no es válido o ha sido desactivado por tu médico.');
          return;
        }
        const data = await res.json();
        setPatientName(data.patientName ?? '');
        setGender(data.gender ?? '');

        const loadedAnswers: Record<string, string> = data.answers ?? {};

        // Extract differential questions stored in answers
        let diffQs: DiffQuestion[] = [];
        if (loadedAnswers['differential_questions']) {
          try {
            diffQs = JSON.parse(loadedAnswers['differential_questions']);
            setDifferentialQuestions(diffQs);
          } catch {
            // ignore parse error
          }
        }

        // Extract diff answers (keys starting with diff_a_)
        const loadedDiffAnswers: Record<string, string> = {};
        for (const [k, v] of Object.entries(loadedAnswers)) {
          if (k.startsWith('diff_a_')) {
            loadedDiffAnswers[k] = v;
          }
        }
        setDiffAnswers(loadedDiffAnswers);

        // Remove special keys from main answers
        const cleanAnswers: Record<string, string> = {};
        for (const [k, v] of Object.entries(loadedAnswers)) {
          if (k !== 'differential_questions' && !k.startsWith('diff_a_')) {
            cleanAnswers[k] = v;
          }
        }
        setAnswers(cleanAnswers);

        // Check if all diff questions answered → done
        if (diffQs.length > 0) {
          const allDiffDone = diffQs.every((dq) => !!loadedDiffAnswers[`diff_a_${dq.id}`]?.trim());
          if (allDiffDone) setIsDone(true);
        }
      } catch {
        setError('No se pudo cargar la entrevista. Por favor, inténtalo de nuevo.');
      } finally {
        setLoading(false);
      }
    }
    loadInterview();
  }, [token]);

  // ── Save answer (fire & forget) ────────────────────────────────────────────
  const saveAnswer = useCallback(
    (questionId: string, answer: string) => {
      // Update local state immediately
      if (questionId.startsWith('diff_a_')) {
        setDiffAnswers((prev) => ({ ...prev, [questionId]: answer }));
      } else {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));
      }
      // Fire and forget
      fetch(`/api/entrevista/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer }),
      }).catch(() => {/* silent */});
    },
    [token]
  );

  // ── Progress ───────────────────────────────────────────────────────────────
  const totalQuestions = ALL_PATIENT_QUESTIONS.length;
  const answeredCount = ALL_PATIENT_QUESTIONS.filter((q) => !!answers[q.id]?.trim()).length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // ── Section 1-13 completeness ──────────────────────────────────────────────
  const allSectionsDone = PATIENT_SECTIONS.every((s) => isSectionComplete(s.num, answers));

  // ── Differential completeness ──────────────────────────────────────────────
  const allDiffDone =
    differentialQuestions.length > 0 &&
    differentialQuestions.every((dq) => !!diffAnswers[`diff_a_${dq.id}`]?.trim());

  // Auto-mark done when all diff answered
  useEffect(() => {
    if (allDiffDone && !isDone) {
      setIsDone(true);
    }
  }, [allDiffDone, isDone]);

  // ── Generate differential ──────────────────────────────────────────────────
  async function handleGenerateDifferential() {
    setGeneratingDiff(true);
    try {
      const res = await fetch(`/api/entrevista/${token}/differential`, { method: 'POST' });
      const data = await res.json();
      if (data.questions) {
        setDifferentialQuestions(data.questions);
      }
    } catch {
      // silent
    } finally {
      setGeneratingDiff(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ ...styles.errorPage }}>
          <div style={styles.spinner} />
          <span style={{ color: '#888', fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>Cargando entrevista...</span>
        </div>
      </>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
        <div style={styles.errorPage}>
          <div style={styles.errorIcon}>🔒</div>
          <div style={styles.errorTitle}>Acceso no disponible</div>
          <div style={styles.errorMsg}>{error}</div>
        </div>
      </>
    );
  }

  // ── Completion screen ──────────────────────────────────────────────────────
  if (isDone && !showReview) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
        <div style={styles.completionPage}>
          <div style={styles.completionCard}>
            <div style={styles.completionIcon}>✅</div>
            <div style={styles.completionTitle}>¡Entrevista completada!</div>
            <div style={styles.completionMsg}>
              Gracias, <strong>{patientName}</strong>. Tu médico revisará tus respuestas a la brevedad.
            </div>
            <div style={styles.completionSmall}>Puedes cerrar esta página con seguridad.</div>
            <button
              style={styles.reviewBtn}
              onClick={() => setShowReview(true)}
            >
              Revisar mis respuestas
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Main interview ─────────────────────────────────────────────────────────
  const activeSection = PATIENT_SECTIONS[currentSection];

  // Build tabs including diff section if it exists
  const tabs = [
    ...PATIENT_SECTIONS.map((s) => ({
      label: `${s.icon} ${s.num}`,
      done: isSectionComplete(s.num, answers),
    })),
    ...(differentialQuestions.length > 0
      ? [{ label: '✦ Extra', done: allDiffDone }]
      : []),
  ];

  const showDiffSection = currentSection === PATIENT_SECTIONS.length && differentialQuestions.length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; }
        textarea:focus, input:focus { border-color: rgba(212,175,55,0.5) !important; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={styles.root}>
        {/* ── Header ── */}
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <span style={styles.logo}>PDI</span>
            <span style={styles.headerTitle}>Entrevista Clínica PDI</span>
          </div>
          <div style={styles.patientName}>{patientName}</div>

          {/* Progress bar */}
          <div style={styles.progressWrap}>
            <div style={{ ...styles.progressBar, width: `${progress}%` }} />
          </div>
          <div style={styles.progressLabel}>{progress}% completado · {answeredCount}/{totalQuestions} preguntas</div>

          {/* Section tabs */}
          <div style={styles.tabsWrap}>
            {tabs.map((tab, idx) => (
              <button
                key={idx}
                style={tabStyle(currentSection === idx, tab.done)}
                onClick={() => setCurrentSection(idx)}
                type="button"
              >
                {tab.done && currentSection !== idx ? `✓ ${tab.label}` : tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.container}>
          {/* ── Differential section ── */}
          {showDiffSection ? (
            <div style={styles.diffSection}>
              <div style={styles.diffTitle}>✦ Preguntas adicionales de su médico</div>
              <div style={styles.diffSubtitle}>
                Su médico generó estas preguntas para complementar su diagnóstico. Por favor respóndalas con detalle.
              </div>
              {differentialQuestions.map((dq) => {
                const key = `diff_a_${dq.id}`;
                const val = diffAnswers[key] ?? '';
                const answered = !!val.trim();
                return (
                  <div key={dq.id} style={styles.diffQuestion}>
                    <div style={styles.diffQuestionText}>
                      {answered && <span style={{ ...styles.checkmark, marginRight: '6px' }}>✓</span>}
                      {dq.question}
                    </div>
                    <textarea
                      style={styles.textarea}
                      defaultValue={val}
                      placeholder="Su respuesta..."
                      onBlur={(e) => saveAnswer(key, e.target.value)}
                    />
                  </div>
                );
              })}
              {allDiffDone && (
                <button style={styles.finishBtn} onClick={() => setIsDone(true)}>
                  ✓ Finalizar entrevista
                </button>
              )}
            </div>
          ) : (
            /* ── Regular section ── */
            activeSection && (
              <div style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionIcon}>{activeSection.icon}</span>
                  <div>
                    <div style={styles.sectionTitle}>
                      {activeSection.num}. {activeSection.title}
                    </div>
                    <div style={styles.sectionSubtitle}>{activeSection.subtitle}</div>
                  </div>
                </div>

                {activeSection.questions.map((q, qIdx) => {
                  if (q.subsection) {
                    return (
                      <div key={`sub-${qIdx}`} style={styles.subsectionLabel}>
                        {q.subsection}
                      </div>
                    );
                  }
                  if (!isPatientQuestion(q)) return null;
                  return (
                    <QuestionRenderer
                      key={q.id}
                      q={q}
                      answers={answers}
                      onSave={saveAnswer}
                    />
                  );
                })}
              </div>
            )
          )}

          {/* ── Navigation ── */}
          {!showDiffSection && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              {currentSection > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentSection((c) => c - 1)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#f0f0f0',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ← Anterior
                </button>
              )}
              {currentSection < PATIENT_SECTIONS.length - 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentSection((c) => c + 1)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: GOLD,
                    border: 'none',
                    borderRadius: '12px',
                    color: '#0a0a0a',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Siguiente →
                </button>
              )}
              {/* Last section: show Finalize button */}
              {currentSection === PATIENT_SECTIONS.length - 1 && (
                <>
                  {generatingDiff ? (
                    <div style={{ flex: 1 }}>
                      <div style={styles.spinnerWrap}>
                        <div style={styles.spinner} />
                        <span style={{ color: '#888', fontSize: '14px' }}>Generando preguntas adicionales…</span>
                      </div>
                    </div>
                  ) : differentialQuestions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentSection(PATIENT_SECTIONS.length)}
                      style={{
                        flex: 1,
                        padding: '14px',
                        background: GOLD,
                        border: 'none',
                        borderRadius: '12px',
                        color: '#0a0a0a',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Ver preguntas adicionales ✦
                    </button>
                  ) : allSectionsDone ? (
                    <button
                      type="button"
                      onClick={handleGenerateDifferential}
                      style={{
                        flex: 1,
                        padding: '14px',
                        background: GOLD,
                        border: 'none',
                        borderRadius: '12px',
                        color: '#0a0a0a',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Finalizar entrevista →
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      style={{
                        flex: 1,
                        padding: '14px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        color: '#555',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'not-allowed',
                      }}
                    >
                      Complete las secciones para finalizar
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Back from diff section */}
          {showDiffSection && (
            <button
              type="button"
              onClick={() => setCurrentSection(PATIENT_SECTIONS.length - 1)}
              style={{
                marginTop: '12px',
                padding: '12px 20px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#aaa',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Volver a las secciones
            </button>
          )}
        </div>
      </div>
    </>
  );
}
