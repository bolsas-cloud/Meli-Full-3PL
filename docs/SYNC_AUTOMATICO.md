# Sincronizacion Automatica con Mercado Libre

## Resumen

La sincronizacion se puede ejecutar:
1. **Manual**: Boton "Sincronizar ML" en el Dashboard
2. **Automatica**: Cron programado

---

## Configuracion del Cron Automatico

### Horario Configurado

| Horario | Frecuencia | Uso |
|---------|------------|-----|
| Lunes-Viernes 8:00-21:00 | Cada 30 min | Horario comercial intensivo |
| Todos los dias 6:00 AM | Una vez | Actualizacion matutina |

**Nota:** Horarios en Argentina (UTC-3). Ver `supabase/cron_sync_meli.sql` para script completo.

### Opcion 1: cron-job.org (Gratis)

1. Ir a [cron-job.org](https://cron-job.org) y crear cuenta
2. Crear nuevo cron job:

**Job 1: Horario comercial (cada 30 min)**
```
URL: https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli
Metodo: POST
Headers:
  Content-Type: application/json
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk

Body: {"action": "sync-all"}

Cron: 0,30 9-17 * * 1-5
(Cada 30 min de 9:00 a 17:30, Lunes a Viernes)
```

**Job 2: Actualizacion diaria (6 AM)**
```
URL: (misma que arriba)
Cron: 0 6 * * *
(Todos los dias a las 6:00 AM)
```

### Opcion 2: GitHub Actions (Gratis)

Crear archivo `.github/workflows/sync-meli.yml`:

```yaml
name: Sync Mercado Libre

on:
  schedule:
    # Cada 30 min en horario comercial (9-17 UTC-3 = 12-20 UTC)
    - cron: '0,30 12-20 * * 1-5'
    # Todos los dias a las 6 AM (9 AM UTC)
    - cron: '0 9 * * *'
  workflow_dispatch: # Permite ejecucion manual

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Sincronizar con ML
        run: |
          curl -X POST \
            'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli' \
            -H 'Content-Type: application/json' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}' \
            -d '{"action": "sync-all"}'
```

Configurar secret `SUPABASE_ANON_KEY` en GitHub.

### Opcion 3: Vercel Cron (Requiere Pro o Enterprise)

En `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/sync-meli",
      "schedule": "0,30 12-20 * * 1-5"
    },
    {
      "path": "/api/sync-meli",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### Opcion 4: Supabase pg_cron (Requiere Plan Pro)

Ejecutar en SQL Editor:

```sql
-- Habilitar pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Sync cada 30 min en horario comercial (Arg UTC-3)
SELECT cron.schedule(
  'sync-meli-comercial',
  '0,30 12-20 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body := '{"action": "sync-all"}'::jsonb
  );
  $$
);

-- Sync diario a las 6 AM Argentina (9 AM UTC)
SELECT cron.schedule(
  'sync-meli-diario',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body := '{"action": "sync-all"}'::jsonb
  );
  $$
);

-- Ver jobs programados
SELECT * FROM cron.job;

-- Cancelar un job
-- SELECT cron.unschedule('sync-meli-comercial');
```

---

## Acciones Disponibles

| Accion | Descripcion |
|--------|-------------|
| `sync-orders` | Solo sincroniza ordenes (con neto recibido) |
| `sync-inventory` | Sincroniza stock de Full + detecta publicaciones huerfanas |
| `sync-prices` | Sincroniza precios y comisiones de ML |
| `sync-ads` | Sincroniza costos de publicidad |
| `sync-all` | Sincroniza inventory + orders |

### Deteccion de Publicaciones Huerfanas (v1.4.0)

Al ejecutar `sync-inventory`, el sistema:
1. Obtiene todos los IDs de publicaciones activas/pausadas en Supabase
2. Consulta la API de ML por items activos/pausados
3. Marca como `estado: 'no_encontrada'` las que estan en Supabase pero NO en ML
4. Retorna `{ updated, huerfanas, totalEnML }` en la respuesta

Esto permite identificar publicaciones eliminadas o cerradas en ML para limpieza manual.

---

## Monitoreo

### Ver logs de Edge Function

```bash
npx supabase functions logs sync-meli
```

### Ver en Supabase Dashboard

1. Ir a Edge Functions → sync-meli
2. Ver tab "Invocations" para historial
3. Ver tab "Logs" para errores

---

## Troubleshooting

### Error: Token expirado
- Reconectar con ML desde la app (Configuracion)
- El refresh token se renueva automaticamente

### Error: Rate limit
- ML tiene limite de 10,000 requests/hora
- Si sincronizas muy frecuente, reducir frecuencia

### Error: Edge Function not found
- Desplegar con: `npx supabase functions deploy sync-meli`

---

*Ultima actualizacion: Enero 2026*
