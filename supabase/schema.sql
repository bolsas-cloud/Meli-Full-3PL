-- ============================================
-- ESQUEMA DE BASE DE DATOS: Meli-Full-3PL
-- ============================================
-- IMPORTANTE: Todos los IDs son tipo TEXT para
-- compatibilidad con datos existentes de Google Sheets
-- ============================================

-- ============================================
-- TABLA: publicaciones_meli (ex "Hoja 1")
-- Catálogo de productos publicados en ML
-- ============================================
CREATE TABLE IF NOT EXISTS publicaciones_meli (
    sku TEXT PRIMARY KEY,                    -- LAC101500XACRC050
    titulo TEXT,
    visitas_90d INTEGER DEFAULT 0,
    ventas_90d INTEGER DEFAULT 0,
    conversion_pct NUMERIC(5,2) DEFAULT 0,
    promo_activa BOOLEAN DEFAULT FALSE,
    id_publicacion TEXT,                     -- MLA836288971
    id_inventario TEXT,                      -- SYHC06436
    precio NUMERIC(12,2),
    categoria_id TEXT,                       -- MLA417006
    tipo_publicacion TEXT,                   -- gold_special
    comision_ml NUMERIC(12,2),
    cargo_fijo_ml NUMERIC(12,2),
    costo_envio_ml NUMERIC(12,2),
    impuestos_estimados NUMERIC(12,2),
    neto_estimado NUMERIC(12,2),
    tipo_logistica TEXT,                     -- fulfillment, flex, etc
    tiene_envio_gratis BOOLEAN DEFAULT FALSE,
    clasificacion_full TEXT,
    peso_gr NUMERIC(10,2),
    alto_cm NUMERIC(10,2),
    ancho_cm NUMERIC(10,2),
    largo_cm NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: ordenes_meli
-- Historial de órdenes/ventas de Mercado Libre
-- ============================================
CREATE TABLE IF NOT EXISTS ordenes_meli (
    id_orden TEXT PRIMARY KEY,               -- 2000014411407170
    fecha_creacion TIMESTAMPTZ,
    fecha_pago TIMESTAMPTZ,
    estado TEXT,                             -- paid, shipped, delivered
    id_item TEXT,                            -- MLA1392405228
    titulo_item TEXT,
    cantidad INTEGER,
    precio_unitario NUMERIC(12,2),
    total_lista NUMERIC(12,2),
    id_pago TEXT,                            -- 138184040755
    neto_recibido NUMERIC(12,2),
    costo_meli NUMERIC(12,2),
    pct_costo_meli NUMERIC(5,2),
    comprador_nickname TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas por fecha (dashboard)
CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON ordenes_meli(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_ordenes_item ON ordenes_meli(id_item);

-- ============================================
-- TABLA: costos_publicidad
-- Inversión diaria en publicidad de ML
-- ============================================
CREATE TABLE IF NOT EXISTS costos_publicidad (
    fecha DATE PRIMARY KEY,
    costo_diario NUMERIC(12,2)
);

-- ============================================
-- TABLA: config_logistica
-- Parámetros para la calculadora de envíos
-- ============================================
CREATE TABLE IF NOT EXISTS config_logistica (
    parametro TEXT PRIMARY KEY,
    valor TEXT,
    descripcion TEXT
);

-- Insertar parámetros por defecto
INSERT INTO config_logistica (parametro, valor, descripcion) VALUES
    ('tiempoTransito', '3', 'Días que tarda el envío en llegar a Full'),
    ('frecuenciaEnvio', '7', 'Cada cuántos días se envía a Full'),
    ('nivelServicioZ', '1.65', 'Factor Z para 95% de confiabilidad'),
    ('incrementoEvento', '0', 'Porcentaje de incremento por evento especial')
ON CONFLICT (parametro) DO NOTHING;

-- ============================================
-- TABLA: sugerencias_envio_full
-- Resultado del cálculo de la calculadora
-- ============================================
CREATE TABLE IF NOT EXISTS sugerencias_envio_full (
    sku TEXT PRIMARY KEY REFERENCES publicaciones_meli(sku),
    titulo TEXT,
    ventas_dia NUMERIC(10,2),                -- V (velocidad de ventas)
    stock_actual_full INTEGER,               -- Sml
    stock_en_transito INTEGER,
    stock_seguridad INTEGER,                 -- Ss
    dias_cobertura NUMERIC(10,2),
    cantidad_a_enviar INTEGER,
    nivel_riesgo TEXT,                       -- CRÍTICO, BAJO, OK
    calculado_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: registro_envios_full
-- Envíos realizados a bodegas de Full
-- ============================================
CREATE TABLE IF NOT EXISTS registro_envios_full (
    id_envio TEXT PRIMARY KEY,               -- ENV-1753795239938
    id_envio_ml TEXT,                        -- ID asignado por ML (si aplica)
    estado TEXT,                             -- Borrador, Confirmado, Recibido
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    fecha_colecta TIMESTAMPTZ,
    fecha_ingreso_estimada TIMESTAMPTZ,
    link_pdf TEXT,
    notas TEXT
);

-- ============================================
-- TABLA: detalle_envios_full
-- Productos incluidos en cada envío a Full
-- ============================================
CREATE TABLE IF NOT EXISTS detalle_envios_full (
    id SERIAL PRIMARY KEY,
    id_envio TEXT REFERENCES registro_envios_full(id_envio),
    sku TEXT REFERENCES publicaciones_meli(sku),
    cantidad_enviada INTEGER,
    UNIQUE(id_envio, sku)
);

-- ============================================
-- TABLA: registro_envios_3pl
-- Envíos realizados a depósito externo (3PL)
-- ============================================
CREATE TABLE IF NOT EXISTS registro_envios_3pl (
    id_envio TEXT PRIMARY KEY,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    estado TEXT,
    transporte TEXT,
    cant_bultos INTEGER,
    valor_declarado NUMERIC(12,2),
    link_remito TEXT,
    link_etiquetas TEXT,
    notas TEXT
);

-- ============================================
-- TABLA: historial_cambio_precios
-- Auditoría de cambios de precios
-- ============================================
CREATE TABLE IF NOT EXISTS historial_cambio_precios (
    id SERIAL PRIMARY KEY,
    fecha_cambio TIMESTAMPTZ DEFAULT NOW(),
    item_id TEXT,                            -- MLA836288971
    sku TEXT,
    precio_anterior NUMERIC(12,2),
    precio_nuevo NUMERIC(12,2)
);

-- ============================================
-- TABLA: preparacion_en_curso
-- Estado del packing/escaneo de un envío
-- ============================================
CREATE TABLE IF NOT EXISTS preparacion_en_curso (
    id SERIAL PRIMARY KEY,
    id_envio TEXT REFERENCES registro_envios_full(id_envio),
    sku TEXT,
    inventory_id TEXT,
    titulo TEXT,
    cantidad_requerida INTEGER,
    cantidad_escaneada INTEGER DEFAULT 0,
    UNIQUE(id_envio, sku)
);

-- ============================================
-- TABLA: config_meli
-- Credenciales OAuth de Mercado Libre
-- ============================================
CREATE TABLE IF NOT EXISTS config_meli (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

-- ============================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para publicaciones_meli
DROP TRIGGER IF EXISTS update_publicaciones_meli_updated_at ON publicaciones_meli;
CREATE TRIGGER update_publicaciones_meli_updated_at
    BEFORE UPDATE ON publicaciones_meli
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HABILITAR RLS (Row Level Security)
-- Por ahora dejamos acceso público, luego se puede restringir
-- ============================================
ALTER TABLE publicaciones_meli ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_meli ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos_publicidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_logistica ENABLE ROW LEVEL SECURITY;
ALTER TABLE sugerencias_envio_full ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_envios_full ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_envios_full ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_envios_3pl ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_cambio_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE preparacion_en_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_meli ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso público (anon key puede leer/escribir)
CREATE POLICY "Acceso público lectura" ON publicaciones_meli FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON publicaciones_meli FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON ordenes_meli FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON ordenes_meli FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON costos_publicidad FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON costos_publicidad FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON config_logistica FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON config_logistica FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON sugerencias_envio_full FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON sugerencias_envio_full FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON registro_envios_full FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON registro_envios_full FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON detalle_envios_full FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON detalle_envios_full FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON registro_envios_3pl FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON registro_envios_3pl FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON historial_cambio_precios FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON historial_cambio_precios FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON preparacion_en_curso FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON preparacion_en_curso FOR ALL USING (true);

CREATE POLICY "Acceso público lectura" ON config_meli FOR SELECT USING (true);
CREATE POLICY "Acceso público escritura" ON config_meli FOR ALL USING (true);
