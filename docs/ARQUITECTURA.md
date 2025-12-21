# Arquitectura Tecnica - Meli Full 3PL

## 1. Vision General

Esta aplicacion es una migracion del sistema original en Google Apps Script (GAS) hacia una arquitectura moderna basada en Supabase y Vercel.

### Objetivos de la Migracion

1. **Escalabilidad**: PostgreSQL en lugar de Google Sheets
2. **Performance**: Calculos en DB via funciones RPC
3. **Mantenibilidad**: Codigo modular ES6
4. **Deploy continuo**: GitHub + Vercel

---

## 2. Patron de Modulos

Cada modulo de la aplicacion sigue un patron consistente:

```javascript
// src/modules/ejemplo.js

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda } from '../utils.js';

// Estado local del modulo
let datos = [];
let configuracion = {};

export const moduloEjemplo = {

    // Renderiza el HTML en el contenedor
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto">
                <!-- HTML con Tailwind CSS -->
            </div>
        `;

        // Cargar datos iniciales
        await moduloEjemplo.cargarDatos();

        // Exponer en window para eventos onclick
        window.moduloEjemplo = moduloEjemplo;
    },

    // Obtiene datos de Supabase
    cargarDatos: async () => {
        try {
            // Preferir RPC para calculos complejos
            const { data, error } = await supabase.rpc('funcion_rpc', {
                parametro: valor
            });

            if (error) throw error;
            datos = data;

            // Pintar UI
            moduloEjemplo.pintarTabla();

        } catch (error) {
            console.error('Error:', error);
            // Fallback a calculo JS si RPC no existe
            await moduloEjemplo.cargarDatosFallback();
        }
    },

    // Fallback si RPC no esta disponible
    cargarDatosFallback: async () => {
        const { data } = await supabase
            .from('tabla')
            .select('*');
        // Procesar en JS...
    },

    // Metodos de UI
    pintarTabla: () => { ... },
    manejarEvento: () => { ... }
};

// Exponer globalmente
window.moduloEjemplo = moduloEjemplo;
```

---

## 3. Router SPA

El router maneja la navegacion sin recargar la pagina:

```javascript
// src/router.js

import { moduloCalculadora } from './modules/calculadoraEnvios.js';
import { moduloDashboard } from './modules/dashboard.js';
// ... otros modulos

export const router = {
    navegar: (ruta) => {
        // 1. Actualizar titulo
        document.getElementById('page-title').innerText = titulos[ruta];

        // 2. Limpiar contenedor
        const appContent = document.getElementById('app-content');
        appContent.innerHTML = '';

        // 3. Resaltar menu activo
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.onclick?.includes(ruta));
        });

        // 4. Cargar modulo
        switch(ruta) {
            case 'dashboard':
                moduloDashboard.render(appContent);
                break;
            case 'calculadora':
                moduloCalculadora.render(appContent);
                break;
            // ...
        }
    }
};

window.router = router;
```

---

## 4. Funciones RPC en Supabase

### Filosofia

Los calculos pesados se hacen en PostgreSQL via funciones RPC:
- Menos datos transferidos al cliente
- Logica centralizada
- Mejor performance

### Estructura de una Funcion RPC

```sql
CREATE OR REPLACE FUNCTION nombre_funcion(
    p_parametro1 DATE,
    p_parametro2 INTEGER DEFAULT 10
)
RETURNS TABLE (
    columna1 TEXT,
    columna2 NUMERIC,
    columna3 INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_variable NUMERIC := 0;
BEGIN
    -- Logica SQL
    RETURN QUERY
    SELECT ...
    FROM tabla
    WHERE condicion;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION nombre_funcion TO anon, authenticated;
```

### Llamada desde Frontend

```javascript
const { data, error } = await supabase.rpc('nombre_funcion', {
    p_parametro1: '2025-01-01',
    p_parametro2: 15
});
```

---

## 5. Utilidades Comunes

El archivo `src/utils.js` contiene helpers reutilizables:

| Funcion | Descripcion |
|---------|-------------|
| `mostrarNotificacion(msg, tipo)` | Toast notification |
| `formatearMoneda(valor)` | Formato $1.234.567 |
| `formatearFecha(iso)` | Formato DD/MM/YYYY |
| `formatearHora(iso)` | Formato HH:MM |
| `formatearPorcentaje(valor)` | Formato 12.5% |
| `formatearNumero(valor)` | Formato 1.234 |
| `confirmarAccion(titulo, msg)` | Modal de confirmacion |
| `generarId(prefijo)` | ID unico con timestamp |
| `colorRiesgo(nivel)` | Clases CSS por nivel |

---

## 6. Esquema de Base de Datos

### Diagrama Relacional

```
publicaciones_meli (SKU PK)
    │
    ├──► ordenes_meli (id_item FK)
    │
    ├──► sugerencias_envio_full (sku FK)
    │
    └──► detalle_envios_full (sku FK)
              │
              └──► registro_envios_full (id_envio FK)

costos_publicidad (fecha PK)

config_logistica (parametro PK)

config_meli (clave PK)
```

### Campos Importantes

**publicaciones_meli:**
- `sku` (PK) - Codigo unico del producto
- `id_publicacion` - MLA... de Mercado Libre
- `tipo_logistica` - 'fulfillment', 'flex', etc
- `stock_full` - Stock en bodega ML
- `stock_transito` - Enviado pero no ingresado
- `ventas_dia` - Promedio diario calculado
- `ventas_90d` - Ventas ultimos 90 dias

**ordenes_meli:**
- `id_orden` (PK) - ID de la orden
- `fecha_pago` - Fecha de pago (puede ser NULL)
- `fecha_creacion` - Fecha de creacion
- `neto_recibido` - Monto neto despues de comisiones

---

## 7. Consideraciones Especiales

### Delay en Costos de Publicidad

La API de ML devuelve costos con 2 dias de atraso.

**Solucion implementada:**
```sql
-- En las funciones RPC:
IF p_fecha_hasta >= CURRENT_DATE - INTERVAL '2 days' THEN
    -- Contar dias sin dato
    SELECT COUNT(*) INTO v_dias_faltantes
    FROM generate_series(...) AS d
    WHERE NOT EXISTS (SELECT 1 FROM costos_publicidad WHERE fecha = d);

    -- Rellenar con ultimo valor conocido
    v_publicidad := v_publicidad + (v_ultimo_costo * v_dias_faltantes);
END IF;
```

### Manejo de Fechas

- Ordenes pueden tener `fecha_pago` NULL
- Usar COALESCE para fallback a `fecha_creacion`
- Siempre trabajar con DATE para comparaciones

### Fallback Pattern

Cada modulo implementa fallback JS:

```javascript
try {
    // Intentar RPC
    const { data, error } = await supabase.rpc('funcion');
    if (error) throw error;
} catch (err) {
    // Fallback: calcular en JS
    await this.cargarDatosFallback();
}
```

---

## 8. Flujo de Autenticacion

```
1. Usuario hace clic "Conectar ML"
   └──► moduloAuth.iniciarAutorizacion()
        └──► Redirige a auth.mercadolibre.com.ar

2. Usuario autoriza en ML
   └──► Redirige a callback.html?code=XXX

3. callback.html
   └──► Intercambia code por tokens (POST /oauth/token)
   └──► Guarda tokens en config_meli (Supabase)
   └──► Redirige a index.html

4. Uso de API ML
   └──► Lee access_token de config_meli
   └──► Si expira, usa refresh_token para renovar
```

---

## 9. Edge Functions

Para operaciones que requieren backend (sincronizacion con ML):

```typescript
// supabase/functions/sync-meli/index.ts

import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from '@supabase/supabase-js'

serve(async (req) => {
    const { action } = await req.json()

    // Obtener token de config_meli
    const { data: tokenData } = await supabase
        .from('config_meli')
        .select('valor')
        .eq('clave', 'access_token')
        .single()

    // Llamar API de ML
    const response = await fetch('https://api.mercadolibre.com/...', {
        headers: { Authorization: `Bearer ${tokenData.valor}` }
    })

    // Guardar en Supabase
    // ...

    return new Response(JSON.stringify({ success: true }))
})
```

---

## 10. Proximos Pasos de Desarrollo

### Modulo Precios (Prioridad Alta)

1. Crear `supabase/functions_precios.sql`
2. Crear `src/modules/precios.js`
3. Funcionalidades:
   - Carga de precios actuales
   - Modificacion masiva (% o monto fijo)
   - Redondeo psicologico (terminar en 3,5,7,9)
   - Prevencion de conflictos con promos activas
   - Historial de cambios

### Modulo Stock Hibrido

1. Unificar vista Full + Flex
2. Activar/desactivar Flex por producto
3. Pausar/activar publicaciones

### Modulo 3PL

1. Redisenar reconciliacion
2. Preparacion con escaner
3. Generacion de PDFs

---

*Documento vivo - actualizar con cada cambio significativo*
