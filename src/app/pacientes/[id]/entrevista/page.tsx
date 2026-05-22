'use client';
import { useState, useEffect, use, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, HelpCircle, Trash2 } from 'lucide-react';
import { ALL_SECTIONS, TOTAL_QUESTIONS, HIDDEN_QUESTION_IDS } from '@/lib/questionnaire-data-ext';
import { upsertInterviewAnswer, getInterviewAnswers, deleteInterviewAnswers } from '@/lib/api';
import { getPatientById, Patient } from '@/lib/api';

export default function EntrevistaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showPending, setShowPending] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploadingRetinografia, setIsUploadingRetinografia] = useState(false);

  const [analysisStep, setAnalysisStep] = useState<'idle' | 'suggesting_questions' | 'answering_differential' | 'generating_report' | 'success' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [differentialQuestions, setDifferentialQuestions] = useState<{ id: string; question: string; justification: string; }[]>([]);
  const [differentialAnswers, setDifferentialAnswers] = useState<Record<string, string>>({});

  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const handleResetInterview = async () => {
    try {
      await deleteInterviewAnswers(id);
      setAnswers({});
      setShowResetModal(false);
      setConfirmChecked(false);
      alert('Se ha restablecido la entrevista clínica de forma definitiva. Puede comenzar a responderla nuevamente.');
    } catch (e: any) {
      alert('Error al restablecer la entrevista: ' + e.message);
    }
  };

  const handleFinalizarEntrevista = async () => {
    setAnalysisStep('suggesting_questions');
    setAnalysisError('');
    try {
      const res = await fetch(`/api/pacientes/${id}/interview-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'suggest_questions' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al generar preguntas de diagnóstico diferencial.');
      }
      const questionsList = data.questions || [];
      setDifferentialQuestions(questionsList);

      // Initialize differential answers (retrieve existing from DB if already answered)
      const initialAnswers: Record<string, string> = {};
      questionsList.forEach((q: any) => {
        const key = q.id.replace('diff_q_', 'diff_a_');
        initialAnswers[q.id] = answers[key] || answers[q.id] || '';
      });
      setDifferentialAnswers(initialAnswers);
      setAnalysisStep('answering_differential');
    } catch (err: any) {
      console.error('Suggest questions error:', err);
      setAnalysisError(err.message || 'Error de red al formular preguntas de diagnóstico diferencial.');
      setAnalysisStep('error');
    }
  };

  const handleGenerateFinalReport = async (skipAnswers = false) => {
    setAnalysisStep('generating_report');
    setAnalysisError('');
    try {
      const formattedAnswers: Record<string, string> = {};
      if (!skipAnswers) {
        Object.entries(differentialAnswers).forEach(([qId, ans]) => {
          const key = qId.replace('diff_q_', 'diff_a_');
          formattedAnswers[key] = ans;
        });
      }

      const res = await fetch(`/api/pacientes/${id}/interview-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'generate_report',
          differentialAnswers: formattedAnswers
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al generar el reporte clínico final.');
      }
      setAnalysisResult(data);
      setAnalysisStep('success');
    } catch (err: any) {
      console.error('Final report error:', err);
      setAnalysisError(err.message || 'Error de red al generar el reporte clínico final.');
      setAnalysisStep('error');
    }
  };

  const loadDocuments = useCallback(() => {
    fetch(`/api/pacientes/${id}/documents`, { cache: 'no-store' })
      .then(res => res.json())
      .then(setDocuments)
      .catch(err => console.error("Error loading documents in interview:", err));
  }, [id]);

  useEffect(() => {
    getPatientById(id).then(setPatient);
    getInterviewAnswers(id).then(setAnswers);
    loadDocuments();
  }, [id, loadDocuments]);

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
    s.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id) && !answers[q.id]).map(q => ({ ...q, sectionTitle: s.title, sectionNum: s.num, sectionIcon: s.icon }))
  );

  const section = ALL_SECTIONS[currentSection];
  const answeredCount = ALL_SECTIONS.flatMap(s => s.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id)))
    .filter(q => answers[q.id!] && answers[q.id!] !== '').length;
  const progress = Math.min(100, Math.round((answeredCount / TOTAL_QUESTIONS) * 100));

  const sectionAnswered = section.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id) && answers[q.id!] && answers[q.id!] !== '').length;
  const sectionTotal   = section.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id)).length;

  // ─── Custom Render Overrides ───
  const renderHeredofamiliares = (q: any, val: string) => {
    const parsed = parseHeredofamiliares(val);
    const selectedOptions = parsed.map(p => p.option);

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {q.options!.map((opt: string) => {
            const isSel = selectedOptions.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => {
                let updated = [...parsed];
                if (isSel) {
                  updated = updated.filter(item => item.option !== opt);
                } else {
                  if (opt === 'Ninguno conocido') {
                    updated = [{ option: opt, detail: '' }];
                  } else {
                    updated = updated.filter(item => item.option !== 'Ninguno conocido');
                    updated.push({ option: opt, detail: '' });
                  }
                }
                const newStr = serializeHeredofamiliares(updated);
                handleAnswer(q.id, newStr);
                upsertInterviewAnswer(id, q.id, newStr);
              }} style={{
                padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isSel ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                background: isSel ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: isSel ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: isSel ? 700 : 400,
                transition: 'all 0.15s'
              }}>{opt}</button>
            );
          })}
        </div>
        
        {/* Text inputs */}
        {selectedOptions.filter(o => o !== 'Ninguno conocido').length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 600, color: 'var(--gold-primary)' }}>Especifique qué familiar(es) presenta cada antecedente:</p>
            {q.options!.filter((o: string) => o !== 'Ninguno conocido' && selectedOptions.includes(o)).map((opt: string) => {
              const matchedItem = parsed.find(p => p.option === opt) || { option: opt, detail: '' };
              return (
                <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '160px' }}>{opt}</span>
                  <input
                    type="text"
                    placeholder="Ej: Padre, abuela materna, hermanos..."
                    value={matchedItem.detail}
                    onChange={e => {
                      const updated = parsed.map(p => p.option === opt ? { ...p, detail: e.target.value } : p);
                      if (!parsed.some(p => p.option === opt)) {
                        updated.push({ option: opt, detail: e.target.value });
                      }
                      const newStr = serializeHeredofamiliares(updated);
                      handleAnswer(q.id, newStr);
                    }}
                    onBlur={() => {
                      const cleanItems = parsed.map(p => p.option === opt ? { ...p, detail: matchedItem.detail.trim() } : p);
                      const newStr = serializeHeredofamiliares(cleanItems);
                      upsertInterviewAnswer(id, q.id, newStr);
                    }}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px' }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHospitalizado = (q: any, val: string) => {
    const hospVal = answers['s1q12'] ?? '';
    const hospItems = parseHospitalizaciones(hospVal);

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        {/* No/Sí Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['No', 'Sí'].map(opt => (
            <button key={opt} type="button" onClick={() => {
              handleAnswer('s1q11', opt);
              upsertInterviewAnswer(id, 's1q11', opt);
              if (opt === 'No') {
                handleAnswer('s1q12', 'no aplica');
                upsertInterviewAnswer(id, 's1q12', 'no aplica');
              } else {
                if (!answers['s1q12'] || answers['s1q12'] === 'no aplica' || answers['s1q12'] === 'Ninguna') {
                  const defaultHosp = serializeHospitalizaciones([{ causa: '', fecha: '', duracion: '' }]);
                  handleAnswer('s1q12', defaultHosp);
                  upsertInterviewAnswer(id, 's1q12', defaultHosp);
                }
              }
            }} style={{
              padding: '8px 24px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
              border: `1px solid ${val === opt ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
              background: val === opt ? 'rgba(212,175,55,0.12)' : 'transparent',
              color: val === opt ? 'var(--gold-primary)' : 'var(--text-secondary)',
              fontWeight: val === opt ? 700 : 400,
              transition: 'all 0.15s'
            }}>{opt}</button>
          ))}
        </div>
        
        {/* Sub-form */}
        {val === 'Sí' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--gold-primary)' }}>Detalle de hospitalizaciones previas:</p>
            
            {hospItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Causa / Tipo de hospitalización</label>
                  <input
                    type="text"
                    placeholder="Ej: Neumonía, Apendicitis..."
                    value={item.causa}
                    onChange={e => {
                      const updated = [...hospItems];
                      updated[idx].causa = e.target.value;
                      handleAnswer('s1q12', serializeHospitalizaciones(updated));
                    }}
                    onBlur={() => upsertInterviewAnswer(id, 's1q12', serializeHospitalizaciones(hospItems))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Fecha (Mes y año)</label>
                  <input
                    type="month"
                    value={item.fecha}
                    onChange={e => {
                      const updated = [...hospItems];
                      updated[idx].fecha = e.target.value;
                      handleAnswer('s1q12', serializeHospitalizaciones(updated));
                    }}
                    onBlur={() => upsertInterviewAnswer(id, 's1q12', serializeHospitalizaciones(hospItems))}
                    style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '100px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Duración (días)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Días"
                    value={item.duracion}
                    onChange={e => {
                      const updated = [...hospItems];
                      updated[idx].duracion = e.target.value;
                      handleAnswer('s1q12', serializeHospitalizaciones(updated));
                    }}
                    onBlur={() => upsertInterviewAnswer(id, 's1q12', serializeHospitalizaciones(hospItems))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    const updated = hospItems.filter((_, i) => i !== idx);
                    const newStr = serializeHospitalizaciones(updated);
                    handleAnswer('s1q12', newStr);
                    upsertInterviewAnswer(id, 's1q12', newStr);
                  }}
                  style={{ alignSelf: 'flex-end', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 600, marginTop: '16px' }}
                >
                  Eliminar
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={() => {
                const updated = [...hospItems, { causa: '', fecha: '', duracion: '' }];
                handleAnswer('s1q12', serializeHospitalizaciones(updated));
              }}
              style={{ width: 'fit-content', padding: '6px 14px', borderRadius: '8px', border: '1px dashed var(--gold-primary)', background: 'transparent', color: 'var(--gold-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
            >
              + Agregar hospitalización
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderVaxCovid = (q: any, val: string) => {
    const vaxVal = answers['s6q6_vax_detail'] ?? '';
    const vaxItems = parseVaxCovid(vaxVal);

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        {/* No/Sí/Otros Buttons */}
        {(() => {
          const selectedOpt = val === 'No' ? 'No' : val === 'Sí' ? 'Sí' : (val && val.startsWith('Otros')) ? 'Otros' : '';
          return (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['No', 'Sí', 'Otros'].map(opt => (
                  <button key={opt} type="button" onClick={() => {
                    if (opt === 'No') {
                      handleAnswer('s6q6_vax', 'No');
                      upsertInterviewAnswer(id, 's6q6_vax', 'No');
                      handleAnswer('s6q6_vax_detail', 'Ninguna');
                      upsertInterviewAnswer(id, 's6q6_vax_detail', 'Ninguna');
                    } else if (opt === 'Sí') {
                      handleAnswer('s6q6_vax', 'Sí');
                      upsertInterviewAnswer(id, 's6q6_vax', 'Sí');
                      if (!answers['s6q6_vax_detail'] || answers['s6q6_vax_detail'] === 'Ninguna' || answers['s6q6_vax_detail'] === 'no aplica') {
                        const defaultVax = serializeVaxCovid([{ nombre: '', fecha: '' }]);
                        handleAnswer('s6q6_vax_detail', defaultVax);
                        upsertInterviewAnswer(id, 's6q6_vax_detail', defaultVax);
                      }
                    } else if (opt === 'Otros') {
                      const currentText = val && val.startsWith('Otros:') ? val.slice(6).trim() : '';
                      const newVal = `Otros: ${currentText}`;
                      handleAnswer('s6q6_vax', newVal);
                      upsertInterviewAnswer(id, 's6q6_vax', newVal);
                      handleAnswer('s6q6_vax_detail', 'Ninguna');
                      upsertInterviewAnswer(id, 's6q6_vax_detail', 'Ninguna');
                    }
                  }} style={{
                    padding: '8px 24px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                    border: `1px solid ${selectedOpt === opt ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                    background: selectedOpt === opt ? 'rgba(212,175,55,0.12)' : 'transparent',
                    color: selectedOpt === opt ? 'var(--gold-primary)' : 'var(--text-secondary)',
                    fontWeight: selectedOpt === opt ? 700 : 400,
                    transition: 'all 0.15s'
                  }}>{opt}</button>
                ))}
              </div>

              {selectedOpt === 'Otros' && (
                <div style={{ marginTop: '-8px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Especifique otros detalles o vacunas..."
                    value={val && val.startsWith('Otros:') ? (val.startsWith('Otros: ') ? val.slice(7) : val.slice(6)) : ''}
                    onChange={e => {
                      handleAnswer('s6q6_vax', `Otros: ${e.target.value}`);
                    }}
                    onBlur={e => {
                      upsertInterviewAnswer(id, 's6q6_vax', `Otros: ${e.target.value.trim()}`);
                    }}
                    style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </>
          );
        })()}
        
        {/* Sub-form */}
        {val === 'Sí' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--gold-primary)' }}>Detalle de vacunas COVID-19 recibidas:</p>
            
            {vaxItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Vacuna / Laboratorio</label>
                  <input
                    type="text"
                    placeholder="Ej: Pfizer, BioNTech, Moderna, AstraZeneca..."
                    value={item.nombre}
                    onChange={e => {
                      const updated = [...vaxItems];
                      updated[idx].nombre = e.target.value;
                      handleAnswer('s6q6_vax_detail', serializeVaxCovid(updated));
                    }}
                    onBlur={() => upsertInterviewAnswer(id, 's6q6_vax_detail', serializeVaxCovid(vaxItems))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Fecha de aplicación (Mes y año)</label>
                  <input
                    type="month"
                    value={item.fecha}
                    onChange={e => {
                      const updated = [...vaxItems];
                      updated[idx].fecha = e.target.value;
                      handleAnswer('s6q6_vax_detail', serializeVaxCovid(updated));
                    }}
                    onBlur={() => upsertInterviewAnswer(id, 's6q6_vax_detail', serializeVaxCovid(vaxItems))}
                    style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    const updated = vaxItems.filter((_, i) => i !== idx);
                    const newStr = serializeVaxCovid(updated);
                    handleAnswer('s6q6_vax_detail', newStr);
                    upsertInterviewAnswer(id, 's6q6_vax_detail', newStr);
                  }}
                  style={{ alignSelf: 'flex-end', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  Eliminar
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={() => {
                const updated = [...vaxItems, { nombre: '', fecha: '' }];
                handleAnswer('s6q6_vax_detail', serializeVaxCovid(updated));
              }}
              style={{ width: 'fit-content', padding: '6px 14px', borderRadius: '8px', border: '1px dashed var(--gold-primary)', background: 'transparent', color: 'var(--gold-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
            >
              + Agregar dosis
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderCirugias = (q: any, val: string) => {
    const cirugVal = answers['s1q14'] ?? '';

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        {/* No/Sí Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['No', 'Sí'].map(opt => (
            <button key={opt} type="button" onClick={() => {
              handleAnswer('s1q13', opt);
              upsertInterviewAnswer(id, 's1q13', opt);
              if (opt === 'No') {
                handleAnswer('s1q14', 'Ninguna');
                upsertInterviewAnswer(id, 's1q14', 'Ninguna');
              } else {
                if (!answers['s1q14'] || answers['s1q14'] === 'Ninguna') {
                  handleAnswer('s1q14', '');
                  upsertInterviewAnswer(id, 's1q14', '');
                }
              }
            }} style={{
              padding: '8px 24px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
              border: `1px solid ${val === opt ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
              background: val === opt ? 'rgba(212,175,55,0.12)' : 'transparent',
              color: val === opt ? 'var(--gold-primary)' : 'var(--text-secondary)',
              fontWeight: val === opt ? 700 : 400,
              transition: 'all 0.15s'
            }}>{opt}</button>
          ))}
        </div>
        
        {/* Simple Textarea */}
        {val === 'Sí' && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Especifique detalles de las cirugías (tipo, fecha, etc.):
            </label>
            <textarea
              value={cirugVal === 'Ninguna' ? '' : cirugVal}
              onChange={e => handleAnswer('s1q14', e.target.value)}
              onBlur={e => upsertInterviewAnswer(id, 's1q14', e.target.value)}
              rows={4}
              placeholder="Describa aquí las cirugías previas y sus detalles..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderAlergias = (q: any, val: string) => {
    const alergias = parseAlergias(val);

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '12px' }}>
          {[
            { key: 'medicamentos', label: 'Medicamentos', placeholder: 'Ej: Penicilina, Sulfas, Aspirina...' },
            { key: 'alimentos', label: 'Alimentos', placeholder: 'Ej: Mariscos, Nueces, Lactosa...' },
            { key: 'ambientales', label: 'Ambientales', placeholder: 'Ej: Ácaros, Polen, Pelo de gato...' },
            { key: 'otros', label: 'Otros', placeholder: 'Ej: Látex, Contraste yodado...' }
          ].map(field => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold-primary)', marginBottom: '6px' }}>{field.label}</label>
              <textarea
                value={(alergias as any)[field.key]}
                onChange={e => {
                  const updated = { ...alergias, [field.key]: e.target.value };
                  handleAnswer('s1q15', serializeAlergias(updated));
                }}
                onBlur={() => upsertInterviewAnswer(id, 's1q15', serializeAlergias(alergias))}
                rows={3}
                placeholder={field.placeholder}
                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMedicamentos = (q: any, val: string) => {
    const medItems = parseMedicamentos(val);

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nombre comercial</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sal activa</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Presentación</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '70px' }}>Cant.</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '90px' }}>Unidad</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Frecuencia</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tiempo tomándolo</th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Observaciones</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {medItems.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ej: Tempra"
                      value={item.nombreComercial}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].nombreComercial = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ej: Paracetamol"
                      value={item.salActiva}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].salActiva = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      list="presentations-list"
                      placeholder="Ej: Tabletas, jarabe..."
                      value={item.presentation}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].presentation = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ej: 1, 1/2"
                      value={item.cantidad}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].cantidad = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      list="units-list"
                      placeholder="Ej: mg, tableta..."
                      value={item.unidad}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].unidad = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ej: Cada 8 horas"
                      value={item.frequency}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].frequency = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ej: 3 meses"
                      value={item.tiempo || ''}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].tiempo = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ej: causa sueño"
                      value={item.observaciones || ''}
                      onChange={e => {
                        const updated = [...medItems];
                        updated[idx].observaciones = e.target.value;
                        handleAnswer('s1q16', serializeMedicamentos(updated));
                      }}
                      onBlur={() => upsertInterviewAnswer(id, 's1q16', serializeMedicamentos(medItems))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = medItems.filter((_, i) => i !== idx);
                        const newStr = serializeMedicamentos(updated);
                        handleAnswer('s1q16', newStr);
                        upsertInterviewAnswer(id, 's1q16', newStr);
                      }}
                      style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <datalist id="presentations-list">
            <option value="Tabletas" />
            <option value="Cápsulas" />
            <option value="Sobre" />
            <option value="Granulado" />
            <option value="Jarabe" />
            <option value="Gotas" />
            <option value="Inyección" />
            <option value="Suspensión" />
          </datalist>
          <datalist id="units-list">
            <option value="mg" />
            <option value="g" />
            <option value="ml" />
            <option value="tableta" />
            <option value="cápsula" />
            <option value="sobre" />
            <option value="gotas" />
          </datalist>
          
          <button
            type="button"
            onClick={() => {
              const updated = [...medItems, { nombreComercial: '', salActiva: '', presentation: '', cantidad: '', unidad: '', frequency: '', tiempo: '', observaciones: '' }];
              handleAnswer('s1q16', serializeMedicamentos(updated));
            }}
            style={{ width: 'fit-content', padding: '6px 14px', borderRadius: '8px', border: '1px dashed var(--gold-primary)', background: 'transparent', color: 'var(--gold-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
          >
            + Agregar medicamento
          </button>
        </div>
      </div>
    );
  };

  const renderHipertension = (q: any, val: string) => {
    const isSi = val.startsWith('Sí');
    const rawDetail = isSi && val.includes(':') ? val.split(':').slice(1).join(':') : '';
    const detail = rawDetail.startsWith(' ') ? rawDetail.slice(1) : rawDetail;

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {['No', 'Sí'].map(opt => {
            const isSelected = opt === 'No' ? val === 'No' : isSi;
            return (
              <button key={opt} type="button" onClick={() => {
                if (opt === 'No') {
                  handleAnswer(q.id!, 'No');
                  upsertInterviewAnswer(id, q.id!, 'No');
                } else {
                  handleAnswer(q.id!, 'Sí:');
                  upsertInterviewAnswer(id, q.id!, 'Sí:');
                }
              }} style={{
                padding: '8px 24px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: isSelected ? 700 : 400,
                transition: 'all 0.15s'
              }}>{opt}</button>
            );
          })}
        </div>

        {isSi && (
          <div style={{ marginTop: '8px' }}>
            <input
              type="text"
              placeholder="Especifique detalles (ej: controlada con losartán, no controlada...)"
              value={detail}
              onChange={e => {
                handleAnswer(q.id!, `Sí: ${e.target.value}`);
              }}
              onBlur={e => {
                upsertInterviewAnswer(id, q.id!, `Sí: ${e.target.value.trim()}`);
              }}
              style={{ width: '100%', maxWidth: '500px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderUltimaPresion = (q: any, val: string) => {
    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            placeholder="Escriba la presión exacta (ej: 120/80) o elija una sugerencia..."
            value={val}
            onChange={e => {
              handleAnswer(q.id!, e.target.value);
            }}
            onBlur={e => {
              upsertInterviewAnswer(id, q.id!, e.target.value.trim());
            }}
            style={{ width: '100%', maxWidth: '500px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '14px', boxSizing: 'border-box' }}
          />
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Sugerencias:</span>
            {q.options!.map((opt: any) => {
              const isSelected = val === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    handleAnswer(q.id!, opt);
                    upsertInterviewAnswer(id, q.id!, opt);
                  }}
                  style={{
                    padding: '6px 12px', borderRadius: '99px', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                    border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                    background: isSelected ? 'rgba(212,175,55,0.12)' : 'transparent',
                    color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s'
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderVitaminaD = (q: any, val: string) => {
    const hasColon = val.includes(':');
    const selectedOpt = hasColon ? val.split(':').slice(0, 1)[0].trim() : val;
    const rawMeasurement = hasColon ? val.split(':').slice(1).join(':') : '';
    const measurementVal = rawMeasurement.startsWith(' ') ? rawMeasurement.slice(1) : rawMeasurement;

    const isSiSelected = selectedOpt.startsWith('Sí');

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          {q.options!.map((opt: any) => {
            const isSelected = selectedOpt === opt;
            return (
              <button key={opt} type="button" onClick={() => {
                if (opt === 'No') {
                  handleAnswer(q.id!, 'No');
                  upsertInterviewAnswer(id, q.id!, 'No');
                } else {
                  const newValue = measurementVal ? `${opt}: ${measurementVal}` : opt;
                  handleAnswer(q.id!, newValue);
                  upsertInterviewAnswer(id, q.id!, newValue);
                }
              }} style={{
                padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: isSelected ? 700 : 400,
                transition: 'all 0.15s'
              }}>{opt}</button>
            );
          })}
        </div>

        {isSiSelected && (
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Valor de la última toma (ej: 25 ng/mL):
            </label>
            <input
              type="text"
              placeholder="Escriba el valor de su última toma..."
              value={measurementVal}
              onChange={e => {
                const updatedVal = `${selectedOpt}: ${e.target.value}`;
                handleAnswer(q.id!, updatedVal);
              }}
              onBlur={e => {
                const updatedVal = `${selectedOpt}: ${e.target.value.trim()}`;
                upsertInterviewAnswer(id, q.id!, updatedVal);
              }}
              style={{ width: '100%', maxWidth: '300px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderSleepProblems = (q: any, val: string) => {
    const { selectedOpts, snoringIntensity, otrosDetail, comentarios } = parseSleepProblems(val);

    const handleToggle = (opt: string) => {
      let nextOpts = [...selectedOpts];
      if (selectedOpts.includes(opt)) {
        nextOpts = nextOpts.filter(o => o !== opt);
      } else {
        if (opt === 'Ninguno') {
          nextOpts = ['Ninguno'];
        } else {
          nextOpts = nextOpts.filter(o => o !== 'Ninguno');
          nextOpts.push(opt);
        }
      }
      const newVal = serializeSleepProblems(nextOpts, snoringIntensity, otrosDetail, comentarios);
      handleAnswer('s2q11', newVal);
      upsertInterviewAnswer(id, 's2q11', newVal);
    };

    const handleSnoringIntensity = (intensity: string) => {
      const newVal = serializeSleepProblems(selectedOpts, intensity, otrosDetail, comentarios);
      handleAnswer('s2q11', newVal);
      upsertInterviewAnswer(id, 's2q11', newVal);
    };

    const handleOtrosDetailChange = (detail: string) => {
      const newVal = serializeSleepProblems(selectedOpts, snoringIntensity, detail, comentarios);
      handleAnswer('s2q11', newVal);
    };

    const handleOtrosDetailBlur = (detail: string) => {
      const newVal = serializeSleepProblems(selectedOpts, snoringIntensity, detail.trim(), comentarios);
      upsertInterviewAnswer(id, 's2q11', newVal);
    };

    const handleComentariosChange = (text: string) => {
      const newVal = serializeSleepProblems(selectedOpts, snoringIntensity, otrosDetail, text);
      handleAnswer('s2q11', newVal);
    };

    const handleComentariosBlur = (text: string) => {
      const newVal = serializeSleepProblems(selectedOpts, snoringIntensity, otrosDetail, text.trim());
      upsertInterviewAnswer(id, 's2q11', newVal);
    };

    const hasSelection = selectedOpts.length > 0 && !selectedOpts.includes('Ninguno');

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {q.options!.map((opt: string) => {
            const isSel = selectedOpts.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => handleToggle(opt)} style={{
                padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isSel ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                background: isSel ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: isSel ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: isSel ? 700 : 400,
                transition: 'all 0.15s'
              }}>{opt}</button>
            );
          })}
        </div>

        {/* Sub-options for Snoring */}
        {selectedOpts.includes('Ronquidos') && (
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-subtle)', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold-primary)' }}>Intensidad de ronquidos:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Suave', 'Moderado', 'Intenso', 'Me divorcio mañana'].map(intensity => {
                const isSel = snoringIntensity === intensity;
                return (
                  <button key={intensity} type="button" onClick={() => handleSnoringIntensity(intensity)} style={{
                    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                    border: `1px solid ${isSel ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                    background: isSel ? 'rgba(212,175,55,0.12)' : 'transparent',
                    color: isSel ? 'var(--gold-primary)' : 'var(--text-secondary)',
                    fontWeight: isSel ? 600 : 400,
                    transition: 'all 0.15s'
                  }}>{intensity}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input for Otros Sleep Problems */}
        {selectedOpts.includes('Otros') && (
          <div style={{ marginTop: '8px' }}>
            <input
              type="text"
              placeholder="Especifique otros problemas de sueño..."
              value={otrosDetail}
              onChange={e => handleOtrosDetailChange(e.target.value)}
              onBlur={e => handleOtrosDetailBlur(e.target.value)}
              style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px' }}
            />
          </div>
        )}

        {/* Observations box if ANY option (except Ninguno) is selected */}
        {hasSelection && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--gold-primary)', marginBottom: '6px' }}>Observaciones / Comentarios adicionales sobre el sueño:</label>
            <textarea
              placeholder="Describa síntomas detallados, frecuencia, impacto en el día a día..."
              value={comentarios}
              onChange={e => handleComentariosChange(e.target.value)}
              onBlur={e => handleComentariosBlur(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderDietPattern = (q: any, val: string) => {
    const { selectedOpts, otrosDetail, comentarios } = parseDietPattern(val);

    const handleToggle = (opt: string) => {
      let nextOpts = [...selectedOpts];
      if (selectedOpts.includes(opt)) {
        nextOpts = nextOpts.filter(o => o !== opt);
      } else {
        if (opt === 'Sin patrón definido') {
          nextOpts = ['Sin patrón definido'];
        } else {
          nextOpts = nextOpts.filter(o => o !== 'Sin patrón definido');
          nextOpts.push(opt);
        }
      }
      const newVal = serializeDietPattern(nextOpts, otrosDetail, comentarios);
      handleAnswer('s2q12', newVal);
      upsertInterviewAnswer(id, 's2q12', newVal);
    };

    const handleOtrosDetailChange = (detail: string) => {
      const newVal = serializeDietPattern(selectedOpts, detail, comentarios);
      handleAnswer('s2q12', newVal);
    };

    const handleOtrosDetailBlur = (detail: string) => {
      const newVal = serializeDietPattern(selectedOpts, detail.trim(), comentarios);
      upsertInterviewAnswer(id, 's2q12', newVal);
    };

    const handleComentariosChange = (text: string) => {
      const newVal = serializeDietPattern(selectedOpts, otrosDetail, text);
      handleAnswer('s2q12', newVal);
    };

    const handleComentariosBlur = (text: string) => {
      const newVal = serializeDietPattern(selectedOpts, otrosDetail, text.trim());
      upsertInterviewAnswer(id, 's2q12', newVal);
    };

    const isOtrosSelected = selectedOpts.includes('Otros');
    const hasSelection = selectedOpts.length > 0;

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}
        
        {/* Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {q.options!.map((opt: string) => {
            const isSel = selectedOpts.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => handleToggle(opt)} style={{
                padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isSel ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                background: isSel ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: isSel ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: isSel ? 700 : 400,
                transition: 'all 0.15s'
              }}>{opt}</button>
            );
          })}
        </div>

        {/* Input for Otros Diet Pattern */}
        {isOtrosSelected && (
          <div style={{ marginTop: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="Especifique otro patrón alimentario..."
              value={otrosDetail}
              onChange={e => handleOtrosDetailChange(e.target.value)}
              onBlur={e => handleOtrosDetailBlur(e.target.value)}
              style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px' }}
            />
          </div>
        )}

        {/* General comments box if any option is selected */}
        {hasSelection && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--gold-primary)', marginBottom: '6px' }}>Observaciones / Comentarios sobre hábitos alimentarios:</label>
            <textarea
              placeholder="Describa particularidades, intolerancias leves, preferencias, etc..."
              value={comentarios}
              onChange={e => handleComentariosChange(e.target.value)}
              onBlur={e => handleComentariosBlur(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderVisualDiagnostic = (q: any, val: string) => {
    const { odOpts, odOtros, oiOpts, oiOtros } = parseVisualDiagnostic(val);
    const conditions = [
      'Visión normal',
      'Miopía',
      'Hipermetropía',
      'Astigmatismo',
      'Presbicia',
      'Glaucoma',
      'Catarata',
      'Degeneración Macular (DMAE)',
      'Retinopatía Diabética',
      'Ojo Seco',
      'Queratocono',
      'Estrabismo',
      'Pterigión',
      'Desprendimiento de Retina',
      'Otros'
    ];

    const toggleEyeOpt = (eye: 'OD' | 'OI', opt: string) => {
      let currentOpts = eye === 'OD' ? [...odOpts] : [...oiOpts];
      let currentOtros = eye === 'OD' ? odOtros : oiOtros;
      
      if (opt === 'Visión normal') {
        if (currentOpts.includes('Visión normal')) {
          currentOpts = [];
        } else {
          currentOpts = ['Visión normal'];
          currentOtros = '';
        }
      } else {
        currentOpts = currentOpts.filter(o => o !== 'Visión normal');
        if (currentOpts.includes(opt)) {
          currentOpts = currentOpts.filter(o => o !== opt);
          if (opt === 'Otros') {
            currentOtros = '';
          }
        } else {
          currentOpts.push(opt);
        }
      }
      
      const newOd = eye === 'OD' ? currentOpts : odOpts;
      const newOi = eye === 'OI' ? currentOpts : oiOpts;
      const newOdOtros = eye === 'OD' ? currentOtros : odOtros;
      const newOiOtros = eye === 'OI' ? currentOtros : oiOtros;
      
      const newValue = serializeVisualDiagnostic(newOd, newOdOtros, newOi, newOiOtros);
      handleAnswer(q.id!, newValue);
      upsertInterviewAnswer(id, q.id!, newValue);
    };

    const handleOtrosText = (eye: 'OD' | 'OI', text: string) => {
      const newOdOtros = eye === 'OD' ? text : odOtros;
      const newOiOtros = eye === 'OI' ? text : oiOtros;
      const newValue = serializeVisualDiagnostic(odOpts, newOdOtros, oiOpts, newOiOtros);
      handleAnswer(q.id!, newValue);
    };

    const saveOtrosText = (eye: 'OD' | 'OI', text: string) => {
      const newOdOtros = eye === 'OD' ? text : odOtros;
      const newOiOtros = eye === 'OI' ? text : oiOtros;
      const newValue = serializeVisualDiagnostic(odOpts, newOdOtros, oiOpts, newOiOtros);
      upsertInterviewAnswer(id, q.id!, newValue);
    };

    const isDone = odOpts.length > 0 || oiOpts.length > 0;

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {isDone ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Ojo Derecho */}
          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              👁️ Ojo Derecho (OD)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {conditions.map(opt => {
                const isSelected = odOpts.includes(opt);
                return (
                  <div key={opt}>
                    <button type="button" onClick={() => toggleEyeOpt('OD', opt)} style={{
                      width: '100%', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-main)', textAlign: 'left',
                      border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
                      color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                      transition: 'all 0.15s'
                    }}>
                      {isSelected ? '✓ ' : ''}{opt}
                    </button>
                    {opt === 'Otros' && isSelected && (
                      <input
                        type="text"
                        placeholder="Especifique patología OD..."
                        value={odOtros}
                        onChange={e => handleOtrosText('OD', e.target.value)}
                        onBlur={e => saveOtrosText('OD', e.target.value.trim())}
                        style={{ width: '100%', marginTop: '4px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '11px', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ojo Izquierdo */}
          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              👁️ Ojo Izquierdo (OI)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {conditions.map(opt => {
                const isSelected = oiOpts.includes(opt);
                return (
                  <div key={opt}>
                    <button type="button" onClick={() => toggleEyeOpt('OI', opt)} style={{
                      width: '100%', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-main)', textAlign: 'left',
                      border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
                      color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                      transition: 'all 0.15s'
                    }}>
                      {isSelected ? '✓ ' : ''}{opt}
                    </button>
                    {opt === 'Otros' && isSelected && (
                      <input
                        type="text"
                        placeholder="Especifique patología OI..."
                        value={oiOtros}
                        onChange={e => handleOtrosText('OI', e.target.value)}
                        onBlur={e => saveOtrosText('OI', e.target.value.trim())}
                        style={{ width: '100%', marginTop: '4px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '11px', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRetinografia = (q: any, val: string) => {
    const isSi = val.startsWith('Sí');
    const findingsVal = answers['s9q7'] ?? '';
    const retinografiaDocs = documents.filter(d => d.file_type === 'retinografia');

    const handleUploadRetinografia = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      
      setIsUploadingRetinografia(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', 'retinografia');
      formData.append('notes', 'Subido desde cuestionario de salud visual');
      
      try {
        const res = await fetch(`/api/pacientes/${id}/documents`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          loadDocuments();
        } else {
          alert('Error al subir la retinografía');
        }
      } catch (err) {
        console.error(err);
        alert('Error de red al subir la retinografía');
      } finally {
        setIsUploadingRetinografia(false);
      }
    };

    const handleDeleteRetinografia = async (docId: string) => {
      if (!confirm('¿Eliminar esta retinografía?')) return;
      try {
        const res = await fetch(`/api/pacientes/${id}/documents?docId=${docId}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          loadDocuments();
        } else {
          alert('Error al eliminar');
        }
      } catch (err) {
        console.error(err);
        alert('Error de red');
      }
    };

    return (
      <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: '120px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
        <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {val ? <CheckCircle2 size={14} color="#22c55e" style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> : null}
          {q.label}
        </p>
        {q.hint && <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{q.hint}</p>}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {q.options.map((opt: string) => {
            const isSelected = val === opt;
            return (
              <button key={opt} type="button" onClick={() => {
                handleAnswer(q.id!, opt);
                upsertInterviewAnswer(id, q.id!, opt);
              }} style={{
                padding: '8px 16px', borderRadius: '99px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
                color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: isSelected ? 700 : 400,
                transition: 'all 0.15s'
              }}>{opt}</button>
            );
          })}
        </div>

        {isSi && (
          <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gold-primary)' }}>📂 DOCUMENTOS DE RETINOGRAFÍA</p>
            
            {retinografiaDocs.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                {retinografiaDocs.map((doc: any) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.file_name}>👁️ {doc.file_name}</p>
                      <p style={{ margin: 0, fontSize: '9px', color: 'var(--text-muted)' }}>{new Date(doc.uploaded_at).toLocaleDateString()} · {(doc.file_size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
                      <a href={doc.public_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--gold-primary)', fontWeight: 600, textDecoration: 'none', background: 'rgba(212,175,55,0.1)', padding: '4px 8px', borderRadius: '4px' }}>Ver</a>
                      <button type="button" onClick={() => handleDeleteRetinografia(doc.id)} style={{ fontSize: '11px', color: '#f87171', border: 'none', background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No se han subido retinografías para este paciente.</p>
            )}

            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: isUploadingRetinografia ? 'not-allowed' : 'pointer', background: 'rgba(255,255,255,0.04)', padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleUploadRetinografia} disabled={isUploadingRetinografia} />
                {isUploadingRetinografia ? 'Subiendo...' : '＋ Subir Retinografía'}
              </label>
            </div>

            <div style={{ marginTop: '16px', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Hallazgos en retinografía o notas visuales adicionales (s9q7):
              </label>
              <textarea
                placeholder="Escriba hallazgos detallados..."
                value={findingsVal}
                onChange={e => handleAnswer('s9q7', e.target.value)}
                onBlur={e => upsertInterviewAnswer(id, 's9q7', e.target.value.trim())}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };


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
              <button
                onClick={() => setShowResetModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  borderRadius: '99px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-main)',
                  transition: 'all 0.2s'
                }}
              >
                <Trash2 size={12} />
                Restablecer Entrevista
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
            const done = s.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id) && answers[q.id!] && answers[q.id!] !== '').length;
            const tot  = s.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id)).length;
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

              // Route overridden questions
              if (q.id === 's1q8') return renderHeredofamiliares(q, val);
              if (q.id === 's1q9') return null; // Cancer details is now redundant with the "Otros" detail input of s1q8
              if (q.id === 's1q11') return renderHospitalizado(q, val);
              if (q.id === 's1q12') return null; // Rendered inline in s1q11
              if (q.id === 's1q13') return renderCirugias(q, val);
              if (q.id === 's1q14') return null; // Rendered inline in s1q13
              if (q.id === 's1q15') return renderAlergias(q, val);
              if (q.id === 's1q16') return renderMedicamentos(q, val);
              if (q.id === 's2q11') return renderSleepProblems(q, val);
              if (q.id === 's2q12') return renderDietPattern(q, val);
              if (q.id === 's3q1') return renderHipertension(q, val);
              if (q.id === 's3q2') return renderUltimaPresion(q, val);
              if (q.id === 's4q11') return renderVitaminaD(q, val);
              if (q.id === 's6q6_vax') return renderVaxCovid(q, val);
              if (q.id === 's6q6_vax_detail') return null; // Rendered inline in s6q6_vax
              if (q.id === 's9q1') return renderVisualDiagnostic(q, val);
              if (q.id === 's9q6') return renderRetinografia(q, val);
              if (q.id === 's9q7') return null; // Rendered inline in s9q6

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
                  {q.type === 'opts' && (() => {
                    const selectedOpt = q.options!.find(opt => {
                      if (isOtrosOption(opt)) {
                        const optPrefix = opt.split(':')[0].trim();
                        return val === opt || val.startsWith(`${optPrefix}:`);
                      }
                      return val === opt;
                    });
                    
                    const otrosOpt = q.options!.find(opt => isOtrosOption(opt));
                    const isOtrosSelected = otrosOpt && selectedOpt && isOtrosOption(selectedOpt);
                    const rawOtros = isOtrosSelected && val.includes(':') ? val.split(':').slice(1).join(':') : '';
                    const otrosText = rawOtros.startsWith(' ') ? rawOtros.slice(1) : rawOtros;

                    return (
                      <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {q.options!.map(opt => {
                            const isSelected = selectedOpt === opt;
                            return (
                              <button key={opt} type="button" onClick={() => {
                                if (isOtrosOption(opt)) {
                                  handleAnswer(q.id!, `${opt.split(':')[0].trim()}:`);
                                } else {
                                  handleAnswer(q.id!, opt);
                                  upsertInterviewAnswer(id, q.id!, opt);
                                }
                              }} style={{
                                padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                                border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                                background: isSelected ? 'rgba(212,175,55,0.12)' : 'transparent',
                                color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                                fontWeight: isSelected ? 700 : 400,
                                transition: 'all 0.15s'
                              }}>{opt}</button>
                            );
                          })}
                        </div>
                        {isOtrosSelected && (
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              placeholder={`Especifique ${otrosOpt.toLowerCase()}...`}
                              value={otrosText}
                              onChange={e => {
                                const optPrefix = otrosOpt!.split(':')[0].trim();
                                handleAnswer(q.id!, `${optPrefix}: ${e.target.value}`);
                              }}
                              onBlur={e => {
                                const optPrefix = otrosOpt!.split(':')[0].trim();
                                upsertInterviewAnswer(id, q.id!, `${optPrefix}: ${e.target.value.trim()}`);
                              }}
                              style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* MULTIOPT */}
                  {q.type === 'multiopt' && (() => {
                    const currentParts = val ? val.split('||') : [];
                    const selectedOpts = currentParts.map(part => {
                      const colonIdx = part.indexOf(':');
                      return colonIdx !== -1 ? part.slice(0, colonIdx).trim() : part.trim();
                    });
                    
                    const detailsMap = currentParts.reduce((acc, part) => {
                       const colonIdx = part.indexOf(':');
                       if (colonIdx !== -1) {
                         const optName = part.slice(0, colonIdx).trim();
                         const rawDetail = part.slice(colonIdx + 1);
                         const detail = rawDetail.startsWith(' ') ? rawDetail.slice(1) : rawDetail;
                         acc[optName] = detail;
                       }
                       return acc;
                     }, {} as Record<string, string>);

                    const otrosOpt = q.options!.find(opt => isOtrosOption(opt));
                    const isOtrosSelected = otrosOpt && selectedOpts.includes(otrosOpt.split(':')[0].trim());
                    const otrosText = isOtrosSelected ? (detailsMap[otrosOpt!.split(':')[0].trim()] || '') : '';

                    return (
                      <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {q.options!.map(opt => {
                            const optName = opt.split(':')[0].trim();
                            const isSelected = selectedOpts.includes(optName);
                            return (
                              <button key={opt} type="button" onClick={() => {
                                let nextParts: string[] = [];
                                if (isSelected) {
                                  nextParts = currentParts.filter(part => {
                                    const name = part.indexOf(':') !== -1 ? part.split(':')[0].trim() : part.trim();
                                    return name !== optName;
                                  });
                                } else {
                                  const isNegation = optName.toLowerCase() === 'ninguno' || 
                                                     optName.toLowerCase() === 'ninguna' || 
                                                     optName.toLowerCase() === 'no' || 
                                                     optName.toLowerCase().startsWith('ningun') || 
                                                     optName.toLowerCase().startsWith('no aplica');
                                  
                                  if (isNegation) {
                                    nextParts = [opt];
                                  } else {
                                    nextParts = currentParts.filter(part => {
                                      const name = part.indexOf(':') !== -1 ? part.split(':')[0].trim() : part.trim();
                                      return name.toLowerCase() !== 'ninguno' && 
                                             name.toLowerCase() !== 'ninguna' && 
                                             name.toLowerCase() !== 'no' && 
                                             !name.toLowerCase().startsWith('ningun') && 
                                             !name.toLowerCase().startsWith('no aplica');
                                    });
                                    if (isOtrosOption(opt)) {
                                      nextParts.push(`${optName}:`);
                                    } else {
                                      nextParts.push(opt);
                                    }
                                  }
                                }
                                const newVal = nextParts.join('||');
                                handleAnswer(q.id!, newVal);
                                upsertInterviewAnswer(id, q.id!, newVal);
                              }} style={{
                                padding: '8px 16px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-main)',
                                border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                                background: isSelected ? 'rgba(212,175,55,0.12)' : 'transparent',
                                color: isSelected ? 'var(--gold-primary)' : 'var(--text-secondary)',
                                fontWeight: isSelected ? 700 : 400,
                                transition: 'all 0.15s'
                              }}>{opt}</button>
                            );
                          })}
                        </div>
                        {isOtrosSelected && (
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              placeholder={`Especifique ${otrosOpt.toLowerCase()}...`}
                              value={otrosText}
                              onChange={e => {
                                const optName = otrosOpt!.split(':')[0].trim();
                                const nextParts = currentParts.map(part => {
                                  const name = part.indexOf(':') !== -1 ? part.split(':')[0].trim() : part.trim();
                                  if (name === optName) {
                                    return `${optName}: ${e.target.value}`;
                                  }
                                  return part;
                                });
                                handleAnswer(q.id!, nextParts.join('||'));
                              }}
                              onBlur={e => {
                                const optName = otrosOpt!.split(':')[0].trim();
                                const nextParts = currentParts.map(part => {
                                  const name = part.indexOf(':') !== -1 ? part.split(':')[0].trim() : part.trim();
                                  if (name === optName) {
                                    return `${optName}: ${e.target.value.trim()}`;
                                  }
                                  return part;
                                });
                                upsertInterviewAnswer(id, q.id!, nextParts.join('||'));
                              }}
                              style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}

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

          {/* ── Doctor Notes per Section ── */}
          {(() => {
            const notesKey = `notes_s${section.num}`;
            const notesVal = answers[notesKey] ?? '';
            return (
              <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '16px' }}>📋</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--gold-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Observaciones Clínicas del Médico</p>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>Hallazgos, impresiones o notas adicionales sobre este sistema</p>
                  </div>
                  {notesVal && <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontWeight: 700 }}>✓ Guardado</span>}
                </div>
                <textarea
                  value={notesVal}
                  onChange={e => handleAnswer(notesKey, e.target.value)}
                  onBlur={e => upsertInterviewAnswer(id, notesKey, e.target.value)}
                  rows={4}
                  placeholder={`Anota aquí tus observaciones clínicas sobre ${section.title}...\nEjemplo: paciente refiere síntomas atípicos, hallazgos al examen físico, sospecha diagnóstica, etc.`}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: `1px solid ${notesVal ? 'rgba(212,175,55,0.4)' : 'var(--border-subtle)'}`,
                    background: notesVal ? 'rgba(212,175,55,0.04)' : 'var(--bg-main)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-main)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, background 0.2s',
                    outline: 'none',
                  }}
                />
              </div>
            );
          })()}
        </div>{/* end section card */}

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
            <button onClick={handleFinalizarEntrevista}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 32px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '14px', fontWeight: 700 }}>
              Finalizar entrevista <CheckCircle2 size={18} />
            </button>
          )}
        </div>

        {/* ─── MODAL DE ANÁLISIS DE ENTREVISTA ─── */}
        {analysisStep !== 'idle' && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }}>
            <div style={{
              background: 'rgba(20, 20, 20, 0.95)', border: '1px solid var(--border-subtle)',
              borderRadius: '16px', padding: '32px', maxWidth: analysisStep === 'answering_differential' ? '850px' : '650px', width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
              gap: '20px', color: 'var(--text-primary)', fontFamily: 'var(--font-main)',
              transition: 'max-width 0.3s ease'
            }}>
              {analysisStep === 'suggesting_questions' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    width: '50px', height: '50px', borderRadius: '50%',
                    border: '3px solid rgba(212, 175, 55, 0.2)', borderTopColor: 'var(--gold-primary)',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <style>{`
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}</style>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--gold-primary)' }}>Analizando Respuestas Clínicas</h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '450px' }}>
                    La inteligencia artificial está analizando todas las respuestas del paciente para formular preguntas críticas de diagnóstico diferencial...
                  </p>
                </div>
              )}

              {analysisStep === 'answering_differential' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--gold-primary)' }}>
                    <HelpCircle size={24} />
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Preguntas Clínicas de Refinamiento Diagnóstico</h3>
                  </div>
                  
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Con base en las respuestas del paciente, la inteligencia artificial considera indispensables las siguientes preguntas adicionales para delimitar las sospechas diagnósticas y ofrecer la mejor atención médica posible.
                  </p>

                  <div style={{
                    maxHeight: '50vh', overflowY: 'auto', paddingRight: '8px',
                    display: 'flex', flexDirection: 'column', gap: '16px', margin: '10px 0'
                  }}>
                    {differentialQuestions.map((q, idx) => (
                      <div key={q.id} style={{
                        background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)',
                        borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px'
                      }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {idx + 1}. {q.question}
                        </div>
                        
                        <div style={{
                          padding: '8px 12px', borderRadius: '6px',
                          background: 'rgba(212, 175, 55, 0.06)', border: '1px solid rgba(212, 175, 55, 0.15)',
                          fontSize: '12px', color: 'var(--gold-primary)', fontStyle: 'italic', lineHeight: '1.5'
                        }}>
                          <strong>Justificación médica:</strong> {q.justification}
                        </div>

                        <textarea
                          rows={2}
                          value={differentialAnswers[q.id] || ''}
                          onChange={e => setDifferentialAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Escribe la respuesta del paciente o hallazgos relevantes..."
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: '8px',
                            background: 'var(--bg-main)', border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '13px',
                            resize: 'vertical', outline: 'none', transition: 'border-color 0.2s',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '12px' }}>
                    <button type="button" onClick={() => setAnalysisStep('idle')} style={{
                      padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                      background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600
                    }}>
                      Volver a la Entrevista
                    </button>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button type="button" onClick={() => handleGenerateFinalReport(true)} style={{
                        padding: '10px 18px', borderRadius: '8px', border: '1px solid rgba(212,175,55,0.3)',
                        background: 'rgba(212,175,55,0.05)', color: 'var(--gold-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600
                      }}>
                        Omitir y Generar Reporte Directo
                      </button>

                      <button type="button" onClick={() => handleGenerateFinalReport(false)} style={{
                        padding: '10px 24px', borderRadius: '8px', border: 'none',
                        background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: '8px'
                      }}>
                        Generar Reporte Final
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {analysisStep === 'generating_report' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    width: '50px', height: '50px', borderRadius: '50%',
                    border: '3px solid rgba(34, 197, 94, 0.2)', borderTopColor: '#22c55e',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#22c55e' }}>Generando Reporte Final</h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '450px' }}>
                    Compilando el reporte clínico definitivo de diagnóstico diferencial e integrándolo en el expediente del paciente...
                  </p>
                </div>
              )}

              {analysisStep === 'error' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#ef4444' }}>
                    <AlertCircle size={24} />
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Error al procesar</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Ocurrió un inconveniente al realizar la operación:
                  </p>
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    padding: '12px 16px', borderRadius: '8px', fontSize: '13px', color: '#ef4444',
                    fontFamily: 'monospace', whiteSpace: 'pre-wrap'
                  }}>
                    {analysisError}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button type="button" onClick={() => {
                      router.push(`/pacientes/${id}`);
                    }} style={{
                      padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                      background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px'
                    }}>
                      Ir al Perfil del Paciente
                    </button>
                    <button type="button" onClick={() => {
                      if (differentialQuestions.length > 0) {
                        handleGenerateFinalReport(false);
                      } else {
                        handleFinalizarEntrevista();
                      }
                    }} style={{
                      padding: '10px 20px', borderRadius: '8px', border: 'none',
                      background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 700
                    }}>
                      Reintentar
                    </button>
                  </div>
                </div>
              )}

              {analysisStep === 'success' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#22c55e' }}>
                    <CheckCircle2 size={24} />
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#22c55e' }}>¡Reporte Clínico Completado!</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Se ha consolidado el análisis definitivo de la entrevista y se guardó automáticamente en el expediente del paciente bajo la pestaña **Documentos**.
                  </p>
                  
                  {analysisResult?.analysis && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold-primary)' }}>EXTRACTO DEL REPORTE GENERADO:</span>
                      <div style={{
                        maxHeight: '200px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px',
                        fontSize: '13px', lineHeight: '1.6', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '10px'
                      }}>
                        {analysisResult.analysis.split('\n')
                          .filter((line: string) => {
                            const trimmed = line.trim();
                            return trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed);
                          })
                          .slice(0, 15)
                          .map((line: string, idx: number) => (
                            <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                              <span style={{ color: 'var(--gold-primary)' }}>•</span>
                              <span>{line.replace(/^[-*\d.\s#]+/, '')}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => {
                      localStorage.setItem(`pdi_tab_${id}`, 'documentos');
                      router.push(`/pacientes/${id}`);
                    }} style={{
                      padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                      background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600
                    }}>
                      Ir a Documentos del Paciente
                    </button>
                    {analysisResult?.document?.public_url && (
                      <a href={analysisResult.document.public_url} target="_blank" rel="noopener noreferrer" style={{
                        padding: '10px 20px', borderRadius: '8px', border: 'none', textDecoration: 'none',
                        background: 'var(--gold-primary)', color: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center'
                      }}>
                        Ver Reporte Completo (.md)
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '32px', width: '480px', maxWidth: '90vw', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--font-main)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
              ⚠️ Restablecer Entrevista Clínica
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Esta acción eliminará de forma permanente todas las respuestas registradas en esta entrevista clínica para este paciente. <strong>El Reporte Maestro y los estudios de laboratorio no se verán afectados.</strong> Esta acción no se puede deshacer.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '24px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={e => setConfirmChecked(e.target.checked)}
                style={{ marginTop: '3px', cursor: 'pointer' }}
              />
              <span>Confirmo que deseo borrar toda la información actual de la entrevista clínica y comenzar de cero.</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px' }}>
              <button
                onClick={handleResetInterview}
                disabled={!confirmChecked}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: confirmChecked ? '#ef4444' : 'var(--border-subtle)',
                  color: confirmChecked ? '#fff' : 'var(--text-muted)',
                  cursor: confirmChecked ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-main)',
                  transition: 'background 0.2s'
                }}
              >
                Restablecer Definitivamente
              </button>
              <button
                onClick={() => { setShowResetModal(false); setConfirmChecked(false); }}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-main)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Antecedentes Heredofamiliares ─────────────────────────────────────────────
interface HeredoItem {
  option: string;
  detail: string;
}

function parseHeredofamiliares(val: string): HeredoItem[] {
  if (!val) return [];
  const HEREDO_OPTIONS = [
    'Diabetes tipo 2',
    'Hipertensión arterial',
    'Infarto al miocardio',
    'EVC / derrame cerebral',
    'Cáncer (cualquier tipo)',
    'Obesidad',
    'Dislipidemias',
    'Enfermedad renal',
    'Alzheimer / demencia',
    'Depresión / trastornos mentales',
    'Osteoporosis',
    'Enfermedad tiroidea',
    'Ninguno conocido'
  ];

  return val.split('||').map(item => {
    // Sort options by length descending to match the longest (most specific) first
    const sortedOptions = [...HEREDO_OPTIONS].sort((a, b) => b.length - a.length);
    for (const opt of sortedOptions) {
      if (item.startsWith(opt)) {
        let detail = '';
        const remaining = item.slice(opt.length).trim();
        if (remaining.startsWith('(') && remaining.endsWith(')')) {
          detail = remaining.slice(1, -1);
        }
        return { option: opt, detail };
      }
    }
    
    const match = item.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      return { option: match[1].trim(), detail: match[2] };
    }
    return { option: item.trim(), detail: '' };
  });
}

function serializeHeredofamiliares(items: HeredoItem[]): string {
  // Deduplicate by option name, keeping the first occurrence
  const unique: Record<string, HeredoItem> = {};
  items.forEach(item => {
    if (!unique[item.option]) {
      unique[item.option] = item;
    }
  });
  return Object.values(unique).map(item => item.detail ? `${item.option} (${item.detail})` : item.option).join('||');
}

// ─── Vacunas COVID-19 ──────────────────────────────────────────────────────────
interface VaxItem {
  nombre: string;
  fecha: string;
}

function parseVaxCovid(val: string): VaxItem[] {
  if (!val || val === 'no aplica' || val === 'Ninguna' || val === 'No') return [];
  return val.split('||').map(item => {
    let clean = item.trim();
    if (clean.startsWith('Vacuna:')) {
      clean = clean.slice(7).trim();
    }
    const dateIdx = clean.indexOf(' (Fecha: ');
    if (dateIdx !== -1) {
      const nombre = clean.slice(0, dateIdx).trim();
      let fecha = clean.slice(dateIdx + 9).trim();
      if (fecha.endsWith(')')) {
        fecha = fecha.slice(0, -1).trim();
      }
      return { nombre, fecha };
    }
    return { nombre: item, fecha: '' };
  });
}

function serializeVaxCovid(items: VaxItem[]): string {
  if (items.length === 0) return 'Ninguna';
  return items.map(item => `Vacuna: ${item.nombre || 'N/D'} (Fecha: ${item.fecha || 'N/D'})`).join('||');
}

// ─── Hospitalizaciones ─────────────────────────────────────────────────────────
interface HospItem {
  causa: string;
  fecha: string;
  duracion: string;
}

function parseHospitalizaciones(val: string): HospItem[] {
  if (!val || val === 'no aplica' || val === 'Ninguna') return [];
  return val.split('||').map(item => {
    let clean = item;
    if (clean.startsWith('Causa:')) {
      clean = clean.slice(6);
      if (clean.startsWith(' ')) {
        clean = clean.slice(1);
      }
    }
    const dateIdx = clean.indexOf(' (Fecha: ');
    if (dateIdx !== -1) {
      const causa = clean.slice(0, dateIdx);
      const rest = clean.slice(dateIdx + 9);
      const durIdx = rest.indexOf(', Duración: ');
      if (durIdx !== -1) {
        const fecha = rest.slice(0, durIdx);
        let duracion = rest.slice(durIdx + 12);
        if (duracion.endsWith(' días)')) {
          duracion = duracion.slice(0, -6);
        }
        return { causa, fecha, duracion };
      }
    }
    return { causa: item, fecha: '', duracion: '' };
  });
}

function serializeHospitalizaciones(items: HospItem[]): string {
  if (items.length === 0) return 'Ninguna';
  return items.map(item => `Causa: ${item.causa || 'N/D'} (Fecha: ${item.fecha || 'N/D'}, Duración: ${item.duracion || '0'} días)`).join('||');
}

// ─── Cirugías ──────────────────────────────────────────────────────────────────
interface CirugItem {
  cirugia: string;
  fecha: string;
  duracion: string;
  hasComplications: boolean;
  complicationDetail: string;
}

function parseCirugias(val: string): CirugItem[] {
  if (!val || val === 'Ninguna') return [];
  return val.split('||').map(item => {
    let clean = item;
    if (clean.startsWith('Cirugía:')) {
      clean = clean.slice(8);
      if (clean.startsWith(' ')) {
        clean = clean.slice(1);
      }
    }
    const dateIdx = clean.indexOf(' (Fecha: ');
    if (dateIdx !== -1) {
      const cirugia = clean.slice(0, dateIdx);
      const rest = clean.slice(dateIdx + 9);
      const durIdx = rest.indexOf(', Duración: ');
      if (durIdx !== -1) {
        const fecha = rest.slice(0, durIdx);
        const rest2 = rest.slice(durIdx + 12);
        const dashIdx = rest2.indexOf(' días - ');
        if (dashIdx !== -1) {
          const duracion = rest2.slice(0, dashIdx);
          let compText = rest2.slice(dashIdx + 8);
          if (compText.endsWith(')')) {
            compText = compText.slice(0, -1);
          }
          const hasComplications = !compText.startsWith('Sin complicaciones');
          let complicationDetail = '';
          if (hasComplications) {
            if (compText.startsWith('Complicación:')) {
              complicationDetail = compText.slice(13);
              if (complicationDetail.startsWith(' ')) {
                complicationDetail = complicationDetail.slice(1);
              }
            } else {
              complicationDetail = compText;
            }
          }
          return { cirugia, fecha, duracion, hasComplications, complicationDetail };
        }
      }
    }
    return { cirugia: item, fecha: '', duracion: '', hasComplications: false, complicationDetail: '' };
  });
}

function serializeCirugias(items: CirugItem[]): string {
  if (items.length === 0) return 'Ninguna';
  return items.map(item => {
    const comp = item.hasComplications 
      ? `Complicación: ${item.complicationDetail || 'No especificada'}` 
      : 'Sin complicaciones';
    return `Cirugía: ${item.cirugia || 'N/D'} (Fecha: ${item.fecha || 'N/D'}, Duración: ${item.duracion || '0'} días - ${comp})`;
  }).join('||');
}

// ─── Alergias ──────────────────────────────────────────────────────────────────
interface AlergiasData {
  medicamentos: string;
  alimentos: string;
  ambientales: string;
  otros: string;
}

function parseAlergias(val: string): AlergiasData {
  const result = { medicamentos: '', alimentos: '', ambientales: '', otros: '' };
  if (!val) return result;
  val.split('||').forEach(part => {
    const idx = part.indexOf(':');
    if (idx !== -1) {
      const key = part.slice(0, idx).trim().toLowerCase();
      let value = part.slice(idx + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      if (key === 'medicamentos') result.medicamentos = value;
      else if (key === 'alimentos') result.alimentos = value;
      else if (key === 'ambientales') result.ambientales = value;
      else if (key === 'otros') result.otros = value;
    }
  });
  if (!result.medicamentos && !result.alimentos && !result.ambientales && !result.otros) {
    result.otros = val;
  }
  return result;
}

function serializeAlergias(data: AlergiasData): string {
  const parts = [];
  if (data.medicamentos) parts.push(`Medicamentos: ${data.medicamentos}`);
  if (data.alimentos) parts.push(`Alimentos: ${data.alimentos}`);
  if (data.ambientales) parts.push(`Ambientales: ${data.ambientales}`);
  if (data.otros) parts.push(`Otros: ${data.otros}`);
  return parts.join('||');
}

// ─── Medicamentos ──────────────────────────────────────────────────────────────
interface MedItem {
  nombreComercial: string;
  salActiva: string;
  presentation: string;
  cantidad: string;
  unidad: string;
  frequency: string;
  tiempo?: string;
  observaciones?: string;
}

function parseMedicamentos(val: string): MedItem[] {
  if (!val) return [];
  return val.split('||').map(item => {
    const parts = item.split(' - ');
    if (parts.length >= 4) {
      const namePart = parts[0];
      const presentation = parts[1];
      const dosePart = parts[2];
      const frequency = parts[3];
      const tiempo = parts[4] || '';
      const observaciones = parts[5] || '';
      
      let nombreComercial = namePart;
      let salActiva = '';
      const nameMatch = namePart.match(/^(.*?)\s*\((.*?)\)$/);
      if (nameMatch) {
        nombreComercial = nameMatch[1];
        salActiva = nameMatch[2];
      }
      
      let cantidad = '';
      let unidad = '';
      const doseMatch = dosePart.match(/^([\d.,/]+)\s*(.*)$/);
      if (doseMatch) {
        cantidad = doseMatch[1];
        unidad = doseMatch[2];
      } else {
        unidad = dosePart;
      }
      
      return { nombreComercial, salActiva, presentation, cantidad, unidad, frequency, tiempo, observaciones };
    }
    return {
      nombreComercial: item,
      salActiva: '',
      presentation: '',
      cantidad: '',
      unidad: '',
      frequency: '',
      tiempo: '',
      observaciones: ''
    };
  });
}

function serializeMedicamentos(items: MedItem[]): string {
  return items.map(item => {
    const name = item.salActiva ? `${item.nombreComercial} (${item.salActiva})` : item.nombreComercial;
    const dose = item.cantidad ? `${item.cantidad} ${item.unidad}` : item.unidad;
    return `${name || 'N/D'} - ${item.presentation || 'N/D'} - ${dose || 'N/D'} - ${item.frequency || 'N/D'} - ${item.tiempo || ''} - ${item.observaciones || ''}`;
  }).join('||');
}

// ─── Sleep and Diet Helpers ───────────────────────────────────────────────────
function isOtrosOption(opt: string): boolean {
  const clean = opt.split(':')[0].trim().toLowerCase();
  return clean === 'otros' || clean === 'otro' || clean === 'otra' || clean === 'otras';
}

function parseSleepProblems(val: string) {
  const parts = val ? val.split('||') : [];
  const selectedOpts: string[] = [];
  let snoringIntensity = '';
  let otrosDetail = '';
  let comentarios = '';
  
  parts.forEach(part => {
    const colonIdx = part.indexOf(':');
    if (colonIdx !== -1) {
      const name = part.slice(0, colonIdx).trim();
      const rawDetail = part.slice(colonIdx + 1);
      const detail = rawDetail.startsWith(' ') ? rawDetail.slice(1) : rawDetail;
      if (name === 'Ronquidos') {
        selectedOpts.push('Ronquidos');
        snoringIntensity = detail;
      } else if (name === 'Otros') {
        selectedOpts.push('Otros');
        otrosDetail = detail;
      } else if (name === '[Comentarios]') {
        comentarios = detail;
      } else {
        selectedOpts.push(name);
      }
    } else {
      selectedOpts.push(part.trim());
    }
  });
  
  return { selectedOpts, snoringIntensity, otrosDetail, comentarios };
}

function serializeSleepProblems(selectedOpts: string[], snoringIntensity: string, otrosDetail: string, comentarios: string): string {
  const parts: string[] = [];
  selectedOpts.forEach(opt => {
    if (opt === 'Ronquidos') {
      parts.push(`Ronquidos: ${snoringIntensity || 'No especificado'}`);
    } else if (opt === 'Otros') {
      parts.push(`Otros: ${otrosDetail || ''}`);
    } else if (opt !== '[Comentarios]') {
      parts.push(opt);
    }
  });
  if (comentarios) {
    parts.push(`[Comentarios]: ${comentarios}`);
  }
  return parts.join('||');
}

function parseDietPattern(val: string) {
  const parts = val ? val.split('||') : [];
  const selectedOpts: string[] = [];
  let otrosDetail = '';
  let comentarios = '';

  parts.forEach(part => {
    part = part.trim();
    if (part.startsWith('[Comentarios]:')) {
      const raw = part.slice(14);
      comentarios = raw.startsWith(' ') ? raw.slice(1) : raw;
    } else if (part.startsWith('Otros:')) {
      const raw = part.slice(6);
      otrosDetail = raw.startsWith(' ') ? raw.slice(1) : raw;
      selectedOpts.push('Otros');
    } else if (part) {
      selectedOpts.push(part);
    }
  });

  return { selectedOpts, otrosDetail, comentarios };
}

function serializeDietPattern(selectedOpts: string[], otrosDetail: string, comentarios: string): string {
  const parts: string[] = [];
  selectedOpts.forEach(opt => {
    if (opt === 'Otros') {
      parts.push(`Otros: ${otrosDetail || ''}`);
    } else {
      parts.push(opt);
    }
  });
  if (comentarios) {
    parts.push(`[Comentarios]: ${comentarios}`);
  }
  return parts.join('||');
}

function parseVisualDiagnostic(val: string) {
  // Format: "OD: Miopía, Astigmatismo | Otros: Miopía severa || OI: Visión normal"
  const parts = val ? val.split('||') : [];
  let odOpts: string[] = [];
  let odOtros = '';
  let oiOpts: string[] = [];
  let oiOtros = '';
  
  parts.forEach(part => {
    part = part.trim();
    if (part.startsWith('OD:')) {
      const content = part.slice(3).trim();
      const subparts = content.split('|');
      odOpts = subparts[0] ? subparts[0].split(',').map(s => s.trim()).filter(Boolean) : [];
      if (subparts[1] && subparts[1].trim().startsWith('Otros:')) {
        const raw = subparts[1].trim().slice(6);
        odOtros = raw.startsWith(' ') ? raw.slice(1) : raw;
      }
    } else if (part.startsWith('OI:')) {
      const content = part.slice(3).trim();
      const subparts = content.split('|');
      oiOpts = subparts[0] ? subparts[0].split(',').map(s => s.trim()).filter(Boolean) : [];
      if (subparts[1] && subparts[1].trim().startsWith('Otros:')) {
        const raw = subparts[1].trim().slice(6);
        oiOtros = raw.startsWith(' ') ? raw.slice(1) : raw;
      }
    }
  });

  // Fallback for legacy values
  if (val && !val.includes('OD:') && !val.includes('OI:')) {
    if (val === 'No, visión normal' || val === 'Visión normal') {
      odOpts = ['Visión normal'];
      oiOpts = ['Visión normal'];
    } else if (val === 'Combinación de defectos') {
      odOpts = ['Otros'];
      oiOpts = ['Otros'];
      odOtros = 'Combinación de defectos';
      oiOtros = 'Combinación de defectos';
    } else {
      odOpts = [val];
      oiOpts = [val];
    }
  }
  
  return { odOpts, odOtros, oiOpts, oiOtros };
}

function serializeVisualDiagnostic(odOpts: string[], odOtros: string, oiOpts: string[], oiOtros: string): string {
  const odParts: string[] = [];
  if (odOpts.length > 0) odParts.push(odOpts.join(', '));
  if (odOtros) odParts.push(`Otros: ${odOtros}`);
  
  const oiParts: string[] = [];
  if (oiOpts.length > 0) oiParts.push(oiOpts.join(', '));
  if (oiOtros) oiParts.push(`Otros: ${oiOtros}`);
  
  const res: string[] = [];
  if (odParts.length > 0) res.push(`OD: ${odParts.join(' | ')}`);
  if (oiParts.length > 0) res.push(`OI: ${oiParts.join(' | ')}`);
  
  return res.join(' || ');
}
