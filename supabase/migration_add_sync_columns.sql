-- ============================================
-- MIGRACIÓN: Agregar columnas para sincronización
-- ============================================

-- Agregar columna ultima_sync a publicaciones_meli
ALTER TABLE publicaciones_meli
ADD COLUMN IF NOT EXISTS ultima_sync TIMESTAMPTZ;

-- Agregar columna estado si no existe
ALTER TABLE publicaciones_meli
ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'active';

-- Crear índice para filtrar por última sincronización
CREATE INDEX IF NOT EXISTS idx_pub_ultima_sync ON publicaciones_meli(ultima_sync);
