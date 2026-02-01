-- ============================================
-- MIGRACIÓN: Configuración de Costos de ML
-- ============================================
-- Tablas para configurar costos fijos por precio
-- y costos de envío gratis por peso
-- ============================================

-- ============================================
-- TABLA: config_costos_fijos_ml
-- Costos fijos según rango de precio del producto
-- Aplican a productos con precio < umbral_envio_gratis
-- ============================================
CREATE TABLE IF NOT EXISTS config_costos_fijos_ml (
    id SERIAL PRIMARY KEY,
    precio_desde NUMERIC(12,2) NOT NULL,      -- Inicio del rango (inclusive)
    precio_hasta NUMERIC(12,2) NOT NULL,      -- Fin del rango (exclusive)
    costo_fijo NUMERIC(12,2) NOT NULL,        -- Costo fijo a aplicar
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar valores actuales (Enero 2026)
INSERT INTO config_costos_fijos_ml (precio_desde, precio_hasta, costo_fijo, descripcion) VALUES
    (0, 15000, 1115, 'Productos hasta $15.000'),
    (15000, 25000, 2300, 'Productos de $15.000 a $25.000'),
    (25000, 33000, 2810, 'Productos de $25.000 a $33.000'),
    (33000, 999999999, 0, 'Productos >= $33.000 (sin costo fijo)')
ON CONFLICT DO NOTHING;

-- ============================================
-- TABLA: config_costos_envio_ml
-- Costos de envío gratis según peso del producto
-- ============================================
CREATE TABLE IF NOT EXISTS config_costos_envio_ml (
    id SERIAL PRIMARY KEY,
    peso_desde_gr NUMERIC(10,2) NOT NULL,     -- Peso mínimo en gramos (inclusive)
    peso_hasta_gr NUMERIC(10,2) NOT NULL,     -- Peso máximo en gramos (exclusive)
    costo_sin_descuento NUMERIC(12,2) NOT NULL,   -- Costo completo (productos < umbral)
    costo_con_descuento NUMERIC(12,2) NOT NULL,   -- Costo con 50% desc (productos >= umbral)
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar valores actuales de envío (Enero 2026)
-- Fuente: https://www.mercadolibre.com.ar/ayuda/40538
INSERT INTO config_costos_envio_ml (peso_desde_gr, peso_hasta_gr, costo_sin_descuento, costo_con_descuento, descripcion) VALUES
    (0, 300, 10766, 5383, 'Hasta 300g'),
    (300, 500, 11646, 5823, '300g a 500g'),
    (500, 1000, 12526, 6263, '500g a 1kg'),
    (1000, 2000, 14001, 7001, '1kg a 2kg'),
    (2000, 3000, 15611, 7806, '2kg a 3kg'),
    (3000, 4000, 17231, 8616, '3kg a 4kg'),
    (4000, 5000, 18701, 9351, '4kg a 5kg'),
    (5000, 10000, 22221, 11111, '5kg a 10kg'),
    (10000, 15000, 26621, 13311, '10kg a 15kg'),
    (15000, 20000, 31031, 15516, '15kg a 20kg'),
    (20000, 25000, 40831, 20416, '20kg a 25kg'),
    (25000, 30000, 48631, 24316, '25kg a 30kg'),
    (30000, 40000, 57431, 28716, '30kg a 40kg'),
    (40000, 50000, 66231, 33116, '40kg a 50kg'),
    (50000, 60000, 75031, 37516, '50kg a 60kg'),
    (60000, 80000, 83831, 41916, '60kg a 80kg'),
    (80000, 100000, 101431, 50716, '80kg a 100kg'),
    (100000, 120000, 119031, 59516, '100kg a 120kg'),
    (120000, 140000, 136631, 68316, '120kg a 140kg'),
    (140000, 160000, 154231, 77116, '140kg a 160kg'),
    (160000, 180000, 171831, 85916, '160kg a 180kg'),
    (180000, 999999, 189956, 94978, 'Más de 180kg')
ON CONFLICT DO NOTHING;

-- ============================================
-- TABLA: config_umbrales_ml
-- Umbrales y configuraciones generales
-- ============================================
CREATE TABLE IF NOT EXISTS config_umbrales_ml (
    clave TEXT PRIMARY KEY,
    valor NUMERIC(12,2) NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar valores actuales
INSERT INTO config_umbrales_ml (clave, valor, descripcion) VALUES
    ('umbral_envio_gratis', 33000, 'Precio mínimo para envío gratis con descuento 50%'),
    ('descuento_envio_pct', 50, 'Porcentaje de descuento en envío (reputación verde)'),
    ('peso_default_gr', 500, 'Peso por defecto si no hay dato (500g)')
ON CONFLICT (clave) DO UPDATE SET
    valor = EXCLUDED.valor,
    descripcion = EXCLUDED.descripcion,
    updated_at = NOW();

-- ============================================
-- FUNCIÓN: Calcular costo de envío según peso y precio
-- ============================================
CREATE OR REPLACE FUNCTION fn_calcular_costo_envio(
    p_peso_gr NUMERIC,
    p_precio NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    v_umbral NUMERIC;
    v_peso_efectivo NUMERIC;
    v_costo NUMERIC := 0;
    v_tiene_descuento BOOLEAN;
BEGIN
    -- Obtener umbral de envío gratis
    SELECT valor INTO v_umbral
    FROM config_umbrales_ml
    WHERE clave = 'umbral_envio_gratis';

    -- Si no hay umbral configurado, usar 33000
    v_umbral := COALESCE(v_umbral, 33000);

    -- Determinar si tiene descuento (precio >= umbral)
    v_tiene_descuento := p_precio >= v_umbral;

    -- Usar peso por defecto si no hay dato
    IF p_peso_gr IS NULL OR p_peso_gr <= 0 THEN
        SELECT valor INTO v_peso_efectivo
        FROM config_umbrales_ml
        WHERE clave = 'peso_default_gr';
        v_peso_efectivo := COALESCE(v_peso_efectivo, 500);
    ELSE
        v_peso_efectivo := p_peso_gr;
    END IF;

    -- Buscar costo según peso
    IF v_tiene_descuento THEN
        SELECT costo_con_descuento INTO v_costo
        FROM config_costos_envio_ml
        WHERE v_peso_efectivo >= peso_desde_gr
          AND v_peso_efectivo < peso_hasta_gr
          AND activo = TRUE
        LIMIT 1;
    ELSE
        SELECT costo_sin_descuento INTO v_costo
        FROM config_costos_envio_ml
        WHERE v_peso_efectivo >= peso_desde_gr
          AND v_peso_efectivo < peso_hasta_gr
          AND activo = TRUE
        LIMIT 1;
    END IF;

    RETURN COALESCE(v_costo, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCIÓN: Calcular costo fijo según precio
-- ============================================
CREATE OR REPLACE FUNCTION fn_calcular_costo_fijo(
    p_precio NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    v_costo NUMERIC := 0;
BEGIN
    SELECT costo_fijo INTO v_costo
    FROM config_costos_fijos_ml
    WHERE p_precio >= precio_desde
      AND p_precio < precio_hasta
      AND activo = TRUE
    LIMIT 1;

    RETURN COALESCE(v_costo, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VISTA: v_publicaciones_con_costos
-- Publicaciones con todos los costos calculados
-- ============================================
CREATE OR REPLACE VIEW v_publicaciones_con_costos AS
SELECT
    p.*,
    fn_calcular_costo_fijo(p.precio) AS costo_fijo_calculado,
    fn_calcular_costo_envio(p.peso_gr, p.precio) AS costo_envio_calculado,
    -- Neto completo considerando todos los costos
    p.precio
        - COALESCE(p.comision_ml, 0)
        - COALESCE(p.cargo_fijo_ml, 0)
        - COALESCE(p.impuestos_estimados, 0)
        - fn_calcular_costo_envio(p.peso_gr, p.precio) AS neto_completo
FROM publicaciones_meli p;

-- ============================================
-- RLS para las nuevas tablas
-- ============================================
ALTER TABLE config_costos_fijos_ml ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_costos_envio_ml ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_umbrales_ml ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso público lectura" ON config_costos_fijos_ml FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON config_costos_fijos_ml FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON config_costos_envio_ml FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON config_costos_envio_ml FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON config_umbrales_ml FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON config_umbrales_ml FOR ALL USING (true);

-- ============================================
-- Índices para optimizar búsquedas
-- ============================================
CREATE INDEX IF NOT EXISTS idx_costos_fijos_precio ON config_costos_fijos_ml(precio_desde, precio_hasta);
CREATE INDEX IF NOT EXISTS idx_costos_envio_peso ON config_costos_envio_ml(peso_desde_gr, peso_hasta_gr);
