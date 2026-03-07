# Plan de Implementacion: Billing ML + Ads Analytics

Fecha: 2026-03-07
Estado: PENDIENTE

---

## Modulo 1: Billing ML (Costos y Gastos de Mercado Libre)

### Objetivo
Registrar y analizar mensualmente todos los cargos que ML nos factura: comisiones de venta, cargos fijos, envios, publicidad, impuestos, etc. Poder ver tendencias y detectar desvios.

### Datos disponibles via API

**Endpoints principales:**

| Endpoint | Descripcion |
|----------|-------------|
| `GET /billing/monthly/periods` | Lista los ultimos 12 periodos de facturacion |
| `GET /billing/integration/periods/key/$key/summary?group=ML` | Resumen de cargos de un periodo |
| `GET /billing/integration/periods/key/$key/group/ML/details` | Detalle linea por linea |
| `GET /billing/integration/periods/key/$key/documents?group=ML` | Facturas y notas de credito PDF |

**Tipos de cargos que devuelve ML:**
- Comisiones de venta
- Cargos fijos por publicacion
- Costos de Mercado Envios
- Cargos de Mercado Shops
- Costos de campanas publicitarias
- Impuestos / percepciones
- Reembolsos y notas de credito

**Parametros utiles:**
- `group`: ML o MP (Mercado Libre o Mercado Pago)
- `document_type`: BILL | CREDIT_NOTE
- Paginacion: `offset` (0-10000), `limit` (1-1000, default 150)

### Estructura de datos propuesta

**Tabla: `billing_periodos`**
```sql
CREATE TABLE billing_periodos (
    id SERIAL PRIMARY KEY,
    periodo_key TEXT UNIQUE NOT NULL,        -- key del periodo ML
    fecha_vencimiento DATE,
    fecha_sync TIMESTAMPTZ DEFAULT NOW(),
    -- Totales del summary
    total_comisiones NUMERIC(12,2) DEFAULT 0,
    total_cargos_fijos NUMERIC(12,2) DEFAULT 0,
    total_envios NUMERIC(12,2) DEFAULT 0,
    total_publicidad NUMERIC(12,2) DEFAULT 0,
    total_impuestos NUMERIC(12,2) DEFAULT 0,
    total_reembolsos NUMERIC(12,2) DEFAULT 0,
    total_otros NUMERIC(12,2) DEFAULT 0,
    total_general NUMERIC(12,2) DEFAULT 0
);
```

**Tabla: `billing_detalle`**
```sql
CREATE TABLE billing_detalle (
    id SERIAL PRIMARY KEY,
    periodo_key TEXT REFERENCES billing_periodos(periodo_key),
    tipo_cargo TEXT NOT NULL,                -- COMISION, CARGO_FIJO, ENVIO, PUBLICIDAD, etc.
    descripcion TEXT,
    orden_id TEXT,                           -- referencia a la orden si aplica
    item_id TEXT,                            -- publicacion asociada
    sku TEXT,
    monto NUMERIC(12,2) NOT NULL,
    fecha_cargo DATE,
    detalle_raw JSONB                        -- respuesta cruda de ML para auditar
);
```

### KPIs del modulo

| KPI | Formula | Para que sirve |
|-----|---------|----------------|
| **Costo total ML** | Suma de todos los cargos | Cuanto nos cobra ML por mes |
| **% Comision efectiva** | Total comisiones / Ventas brutas x 100 | Verificar si el % real coincide con lo esperado |
| **Costo por unidad vendida** | Total cargos / Unidades vendidas | Cuanto cuesta en fees vender una unidad |
| **Costo envio promedio** | Total envios / Cantidad envios | Costo logistico por envio |
| **% Publicidad sobre ventas** | Gasto ads / Ventas brutas x 100 | Cuanto de las ventas se va en publicidad |
| **Tendencia mensual** | Comparativa mes a mes | Detectar aumentos anormales de costos |

### Vista propuesta

```
+---------------------------------------------------------------+
|  BILLING ML - Resumen de Costos                    [Sync] [PDF]|
+---------------------------------------------------------------+
| Periodo: [Febrero 2026 v]    Comparar con: [Enero 2026 v]     |
+---------------------------------------------------------------+
| KPI Cards:                                                     |
| [Total Cargos] [Comisiones] [Envios] [Publicidad] [Impuestos] |
+---------------------------------------------------------------+
| Grafico: Barras apiladas mensual (ultimos 6 meses)            |
| - Comisiones | Envios | Publicidad | Impuestos | Otros        |
+---------------------------------------------------------------+
| Tabla detalle del periodo seleccionado                         |
| Tipo | Descripcion | Orden | SKU | Monto | Fecha              |
+---------------------------------------------------------------+
```

---

## Modulo 2: Ads Analytics (Analisis de Publicidad)

### Objetivo
Registrar metricas diarias de campanas publicitarias, calcular rentabilidad real, identificar productos con buen/mal rendimiento publicitario, y optimizar el gasto.

### Datos disponibles via API

**Endpoints principales:**

| Endpoint | Descripcion |
|----------|-------------|
| `GET /advertising/advertisers/$ID/product_ads/campaigns` | Lista campanas con metricas |
| `GET /advertising/product_ads/items/$ITEM_ID?metrics=...&aggregation_type=DAILY` | Metricas diarias por item |
| `GET /advertising/product_ads/campaigns/$CAMP_ID?metrics=...` | Metricas de una campana |

**Metricas disponibles (parameter `metrics`):**

| Metrica | Descripcion |
|---------|-------------|
| `clicks` | Clicks en el anuncio |
| `prints` | Impresiones (veces que se mostro) |
| `ctr` | Click-through rate (clicks/impresiones) |
| `cost` | Gasto real en publicidad |
| `cpc` | Costo por click promedio |
| `acos` | Advertising Cost of Sales (gasto ads / ventas ads) |
| `roas` | Return on Ad Spend (ventas ads / gasto ads) |
| `cvr` | Conversion rate |
| `units_quantity` | Unidades vendidas atribuidas a ads |
| `direct_units_quantity` | Ventas directas (click -> compra) |
| `indirect_units_quantity` | Ventas indirectas (vio ad, compro despues) |
| `direct_amount` | Revenue de ventas directas |
| `indirect_amount` | Revenue de ventas indirectas |
| `total_amount` | Revenue total atribuido |
| `organic_units_quantity` | Ventas organicas del mismo producto |
| `organic_units_amount` | Revenue organico |
| `sov` | Share of Voice (participacion en resultados) |

**Limitaciones:**
- Rango maximo: 90 dias hacia atras
- Un solo `aggregation_type` por request: `DAILY` o `item`
- Atribucion: `event_time` (fecha real) o `touch_point` (fecha del click/impresion)

### Estructura de datos propuesta

**Tabla: `ads_campanas`**
```sql
CREATE TABLE ads_campanas (
    campaign_id TEXT PRIMARY KEY,
    nombre TEXT,
    status TEXT,                              -- active, paused
    tipo TEXT,                                -- automatic, custom
    presupuesto_diario NUMERIC(12,2),
    fecha_creacion DATE,
    fecha_sync TIMESTAMPTZ DEFAULT NOW()
);
```

**Tabla: `ads_metricas_diarias`**
```sql
CREATE TABLE ads_metricas_diarias (
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
    -- Constraint
    UNIQUE(fecha, item_id)
);
```

### KPIs y como interpretarlos

#### Nivel Campana / General

| KPI | Formula | Que significa | Bueno | Malo |
|-----|---------|---------------|-------|------|
| **ROAS** | Revenue ads / Gasto ads | Por cada $1 en ads, cuanto facturas | > 4:1 | < 2:1 |
| **ACOS** | Gasto ads / Revenue ads x 100 | % de las ventas que se va en publicidad | < 25% | > 40% |
| **TACOS** | Gasto ads / Ventas TOTALES x 100 | Impacto real de ads en el negocio global | 5-15% | > 25% |
| **CTR** | Clicks / Impresiones x 100 | Atractivo del anuncio | > 1% | < 0.3% |
| **CVR** | Ventas / Clicks x 100 | Efectividad de la publicacion | > 5% | < 1% |
| **CPC** | Gasto / Clicks | Cuanto pagas por cada visita | Bajo y estable | Subiendo sin mas ventas |

#### Nivel Producto (el mas importante)

| KPI | Formula | Accion |
|-----|---------|--------|
| **ROAS alto + Ventas altas** | ROAS > 5, muchas ventas | Aumentar presupuesto, producto estrella |
| **ROAS alto + Ventas bajas** | ROAS > 5, pocas ventas | Subir presupuesto, tiene potencial |
| **ROAS bajo + Ventas altas** | ROAS < 2, muchas ventas | Optimizar: bajar CPC o mejorar conversion |
| **ROAS bajo + Ventas bajas** | ROAS < 2, pocas ventas | Pausar publicidad, no es rentable |

#### TACOS - La metrica clave

TACOS = Gasto Total Ads / Ventas Totales (organicas + ads) x 100

Es la metrica MAS importante porque muestra si la publicidad esta generando traccion organica:
- **TACOS bajando mes a mes** = las ads estan generando ventas organicas (ideal)
- **TACOS estable** = las ads mantienen las ventas pero no generan organico
- **TACOS subiendo** = dependencia creciente de publicidad (alerta)

Para calcular TACOS necesitamos cruzar `ads_metricas_diarias.costo` con `ordenes_meli` (ventas totales).

### Vista propuesta

```
+---------------------------------------------------------------+
|  ADS ANALYTICS                              [Sync] [PDF]       |
+---------------------------------------------------------------+
| Periodo: [Ultimos 30 dias v]  Campana: [Todas v]              |
+---------------------------------------------------------------+
| KPI Cards:                                                     |
| [Gasto Total] [ROAS] [ACOS] [TACOS] [Ventas Ads] [Organicas] |
+---------------------------------------------------------------+
| Grafico 1: Linea diaria - Gasto vs Revenue atribuido          |
| Grafico 2: TACOS mensual (tendencia)                           |
+---------------------------------------------------------------+
| Tabla por producto:                                            |
| SKU | Producto | Impresiones | Clicks | CTR | Gasto |         |
|     | CPC | Ventas Ads | Revenue | ROAS | ACOS | Accion       |
+---------------------------------------------------------------+
| Semaforo por producto:                                         |
| [verde] Estrella  [amarillo] Optimizar  [rojo] Pausar         |
+---------------------------------------------------------------+
```

---

## Plan de Implementacion

### Fase 1: Billing ML (mas simple, valor inmediato)

| Paso | Tarea | Detalle |
|------|-------|---------|
| 1.1 | Crear tablas | `billing_periodos` + `billing_detalle` en Supabase Meli |
| 1.2 | Edge Function sync | Llamar a `/billing/monthly/periods`, `/summary`, `/details` |
| 1.3 | Vista basica | Selector de periodo + KPI cards + tabla detalle |
| 1.4 | Grafico tendencia | Barras apiladas ultimos 6-12 meses |
| 1.5 | PDF resumen | Resumen mensual exportable |

### Fase 2: Ads Analytics (mas complejo, mayor impacto)

| Paso | Tarea | Detalle |
|------|-------|---------|
| 2.1 | Crear tablas | `ads_campanas` + `ads_metricas_diarias` en Supabase Meli |
| 2.2 | Edge Function sync | Llamar a campaigns + metricas diarias por item |
| 2.3 | Sync diario | Registrar metricas dia a dia (max 90 dias atras) |
| 2.4 | Vista con KPIs | ROAS, ACOS, TACOS, CTR, CPC |
| 2.5 | Graficos | Gasto vs Revenue diario, TACOS mensual |
| 2.6 | Semaforo productos | Clasificar productos por rendimiento publicitario |
| 2.7 | Calculo TACOS | Cruzar gasto ads con ventas totales de ordenes_meli |
| 2.8 | PDF reporte | Reporte mensual de rendimiento publicitario |

### Fase 3: P&L Integrado (opcional, une todo)

| Paso | Tarea | Detalle |
|------|-------|---------|
| 3.1 | Vista P&L mensual | Ventas brutas - Costos ML - Ads - Envios = Margen |
| 3.2 | P&L por producto | Rentabilidad real por SKU |
| 3.3 | Tendencias | Margen mensual, deteccion de productos no rentables |

---

## Dependencias

- **OAuth2 activo**: Ya implementado en `auth.js`
- **Scopes necesarios**: Verificar que el token tenga acceso a `/billing` y `/advertising`
- **ordenes_meli**: Ya existe, necesaria para calcular TACOS y ventas totales
- **Edge Functions**: El sync de ads/billing seria similar al actual `sync-meli`

## Notas tecnicas

- La API de Billing es relativamente simple: GET con token
- La API de Ads tiene limite de 90 dias, asi que conviene sincronizar al menos semanalmente para no perder datos historicos
- TACOS requiere ventas totales (organicas + ads), que obtenemos de ordenes_meli
- El semaforo de productos se puede calcular automaticamente con reglas sobre ROAS y volumen

---

Sources consultadas:
- https://developers.mercadolibre.com.ar/en_us/billing-reports
- https://developers.mercadolibre.com.ar/en_us/product-ads-us-read
- https://developers.mercadolibre.com.ar/en_us/metrics
- https://developers.mercadolibre.com.ar/devsite/campaigns-ads-and-metrics
- https://myrealprofit.com/blog/acos-vs-tacos-vs-roas/
- https://www.sellerapp.com/blog/amazon-profit-and-loss-statement/
