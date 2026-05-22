-- ══════════════════════════════════════════════════════════════════════════
-- PDI Sync v3 — Migración de base de datos para sincronización total
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Agregar columnas chat_history y comparative_groups a la tabla patients
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS chat_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comparative_groups JSONB DEFAULT '[]'::jsonb;

-- ══════════════════════════════════════════════════════════════════════════
-- Verificación (corre esto para confirmar que todo quedó bien)
-- ══════════════════════════════════════════════════════════════════════════
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'patients'
  AND column_name IN ('chat_history', 'comparative_groups')
ORDER BY column_name;
