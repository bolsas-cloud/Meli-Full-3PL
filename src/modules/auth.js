// ============================================
// MÓDULO: Autenticación OAuth2 con Mercado Libre
// ============================================

import { supabase, MELI_CONFIG } from '../config.js';
import { mostrarNotificacion } from '../utils.js';

// Estado de autenticación
let accessToken = null;
let userId = null;
let userNickname = null;

export const moduloAuth = {

    // ============================================
    // INICIAR: Redirigir a Mercado Libre para autorizar
    // ============================================
    iniciarAutorizacion: () => {
        const authUrl = `${MELI_CONFIG.AUTH_URL}?response_type=code&client_id=${MELI_CONFIG.APP_ID}&redirect_uri=${encodeURIComponent(MELI_CONFIG.REDIRECT_URI)}`;

        console.log('Redirigiendo a:', authUrl);
        window.location.href = authUrl;
    },

    // ============================================
    // INTERCAMBIAR: Código por Access Token
    // ============================================
    intercambiarCodigo: async (code) => {
        try {
            console.log('Intercambiando código por token...');

            const response = await fetch(MELI_CONFIG.TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: MELI_CONFIG.APP_ID,
                    client_secret: MELI_CONFIG.CLIENT_SECRET,
                    code: code,
                    redirect_uri: MELI_CONFIG.REDIRECT_URI
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.message || data.error);
            }

            console.log('Token obtenido exitosamente');

            // Guardar tokens
            await moduloAuth.guardarTokens(data);

            return data;

        } catch (error) {
            console.error('Error intercambiando código:', error);
            throw error;
        }
    },

    // ============================================
    // REFRESCAR: Obtener nuevo token con refresh_token
    // ============================================
    refrescarToken: async () => {
        try {
            const refreshToken = await moduloAuth.obtenerConfig('refresh_token');

            if (!refreshToken) {
                throw new Error('No hay refresh token disponible');
            }

            console.log('Refrescando token...');

            const response = await fetch(MELI_CONFIG.TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: MELI_CONFIG.APP_ID,
                    client_secret: MELI_CONFIG.CLIENT_SECRET,
                    refresh_token: refreshToken
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.message || data.error);
            }

            console.log('Token refrescado exitosamente');

            // Guardar nuevos tokens
            await moduloAuth.guardarTokens(data);

            return data;

        } catch (error) {
            console.error('Error refrescando token:', error);
            // Si falla el refresh, limpiar tokens
            await moduloAuth.cerrarSesion();
            throw error;
        }
    },

    // ============================================
    // GUARDAR: Tokens en Supabase
    // ============================================
    guardarTokens: async (tokenData) => {
        const configs = [
            { clave: 'access_token', valor: tokenData.access_token },
            { clave: 'refresh_token', valor: tokenData.refresh_token },
            { clave: 'user_id', valor: String(tokenData.user_id) },
            { clave: 'token_expira', valor: String(Date.now() + (tokenData.expires_in * 1000)) }
        ];

        for (const config of configs) {
            const { error } = await supabase
                .from('config_meli')
                .upsert(config, { onConflict: 'clave' });

            if (error) {
                console.error('Error guardando config:', config.clave, error);
            }
        }

        // Actualizar estado local
        accessToken = tokenData.access_token;
        userId = tokenData.user_id;

        // Obtener nickname del usuario
        await moduloAuth.obtenerDatosUsuario();
    },

    // ============================================
    // OBTENER: Configuración desde Supabase
    // ============================================
    obtenerConfig: async (clave) => {
        const { data, error } = await supabase
            .from('config_meli')
            .select('valor')
            .eq('clave', clave)
            .single();

        if (error || !data) return null;
        return data.valor;
    },

    // ============================================
    // VERIFICAR: Si hay sesión activa
    // ============================================
    verificarSesion: async () => {
        try {
            const token = await moduloAuth.obtenerConfig('access_token');
            const expira = await moduloAuth.obtenerConfig('token_expira');
            const uid = await moduloAuth.obtenerConfig('user_id');

            if (!token || !expira) {
                return false;
            }

            // Verificar si el token expiró (con margen de 5 minutos)
            const ahora = Date.now();
            const expiraMs = parseInt(expira);
            const margen = 5 * 60 * 1000; // 5 minutos

            if (ahora > expiraMs - margen) {
                console.log('Token expirado o por expirar, refrescando...');
                await moduloAuth.refrescarToken();
            }

            // Actualizar estado local
            accessToken = await moduloAuth.obtenerConfig('access_token');
            userId = uid;
            userNickname = await moduloAuth.obtenerConfig('user_nickname');

            return true;

        } catch (error) {
            console.error('Error verificando sesión:', error);
            return false;
        }
    },

    // ============================================
    // OBTENER: Datos del usuario desde API
    // ============================================
    obtenerDatosUsuario: async () => {
        try {
            const token = await moduloAuth.obtenerConfig('access_token');

            const response = await fetch(`${MELI_CONFIG.API_BASE}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.message || data.error);
            }

            userNickname = data.nickname;

            // Guardar nickname
            await supabase
                .from('config_meli')
                .upsert({ clave: 'user_nickname', valor: data.nickname }, { onConflict: 'clave' });

            return data;

        } catch (error) {
            console.error('Error obteniendo datos de usuario:', error);
            return null;
        }
    },

    // ============================================
    // CERRAR: Sesión (limpiar tokens)
    // ============================================
    cerrarSesion: async () => {
        const claves = ['access_token', 'refresh_token', 'user_id', 'user_nickname', 'token_expira'];

        for (const clave of claves) {
            await supabase
                .from('config_meli')
                .delete()
                .eq('clave', clave);
        }

        accessToken = null;
        userId = null;
        userNickname = null;

        mostrarNotificacion('Sesión cerrada', 'info');
        moduloAuth.actualizarUI();
    },

    // ============================================
    // ACTUALIZAR: UI según estado de autenticación
    // ============================================
    actualizarUI: async () => {
        const authStatus = document.getElementById('auth-status');
        const conectado = await moduloAuth.verificarSesion();

        if (conectado && userNickname) {
            authStatus.innerHTML = `
                <p class="text-sm font-bold text-green-600">${userNickname}</p>
                <p class="text-xs text-gray-500 cursor-pointer hover:text-red-500" onclick="moduloAuth.cerrarSesion()">
                    Desconectar
                </p>
            `;
        } else {
            authStatus.innerHTML = `
                <p class="text-sm font-bold text-gray-700 cursor-pointer hover:text-brand" onclick="moduloAuth.iniciarAutorizacion()">
                    Conectar con ML
                </p>
                <p class="text-xs text-gray-500">Click para autorizar</p>
            `;
        }
    },

    // ============================================
    // GETTERS: Para otros módulos
    // ============================================
    getAccessToken: () => accessToken,
    getUserId: () => userId,
    getUserNickname: () => userNickname,

    // ============================================
    // API CALL: Hacer llamada autenticada a ML
    // ============================================
    apiCall: async (endpoint, options = {}) => {
        // Verificar sesión antes de cada llamada
        const conectado = await moduloAuth.verificarSesion();

        if (!conectado) {
            throw new Error('No hay sesión activa con Mercado Libre');
        }

        const token = await moduloAuth.obtenerConfig('access_token');

        const response = await fetch(`${MELI_CONFIG.API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        // Si el token es inválido, intentar refrescar
        if (response.status === 401) {
            console.log('Token inválido, intentando refrescar...');
            await moduloAuth.refrescarToken();
            // Reintentar la llamada
            return moduloAuth.apiCall(endpoint, options);
        }

        return data;
    }
};

// Exponer en window para el HTML
window.moduloAuth = moduloAuth;
