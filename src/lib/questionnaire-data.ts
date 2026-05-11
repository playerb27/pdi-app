export type QuestionType = 'text' | 'num' | 'opts' | 'multiopt' | 'scale';

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  hint?: string;
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface QuestionItem {
  subsection?: string;
  id?: string;
  type?: QuestionType;
  label?: string;
  hint?: string;
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface Section {
  num: number;
  title: string;
  subtitle: string;
  icon: string;
  questions: QuestionItem[];
}

export const SECTIONS: Section[] = [
  {
    num: 1, icon: '📋',
    title: 'Fundamentos y Resumen Ejecutivo',
    subtitle: 'Datos demográficos, motivo de consulta y antecedentes generales',
    questions: [
      { id:'s1q1', type:'text', label:'Nombre completo', hint:'Solo para encabezado del expediente' },
      { id:'s1q2', type:'num', label:'Edad', unit:'años' },
      { id:'s1q3', type:'opts', label:'Sexo biológico', options:['Masculino','Femenino','Intersex / Otro'] },
      { id:'s1q4', type:'opts', label:'Estado civil', options:['Soltero/a','Casado/a','Unión libre','Divorciado/a','Viudo/a'] },
      { id:'s1q5', type:'text', label:'Ocupación o actividad principal' },
      { id:'s1q6', type:'text', label:'¿Cuál es el motivo principal de este checkup?', hint:'Describa en sus propias palabras' },
      { id:'s1q7', type:'opts', label:'Último checkup general realizado', options:['Hace menos de 1 año','1-2 años','3-5 años','Más de 5 años','Nunca'] },
      { id:'s1q8', type:'multiopt', label:'Antecedentes heredofamiliares', hint:'Padres, hermanos, abuelos', options:['Diabetes tipo 2','Hipertensión arterial','Infarto al miocardio','EVC / derrame cerebral','Cáncer (cualquier tipo)','Obesidad','Dislipidemias','Enfermedad renal','Alzheimer / demencia','Depresión / trastornos mentales','Osteoporosis','Enfermedad tiroidea','Ninguno conocido'] },
      { id:'s1q9', type:'text', label:'Si marcó cáncer, especifique tipo y familiar afectado' },
      { id:'s1q10', type:'scale', label:'¿Cómo califica su estado de salud actual?', min:1, max:10, minLabel:'Muy mal', maxLabel:'Excelente' },
      { id:'s1q11', type:'opts', label:'¿Ha sido hospitalizado en los últimos 5 años?', options:['No','Sí, 1 vez','Sí, 2-3 veces','Sí, más de 3 veces'] },
      { id:'s1q12', type:'text', label:'Si fue hospitalizado, indique la causa' },
      { id:'s1q13', type:'opts', label:'¿Ha tenido cirugías previas?', options:['No','Sí, menores (ambulatorias)','Sí, mayores (con hospitalización)'] },
      { id:'s1q14', type:'text', label:'Liste sus cirugías y año aproximado' },
      { id:'s1q15', type:'text', label:'Alergias conocidas (medicamentos, alimentos, ambiente)', hint:"Escriba 'ninguna' si no tiene" },
      { id:'s1q16', type:'text', label:'Medicamentos actuales (nombre, dosis, frecuencia)', hint:'Incluyendo suplementos y plantas medicinales' },
      { id:'s1q17', type:'text', label:'Liste sus diagnósticos actuales conocidos' },
    ]
  },
  {
    num: 2, icon: '⚡',
    title: 'Sistema Metabólico y Energético',
    subtitle: 'Peso, composición corporal, energía, sueño y hábitos nutricionales',
    questions: [
      { subsection: 'Antropometría' },
      { id:'s2q1', type:'num', label:'Peso actual', unit:'kg' },
      { id:'s2q2', type:'num', label:'Talla / Estatura', unit:'cm' },
      { id:'s2q3', type:'num', label:'Circunferencia de cintura', unit:'cm', hint:'A nivel del ombligo' },
      { id:'s2q4', type:'opts', label:'¿Ha modificado su peso en el último año?', options:['No, estable','Subí 1-5 kg','Subí 5-10 kg','Subí más de 10 kg','Bajé de peso sin intentarlo'] },
      { id:'s2q5', type:'opts', label:'¿Dónde acumula más grasa corporal?', options:['Abdomen (tipo manzana)','Caderas y muslos (tipo pera)','Distribuida uniformemente','No lo sé'] },
      { subsection: 'Energía y fatiga' },
      { id:'s2q6', type:'scale', label:'Nivel de energía promedio durante el día', min:1, max:10, minLabel:'Agotado siempre', maxLabel:'Energía óptima' },
      { id:'s2q7', type:'opts', label:'¿A qué hora siente más cansancio?', options:['Al despertar','Media mañana','Después de comer','Por la tarde','Por la noche','Cansancio constante'] },
      { id:'s2q8', type:'opts', label:'¿Necesita cafeína para funcionar?', options:['No','1 taza al día','2-3 cafés al día','4 o más / bebidas energéticas','Sin ellos no puedo funcionar'] },
      { subsection: 'Sueño' },
      { id:'s2q9', type:'opts', label:'Horas de sueño por noche', options:['Menos de 5 h','5-6 h','7-8 h','Más de 9 h'] },
      { id:'s2q10', type:'scale', label:'Calidad del sueño', min:1, max:10, minLabel:'Muy mala', maxLabel:'Excelente' },
      { id:'s2q11', type:'multiopt', label:'Problemas de sueño que presenta', options:['Dificultad para conciliar el sueño','Despertares frecuentes','Me despierto muy temprano y no vuelvo a dormir','Ronquidos intensos','Apnea del sueño diagnosticada','Somnolencia diurna excesiva','Sueño no reparador','Ninguno'] },
      { subsection: 'Nutrición' },
      { id:'s2q12', type:'opts', label:'Patrón alimentario principal', options:['Omnívoro (come de todo)','Vegetariano','Vegano','Cetogénico / bajo en carbohidratos','Mediterráneo','Sin patrón definido'] },
      { id:'s2q13', type:'opts', label:'¿Cuántas veces come al día?', options:['1-2 veces','3 veces','4-5 veces','Picoteo continuo sin horario'] },
      { id:'s2q14', type:'multiopt', label:'Hábitos alimentarios problemáticos', options:['Como muy rápido','Salteo comidas frecuentemente','Como frente a pantallas','Como por ansiedad o estrés emocional','Alto consumo de ultraprocesados','Alto consumo de azúcar','Ninguno'] },
      { subsection: 'Actividad física' },
      { id:'s2q15', type:'opts', label:'Nivel de actividad física semanal', options:['Sedentario (sin ejercicio)','Ligero (caminar ocasional)','Moderado (ejercicio 1-3 días/semana)','Activo (4-5 días/semana)','Muy activo (6-7 días / atleta)'] },
      { id:'s2q16', type:'text', label:'Tipo de ejercicio que practica y duración por sesión' },
    ]
  },
  {
    num: 3, icon: '❤️',
    title: 'Salud Cardiovascular y Circulatoria',
    subtitle: 'Corazón, presión arterial, circulación y factores de riesgo',
    questions: [
      { subsection: 'Presión arterial' },
      { id:'s3q1', type:'opts', label:'¿Tiene diagnóstico de hipertensión arterial?', options:['No','Sí, controlada con medicamento','Sí, con cambios de estilo de vida','Sí, no controlada'] },
      { id:'s3q2', type:'opts', label:'Última presión arterial conocida', options:['No la conozco','Normal (menos de 120/80)','Elevada (120-129/menos de 80)','Hipertensión grado 1 (130-139/80-89)','Hipertensión grado 2 (140 o más)'] },
      { subsection: 'Síntomas cardíacos' },
      { id:'s3q3', type:'multiopt', label:'¿Ha presentado alguno de estos síntomas?', options:['Dolor o presión en el pecho','Dolor que irradia al brazo izquierdo o mandíbula','Palpitaciones','Latidos irregulares','Falta de aire al esfuerzo','Falta de aire en reposo','Desmayo (síncope)','Hinchazón en pies o tobillos','Ninguno'] },
      { id:'s3q4', type:'opts', label:'¿Ha tenido infarto o angina previamente?', options:['No','Sí, infarto de miocardio','Sí, angina diagnosticada','Sospecha no confirmada'] },
      { subsection: 'Circulación periférica' },
      { id:'s3q5', type:'multiopt', label:'Síntomas de circulación periférica deficiente', options:['Manos o pies fríos de manera constante','Hormigueo en extremidades','Piernas cansadas o pesadas al caminar','Calambres en pantorrillas al caminar','Várices visibles','Trombosis venosa profunda previa','Fenómeno de Raynaud','Heridas que no cicatrizan en pies','Ninguno'] },
      { subsection: 'Factores de riesgo' },
      { id:'s3q6', type:'opts', label:'Colesterol total (último valor conocido)', options:['No lo conozco','Normal (menos de 200 mg/dL)','Límite (200-239 mg/dL)','Alto (240 mg/dL o más)'] },
      { id:'s3q7', type:'opts', label:'Triglicéridos (último valor conocido)', options:['No los conozco','Normal (menos de 150 mg/dL)','Elevados (150-499 mg/dL)','Muy elevados (500 mg/dL o más)'] },
      { id:'s3q8', type:'opts', label:'¿Ha sido diagnosticado con alguna arritmia?', options:['No','Fibrilación auricular','Taquicardia supraventricular','Bloqueo de rama o AV','Otra'] },
      { id:'s3q9', type:'text', label:'¿Hay algo más sobre su salud cardiovascular que quiera mencionar?' },
    ]
  },
  {
    num: 4, icon: '🧬',
    title: 'Sistema Endocrino (Hormonal)',
    subtitle: 'Tiroides, suprarrenales, glucosa, hormonas sexuales',
    questions: [
      { subsection: 'Tiroides' },
      { id:'s4q1', type:'opts', label:'¿Tiene diagnóstico de enfermedad tiroidea?', options:['No','Hipotiroidismo','Hipertiroidismo','Tiroiditis de Hashimoto','Enfermedad de Graves','Nódulo tiroideo','Bocio simple','Otro'] },
      { id:'s4q2', type:'multiopt', label:'Síntomas que sugieren hipotiroidismo', options:['Cansancio extremo','Intolerancia al frío','Aumento de peso sin razón','Estreñimiento persistente','Piel seca y áspera','Caída excesiva de cabello','Pulso lento','Estado de ánimo depresivo','Ninguno'] },
      { id:'s4q3', type:'multiopt', label:'Síntomas que sugieren hipertiroidismo', options:['Nerviosismo o ansiedad intensa','Intolerancia al calor','Pérdida de peso sin dieta','Palpitaciones o taquicardia','Temblor fino de manos','Sudoración excesiva','Insomnio','Ninguno'] },
      { subsection: 'Glucosa y diabetes' },
      { id:'s4q4', type:'opts', label:'¿Tiene diagnóstico de diabetes o prediabetes?', options:['No','Prediabetes','Diabetes tipo 1','Diabetes tipo 2','Resistencia a la insulina'] },
      { id:'s4q5', type:'opts', label:'Glucosa en ayunas (último valor conocido)', options:['No lo conozco','Normal (menos de 100 mg/dL)','Prediabetes (100-125 mg/dL)','Diabetes (126 mg/dL o más)'] },
      { id:'s4q6', type:'multiopt', label:'Síntomas de alteración en glucosa', options:['Sed excesiva','Orina frecuente y abundante','Hambre constante','Visión borrosa episódica','Heridas que tardan en cicatrizar','Hormigueo en manos o pies','Ninguno'] },
      { subsection: 'Hormonas sexuales — Mujeres' },
      { id:'s4q7', type:'opts', label:'Estado menstrual actual', options:['Regular y predecible','Irregular','Amenorrea','Menopausia establecida','Perimenopausia','No aplica'] },
      { id:'s4q8', type:'multiopt', label:'Síntomas menstruales', options:['Cólicos intensos','Sangrado abundante','Ciclos muy cortos (menos de 21 días)','Ciclos muy largos (más de 35 días)','Síndrome premenstrual severo','Ninguno / No aplica'] },
      { id:'s4q9', type:'opts', label:'¿Ha tenido diagnóstico de SOP?', options:['Sí','No','En estudio','No aplica'] },
      { subsection: 'Hormonas sexuales — Hombres' },
      { id:'s4q10', type:'multiopt', label:'Síntomas de déficit de testosterona', options:['Disminución de libido','Disfunción eréctil','Fatiga inexplicable','Pérdida de masa muscular','Aumento de grasa abdominal','Depresión o irritabilidad','Ninguno / No aplica'] },
      { subsection: 'Vitamina D' },
      { id:'s4q11', type:'opts', label:'¿Ha medido su nivel de vitamina D?', options:['No','Sí, deficiente (menos de 20 ng/mL)','Sí, insuficiente (20-29 ng/mL)','Sí, normal (30 ng/mL o más)'] },
      { id:'s4q12', type:'text', label:'Otros síntomas hormonales que quiera mencionar' },
    ]
  },
  {
    num: 5, icon: '🦠',
    title: 'Función Digestiva y Microbiota',
    subtitle: 'Esófago, estómago, intestino, hígado y microbiota',
    questions: [
      { subsection: 'Síntomas digestivos altos' },
      { id:'s5q1', type:'multiopt', label:'Síntomas digestivos altos', options:['Acidez o reflujo frecuente','Regurgitación ácida','Dolor o quemazón en epigastrio','Dificultad para tragar (disfagia)','Sensación de llenura precoz','Náuseas frecuentes','Vómito recurrente','Ninguno'] },
      { id:'s5q2', type:'opts', label:'¿Tiene diagnóstico de gastritis, úlcera o ERGE?', options:['No','Gastritis','Úlcera péptica','ERGE (reflujo gastroesofágico)','Hernia hiatal','Otro'] },
      { subsection: 'Síntomas digestivos bajos' },
      { id:'s5q3', type:'opts', label:'Hábito intestinal predominante', options:['Regular (1 vez al día)','Estreñimiento crónico (menos de 3/semana)','Diarrea frecuente','Alternancia estreñimiento/diarrea','Variable'] },
      { id:'s5q4', type:'multiopt', label:'Síntomas digestivos bajos', options:['Dolor o cólico abdominal frecuente','Distensión o hinchazón abdominal','Flatulencia excesiva','Sangre en heces','Moco en heces','Heces de color anormal','Urgencia para defecar','Sensación de evacuación incompleta','Ninguno'] },
      { id:'s5q5', type:'opts', label:'¿Tiene diagnóstico de SII, Crohn o colitis?', options:['No','Síndrome de intestino irritable (SII)','Enfermedad de Crohn','Colitis ulcerosa','Colitis microscópica','Otro'] },
      { subsection: 'Hígado y vesícula' },
      { id:'s5q6', type:'opts', label:'¿Tiene diagnóstico de hígado graso, hepatitis u otro?', options:['No','Hígado graso no alcohólico (NAFLD)','Hepatitis B','Hepatitis C','Cirrosis','Cálculos en vesícula','Otro'] },
      { subsection: 'Intolerencias y alergias alimentarias' },
      { id:'s5q7', type:'multiopt', label:'Intolerancias o alergias alimentarias diagnosticadas', options:['Intolerancia a la lactosa','Celiaquía (intolerancia al gluten)','Sensibilidad al gluten no celíaca','Alergia a frutos secos','Alergia a mariscos','Fructosa / sorbitol','Ninguna conocida'] },
      { id:'s5q8', type:'text', label:'Otros síntomas digestivos relevantes' },
    ]
  },
  {
    num: 6, icon: '🛡️',
    title: 'Sistema Inmune e Inflamación',
    subtitle: 'Autoinmunidad, alergias, infecciones recurrentes e inflamación crónica',
    questions: [
      { subsection: 'Enfermedades autoinmunes' },
      { id:'s6q1', type:'opts', label:'¿Tiene diagnóstico de enfermedad autoinmune?', options:['No','Lupus eritematoso sistémico','Artritis reumatoide','Esclerosis múltiple','Psoriasis','Tiroiditis de Hashimoto','Enfermedad de Graves','Síndrome de Sjögren','Otra'] },
      { subsection: 'Alergias e hipersensibilidades' },
      { id:'s6q2', type:'opts', label:'¿Tiene alergias diagnosticadas?', options:['No','Sí, rinitis alérgica','Sí, asma alérgica','Sí, alergia a alimentos','Sí, alergia a medicamentos','Sí, múltiples alergias'] },
      { id:'s6q3', type:'multiopt', label:'Síntomas alérgicos frecuentes', options:['Estornudos en salvas','Picor nasal u ocular','Ojos llorosos y rojos','Urticaria (ronchas en piel)','Angioedema (hinchazón de labios o párpados)','Reacción anafiláctica previa','Ninguno'] },
      { subsection: 'Infecciones recurrentes' },
      { id:'s6q4', type:'multiopt', label:'Infecciones que se repiten con frecuencia', options:['Infecciones respiratorias altas (resfriados)','Otitis','Sinusitis','Amigdalitis / faringitis','Infecciones urinarias','Infecciones por hongos (candidiasis)','Herpes labial recurrente','Ninguna'] },
      { subsection: 'Inflamación crónica' },
      { id:'s6q5', type:'multiopt', label:'Síntomas de inflamación crónica sistémica', options:['Dolor articular generalizado','Rigidez matutina mayor a 1 hora','Fatiga vinculada a inflamación','Febrícula recurrente','Ganglios inflamados sin infección','Respuesta exagerada a pequeñas lesiones','Ninguno'] },
      { subsection: 'COVID-19' },
      { id:'s6q6', type:'opts', label:'¿Tuvo COVID-19 confirmado?', options:['No','Sí, cuadro leve','Sí, cuadro moderado','Sí, cuadro grave (hospitalizado)','Sospecha, no confirmado'] },
      { id:'s6q7', type:'multiopt', label:'Síntomas de COVID largo (más de 3 meses)', options:['Fatiga persistente','Niebla mental','Disnea persistente','Pérdida de olfato o gusto','Intolerancia al esfuerzo','Ninguno / No aplica'] },
      { id:'s6q8', type:'text', label:'Otros aspectos inmunes o inflamatorios relevantes' },
    ]
  },
  {
    num: 7, icon: '🧠',
    title: 'Salud Neurológica y Cognitiva',
    subtitle: 'Cerebro, memoria, salud mental y sistema nervioso',
    questions: [
      { subsection: 'Función cognitiva' },
      { id:'s7q1', type:'scale', label:'¿Cómo califica su memoria y función cognitiva?', min:1, max:10, minLabel:'Muy deteriorada', maxLabel:'Excelente' },
      { id:'s7q2', type:'multiopt', label:'Síntomas cognitivos', options:['Olvidos frecuentes de palabras o nombres','Dificultad para concentrarse','Niebla mental (brain fog)','Lentitud para procesar información','Confusión o desorientación episódica','Pérdida frecuente de objetos','Ninguno'] },
      { subsection: 'Salud mental' },
      { id:'s7q3', type:'opts', label:'¿Tiene diagnóstico de trastorno mental?', options:['No','Depresión mayor','Trastorno de ansiedad generalizada','Trastorno bipolar','TOC','TEPT','TDAH','Trastorno de pánico','Otro'] },
      { id:'s7q4', type:'scale', label:'Estado de ánimo promedio (último mes)', min:1, max:10, minLabel:'Muy deprimido', maxLabel:'Muy positivo' },
      { id:'s7q5', type:'scale', label:'Nivel de ansiedad promedio (último mes)', min:1, max:10, minLabel:'Sin ansiedad', maxLabel:'Ansiedad extrema' },
      { id:'s7q6', type:'multiopt', label:'Síntomas de estado de ánimo', options:['Tristeza persistente','Pérdida de placer (anhedonia)','Desesperanza','Irritabilidad intensa','Ataques de pánico','Pensamientos intrusivos','Aislamiento social','Ninguno'] },
      { subsection: 'Cefalea y dolor neuropático' },
      { id:'s7q7', type:'opts', label:'¿Sufre de cefaleas frecuentes?', options:['No tengo cefaleas','Ocasionales (menos de 1/mes)','Frecuentes (1-3/semana)','Crónicas (más de 15 días/mes)'] },
      { id:'s7q8', type:'multiopt', label:'Tipo de cefalea', options:['Tensional (presión bilateral)','Migraña (pulsátil con náusea)','En racimo (muy intensa periocular)','Cervicogénica','No tengo / No lo sé'] },
      { id:'s7q9', type:'multiopt', label:'Síntomas neuropáticos', options:['Hormigueo en manos o pies','Ardor o quemazón en extremidades','Calambres nocturnos','Dolor eléctrico o punzante','Temblor en reposo','Debilidad muscular focal','Ninguno'] },
      { id:'s7q10', type:'text', label:'Otros síntomas neurológicos o cognitivos relevantes' },
    ]
  },
];
