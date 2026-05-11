'use client';
import { useState, useEffect, use, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { ALL_SECTIONS, TOTAL_QUESTIONS } from '@/lib/questionnaire-data-ext';
import { upsertInterviewAnswer, getInterviewAnswers } from '@/lib/api';
import { getPatientById, Patient } from '@/lib/api';

export default function EntrevistaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showPending, setShowPending] = useState(false);

  useEffect(() => {
    getPatientById(id).then(setPatient);
    getInterviewAnswers(id).then(setAnswers);
  }, [id]);

  // Section navigation — always scrolls window to top
  const goToSection = useCallback((idx: number) => {
    setCurrentSection(idx);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 30);
  }, []);

  // Navigate to a specific section AND scroll to the exact question element
  const goToQuestion = useCallback((sectionIdx: number, questionId: string) => {
    setCurrentSection(sectionIdx);
    setShowPending(false);
    setTimeout(() => {
      const el = document.getElementById(`q-${questionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--gold-primary)';
        el.style.borderRadius = '8px';
        setTimeout(() => { el.style.outline = ''; el.style.borderRadius = ''; }, 2000);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 120);
  }, []);

  // Silent upsert on every answer — no loading state
  const handleAnswer = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    upsertInterviewAnswer(id, questionId, value); // fire and forget
  }, [id]);

  const handleMultiAnswer = useCallback((questionId: string, option: string) => {
    setAnswers(prev => {
      const current = prev[questionId] ? prev[questionId].split('||') : [];
      const updated = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option];
      const value = updated.join('||');
      upsertInterviewAnswer(id, questionId, value); // fire and forget
      return { ...prev, [questionId]: value };
    });
  }, [id]);

  // Pending questions across ALL sections
  const pendingQuestions = ALL_SECTIONS.flatMap(s =>
    s.questions.filter(q => q.id && !answers[q.id]).map(q => ({ ...q, sectionTitle: s.title, sectionNum: s.num, sectionIcon: s.icon }))
  );

  const section = ALL_SECTIONS[currentSection];
  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / TOTAL_QUESTIONS) * 100);

  const sectionAnswered = section.questions.filter(q => q.id && answers[q.id!]).length;
  const sectionTotal   = section.questions.filter(q => q.id).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', fontFamily: 'var(--font-main)' }}>

      {/* ── Sticky Header ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '16px 32px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => router.push(`/pacientes/${id}`)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                <ArrowLeft size={20} />
              </button>
              <div>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Entrevista Clínica PDI</p>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{patient?.full_name ?? '...'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{answeredCount} / {TOTAL_QUESTIONS} respondidas</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gold-primary)' }}>{progress}%</span>
              <button
                onClick={() => setShowPending(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '99px', border: '1px solid rgba(239,68,68,0.4)', background: showPending ? 'rgba(239,68,68,0.1)' : 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)' }}
              >
                <AlertCircle size={12} /> {pendingQuestions.length} pendientes
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: '5px', background: 'var(--border-subtle)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--gold-primary), #b8960c)', borderRadius: '99px', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </header>

      {/* ── Pending Panel ── */}
      {showPending && (
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 32px' }}>
          <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <p style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>⚠️ {pendingQuestions.length} preguntas sin responder</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {pendingQuestions.map((q, i) => (
                <button key={i} onClick={() => goToQuestion(ALL_SECTIONS.findIndex(s => s.num === q.sectionNum), q.id!)}
                  style={{ display: 'flex', alignItems: 'baseline', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-main)' }}>
                  <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{q.sectionIcon} Sec. {q.sectionNum}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Section Pills ── */}
      <div ref={scrollRef} style={{ maxWidth: '860px', margin: '0 auto', padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {ALL_SECTIONS.map((s, i) => {
            const done = s.questions.filter(q => q.id && answers[q.id!]).length;
            const tot  = s.questions.filter(q => q.id).length;
            const isActive = i === currentSection;
            const isComplete = tot > 0 && done >= Math.ceil(tot * 0.7);
            return (
              <button key={s.num} onClick={() => goToSection(i)} style={{
                padding: '5px 12px', borderRadius: '99px', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isActive ? 'var(--gold-primary)' : isComplete ? 'rgba(34,197,94,0.4)' : 'var(--border-subtle)'}`,
                background: isActive ? 'rgba(212,175,55,0.12)' : isComplete ? 'rgba(34,197,94,0.07)' : 'transparent',
                color: isActive ? 'var(--gold-primary)' : isComplete ? '#22c55e' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 400
              }}>
                {s.icon} {s.num}. {s.title.split(' ').slice(0, 2).join(' ')}
                {isComplete && ' ✓'}
              </button>
            );
          })}
        </div>

        {/* ── Section Card ── */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '36px', marginBottom: '32px' }}>

          {/* Section header */}
          <div style={{ marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '28px' }}>{section.icon}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', background: 'rgba(212,175,55,0.1)', color: 'var(--gold-primary)', border: '1px solid rgba(212,175,55,0.3)', padding: '2px 10px', borderRadius: '99px', fontWeight: 700 }}>
                    {currentSection + 1} / {ALL_SECTIONS.length}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sectionAnswered}/{sectionTotal} respondidas</span>
                </div>
                <h2 style={{ margin: '4px 0 0', fontSize: '22px', color: 'var(--text-primary)' }}>{section.title}</h2>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', paddingLeft: '38px' }}>{section.subtitle}</p>
          </div>

          {/* Questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {section.questions.map((q, qi) => {
              if (q.subsection) return (
                <div key={qi} style={{ borderLeft: '3px solid var(--gold-primary)', paddingLeft: '12px', marginTop: '8px' }}>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--gold-primary)' }}>{q.subsection}</p>
                </div>
              );
              if (!q.id) return null;
              const val = answers[q.id] ?? '';

              return (
                <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px' }} /> : null}
                    {q.label}
                  </p>
                  {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}

                  {/* TEXT */}
                  {q.type === 'text' && (
                    <textarea
                      value={val}
                      onChange={e => handleAnswer(q.id!, e.target.value)}
                      onBlur={e => upsertInterviewAnswer(id, q.id!, e.target.value)}
                      rows={3}
                      placeholder="Escriba aquí..."
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  )}

                  {/* NUM */}
                  {q.type === 'num' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="number"
                        value={val}
                        onChange={e => handleAnswer(q.id!, e.target.value)}
                        style={{ width: '140px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '14px' }}
                      />
                      {q.unit && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{q.unit}</span>}
                    </div>
                  )}

                  {/* OPTS (single select) */}
                  {q.type === 'opts' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {q.options!.map(opt => (
                        <button key={opt} onClick={() => handleAnswer(q.id!, opt)} style={{
                          padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                          border: `1px solid ${val === opt ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                          background: val === opt ? 'rgba(212,175,55,0.12)' : 'transparent',
                          color: val === opt ? 'var(--gold-primary)' : 'var(--text-secondary)',
                          fontWeight: val === opt ? 700 : 400,
                          transition: 'all 0.15s'
                        }}>{opt}</button>
                      ))}
                    </div>
                  )}

                  {/* MULTIOPT */}
                  {q.type === 'multiopt' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {q.options!.map(opt => {
                        const selected = val.split('||').includes(opt);
                        return (
                          <button key={opt} onClick={() => handleMultiAnswer(q.id!, opt)} style={{
                            padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                            border: `1px solid ${selected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                            background: selected ? 'rgba(212,175,55,0.12)' : 'transparent',
                            color: selected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                            fontWeight: selected ? 700 : 400,
                            transition: 'all 0.15s'
                          }}>{opt}</button>
                        );
                      })}
                    </div>
                  )}

                  {/* SCALE */}
                  {q.type === 'scale' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '6px' }}>
                        <input type="range" min={q.min} max={q.max} value={val || q.min} onChange={e => handleAnswer(q.id!, e.target.value)}
                          style={{ flex: 1, accentColor: 'var(--gold-primary)', cursor: 'pointer' }} />
                        <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gold-primary)', minWidth: '32px', textAlign: 'center' }}>{val || '-'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{q.minLabel}</span><span>{q.maxLabel}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Navigation ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '48px' }}>
          <button onClick={() => goToSection(Math.max(0, currentSection - 1))} disabled={currentSection === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: currentSection === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: currentSection === 0 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-main)', fontSize: '14px', opacity: currentSection === 0 ? 0.4 : 1 }}>
            <ChevronLeft size={18} /> Anterior
          </button>

          {currentSection < ALL_SECTIONS.length - 1 ? (
            <button onClick={() => goToSection(currentSection + 1)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 32px', borderRadius: '8px', border: 'none', background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '14px', fontWeight: 700 }}>
              Siguiente <ChevronRight size={18} />
            </button>
          ) : (
            <button onClick={() => router.push(`/pacientes/${id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 32px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '14px', fontWeight: 700 }}>
              Finalizar entrevista <CheckCircle2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
