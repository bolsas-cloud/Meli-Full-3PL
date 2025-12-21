-- ============================================
-- MIGRACIÓN: Agregar columnas faltantes a ordenes_meli
-- ============================================
-- Ejecutar este script en Supabase SQL Editor
-- Agrega las columnas necesarias para el neto recibido
-- ============================================

-- 1. Agregar columnas faltantes (si no existen)
ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ;

ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS id_pago TEXT;

ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS neto_recibido NUMERIC(12,2);

ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS costo_meli NUMERIC(12,2);

ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS pct_costo_meli NUMERIC(5,2);

ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS total_lista NUMERIC(12,2);

-- 2. Renombrar columnas si tienen nombres diferentes
-- (solo ejecutar si la columna existe con nombre incorrecto)
DO $$
BEGIN
    -- Renombrar fecha_orden a fecha_creacion si existe
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ordenes_meli' AND column_name = 'fecha_orden')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ordenes_meli' AND column_name = 'fecha_creacion') THEN
        ALTER TABLE ordenes_meli RENAME COLUMN fecha_orden TO fecha_creacion;
    END IF;

    -- Renombrar titulo a titulo_item si existe
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ordenes_meli' AND column_name = 'titulo')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ordenes_meli' AND column_name = 'titulo_item') THEN
        ALTER TABLE ordenes_meli RENAME COLUMN titulo TO titulo_item;
    END IF;

    -- Renombrar estado_orden a estado si existe
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ordenes_meli' AND column_name = 'estado_orden')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ordenes_meli' AND column_name = 'estado') THEN
        ALTER TABLE ordenes_meli RENAME COLUMN estado_orden TO estado;
    END IF;
END $$;

-- 3. Crear índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_pago ON ordenes_meli(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_ordenes_neto ON ordenes_meli(neto_recibido);

-- 4. Verificar estructura final
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ordenes_meli'
ORDER BY ordinal_position;
