-- ============================================
-- FUNCIONES RPC PARA DASHBOARD (V3)
-- Usa neto_recibido para ventas reales
-- ============================================
-- IMPORTANTE: Ejecutar DESPUÉS de migration_ordenes_v3.sql
-- ============================================

-- Primero eliminar las funciones anteriores
DROP FUNCTION IF EXISTS obtener_kpis_dashboard(DATE, DATE);
DROP FUNCTION IF EXISTS obtener_ventas_diarias(DATE, DATE);
DROP FUNCTION IF EXISTS obtener_top_productos(DATE, DATE, INTEGER);
DROP FUNCTION IF EXISTS obtener_ultima_actualizacion_dashboard();

-- ============================================
-- 1. OBTENER KPIs DEL DASHBOARD
-- Usa neto_recibido (ventas reales después de comisiones)
-- ============================================
CREATE OR REPLACE FUNCTION obtener_kpis_dashboard(
    p_fecha_desde DATE,
    p_fecha_hasta DATE
)
RETURNS TABLE (
    ventas_netas NUMERIC,
    cantidad_ordenes INTEGER,
    items_vendidos INTEGER,
    inversion_publicidad NUMERIC,
    acos NUMERIC,
    pct_costo_meli_promedio NUMERIC,
    ultima_actualizacion_ordenes TIMESTAMPTZ,
    ultima_actualizacion_publicidad DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ventas NUMERIC := 0;
    v_ordenes INTEGER := 0;
    v_items INTEGER := 0;
    v_publicidad NUMERIC := 0;
    v_acos NUMERIC := 0;
    v_pct_costo_meli NUMERIC := 0;
    v_ultima_orden TIMESTAMPTZ;
    v_ultima_pub DATE;
    v_ultimo_costo_conocido NUMERIC := 0;
    v_dias_faltantes INTEGER := 0;
BEGIN
    -- Obtener ventas y ordenes del periodo
    -- Prioridad: neto_recibido > cantidad * precio_unitario (fallback)
    SELECT
        COALESCE(SUM(COALESCE(o.neto_recibido, o.cantidad * o.precio_unitario)), 0),
        COUNT(DISTINCT o.id_orden),
        COALESCE(SUM(o.cantidad), 0),
        MAX(COALESCE(o.fecha_pago, o.fecha_creacion))
    INTO v_ventas, v_ordenes, v_items, v_ultima_orden
    FROM ordenes_meli o
    WHERE DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) BETWEEN p_fecha_desde AND p_fecha_hasta;

    -- Calcular % promedio de costo Meli (comisiones + envio)
    -- Solo considera ordenes que tienen el dato calculado
    SELECT COALESCE(ROUND(AVG(o.pct_costo_meli), 2), 0)
    INTO v_pct_costo_meli
    FROM ordenes_meli o
    WHERE DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) BETWEEN p_fecha_desde AND p_fecha_hasta
      AND o.pct_costo_meli IS NOT NULL;

    -- Obtener publicidad del periodo (con manejo de delay de 2 dias)
    SELECT
        COALESCE(SUM(c.costo_diario), 0),
        MAX(c.fecha)
    INTO v_publicidad, v_ultima_pub
    FROM costos_publicidad c
    WHERE c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta;

    -- Obtener el ultimo costo conocido para rellenar dias faltantes
    SELECT costo_diario INTO v_ultimo_costo_conocido
    FROM costos_publicidad
    ORDER BY fecha DESC
    LIMIT 1;

    -- Si no hay datos de publicidad, v_ultimo_costo_conocido sera NULL
    v_ultimo_costo_conocido := COALESCE(v_ultimo_costo_conocido, 0);

    -- Calcular dias faltantes (si el periodo incluye hoy o ayer y no hay datos)
    IF p_fecha_hasta >= CURRENT_DATE - INTERVAL '2 days' AND v_ultimo_costo_conocido > 0 THEN
        SELECT COUNT(*)::INTEGER INTO v_dias_faltantes
        FROM generate_series(
            GREATEST(p_fecha_desde, CURRENT_DATE - INTERVAL '2 days')::DATE,
            p_fecha_hasta,
            '1 day'::INTERVAL
        ) AS d(fecha)
        WHERE NOT EXISTS (
            SELECT 1 FROM costos_publicidad c WHERE c.fecha = d.fecha::DATE
        );

        v_publicidad := v_publicidad + (v_ultimo_costo_conocido * v_dias_faltantes);
    END IF;

    -- Calcular ACOS (Advertising Cost of Sales)
    IF v_ventas > 0 THEN
        v_acos := ROUND((v_publicidad / v_ventas) * 100, 2);
    ELSE
        v_acos := 0;
    END IF;

    RETURN QUERY SELECT
        v_ventas,
        v_ordenes,
        v_items,
        v_publicidad,
        v_acos,
        v_pct_costo_meli,
        v_ultima_orden,
        v_ultima_pub;
END;
$$;

-- ============================================
-- 2. OBTENER VENTAS DIARIAS PARA GRAFICO
-- Usa neto_recibido para ventas reales
-- ============================================
CREATE OR REPLACE FUNCTION obtener_ventas_diarias(
    p_fecha_desde DATE,
    p_fecha_hasta DATE
)
RETURNS TABLE (
    fecha DATE,
    ventas NUMERIC,
    ordenes INTEGER,
    publicidad NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ultimo_costo_conocido NUMERIC := 0;
BEGIN
    -- Obtener ultimo costo conocido para rellenar
    SELECT COALESCE(c.costo_diario, 0) INTO v_ultimo_costo_conocido
    FROM costos_publicidad c
    ORDER BY c.fecha DESC
    LIMIT 1;

    RETURN QUERY
    WITH dias AS (
        SELECT d::DATE AS dia
        FROM generate_series(p_fecha_desde, p_fecha_hasta, '1 day'::INTERVAL) d
    ),
    ventas_dia AS (
        SELECT
            DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) AS dia,
            COALESCE(SUM(COALESCE(o.neto_recibido, o.cantidad * o.precio_unitario)), 0) AS total_ventas,
            COUNT(DISTINCT o.id_orden)::INTEGER AS total_ordenes
        FROM ordenes_meli o
        WHERE DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) BETWEEN p_fecha_desde AND p_fecha_hasta
        GROUP BY DATE(COALESCE(o.fecha_pago, o.fecha_creacion))
    ),
    publicidad_dia AS (
        SELECT
            c.fecha AS dia,
            c.costo_diario AS costo
        FROM costos_publicidad c
        WHERE c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
    )
    SELECT
        d.dia AS fecha,
        COALESCE(v.total_ventas, 0) AS ventas,
        COALESCE(v.total_ordenes, 0) AS ordenes,
        COALESCE(p.costo,
            CASE WHEN d.dia >= CURRENT_DATE - INTERVAL '2 days'
                 THEN v_ultimo_costo_conocido
                 ELSE 0
            END
        ) AS publicidad
    FROM dias d
    LEFT JOIN ventas_dia v ON v.dia = d.dia
    LEFT JOIN publicidad_dia p ON p.dia = d.dia
    ORDER BY d.dia;
END;
$$;

-- ============================================
-- 3. OBTENER TOP PRODUCTOS VENDIDOS
-- Usa neto_recibido para total vendido real
-- JOIN con publicaciones_meli para obtener SKU
-- ============================================
CREATE OR REPLACE FUNCTION obtener_top_productos(
    p_fecha_desde DATE,
    p_fecha_hasta DATE,
    p_limite INTEGER DEFAULT 15
)
RETURNS TABLE (
    id_item TEXT,
    sku TEXT,
    titulo TEXT,
    cantidad_vendida BIGINT,
    total_vendido NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id_item,
        -- Prioridad: SKU de orden > SKU de publicacion > 'N/A'
        COALESCE(
            NULLIF(o.sku, ''),
            NULLIF(p.sku, ''),
            'N/A'
        ) AS sku,
        COALESCE(o.titulo_item, p.titulo, 'Sin titulo') AS titulo,
        SUM(o.cantidad)::BIGINT AS cantidad_vendida,
        COALESCE(SUM(COALESCE(o.neto_recibido, o.cantidad * o.precio_unitario)), 0) AS total_vendido
    FROM ordenes_meli o
    LEFT JOIN publicaciones_meli p ON o.id_item = p.id_publicacion
    WHERE DATE(COALESCE(o.fecha_pago, o.fecha_creacion)) BETWEEN p_fecha_desde AND p_fecha_hasta
    GROUP BY o.id_item,
             COALESCE(NULLIF(o.sku, ''), NULLIF(p.sku, ''), 'N/A'),
             COALESCE(o.titulo_item, p.titulo, 'Sin titulo')
    ORDER BY SUM(o.cantidad) DESC
    LIMIT p_limite;
END;
$$;

-- ============================================
-- 4. OBTENER ULTIMA ACTUALIZACION
-- ============================================
CREATE OR REPLACE FUNCTION obtener_ultima_actualizacion_dashboard()
RETURNS TABLE (
    ultima_orden TIMESTAMPTZ,
    ultima_publicidad DATE,
    ultima_sync TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT MAX(COALESCE(fecha_pago, fecha_creacion)) FROM ordenes_meli),
        (SELECT MAX(fecha) FROM costos_publicidad),
        GREATEST(
            (SELECT MAX(COALESCE(fecha_pago, fecha_creacion)) FROM ordenes_meli),
            (SELECT MAX(fecha)::TIMESTAMPTZ FROM costos_publicidad)
        );
END;
$$;

-- ============================================
-- GRANTS - Permitir acceso desde el frontend
-- ============================================
GRANT EXECUTE ON FUNCTION obtener_kpis_dashboard TO anon, authenticated;
GRANT EXECUTE ON FUNCTION obtener_ventas_diarias TO anon, authenticated;
GRANT EXECUTE ON FUNCTION obtener_top_productos TO anon, authenticated;
GRANT EXECUTE ON FUNCTION obtener_ultima_actualizacion_dashboard TO anon, authenticated;

-- ============================================
-- TEST: Verificar que funciona
-- ============================================
-- SELECT * FROM obtener_kpis_dashboard('2025-12-01', '2025-12-21');
-- SELECT * FROM obtener_ventas_diarias('2025-12-15', '2025-12-21');
-- SELECT * FROM obtener_top_productos('2025-12-01', '2025-12-21', 10);
