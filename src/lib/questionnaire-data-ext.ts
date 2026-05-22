import { SECTIONS as BASE_SECTIONS, Section } from './questionnaire-data';

const SECTIONS_8_14: Section[] = [
  {
    num: 8, icon: '🦷',
    title: 'Salud Dental y Estomatognática',
    subtitle: 'Conexión boca-cuerpo: dientes, encías, ATM y microbiota oral',
    questions: [
      { subsection: 'Higiene dental' },
      { id:'s8q1', type:'opts', label:'Frecuencia de cepillado dental', options:['1 vez al día','2 veces al día','3 o más veces al día','Irregular'] },
      { id:'s8q2', type:'opts', label:'¿Usa hilo dental o cepillo interdental?', options:['Diariamente','Algunos días','Rara vez','Nunca'] },
      { id:'s8q3', type:'opts', label:'Última visita al dentista', options:['Hace menos de 6 meses','6 a 12 meses','1 a 2 años','Más de 2 años'] },
      { subsection: 'Salud periodontal' },
      { id:'s8q4', type:'multiopt', label:'Síntomas bucales que presenta', options:['Sangrado de encías al cepillarse','Encías inflamadas','Encías retraídas','Movilidad dental','Dolor dental espontáneo','Sensibilidad intensa al frío o calor','Caries múltiples recientes','Mal aliento persistente','Úlceras recurrentes','Ninguno'] },
      { id:'s8q5', type:'opts', label:'¿Tiene diagnóstico de enfermedad periodontal?', options:['No','Gingivitis','Periodontitis leve','Periodontitis moderada o severa','No lo sé'] },
      { id:'s8q6', type:'opts', label:'¿Le faltan piezas dentales?', options:['No, dentición completa','Sí, 1-2 piezas','Sí, varias piezas','Sí, uso prótesis parcial','Sí, uso prótesis total'] },
      { subsection: 'ATM (articulación temporomandibular)' },
      { id:'s8q7', type:'multiopt', label:'Síntomas de ATM', options:['Dolor al masticar o abrir la boca','Clic o chasquido','Apertura bucal limitada','Bruxismo (rechina o aprieta dientes)','Dolor de oídos sin infección','Cefalea temporal','Ninguno'] },
      { id:'s8q8', type:'opts', label:'¿Usa férula dental o placa de descarga?', options:['No','Sí, de noche','Sí, de día','La tuve pero abandoné el uso'] },
      { id:'s8q9', type:'text', label:'Otros aspectos de salud dental que quiera mencionar' },
    ]
  },
  {
    num: 9, icon: '👁️',
    title: 'Salud Visual y Retinografía',
    subtitle: 'Visión, presión ocular y marcadores vasculares oculares',
    questions: [
      { id:'s9q1', type:'multiopt', label:'¿Usa lentes o tiene diagnóstico visual?', options:['No, visión normal','Miopía','Hipermetropía','Astigmatismo','Presbicia','Glaucoma','Catarata','Degeneración Macular (DMAE)','Retinopatía Diabética','Ojo Seco','Queratocono','Estrabismo','Pterigión','Desprendimiento de Retina'] },
      { id:'s9q2', type:'opts', label:'Última revisión con oftalmólogo', options:['Hace menos de 1 año','1-2 años','3-5 años','Más de 5 años','Nunca'] },
      { id:'s9q3', type:'opts', label:'¿Tiene diagnóstico de glaucoma o presión ocular alta?', options:['No','Sí, glaucoma de ángulo abierto','Sí, glaucoma de ángulo cerrado','Hipertensión ocular sin daño aún','Sospecha en evaluación'] },
      { id:'s9q4', type:'opts', label:'¿Tiene diagnóstico de retinopatía (diabética u otra)?', options:['No','Sí, retinopatía diabética leve','Sí, retinopatía diabética moderada/severa','Sí, retinopatía hipertensiva','Otra retinopatía'] },
      { id:'s9q5', type:'multiopt', label:'Síntomas visuales que presenta', options:['Visión borrosa frecuente','Destellos o fotopsias','Moscas volantes (miodesopsias)','Pérdida súbita de visión (aunque sea transitoria)','Visión doble','Dificultad para ver de noche','Reducción del campo visual periférico','Otros','Ninguno'] },
      { id:'s9q6', type:'opts', label:'¿Se ha realizado retinografía (foto del fondo de ojo)?', options:['No','Sí, resultados normales','Sí, con hallazgos (especificar abajo)','No recuerdo'] },
      { id:'s9q7', type:'text', label:'Hallazgos en retinografía o notas visuales adicionales' },
    ]
  },
  {
    num: 10, icon: '🧴',
    title: 'Salud Dermatológica e Integumentaria',
    subtitle: 'Piel, cabello, uñas y mucosas como espejo de la salud interna',
    questions: [
      { id:'s10q1', type:'multiopt', label:'Condiciones dermatológicas diagnosticadas', options:['Psoriasis','Eccema / dermatitis atópica','Dermatitis seborreica','Rosácea','Acné crónico','Vitiligo','Alopecia areata','Ninguna'] },
      { id:'s10q2', type:'multiopt', label:'Cambios en la piel observados recientemente', options:['Sequedad o descamación excesiva','Picazón generalizada sin causa aparente','Aparición de manchas nuevas','Cambio en la forma o color de lunares','Heridas de cicatrización lenta','Coloración amarillenta (ictericia)','Piel muy grasa','Ninguno'] },
      { id:'s10q3', type:'multiopt', label:'Cambios en el cabello o cuero cabelludo', options:['Caída de cabello excesiva (más de 100 hebras/día)','Adelgazamiento generalizado del cabello','Pérdida en zonas específicas (calvicie)','Cambio de textura (muy seco o muy graso)','Caspa persistente','Otros','Ninguno'] },
      { id:'s10q4', type:'multiopt', label:'Cambios en las uñas', options:['Uñas frágiles o quebradizas','Uñas estriadas longitudinalmente','Manchas blancas en uñas','Uñas amarillas o engrosadas','Separación de la uña del lecho ungueal','Ninguno'] },
      { id:'s10q5', type:'opts', label:'¿Cuántas horas de exposición solar directa recibe al día?', options:['Casi ninguna (trabajo en interiores)','Menos de 30 min','30-60 minutos','Más de 1 hora'] },
      { id:'s10q6', type:'text', label:'Otros síntomas dermatológicos relevantes' },
    ]
  },
  {
    num: 11, icon: '🫁',
    title: 'Sistemas Renal, Respiratorio y Osteomuscular',
    subtitle: 'Riñones, pulmones, huesos, articulaciones y músculos',
    questions: [
      { subsection: 'Sistema renal' },
      { id:'s11q1', type:'multiopt', label:'¿Tiene diagnóstico de enfermedad renal?', options:['No','Enfermedad renal crónica estadio 1-2','Enfermedad renal crónica estadio 3-4','Insuficiencia renal en diálisis','Cálculos renales recurrentes','Otros'] },
      { id:'s11q2', type:'multiopt', label:'Síntomas renales', options:['Orina muy espumosa','Orina oscura o marrón','Sangre en orina (hematuria)','Dolor en la zona lumbar baja / flanco','Hinchazón en párpados o cara al despertar','Orinar muy poco (oliguria)','Orinar en exceso (poliuria)','Ninguno'] },
      { subsection: 'Sistema respiratorio' },
      { id:'s11q3', type:'multiopt', label:'¿Tiene diagnóstico de enfermedad respiratoria?', options:['No','Asma','EPOC (enfisema o bronquitis crónica)','Apnea del sueño','Bronquiectasias','Fibrosis pulmonar','Otro'] },
      { id:'s11q4', type:'multiopt', label:'Síntomas respiratorios', options:['Tos crónica (más de 3 semanas)','Expectoración frecuente','Sibilancias o silbidos al respirar','Falta de aire con esfuerzo mínimo','Falta de aire en reposo','Dolor torácico al respirar','Ninguno'] },
      { subsection: 'Sistema osteomuscular' },
      { id:'s11q5', type:'opts', label:'¿Tiene diagnóstico de enfermedad ósea o articular?', options:['No','Osteopenia','Osteoporosis','Artritis (no autoinmune)','Artritis reumatoide','Gota','Fibromialgia','Otro'] },
      { id:'s11q6', type:'multiopt', label:'Síntomas musculoesqueléticos', options:['Dolor articular crónico','Dolor muscular difuso','Rigidez articular matutina','Calambres musculares frecuentes','Debilidad muscular general','Fracturas ante mínimos traumatismos','Pérdida de masa muscular visible','Ninguno'] },
      { id:'s11q7', type:'text', label:'Otros síntomas renales, respiratorios u óseos relevantes' },
    ]
  },
  {
    num: 12, icon: '🔬',
    title: 'Desintoxicación y Estrés Oxidativo',
    subtitle: 'Función hepática de detox, exposición a tóxicos y estado antioxidante',
    questions: [
      { id:'s12q1', type:'opts', label:'Consumo de alcohol', options:['Nunca o casi nunca','Ocasional (menos de 1 vez/semana)','Moderado (1-2 copas/día)','Alto (más de 2 copas/día)','Historial de dependencia alcohólica'] },
      { id:'s12q2', type:'opts', label:'Tabaquismo', options:['Nunca fumé','Ex-fumador (más de 1 año sin fumar)','Ex-fumador reciente','Fumador activo (menos de 10 cigarros/día)','Fumador activo (10 o más cigarros/día)'] },
      { id:'s12q3', type:'multiopt', label:'Exposición a sustancias tóxicas', options:['Pesticidas o agroquímicos (trabajo o zona de vida)','Metales pesados (plomo, mercurio, arsénico)','Solventes industriales','Plásticos y disruptores endocrinos (uso frecuente)','Agua de pozo sin filtrar','Ninguna exposición significativa'] },
      { id:'s12q4', type:'multiopt', label:'Síntomas que sugieren sobrecarga hepática o tóxica', options:['Fatiga matutina persistente','Náuseas sin causa digestiva clara','Intolerancia a grasas o alcohol','Sensación de "hígado pesado" o molestia en hipocondrio derecho','Orina muy oscura sin deshidratación','Heces muy claras o grises','Ninguno'] },
      { id:'s12q5', type:'opts', label:'¿Toma suplementos antioxidantes?', options:['No','Sí, vitamina C','Sí, vitamina E','Sí, glutatión o NAC','Sí, coenzima Q10','Sí, varios antioxidantes'] },
      { id:'s12q6', type:'opts', label:'¿Ha realizado algún protocolo de desintoxicación?', options:['No','Sí, ayuno intermitente','Sí, protocolo quelante médico','Sí, limpieza hepática alternativa','Sí, otro tipo de detox'] },
      { id:'s12q7', type:'text', label:'Otros aspectos de exposición tóxica o desintoxicación' },
    ]
  },
  {
    num: 13, icon: '📌',
    title: 'Protocolo Maestro de Intervención',
    subtitle: 'Metas de salud, motivación y disposición para el cambio',
    questions: [
      { id:'s13q1', type:'scale', label:'¿Qué tan motivado está para mejorar su salud?', min:1, max:10, minLabel:'Sin motivación', maxLabel:'Muy motivado' },
      { id:'s13q2', type:'multiopt', label:'Principales metas de salud que desea lograr', options:['Perder peso','Ganar músculo y mejorar composición corporal','Tener más energía','Dormir mejor','Reducir estrés y ansiedad','Mejorar marcadores de laboratorio','Controlar enfermedad crónica','Prevenir enfermedades futuras','Optimizar rendimiento cognitivo','Mejorar salud hormonal','Mejorar salud digestiva','Otros'] },
      { id:'s13q3', type:'opts', label:'¿Cuánto tiempo puede dedicar a hábitos saludables por día?', options:['Menos de 15 minutos','15-30 minutos','30-60 minutos','Más de 1 hora'] },
      { id:'s13q4', type:'opts', label:'Principal barrera para mejorar su salud', options:['Falta de tiempo','Falta de motivación','Dificultad económica','Dolor o enfermedad que lo limita','Falta de información','Entorno social poco favorable','No encuentro barreras importantes'] },
      { id:'s13q5', type:'opts', label:'Disposición para cambiar hábitos alimentarios', options:['Muy dispuesto, haré todo lo necesario','Dispuesto con ajustes graduales','Algo dispuesto pero con limitaciones','Poco dispuesto, prefiero medicación'] },
      { id:'s13q6', type:'opts', label:'Disposición para incorporar actividad física', options:['Muy dispuesto','Dispuesto con ajustes','Algo dispuesto','Poco dispuesto por salud o tiempo'] },
      { id:'s13q7', type:'text', label:'¿Hay algo más que quiera que su médico sepa antes de diseñar su plan de intervención?' },
    ]
  },
  {
    num: 14, icon: '📎',
    title: 'Anexos y Glosario',
    subtitle: 'Información complementaria y documentos adicionales',
    questions: [
      { id:'s14q1', type:'text', label:'Estudios previos relevantes que trae (nombre y fecha aproximada)', hint:'Ej: Biometría hemática 2024, Perfil tiroideo 2023...' },
      { id:'s14q2', type:'text', label:'Nombre de médicos tratantes actuales y especialidades' },
      { id:'s14q3', type:'opts', label:'¿Tiene expediente en otra institución o plataforma médica?', options:['No','Sí, en clínica privada','Sí, en IMSS / ISSSTE','Sí, en hospital universitario','Sí, en el extranjero'] },
      { id:'s14q4', type:'text', label:'Observaciones finales del paciente o acompañante' },
    ]
  },
];

export const ALL_SECTIONS: Section[] = [...BASE_SECTIONS, ...SECTIONS_8_14];

export const HIDDEN_QUESTION_IDS = ['s1q9', 's1q12', 's1q14', 's6q6_vax_detail', 's9q7'];

export const TOTAL_QUESTIONS = ALL_SECTIONS.reduce(
  (acc, s) => acc + s.questions.filter(q => q.id && !HIDDEN_QUESTION_IDS.includes(q.id)).length, 0
);
