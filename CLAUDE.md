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

## Version

Currently v1.7.0.
