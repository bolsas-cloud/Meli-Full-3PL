-- ============================================
-- FUNCION RPC: ANALISIS PARETO 80/20
-- Calcula las publicaciones que generan el 80% de la facturacion
-- ============================================
-- Ejecutar en Supabase SQL Editor
-- ============================================

DROP FUNCTION IF EXISTS obtener_analisis_pareto(DATE, DATE);

CREATE OR REPLACE FUNCTION obtener_analisis_pareto(
    p_fecha_desde DATE,
    p_fecha_hasta DATE
)
RETURNS TABLE (
    id_item TEXT,
    sku TEXT,
    titulo TEXT,
    cantidad_vendida BIGINT,
    total_neto NUMERIC,
    porcentaje_total NUMERIC,
    porcentaje_acumulado NUMERIC,
    es_top_80 BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_general NUMERIC := 0;
BEGIN
    -- Calcular el total general de ventas netas en el periodo
    SELECT COALESCE(SUM(COALESCE(o.neto_recibido, o.cantidad * o.precio_unitario)), 0)
    INTO v_total_general
    FROM ordenes_meli o
    WHERE DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) BETWEEN p_fecha_desde AND p_fecha_hasta;

    -- Si no hay ventas, retornar vacio
    IF v_total_general = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH ventas_por_item AS (
        -- Agrupar ventas SOLO por id_item (evita duplicados por diferencias en SKU/titulo)
        SELECT
            o.id_item,
            -- Tomar el primer SKU no vacio encontrado
            MAX(COALESCE(NULLIF(o.sku, ''), NULLIF(p.sku, ''), 'N/A')) AS sku,
            -- Tomar el primer titulo no vacio encontrado
            MAX(COALESCE(o.titulo_item, p.titulo, 'Sin titulo')) AS titulo,
            SUM(o.cantidad)::BIGINT AS cantidad_vendida,
            COALESCE(SUM(COALESCE(o.neto_recibido, o.cantidad * o.precio_unitario)), 0) AS total_neto
        FROM ordenes_meli o
        LEFT JOIN publicaciones_meli p ON o.id_item = p.id_publicacion
        WHERE DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) BETWEEN p_fecha_desde AND p_fecha_hasta
        GROUP BY o.id_item  -- Solo agrupar por id_item
    ),
    ventas_ordenadas AS (
        -- Ordenar por total neto descendente y calcular porcentajes
        SELECT
            v.id_item,
            v.sku,
            v.titulo,
            v.cantidad_vendida,
            v.total_neto,
            ROUND((v.total_neto / v_total_general) * 100, 2) AS porcentaje_total,
            ROUND(
                SUM(v.total_neto) OVER (ORDER BY v.total_neto DESC ROWS UNBOUNDED PRECEDING)
                / v_total_general * 100,
                2
            ) AS porcentaje_acumulado
        FROM ventas_por_item v
        ORDER BY v.total_neto DESC
    )
    SELECT
        vo.id_item,
        vo.sku,
        vo.titulo,
        vo.cantidad_vendida,
        vo.total_neto,
        vo.porcentaje_total,
        vo.porcentaje_acumulado,
        (vo.porcentaje_acumulado <= 80) AS es_top_80
    FROM ventas_ordenadas vo;
END;
$$;

-- ============================================
-- FUNCION RPC: RESUMEN PARETO
-- Retorna estadisticas resumidas del analisis
-- ============================================
DROP FUNCTION IF EXISTS obtener_resumen_pareto(DATE, DATE);

CREATE OR REPLACE FUNCTION obtener_resumen_pareto(
    p_fecha_desde DATE,
    p_fecha_hasta DATE
)
RETURNS TABLE (
    total_facturado NUMERIC,
    total_publicaciones INTEGER,
    publicaciones_top_80 INTEGER,
    publicaciones_resto INTEGER,
    facturacion_top_80 NUMERIC,
    facturacion_resto NUMERIC,
    pct_publicaciones_top NUMERIC,
    pct_facturacion_top NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_total NUMERIC := 0;
    v_total_pubs INTEGER := 0;
    v_pubs_top INTEGER := 0;
    v_fact_top NUMERIC := 0;
BEGIN
    -- Obtener datos del analisis pareto
    SELECT
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE p.es_top_80 = true)::INTEGER,
        COALESCE(SUM(p.total_neto), 0),
        COALESCE(SUM(p.total_neto) FILTER (WHERE p.es_top_80 = true), 0)
    INTO v_total_pubs, v_pubs_top, v_total, v_fact_top
    FROM obtener_analisis_pareto(p_fecha_desde, p_fecha_hasta) p;

    RETURN QUERY SELECT
        v_total,
        v_total_pubs,
        v_pubs_top,
        v_total_pubs - v_pubs_top,
        v_fact_top,
        v_total - v_fact_top,
        CASE WHEN v_total_pubs > 0
             THEN ROUND((v_pubs_top::NUMERIC / v_total_pubs) * 100, 1)
             ELSE 0 END,
        CASE WHEN v_total > 0
             THEN ROUND((v_fact_top / v_total) * 100, 1)
             ELSE 0 END;
END;
$$;

-- ============================================
-- GRANTS
-- ============================================
GRANT EXECUTE ON FUNCTION obtener_analisis_pareto TO anon, authenticated;
GRANT EXECUTE ON FUNCTION obtener_resumen_pareto TO anon, authenticated;

-- ============================================
-- TEST
-- ============================================
-- SELECT * FROM obtener_analisis_pareto('2025-01-01', '2025-01-12');
-- SELECT * FROM obtener_resumen_pareto('2025-01-01', '2025-01-12');
