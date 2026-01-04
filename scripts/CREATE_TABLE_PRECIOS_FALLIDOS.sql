-- =====================================================
-- TABLA: precios_actualizacion_fallidas
-- =====================================================
-- Registra intentos fallidos de actualización de precio en ML
-- para poder reintentar posteriormente
-- =====================================================

-- 1. Crear la tabla
CREATE TABLE IF NOT EXISTS precios_actualizacion_fallidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificación del producto
    sku TEXT NOT NULL,
    id_publicacion TEXT NOT NULL,
    titulo TEXT,

    -- Datos del intento de actualización
    precio_anterior NUMERIC(12,2) NOT NULL,
    precio_nuevo NUMERIC(12,2) NOT NULL,
    tipo_modificacion TEXT NOT NULL CHECK (tipo_modificacion IN ('porcentaje', 'fijo')),
    valor_modificacion NUMERIC(12,2) NOT NULL,

    -- Metadata del fallo
    fecha_intento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_mensaje TEXT,

    -- Estado del registro
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'reintentado', 'resuelto', 'descartado')),
    fecha_resolucion TIMESTAMP WITH TIME ZONE,

    -- Índices para búsquedas
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_precios_fallidos_sku ON precios_actualizacion_fallidas(sku);
CREATE INDEX IF NOT EXISTS idx_precios_fallidos_estado ON precios_actualizacion_fallidas(estado);
CREATE INDEX IF NOT EXISTS idx_precios_fallidos_fecha ON precios_actualizacion_fallidas(fecha_intento DESC);

-- 3. Habilitar RLS
ALTER TABLE precios_actualizacion_fallidas ENABLE ROW LEVEL SECURITY;

-- 4. Política RLS (permitir todo para usuarios autenticados)
CREATE POLICY "Allow all for authenticated users" ON precios_actualizacion_fallidas
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. Comentario de documentación
COMMENT ON TABLE precios_actualizacion_fallidas IS
'Registra intentos fallidos de actualización de precios en MercadoLibre.
Permite reintentar actualizaciones y trackear historial de fallos.

Campos:
- sku/id_publicacion: Identificación del producto
- precio_anterior/precio_nuevo: Valores del cambio intentado
- tipo_modificacion: porcentaje o fijo
- valor_modificacion: El valor aplicado (ej: 10 para +10%)
- error_mensaje: Mensaje de error devuelto por ML
- estado: pendiente, reintentado, resuelto, descartado';

-- 6. Vista para contar fallos pendientes por SKU
CREATE OR REPLACE VIEW v_precios_fallos_pendientes AS
SELECT
    sku,
    id_publicacion,
    COUNT(*) as cantidad_fallos,
    MAX(fecha_intento) as ultimo_intento,
    MAX(precio_nuevo) as ultimo_precio_intentado
FROM precios_actualizacion_fallidas
WHERE estado = 'pendiente'
GROUP BY sku, id_publicacion;

COMMENT ON VIEW v_precios_fallos_pendientes IS
'Vista que agrupa fallos pendientes por producto para mostrar en UI';
