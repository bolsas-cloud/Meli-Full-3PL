# Módulo: Gestión de Precios

## Descripción

Permite visualizar, modificar y actualizar precios de publicaciones en Mercado Libre de forma masiva, con previsualización, redondeo psicológico automático y cálculo de costos de envío gratis.

---

## Tabs Disponibles

El módulo tiene 3 tabs:

1. **Gestión de Precios**: Tabla principal para ver y modificar precios
2. **Historial de Precios**: Evolución de precios basado en órdenes de venta
3. **Configuración Costos**: Configurar costos de envío y fijos de ML

---

## Flujo de Uso

```
1. Entrar a sección "Precios"
   └── Se sincronizan precios y comisiones desde ML

2. Seleccionar productos (checkbox)

3. Ingresar modificación:
   └── Tipo: Porcentaje (%) o Monto fijo ($)
   └── Valor: positivo (aumentar) o negativo (reducir)

4. Click "Previsualizar"
   └── Calcula nuevo precio
   └── Aplica redondeo psicológico automático
   └── Muestra preview en amarillo

5. Revisar cambios

6. Click "Guardar en ML"
   └── Envía a API de Mercado Libre
   └── Guarda en historial de cambios
```

---

## Redondeo Psicológico

El redondeo psicológico es **automático** y **obligatorio**. Fuerza que los precios terminen en 3, 5, 7 o 9 (siempre redondeando hacia arriba).

### Algoritmo

```javascript
function redondearPrecioPsicologico(precio) {
    let entero = Math.round(precio);
    let ultimoDigito = entero % 10;
    let diferencia = 0;

    if (ultimoDigito <= 3) {
        diferencia = 3 - ultimoDigito;  // 0,1,2,3 → 3
    } else if (ultimoDigito <= 5) {
        diferencia = 5 - ultimoDigito;  // 4,5 → 5
    } else if (ultimoDigito <= 7) {
        diferencia = 7 - ultimoDigito;  // 6,7 → 7
    } else {
        diferencia = 9 - ultimoDigito;  // 8,9 → 9
    }

    return entero + diferencia;
}
```

### Ejemplos

| Precio Calculado | Resultado |
|------------------|-----------|
| $1,540.80 | $1,543 |
| $12,500 | $12,503 |
| $15,998 | $15,999 |
| $24,001 | $24,003 |

---

## Columnas de la Tabla

| Columna | Descripción |
|---------|-------------|
| SKU | Código del producto |
| Producto | Título de la publicación |
| Peso | Peso del producto (para cálculo de envío) |
| Precio | Precio vigente en ML |
| Nuevo | Precio calculado (después de previsualizar) |
| Neto | Precio - Comisiones - Impuestos - Envío gratis |
| 🚚 | Indica si tiene costo de envío gratis |
| +% | Markup sobre neto (cuánto carga ML) |
| Est. | Estado: Activa / Pausada |

---

## Cálculo del Neto Estimado (v1.7.0)

El neto ahora incluye los costos de envío gratis:

```
Neto = Precio - Comisión - Cargo Fijo - Impuestos - Costo Envío Gratis
```

### Costo de Envío Gratis

- **Solo aplica** si el producto tiene `tiene_envio_gratis = true`
- El costo depende del **peso** del producto
- Si el precio >= $33,000, se aplica 50% de descuento en envío

### Desglose (Tooltip)

Al pasar el mouse sobre el Neto, se muestra:
- Precio
- Comisión ML
- Costo fijo
- Impuestos
- Envío gratis
- **NETO**

---

## Configuración de Costos ML (v1.7.0)

Nueva pestaña para configurar los costos que aplica Mercado Libre.

### Tabla: config_umbrales_ml

| Clave | Valor Default | Descripción |
|-------|---------------|-------------|
| umbral_envio_gratis | 33000 | Precio mínimo para 50% descuento en envío |
| peso_default_gr | 500 | Peso por defecto si no hay dato |

### Tabla: config_costos_fijos_ml

Costos fijos según rango de precio (para productos < umbral):

| Desde | Hasta | Costo Fijo |
|-------|-------|------------|
| $0 | $15,000 | $1,115 |
| $15,000 | $25,000 | $2,300 |
| $25,000 | $33,000 | $2,810 |
| $33,000+ | - | $0 |

### Tabla: config_costos_envio_ml

Costos de envío gratis según peso:

| Peso | Sin Descuento | Con Descuento (50%) |
|------|---------------|---------------------|
| 0-300g | $10,766 | $5,383 |
| 300-500g | $11,646 | $5,823 |
| 500g-1kg | $12,526 | $6,263 |
| 1-2kg | $14,001 | $7,001 |
| ... | ... | ... |

---

## Columna +% ML (Markup)

Muestra cuánto porcentaje hay que cargarle al neto para llegar al precio de venta:

```
+% ML = (Precio - Neto) / Neto × 100
```

Ejemplo: Si el neto es $10,000 y el precio $14,300, el markup es +43%.

---

## Edge Function: sync-meli

### Acción: sync-prices

Sincroniza precios, comisiones, peso y envío gratis desde ML.

```typescript
// Obtiene:
- item.price
- item.category_id
- item.listing_type_id
- item.shipping.free_shipping
- item.shipping.dimensions.weight

// Guarda en publicaciones_meli:
- precio
- categoria_id
- tipo_publicacion
- comision_ml
- cargo_fijo_ml
- impuestos_estimados
- neto_estimado
- tiene_envio_gratis
- peso_gr (preserva valores manuales)
```

### Acción: update-prices

Actualiza precios en Mercado Libre.

```typescript
// Para cada producto:
PUT /items/{itemId}
body: { price: nuevoPrecio }

// Guarda en:
- publicaciones_meli (precio actualizado)
- historial_cambio_precios (auditoría)
```

---

## Sistema de Tracking de Fallos

Cuando una actualización de precio falla (ej: producto con promoción activa), el sistema registra el fallo para poder reintentar posteriormente.

### Tabla: precios_actualizacion_fallidas

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| sku | TEXT | SKU del producto |
| id_publicacion | TEXT | ID publicación ML |
| titulo | TEXT | Título del producto |
| precio_anterior | NUMERIC | Precio antes del intento |
| precio_nuevo | NUMERIC | Precio que se intentó aplicar |
| tipo_modificacion | TEXT | 'porcentaje' o 'fijo' |
| valor_modificacion | NUMERIC | Valor aplicado (ej: 10 para +10%) |
| fecha_intento | TIMESTAMP | Cuándo se intentó |
| error_mensaje | TEXT | Error devuelto por ML |
| estado | TEXT | 'pendiente', 'reintentado', 'resuelto', 'descartado' |
| fecha_resolucion | TIMESTAMP | Cuándo se resolvió |

### Indicadores Visuales

- **Filtro "Con Fallos"**: Botón rojo que aparece solo si hay fallos pendientes
- **Botón "Limpiar"**: Descarta todos los fallos pendientes de una vez
- **Badge rojo**: Junto al SKU muestra cantidad de intentos fallidos
- **Fila roja**: Productos con fallos pendientes aparecen destacados
- **Precio pendiente**: Muestra el precio que se intentó aplicar

### Flujo de Reintento

```
1. Al guardar en ML, algunos fallan
   └── Se muestra modal con resumen (exitosos/fallidos)
   └── Fallos se registran en tabla

2. Al volver al listado
   └── Productos con fallos aparecen en rojo
   └── Badge muestra cantidad de fallos
   └── Filtro "Con Fallos" visible
   └── Botón "Limpiar" visible

3. Opciones:
   └── Click "Reintentar": intenta actualizar ese producto
   └── Click "Limpiar": descarta todos los fallos

4. Auto-resolución
   └── Si un producto con fallo previo se actualiza exitosamente
   └── Se marcan como 'resuelto' los fallos anteriores
```

---

## Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `src/modules/precios.js` | Módulo frontend |
| `src/router.js` | Ruta habilitada |
| `supabase/functions/sync-meli/index.ts` | Edge Function |
| `supabase/migration_costos_ml.sql` | Migración tablas de costos |

---

## Notas Técnicas

- La previsualización **NO guarda cambios** - solo muestra en pantalla
- El botón "Guardar" es el que efectivamente envía a ML
- Si un producto tiene promoción activa, ML puede rechazar el cambio de precio
- Los filtros permiten buscar por SKU/título y filtrar por estado
- El costo de envío solo se calcula si `tiene_envio_gratis = true`
- Los valores de peso/dimensiones manuales se preservan durante la sincronización

---

*Última actualización: Febrero 2026 - v1.7.0*
