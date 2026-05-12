'use client';
import { useState, useEffect } from 'react';
import { Plus, Search, X, Lock, Mail, Zap } from 'lucide-react';
import { getPatients, createPatient, getPatientProgressBatch, getStudiesWithBiomarkers, getInterviewAnswers, Patient } from '@/lib/api';
import { TOTAL_QUESTIONS } from '@/lib/questionnaire-data-ext';
import { supabase } from '@/lib/supabase';

import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, { interviewCount: number; reportApproved: number; reportGenerated: number; studyCount: number }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('fecha_desc');

  // Brief IA: { [patientId]: { loading, text } }
  const [briefs, setBriefs] = useState<Record<string, { loading: boolean; text: string | null }>>({});

  const generateBrief = async (patientId: string) => {
    // Toggle off if already showing
    if (briefs[patientId]?.text) {
      setBriefs(prev => ({ ...prev, [patientId]: { loading: false, text: null } }));
      return;
    }
    setBriefs(prev => ({ ...prev, [patientId]: { loading: true, text: null } }));
    const patientData = patients.find(pat => pat.id === patientId);
    try {
      // Fetch everything client-side (client is authenticated — no RLS issues)
      const [studies, rawAnswers] = await Promise.all([
        getStudiesWithBiomarkers(patientId),
        getInterviewAnswers(patientId),
      ]);
      const interviewAnswers = Object.fromEntries(
        rawAnswers.map((a: any) => [a.question_id ?? a.question ?? a.id, a.answer])
      );
      const res = await fetch('/api/patient/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: patientData,
          studies,
          interviewAnswers,
          chatHistory: [],
          message: 'Redacta un brief clínico ejecutivo de 2 párrafos cortos sobre este paciente. Incluye: quién es (edad, género, origen si se menciona), sus condiciones o síntomas más importantes, los valores de laboratorio más relevantes (alterados primero), y qué espera del tratamiento. Tono médico profesional y conciso.',
        }),
      });
      const data = await res.json();
      setBriefs(prev => ({ ...prev, [patientId]: { loading: false, text: data.response ?? data.error ?? 'Sin respuesta' } }));
    } catch {
      setBriefs(prev => ({ ...prev, [patientId]: { loading: false, text: 'Error al generar el resumen.' } }));
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    birth_date: '',
    gender: 'male'
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingAuth(false);
      if (session) loadPatients();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadPatients();
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoadingAuth(true);

    if (isRegistering) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else alert('¡Registro exitoso! Ya puedes iniciar sesión.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError('Credenciales incorrectas o error de red.');
    }
    setLoadingAuth(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const loadPatients = async () => {
    setLoading(true);
    const data = await getPatients();
    setPatients(data);
    if (data.length > 0) {
      const prog = await getPatientProgressBatch(data.map(p => p.id));
      setProgress(prog);
    }
    setLoading(false);
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: newPatient, error } = await createPatient({
      ...formData,
      status: 'Entrevista Pendiente'
    });
    
    if (newPatient) {
      setIsModalOpen(false);
      setFormData({ full_name: '', birth_date: '', gender: 'male' });
      loadPatients(); // Recargar la lista
    } else {
      alert("Error al crear paciente: " + error);
    }
  };

  if (loadingAuth) {
    return <div style={{...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center'}}><p>Cargando seguridad PDI...</p></div>;
  }

  // --- PANTALLA DE LOGIN ---
  if (!session) {
    return (
      <div style={{...styles.container, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <img src="/logoGMA.png" alt="Grupo Médico Antea" style={{ height: '140px', width: 'auto', marginBottom: '24px' }} />
          <h1 style={styles.title}>PDI <span style={styles.titleHighlight}>Security</span></h1>
          <p style={styles.subtitle}>Acceso Exclusivo para Especialistas Autorizados</p>
        </div>

        <div style={{...styles.listSection, width: '100%', maxWidth: '400px', padding: '40px'}}>
          <h2 style={{...styles.sectionTitle, marginBottom: '24px', textAlign: 'center', color: 'var(--gold-primary)'}}>
            {isRegistering ? 'Crear Cuenta PDI' : 'Iniciar Sesión'}
          </h2>

          {authError && <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', textAlign: 'center' }}>{authError}</div>}

          <form onSubmit={handleAuth}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Correo Electrónico</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
                <input 
                  type="email" 
                  style={{...styles.input, paddingLeft: '44px'}} 
                  placeholder="doctor@antea.com"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
                <input 
                  type="password" 
                  style={{...styles.input, paddingLeft: '44px'}} 
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px', padding: '14px' }}>
              {isRegistering ? 'Registrarse en PDI' : 'Acceder al Command Center'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>
            {isRegistering ? '¿Ya tienes acceso?' : '¿No tienes cuenta?'}
            <button 
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', marginLeft: '8px', cursor: 'pointer', fontFamily: 'var(--font-main)' }}
            >
              {isRegistering ? 'Inicia Sesión' : 'Crea una aquí'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // --- PANTALLA PRINCIPAL (DASHBOARD) ---
  const filteredPatients = patients
    .filter(p => p.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortOption === 'fecha_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOption === 'fecha_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      const getScore = (p: Patient) => {
        const prog = progress[p.id] ?? { interviewCount: 0, reportApproved: 0, reportGenerated: 0, studyCount: 0 };
        const intPct = Math.min(100, Math.round((prog.interviewCount / TOTAL_QUESTIONS) * 100));
        const repPct = Math.round(((prog.reportApproved * 2 + (prog.reportGenerated - prog.reportApproved)) / 10) * 100);
        return intPct + repPct;
      };
      if (sortOption === 'avance_desc') return getScore(b) - getScore(a);
      if (sortOption === 'avance_asc') return getScore(a) - getScore(b);
      return 0;
    });

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <img src="/logoGMA.png" alt="Grupo Médico Antea" style={{ height: '120px', width: 'auto' }} />
          <div style={{ height: '60px', width: '1px', backgroundColor: 'var(--border-strong)', opacity: 0.5 }}></div>
          <div>
            <h1 style={styles.title}>PDI <span style={styles.titleHighlight}>Command Center</span></h1>
            <p style={styles.subtitle}>Protocolo de Diagnóstico Integral</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', fontFamily: 'var(--font-main)' }}>
            Cerrar Sesión
          </button>
          <button className="btn-primary" style={{ padding: '16px 32px', fontSize: '16px' }} onClick={() => setIsModalOpen(true)}>
            <Plus size={20} />
            Nuevo Paciente
          </button>
        </div>
      </header>

      {/* Snapshot Cards */}
      <div style={styles.snapshotGrid}>
        <div className="card">
          <h3 style={styles.cardTitle}>Casos Activos</h3>
          <p style={styles.statValue}>{patients.length}</p>
          <p style={styles.statSub}>Pacientes registrados</p>
        </div>
        <div className="card">
          <h3 style={styles.cardTitle}>Manuales Generados</h3>
          <p style={styles.statValue}>0</p>
          <p style={styles.statSub}>Histórico total</p>
        </div>
        <div className="card">
          <h3 style={styles.cardTitle}>Alertas Rojas Activas</h3>
          <p style={{...styles.statValue, color: '#ef4444'}}>0</p>
          <p style={styles.statSub}>Requieren revisión urgente</p>
        </div>
      </div>

      {/* Patient List */}
      <section style={styles.listSection}>
        <div style={styles.listHeader}>
          <h2 style={styles.sectionTitle}>Dashboard de Pacientes</h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} style={{ ...styles.searchInput, border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 16px', backgroundColor: 'var(--bg-main)' }}>
              <option value="fecha_desc">Más recientes primero</option>
              <option value="fecha_asc">Más antiguos primero</option>
              <option value="avance_desc">Mayor avance clínico</option>
              <option value="avance_asc">Menor avance clínico</option>
            </select>
            <div style={styles.searchBox}>
              <Search size={16} color="var(--text-muted)" />
              <input type="text" placeholder="Buscar por nombre..." style={styles.searchInput} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>Cargando pacientes...</p>
          ) : patients.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No hay pacientes registrados aún.</p>
          ) : (
            filteredPatients.map((p) => {
              const prog = progress[p.id] ?? { interviewCount: 0, reportApproved: 0, reportGenerated: 0, studyCount: 0 };
              const interviewPct = Math.min(100, Math.round((prog.interviewCount / TOTAL_QUESTIONS) * 100));
              const reportPct = Math.round(((prog.reportApproved * 2 + (prog.reportGenerated - prog.reportApproved)) / 10) * 100);
              const age = (() => { const b = new Date(p.birth_date), t = new Date(); return t.getFullYear() - b.getFullYear(); })();
              const nextAction = interviewPct < 100 ? 'Completar Entrevista' : prog.studyCount === 0 ? 'Subir Estudios de Laboratorio' : reportPct < 100 ? 'Generar Reporte Maestro' : 'Revisar Expediente';
              const statusColor = interviewPct === 100 && prog.studyCount > 0 ? '#22c55e' : 'var(--gold-primary)';

              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '20px', alignItems: 'center', padding: '16px 20px', paddingBottom: briefs[p.id]?.text ? '0' : '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', transition: 'border-color 0.2s' }}>

                  {/* Patient info */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>{p.full_name}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: `${statusColor}15`, border: `1px solid ${statusColor}40`, color: statusColor, fontWeight: 600, letterSpacing: '0.05em' }}>Próximo paso: {nextAction}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.gender === 'male' ? 'Hombre' : 'Mujer'} · {age} años · Inicio: {new Date(p.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>

                  {/* Brief IA button */}
                  <button
                    onClick={() => generateBrief(p.id)}
                    title="Resumen clínico rápido con IA"
                    style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${briefs[p.id]?.text ? 'rgba(212,175,55,0.6)' : 'var(--border-subtle)'}`, background: briefs[p.id]?.text ? 'rgba(212,175,55,0.08)' : 'transparent', color: briefs[p.id]?.text ? 'var(--gold-primary)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '60px', transition: 'all 0.2s' }}
                    onMouseEnter={e => { if (!briefs[p.id]?.text) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,175,55,0.06)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.4)'; }}}
                    onMouseLeave={e => { if (!briefs[p.id]?.text) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; }}}
                  >
                    {briefs[p.id]?.loading
                      ? <span style={{ fontSize: '16px' }}>⏳</span>
                      : <Zap size={16} fill={briefs[p.id]?.text ? 'currentColor' : 'none'} />}
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Brief</span>
                  </button>

                  {/* Entrevista mini widget */}
                  <button onClick={() => router.push(`/pacientes/${p.id}/entrevista`)} style={{ display: 'flex', flexDirection: 'column', gap: '7px', padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.05)', color: 'var(--gold-primary)', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '150px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7 }}>📋 Entrevista</span>
                      <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>{interviewPct}<span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.6 }}>%</span></span>
                    </div>
                    <div style={{ height: '2px', borderRadius: '99px', background: 'rgba(212,175,55,0.15)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${interviewPct}%`, background: 'linear-gradient(90deg, rgba(212,175,55,0.6), var(--gold-primary))', borderRadius: '99px', transition: 'width 0.5s ease' }} />
                    </div>
                  </button>

                  {/* Reporte mini widget */}
                  <button onClick={() => router.push(`/pacientes/${p.id}/reporte`)} style={{ display: 'flex', flexDirection: 'column', gap: '7px', padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'var(--gold-primary)', color: '#1a1a18', cursor: 'pointer', fontFamily: 'var(--font-main)', minWidth: '150px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>📄 Reporte</span>
                      <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>{reportPct}<span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.5 }}>%</span></span>
                    </div>
                    <div style={{ height: '2px', borderRadius: '99px', background: 'rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${reportPct}%`, background: 'rgba(0,0,0,0.4)', borderRadius: '99px', transition: 'width 0.5s ease' }} />
                    </div>
                  </button>

                  {/* Expediente button */}
                  <button onClick={() => router.push(`/pacientes/${p.id}`)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-main)', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Ver Expediente
                  </button>

                  {/* ── Brief IA panel — spans full width inside the grid ── */}
                  {briefs[p.id]?.text && (
                    <div style={{ gridColumn: '1 / -1', margin: '4px -20px -4px', padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(212,175,55,0.03)', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <Zap size={15} color="var(--gold-primary)" style={{ marginTop: '3px', flexShrink: 0 }} fill="var(--gold-primary)" />
                        <div>
                          <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold-primary)', opacity: 0.85 }}>Brief Clínico · IA</p>
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{briefs[p.id].text}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Modal Nuevo Paciente */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Alta de Paciente</h2>
              <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreatePatient}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Nombre Completo</label>
                <input 
                  type="text" 
                  style={styles.input} 
                  placeholder="Ej. Roberto Mendieta"
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  required
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Fecha de Nacimiento</label>
                  <input 
                    type="date" 
                    style={styles.input} 
                    value={formData.birth_date}
                    onChange={e => setFormData({...formData, birth_date: e.target.value})}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Sexo Fisiológico</label>
                  <select 
                    style={styles.input}
                    value={formData.gender}
                    onChange={e => setFormData({...formData, gender: e.target.value})}
                  >
                    <option value="male">Hombre</option>
                    <option value="female">Mujer</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}>
                Crear Expediente Base
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Estilos en línea para un prototipado rápido y limpio
const styles = {
  container: {
    padding: '40px 60px',
    maxWidth: '1400px',
    margin: '0 auto',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '48px',
  },
  title: {
    fontSize: '32px',
    margin: 0,
    color: 'var(--text-primary)',
  },
  titleHighlight: {
    color: 'var(--gold-primary)',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    marginTop: '4px',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
  },
  snapshotGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
    marginBottom: '48px',
  },
  cardTitle: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontFamily: 'var(--font-main)',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginBottom: '16px',
  },
  statValue: {
    fontSize: '48px',
    fontFamily: 'var(--font-main)',
    color: 'var(--gold-primary)',
    margin: '0 0 4px 0',
    lineHeight: 1,
  },
  statSub: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    margin: 0,
  },
  listSection: {
    backgroundColor: 'var(--bg-surface)',
    borderRadius: '12px',
    border: '1px solid var(--border-subtle)',
    padding: '32px',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '20px',
    margin: 0,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '8px 16px',
    gap: '8px',
  },
  searchInput: {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    outline: 'none',
    fontSize: '14px',
    width: '250px',
    fontFamily: 'var(--font-main)',
  },
  tableContainer: {
    width: '100%',
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '16px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: '1px solid var(--border-strong)',
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  td: {
    padding: '16px',
    verticalAlign: 'middle' as const,
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: '16px',
    padding: '32px',
    width: '100%',
    maxWidth: '500px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  modalTitle: {
    color: 'var(--gold-primary)',
    fontSize: '24px',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'var(--font-main)',
    outline: 'none',
  }
};
