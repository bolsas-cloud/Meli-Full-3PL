-- ============================================
-- ADS ANALYTICS: Tablas para metricas de publicidad
-- Fecha: 2026-03-07
-- Proyecto: Meli-Full-3PL
-- ============================================

-- Tabla de campanas
CREATE TABLE IF NOT EXISTS ads_campanas (
    campaign_id TEXT PRIMARY KEY,
    nombre TEXT,
    status TEXT,
    tipo TEXT,
    presupuesto_diario NUMERIC(12,2),
    fecha_creacion DATE,
    fecha_sync TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de metricas diarias por item
CREATE TABLE IF NOT EXISTS ads_metricas_diarias (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    campaign_id TEXT,
    item_id TEXT,
    sku TEXT,
    -- Visibilidad
    impresiones INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr NUMERIC(8,4) DEFAULT 0,
    -- Costos
    costo NUMERIC(12,2) DEFAULT 0,
    cpc NUMERIC(8,2) DEFAULT 0,
    -- Ventas atribuidas a ads
    ventas_directas_unidades INTEGER DEFAULT 0,
    ventas_directas_monto NUMERIC(12,2) DEFAULT 0,
    ventas_indirectas_unidades INTEGER DEFAULT 0,
    ventas_indirectas_monto NUMERIC(12,2) DEFAULT 0,
    ventas_total_unidades INTEGER DEFAULT 0,
    ventas_total_monto NUMERIC(12,2) DEFAULT 0,
    -- Ventas organicas
    ventas_organicas_unidades INTEGER DEFAULT 0,
    ventas_organicas_monto NUMERIC(12,2) DEFAULT 0,
    -- Indicadores calculados
    acos NUMERIC(8,4) DEFAULT 0,
    roas NUMERIC(8,2) DEFAULT 0,
    cvr NUMERIC(8,4) DEFAULT 0,
    -- Constraint unico por fecha+item
    UNIQUE(fecha, item_id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ads_metricas_fecha ON ads_metricas_diarias(fecha);
CREATE INDEX IF NOT EXISTS idx_ads_metricas_item ON ads_metricas_diarias(item_id);
CREATE INDEX IF NOT EXISTS idx_ads_metricas_sku ON ads_metricas_diarias(sku);
CREATE INDEX IF NOT EXISTS idx_ads_metricas_campaign ON ads_metricas_diarias(campaign_id);

-- Habilitar RLS
ALTER TABLE ads_campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_metricas_diarias ENABLE ROW LEVEL SECURITY;

-- Politicas permisivas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ads_campanas' AND policyname = 'ads_campanas_all') THEN
        CREATE POLICY ads_campanas_all ON ads_campanas FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ads_metricas_diarias' AND policyname = 'ads_metricas_all') THEN
        CREATE POLICY ads_metricas_all ON ads_metricas_diarias FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
