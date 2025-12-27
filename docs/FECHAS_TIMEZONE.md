# Manejo de Fechas y Timezone

## Problema

JavaScript tiene un comportamiento problemático con fechas cuando se usa `new Date()` con strings en formato `YYYY-MM-DD`:

```javascript
// PROBLEMA: JavaScript interpreta esto como medianoche UTC
new Date("2025-01-15")
// Resultado: Wed Jan 15 2025 00:00:00 GMT+0000 (UTC)

// En Argentina (UTC-3), esto se convierte a:
// Tue Jan 14 2025 21:00:00 GMT-0300
// ¡Un día antes!
```

### Síntomas comunes

1. **Dashboard muestra día incorrecto**: A las 22:00 ARG, el dashboard mostraba el día siguiente
2. **Modal de edición con fecha +1**: Al editar un envío, el input mostraba un día más que el card
3. **Fecha guardada diferente a la mostrada**: Usuario guarda "15/01" pero el card muestra "14/01"

---

## Solución

### 1. Función `fechaLocalISO()` - Para generar fechas

Ubicación: `src/utils.js`

```javascript
/**
 * Convierte una fecha a formato YYYY-MM-DD usando timezone local
 * Evita el problema de UTC que causa +1 día en horarios nocturnos
 */
export function fechaLocalISO(date = new Date()) {
    const año = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${año}-${mes}-${dia}`;
}
```

**Uso:**
```javascript
// INCORRECTO - usa UTC
const hoy = new Date().toISOString().split('T')[0];

// CORRECTO - usa timezone local
const hoy = fechaLocalISO(new Date());
```

### 2. Función `parsearFechaLocal()` - Para leer fechas

Ubicación: Definir localmente en cada módulo que lo necesite

```javascript
/**
 * Parsea una fecha string como timezone local (no UTC)
 */
function parsearFechaLocal(fechaStr) {
    if (!fechaStr) return null;
    // Si es formato YYYY-MM-DD, parsearlo como fecha local
    if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        const [año, mes, dia] = fechaStr.split('-').map(Number);
        return new Date(año, mes - 1, dia);
    }
    return new Date(fechaStr);
}
```

**Uso:**
```javascript
// INCORRECTO - interpreta como UTC
const fecha = new Date(envio.fecha_colecta);

// CORRECTO - interpreta como local
const fecha = parsearFechaLocal(envio.fecha_colecta);
```

---

## Casos de uso

### Input type="date" en formularios

```javascript
// Al mostrar en el input (value debe ser YYYY-MM-DD)
const fechaColecta = envio.fecha_colecta
    ? fechaLocalISO(parsearFechaLocal(envio.fecha_colecta))
    : '';

// El valor del input ya viene en formato correcto
const nuevaFecha = document.getElementById('edit-fecha').value; // "2025-01-15"
```

### Mostrar fecha en UI

```javascript
// Al renderizar en cards/tablas
const fecha = parsearFechaLocal(envio.fecha_colecta);
const textoFecha = fecha
    ? fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    : '-';
```

### Filtros por fecha

```javascript
// Para filtros de dashboard, usar fechaLocalISO
const hoy = new Date();
filtros.hasta = fechaLocalISO(hoy);
filtros.desde = fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
```

---

## Regla general

| Operación | Usar |
|-----------|------|
| Generar fecha para guardar/filtrar | `fechaLocalISO(date)` |
| Parsear fecha de Supabase (DATE) | `parsearFechaLocal(string)` |
| Parsear timestamp de Supabase (TIMESTAMPTZ) | `new Date(string)` - funciona bien |

---

## Archivos afectados

- `src/utils.js` - Contiene `fechaLocalISO()` exportada
- `src/modules/dashboard.js` - Usa `fechaLocalISO` para filtros de fecha
- `src/modules/enviosCreados.js` - Usa `parsearFechaLocal` y `fechaLocalISO` para fechas de colecta

---

## Por qué no afecta a timestamps

Los campos `TIMESTAMPTZ` de Supabase incluyen información de timezone:

```javascript
// Supabase devuelve: "2025-01-15T14:30:00.000Z"
new Date("2025-01-15T14:30:00.000Z")
// Funciona correctamente porque tiene la 'Z' (UTC) y hora completa
```

El problema solo ocurre con campos `DATE` que devuelven solo `"2025-01-15"`.

---

*Última actualización: 2025-12-26*
