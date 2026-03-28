# Descripciones IA + Auto-respuesta + Feedback Loop — Design Spec

**Fecha:** 2026-03-28
**Estado:** Aprobado para implementar

---

## Objetivo

Cuatro mejoras al ecosistema de mensajes y publicaciones:

1. **Fix URLs de publicaciones** — corregir links rotos + agregar URLs en respuestas del agente
2. **Gestión de descripciones con IA** — editar, reescribir con IA (copywriter e-commerce), y publicar en ML
3. **Feedback loop análisis → KB** — guardar insights del agente como documentos en la base de conocimiento
4. **Auto-respuesta en webhook** — el agente responde automáticamente preguntas de ML con flag on/off

---

## 1. Fix URLs de publicaciones

### Bug actual
La URL se arma como `https://www.mercadolibre.com.ar/${slug}/p/${id}` que no resuelve. El formato correcto es `https://articulo.mercadolibre.com.ar/${id}`.

### Cambios
- **Frontend** (`publicaciones.js`): cambiar generación de URL, eliminar `generarSlug()`
- **Agente** (`meli-agente`): en `handle_buscar_publicacion`, agregar campo `url` en cada resultado: `https://articulo.mercadolibre.com.ar/${id_publicacion}`
- **System prompt del agente**: indicar que cuando recomiende otro producto, incluya el link de ML

---

## 2. Gestión de descripciones con IA

### Columna nueva
Agregar `descripcion TEXT` a `publicaciones_meli`.

### Sync de descripciones
Durante `sincronizarML()` del módulo publicaciones, para cada publicación traer `GET /items/{id}/description` (retorna `plain_text`) y guardar en la columna `descripcion`.

### Modal de edición expandido
El modal existente (`modal-editar-pub`) ya tiene campos SKU e Inventario. Se expande:

- Textarea con la descripción actual (editable, `rows=12`)
- Botón "Reescribir con IA" que:
  1. Obtiene las preguntas frecuentes de ESA publicación (`conversaciones_meli` filtrado por `id_publicacion`)
  2. Envía al agente: descripción actual + preguntas frecuentes + instrucción de reescribir como copywriter e-commerce
  3. Muestra la versión mejorada en el textarea para que el usuario revise/edite
- Botón "Guardar" que:
  1. Actualiza `descripcion` en `publicaciones_meli` (DB local)
  2. Publica en ML via `PUT /items/{id}/description` con `{ plain_text: texto }` a través de `meli-proxy`

### Nueva tool del agente: `reescribir_descripcion`
- **Input**: `id_publicacion`
- **Proceso**: lee descripción actual de DB + preguntas frecuentes de esa publicación + genera versión mejorada
- **Prompt interno**: "Sos un copywriter especializado en e-commerce. Reescribí esta descripción incluyendo respuestas a las preguntas más frecuentes. Mantené el tono amigable. No inventes datos — usá solo la info del producto y las preguntas reales."
- **Output**: texto plano de la descripción mejorada

---

## 3. Feedback loop: análisis → KB

### Desde el módulo analíticas
En las cards de recomendaciones (`ana-recomendaciones`), agregar botón "Guardar en KB" que:
1. Toma el `detalle` del análisis
2. Abre el flujo de `knowledge-processor` con acción `procesar`
3. Lo guarda como documento en `knowledge_base` con categoría `insight_agente`
4. Así el agente lo encuentra via `buscar_conocimiento` en futuras consultas

### Desde el modal de descripción
Cuando el agente reescribe una descripción con datos de preguntas frecuentes, esos datos también podrían guardarse como KB entry para que el agente los tenga disponibles al responder preguntas.

---

## 4. Auto-respuesta en webhook

### Flag de activación
Nueva clave en `config_meli`: `autorespuesta_activa` (valor: `true`/`false`, default: `false`).
UI para activar/desactivar en el módulo de mensajes (toggle).

### Flujo cuando llega una pregunta
```
ML notifica pregunta nueva
  → webhook procesa y guarda en DB (como hoy)
  → SI autorespuesta_activa = true:
    → webhook llama a meli-agente con el texto de la pregunta
    → agente genera respuesta usando sus tools
    → webhook publica respuesta en ML via POST /answers
    → guarda respuesta en mensajes_meli
  → SI autorespuesta_activa = false:
    → solo guarda (como hoy)
```

### Mensajes post-venta
NO auto-responder mensajes post-venta (solo preguntas de publicaciones). Los mensajes post-venta requieren contexto de la orden y son más delicados.

### Reglas de seguridad del agente
Actualizar system prompt:

**Saludo**: Siempre arrancar con "Hola!" en primera interacción.

**Cierre contextual**:
- Consulta general: "Estamos para lo que necesites!"
- Consulta específica (precio, stock, envío): "Esperamos tu compra! Estamos para lo que necesites!"

**Cuando no tiene info**: "Hola! Gracias por tu consulta! En este momento no tenemos la información para darte, puedes volver a consultarnos en unas horas?"

**Reglas críticas para auto-respuesta**:
- NUNCA inventar datos de stock, precio, medidas o materiales
- SIEMPRE usar las tools antes de responder
- Si las tools no devuelven datos relevantes → usar la respuesta conservadora
- NUNCA compartir teléfonos, emails o links externos a ML
- Sí incluir links a otras publicaciones propias cuando sea relevante (formato: https://articulo.mercadolibre.com.ar/MLA-XXXXXXX)

---

## Archivos afectados

| Archivo | Acción | Cambios |
|---------|--------|---------|
| `src/modules/publicaciones.js` | Modify | Fix URL, expandir modal editar con descripción, sync descripción |
| `src/modules/analiticas.js` | Modify | Botón "Guardar en KB" en cards recomendaciones |
| `src/modules/mensajes.js` | Modify | Toggle auto-respuesta en header |
| Edge Function `meli-agente` | Deploy | URL en buscar_publicacion, tool reescribir_descripcion, system prompt actualizado |
| Edge Function `meli-webhook` | Deploy | Lógica auto-respuesta condicional |
| Tabla `publicaciones_meli` | Migration | Agregar columna `descripcion TEXT` |
| Tabla `config_meli` | Insert | Clave `autorespuesta_activa` = `false` |

---

## Orden de implementación sugerido

1. Fix URLs + columna descripcion (base, sin riesgo)
2. Modal descripción expandido + sync descripciones
3. Tool reescribir_descripcion en agente + system prompt mejorado
4. Botón "Guardar en KB" en analíticas
5. Auto-respuesta en webhook (con flag off por default)
6. Toggle en UI de mensajes para activar auto-respuesta
