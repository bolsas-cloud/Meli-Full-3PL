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
| `cantidad_enviada` | INTEGER | Cantidad a enviar |

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

### Layout de Tabla

| Columna | Ancho | Descripción |
|---------|-------|-------------|
| SKU / Título | auto | Usa todo el espacio restante |
| Inventory ID | 112px (w-28) | Código ML |
| A Enviar | 80px (w-20) | Cantidad requerida |
| Escaneados | 96px (w-24) | Cantidad escaneada |
| Estado | 96px (w-24) | Pendiente/En Progreso/Completado |

---

## Flujo de Trabajo

```
1. Crear envío (desde Calculadora)
   └── Estado: Borrador

2. Cambiar a "En Preparación"
   └── Habilita botón de preparación

3. Escanear productos
   └── Validar cantidades

4. Finalizar preparación
   └── Estado: Despachado

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

*Última actualización: Diciembre 2025*
