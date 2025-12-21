// ============================================
// UTILIDADES COMUNES
// ============================================

/**
 * Muestra una notificación toast
 * @param {string} mensaje - Texto a mostrar
 * @param {string} tipo - 'success', 'error', 'warning', 'info'
 */
export function mostrarNotificacion(mensaje, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colores = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };

    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `${colores[tipo]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 pointer-events-auto animate-fade-in`;
    toast.innerHTML = `
        <i class="fas ${iconos[tipo]}"></i>
        <span>${mensaje}</span>
    `;

    container.appendChild(toast);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Formatea un número como moneda ARS
 * @param {number} valor
 * @returns {string}
 */
export function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '$0';
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(valor);
}

/**
 * Formatea una fecha ISO a DD/MM/YYYY
 * @param {string} fechaString
 * @returns {string}
 */
export function formatearFecha(fechaString) {
    if (!fechaString) return '-';
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-AR');
}

/**
 * Formatea una fecha ISO a HH:MM
 * @param {string} fechaString
 * @returns {string}
 */
export function formatearHora(fechaString) {
    if (!fechaString) return '-';
    const fecha = new Date(fechaString);
    return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Muestra un modal de confirmación
 * @param {string} titulo
 * @param {string} mensaje
 * @param {string} tipo - 'danger', 'warning', 'info'
 * @param {string} textoOk - Texto del botón confirmar
 * @returns {Promise<boolean>}
 */
export function confirmarAccion(titulo, mensaje, tipo = 'danger', textoOk = 'Confirmar') {
    return new Promise((resolve) => {
        const modal = document.getElementById('global-confirm-modal');
        const iconBg = document.getElementById('confirm-icon-bg');
        const icon = document.getElementById('confirm-icon');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        // Configurar colores según tipo
        const configs = {
            danger: { bgColor: 'bg-red-100', iconColor: 'text-red-600', btnColor: 'bg-red-600 hover:bg-red-500', icon: 'fa-exclamation-triangle' },
            warning: { bgColor: 'bg-yellow-100', iconColor: 'text-yellow-600', btnColor: 'bg-yellow-600 hover:bg-yellow-500', icon: 'fa-exclamation-circle' },
            info: { bgColor: 'bg-blue-100', iconColor: 'text-blue-600', btnColor: 'bg-blue-600 hover:bg-blue-500', icon: 'fa-info-circle' }
        };

        const config = configs[tipo] || configs.danger;

        iconBg.className = `mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${config.bgColor} sm:mx-0 sm:h-10 sm:w-10`;
        icon.className = `fas ${config.icon} ${config.iconColor}`;
        btnOk.className = `inline-flex w-full justify-center rounded-lg ${config.btnColor} px-4 py-2 text-sm font-semibold text-white shadow-sm sm:w-auto transition-colors`;

        titleEl.textContent = titulo;
        msgEl.textContent = mensaje;
        btnOk.textContent = textoOk;

        modal.classList.remove('hidden');

        const handleOk = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            btnOk.removeEventListener('click', handleOk);
            btnCancel.removeEventListener('click', handleCancel);
        };

        btnOk.addEventListener('click', handleOk);
        btnCancel.addEventListener('click', handleCancel);
    });
}

/**
 * Genera un ID único con prefijo
 * @param {string} prefijo - Ej: 'ENV', 'ORD'
 * @returns {string}
 */
export function generarId(prefijo = 'ID') {
    return `${prefijo}-${Date.now()}`;
}

/**
 * Parsea un string de moneda a número
 * @param {string} valor - Ej: "$48.513,00"
 * @returns {number}
 */
export function parsearMoneda(valor) {
    if (!valor || typeof valor !== 'string') return 0;
    // Remover $ y puntos de miles, reemplazar coma decimal por punto
    const limpio = valor.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(limpio) || 0;
}

/**
 * Calcula el color de riesgo para stock
 * Niveles GAS: 'CRÍTICO', 'RIESGO', 'Normal'
 * @param {string} nivel
 * @returns {string} - Clase CSS de color
 */
export function colorRiesgo(nivel) {
    const colores = {
        'CRÍTICO': 'bg-red-100 text-red-800',
        'RIESGO': 'bg-yellow-100 text-yellow-800',
        'Normal': 'bg-green-100 text-green-800',
        // Mantener compatibilidad con valores anteriores
        'BAJO': 'bg-yellow-100 text-yellow-800',
        'OK': 'bg-green-100 text-green-800',
        'NORMAL': 'bg-blue-100 text-blue-800'
    };
    return colores[nivel] || 'bg-gray-100 text-gray-800';
}

/**
 * Formatea un numero como porcentaje
 * @param {number} valor
 * @param {number} decimales - Cantidad de decimales (default 1)
 * @returns {string}
 */
export function formatearPorcentaje(valor, decimales = 1) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0%';
    return `${Number(valor).toFixed(decimales)}%`;
}

/**
 * Formatea un numero con separadores de miles
 * @param {number} valor
 * @returns {string}
 */
export function formatearNumero(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0';
    return new Intl.NumberFormat('es-AR').format(valor);
}
