# Módulo: Gestión de Precios

## Descripción

Permite visualizar, modificar y actualizar precios de publicaciones en Mercado Libre de forma masiva, con previsualización y redondeo psicológico automático.

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
| Precio Actual | Precio vigente en ML |
| Nuevo Precio | Precio calculado (después de previsualizar) |
| Neto Est. | Precio - Comisiones - Impuestos |
| +% ML | Markup sobre neto (cuánto carga ML) |
| Estado | Activa / Pausada |

---

## Cálculo del Neto Estimado

El neto se calcula usando las comisiones reales de ML obtenidas del endpoint `/sites/MLA/listing_prices`:

```
Neto = Precio - Comisión - Cargo Fijo - Impuestos
```

Si las comisiones no están disponibles, usa el **% promedio de las últimas 100 órdenes** como fallback.

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

Sincroniza precios y comisiones desde ML. Se ejecuta al entrar a la sección.

```typescript
// Obtiene:
- item.price
- item.category_id
- item.listing_type_id

// Llama a:
/sites/MLA/listing_prices?price=X&listing_type_id=Y&category_id=Z

// Guarda en publicaciones_meli:
- precio
- categoria_id
- tipo_publicacion
- comision_ml
- cargo_fijo_ml
- impuestos_estimados
- neto_estimado
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

## Tabla: historial_cambio_precios

Auditoría de todos los cambios de precios realizados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | PK |
| fecha_cambio | TIMESTAMP | Cuándo se cambió |
| item_id | TEXT | ID publicación ML |
| sku | TEXT | SKU del producto |
| precio_anterior | NUMERIC | Precio antes |
| precio_nuevo | NUMERIC | Precio después |

---

## Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `src/modules/precios.js` | Módulo frontend |
| `src/router.js` | Ruta habilitada |
| `supabase/functions/sync-meli/index.ts` | Edge Function |

---

## Sistema de Tracking de Fallos (v1.1.0)

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

3. Click en "Reintentar"
   └── Reintenta actualizar ese producto
   └── Si éxito: marca como 'resuelto'
   └── Si falla: registra nuevo intento

4. Auto-resolución
   └── Si un producto con fallo previo se actualiza exitosamente
   └── Se marcan como 'resuelto' los fallos anteriores
```

### Vista: v_precios_fallos_pendientes

Vista para consultar fallos agrupados por SKU:

```sql
SELECT sku, id_publicacion, cantidad_fallos, ultimo_intento, ultimo_precio_intentado
FROM v_precios_fallos_pendientes;
```

---

## Notas Técnicas

- La previsualización **NO guarda cambios** - solo muestra en pantalla
- El botón "Guardar" es el que efectivamente envía a ML
- Si un producto tiene promoción activa, ML puede rechazar el cambio de precio
- Los filtros permiten buscar por SKU/título y filtrar por estado
- **Nuevo**: Los fallos se registran para poder reintentar después

---

*Última actualización: Enero 2026*
