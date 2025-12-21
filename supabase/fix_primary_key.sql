-- ============================================
-- FIX: Cambiar clave primaria de publicaciones_meli
-- ============================================
-- El SKU puede repetirse (varias publicaciones del mismo producto)
-- Lo único es: id_publicacion (MLA...) o id_inventario (inventory_id)
-- ============================================

-- Paso 1: Eliminar la tabla existente (CUIDADO: borra datos)
-- Si ya tienes datos importantes, primero haz backup
DROP TABLE IF EXISTS detalle_envios_full CASCADE;
DROP TABLE IF EXISTS sugerencias_envio_full CASCADE;
DROP TABLE IF EXISTS publicaciones_meli CASCADE;

-- Paso 2: Recrear con la estructura correcta
CREATE TABLE publicaciones_meli (
    id_publicacion TEXT PRIMARY KEY,          -- MLA836288971 (ÚNICO)
    sku TEXT,                                  -- LAC101500XACRC050 (puede repetirse)
    id_inventario TEXT,                        -- SYHC06436 (inventory_id de Full)
    titulo TEXT,
    visitas_90d INTEGER DEFAULT 0,
    ventas_90d INTEGER DEFAULT 0,
    conversion_pct NUMERIC(5,2) DEFAULT 0,
    promo_activa BOOLEAN DEFAULT FALSE,
    precio NUMERIC(12,2),
    categoria_id TEXT,
    tipo_publicacion TEXT,                     -- gold_special
    comision_ml NUMERIC(12,2),
    cargo_fijo_ml NUMERIC(12,2),
    costo_envio_ml NUMERIC(12,2),
    impuestos_estimados NUMERIC(12,2),
    neto_estimado NUMERIC(12,2),
    tipo_logistica TEXT,                       -- fulfillment, flex, etc
    tiene_envio_gratis BOOLEAN DEFAULT FALSE,
    clasificacion_full TEXT,
    peso_gr NUMERIC(10,2),
    alto_cm NUMERIC(10,2),
    ancho_cm NUMERIC(10,2),
    largo_cm NUMERIC(10,2),
    -- Columnas para cálculos (agregadas en migration_v2)
    stock_full INTEGER DEFAULT 0,
    stock_reservado INTEGER DEFAULT 0,
    stock_transito INTEGER DEFAULT 0,
    ventas_dia NUMERIC(10,4) DEFAULT 0,
    desviacion NUMERIC(10,4) DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_pub_sku ON publicaciones_meli(sku);
CREATE INDEX idx_pub_tipo_logistica ON publicaciones_meli(tipo_logistica);
CREATE INDEX idx_pub_ventas ON publicaciones_meli(ventas_90d DESC);
CREATE INDEX idx_pub_inventario ON publicaciones_meli(id_inventario);

-- Paso 3: Recrear tabla de sugerencias (sin FK a SKU)
CREATE TABLE sugerencias_envio_full (
    id_publicacion TEXT PRIMARY KEY REFERENCES publicaciones_meli(id_publicacion),
    sku TEXT,
    titulo TEXT,
    ventas_dia NUMERIC(10,2),
    stock_actual_full INTEGER,
    stock_en_transito INTEGER,
    stock_seguridad INTEGER,
    dias_cobertura NUMERIC(10,2),
    cantidad_a_enviar INTEGER,
    nivel_riesgo TEXT,
    calculado_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paso 4: Recrear detalle_envios_full
CREATE TABLE detalle_envios_full (
    id SERIAL PRIMARY KEY,
    id_envio TEXT REFERENCES registro_envios_full(id_envio),
    id_publicacion TEXT REFERENCES publicaciones_meli(id_publicacion),
    sku TEXT,
    cantidad_enviada INTEGER,
    UNIQUE(id_envio, id_publicacion)
);

-- Paso 5: Trigger para updated_at
DROP TRIGGER IF EXISTS update_publicaciones_meli_updated_at ON publicaciones_meli;
CREATE TRIGGER update_publicaciones_meli_updated_at
    BEFORE UPDATE ON publicaciones_meli
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Paso 6: Políticas RLS
ALTER TABLE publicaciones_meli ENABLE ROW LEVEL SECURITY;
ALTER TABLE sugerencias_envio_full ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_envios_full ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_pub" ON publicaciones_meli FOR SELECT USING (true);
CREATE POLICY "public_write_pub" ON publicaciones_meli FOR ALL USING (true);

CREATE POLICY "public_read_sug" ON sugerencias_envio_full FOR SELECT USING (true);
CREATE POLICY "public_write_sug" ON sugerencias_envio_full FOR ALL USING (true);

CREATE POLICY "public_read_det" ON detalle_envios_full FOR SELECT USING (true);
CREATE POLICY "public_write_det" ON detalle_envios_full FOR ALL USING (true);

-- Paso 7: Vista actualizada
CREATE OR REPLACE VIEW v_sugerencias_envio AS
SELECT
    p.id_publicacion,
    p.sku,
    p.titulo,
    p.id_inventario,
    p.precio,
    p.tipo_logistica,
    p.stock_full,
    p.stock_reservado,
    p.stock_transito,
    p.ventas_90d,
    p.ventas_dia,
    p.desviacion,
    CASE
        WHEN p.ventas_dia > 0 THEN ROUND(p.stock_full::numeric / p.ventas_dia, 1)
        ELSE 999
    END AS dias_cobertura
FROM publicaciones_meli p
WHERE p.tipo_logistica = 'fulfillment'
ORDER BY p.ventas_90d DESC;
