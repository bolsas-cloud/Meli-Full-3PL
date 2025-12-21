# Meli Full 3PL

Sistema de gestion integral para operaciones de Mercado Libre con logistica Fulfillment y 3PL.

## Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Frontend | Vanilla JavaScript (ES6 Modules) + Tailwind CSS |
| Backend/DB | Supabase (PostgreSQL) |
| Auth | OAuth2 con Mercado Libre |
| Hosting | Vercel |
| Graficos | Chart.js |

## Estructura del Proyecto

```
Meli-Full-3PL/
├── src/
│   ├── config.js           # Configuracion Supabase + ML
│   ├── main.js             # Punto de entrada
│   ├── router.js           # SPA Router
│   ├── utils.js            # Utilidades comunes
│   └── modules/
│       ├── auth.js         # Autenticacion OAuth2
│       ├── calculadoraEnvios.js  # Calculadora de reposicion
│       ├── enviosCreados.js      # Gestion de envios
│       └── dashboard.js          # Dashboard KPIs
├── supabase/
│   ├── schema.sql          # Esquema principal
│   ├── functions_calculos.sql    # RPCs calculadora
│   ├── functions_dashboard.sql   # RPCs dashboard
│   └── functions/
│       └── sync-meli/      # Edge Function sincronizacion
├── GAS/                    # Codigo original (Google Apps Script)
│   ├── scripts/            # Archivos .gs
│   ├── html/               # Dashboard.html original
│   └── docs/               # Documentacion legacy
├── index.html              # SPA principal
├── callback.html           # OAuth callback
└── migracion.html          # Herramienta de importacion
```

## Modulos

### Implementados

| Modulo | Estado | Archivo |
|--------|--------|---------|
| Autenticacion OAuth2 | Completo | `src/modules/auth.js` |
| Calculadora Envios | Completo | `src/modules/calculadoraEnvios.js` |
| Envios Creados | ~85% | `src/modules/enviosCreados.js` |
| Dashboard | Completo | `src/modules/dashboard.js` |
| Gestion de Precios | Completo | `src/modules/precios.js` |

### Pendientes

| Modulo | Prioridad | Notas |
|--------|-----------|-------|
| Stock Hibrido | Media | Ya existe parcialmente |
| Gestion 3PL | Baja | Requiere rediseno |

## Configuracion

### 1. Supabase

Ejecutar los scripts SQL en orden:

1. `supabase/schema.sql` - Esquema base
2. `supabase/migration_v2.sql` - Columnas de stock
3. `supabase/functions_calculos.sql` - RPCs calculadora
4. `supabase/functions_dashboard.sql` - RPCs dashboard

### 2. Variables de Entorno

En `src/config.js`:

```javascript
SUPABASE_URL: 'https://xxx.supabase.co'
SUPABASE_ANON_KEY: 'eyJ...'
MELI_APP_ID: '...'
MELI_CLIENT_SECRET: '...'
MELI_REDIRECT_URI: 'https://tu-app.vercel.app/callback.html'
```

### 3. Vercel

El proyecto se despliega automaticamente con cada push a `master`.

## Flujo de Datos

```
┌─────────────┐      OAuth2       ┌─────────────┐
│   Usuario   │ ◄──────────────► │ Mercado Libre│
└──────┬──────┘                   └──────┬──────┘
       │                                 │
       │ fetch                           │ API
       ▼                                 ▼
┌─────────────┐      RPC/SQL      ┌─────────────┐
│  Frontend   │ ◄──────────────► │  Supabase   │
│ (Vercel)    │                   │ (PostgreSQL)│
└─────────────┘                   └─────────────┘
```

## Esquema de Base de Datos

### Tablas Principales

| Tabla | Descripcion |
|-------|-------------|
| `publicaciones_meli` | Catalogo de productos (SKU como PK) |
| `ordenes_meli` | Historial de ventas |
| `costos_publicidad` | Inversion diaria en ads |
| `config_logistica` | Parametros calculadora |
| `registro_envios_full` | Envios a ML Fulfillment |
| `detalle_envios_full` | Items por envio |
| `config_meli` | Tokens OAuth |

### Funciones RPC

| Funcion | Uso |
|---------|-----|
| `calcular_sugerencias_envio()` | Calculadora de reposicion |
| `obtener_kpis_dashboard()` | KPIs de ventas y publicidad |
| `obtener_ventas_diarias()` | Datos para grafico |
| `obtener_top_productos()` | Top 15 mas vendidos |

## Desarrollo

### Ejecutar localmente

```bash
# Servir con cualquier servidor estatico
npx serve .

# O usar Live Server de VS Code
```

### Commit y Deploy

```bash
git add .
git commit -m "feat: descripcion del cambio"
git push origin master
# Vercel despliega automaticamente
```

## Notas Importantes

### Delay en Costos de Publicidad

La API de ML devuelve costos con **2 dias de atraso**. El sistema rellena los dias faltantes con el ultimo valor conocido para mantener precision en el ACOS.

### Fallback JS

Si las funciones RPC de Supabase no existen, los modulos tienen logica fallback en JavaScript que calcula los datos localmente (menos eficiente pero funcional).

### Patron de Modulos

Cada modulo sigue la estructura:

```javascript
export const moduloNombre = {
    render: async (contenedor) => { ... },
    cargarDatos: async () => { ... },
    // metodos especificos...
};

window.moduloNombre = moduloNombre;
```

## Links

- **Produccion**: https://meli-full-3-pl.vercel.app
- **Supabase**: https://cpwsdpzxzhlmozzasnqx.supabase.co
- **Repo**: https://github.com/bolsas-cloud/Meli-Full-3PL

---

*Ultima actualizacion: Diciembre 2025*
