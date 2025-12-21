-- ============================================
-- ACTUALIZAR SKUs FALTANTES EN ORDENES
-- ============================================
-- Ejecutar DESPUÉS de sincronizar inventario
-- Toma los SKUs desde publicaciones_meli
-- ============================================

-- Ver ordenes sin SKU
SELECT COUNT(*) as ordenes_sin_sku
FROM ordenes_meli
WHERE sku IS NULL OR sku = '';

-- Actualizar SKUs desde publicaciones_meli
UPDATE ordenes_meli o
SET sku = p.sku
FROM publicaciones_meli p
WHERE o.id_item = p.id_publicacion
  AND (o.sku IS NULL OR o.sku = '')
  AND p.sku IS NOT NULL
  AND p.sku != '';

-- Verificar resultado
SELECT COUNT(*) as ordenes_sin_sku_despues
FROM ordenes_meli
WHERE sku IS NULL OR sku = '';
