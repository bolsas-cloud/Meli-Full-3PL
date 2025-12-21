-- ============================================
-- MIGRACIÓN V2: Agregar columnas de stock Full
-- ============================================
-- Ejecutar este SQL en Supabase Dashboard
-- ============================================

-- Agregar columnas de stock a publicaciones_meli
ALTER TABLE publicaciones_meli
ADD COLUMN IF NOT EXISTS stock_full INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_reservado INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_transito INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ventas_dia NUMERIC(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS desviacion NUMERIC(10,4) DEFAULT 0;

-- Crear índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_publicaciones_tipo_log ON publicaciones_meli(tipo_logistica);
CREATE INDEX IF NOT EXISTS idx_publicaciones_ventas ON publicaciones_meli(ventas_90d DESC);

-- Agregar columna SKU a ordenes_meli para relacionar con productos
ALTER TABLE ordenes_meli
ADD COLUMN IF NOT EXISTS sku TEXT;

-- Crear vista para sugerencias de envío (para el cálculo en tiempo real)
CREATE OR REPLACE VIEW v_sugerencias_envio AS
SELECT
    p.sku,
    p.titulo,
    p.id_publicacion,
    p.inventory_id AS id_inventario,
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

-- Crear función para calcular sugerencias de envío
CREATE OR REPLACE FUNCTION calcular_sugerencia_envio(
    p_sku TEXT,
    p_tiempo_transito INTEGER DEFAULT 3,
    p_frecuencia_envio INTEGER DEFAULT 7,
    p_nivel_servicio NUMERIC DEFAULT 1.65,
    p_incremento_evento NUMERIC DEFAULT 0
)
RETURNS TABLE (
    sku TEXT,
    titulo TEXT,
    ventas_dia NUMERIC,
    stock_actual INTEGER,
    stock_transito INTEGER,
    stock_seguridad INTEGER,
    dias_cobertura NUMERIC,
    cantidad_enviar INTEGER,
    nivel_riesgo TEXT
) AS $$
DECLARE
    v_producto RECORD;
    v_lead_time INTEGER;
    v_ss NUMERIC;
    v_cantidad_ideal NUMERIC;
    v_dias_cob NUMERIC;
    v_riesgo TEXT;
BEGIN
    -- Obtener datos del producto
    SELECT p.* INTO v_producto
    FROM publicaciones_meli p
    WHERE p.sku = p_sku;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Calcular Lead Time total
    v_lead_time := p_tiempo_transito + p_frecuencia_envio;

    -- Calcular Stock de Seguridad: Ss = Z × σ × √L
    v_ss := ROUND(p_nivel_servicio * COALESCE(v_producto.desviacion, 0) * SQRT(v_lead_time));

    -- Aplicar incremento por evento
    IF p_incremento_evento > 0 THEN
        v_ss := v_ss * (1 + p_incremento_evento / 100);
    END IF;

    -- Calcular cantidad a enviar: Q* = (V × L) + Ss - Sml - EnTransito
    v_cantidad_ideal := (COALESCE(v_producto.ventas_dia, 0) * v_lead_time)
                       + v_ss
                       - COALESCE(v_producto.stock_full, 0)
                       - COALESCE(v_producto.stock_transito, 0);

    -- Calcular días de cobertura
    IF COALESCE(v_producto.ventas_dia, 0) > 0 THEN
        v_dias_cob := ROUND(COALESCE(v_producto.stock_full, 0)::numeric / v_producto.ventas_dia, 1);
    ELSE
        v_dias_cob := 999;
    END IF;

    -- Determinar nivel de riesgo
    IF v_dias_cob < 3 THEN
        v_riesgo := 'CRÍTICO';
    ELSIF v_dias_cob < 7 THEN
        v_riesgo := 'BAJO';
    ELSIF v_dias_cob < 14 THEN
        v_riesgo := 'NORMAL';
    ELSE
        v_riesgo := 'OK';
    END IF;

    RETURN QUERY SELECT
        v_producto.sku,
        v_producto.titulo,
        ROUND(COALESCE(v_producto.ventas_dia, 0)::numeric, 2),
        COALESCE(v_producto.stock_full, 0),
        COALESCE(v_producto.stock_transito, 0),
        v_ss::INTEGER,
        v_dias_cob,
        GREATEST(0, ROUND(v_cantidad_ideal))::INTEGER,
        v_riesgo;
END;
$$ LANGUAGE plpgsql;

-- Crear función para calcular todas las sugerencias
CREATE OR REPLACE FUNCTION calcular_todas_sugerencias(
    p_tiempo_transito INTEGER DEFAULT 3,
    p_frecuencia_envio INTEGER DEFAULT 7,
    p_nivel_servicio NUMERIC DEFAULT 1.65,
    p_incremento_evento NUMERIC DEFAULT 0
)
RETURNS TABLE (
    sku TEXT,
    titulo TEXT,
    ventas_dia NUMERIC,
    stock_actual INTEGER,
    stock_transito INTEGER,
    stock_seguridad INTEGER,
    dias_cobertura NUMERIC,
    cantidad_enviar INTEGER,
    nivel_riesgo TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.*
    FROM publicaciones_meli p,
    LATERAL calcular_sugerencia_envio(
        p.sku,
        p_tiempo_transito,
        p_frecuencia_envio,
        p_nivel_servicio,
        p_incremento_evento
    ) s
    WHERE p.tipo_logistica = 'fulfillment'
    ORDER BY
        CASE s.nivel_riesgo
            WHEN 'CRÍTICO' THEN 1
            WHEN 'BAJO' THEN 2
            WHEN 'NORMAL' THEN 3
            ELSE 4
        END,
        s.cantidad_enviar DESC;
END;
$$ LANGUAGE plpgsql;
