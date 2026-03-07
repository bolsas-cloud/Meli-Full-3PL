-- ============================================
-- BILLING ML: Tablas para costos y gastos de Mercado Libre
-- Fecha: 2026-03-07
-- Proyecto: Meli-Full-3PL
-- ============================================

-- Tabla de periodos de facturacion
CREATE TABLE IF NOT EXISTS billing_periodos (
    id SERIAL PRIMARY KEY,
    periodo_key TEXT UNIQUE NOT NULL,
    fecha_vencimiento DATE,
    mes INTEGER,
    anio INTEGER,
    fecha_sync TIMESTAMPTZ DEFAULT NOW(),
    -- Totales del summary por concepto
    total_comisiones NUMERIC(12,2) DEFAULT 0,
    total_cargos_fijos NUMERIC(12,2) DEFAULT 0,
    total_envios NUMERIC(12,2) DEFAULT 0,
    total_publicidad NUMERIC(12,2) DEFAULT 0,
    total_impuestos NUMERIC(12,2) DEFAULT 0,
    total_reembolsos NUMERIC(12,2) DEFAULT 0,
    total_otros NUMERIC(12,2) DEFAULT 0,
    total_general NUMERIC(12,2) DEFAULT 0,
    -- Metadata
    cantidad_documentos INTEGER DEFAULT 0,
    raw_summary JSONB
);

-- Tabla de detalle linea por linea
CREATE TABLE IF NOT EXISTS billing_detalle (
    id SERIAL PRIMARY KEY,
    periodo_key TEXT REFERENCES billing_periodos(periodo_key) ON DELETE CASCADE,
    tipo_cargo TEXT NOT NULL,
    descripcion TEXT,
    orden_id TEXT,
    item_id TEXT,
    sku TEXT,
    monto NUMERIC(12,2) NOT NULL,
    fecha_cargo DATE,
    detalle_raw JSONB
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_billing_detalle_periodo ON billing_detalle(periodo_key);
CREATE INDEX IF NOT EXISTS idx_billing_detalle_tipo ON billing_detalle(tipo_cargo);
CREATE INDEX IF NOT EXISTS idx_billing_detalle_sku ON billing_detalle(sku);
CREATE INDEX IF NOT EXISTS idx_billing_periodos_anio_mes ON billing_periodos(anio, mes);

-- Habilitar RLS
ALTER TABLE billing_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_detalle ENABLE ROW LEVEL SECURITY;

-- Politicas permisivas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'billing_periodos' AND policyname = 'billing_periodos_all') THEN
        CREATE POLICY billing_periodos_all ON billing_periodos FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'billing_detalle' AND policyname = 'billing_detalle_all') THEN
        CREATE POLICY billing_detalle_all ON billing_detalle FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
