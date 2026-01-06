# Envíos a Full

## Resumen

El módulo de Envíos gestiona la creación, preparación y seguimiento de envíos a Mercado Libre Full.

---

## Tablas de Base de Datos

### registro_envios_full (Padre)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_envio` | TEXT | **PK** - ID único del envío |
| `id_envio_ml` | TEXT | ID asignado por ML |
| `fecha_creacion` | TIMESTAMP | Fecha de creación |
| `fecha_colecta` | DATE | Fecha programada de colecta |
| `estado` | TEXT | Borrador, En Preparación, Despachado, Recibido |
| `notas` | TEXT | Observaciones |

### detalle_envios_full (Hijo)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_envio` | TEXT | **FK** → registro_envios_full |
| `sku` | TEXT | SKU del producto |
| `id_publicacion` | TEXT | ID de publicación ML |
| `cantidad_enviada` | INTEGER | Cantidad final enviada |
| `cantidad_original` | INTEGER | Cantidad originalmente planificada (v1.1.0) |

> **Nota**: Si `cantidad_enviada < cantidad_original`, hubo una discrepancia al finalizar la preparación.

### preparacion_en_curso

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_envio` | TEXT | **FK** → registro_envios_full |
| `sku` | TEXT | SKU del producto |
| `cantidad_escaneada` | INTEGER | Cantidad ya escaneada |

---

## Estados del Envío

| Estado | Descripción | Color |
|--------|-------------|-------|
| **Borrador** | Recién creado, editable | Gris |
| **En Preparación** | Listo para escanear productos | Amarillo |
| **Despachado** | Enviado a ML | Azul |
| **Recibido** | Confirmado por ML Full | Verde |

---

## Generación de PDF

El PDF incluye:

| Columna | Ancho | Descripción |
|---------|-------|-------------|
| # | 8mm | Número de línea |
| SKU | 38mm | Código del producto |
| Inventory ID | 28mm | ID de inventario ML |
| Producto | 100mm | Título (hasta 50 caracteres) |
| Cant. | 14mm | Cantidad a enviar |

**Configuración:**
- Márgenes: 14mm (izquierda/derecha)
- Font size: 9pt (8pt para Inventory ID)
- Theme: striped

---

## Modo Preparación

Interfaz para escanear productos antes del despacho.

### Funcionalidades

1. **Escaneo por código**: Detecta SKU o Inventory ID
2. **Ajuste manual**: Botones +/- para corregir
3. **Selección por click**: Click en fila para seleccionar producto
4. **Validación**: Compara escaneados vs requeridos
5. **Auto-guardado**: Cada cambio se guarda automáticamente (debounce 500ms)
6. **Multi-usuario**: Sincronización en tiempo real via Supabase Realtime

### Auto-guardado

- Cualquier cambio (escaneo, +/-) dispara auto-guardado con debounce de 500ms
- Indicador visual: "Guardando..." → "✓ Guardado"
- No hay botón "Guardar", el progreso se persiste automáticamente
- Botón "Volver" siempre disponible (sin confirmación)

### Multi-usuario (Realtime)

Permite que múltiples usuarios trabajen simultáneamente en el mismo envío:

1. Al iniciar preparación, se suscribe a cambios en `preparacion_en_curso`
2. Cuando otro usuario hace cambios, se sincroniza automáticamente
3. Notificación: "Cambios sincronizados de otro usuario"
4. Debounce de 300ms para evitar múltiples actualizaciones

**Requisito**: Ejecutar script `scripts/HABILITAR_REALTIME_PREPARACION.sql` en Supabase.

### Modal de Finalización con Incompletos

Si hay productos con menos unidades escaneadas que las planificadas:

1. Muestra modal con lista de productos incompletos
2. Cada producto tiene input editable para cantidad final
3. Al confirmar, actualiza `detalle_envios_full` con cantidades corregidas
4. Guarda `cantidad_original` (planificada) y `cantidad_enviada` (final real)
5. Cambia estado a "Despachado"

### Visualización de Discrepancias (v1.1.0)

Cuando hay diferencia entre cantidad original y enviada:

**En la Card del Envío:**
- Muestra: `8 de 10` (naranja) en lugar de `10 uds`
- Tooltip con detalle: "Cantidad ajustada: 8 de 10"

**En el PDF:**
- Se agregan columnas: `Env` (enviado) y `Orig` (original)
- Columna Env en naranja para destacar discrepancia
- Solo aparecen estas columnas si hay al menos una discrepancia

### Layout de Tabla

| Columna | Ancho | Descripción |
|---------|-------|-------------|
| SKU / Título | auto | Usa todo el espacio restante |
| Inventory ID | 112px (w-28) | Código ML |
| A Enviar | 80px (w-20) | Cantidad requerida |
| Escaneados | 96px (w-24) | Cantidad escaneada |
| Estado | 112px (w-28) | Pendiente/En Progreso/Completado |

---

## Flujo de Trabajo

```
1. Crear envío (desde Calculadora)
   └── Estado: Borrador

2. Cambiar a "En Preparación"
   └── Habilita botón de preparación

3. Escanear productos (multi-usuario habilitado)
   ├── Auto-guardado en cada cambio
   ├── Sincronización Realtime entre usuarios
   └── Botón "Volver" para salir (progreso ya guardado)

4. Finalizar preparación
   ├── Si todo completo → Despachado directo
   └── Si hay incompletos → Modal para ajustar cantidades

5. ML confirma recepción
   └── Estado: Recibido
```

---

## Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `src/modules/enviosCreados.js` | Módulo principal |
| `src/modules/calculadoraEnvios.js` | Creación de envíos |

---

*Última actualización: Enero 2026*
