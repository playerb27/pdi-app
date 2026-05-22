# Plan de Alineación de Biomarcadores y Automatización de Tabla Maestra (Copia de Seguridad)

Este es el plan aprobado. Cuando inicies la nueva sesión, pídele a la IA que lea este archivo `implementation_plan_temp.md` en la raíz del proyecto para continuar.

## Cambios Propuestos

### 1. Librería de Biomarcadores y Catálogo

#### [MODIFY] [biomarker-catalog.ts](file:///Users/federicobq/Library/Mobile%20Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI%20protocolo%20diagnostico%20integral/pdi-app/src/lib/biomarker-catalog.ts)
* Modificar los nombres del catálogo para alinearse con los retornos de normalización más limpios:
  * `'Nitrógeno de Urea (BUN)'` $\rightarrow$ `'BUN'`
  * `'TFG (MDRD/CKD-EPI)'` $\rightarrow$ `'Filtración Glomerular'`
  * `'Microalbuminuria (relación)'` $\rightarrow$ `'Microalbuminuria'`
  * `'Cloro'` $\rightarrow$ `'Cloro'`
  * `'Colesterol no-HDL'` $\rightarrow$ `'Colesterol No-HDL'`
  * `'Relación A/G'` $\rightarrow$ `'Relación Albúmina/Globulina'`
  * `'Eritrocitos (RBC)'` $\rightarrow$ `'Eritrocitos (RBC)'` (con regex actualizada)
  * `'ADE (RDW)'` $\rightarrow$ `'RDW'`
  * `'Leucocitos (WBC)'` $\rightarrow$ `'Leucocitos (WBC)'`
  * `'Hormona del Crecimiento'` $\rightarrow$ `'Hormona del Crecimiento (GH)'`
  * `'PTH'` $\rightarrow$ `'PTH (Parathormona)'`
  * `'Folato (B9)'` $\rightarrow$ `'Ácido Fólico'`
  * `'Interleucina-6 (IL-6)'` $\rightarrow$ `'IL-6'`
* Actualizar el campo `system` de cada biomarcador para mapear a los 14 sistemas oficiales PDI:
  * `Sistema Metabólico y Energético` (Glucosa, HbA1c, Insulina, HOMA-IR, Péptido C, Vitamina D 25-Hidroxi)
  * `Sistemas Renal, Respiratorio y Osteomuscular` (Urea, BUN, Creatinina, Relación BUN/Creatinina, Filtración Glomerular, Cistatina C, TFG por Cistatina C, Microalbuminuria, Ácido Úrico, Sodio, Potasio, Cloro, Calcio Total, Calcio Iónico, Magnesio, Fósforo)
  * `Salud Cardiovascular y Circulatoria` (Colesterol Total, Colesterol HDL, Colesterol LDL, Triglicéridos, Colesterol VLDL, Colesterol No-HDL, Índice Aterogénico, Relación LDL/HDL, sd LDL, Lípidos Totales, Fosfolípidos, PCR Ultrasensible, Homocisteína, Fibrinógeno)
  * `Desintoxicación y Estrés Oxidativo` (Bilirrubinas, ALT, AST, GGT, FA, Proteínas Totales, Albúmina, Globulinas, Relación A/G, LDH, Vit A, C, E, Zinc, Cobre)
  * `Sistema Inmune e Inflamación` (Hemoglobina, Hematocrito, Eritrocitos, Leucocitos, Neutrófilos, Linfocitos, Monocitos, Eosinófilos, Basófilos, Plaquetas, Hierro, Ferritina, Transferrina, TIBC, Saturación de Transferrina, PCR estándar, VSG, IL-6, FR, Anti-CCP, ANA, Inmunoglobulinas)
  * `Sistema Endocrino (Hormonal)` (TSH, T3/T4 libres y totales, Cortisol, Testosterona Total y Libre, DHEA-S, Prolactina, IGF-1, Hormona de Crecimiento, PTH)
  * `Salud Neurológica y Cognitiva` (Vitamina B12, Ácido Fólico, Vitamina B6)

#### [MODIFY] [biomarkers.ts](file:///Users/federicobq/Library/Mobile%20Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI%20protocolo%20diagnostico%20integral/pdi-app/src/lib/biomarkers.ts)
* Actualizar los mapeos regex en `CANONICAL_ALIASES`:
  * Corregir el retorno de `'Cloruro'` a `'Cloro'` y `'Cloruro en Orina'` a `'Cloro en Orina'`.
  * Modificar la regla de `'Globulina'` para devolver `'Globulinas'`.
  * Modificar `'Eritrocitos'` para devolver `'Eritrocitos (RBC)'`.
  * Modificar `'Leucocitos'` para devolver `'Leucocitos (WBC)'`.
  * Separar la regla genérica de `Calcio` en `Calcio Total` y `Calcio Iónico` usando expresiones regulares más precisas.
  * Separar la regla genérica de `Testosterona` en `Testosterona Total` y `Testosterona Libre`.
  * Añadir reglas explícitas para `Relación LDL/HDL`, `sd LDL (pequeñas densas)`, `Lípidos Totales`, `Fosfolípidos` y mejorar `Relación Albúmina/Globulina` (incluyendo soporte para "Relación A/G").

---

### 2. Backend (API)

#### [MODIFY] [route.ts (build-canonical)](file:///Users/federicobq/Library/Mobile%20Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI%20protocolo%20diagnostico%20integral/pdi-app/src/app/api/build-canonical/route.ts)
* Eliminar el mapa estático gigante `KNOWN_SYSTEM_MAP`.
* Importar `getCatalogEntry` de `@/lib/biomarker-catalog`.
* Dinámicamente asignar el sistema usando `getCatalogEntry(canonical)?.system ?? 'Otros Marcadores'`. Esto asegura consistencia total y elimina la duplicidad de mantenimiento.

---

### 3. Componentes Frontend y Vistas

#### [MODIFY] [EvolutionCharts.tsx](file:///Users/federicobq/Library/Mobile%20Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI%20protocolo%20diagnostico%20integral/pdi-app/src/components/EvolutionCharts.tsx)
* Modificar la inicialización de cada serie para que el campo `system` use `getCatalogEntry(canonicalName)?.system ?? (bm as any).canonical_system ?? bm.system ?? 'Otros Marcadores'`. Esto alineará los gráficos con los mismos 14 sistemas oficiales PDI del catálogo.

#### [MODIFY] [page.tsx (pacientes/[id])](file:///Users/federicobq/Library/Mobile%20Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI%20protocolo%20diagnostico%20integral/pdi-app/src/app/pacientes/%5Bid%5D/page.tsx)
* Definir un método auxiliar `autoBuildCanonical` que realice la llamada POST a `/api/build-canonical`.
* Llamar a `autoBuildCanonical` inmediatamente después de:
  * Completar una subida exitosa en `handleFileUpload` (después de `createBiomarkers`).
  * Eliminar un estudio en la acción de borrado (después de `deleteStudy`).
  * Completar la fusión de estudios en `handleMerge`.
  * Confirmar la reversión de una fusión en `handleUndoMerge`.

---

## Plan de Verificación

1. **Subir estudios de prueba**: Verificar que el botón "Construir Tabla Canónica" ya no sea necesario y la tabla se actualice sola.
2. **Revisar agrupaciones en la Tabla Maestra**: Confirmar que no hay duplicación de filas por fechas y que todos los biomarcadores mapeados se sitúan en sus correspondientes 14 sistemas clínicos PDI sin elementos perdidos.
3. **Validar no colisión de Calcio/Testosterona**: Asegurar que Calcio Total/Iónico y Testosterona Total/Libre coexistan de forma independiente.
