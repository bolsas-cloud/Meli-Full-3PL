-- ============================================
-- FUNCIONES RPC PARA CÁLCULOS DE LOGÍSTICA
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. CALCULAR SUGERENCIAS DE ENVÍO
-- Fórmula basada en fecha de colecta (igual que GAS)
-- ============================================
-- ============================================
-- IMPORTANTE: Ejecutar DESPUÉS de las migraciones:
-- 1. fix_primary_key.sql
-- 2. migration_ordenes_composite_key.sql
-- 3. migration_add_sync_columns.sql
-- ============================================

CREATE OR REPLACE FUNCTION calcular_sugerencias_envio(
    p_fecha_colecta DATE,
    p_tiempo_transito INTEGER DEFAULT 3,
    p_frecuencia_envio INTEGER DEFAULT 7,
    p_nivel_servicio_z NUMERIC DEFAULT 1.65,
    p_incremento_evento NUMERIC DEFAULT 0
)
RETURNS TABLE (
    id_publicacion TEXT,
    sku TEXT,
    titulo TEXT,
    ventas_dia NUMERIC,
    stock_full INTEGER,
    stock_transito INTEGER,
    stock_proyectado NUMERIC,
    stock_seguridad INTEGER,
    dias_cobertura NUMERIC,
    cantidad_a_enviar INTEGER,
    nivel_riesgo TEXT,
    id_inventario TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dias_hasta_colecta INTEGER;
    v_lead_time INTEGER;
    v_factor_evento NUMERIC;
BEGIN
    -- Calcular días hasta la colecta
    v_dias_hasta_colecta := GREATEST(0, p_fecha_colecta - CURRENT_DATE);

    -- Lead Time total = Tiempo Tránsito + Frecuencia de Envío
    v_lead_time := p_tiempo_transito + p_frecuencia_envio;

    -- Factor de incremento por evento
    v_factor_evento := 1 + (p_incremento_evento / 100);

    RETURN QUERY
    WITH calculos AS (
        SELECT
            p.id_publicacion,
            p.sku,
            p.titulo,
            -- Ventas diarias (calculadas o desde ventas_90d)
            COALESCE(p.ventas_dia, p.ventas_90d / 90.0, 0)::NUMERIC AS v,
            COALESCE(p.stock_full, 0)::INTEGER AS s_full,
            COALESCE(p.stock_transito, 0)::INTEGER AS s_transito,
            -- Desviación estándar (calculada o estimada como 30% de ventas)
            COALESCE(p.desviacion, COALESCE(p.ventas_dia, p.ventas_90d / 90.0, 0) * 0.3)::NUMERIC AS sigma,
            p.id_inventario
        FROM publicaciones_meli p
        WHERE p.tipo_logistica = 'fulfillment'
    ),
    sugerencias AS (
        SELECT
            c.id_publicacion,
            c.sku,
            c.titulo,
            ROUND(c.v, 2) AS ventas_dia,
            c.s_full AS stock_full,
            c.s_transito AS stock_transito,

            -- Consumo proyectado hasta la colecta
            -- consumoProyectado = V × diasHastaColecta × factorEvento
            (c.v * v_dias_hasta_colecta * v_factor_evento) AS consumo_proyectado,

            -- Stock proyectado en el momento de la colecta
            -- stockProyectadoEnColecta = (stockFull + enTransito) - consumoProyectado
            ROUND((c.s_full + c.s_transito) - (c.v * v_dias_hasta_colecta * v_factor_evento), 1) AS stock_proyectado,

            -- Stock de Seguridad: Ss = Z × σ × √L × factorEvento
            CEIL(p_nivel_servicio_z * c.sigma * SQRT(v_lead_time) * v_factor_evento)::INTEGER AS stock_seguridad,

            -- Días de cobertura actual
            CASE WHEN c.v > 0 THEN ROUND(c.s_full / c.v, 1) ELSE 999 END AS dias_cobertura,

            -- Demanda durante período de reposición
            -- demandaPeriodo = V × L × factorEvento
            (c.v * v_lead_time * v_factor_evento) AS demanda_periodo,

            c.id_inventario
        FROM calculos c
    )
    SELECT
        s.id_publicacion,
        s.sku,
        s.titulo,
        s.ventas_dia,
        s.stock_full,
        s.stock_transito,
        s.stock_proyectado,
        s.stock_seguridad,
        s.dias_cobertura,

        -- Cantidad a enviar: Q* = (V × L) + Ss - stockProyectadoEnColecta
        GREATEST(0, CEIL(s.demanda_periodo + s.stock_seguridad - s.stock_proyectado))::INTEGER AS cantidad_a_enviar,

        -- Nivel de riesgo
        CASE
            WHEN s.stock_proyectado < 0 OR s.dias_cobertura < 3 THEN 'CRÍTICO'
            WHEN s.stock_proyectado < s.stock_seguridad OR s.dias_cobertura < 7 THEN 'BAJO'
            WHEN s.dias_cobertura < 14 THEN 'NORMAL'
            ELSE 'OK'
        END AS nivel_riesgo,

        s.id_inventario
    FROM sugerencias s
    ORDER BY
        -- Ordenar: CRÍTICO primero, luego por cantidad a enviar
        CASE
            WHEN s.stock_proyectado < 0 OR s.dias_cobertura < 3 THEN 0
            WHEN s.stock_proyectado < s.stock_seguridad OR s.dias_cobertura < 7 THEN 1
            WHEN s.dias_cobertura < 14 THEN 2
            ELSE 3
        END,
        CEIL(s.demanda_periodo + s.stock_seguridad - s.stock_proyectado) DESC;
END;
$$;

-- ============================================
-- 2. CALCULAR VENTAS DIARIAS POR SKU
-- Agrupa órdenes y calcula promedio + desviación
-- ============================================
CREATE OR REPLACE FUNCTION calcular_ventas_diarias(
    p_dias_evaluacion INTEGER DEFAULT 30
)
RETURNS TABLE (
    sku TEXT,
    ventas_diarias NUMERIC,
    desviacion NUMERIC,
    total_ventas INTEGER,
    dias_con_ventas INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH ventas_por_dia AS (
        SELECT
            o.sku,
            DATE(o.fecha_orden) AS fecha,
            SUM(o.cantidad)::INTEGER AS cantidad_dia
        FROM ordenes_meli o
        WHERE o.fecha_orden >= CURRENT_DATE - p_dias_evaluacion
          AND o.sku IS NOT NULL
        GROUP BY o.sku, DATE(o.fecha_orden)
    ),
    estadisticas AS (
        SELECT
            v.sku,
            SUM(v.cantidad_dia)::NUMERIC / p_dias_evaluacion AS promedio,
            COUNT(DISTINCT v.fecha)::INTEGER AS dias_activos,
            SUM(v.cantidad_dia)::INTEGER AS total,
            -- Desviación estándar de ventas diarias
            CASE
                WHEN COUNT(*) > 1 THEN STDDEV_SAMP(v.cantidad_dia)
                ELSE 0
            END AS desv
        FROM ventas_por_dia v
        GROUP BY v.sku
    )
    SELECT
        e.sku,
        ROUND(e.promedio, 2) AS ventas_diarias,
        ROUND(COALESCE(e.desv, e.promedio * 0.3), 2) AS desviacion,
        e.total AS total_ventas,
        e.dias_activos AS dias_con_ventas
    FROM estadisticas e
    ORDER BY e.promedio DESC;
END;
$$;

-- ============================================
-- 3. OBTENER ESTADÍSTICAS DE STOCK
-- Para el dashboard
-- ============================================
CREATE OR REPLACE FUNCTION obtener_estadisticas_stock()
RETURNS TABLE (
    total_skus INTEGER,
    criticos INTEGER,
    stock_bajo INTEGER,
    normales INTEGER,
    ok INTEGER,
    valor_stock_full NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            p.id_publicacion,
            COALESCE(p.stock_full, 0) AS stock,
            COALESCE(p.ventas_dia, p.ventas_90d / 90.0, 0) AS v,
            CASE
                WHEN COALESCE(p.ventas_dia, p.ventas_90d / 90.0, 0) > 0
                THEN COALESCE(p.stock_full, 0) / COALESCE(p.ventas_dia, p.ventas_90d / 90.0, 1)
                ELSE 999
            END AS dias_cob
        FROM publicaciones_meli p
        WHERE p.tipo_logistica = 'fulfillment'
    )
    SELECT
        COUNT(*)::INTEGER AS total_skus,
        COUNT(*) FILTER (WHERE s.dias_cob < 3)::INTEGER AS criticos,
        COUNT(*) FILTER (WHERE s.dias_cob >= 3 AND s.dias_cob < 7)::INTEGER AS stock_bajo,
        COUNT(*) FILTER (WHERE s.dias_cob >= 7 AND s.dias_cob < 14)::INTEGER AS normales,
        COUNT(*) FILTER (WHERE s.dias_cob >= 14)::INTEGER AS ok,
        COALESCE(SUM(s.stock), 0)::NUMERIC AS valor_stock_full
    FROM stats s;
END;
$$;

-- ============================================
-- 4. ACTUALIZAR VENTAS DIARIAS EN PUBLICACIONES
-- Ejecutar periódicamente para mantener datos actualizados
-- ============================================
CREATE OR REPLACE FUNCTION actualizar_ventas_diarias_publicaciones(
    p_dias_evaluacion INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_actualizados INTEGER := 0;
BEGIN
    -- Actualizar publicaciones con las ventas calculadas
    WITH ventas AS (
        SELECT * FROM calcular_ventas_diarias(p_dias_evaluacion)
    )
    UPDATE publicaciones_meli p
    SET
        ventas_dia = v.ventas_diarias,
        desviacion = v.desviacion
    FROM ventas v
    WHERE p.sku = v.sku;

    GET DIAGNOSTICS v_actualizados = ROW_COUNT;

    RETURN v_actualizados;
END;
$$;

-- ============================================
-- 5. IDENTIFICAR ÓRDENES NUEVAS
-- Compara contra IDs existentes
-- ============================================
CREATE OR REPLACE FUNCTION obtener_ids_ordenes_existentes()
RETURNS TABLE (id_orden TEXT)
LANGUAGE sql
AS $$
    SELECT DISTINCT o.id_orden::TEXT
    FROM ordenes_meli o
    WHERE o.id_orden IS NOT NULL;
$$;

-- ============================================
-- GRANTS - Permitir acceso desde el frontend
-- ============================================
GRANT EXECUTE ON FUNCTION calcular_sugerencias_envio TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calcular_ventas_diarias TO anon, authenticated;
GRANT EXECUTE ON FUNCTION obtener_estadisticas_stock TO anon, authenticated;
GRANT EXECUTE ON FUNCTION actualizar_ventas_diarias_publicaciones TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_ids_ordenes_existentes TO anon, authenticated;
