# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Meli-Full-3PL is a MercadoLibre fulfillment/3PL management system — a vanilla JavaScript SPA (no framework, no build step) backed by Supabase (PostgreSQL). It manages product listings, stock across warehouses (Full/Flex), shipment calculation, label generation, and integrates with ML's OAuth2 API.

## Running Locally

No build step. Open `index.html` directly or serve with any static server:
```bash
npx serve .
```
Deploys to Vercel on push to `master`.

## Architecture

### Entry Flow
`index.html` → loads `src/main.js` (ES module) → verifies Supabase connection → initializes modules → SPA router.

### Core Files
- **`src/config.js`** — 4 Supabase clients: Meli (`cpwsdpzxzhlmozzasnqx`), Produccion, RRHH, Ventas
- **`src/main.js`** — Entry point, connection verification
- **`src/router.js`** — SPA router, module loading
- **`src/utils.js`** — 12+ utility functions (formatting, modals, notifications, ID generation)

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `auth.js` | OAuth2 with MercadoLibre, token management, auto-refresh |
| `dashboard.js` | Sales KPIs, daily graphs, Pareto analysis |
| `calculadoraEnvios.js` | Shipping calculator using safety stock formula, multi-destination |
| `enviosCreados.js` | Shipment CRUD, preparation workflow, RRHH/Produccion integration |
| `etiquetas.js` | Bulk label generation with barcode (bwip-js) |
| `stock.js` | Stock tracking across warehouses (Full, Flex) |
| `precios.js` | Price management, bulk updates, psychological pricing |
| `publicaciones.js` | Publication/listing management |
| `depositos.js` | Warehouse/depot configuration |
| `remitosEnvio.js` | Invoice generation for 3PL shipments |
| `apiMeli.js` | MercadoLibre API wrapper |
| `mensajes.js` | Inbox unificado preguntas + mensajes ML, sincronización, respuestas rápidas |
| `knowledgeBase.js` | CRUD de documentos para la base de conocimiento del agente IA (RAG) |
| `analiticas.js` | Dashboard analíticas: KPIs atención, gráficos Chart.js, patrones, recomendaciones IA |
| `trafico.js` | Dashboard tráfico: visitas diarias, conversión, performance ML, eventos tienda |

### Module Pattern
```javascript
export const moduloNombre = {
    render: async (contenedor) => { ... },
    cargarDatos: async () => { ... },
};
window.moduloNombre = moduloNombre;
```

## Supabase Ecosystem

This is part of a multi-project ecosystem sharing data across 4 Supabase instances:

| App | Supabase Project | Purpose | Integration |
|-----|-----------------|---------|-------------|
| **Meli-Full-3PL** | `cpwsdpzxzhlmozzasnqx` | **This project** — ML Shipments, Stock | — |
| ProduccionTextilApp | `xukbgcwpmwsxggznxjsj` | Products, OPs, Stock, Formulas | Stock deduction via RPC, read tareas/productos/ubicaciones |
| JornadasyLiquidacionesAPP | `iuigafnkgfihvixolsgw` | RRHH: Workers, Shifts | Read/write preparaciones, colaboradores |
| VentasApp-Cosiditas | `mzqsfahaawqhpooquofu` | Sales: Orders, Remitos | Read/write remitos, transportes |

### Cross-Database Integration
- **Stock deduction via Produccion**: Calls `rpc_registrar_salida_envio_meli` on dispatch → types `SALIDA_ENVIO_FULL` / `SALIDA_ENVIO_3PL` → decrements `stock_actual` in `productos`
- **Reads stock & ubicaciones from Produccion**: Preparation view queries `productos.stock_actual` and `v_productos_ubicaciones` to show current stock and warehouse location per item
- **Reads from Produccion**: `tareas`, `productos` (tipo EMPAQUE) for packing materials
- **Syncs shipments to RRHH**: Writes to `preparaciones` table (tipo: `'ENVIO_MELI'`, id_origen: shipment ID)
- **Writes to VentasApp**: Generates remitos de envio
- **Realtime**: Subscribes to `preparaciones` in RRHH for live preparation status
- Cross-database sync uses direct Supabase clients (NOT FDW)

## Key Tables (Meli Database)

| Table | Purpose |
|-------|---------|
| `publicaciones_meli` | Product catalog (SKU as PK) |
| `ordenes_meli` | Sales history from MercadoLibre |
| `registro_envios` | Unified shipments table (Full + 3PL) |
| `detalle_envios` | Shipment line items (SKU, quantities) |
| `preparacion_en_curso` | Temporary scanning progress during picking |
| `config_meli` | OAuth tokens, user data |
| `config_logistica` | Calculator parameters (transit time, frequency, service level) |
| `costos_publicidad` | Daily ad spend (2-day delay from ML API) |
| `publicaciones_activas` | Active listings on ML |
| `conversaciones_meli` | Inbox unificado preguntas + mensajes post-venta |
| `mensajes_meli` | Mensajes individuales dentro de conversaciones |
| `respuestas_rapidas` | Templates de respuestas rápidas con variables |
| `knowledge_base` | Documentos de la base de conocimiento (RAG) |
| `knowledge_chunks` | Fragmentos con embeddings vectoriales (pgvector 768d) |
| `analisis_mensajes` | Insights y recomendaciones generados por análisis de patrones |
| `visitas_historial` | Historial diario de visitas por publicación (fecha + id_publicacion UNIQUE) |
| `performance_publicaciones` | Score de calidad ML y recomendaciones por publicación |
| `tendencias_ml` | Top keywords de MercadoLibre por semana |
| `eventos_tienda` | Marcadores de eventos manuales y automáticos (promociones, precios, stock) |

## Edge Functions (Supabase)

| Function | Purpose |
|----------|---------|
| `meli-proxy` | Proxy CORS para ML API (browser no puede llamar directo) |
| `meli-webhook` | Recibe notificaciones real-time de ML (questions + messages) |
| `knowledge-processor` | RAG: chunking + embeddings (Gemini gemini-embedding-001) + vector search |
| `meli-agente` | Agente IA con Gemini 3 Flash Preview + 10 tools + agent loop + auto-respuesta |

### Agente IA (meli-agente)

- **Modelo**: Gemini 3 Flash Preview (via `@google/genai`), configurable en `config_meli.ia_modelo`
- **10 tools**: consultar_stock, buscar_publicacion, consultar_orden, consultar_envio, consultar_precio, buscar_conocimiento, obtener_metricas, detectar_patrones_preguntas, reescribir_descripcion, analizar_publicacion
- **System prompt**: vendedor ML, español rioplatense, nunca inventa datos
- **Config**: tabla `config_meli` claves `ia_modelo`, `ia_temperatura`, `ia_max_tokens`, `ia_prompt`, `ia_reglas`
- **RAG**: knowledge_base + knowledge_chunks con pgvector (768 dims, Gemini gemini-embedding-001)
- **Patrón replicado de**: VentasApp-Cosiditas (ver `docs/ARQUITECTURA_AGENTE_IA_RAG.md` en ese repo)

### ML API Integration via Proxy

Las llamadas a la API de MercadoLibre desde el browser **deben pasar por `meli-proxy`** porque ML no soporta CORS. El proxy lee el access_token de `config_meli` automáticamente.

```javascript
const mlFetch = async (endpoint, options) => {
    const url = new URL(ML_PROXY);
    url.searchParams.set('endpoint', path);
    // query params se pasan como params separados del proxy
};
```

## Critical Data Conventions

**IDs are TEXT, not UUID** — Legacy from Google Sheets data.

**Ad Cost Delay**: ML API returns costs with 2-day lag; system fills gaps with last known value.

**Safety Stock Formula**: Used in `calculadoraEnvios` for replenishment suggestions.

## PWA

- Service Worker: network-first with cache fallback
- Excludes Supabase/MercadoLibre API calls from caching
- Stale-while-revalidate for local assets

## Workflow: Commit y Push Cross-Proyecto

Al terminar modificaciones en cualquier proyecto del ecosistema, **ofrecer commit y push** del proyecto afectado. Los directorios de cada proyecto son:

| Proyecto | Directorio | Branch |
|----------|-----------|--------|
| ProduccionTextilApp | `c:\Users\danie\Desktop\ProduccionTextilApp` | master |
| JornadasyLiquidacionesAPP | `c:\Users\danie\Desktop\JornadasyLiquidacionesAPP` | main |
| **Meli-Full-3PL** | `c:\Users\danie\Desktop\Meli-Full-3PL` | master |
| VentasApp-Cosiditas | `c:\Users\danie\Desktop\VentasApp-Cosiditas` | master |
| TalleresPWA | `c:\Users\danie\Desktop\TalleresPWA` | master |

## Language

All code identifiers, UI text, variable names, and comments are in **Spanish**.

## Versionado

La versión se muestra en el sidebar (`index.html`, línea ~156): `<span class="text-white/50">vX.Y.Z</span>`.

**Regla obligatoria:** Al hacer commit de cambios funcionales (features, fixes, mejoras), **siempre incrementar la versión** en el sidebar:
- **Patch** (v1.8.0 → v1.8.1): bug fixes menores
- **Minor** (v1.8.0 → v1.9.0): nueva funcionalidad o mejora significativa
- **Major** (v1.8.0 → v2.0.0): cambios breaking o reestructuración mayor

No incrementar para cambios puramente cosméticos, docs, o configuración.

Currently v1.20.0.
