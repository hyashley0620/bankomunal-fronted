/**
 * =============================================================================
 * Capa central de comunicación con el backend.
 * Proporciona: autenticación JWT, fetch con token, descarga de archivos
 * y conexión WebSocket para notificaciones en tiempo real.
 *
 * Dependencia: cargarse ANTES que cualquier otro script del proyecto.
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
   CONFIGURACIÓN
----------------------------------------------------------------------------- */

/** URL base del backend. */
const API_BASE = 'https://bankomunal-backend.onrender.com/api';


/* -----------------------------------------------------------------------------
   SESIÓN Y TOKEN
----------------------------------------------------------------------------- */

/** Obtiene el token JWT almacenado en localStorage. */
function getToken() {
    return localStorage.getItem('authToken');
}

/** Obtiene el objeto de sesión del usuario. */
function getSession() {
    const s = JSON.parse(localStorage.getItem('userSession') || '{}');
    if (s.fotoUrl) {
        const normalizada = normalizarFotoUrlRelativa(s.fotoUrl);
        if (normalizada !== s.fotoUrl) {
            s.fotoUrl = normalizada;
            localStorage.setItem('userSession', JSON.stringify(s));
        }
    }
    return s;
}

/** Cierra sesión: avisa al backend (mejor esfuerzo) y limpia storage/redirige. */
function cerrarSesion() {
    const token = getToken();
    if (token) {
        fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => { /* best-effort: no bloquea el cierre de sesión */ });
    }

    localStorage.clear();
    sessionStorage.clear();
    const enPaginas = window.location.pathname.includes('/pages/');
    window.location.replace(enPaginas ? '../login.html' : 'login.html');
}


/* -----------------------------------------------------------------------------
   FETCH AUTENTICADO
----------------------------------------------------------------------------- */

/**
 * Wrapper de fetch() que inyecta el token JWT.
 * Si el servidor responde 401 (token expirado), cierra sesión automáticamente.
 * @param {string} endpoint  Ruta relativa, ej: '/cuentas'
 * @param {Object} options   Opciones estándar de fetch()
 */
async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

    if (response.status === 401) {
        cerrarSesion();
        return;
    }

    return response;
}

/**
 * Extrae un mensaje de error legible de una respuesta fallida de la API.
 * Soporta tanto el formato {mensaje: "..."} como el de errores de validación
 * por campo {campo1: "mensaje1", campo2: "mensaje2"} que devuelve el backend
 * cuando falla @Valid.
 */
async function extraerMensajeError(res, fallback) {
    try {
        const data = await res.json();
        if (data?.mensaje) return data.mensaje;
        const primerError = Object.values(data || {})[0];
        if (typeof primerError === 'string') return primerError;
    } catch { /* body no era JSON */ }
    return fallback;
}


/* -----------------------------------------------------------------------------
   FOTO DE PERFIL
----------------------------------------------------------------------------- */

/**
 * Normaliza una ruta relativa de foto almacenada en la BD a la forma canónica */
function normalizarFotoUrlRelativa(url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    if (url.startsWith('/uploads/')) return url;
    if (url.startsWith('/fotos/')) return '/uploads' + url;
    if (url.startsWith('fotos/')) return '/uploads/' + url;
    // Cualquier otra ruta relativa: anteponer /uploads/
    return url.startsWith('/') ? url : '/uploads/' + url;
}

/** Convierte una ruta relativa de foto en URL absoluta apuntando al backend.
 *  Normaliza automáticamente rutas legacy ("fotos/...") antes de construir la URL. */
function urlFotoAbsoluta(url) {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    if (url.startsWith('http')) return url;
    // Normalizar ruta relativa antes de anteponer el origen
    const relativa = normalizarFotoUrlRelativa(url);
    return 'https://bankomunal-backend.onrender.com' + relativa;
}

/**
 * Sube una foto de perfil al backend (POST /usuarios/foto) y actualiza la
 * sesión local + todos los avatares de la página (header, sidebar) llamando
 * a actualizarInterfazUsuario() de core.js, si está disponible.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
async function subirFotoUsuario(file) {
    if (!file) throw new Error('No se seleccionó ningún archivo.');
    if (!file.type || !file.type.startsWith('image/'))
        throw new Error('El archivo debe ser una imagen (JPG, PNG, GIF o WEBP).');
    if (file.size > 8 * 1024 * 1024)
        throw new Error('La imagen no debe superar 8 MB.');

    const fd = new FormData();
    fd.append('foto', file);

    let r;
    try {
        r = await fetch(`${API_BASE}/usuarios/foto`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}` },
            body: fd
        });
    } catch (e) {
        console.error('subirFotoUsuario: no se pudo contactar al servidor →', e);
        throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté corriendo en el puerto 8080.');
    }

    if (r.status === 401) {
        cerrarSesion();
        throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    }

    if (!r.ok) {
        let mensaje = `No se pudo subir la foto (HTTP ${r.status}).`;
        try {
            const err = await r.json();
            if (err?.mensaje) mensaje = err.mensaje;
        } catch {
            try {
                const txt = await r.text();
                if (txt) console.error('subirFotoUsuario: respuesta no-JSON del servidor →', txt);
            } catch { }
        }
        throw new Error(mensaje);
    }

    const data = await r.json();
    const s = getSession();
    s.fotoUrl = data.url;
    localStorage.setItem('userSession', JSON.stringify(s));
    if (typeof actualizarInterfazUsuario === 'function') actualizarInterfazUsuario();
    return data.url;
}


/* -----------------------------------------------------------------------------
   DESCARGA DE ARCHIVOS (PDF / Excel)
----------------------------------------------------------------------------- */

/**
 * Descarga un archivo generado por el backend.
 * @param {string} endpoint      Ruta del recurso, ej: '/exportar/pdf'
 * @param {string} nombreArchivo Nombre con el que se guardará el archivo
 */
async function descargarArchivo(endpoint, nombreArchivo) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = nombreArchivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error descargando archivo:', err);
    }
}


/* -----------------------------------------------------------------------------
   WEBSOCKET — NOTIFICACIONES EN TIEMPO REAL
----------------------------------------------------------------------------- */

/**
 * Conecta al servidor via STOMP/SockJS y escucha notificaciones del usuario.
 * Requiere sockjs-client y stomp.js en el HTML.
 */
function conectarWebSocket() {
    if (window._bkWsConectado) return; // evita abrir una conexión duplicada si se refresca el dashboard en vivo
    if (typeof SockJS === 'undefined' || typeof Stomp === 'undefined') return;
    const session = getSession();
    if (!session.email) return;

    const socket = new SockJS('https://bankomunal-backend.onrender.com/ws');
    const client = Stomp.over(socket);
    client.debug = () => { };

    client.connect({ 'Authorization': `Bearer ${getToken()}` }, () => {
        window._bkWsConectado = true;
        client.subscribe('/user/queue/notificaciones', (msg) => {
            const notif = JSON.parse(msg.body);
            if (typeof mostrarToast === 'function')
                mostrarToast(`${notif.titulo}: ${notif.mensaje}`, 'info');
            const badge = document.querySelector('.notif-badge');
            if (badge) {
                badge.style.display = 'flex';
                badge.textContent = parseInt(badge.textContent || '0') + 1;
            }
        });
    });
}

/* -----------------------------------------------------------------------------
   VALIDACIÓN DE CAMPOS EN VIVO 
----------------------------------------------------------------------------- */
function initValidacionCamposEnVivo(root) {
    const scope = root || document;

    // Solo números: filtra en cada tecla, y limpia lo que ya esté pegado/cargado.
    scope.querySelectorAll('[data-solo-numeros]').forEach(input => {
        if (input.dataset.soloNumerosWired) return;
        input.dataset.soloNumerosWired = '1';
        input.addEventListener('input', () => {
            const limpio = input.value.replace(/\D/g, '');
            if (limpio !== input.value) input.value = limpio;
        });
    });

    // Formato de correo: feedback visual inmediato (no bloquea el submit, eso
    // ya lo hace type="email" + la validación del backend).
    scope.querySelectorAll('input[type="email"]').forEach(input => {
        if (input.dataset.emailWired) return;
        input.dataset.emailWired = '1';
        const marcar = () => {
            if (!input.value) { input.classList.remove('input-valido', 'input-invalido'); return; }
            const valido = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(input.value);
            input.classList.toggle('input-valido', valido);
            input.classList.toggle('input-invalido', !valido);
        };
        input.addEventListener('input', marcar);
        input.addEventListener('blur', marcar);
    });

    // Confirmación de contraseña (o cualquier par de campos): muestra si coinciden.
    scope.querySelectorAll('[data-confirmar]').forEach(input => {
        if (input.dataset.confirmarWired) return;
        input.dataset.confirmarWired = '1';
        const original = document.getElementById(input.dataset.confirmar);
        if (!original) return;

        let msg = input.parentElement.querySelector('.match-indicator');
        if (!msg) {
            msg = document.createElement('small');
            msg.className = 'match-indicator';
            msg.style.cssText = 'display:block;margin-top:.3rem;font-size:.78rem;font-weight:600';
            input.parentElement.appendChild(msg);
        }

        const comparar = () => {
            if (!input.value) { msg.textContent = ''; input.classList.remove('input-valido', 'input-invalido'); return; }
            const coincide = input.value === original.value;
            msg.textContent = coincide ? '✓ Las contraseñas coinciden' : '✕ Las contraseñas no coinciden';
            msg.style.color = coincide ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)';
            input.classList.toggle('input-valido', coincide);
            input.classList.toggle('input-invalido', !coincide);
        };
        input.addEventListener('input', comparar);
        original.addEventListener('input', comparar);
    });
}

document.addEventListener('DOMContentLoaded', () => initValidacionCamposEnVivo());
