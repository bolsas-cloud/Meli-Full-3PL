-- ============================================
-- MIGRACIÓN: Clave compuesta para ordenes_meli
-- ============================================
-- Una orden puede tener múltiples items, por eso necesitamos
-- clave compuesta (id_orden, id_item) en lugar de solo id_orden
-- ============================================

-- Paso 1: Crear tabla temporal con la estructura correcta
CREATE TABLE IF NOT EXISTS ordenes_meli_new (
    id SERIAL,
    id_orden TEXT NOT NULL,
    id_item TEXT NOT NULL,
    sku TEXT,
    titulo TEXT,
    cantidad INTEGER DEFAULT 1,
    precio_unitario NUMERIC(12,2),
    fecha_orden TIMESTAMPTZ,
    estado_orden TEXT,
    comprador_nickname TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id_orden, id_item)
);

-- Paso 2: Migrar datos existentes (si hay)
INSERT INTO ordenes_meli_new (id_orden, id_item, sku, titulo, cantidad, precio_unitario, fecha_orden, estado_orden, comprador_nickname, created_at)
SELECT
    id_orden,
    COALESCE(id_item, id_orden), -- Si no hay id_item, usar id_orden como fallback
    sku,
    COALESCE(titulo_item, titulo),
    cantidad,
    precio_unitario,
    COALESCE(fecha_pago, fecha_creacion, NOW()),
    estado,
    comprador_nickname,
    created_at
FROM ordenes_meli
ON CONFLICT (id_orden, id_item) DO NOTHING;

-- Paso 3: Renombrar tablas
DROP TABLE IF EXISTS ordenes_meli_backup;
ALTER TABLE ordenes_meli RENAME TO ordenes_meli_backup;
ALTER TABLE ordenes_meli_new RENAME TO ordenes_meli;

-- Paso 4: Crear índices
CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON ordenes_meli(fecha_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_item ON ordenes_meli(id_item);
CREATE INDEX IF NOT EXISTS idx_ordenes_sku ON ordenes_meli(sku);
CREATE INDEX IF NOT EXISTS idx_ordenes_id ON ordenes_meli(id_orden);

-- Paso 5: Habilitar RLS
ALTER TABLE ordenes_meli ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordenes_public_read" ON ordenes_meli FOR SELECT USING (true);
CREATE POLICY "ordenes_public_write" ON ordenes_meli FOR ALL USING (true);

-- Paso 6: Limpiar backup (comentado por seguridad)
-- DROP TABLE ordenes_meli_backup;
