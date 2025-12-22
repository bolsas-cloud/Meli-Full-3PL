-- ============================================
-- MIGRACIÓN V3: Stock Distribuido y Flex
-- ============================================
-- Ejecutar este SQL en Supabase Dashboard
-- ============================================

-- Agregar columnas para stock distribuido y Flex
ALTER TABLE publicaciones_meli
ADD COLUMN IF NOT EXISTS stock_deposito INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiene_flex BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS user_product_id TEXT;

-- Crear índice para búsquedas por user_product_id
CREATE INDEX IF NOT EXISTS idx_publicaciones_user_product ON publicaciones_meli(user_product_id);

-- Comentarios explicativos
COMMENT ON COLUMN publicaciones_meli.stock_deposito IS 'Stock en depósito del vendedor (selling_address)';
COMMENT ON COLUMN publicaciones_meli.stock_full IS 'Stock en bodega de ML (meli_facility)';
COMMENT ON COLUMN publicaciones_meli.tiene_flex IS 'Indica si tiene servicio Flex activo (self_service_in)';
COMMENT ON COLUMN publicaciones_meli.user_product_id IS 'ID de producto de usuario para consultar stock distribuido';
