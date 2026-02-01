# Integración de Remitos: Meli-Full-3PL + VentasApp-Cosiditas

## Objetivo

Unificar la numeración de remitos entre:
- **Remitos de Venta** (VentasApp-Cosiditas) - Envíos a clientes
- **Remitos de Envío 3PL** (Meli-Full-3PL) - Envíos a depósitos externos

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (VentasApp)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────────────────────────────┐   │
│  │  pedidos    │     │            remitos                  │   │
│  └──────┬──────┘     │  ┌─────────────────────────────┐   │   │
│         │            │  │ tipo_remito = 'VENTA'       │   │   │
│         └────────────┼──│ id_pedido_origen = UUID     │   │   │
│                      │  │ cliente = datos pedido      │   │   │
│                      │  └─────────────────────────────┘   │   │
│                      │                                     │   │
│                      │  ┌─────────────────────────────┐   │   │
│                      │  │ tipo_remito = 'ENVIO_3PL'   │   │   │
│  ┌─────────────┐     │  │ id_envio_3pl = TEXT         │◄──┼───┼── Meli-Full-3PL
│  │ transportes │◄────┼──│ nombre_destino_3pl = TEXT   │   │   │
│  └─────────────┘     │  └─────────────────────────────┘   │   │
│                      └─────────────────────────────────────┘   │
│                                                                 │
│  RPC: get_next_remito_id() ─► Numeración correlativa única     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Campos Nuevos en Tabla `remitos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tipo_remito` | TEXT | 'VENTA' (default) o 'ENVIO_3PL' |
| `id_envio_3pl` | TEXT | ID del envío en Meli-Full-3PL |
| `id_destino_3pl` | TEXT | ID del depósito destino |
| `nombre_destino_3pl` | TEXT | Nombre del depósito (desnormalizado) |

## Script SQL

Ubicación: `VentasApp-Cosiditas/scripts/EXTEND_REMITOS_3PL.sql`

Ejecutar en Supabase SQL Editor de VentasApp antes de implementar.

---

## Cambios en VentasApp-Cosiditas

### 1. Módulo `remitos.js`

#### A. Agregar pestañas de filtro por tipo

```html
<!-- En el header del módulo -->
<div class="flex gap-2 mb-4">
    <button onclick="filtrarPorTipo('todos')"
            class="tab-tipo px-4 py-2 rounded-lg text-sm font-medium bg-brand text-white"
            data-tipo="todos">
        Todos
    </button>
    <button onclick="filtrarPorTipo('VENTA')"
            class="tab-tipo px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600"
            data-tipo="VENTA">
        <i class="fas fa-user mr-1"></i> Ventas
    </button>
    <button onclick="filtrarPorTipo('ENVIO_3PL')"
            class="tab-tipo px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600"
            data-tipo="ENVIO_3PL">
        <i class="fas fa-warehouse mr-1"></i> Envíos 3PL
    </button>
</div>
```

#### B. Modificar función de búsqueda para usar RPC v2

```javascript
// Cambiar de buscar_remitos a buscar_remitos_v2
const { data, error } = await sb.rpc('buscar_remitos_v2', {
    search_term: termino,
    p_tipo_remito: filtroTipoActual, // null = todos
    p_limit: 50
});
```

#### C. Modificar renderizado de tarjetas

```javascript
// Badge según tipo
const badge = remito.tipo_remito === 'ENVIO_3PL'
    ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
           <i class="fas fa-warehouse mr-1"></i> 3PL
       </span>`
    : `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
           <i class="fas fa-user mr-1"></i> Venta
       </span>`;

// Destinatario según tipo
const destinatario = remito.tipo_remito === 'ENVIO_3PL'
    ? remito.nombre_destino_3pl
    : remito.cliente_nombre;
```

#### D. Deshabilitar edición para remitos 3PL

```javascript
// Los remitos 3PL se gestionan desde Meli-Full-3PL
if (remito.tipo_remito === 'ENVIO_3PL') {
    btnEditar.disabled = true;
    btnEditar.title = 'Gestionar desde Meli-Full-3PL';
}
```

---

## Implementación en Meli-Full-3PL

### 1. Configuración de conexión a Supabase de VentasApp

```javascript
// src/config.js - Agregar segunda conexión
import { createClient } from '@supabase/supabase-js';

// Conexión principal (Meli-Full-3PL)
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Conexión a VentasApp para remitos
export const supabaseVentas = createClient(
    'https://xxx.supabase.co',  // URL de VentasApp
    'eyJxxx...'                  // Anon key de VentasApp
);
```

### 2. Función para generar remito 3PL

```javascript
// src/modules/remitosEnvio.js

import { supabaseVentas } from '../config.js';

export async function generarRemito3PL(envio, destino, transporte, bultos, valorDeclarado, notas) {

    // 1. Obtener siguiente número de remito
    const { data: nextId, error: rpcError } = await supabaseVentas
        .rpc('get_next_remito_id', { p_sucursal: '0001' });

    if (rpcError) throw new Error(`Error obteniendo número de remito: ${rpcError.message}`);

    // 2. Insertar cabecera del remito
    const remitoData = {
        id_remito_original: nextId,
        tipo_remito: 'ENVIO_3PL',
        id_envio_3pl: envio.id_envio,
        id_destino_3pl: destino.id_destino,
        nombre_destino_3pl: destino.nombre,
        id_transporte: transporte.id,
        tipo_envio: 'A Domicilio',
        bultos: bultos,
        valor_declarado: valorDeclarado || 0,
        notas: notas || `Envío a ${destino.nombre}`,
        fecha_emision: new Date().toISOString()
    };

    const { data: remito, error: insertError } = await supabaseVentas
        .from('remitos')
        .insert(remitoData)
        .select()
        .single();

    if (insertError) throw new Error(`Error creando remito: ${insertError.message}`);

    // 3. Insertar detalles del remito
    // Nota: id_producto en VentasApp puede no coincidir con SKU de Meli
    // Opción A: Usar SKU como texto en un campo nuevo
    // Opción B: Mapear SKU a id_producto de VentasApp

    const detalles = envio.productos.map(p => ({
        id_remito: remito.id,
        sku: p.sku,              // Campo nuevo a agregar en remito_detalles
        descripcion: p.titulo,   // Campo nuevo a agregar
        cantidad_enviada: p.cantidad_enviada
    }));

    const { error: detallesError } = await supabaseVentas
        .from('remito_detalles')
        .insert(detalles);

    if (detallesError) throw new Error(`Error insertando detalles: ${detallesError.message}`);

    // 4. Guardar referencia en registro_envios de Meli-Full-3PL
    await supabase
        .from('registro_envios')
        .update({
            id_remito: remito.id,
            numero_remito: nextId
        })
        .eq('id_envio', envio.id_envio);

    return {
        id: remito.id,
        numero: nextId,
        ...remitoData
    };
}
```

### 3. Campos adicionales en `remito_detalles`

```sql
-- Ejecutar en VentasApp Supabase
ALTER TABLE remito_detalles
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Hacer id_producto nullable (solo requerido para VENTA)
ALTER TABLE remito_detalles
ALTER COLUMN id_producto DROP NOT NULL;
```

### 4. Campos adicionales en `registro_envios` (Meli-Full-3PL)

```sql
-- Ejecutar en Meli-Full-3PL Supabase
ALTER TABLE registro_envios
ADD COLUMN IF NOT EXISTS id_remito UUID,
ADD COLUMN IF NOT EXISTS numero_remito TEXT;
```

---

## Flujo de Usuario

### Desde Meli-Full-3PL:

1. Usuario crea envío a depósito 3PL (ej: BlueMail)
2. Cambia estado a "Despachado"
3. Click en botón "Generar Remito"
4. Modal solicita:
   - Transporte (select de transportes de VentasApp)
   - Cantidad de bultos
   - Valor declarado (opcional)
   - Notas (opcional)
5. Sistema:
   - Obtiene número correlativo R-0001-XXXXX
   - Inserta remito en VentasApp con tipo='ENVIO_3PL'
   - Genera PDF
   - Guarda referencia en envío

### Desde VentasApp:

1. Usuario entra al módulo Remitos
2. Ve pestañas: [Todos] [Ventas] [Envíos 3PL]
3. Remitos 3PL muestran:
   - Badge azul [3PL]
   - Destino en lugar de cliente
   - Referencia al envío
4. Acciones disponibles:
   - Ver PDF
   - Ver en Meli-Full-3PL (link)
   - NO editar (gestionado desde otra app)

---

## Consideraciones

### Transportes

La tabla `transportes` está en VentasApp. Opciones:

1. **Replicar a Meli-Full-3PL** - Copia de la tabla para selección local
2. **Consultar en tiempo real** - Query a VentasApp al cargar modal
3. **Configurar en depósito** - Cada destino tiene transporte default

Recomendado: Opción 2 o 3

### Productos

Los productos de Meli (SKU) no están en la tabla `productos` de VentasApp.
Solución: Agregar campos `sku` y `descripcion` a `remito_detalles` para almacenar info sin FK.

### Seguridad

- Las credenciales de VentasApp deben estar protegidas
- Considerar crear un usuario de servicio con permisos limitados
- RLS debe permitir inserts desde Meli-Full-3PL

---

## Archivos a Modificar

| App | Archivo | Cambios |
|-----|---------|---------|
| VentasApp | `scripts/EXTEND_REMITOS_3PL.sql` | Nuevas columnas, RPC v2 |
| VentasApp | `modules/remitos.js` | Pestañas, badges, filtros |
| Meli-Full | `src/config.js` | Conexión a VentasApp |
| Meli-Full | `src/modules/remitosEnvio.js` | Función generarRemito3PL |
| Meli-Full | `src/modules/enviosCreados.js` | Botón y modal de remito |
