-- ============================================================================
-- AGREGAR CAMPO embalado A registro_envios - Meli-Full-3PL
-- ============================================================================
-- Ejecutar en Supabase: https://cpwsdpzxzhlmozzasnqx.supabase.co
-- ============================================================================
-- Este campo indica si el envio ya fue preparado/embalado
-- Se marca como true al finalizar la preparacion desde la pantalla de picking
-- ============================================================================

-- 1. Agregar campo embalado
ALTER TABLE registro_envios ADD COLUMN IF NOT EXISTS embalado BOOLEAN DEFAULT false;

-- 2. Comentario descriptivo
COMMENT ON COLUMN registro_envios.embalado IS 'Indica si el envio fue preparado/embalado. Se marca al finalizar preparacion.';

-- 3. Indice para filtrar envios embalados/no embalados
CREATE INDEX IF NOT EXISTS idx_envios_embalado ON registro_envios(embalado);

-- ============================================================================
-- VERIFICACION
-- ============================================================================
-- SELECT id_envio, destino, estado, embalado FROM registro_envios LIMIT 10;
-- SELECT COUNT(*) as total, embalado FROM registro_envios GROUP BY embalado;
