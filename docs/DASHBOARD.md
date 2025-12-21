# Dashboard de Ventas

## Resumen

El Dashboard muestra KPIs de ventas en tiempo real, usando **ventas netas** (despues de comisiones ML) en lugar de ventas brutas.

---

## KPIs Disponibles

| KPI | Descripcion | Fuente |
|-----|-------------|--------|
| **Ventas Netas** | Suma de neto_recibido | ordenes_meli.neto_recibido |
| **Ordenes** | Cantidad de ordenes unicas | COUNT(DISTINCT id_orden) |
| **Costo Meli** | % promedio de comisiones + envio | AVG(pct_costo_meli) |
| **Publicidad** | Inversion en ads del periodo | costos_publicidad.costo_diario |
| **ACOS** | Advertising Cost of Sales | (publicidad / ventas) * 100 |

---

## Funciones RPC

El Dashboard usa funciones PostgreSQL para calculos eficientes:

### obtener_kpis_dashboard(fecha_desde, fecha_hasta)

Retorna:
- `ventas_netas` - Total neto recibido
- `cantidad_ordenes` - Ordenes unicas
- `items_vendidos` - Cantidad de items
- `inversion_publicidad` - Gasto en ads
- `acos` - % costo publicitario
- `pct_costo_meli_promedio` - % promedio comisiones ML
- `ultima_actualizacion_ordenes` - Timestamp ultima orden
- `ultima_actualizacion_publicidad` - Fecha ultimo dato de ads

### obtener_ventas_diarias(fecha_desde, fecha_hasta)

Retorna array para grafico:
- `fecha` - Dia
- `ventas` - Total vendido
- `ordenes` - Cantidad ordenes
- `publicidad` - Gasto en ads

### obtener_top_productos(fecha_desde, fecha_hasta, limite)

Retorna top productos vendidos:
- `id_item` - ID publicacion ML
- `sku` - SKU (desde orden o publicaciones_meli)
- `titulo` - Nombre del producto
- `cantidad_vendida` - Unidades
- `total_vendido` - Neto recibido

---

## Periodos de Filtro

| Boton | Rango |
|-------|-------|
| Hoy | Solo hoy |
| Ayer | Solo ayer |
| 7 dias | Ultimos 7 dias |
| Mes actual | 1ro del mes hasta hoy |
| Mes anterior | Mes calendario anterior |
| Personalizado | Fechas custom |

---

## Neto Recibido vs Ventas Brutas

**Importante:** El sistema usa `neto_recibido` (ventas reales despues de comisiones) en lugar de `cantidad * precio_unitario` (ventas brutas).

### Como se obtiene el neto_recibido

La Edge Function `sync-meli` llama a la API de ML:

```
GET /collections/{payment_id}
```

Y extrae:
```javascript
collectionData.transaction_details.net_received_amount
// o
collectionData.net_received_amount
```

### Distribucion proporcional

Para ordenes con multiples items, el neto se distribuye proporcionalmente:

```javascript
itemNetAmount = orderNetAmount * (itemPrice / orderTotalAmount)
```

---

## Manejo del Delay en Publicidad

La API de ML devuelve costos de publicidad con **2 dias de atraso**.

### Solucion implementada

1. Obtener ultimo costo conocido
2. Contar dias sin datos (hoy y ayer)
3. Rellenar con el ultimo valor

```sql
IF p_fecha_hasta >= CURRENT_DATE - INTERVAL '2 days' THEN
    v_publicidad := v_publicidad + (v_ultimo_costo * v_dias_faltantes);
END IF;
```

---

## Sincronizacion Manual

El boton "Sincronizar ML" en el Dashboard:

1. Llama a la Edge Function `sync-meli`
2. Sincroniza ordenes (ultimos 30 dias)
3. Sincroniza inventario Full
4. Recarga los datos del Dashboard

```javascript
await supabase.functions.invoke('sync-meli', {
    body: { action: 'sync-all' }
});
```

---

## Archivos Relacionados

| Archivo | Descripcion |
|---------|-------------|
| `src/modules/dashboard.js` | Modulo frontend |
| `supabase/functions_dashboard_v3.sql` | Funciones RPC |
| `supabase/functions/sync-meli/index.ts` | Edge Function |
| `supabase/cron_sync_meli.sql` | Configuracion pg_cron |

---

## Fallback JS

Si las funciones RPC no existen, el Dashboard calcula en JavaScript:

```javascript
cargarDatosFallback: async () => {
    const { data: ordenes } = await supabase
        .from('ordenes_meli')
        .select('*');

    // Calcular KPIs en JS...
    kpis.ventas_netas = ordenes.reduce((sum, o) =>
        sum + parseFloat(o.neto_recibido || 0), 0);
}
```

---

*Ultima actualizacion: Diciembre 2025*
