-- ══════════════════════════════════════════════════════════════════════════
-- PDI Extracción v2 — Migración de base de datos
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Agregar columnas a la tabla biomarkers
--    (IF NOT EXISTS garantiza que es seguro correr múltiples veces)
ALTER TABLE biomarkers
  ADD COLUMN IF NOT EXISTS raw_name        TEXT,
  ADD COLUMN IF NOT EXISTS canonical_name  TEXT,
  ADD COLUMN IF NOT EXISTS canonical_system TEXT;

-- 2. Rellenar raw_name para registros existentes
--    (preserva el nombre original que ya tenemos en 'name')
UPDATE biomarkers
SET raw_name = name
WHERE raw_name IS NULL;

-- 3. Crear tabla de registro de builds canónicos
CREATE TABLE IF NOT EXISTS canonical_builds (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id   UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  built_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  study_ids    TEXT[],
  study_count  INTEGER,
  marker_count INTEGER,
  method       TEXT DEFAULT 'hybrid-v2'
);

-- Índice para búsquedas rápidas por paciente (más reciente primero)
CREATE INDEX IF NOT EXISTS idx_canonical_builds_patient_date
  ON canonical_builds(patient_id, built_at DESC);

-- 4. RLS para canonical_builds
--    Misma política que las demás tablas: solo usuarios autenticados
ALTER TABLE canonical_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Authenticated users can manage canonical builds"
  ON canonical_builds
  FOR ALL
  USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════════════════
-- Verificación (opcional — corre esto para confirmar que todo quedó bien)
-- ══════════════════════════════════════════════════════════════════════════
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'biomarkers'
  AND column_name IN ('raw_name', 'canonical_name', 'canonical_system')
ORDER BY column_name;
