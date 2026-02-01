-- =====================================================
-- MIGRACIÓN: Sistema Multi-Destino para Envíos
-- =====================================================
-- Este script implementa el soporte para múltiples destinos
-- de envío (Full de MercadoLibre + Depósitos externos 3PL)
--
-- IMPORTANTE: Ejecutar en orden. Las tablas originales se
-- mantienen como backup (_backup) hasta verificar que todo funciona.
--
-- Ejecutar en: Meli-Full-3PL (Supabase SQL Editor)
-- Fecha: 2025-01-30
-- =====================================================

-- =====================================================
-- PASO 1: Agregar campo tipo_logistica a ordenes_meli
-- =====================================================
-- Permite analizar ventas por tipo de envío (Full vs Flex)

ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS tipo_logistica TEXT;

COMMENT ON COLUMN ordenes_meli.tipo_logistica IS
'Tipo de logística del envío: fulfillment, self_service (flex), cross_docking, etc.';

-- =====================================================
-- PASO 2: Crear tabla destinos_envio (maestro)
-- =====================================================

CREATE TABLE IF NOT EXISTS destinos_envio (
    id_destino TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('meli', 'externo')),
    activo BOOLEAN DEFAULT TRUE,
    direccion TEXT,
    localidad TEXT,
    provincia TEXT,
    codigo_postal TEXT,
    contacto TEXT,
    telefono TEXT,
    email TEXT,
    tiempo_transito_default INTEGER DEFAULT 3,
    requiere_remito BOOLEAN DEFAULT FALSE,
    requiere_etiquetas BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_destinos_envio_updated_at ON destinos_envio;
CREATE TRIGGER update_destinos_envio_updated_at
    BEFORE UPDATE ON destinos_envio
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insertar destino Full por defecto (MercadoLibre)
INSERT INTO destinos_envio (id_destino, nombre, tipo, activo, tiempo_transito_default, requiere_remito, requiere_etiquetas)
VALUES ('FULL', 'MercadoLibre Fulfillment', 'meli', TRUE, 3, FALSE, FALSE)
ON CONFLICT (id_destino) DO NOTHING;

-- RLS
ALTER TABLE destinos_envio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso público lectura destinos" ON destinos_envio FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura destinos" ON destinos_envio FOR ALL USING (true);

-- =====================================================
-- PASO 3: Crear tabla registro_envios (unificada)
-- =====================================================

CREATE TABLE IF NOT EXISTS registro_envios (
    id_envio TEXT PRIMARY KEY,
    id_destino TEXT REFERENCES destinos_envio(id_destino),
    id_envio_ml TEXT,
    estado TEXT DEFAULT 'Borrador',
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    fecha_colecta TIMESTAMPTZ,
    fecha_ingreso_estimada TIMESTAMPTZ,
    fecha_despacho TIMESTAMPTZ,
    fecha_recepcion TIMESTAMPTZ,
    -- Campos para 3PL (remito)
    transporte TEXT,
    cant_bultos INTEGER,
    valor_declarado NUMERIC(12,2),
    link_pdf TEXT,
    link_remito TEXT,
    link_etiquetas TEXT,
    notas TEXT,
    -- Metadatos
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_registro_envios_destino ON registro_envios(id_destino);
CREATE INDEX IF NOT EXISTS idx_registro_envios_estado ON registro_envios(estado);
CREATE INDEX IF NOT EXISTS idx_registro_envios_fecha ON registro_envios(fecha_creacion);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_registro_envios_updated_at ON registro_envios;
CREATE TRIGGER update_registro_envios_updated_at
    BEFORE UPDATE ON registro_envios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE registro_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso público lectura registro_envios" ON registro_envios FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura registro_envios" ON registro_envios FOR ALL USING (true);

-- =====================================================
-- PASO 4: Crear tabla detalle_envios (unificada)
-- =====================================================

CREATE TABLE IF NOT EXISTS detalle_envios (
    id SERIAL PRIMARY KEY,
    id_envio TEXT REFERENCES registro_envios(id_envio) ON DELETE CASCADE,
    sku TEXT,
    id_publicacion TEXT,
    cantidad_sugerida INTEGER,
    cantidad_enviada INTEGER,
    cantidad_recibida INTEGER DEFAULT 0,
    UNIQUE(id_envio, sku)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_detalle_envios_envio ON detalle_envios(id_envio);

-- RLS
ALTER TABLE detalle_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso público lectura detalle_envios" ON detalle_envios FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura detalle_envios" ON detalle_envios FOR ALL USING (true);

-- =====================================================
-- PASO 5: Migrar datos existentes
-- =====================================================

-- 5.1 Migrar registro_envios_full a registro_envios
INSERT INTO registro_envios (
    id_envio,
    id_destino,
    id_envio_ml,
    estado,
    fecha_creacion,
    fecha_colecta,
    fecha_ingreso_estimada,
    link_pdf,
    notas
)
SELECT
    id_envio,
    'FULL',  -- Todos los envíos existentes son a Full
    id_envio_ml,
    estado,
    fecha_creacion,
    fecha_colecta,
    fecha_ingreso_estimada,
    link_pdf,
    notas
FROM registro_envios_full
ON CONFLICT (id_envio) DO NOTHING;

-- 5.2 Migrar detalle_envios_full a detalle_envios
INSERT INTO detalle_envios (
    id_envio,
    sku,
    id_publicacion,
    cantidad_sugerida,
    cantidad_enviada
)
SELECT
    def.id_envio,
    def.sku,
    COALESCE(def.id_publicacion, pm.id_publicacion),
    COALESCE(def.cantidad_original, def.cantidad_enviada),
    def.cantidad_enviada
FROM detalle_envios_full def
LEFT JOIN publicaciones_meli pm ON def.sku = pm.sku
ON CONFLICT (id_envio, sku) DO NOTHING;

-- =====================================================
-- PASO 6: Crear vista para stock en tránsito por destino
-- =====================================================

CREATE OR REPLACE VIEW v_stock_transito_por_destino AS
SELECT
    d.sku,
    r.id_destino,
    de.nombre as nombre_destino,
    SUM(GREATEST(d.cantidad_enviada - COALESCE(d.cantidad_recibida, 0), 0)) as cantidad_en_transito
FROM detalle_envios d
JOIN registro_envios r ON d.id_envio = r.id_envio
JOIN destinos_envio de ON r.id_destino = de.id_destino
WHERE r.estado IN ('Despachado', 'En Preparación')
GROUP BY d.sku, r.id_destino, de.nombre;

-- =====================================================
-- PASO 7: Actualizar preparacion_en_curso
-- =====================================================
-- La tabla preparacion_en_curso tiene FK a registro_envios_full
-- Necesitamos actualizarla para que funcione con la nueva tabla

-- Primero quitar la FK existente si existe
ALTER TABLE preparacion_en_curso
DROP CONSTRAINT IF EXISTS preparacion_en_curso_id_envio_fkey;

-- La tabla ahora puede apuntar a cualquier id_envio (sin FK estricta)
-- porque los envíos pueden estar en registro_envios_full (legado) o registro_envios (nuevo)

-- =====================================================
-- PASO 8: Renombrar tablas originales como backup
-- =====================================================
-- NO eliminamos las tablas originales, solo las renombramos
-- para poder revertir si hay problemas

-- NOTA: Comentado por seguridad. Descomentar después de verificar
-- que la migración funcionó correctamente.

-- ALTER TABLE registro_envios_full RENAME TO registro_envios_full_backup;
-- ALTER TABLE detalle_envios_full RENAME TO detalle_envios_full_backup;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración completada' as resultado;

-- Verificar destinos
SELECT * FROM destinos_envio;

-- Verificar conteo de envíos migrados
SELECT
    'registro_envios_full' as tabla_origen,
    COUNT(*) as registros
FROM registro_envios_full
UNION ALL
SELECT
    'registro_envios (migrado)' as tabla_origen,
    COUNT(*) as registros
FROM registro_envios;

-- Verificar conteo de detalles migrados
SELECT
    'detalle_envios_full' as tabla_origen,
    COUNT(*) as registros
FROM detalle_envios_full
UNION ALL
SELECT
    'detalle_envios (migrado)' as tabla_origen,
    COUNT(*) as registros
FROM detalle_envios;

-- =====================================================
-- NOTAS POST-MIGRACIÓN
-- =====================================================
/*
1. Ejecutar este script en Supabase SQL Editor
2. Verificar que los conteos coinciden
3. Probar que la app sigue funcionando con las tablas nuevas
4. Una vez verificado, descomentar PASO 8 para renombrar tablas backup
5. Actualizar el código JS para usar las nuevas tablas

ROLLBACK (si hay problemas):
- Las tablas originales (registro_envios_full, detalle_envios_full)
  siguen intactas hasta que se ejecute el PASO 8
- Si algo falla, simplemente ignorar las tablas nuevas y seguir
  usando las originales
*/
