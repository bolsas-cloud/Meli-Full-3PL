# Fase 3 — Analíticas & Recomendaciones del Agente IA

**Fecha:** 2026-03-27
**Estado:** En progreso (pasos 1-3 completados 2026-03-28)
**Prerrequisito:** KB poblada con datos relevantes + agente en uso con preguntas reales

---

## Objetivo

Extender el agente IA para que no solo responda consultas sino que **analice patrones, detecte problemas y genere recomendaciones proactivas** sobre la cuenta de MercadoLibre.

---

## Capacidades planificadas

### 1. Análisis de preguntas frecuentes
- Detectar productos con muchas preguntas → sugiere mejorar descripción
- Ejemplo: *"La publicación Bolsa 7x9 tiene 23 preguntas sobre talles esta semana → sugiero agregar tabla de medidas en la descripción"*

### 2. Alertas de stock
- Cruzar velocidad de venta con stock actual → alertar reposición
- Ejemplo: *"El stock de LPC07900 está en 12 unidades y el promedio de venta es 8/día → reponer en 24hs"*

### 3. Análisis de conversión pregunta→compra
- Medir impacto del tiempo de respuesta en conversiones
- Ejemplo: *"Las preguntas sin responder en <1h convierten 3x más → hay 5 preguntas de hace 2hs sin responder"*

### 4. Detección de problemas en publicaciones
- Análisis de preguntas para detectar info faltante
- Ejemplo: *"El producto X tiene 40% de preguntas sobre envío → el costo de envío no está claro en la publicación"*

### 5. Monitoreo de reclamos
- Tracking de tendencias en reclamos
- Ejemplo: *"Reclamos por demora aumentaron 30% esta semana → revisar tiempos de despacho"*

### 6. Health score de publicaciones
- Scoring basado en: visitas, conversión, preguntas sin responder, stock, precio vs competencia
- Dashboard con semáforo por publicación

### 7. Recomendaciones de pricing
- Análisis de preguntas sobre precio y competencia
- Sugerencias basadas en elasticidad observada

---

## Implementación técnica

### Nueva tabla: `analisis_mensajes`
```sql
CREATE TABLE analisis_mensajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL,              -- 'alerta_stock', 'mejora_publicacion', 'tendencia_reclamos', etc.
    titulo TEXT NOT NULL,
    detalle TEXT,
    prioridad TEXT DEFAULT 'normal', -- 'baja', 'normal', 'alta', 'critica'
    id_publicacion TEXT,             -- si aplica
    datos JSONB DEFAULT '{}',        -- métricas, números, comparativas
    estado TEXT DEFAULT 'pendiente', -- 'pendiente', 'vista', 'aplicada', 'descartada'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Nuevas tools del agente
| Tool | Input | Output |
|------|-------|--------|
| `analizar_publicacion` | item_id | Health score, sugerencias de mejora |
| `detectar_patrones_preguntas` | días | Temas recurrentes, productos problemáticos |
| `comparar_periodos` | periodo1, periodo2 | Variación ventas, conversión, reclamos |
| `generar_informe` | tipo, rango | Informe ejecutivo con KPIs |

### Flujo de reportes periódicos
```
Cron (diario/semanal)
  → Edge Function analiza datos
  → Genera insights en analisis_mensajes
  → Notificación en sidebar (badge)
  → Dashboard con cards de recomendaciones
```

### Dashboard de métricas de atención
- Tiempo promedio de primera respuesta
- Tasa de respuesta (respondidas vs total)
- Distribución por categoría de consulta
- Evolución semanal
- Top 5 publicaciones con más preguntas

---

## UI propuesta

### Card de recomendación (en dashboard o módulo propio)
```
┌──────────────────────────────────────────┐
│ ⚠️ ALTA  Stock bajo en Bolsa 7x9        │
│                                          │
│ Stock actual: 12 un | Venta diaria: 8 un │
│ Se agota en ~1.5 días                    │
│                                          │
│ [Ver publicación] [Crear envío] [Ignorar]│
└──────────────────────────────────────────┘
```

### Scoring de publicación
```
┌──────────────────────────────────────────┐
│ Bolsa Tote Bag 20x30            Score: 78│
│ ████████████████████░░░░ 78/100          │
│                                          │
│ ✅ Visitas: 1.2k/mes                     │
│ ✅ Conversión: 4.2%                      │
│ ⚠️ 12 preguntas sin responder           │
│ ❌ Sin tabla de medidas                  │
│                                          │
│ Sugerencia: Agregar tabla de medidas     │
│ para reducir preguntas en 40%            │
└──────────────────────────────────────────┘
```

---

## Orden de implementación sugerido

1. **Tabla `analisis_mensajes`** + UI básica de cards
2. **Tool `analizar_publicacion`** — health score individual
3. **Tool `detectar_patrones_preguntas`** — análisis de preguntas frecuentes
4. **Dashboard de métricas de atención** — tiempos de respuesta, tasas
5. **Alertas proactivas de stock** — cron diario
6. **Tool `comparar_periodos`** + `generar_informe`
7. **Scoring de publicaciones** — dashboard con semáforo

---

## Dependencias

- Fase 1 (mensajes) ✅ completada
- Fase 2 (agente IA + KB) ✅ completada
- KB poblada con políticas y FAQ (en progreso — usar módulo Base Conocimiento)
- Historial de preguntas suficiente (se acumula con la sincronización)
