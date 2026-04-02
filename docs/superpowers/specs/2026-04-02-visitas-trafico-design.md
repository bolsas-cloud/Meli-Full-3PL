# Visitas y Tráfico de Publicaciones — Design Spec

**Fecha:** 2026-04-02
**Estado:** Para revisión
**Base:** Investigación `docs/investigacion-visitas-ml.md` (2026-03-17)

---

## Objetivo

Implementar seguimiento histórico de visitas a publicaciones de MercadoLibre, con dashboard de tráfico, cálculo de conversión, score de calidad, y detección de oportunidades. Integrar los datos con el agente IA para análisis on-demand.

---

## Mejoras sobre la propuesta original

| Aspecto | Propuesta original (17/3) | Propuesta mejorada |
|---------|--------------------------|-------------------|
| Tabla | `visitas_publicaciones` (solo visitas) | `visitas_historial` (visitas + conversión calculada + score) |
| Datos ads | No contemplado | Cruzar con `ads_metricas_diarias` para orgánico vs pago |
| Performance | No contemplado | Score de calidad via `/item/{id}/performance` |
| Tendencias | No contemplado | Top keywords de ML via `/trends/MLA` |
| Agente IA | No contemplado | Tool `analizar_publicacion` para análisis on-demand |
| Backfill | 150 días | 150 días + datos de `visitas_90d` actuales como semilla |
| Sync | Edge function nueva | Acción nueva en `sync-meli` existente |
| UI | Dashboard nuevo | Sección en módulo `analiticas.js` existente + tab en publicaciones |

---

## 1. Tabla `visitas_historial`

```sql
CREATE TABLE visitas_historial (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    id_publicacion TEXT NOT NULL,
    visitas INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fecha, id_publicacion)
);

CREATE INDEX idx_visitas_fecha ON visitas_historial(fecha DESC);
CREATE INDEX idx_visitas_pub ON visitas_historial(id_publicacion);

ALTER PUBLICATION supabase_realtime ADD TABLE visitas_historial;
GRANT ALL ON visitas_historial TO anon, authenticated, service_role;
```

**Por qué no guardar conversión en la tabla:** La conversión se calcula dinámicamente cruzando `visitas_historial` con `ordenes_meli` (agrupando por fecha + publicación). Guardarla sería redundante y se desincronizaría si se corrige una orden.

---

## 2. Tabla `performance_publicaciones`

Score de calidad y recomendaciones de ML (cambia poco, sync semanal).

```sql
CREATE TABLE performance_publicaciones (
    id_publicacion TEXT PRIMARY KEY,
    score INTEGER,
    nivel TEXT,
    recomendaciones JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON performance_publicaciones TO anon, authenticated, service_role;
```

---

## 3. Sync de visitas (acción en sync-meli)

### Acción `sync-visitas`

Agregar a la Edge Function `sync-meli` existente:

```
action: 'sync-visitas'
```

**Flujo:**
1. Obtener lista de `id_publicacion` activos de `publicaciones_meli`
2. Batch de 50 items → `GET /items/visits/time_window?ids={batch}&last=3&unit=day`
3. Upsert en `visitas_historial` (fecha + id_publicacion)
4. Latencia: datos de hace 48hs, así que `last=3` cubre el gap

**Volumen:** ~94 publicaciones activas = 2 requests. Costo mínimo.

### Acción `sync-performance`

```
action: 'sync-performance'
```

**Flujo:**
1. Para cada publicación activa → `GET /item/{id}/performance`
2. Upsert en `performance_publicaciones`

**Frecuencia:** Semanal (el score no cambia a diario).

### Backfill inicial

```
action: 'backfill-visitas'
```

Trae últimos 150 días de visitas (máximo de la API). Loop por batches de 50 items × periodos de 30 días.

---

## 4. RPC para métricas de tráfico

```sql
CREATE FUNCTION rpc_metricas_trafico(p_dias INTEGER DEFAULT 30)
RETURNS JSONB
```

Devuelve:
- **Totales:** visitas totales, promedio diario, tendencia (vs periodo anterior)
- **Por publicación:** top 10 más visitadas, conversión calculada (ordenes/visitas), revenue por visita
- **Por día:** serie temporal para gráfico
- **Cruce con ads:** visitas totales - impresiones ads = tráfico orgánico estimado
- **Performance:** publicaciones con score bajo que necesitan mejora

---

## 5. UI — Dashboard de Tráfico

### Opción A: Tab en módulo analíticas existente

Agregar un tab "Tráfico" al módulo `analiticas.js` con:

### Opción B: Módulo dedicado `trafico.js` (recomendada)

Nuevo módulo con nav item en sidebar (sección "Gestión" o "Analíticas").

### Componentes del dashboard:

**KPIs (fila superior):**
- Visitas totales (periodo)
- Visitas/día promedio
- Conversión global (ordenes/visitas %)
- Revenue por visita ($)
- Tendencia vs periodo anterior (▲▼ %)

**Gráfico principal:** Visitas diarias (bar) + conversión (line) — mismo patrón que el chart semanal de analíticas.

**Tabla de publicaciones:**

| Publicación | Visitas | Órdenes | Conversión | Revenue/Visita | Score ML | Tendencia |
|-------------|---------|---------|-----------|----------------|----------|-----------|
| Bolsa 20x30 | 1,234 | 45 | 3.6% | $182 | 85/100 | ▲ 12% |
| Tote Bag 50x40 | 890 | 12 | 1.3% | $95 | 62/100 | ▼ 5% |

- Ordenable por cualquier columna
- Clickeable → abre detalle con gráfico individual
- Semáforo de score: verde (>80), amarillo (50-80), rojo (<50)
- Badge de tendencia: verde si subió, rojo si bajó vs periodo anterior

**Panel de oportunidades:**
- Publicaciones con muchas visitas pero baja conversión → mejorar descripción/precio
- Publicaciones con buen score pero pocas visitas → invertir en ads
- Publicaciones con score bajo → mostrar recomendaciones de ML

---

## 6. Tool del agente: `analizar_publicacion`

**Input:** `id_publicacion`
**Datos que consulta:**
- Visitas de `visitas_historial` (últimos 30 días)
- Órdenes de `ordenes_meli` (mismo periodo)
- Performance de `performance_publicaciones`
- Preguntas de `conversaciones_meli`
- Datos de ads de `ads_metricas_diarias`

**Output:** Análisis completo con:
- Visitas, conversión, revenue por visita
- Score de calidad + recomendaciones de ML
- Comparativa con promedio de la tienda
- Temas recurrentes en preguntas
- Sugerencia de acción (mejorar descripción, invertir en ads, ajustar precio, etc.)

**Uso:** El agente puede usarlo cuando le pidan "analizá la publicación MLA..." o desde el botón "Analizar" en la tabla de tráfico.

---

## 7. Tendencias de mercado

### Sync semanal

```
action: 'sync-tendencias'
```

Llama a `GET /trends/MLA` y guarda en tabla `tendencias_ml`:

```sql
CREATE TABLE tendencias_ml (
    id SERIAL PRIMARY KEY,
    keyword TEXT NOT NULL,
    tipo TEXT NOT NULL, -- 'creciente', 'mas_buscada', 'popular'
    url TEXT,
    semana DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(keyword, semana)
);
```

**Uso:** Mostrar en el dashboard de tráfico como "Tendencias del mercado esta semana". El agente puede usarlo para sugerir oportunidades.

---

## 8. Archivos afectados

| Archivo | Acción | Cambios |
|---------|--------|---------|
| Edge Function `sync-meli` | Modify | Agregar acciones: sync-visitas, sync-performance, backfill-visitas, sync-tendencias |
| `src/modules/trafico.js` | Create | Dashboard de tráfico: KPIs, gráfico, tabla publicaciones, oportunidades |
| `src/router.js` | Modify | Agregar ruta `trafico` |
| `index.html` | Modify | Nav item en sidebar |
| Edge Function `meli-agente` | Modify | Agregar tool `analizar_publicacion` |
| SQL (Supabase) | Execute | Crear tablas + RPC |
| `CLAUDE.md` | Modify | Documentar nuevas tablas, módulo, tool |

---

## 9. Orden de implementación

1. **Tablas + RPC** — `visitas_historial`, `performance_publicaciones`, `tendencias_ml`, RPC métricas
2. **Sync en sync-meli** — acciones sync-visitas, backfill, sync-performance, sync-tendencias
3. **Backfill** — correr una vez para traer 150 días de historia
4. **Dashboard frontend** — módulo `trafico.js` con KPIs, gráfico, tabla
5. **Tool agente** — `analizar_publicacion` con datos cruzados
6. **Cron** — programar sync diario de visitas y semanal de performance/tendencias

---

## 10. Consideraciones

- **Latencia 48hs:** Los datos de visitas de hoy y ayer pueden estar incompletos. Mostrar aviso en UI.
- **Volumen:** ~94 publicaciones activas = 2 requests por sync. Sin riesgo de rate limit.
- **Cron:** Supabase tiene pg_cron o se puede usar un cron externo (GitHub Actions, Vercel cron).
- **Performance score** cambia poco → sync semanal es suficiente.
- **Tendencias** se actualizan semanalmente en ML → sync semanal.
- **Datos de ads** ya los tenemos en `ads_metricas_diarias` → solo cruzar, no duplicar.
