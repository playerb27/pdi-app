/**
 * Shared biomarker utilities — used by EvolutionCharts, BiomarkerMasterTable, and patient profile page.
 * CANONICAL_ALIASES: ordered list of [regex, canonicalName].
 *   - More specific rules MUST come before less specific ones (e.g. HOMA-IR before Insulina).
 *   - Empty canonical = suffix stripper applied after all named rules.
 */

const CANONICAL_ALIASES: [RegExp, string][] = [

  // ════════════════════════════════════════════════════════════════════════════
  // METABOLISMO GLUCÍDICO — más específico primero
  // ════════════════════════════════════════════════════════════════════════════
  [/hemoglobina\s*gl[iy]c[ao]s?[iy]?lada/i,          'HbA1c'],
  [/hemoglobina\s*glicada/i,                           'HbA1c'],
  [/hb\s*a\s*1\s*c/i,                                 'HbA1c'],
  [/\ba1c\b/i,                                         'HbA1c'],

  [/\b(índice\s*)?homa[\s\-]*(ir|\d)?\b/i,            'HOMA-IR'],
  [/resistencia\s*(a\s*la\s*)?insulina\s*(homa|ir)?/i,'HOMA-IR'],
  [/índice\s*de\s*resistencia\s*a\s*la\s*insulina/i,  'HOMA-IR'],

  [/insulina\s*(basal|en\s*ayuno|en\s*sangre|s[eé]rica|en\s*suero)?/i, 'Insulina'],
  [/p[eé]ptido\s*c\b/i,                               'Péptido C'],

  [/glucosa\s*(basal|en\s*ayuno|en\s*sangre|en\s*suero|s[eé]rica|capilar)?/i, 'Glucosa'],

  // ════════════════════════════════════════════════════════════════════════════
  // LÍPIDOS
  // ════════════════════════════════════════════════════════════════════════════
  [/colesterol\s*ldl\s*(calculado|directo|de\s*baja\s*densidad)?/i,    'Colesterol LDL'],
  [/ldl[\s\-]?colesterol/i,                                             'Colesterol LDL'],
  [/lipoprote[íi]nas?\s*de\s*baja\s*densidad/i,                        'Colesterol LDL'],
  [/\bldl\b/i,                                                          'Colesterol LDL'],

  [/colesterol\s*hdl\s*(de\s*alta\s*densidad)?/i,                      'Colesterol HDL'],
  [/hdl[\s\-]?colesterol/i,                                             'Colesterol HDL'],
  [/lipoprote[íi]nas?\s*de\s*alta\s*densidad/i,                        'Colesterol HDL'],
  [/\bhdl\b/i,                                                          'Colesterol HDL'],

  [/colesterol\s*vldl/i,                                                'Colesterol VLDL'],
  [/colesterol\s*de\s*muy\s*baja\s*densidad/i,                         'Colesterol VLDL'],
  [/\bvldl\b/i,                                                         'Colesterol VLDL'],

  [/colesterol\s*total/i,                                               'Colesterol Total'],
  [/colesterol\s*(en\s*sangre|en\s*suero|s[eé]rico)?$/i,               'Colesterol Total'],

  [/triglic[eé]ridos?\s*(en\s*sangre|en\s*suero|s[eé]ricos?)?/i,       'Triglicéridos'],
  [/\btg\b/i,                                                            'Triglicéridos'],

  [/[íi]ndice\s*(aterog[eé]nico|colesterol[\/\s]hdl|de\s*riesgo\s*cardiovascular)/i, 'Índice Aterogénico'],
  [/colesterol\s*total\s*[\/]\s*hdl/i,                                 'Índice Aterogénico'],

  [/lipoprote[íi]na\s*[\(]?a[\)]?\s*(?:peque[nñ]a)?|lp\s*[\(]?a[\)]?/i, 'Lipoproteína (a)'],
  [/apolipoprote[íi]na\s*a[\s\-]?1?|apo\s*a[\s\-]?1?\b/i,             'Apolipoproteína A1'],
  [/apolipoprote[íi]na\s*b[\s\-]?100?|apo\s*b\b/i,                    'Apolipoproteína B'],
  [/colesterol\s*no[\s\-]?hdl|non[\s\-]?hdl/i,                        'Colesterol No-HDL'],

  // ════════════════════════════════════════════════════════════════════════════
  // FUNCIÓN HEPÁTICA
  // ════════════════════════════════════════════════════════════════════════════
  [/transaminasa\s*(glutámico\s*)?oxal[ao]c[eé]tica|tgo|ast\b/i,      'AST (TGO)'],
  [/aspartato\s*(amino)?transferasa/i,                                  'AST (TGO)'],

  [/transaminasa\s*(glutámico\s*)?p[iy]r[úu]vica|tgp|alt\b/i,         'ALT (TGP)'],
  [/alanina\s*(amino)?transferasa/i,                                    'ALT (TGP)'],

  [/gamma[\s\-]?gt|ggt|gamma\s*glutamil\s*transpeptidasa/i,            'GGT'],
  [/gamma\s*glutamil\s*transfer[ae]sa/i,                               'GGT'],

  [/fosfatasa\s*alcalina/i,                                             'Fosfatasa Alcalina'],
  [/\bfa\b.*alcalin/i,                                                  'Fosfatasa Alcalina'],
  [/\bap\b.*alkaline/i,                                                 'Fosfatasa Alcalina'],

  [/bilirrubina\s*directa/i,                                            'Bilirrubina Directa'],
  [/bilirrubina\s*conjugada/i,                                          'Bilirrubina Directa'],
  [/bilirrubina\s*indirecta/i,                                          'Bilirrubina Indirecta'],
  [/bilirrubina\s*no\s*conjugada/i,                                     'Bilirrubina Indirecta'],
  [/bilirrubina\s*total/i,                                              'Bilirrubina Total'],

  [/prote[íi]nas?\s*totales?\s*(en\s*sangre|en\s*suero)?/i,            'Proteínas Totales'],
  [/albúmina\s*(en\s*sangre|en\s*suero|s[eé]rica)?/i,                 'Albúmina'],
  [/\bglobulina\b\s*(en\s*sangre|en\s*suero)?/i,                        'Globulina'],
  [/relaci[oó]n\s*alb[uú]mina[\s\/\-]globulina/i,                      'Relación Albúmina/Globulina'],

  [/deshidrogenasa\s*l[aá]ctica|dhl|ldh\b/i,                          'LDH'],

  // ════════════════════════════════════════════════════════════════════════════
  // FUNCIÓN RENAL
  // ════════════════════════════════════════════════════════════════════════════
  // ── Ratios (MUST come before generic "Creatinina" rule to avoid false match) ──
  [/relaci[oó]n\s*(bun|nitrógeno\s*ur[eé]ico)[\/\s\-]+creatinina/i,    'Relación BUN/Creatinina'],
  [/relaci[oó]n\s*urea[\/\s\-]+creatinina/i,                            'Relación Urea/Creatinina'],
  [/bun[\/\s\-]+creatinina/i,                                            'Relación BUN/Creatinina'],
  [/relaci[oó]n\s*albúmina[\s\/\-]creatinina/i,                        'Relación Albúmina/Creatinina'],
  [/relaci[oó]n\s*creatinina[\s\/\-]albúmina/i,                        'Relación Albúmina/Creatinina'],
  // ── Individual creatinine markers ────────────────────────────────────────
  [/creatinina\s*en\s*orina|creatinuria/i,                              'Creatinina en Orina'],
  [/creatinina\s*(en\s*sangre|s[eé]rica|en\s*suero)?/i,                'Creatinina'],
  [/nitrógeno\s*ur[eé]ico|bun\b/i,                                      'BUN'],
  [/urea\s*(en\s*sangre|s[eé]rica)?/i,                                  'Urea'],
  [/[aá]cido\s*[uú]rico\s*(en\s*sangre|s[eé]rico)?/i,                 'Ácido Úrico'],
  [/uricemia/i,                                                           'Ácido Úrico'],
  [/tasa\s*de\s*filtraci[oó]n\s*glomerular|tfg|gfr\b/i,               'Filtración Glomerular'],
  [/microalb[uú]minuria/i,                                               'Microalbuminuria'],
  [/cistatina\s*c\b/i,                                                   'Cistatina C'],
  [/prote[íi]nas?\s*en\s*orina|proteinuria/i,                           'Proteínas en Orina'],
  [/glucosa\s*en\s*orina|glucosuria/i,                                   'Glucosa en Orina'],
  [/bicarbonato|co2\s*(total|en\s*sangre|plasm[aá]tico)?/i,            'Bicarbonato'],

  // ════════════════════════════════════════════════════════════════════════════
  // BIOMETRÍA HEMÁTICA (CBC) — HbA1c ya está arriba; va antes de Hemoglobina
  // ════════════════════════════════════════════════════════════════════════════
  [/hemoglobina\b(?!\s*gl[iy])/i,                                       'Hemoglobina'],
  [/\bhgb\b|\bhb\b(?!\s*a)/i,                                           'Hemoglobina'],

  [/hematocrito/i,                                                       'Hematocrito'],
  [/\bhct\b|\bpvc\b/i,                                                   'Hematocrito'],

  [/eritrocitos?|glóbulos?\s*rojos?|eritrocitometría/i,                 'Eritrocitos'],
  [/\bgrbc?\b|\brbc\b/i,                                                 'Eritrocitos'],

  [/volumen\s*corpuscular\s*medio|vcm\b|mcv\b/i,                        'VCM'],
  [/hemoglobina\s*corpuscular\s*media\b|hcm\b|mch\b/i,                 'HCM'],
  [/concentraci[oó]n\s*de\s*hemoglobina\s*corpuscular\s*media|chcm\b|mchc\b/i, 'CHCM'],
  [/amplitud\s*de\s*distribuci[oó]n\s*(eritrocitaria|de\s*eritrocitos)|aderm?\b|rdw\b/i, 'RDW'],

  [/leucocitos?|glóbulos?\s*blancos?|c[eé]lulas?\s*blancas?/i,         'Leucocitos'],
  [/\bwbc\b|\bgb\b(?!\d)/i,                                              'Leucocitos'],

  [/neutr[oó]filos?\s*(absolutos?|relativos?|en\s*sangre)?|segmentados?/i, 'Neutrófilos'],
  [/linfocitos?\s*(absolutos?|relativos?)?/i,                           'Linfocitos'],
  [/monocitos?\s*(absolutos?|relativos?)?/i,                            'Monocitos'],
  [/eosin[oó]filos?\s*(absolutos?|relativos?)?/i,                      'Eosinófilos'],
  [/bas[oó]filos?\s*(absolutos?|relativos?)?/i,                        'Basófilos'],
  [/bandas?\s*(absolutos?|relativos?)?/i,                               'Bandas'],

  [/plaquetas?|trombocitos?/i,                                          'Plaquetas'],
  [/\bplt\b/i,                                                           'Plaquetas'],
  [/volumen\s*plaquetario\s*medio|vpm\b|mpv\b/i,                       'Volumen Plaquetario Medio'],
  [/amplitud\s*de\s*distribuci[oó]n\s*(plaquetaria|de\s*plaquetas)|adp\b|pdw\b/i, 'PDW'],

  [/reticulocitos?\s*(absolutos?|relativos?|en\s*sangre)?/i,           'Reticulocitos'],

  // ════════════════════════════════════════════════════════════════════════════
  // ELECTROLITOS Y MINERALES
  // ════════════════════════════════════════════════════════════════════════════
  // ── Urine electrolytes — MUST come BEFORE serum rules ──────────────────────
  // Without these, "Sodio en Orina" would match the generic /sodio.../i rule
  // (optional suffix) and end up plotted on the same chart as serum Sodio.
  [/sodio\s*en\s*orina|sodio\s*urinario/i,                             'Sodio en Orina'],
  [/potasio\s*en\s*orina|potasio\s*urinario/i,                        'Potasio en Orina'],
  [/cloro\s*en\s*orina|cloruro\s*en\s*orina/i,                       'Cloruro en Orina'],
  [/calcio\s*en\s*orina|calciuria/i,                                   'Calcio en Orina'],
  [/f[oó]sforo\s*en\s*orina|fosfaturia/i,                            'Fósforo en Orina'],
  [/magnesio\s*en\s*orina|magnesiuria/i,                              'Magnesio en Orina'],
  [/urea\s*en\s*orina|urea\s*urinaria/i,                              'Urea en Orina'],

  // ── Serum electrolytes ─────────────────────────────────────────────────────
  [/sodio\s*(en\s*sangre|s[eé]rico|plasm[aá]tico)?/i,                 'Sodio'],
  [/\bna\+?\b/i,                                                        'Sodio'],
  [/potasio\s*(en\s*sangre|s[eé]rico|plasm[aá]tico)?/i,              'Potasio'],
  [/\bk\+?\b(?!\s*a)/i,                                                 'Potasio'],
  [/cloro|cloruro\s*(en\s*sangre|s[eé]rico)?/i,                       'Cloruro'],
  [/\bcl\-?\b/i,                                                        'Cloruro'],
  [/calcio\s*(total|ionizado|en\s*sangre|s[eé]rico)?/i,              'Calcio'],
  [/\bca\+?\+?\b/i,                                                     'Calcio'],
  [/f[oó]sforo\s*(en\s*sangre|s[eé]rico)?|fosfato/i,                 'Fósforo'],
  [/magnesio\s*(en\s*sangre|s[eé]rico)?/i,                            'Magnesio'],
  [/\bmg\b/i,                                                           'Magnesio'],
  [/zinc\s*(en\s*sangre|s[eé]rico)?/i,                                'Zinc'],
  [/\bzn\b/i,                                                           'Zinc'],
  [/cobre\s*(en\s*sangre|s[eé]rico)?/i,                               'Cobre'],
  [/selenio\s*(en\s*sangre|s[eé]rico)?/i,                             'Selenio'],

  // ════════════════════════════════════════════════════════════════════════════
  // HIERRO Y ANEMIA
  // ════════════════════════════════════════════════════════════════════════════
  [/capacidad\s*(total)?\s*de\s*uni[oó]n\s*(al|del)\s*hierro|tibc|uibc/i, 'TIBC'],
  [/saturaci[oó]n\s*de\s*transferrina/i,                               'Saturación de Transferrina'],
  [/transferrina\s*(en\s*sangre|s[eé]rica)?/i,                        'Transferrina'],
  [/ferritina\s*(en\s*sangre|s[eé]rica)?/i,                           'Ferritina'],
  [/hierro\s*(s[eé]rico|en\s*sangre|total)?/i,                        'Hierro'],
  [/\bfe\b/i,                                                           'Hierro'],

  // ════════════════════════════════════════════════════════════════════════════
  // TIROIDES
  // ════════════════════════════════════════════════════════════════════════════
  [/tsh\s*(ultrasensible|ultra\s*sensible|hs|alta\s*sensibilidad|3\s*[aª]\s*generaci[oó]n)?/i, 'TSH'],
  [/hormona\s*estimulante\s*(de\s*la\s*)?tiroides?(\s*\(tsh\))?/i,   'TSH'],
  [/tirotropina/i,                                                      'TSH'],
  [/thyroid\s*stimulating\s*hormone/i,                                 'TSH'],

  [/triyodotironina\s*libre(\s*\(ft3\))?/i,                           'T3 Libre (FT3)'],
  [/t3\s*libre/i,                                                       'T3 Libre (FT3)'],
  [/\bft3\b/i,                                                          'T3 Libre (FT3)'],

  [/triyodotironina\s*(t3\s*total|total)?/i,                           'T3 Total'],
  [/t3\s*total/i,                                                       'T3 Total'],
  [/\bt3\b(?!\s*(libre|l\b))/i,                                        'T3 Total'],

  [/tiroxina\s*libre(\s*\(ft4\))?/i,                                   'T4 Libre (FT4)'],
  [/t4\s*libre/i,                                                       'T4 Libre (FT4)'],
  [/\bft4\b/i,                                                          'T4 Libre (FT4)'],
  [/thyroxine\s*free/i,                                                 'T4 Libre (FT4)'],

  [/tiroxina\s*(t4\s*total|total)?\s*\**/i,                            'T4 Total'],
  [/t4\s*total/i,                                                       'T4 Total'],
  [/\bt4\b(?!\s*(libre|l\b))/i,                                        'T4 Total'],

  [/anti[\s\-]?(tpo|peroxidasa\s*tiroidea|tiroperoxidasa)/i,          'Anti-TPO'],
  [/anticuerpos?\s*(anti[\s\-]?)?tiroglobulina/i,                     'Anti-Tiroglobulina'],
  [/tiroglobulina\b/i,                                                  'Tiroglobulina'],

  // ════════════════════════════════════════════════════════════════════════════
  // HORMONAS SEXUALES Y SUPRARRENALES
  // ════════════════════════════════════════════════════════════════════════════
  [/cortisol\s*(matutino|am|8\s*:?\s*am|basal|en\s*sangre|s[eé]rico)?/i, 'Cortisol'],
  [/dhea[\s\-]?s|deshidroepiandrosterona\s*sulfato?/i,                'DHEA-S'],
  [/\bdhea\b(?![\s\-]?s)/i,                                            'DHEA'],
  [/androstenediona/i,                                                  'Androstenediona'],
  [/globulina\s*fijadora\s*de\s*hormonas?\s*sexuales?|shbg\b/i,      'SHBG'],
  [/parathormona|hormona\s*paratiroidea|pth\b/i,                       'PTH (Parathormona)'],
  [/aldosterona/i,                                                      'Aldosterona'],
  [/renina\s*(activa|plasm[aá]tica)?/i,                                'Renina'],
  [/hormona\s*de\s*crecimiento|somatotropina|\bgh\b/i,               'Hormona del Crecimiento (GH)'],
  [/factor\s*de\s*crecimiento\s*insulínico|igf[\s\-]?1/i,            'IGF-1'],
  [/testosterona\s*(total|libre|bio?disponible)?\s*(en\s*sangre|s[eé]rica)?/i, 'Testosterona'],
  [/estradiol|e2\b/i,                                                   'Estradiol'],
  [/estriol\b|e3\b/i,                                                   'Estriol'],
  [/progesterona\s*(en\s*sangre|s[eé]rica)?/i,                        'Progesterona'],
  [/\blh\b|hormona\s*luteinizante/i,                                   'LH'],
  [/\bfsh\b|hormona\s*folículo[\s\-]estimulante/i,                    'FSH'],
  [/prolactina\s*(en\s*sangre|s[eé]rica)?/i,                          'Prolactina'],
  [/estrona\b/i,                                                        'Estrona'],
  [/melatonina/i,                                                       'Melatonina'],

  // ════════════════════════════════════════════════════════════════════════════
  // INFLAMACIÓN Y COAGULACIÓN
  // ════════════════════════════════════════════════════════════════════════════
  [/pcr\s*(ultra\s*sensible|ultrasensible|us|hs|alta\s*sensibilidad)/i, 'PCR Ultrasensible'],
  [/prote[íi]na\s*c\s*reactiva\s*(ultra\s*sensible|ultrasensible)?/i, 'PCR'],
  [/\bpcr\b(?!\s*(ultra|us|hs))/i,                                     'PCR'],
  [/velocidad\s*de\s*sedimentaci[oó]n\s*(globular|eritrocitaria)|vsg\b|esr\b/i, 'VSG'],
  [/homociste[íi]na\s*(en\s*sangre|plasm[aá]tica)?/i,                'Homocisteína'],
  [/fibrin[oó]geno\s*(en\s*plasma)?/i,                                'Fibrinógeno'],
  [/tiempo\s*de\s*protrombina|tp\b|inr\b/i,                           'Tiempo de Protrombina / INR'],
  [/tiempo\s*(parcial|de)\s*(tromboplastina|tromboplas)/i,            'TTP'],
  [/\baptt\b|\bttpa\b/i,                                               'TTP'],
  [/d[\s\-]?d[íi]mero/i,                                              'D-Dímero'],
  [/interleucina[\s\-]?6|il[\s\-]?6\b/i,                             'IL-6'],
  [/factor\s*de\s*necrosis\s*tumoral|tnf/i,                           'TNF-α'],
  [/procalcitonina|pct\b/i,                                            'Procalcitonina'],
  [/[aá]cido\s*l[aá]ctico|lactato/i,                                  'Lactato'],
  [/am[oó]niaco|am[oó]nio|amonia\b/i,                                 'Amonio'],
  [/osmolaridad\s*(s[eé]rica|plasm[aá]tica|calculada)?/i,             'Osmolaridad'],
  [/nt[\s\-]?probnp|pro[\s\-]?bnp/i,                                  'NT-proBNP'],
  [/\bbnp\b|p[eé]ptido\s*natriur[eé]tico/i,                          'BNP'],

  // ════════════════════════════════════════════════════════════════════════════
  // VITAMINAS
  // ════════════════════════════════════════════════════════════════════════════
  [/vitamina\s*d\s*[\[\(]?\s*25[\s\-]*hidro[xq]i?\s*[\]\)]?/i,       'Vitamina D 25-Hidroxi'],
  [/25[\s\-]*(oh|hidro[xq]i)\s*(vitamina\s*d\s*3?|d\s*3?)?/i,        'Vitamina D 25-Hidroxi'],
  [/calcifediol/i,                                                      'Vitamina D 25-Hidroxi'],
  [/vitamina\s*d\s*(en\s*sangre|s[eé]rica)?\s*$/i,                   'Vitamina D 25-Hidroxi'],

  [/vitamina\s*b\s*12\s*(en\s*sangre|s[eé]rica)?/i,                  'Vitamina B12'],
  [/cobalamina/i,                                                       'Vitamina B12'],

  [/[aá]cido\s*f[oó]lico\s*(en\s*sangre|s[eé]rico)?/i,              'Ácido Fólico'],
  [/folato\s*(en\s*sangre|gl[oó]bulos?\s*rojos?)?/i,                 'Ácido Fólico'],
  [/vitamina\s*b\s*9/i,                                                'Ácido Fólico'],

  [/vitamina\s*b\s*1\b|tiamina/i,                                     'Vitamina B1'],
  [/vitamina\s*b\s*2\b|riboflavina/i,                                 'Vitamina B2'],
  [/vitamina\s*b\s*3\b|niacina|[aá]cido\s*nic[oó]tinico/i,          'Vitamina B3 (Niacina)'],
  [/vitamina\s*b\s*6\b|piridoxina/i,                                  'Vitamina B6'],
  [/biotina|vitamina\s*b\s*7\b|vitamina\s*h\b/i,                     'Biotina (B7)'],
  [/vitamina\s*c\b|[aá]cido\s*asc[oó]rbico/i,                       'Vitamina C'],
  [/vitamina\s*e\b|tocoferol/i,                                        'Vitamina E'],
  [/vitamina\s*a\b|retinol/i,                                          'Vitamina A'],
  [/vitamina\s*k[\s\-]?[12]?\b|filoquinona|menaquinona/i,            'Vitamina K'],

  // ════════════════════════════════════════════════════════════════════════════
  // MARCADORES TUMORALES
  // ════════════════════════════════════════════════════════════════════════════
  [/psa\s*libre/i,                                                      'PSA Libre'],
  [/psa\s*total|ant[íi]geno\s*prost[aá]tico\s*específico/i,          'PSA'],
  [/\bcea\b|ant[íi]geno\s*carcinoembri[oó]nario/i,                   'CEA'],
  [/\bca[\s\-]?19[\s\-]?9\b/i,                                        'CA 19-9'],
  [/\bca[\s\-]?125\b/i,                                               'CA 125'],
  [/\bca[\s\-]?15[\s\-]?3\b/i,                                        'CA 15-3'],
  [/alfa[\s\-]?fetoprote[íi]na|afp\b/i,                              'AFP'],
  [/beta[\s\-]?(hcg|gonadotropina\s*cori[oó]nica|gonodotropina\s*cori[oó]nica)/i, 'Beta-HCG'],
  [/hormona\s*gonadotropina\s*cori[oó]nica|\bhcg\b(?!.*beta)/i,      'HCG'],
  [/\bca[\s\-]?72[\s\-]?4\b/i,                                        'CA 72-4'],
  [/\bca[\s\-]?27[\s\-]?29\b/i,                                       'CA 27-29'],
  [/[eé]nolasa\s*neuro.*específica|nse\b/i,                           'NSE'],
  [/tirosin\s*cinasa|tiroglobulina\s*serica/i,                        'Tiroglobulina'],

  // ════════════════════════════════════════════════════════════════════════════
  // PÁNCREAS Y DIGESTIVO
  // ════════════════════════════════════════════════════════════════════════════
  [/amilasa\s*(en\s*sangre|s[eé]rica|pancre[aá]tica)?/i,             'Amilasa'],
  [/lipasa\s*(en\s*sangre|pancre[aá]tica)?/i,                         'Lipasa'],
  [/elastasa[\s\-]?1|elastasa\s*pancre[aá]tica/i,                    'Elastasa Pancreática'],

  // ════════════════════════════════════════════════════════════════════════════
  // MARCADORES CARDÍACOS
  // ════════════════════════════════════════════════════════════════════════════
  [/troponina\s*i\b/i,                                                 'Troponina I'],
  [/troponina\s*t\b/i,                                                 'Troponina T'],
  [/troponina\b(?!\s*[it])/i,                                          'Troponina'],
  [/creatincinasa[\s\-]?mb|ck[\s\-]?mb|cpk[\s\-]?mb/i,              'CK-MB'],
  [/creatincinasa|creatinfosfoc[iy]nasa|\bck\b|\bcpk\b(?!.*mb)/i,    'CK (Creatincinasa)'],
  [/mioglobina/i,                                                       'Mioglobina'],

  // ════════════════════════════════════════════════════════════════════════════
  // INMUNOLOGÍA
  // ════════════════════════════════════════════════════════════════════════════
  [/\biga\b|inmunoglobulina\s*a\b/i,                                'IgA'],
  [/\bige\b|inmunoglobulina\s*e\b/i,                                'IgE'],
  [/\bigm\b|inmunoglobulina\s*m\b/i,                                'IgM'],
  [/\bigg\b|inmunoglobulina\s*g\b/i,                                'IgG'],

  [/factor\s*reumatoide/i,                                             'Factor Reumatoide'],
  [/anti[\s\-]?ccp|anticuerpos?\s*anti[\s\-]?citrulina/i,            'Anti-CCP'],
  [/ana\b|anticuerpos?\s*antinucleares?/i,                            'ANA'],

  // ════════════════════════════════════════════════════════════════════════════
  // SUFIJOS GENÉRICOS — se aplican si ninguna regla anterior hizo match
  // ════════════════════════════════════════════════════════════════════════════
  [/\s+(en\s+sangre|en\s+suero|en\s+plasma|s[eé]ric[oa]|plasm[aá]tic[oa])\s*$/i, ''],
  [/\s*(basal|total)\s*$/i, ''],
  [/\s*\*{1,3}\s*$/i, ''],
];

// ─── Normalize ──────────────────────────────────────────────────────────────
export function normalizeBiomarkerName(raw: string): string {
  const trimmed = raw.trim();
  for (const [pattern, canonical] of CANONICAL_ALIASES) {
    if (canonical !== '' && pattern.test(trimmed)) return canonical;
  }
  // Apply suffix strippers
  let result = trimmed;
  for (const [pattern, replacement] of CANONICAL_ALIASES) {
    if (replacement === '') result = result.replace(pattern, '').trim();
  }
  return result || trimmed;
}

/** Converts any biomarker name into a DOM-safe ID fragment. */
export function biomarkerSafeId(name: string): string {
  return normalizeBiomarkerName(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function studyBiomarkerElementId(studyId: string, bmName: string): string {
  return `bm-study-${studyId}-${biomarkerSafeId(bmName)}`;
}

export function chartBiomarkerElementId(bmName: string): string {
  return `bm-chart-${biomarkerSafeId(bmName)}`;
}

export function tablaBiomarkerElementId(bmName: string): string {
  return `bm-tabla-${biomarkerSafeId(bmName)}`;
}
