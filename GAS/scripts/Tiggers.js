// ============================================================================
// --- ARCHIVO: Triggers.gs ---
// ============================================================================
// Descripción: Contiene la lógica para las ejecuciones automáticas (triggers).
// ============================================================================

/**
 * Esta es la función "inteligente" que será llamada por el trigger cada 30 minutos.
 * Decide si es el momento adecuado para ejecutar la actualización completa de datos.
 */
function ejecutarActualizacionInteligente() {
  // Usamos LockService para evitar que se ejecuten múltiples actualizaciones al mismo tiempo
  // si una tardara más de 30 minutos.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { // Intenta obtener el bloqueo por 10 segundos
    Logger.log("Ejecución omitida, ya hay un proceso de actualización corriendo.");
    return;
  }

  try {
    // --- DEFINE AQUÍ TUS HORARIOS ---
    const HORA_INICIO_COMERCIAL = 7;  // 7 AM
    const HORA_FIN_COMERCIAL = 20;   // 6 PM (18hs)
    const HORA_ACTUALIZACION_NOCTURNA = 4; // 4 AM

    const ahora = new Date();
    const diaSemana = ahora.getDay(); // Domingo = 0, Lunes = 1, ..., Sábado = 6
    const hora = ahora.getHours();

    let deberiaEjecutar = false;
    let motivo = "";

    // Regla para Fines de Semana (Sábado y Domingo)
    if (diaSemana === 0 || diaSemana === 6) {
      // Se ejecuta solo una vez al día, en el horario de la actualización nocturna.
      if (hora === HORA_ACTUALIZACION_NOCTURNA) {
        deberiaEjecutar = true;
        motivo = "Actualización única de fin de semana.";
      }
    } 
    // Regla para Días de Semana (Lunes a Viernes)
    else {
      // Se ejecuta si estamos dentro del horario comercial.
      if (hora >= HORA_INICIO_COMERCIAL && hora < HORA_FIN_COMERCIAL) {
        deberiaEjecutar = true;
        motivo = "Actualización de horario comercial.";
      }
      // O si es la actualización nocturna antes de empezar el día.
      else if (hora === HORA_ACTUALIZACION_NOCTURNA) {
        deberiaEjecutar = true;
        motivo = "Actualización nocturna de día de semana.";
      }
    }

    // --- Ejecución ---
    if (deberiaEjecutar) {
      Logger.log(`Iniciando actualización automática. Motivo: ${motivo}`);
      actualizarProductosMeliForzado(); // Llama a la función principal de actualización
      Logger.log("Actualización automática completada.");
    } else {
      Logger.log("Ejecución omitida. Fuera de horario programado.");
    }

  } catch (e) {
    Logger.log(`Error durante la ejecución inteligente: ${e.message}`);
  } finally {
    lock.releaseLock(); // Importante: siempre liberar el bloqueo al final.
  }
}
