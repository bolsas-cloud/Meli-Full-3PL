-- ============================================
-- Script: Habilitar Realtime en preparacion_en_curso
-- Proyecto: Meli-Full-3PL
-- Fecha: 2026-01-02
-- ============================================
-- Este script habilita Supabase Realtime en la tabla
-- preparacion_en_curso para permitir sincronización
-- multi-usuario durante la preparación de envíos.
-- ============================================

-- 1. Agregar la tabla a la publicación de Realtime
-- Esto permite que Supabase envíe eventos cuando hay cambios
ALTER PUBLICATION supabase_realtime ADD TABLE preparacion_en_curso;

-- 2. Habilitar REPLICA IDENTITY FULL
-- Necesario para que UPDATE y DELETE envíen la fila completa
-- (sin esto solo funciona INSERT)
ALTER TABLE preparacion_en_curso REPLICA IDENTITY FULL;

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ejecutar esta query para verificar que la tabla está habilitada:
--
-- SELECT * FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
--
-- Deberías ver 'preparacion_en_curso' en los resultados.

-- ============================================
-- ROLLBACK (si necesitás deshabilitar)
-- ============================================
-- ALTER PUBLICATION supabase_realtime DROP TABLE preparacion_en_curso;
-- ALTER TABLE preparacion_en_curso REPLICA IDENTITY DEFAULT;
