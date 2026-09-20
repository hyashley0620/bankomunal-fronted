/**
 * =============================================================================
 * Funciones compartidas por TODAS las páginas internas.
 *
 * GUARD DE AUTENTICACIÓN: redirige automáticamente al login si no hay sesión.
 *
 * Incluye:
 *   - Guard de autenticación global (verifyAuth)
 *   - Render de interfaz de usuario (nombre, rol, avatar)
 *   - Modo oscuro con persistencia
 *   - Sidebar móvil con overlay
 *   - Notificaciones (badge + marcar leídas)
 *   - Búsqueda global en tablas
 *   - Exportación de archivos
 *   - Toast de notificaciones
 *   - Utilidades: formatearCOP, setupMoneyInput, mostrar/ocultar tabla
 * =============================================================================
 */


/* =============================================================================
   GUARD DE AUTENTICACIÓN GLOBAL
   Verifica que el usuario tenga token activo antes de mostrar la página.
   Si no hay token → redirige a login.html de forma inmediata.
   ============================================================================= */

/**
 * Verifica sesión activa. Si no existe, redirige al login antes de que
 * el usuario vea cualquier contenido de la página protegida.
 */
function verifyAuth() {
    const token = localStorage.getItem('authToken');
    const session = localStorage.getItem('userSession');

    if (!token || !session || session === '{}') {
        // Ocultar el body inmediatamente para evitar flash de contenido
        document.documentElement.style.visibility = 'hidden';
        window.location.replace('../login.html');
        return false;
    }
    // Si hay sesión, restaurar visibilidad (por si se ocultó antes)
    document.documentElement.style.visibility = 'visible';
    return true;
}


/* =============================================================================
   INICIALIZACIÓN GLOBAL
   Se ejecuta en DOMContentLoaded en todas las páginas internas.
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar autenticación PRIMERO — si falla, para todo
    if (!verifyAuth()) return;

    // 2. Inicializar módulos en orden
    initDarkMode();
    actualizarInterfazUsuario();
    initSidebarMobile();
    initLogout();
    initNotifications();
    initGlobalSearch();
    initExportButtons();
    initGenericUIActions();
    cargarBadgeNotificaciones();

    /* ── Botón Reporte WhatsApp (dashboard) ─────────────────────────────────── */
    document.querySelectorAll('[data-msg], .btn-whatsapp, #btnWhatsapp').forEach(btn => {
        if (!btn.textContent.includes('WhatsApp')) return;
        btn.addEventListener('click', async () => {
            const session = getSession();
            let resumen = `*Reporte Bankomunal* 📊\n`;
            resumen += `Usuario: ${session.nombre || 'Usuario'}\n`;
            resumen += `Cuenta: ${session.cuenta || '-'}\n`;
            resumen += `Saldo: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(session.saldoTotal || 0)}\n`;
            resumen += `Fecha: ${new Date().toLocaleString('es-CO')}\n`;
            resumen += `\n_Generado desde Bankomunal_ 🏦`;

            const url = 'https://wa.me/?text=' + encodeURIComponent(resumen);
            window.open(url, '_blank');
        });
    });

});


/* =============================================================================
   IDENTIDAD Y SESIÓN
   ============================================================================= */

/**
 * "Primer nombre + primer apellido" a partir de un nombre completo — para
 * mostrar junto al avatar sin importar cuántas palabras tenga el nombre o
 * el apellido reales (ej. "Juan Carlos Pérez Gómez" → "Juan Pérez").
 */
function calcularNombreCorto(nombreCompleto) {
    const partes = (nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'Usuario';
    if (partes.length === 1) return partes[0];
    return partes[0] + ' ' + partes[1];
}

/** Iniciales (máx. 2 letras) a partir de un nombre corto tipo "Juan Pérez". */
function calcularIniciales(nombreCorto) {
    const partes = (nombreCorto || '').trim().split(/\s+/).filter(Boolean);
    const ini = partes.slice(0, 2).map(p => p[0]).join('').toUpperCase();
    return ini || 'U';
}

function tienePermiso(modulo, accion = 'leer') {
    const session = getSession?.() || {};
    if ((session.rol || '').toLowerCase() === 'admin') return true;
    const permisos = session.permisos || [];
    const p = permisos.find(x => x.modulo === modulo);
    return !!(p && p[accion]);
}

/**
 * Renderiza nombre, rol e iniciales del avatar desde localStorage.
 * Lee la sesión guardada por app.js tras el login.
 */
function actualizarInterfazUsuario() {
    const session = getSession();
    if (!session || !session.nombre) return;

    // Nombre corto (primer nombre + primer apellido) y rol en header / sidebar.

    const nombreCorto = session.nombreCorto || calcularNombreCorto(session.nombre);
    document.querySelectorAll('#nombreUsuario, .user-name-text')
        .forEach(el => { el.textContent = nombreCorto; });
    document.querySelectorAll('#rolUsuario, .user-role-text')
        .forEach(el => { el.textContent = session.rol || 'Socio'; });

    // Avatar: foto guardada, o ícono por género, o iniciales
    const BACKEND_URL = 'https://bankomunal-backend.onrender.com';
    document.querySelectorAll('#avatarUsuario, .avatar-circle, .user-avatar-placeholder')
        .forEach(el => {
            if (el.tagName === 'IMG') return;

            if (session.fotoUrl) {
                const relFoto = (typeof normalizarFotoUrlRelativa === 'function')
                    ? normalizarFotoUrlRelativa(session.fotoUrl)
                    : (session.fotoUrl.startsWith('/') ? session.fotoUrl : '/' + session.fotoUrl);
                const urlAbs = relFoto.startsWith('http') || relFoto.startsWith('data:')
                    ? relFoto
                    : BACKEND_URL + relFoto;
                el.style.backgroundImage = `url(${urlAbs})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.textContent = '';
            } else if (session.genero === 'femenino') {
                el.innerHTML = '<i class="fa-solid fa-user-nurse"></i>';
                el.style.background = '#e9ecef';
                el.style.color = '#005F73';
            } else {
                el.textContent = session.iniciales || calcularIniciales(nombreCorto);
            }
        });

    // Saldo global si existe el elemento
    const saldoEl = document.getElementById('saldoGlobal');
    if (saldoEl && session.saldoTotal !== undefined) {
        saldoEl.textContent = formatearCOP(session.saldoTotal);
    }
}

/**
 * Enlaza el botón de cerrar sesión (.logout / #logoutBtn).
 * Pide confirmación antes de limpiar el storage.
 */
function initLogout() {
    document.querySelectorAll('.logout, #logoutBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('¿Desea cerrar su sesión de forma segura?')) {
                cerrarSesion();
            }
        });
    });
}


/* =============================================================================
   MODO OSCURO
   ============================================================================= */

/**
 * Restaura la preferencia de modo oscuro y escucha el botón #themeBtn.
 */
function initDarkMode() {
    const body = document.body;
    const themeBtn = document.getElementById('themeBtn');

    if (localStorage.getItem('darkMode') === 'enabled') {
        body.classList.add('dark-mode');
    }

    themeBtn?.addEventListener('click', () => {
        const activo = body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', activo ? 'enabled' : 'disabled');
        if (themeBtn) {
            themeBtn.innerHTML = activo
                ? '<i class="fa-solid fa-sun"></i>'
                : '<i class="fa-solid fa-moon"></i>';
        }
    });
}


/* =============================================================================
   SIDEBAR MÓVIL
   ============================================================================= */

/**
 * Inicializa el toggle del sidebar en pantallas pequeñas.
 * Crea el overlay si no existe y lo gestiona con clases CSS.
 */
function initSidebarMobile() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Crear overlay si no existe
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    function toggleSidebar(forzarCerrar = false) {
        const abierto = sidebar.classList.contains('active');
        if (forzarCerrar || abierto) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        } else {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.classList.add('sidebar-open');
        }
    }

    menuToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleSidebar(); });
    overlay.addEventListener('click', () => toggleSidebar(true));

    // Cerrar al navegar en móvil
    sidebar.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 992) toggleSidebar(true);
        });
    });

    // Cerrar al hacer resize a pantalla grande
    window.addEventListener('resize', () => {
        if (window.innerWidth > 992) toggleSidebar(true);
    });
}


/* =============================================================================
   NOTIFICACIONES
   ============================================================================= */

function resolverEnlaceNotificacion(n) {
    const tipo = n.type || '';
    const refId = n.referenceId;

    if (tipo === 'loan_request_admin') {
        return 'gestion-prestamos.html';
    }
    if (tipo.startsWith('loan_')) {
        return refId ? `detalle-prestamos.html?id=${refId}` : 'prestamos.html';
    }
    if (tipo === 'transfer_sent' || tipo === 'transfer_received' || tipo === 'payment') {
        return 'historial.html';
    }
    if (tipo === 'soporte') {
        return refId ? `soporte-tecnico.html?ticket=${refId}` : 'soporte-tecnico.html';
    }
    return null;
}

/**
 * Navega a la página resuelta para una notificación y, de paso, la marca como leída.
 */
function irANotificacion(n) {
    const destino = resolverEnlaceNotificacion(n);
    if (n?.id) apiFetch(`/notificaciones/${n.id}/leer`, { method: 'PUT' }).catch(() => { });
    if (destino) window.location.href = destino;
}

/**
 * Abre una ventana nueva con un comprobante imprimible (mismo estilo que el
 * certificado de préstamos) y dispara el diálogo de impresión, desde el cual
 * el usuario puede imprimir en papel o "Guardar como PDF" para descargarlo.
 *
 * @param {string} titulo   Título del comprobante (ej. "Comprobante de Pago")
 * @param {Array<[string,string]>} filas  Pares [etiqueta, valor] a mostrar
 * @param {string} folioPrefix  Prefijo del folio (ej. "PAG", "TRF")
 */
function imprimirComprobante(titulo, filas, folioPrefix = 'BKM') {
    const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
    const folio = folioPrefix + '-' + Date.now().toString().slice(-8);
    const camposHtml = filas.map(([label, value]) => `
        <div class="field"><label>${label}</label><span>${value ?? '—'}</span></div>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${titulo} — Bankomunal</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 11pt; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: center;
            border-bottom: 3px solid #005F73; padding-bottom: 14px; margin-bottom: 20px; }
  .brand  { display: flex; align-items: center; gap: 12px; }
  .brand-name   { font-size: 22pt; font-weight: 700; color: #004d5e; letter-spacing: -0.5px; }
  .brand-sub    { font-size: 8pt; color: #64748b; margin-top: 2px; }
  .header-right { text-align: right; }
  .cert-title   { font-size: 13pt; font-weight: 600; color: #004d5e; }
  .folio        { font-size: 8pt; color: #94a3b8; margin-top: 4px; }
  .fecha        { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .section-title{ font-size: 9pt; font-weight: 700; text-transform: uppercase;
                  letter-spacing: .08em; color: #004d5e; border-bottom: 1px solid #e2e8f0;
                  padding-bottom: 5px; margin-bottom: 14px; }
  .grid-2       { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 30px; }
  .field        { display: flex; flex-direction: column; }
  .field label  { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing:.04em; }
  .field span   { font-size: 11.5pt; font-weight: 600; color: #1e293b; margin-top: 2px; }
  .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;
            display: flex; justify-content: space-between; align-items: flex-start; }
  .footer p { font-size: 7.5pt; color: #94a3b8; max-width: 60%; line-height: 1.4; }
  .firma    { text-align: center; }
  .firma-line { border-top: 1px solid #64748b; width: 160px; margin: 0 auto 4px; }
  .watermark{ position: fixed; bottom: 35mm; right: 18mm; font-size: 48pt; font-weight: 900;
              color: rgba(14,165,233,0.06); transform: rotate(-30deg); pointer-events: none;
              letter-spacing: -2px; }
  .firma p  { font-size: 8pt; color: #475569; }
  @media print {
    .no-print { display: none !important; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="watermark">BANKOMUNAL</div>
<div class="no-print" style="text-align:right;padding:12px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;margin-bottom:20px;">
  <button onclick="window.print()" style="background:#005F73;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:10pt;cursor:pointer;font-weight:600;">
    ⬇ Guardar / Imprimir PDF
  </button>
</div>

<div class="header">
  <div class="brand" style="display: flex; aling-items: center; ">
    <div class="brand-icon">
       <img src="../assets/img/logo.png" alt="Bankomunal" class="sidebar-logo" style="width:56px">
    </div>
    <div>
      <div class="brand-name">BANKOMUNAL</div>
      <div class="brand-sub">Microfinanzas Comunitarias</div>
    </div>
  </div>
  <div class="header-right">
    <div class="cert-title">${titulo}</div>
    <div class="folio">Folio: ${folio}</div>
    <div class="fecha">Fecha de emisión: ${hoy}</div>
  </div>
</div>

<div class="section-title">Detalle</div>
<div class="grid-2">${camposHtml}</div>

<div class="footer">
  <p>Este documento es un comprobante informativo generado electrónicamente por el sistema Bankomunal. No requiere firma física.</p>
  <div class="firma">
    <div class="firma-line"></div>
    <p><strong>Bankomunal</strong></p>
    <p>Sistema de Microfinanzas</p>
  </div>
</div>

</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
        if (typeof mostrarToast === 'function') mostrarToast('Permite ventanas emergentes para generar el comprobante.', 'warning');
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
}

/**
 * Al hacer clic en el botón de campana (#notifToggle):
 * - Marca todas las notificaciones como leídas en el backend
 * - Oculta el badge con animación
 */
function initNotifications() {
    const btn = document.getElementById('notifToggle');
    if (!btn) return;

    /* Crear el panel dropdown si no existe en el HTML */
    let panel = document.getElementById('notifDropdown');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'notifDropdown';
        panel.style.cssText = `
            display:none; position:fixed; width:340px; max-width:calc(100vw - 24px); max-height:420px;
            overflow-y:auto; background:#fff; border:1px solid #e2e8f0; border-radius:12px;
            box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:9999; padding:0;`;
        panel.innerHTML = `
            <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                <strong style="font-size:.9rem;color:#1a202c">${t('header.notificaciones')}</strong>
                <button id="markAllRead" style="font-size:.78rem;color:#005F73;background:none;border:none;cursor:pointer;">${t('header.marcar_leidas')}</button>
            </div>
            <div id="notifDropdownList" style="padding:8px 0;">
                <p style="text-align:center;padding:20px;color:#94a3b8;font-size:.85rem">${t('common.cargando')}</p>
            </div>`;
        document.body.appendChild(panel);
    }

    let isOpen = false;

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        isOpen = !isOpen;
        if (!isOpen) { panel.style.display = 'none'; return; }

        if (isOpen) {
            const margin = 12;
            panel.style.right = 'auto';
            panel.style.display = 'block';
            const rect = btn.getBoundingClientRect();
            const panelWidth = panel.offsetWidth;
            let left = rect.right - panelWidth;
            if (left < margin) left = margin;
            if (left + panelWidth > window.innerWidth - margin) {
                left = Math.max(margin, window.innerWidth - panelWidth - margin);
            }
            panel.style.left = left + 'px';
            panel.style.top = (rect.bottom + 8) + 'px';
            /* Cargar notificaciones */
            const lista = document.getElementById('notifDropdownList');
            try {
                const res = await apiFetch('/notificaciones');
                if (res?.ok) {
                    const notifs = await res.json();
                    if (!notifs.length) {
                        lista.innerHTML = `<p style="text-align:center;padding:20px;color:#94a3b8;font-size:.85rem">${t('header.sin_notificaciones')}</p>`;
                    } else {
                        const iconMap = {
                            transfer_sent: 'fa-arrow-up', transfer_received: 'fa-arrow-down',
                            loan_disbursed: 'fa-landmark', loan_payment: 'fa-receipt',
                            payment: 'fa-credit-card'
                        };
                        lista.innerHTML = notifs.slice(0, 10).map((n, idx) => {
                            const ic = iconMap[n.type] || 'fa-bell';
                            const dt = n.fecha ? new Date(n.fecha).toLocaleString('es-CO',
                                { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                            const clicable = !!resolverEnlaceNotificacion(n);
                            return `<div data-notif-idx="${idx}" style="display:flex;gap:10px;padding:10px 16px;border-bottom:1px solid #f1f5f9;background:${n.leida ? '#fff' : '#f0f9ff'};${clicable ? 'cursor:pointer;' : ''}">
                                <div style="width:32px;height:32px;border-radius:50%;background:#005F73;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <i class="fa-solid ${ic}" style="color:#fff;font-size:.75rem"></i></div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:.82rem;font-weight:600;color:#1a202c">${n.titulo || 'Notificación'}</div>
                                    <div style="font-size:.78rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.mensaje || ''}</div>
                                    <div style="font-size:.72rem;color:#94a3b8;margin-top:2px">${dt}</div>
                                </div></div>`;
                        }).join('');
                        lista.querySelectorAll('[data-notif-idx]').forEach(el => {
                            el.addEventListener('click', () => {
                                const n = notifs[Number(el.dataset.notifIdx)];
                                if (n) irANotificacion(n);
                            });
                        });
                    }
                    /* Marcar como leídas en backend */
                    apiFetch('/notificaciones/marcar-leidas', { method: 'POST' }).catch(() => { });
                    const badge = document.querySelector('.notif-badge');
                    if (badge) badge.style.display = 'none';
                }
            } catch {
                lista.innerHTML = `<p style="text-align:center;padding:16px;color:#ef4444;font-size:.85rem">${t('header.error_cargar')}</p>`;
            }

            /* Marcar leídas btn */
            document.getElementById('markAllRead')?.addEventListener('click', () => {
                panel.style.display = 'none'; isOpen = false;
            });
        }
    });

    /* Cerrar al hacer clic fuera */
    document.addEventListener('click', (e) => {
        if (isOpen && !panel.contains(e.target) && e.target !== btn) {
            panel.style.display = 'none';
            isOpen = false;
        }
    });
}


/* =============================================================================
   BÚSQUEDA GLOBAL EN TABLAS
   ============================================================================= */

/**
 * Filtra filas de cualquier <table> visible según el texto en .search-input.
 * Opera en tiempo real mientras el usuario escribe.
 */
function initGlobalSearch() {
    const input = document.querySelector('.search-input');
    input?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        document.querySelectorAll('table tbody tr').forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}


/* =============================================================================
   ACCIONES GENÉRICAS POR ATRIBUTO data-*
     data-trigger="idInput"   → abre el input (archivo) con ese id
     data-action="print"      → window.print()
     data-action="reload"     → window.location.reload()
     data-nav="url.html"      → navega a la URL indicada
   ============================================================================= */
function initGenericUIActions() {
    /* Delegación real en document: cubre tanto los elementos ya presentes al
       cargar la página como los que páginas/JS añaden después dinámicamente
       (tablas, listas, modales generados por innerHTML). */
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-trigger]');
        if (trigger) { document.getElementById(trigger.dataset.trigger)?.click(); return; }

        const printBtn = e.target.closest('[data-action="print"]');
        if (printBtn) { window.print(); return; }

        const reloadBtn = e.target.closest('[data-action="reload"]');
        if (reloadBtn) { window.location.reload(); return; }

        const navEl = e.target.closest('[data-nav]');
        if (navEl) { window.location.href = navEl.dataset.nav; return; }
    });
}


/* =============================================================================
   EXPORTACIÓN DE ARCHIVOS
   ============================================================================= */

function initExportButtons() {
    if (window.location.pathname.includes('reportes-financieros')) return;

    const conPlantilla = (endpoint) => {
        const id = window._plantillaSeleccionada;
        return id ? `${endpoint}?plantillaId=${id}` : endpoint;
    };

    document.getElementById('btnExportPDF')?.addEventListener('click', async () => {
        mostrarToast('⬇Generando historial PDF...', 'info');
        await descargarArchivo(conPlantilla('/exportar/pdf'), 'historial-bankomunal.html');
        mostrarToast('Descargado. Ábrelo en el navegador y usa Ctrl+P → Guardar como PDF.', 'success');
    });
    document.getElementById('btnExportExcel')?.addEventListener('click', async () => {
        mostrarToast('⬇Generando Excel...', 'info');
        await descargarArchivo(conPlantilla('/exportar/excel'), 'historial-bankomunal.xlsx');
        mostrarToast('Archivo Excel descargado correctamente.', 'success');
    });
    document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
        mostrarToast('⬇Generando CSV...', 'info');
        await descargarArchivo(conPlantilla('/exportar/excel'), 'historial-bankomunal.csv');
        mostrarToast('Archivo CSV descargado correctamente.', 'success');
    });
}


/* =============================================================================
   UTILIDADES COMPARTIDAS
   ============================================================================= */

/**
 * Formatea un número como moneda colombiana (COP).
 * @param {number} valor
 * @returns {string}  Ej: "$ 1.250.000"
 */
function formatearCOP(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(valor || 0);
}

function labelTipoTransaccion(tipo) {
    const etiquetas = {
        deposit: 'Depósito',
        withdrawal: 'Retiro',
        transfer: 'Transferencia',
        transfer_received: 'Transferencia recibida',
        loan_disbursement: 'Desembolso préstamo',
        loan_payment: 'Pago préstamo',
        fee: 'Comisión',
        service_payment: 'Pago de servicio',
        fondo_comun: 'Aporte fondo común',
        adjustment: 'Ajuste',
    };
    if (etiquetas[tipo]) return etiquetas[tipo];
    if (!tipo) return '-';

    const texto = String(tipo).replace(/_/g, ' ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function labelTipoCuenta(tipo) {
    const etiquetas = { individual: 'Individual', group: 'Grupal', fund: 'Fondo común' };
    return etiquetas[tipo] || tipo || 'Cuenta';
}

function labelEventoAuditoria(eventType) {
    const etiquetas = {
        LOGIN_SUCCESS: 'Inicio de sesión exitoso',
        LOGIN_FAILED: 'Inicio de sesión fallido',
        LOGIN_MFA_SENT: 'Código de verificación enviado',
        LOGIN_MFA_FAILED: 'Código de verificación incorrecto',
        ADMIN_VIEWED_DOCUMENTS: 'Administrador consultó documentos',
        ADMIN_ACCESSED_DOCUMENT: 'Administrador accedió a un documento',
        PASSWORD_RECOVERY_REQUESTED: 'Solicitud de recuperación de contraseña',
        PASSWORD_RESET_SUCCESS: 'Contraseña restablecida',
        USER_REGISTERED: 'Usuario registrado'
    };
    return etiquetas[eventType] || eventType || '—';
}

/**
 * Muestra un toast de notificación en la esquina inferior derecha.
 * @param {string} mensaje
 * @param {'success'|'error'|'warning'|'info'} tipo
 */
function mostrarToast(mensaje, tipo = 'success') {
    const colores = {
        success: '#0A9396',
        error: '#ae2012',
        warning: '#ca6702',
        info: '#005F73'
    };

    const toast = document.createElement('div');
    toast.className = 'bk-toast';
    toast.textContent = mensaje;
    toast.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        background:${colores[tipo] || colores.info}; color:#fff;
        padding:12px 20px; border-radius:8px; font-size:14px;
        box-shadow:0 4px 16px rgba(0,0,0,.2); max-width:340px;
        animation:bkToastIn .3s ease; pointer-events:none;`;

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity .4s';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

/**
 * Aplica máscara de formato monetario colombiano a un input mientras escribe.
 * @param {string} id  ID del elemento input
 */
function setupMoneyInput(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', function () {
        const raw = this.value.replace(/\D/g, '');
        const num = parseInt(raw) || 0;
        this.value = num > 0 ? num.toLocaleString('es-CO') : '';
    });
}

/**
 * Muestra estado de carga en el tbody de una tabla.
 * @param {HTMLElement} tbody
 * @param {number}      cols  Número de columnas
 */
function mostrarCargandoTabla(tbody, cols = 5) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="td-loading">
        <i class="fa-solid fa-circle-notch fa-spin"></i> Cargando...</td></tr>`;
}

/**
 * Muestra un mensaje de error en el tbody de una tabla.
 * @param {HTMLElement} tbody
 * @param {string}      mensaje
 * @param {number}      cols
 */
function mostrarErrorTabla(tbody, mensaje = 'Error al cargar datos', cols = 5) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="td-loading text-error">
         ${mensaje}</td></tr>`;
}

/**
 * Muestra un mensaje de lista vacía en el tbody de una tabla.
 * @param {HTMLElement} tbody
 * @param {string}      mensaje
 * @param {number}      cols
 */
function mostrarVacioTabla(tbody, mensaje = 'Sin registros', cols = 5) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="td-loading text-muted-sm">
        ${mensaje}</td></tr>`;
}


/* =============================================================================
   BADGE DE NOTIFICACIONES — muestra conteo de no leídas sobre la campana
   Se llama en DOMContentLoaded desde el bloque principal de inicialización.
   ============================================================================= */
async function cargarBadgeNotificaciones() {
    const badge = document.getElementById('notifCount');
    if (!badge) return;
    try {
        const res = await apiFetch('/notificaciones');
        if (!res?.ok) return;
        const notifs = await res.json();
        const noLeidas = Array.isArray(notifs)
            ? notifs.filter(n => !n.leida).length
            : 0;
        if (noLeidas > 0) {
            badge.textContent = noLeidas > 99 ? '99+' : noLeidas;
            badge.classList.remove('hidden');
            badge.style.display = 'flex';
        } else {
            badge.textContent = '';
            badge.classList.add('hidden');
            badge.style.display = 'none';
        }
    } catch {
        /* sin conexión — ocultar badge silenciosamente */
    }
}


/* =============================================================================
   IMPRESIÓN / PDF — corrige gráficos Chart.js cortados o en blanco al imprimir
   ============================================================================= */
if (typeof window !== 'undefined') {
    const redibujarGraficosParaImpresion = () => {
        if (typeof Chart === 'undefined' || !Chart.instances) return;
        Object.values(Chart.instances).forEach(chart => {
            try { chart.resize(); } catch { /* instancia ya destruida */ }
        });
    };
    window.addEventListener('beforeprint', () => {
        // Un pequeño delay deja que el navegador termine de aplicar el
        // @media print (ocultar sidebar, cambiar a A4 horizontal) antes de
        // medir el contenedor; sin esto el resize a veces toma las medidas
        // de pantalla todavía vigentes.
        setTimeout(redibujarGraficosParaImpresion, 50);
    });
    window.addEventListener('afterprint', () => {
        setTimeout(redibujarGraficosParaImpresion, 50);
    });
}

/* =============================================================================
   REGISTRAR PAGO MANUAL (admin) — modal compartido entre detalle-prestamos.html
   (finanzas.js) y la tabla general de gestión-prestamos.html (panel.js).
   ============================================================================= */

/**
 * Abre el modal de "Registrar pago" para un préstamo.
 * @param {number} loanId
 * @param {string} nombreSocio
 * @param {object} cuotaInfo  { numeroCuota, totalCuota, saldoPendiente } — opcional,
 *        si se pasa se usa para mostrar contexto y prellenar/limitar el abono.
 * @param {function} onSuccess  callback async/sync llamado tras registrar el pago
 *        con éxito (para refrescar la tabla/detalle que abrió el modal).
 */
function abrirModalRegistrarPago(loanId, nombreSocio, cuotaInfo, onSuccess) {
    document.getElementById('modalRegistrarPago')?.remove();

    const saldo = cuotaInfo?.saldoPendiente;
    const cuota = cuotaInfo?.totalCuota;

    const modal = document.createElement('div');
    modal.id = 'modalRegistrarPago';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:440px">
            <div class="modal-header">
                <h3><i class="fa-solid"></i> Registrar pago</h3>
                <button class="btn-close" id="btnCerrarModalPago">&times;</button>
            </div>
            <div class="modal-body">
                <p class="text-muted" style="font-size:.85rem;margin-bottom:1rem">
                    ${nombreSocio ? `Socio: <strong>${nombreSocio}</strong>. ` : ''}Esto NO descuenta de ninguna
                    cuenta digital del socio, solo deja constancia de que pagó presencialmente.
                </p>

                <div class="form-group" style="margin:0 0 1rem">
                    <label>Tipo de pago</label>
                    <div style="display:flex;gap:.6rem;margin-top:.4rem">
                        <label style="flex:1;display:flex;align-items:center;gap:.4rem;border:1px solid var(--border);border-radius:8px;padding:.55rem .7rem;font-size:.85rem;cursor:pointer">
                            <input type="radio" name="rpTipo" value="completo" checked>
                            Cuota completa${cuota != null ? ` (${formatearCOP(cuota)})` : ''}
                        </label>
                        <label style="flex:1;display:flex;align-items:center;gap:.4rem;border:1px solid var(--border);border-radius:8px;padding:.55rem .7rem;font-size:.85rem;cursor:pointer">
                            <input type="radio" name="rpTipo" value="abono">
                            Abono parcial
                        </label>
                    </div>
                </div>

                <div class="form-group" id="rpMontoGroup" style="margin:0 0 1rem;display:none">
                    <label>Monto del abono</label>
                    <input type="number" id="rpMontoAbono" min="1" ${saldo != null ? `max="${saldo}"` : ''} placeholder="Ej: 50000"
                        style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:.55rem .7rem;font-size:.88rem;color:var(--text-primary)">
                    ${saldo != null ? `<span style="font-size:.75rem;color:var(--text-muted)">Saldo pendiente: ${formatearCOP(saldo)}</span>` : ''}
                </div>

                <div class="form-group" style="margin:0 0 1rem">
                    <label>Método</label>
                    <select id="rpMetodo"
                        style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:.55rem .7rem;font-size:.88rem;color:var(--text-primary)">
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia externa</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>

                <div class="form-group" style="margin:0 0 1.2rem">
                    <label>Observación (opcional)</label>
                    <textarea id="rpObservacion" rows="2" placeholder="Ej: pagó en oficina el..."
                        style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:.55rem .7rem;font-size:.88rem;color:var(--text-primary);font-family:inherit;resize:vertical"></textarea>
                </div>

                <button type="button" id="btnConfirmarRegistrarPago" class="btn-primary w-100">
                    <i class="fa-solid fa-check"></i> Registrar pago
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    const cerrar = () => modal.remove();
    document.getElementById('btnCerrarModalPago').addEventListener('click', cerrar);
    modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });

    const montoGroup = document.getElementById('rpMontoGroup');
    modal.querySelectorAll('input[name="rpTipo"]').forEach(r => {
        r.addEventListener('change', () => {
            montoGroup.style.display = r.value === 'abono' && r.checked ? 'block' : 'none';
        });
    });

    document.getElementById('btnConfirmarRegistrarPago').addEventListener('click', async () => {
        const tipoPago = modal.querySelector('input[name="rpTipo"]:checked').value;
        const metodo = document.getElementById('rpMetodo').value;
        const observacion = document.getElementById('rpObservacion').value.trim();
        let montoAbono = null;

        if (tipoPago === 'abono') {
            montoAbono = Number(document.getElementById('rpMontoAbono').value);
            if (!montoAbono || montoAbono <= 0) {
                mostrarToast('Ingresa un monto de abono válido.', 'warning');
                return;
            }
            if (saldo != null && montoAbono > saldo) {
                mostrarToast('El abono no puede ser mayor al saldo pendiente.', 'warning');
                return;
            }
        }

        const btn = document.getElementById('btnConfirmarRegistrarPago');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando...';

        try {
            const res = await apiFetch(`/admin/prestamos/${loanId}/registrar-pago`, {
                method: 'POST',
                body: JSON.stringify({ metodo, observacion, tipoPago, montoAbono })
            });
            const data = await res.json().catch(() => ({}));

            if (res?.ok) {
                cerrar();
                mostrarToast(data.mensaje || 'Pago registrado', 'success');
                if (typeof onSuccess === 'function') await onSuccess();
                if (typeof mostrarComprobantePago === 'function') {
                    mostrarComprobantePago({
                        referencia: data.referencia,
                        descripcion: data.tipo === 'abono'
                            ? `Abono a capital — préstamo ${data.prestamoCodigo || ''}`
                            : `Pago cuota ${data.numeroCuota ?? ''} — préstamo ${data.prestamoCodigo || ''}`,
                        monto: data.montoAplicado,
                        estado: 'completed',
                        fecha: new Date().toISOString()
                    });
                }
            } else {
                mostrarToast(data.mensaje || 'No se pudo registrar el pago', 'error');
            }
        } catch {
            mostrarToast('Error de conexión', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Registrar pago';
        }
    });
}