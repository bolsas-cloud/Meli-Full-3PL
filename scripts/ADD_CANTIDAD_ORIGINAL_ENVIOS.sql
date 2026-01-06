-- =====================================================
-- ADD: Campo cantidad_original a detalle_envios_full
-- =====================================================
-- Permite trackear la cantidad original planificada vs
-- la cantidad final enviada (cuando hay discrepancias)
-- =====================================================

-- 1. Agregar columna cantidad_original
ALTER TABLE detalle_envios_full
ADD COLUMN IF NOT EXISTS cantidad_original INTEGER;

-- 2. Poblar datos existentes (cantidad_original = cantidad_enviada)
UPDATE detalle_envios_full
SET cantidad_original = cantidad_enviada
WHERE cantidad_original IS NULL;

-- 3. Comentario de documentación
COMMENT ON COLUMN detalle_envios_full.cantidad_original IS
'Cantidad originalmente planificada para el envío.
Si cantidad_enviada < cantidad_original, hubo discrepancia al finalizar preparación.';

-- 4. Verificar
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'detalle_envios_full'
ORDER BY ordinal_position;
