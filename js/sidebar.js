/**
 * =============================================================================
 * Genera el sidebar y actualiza header dinámicamente.
 * =============================================================================
 */

(function () {

    const MENU = [
        { href: 'dashboard.html', icon: 'fa-house', labelKey: 'nav.inicio' },
        { separator: true },
        { labelKey: 'nav.grupo_finanzas', group: true },
        { href: 'cuentas.html', icon: 'fa-wallet', labelKey: 'nav.cuentas', socioOnly: true },
        { href: 'transferencias.html', icon: 'fa-money-bill-transfer', labelKey: 'nav.transferencias', socioOnly: true },
        { href: 'pagos.html', icon: 'fa-receipt', labelKey: 'nav.pagos', socioOnly: true },
        { href: 'tarjetavirtual.html', icon: 'fa-credit-card', labelKey: 'nav.tarjeta_virtual', socioOnly: true },
        { separator: true },
        { labelKey: 'nav.grupo_creditos', group: true },
        { href: 'prestamos.html', icon: 'fa-hand-holding-dollar', labelKey: 'nav.prestamos', socioOnly: true },
        { href: 'simulador-credito.html', icon: 'fa-calculator', labelKey: 'nav.simulador' },
        { separator: true },
        { labelKey: 'nav.grupo_datos', group: true },
        { href: 'historial.html', icon: 'fa-clock-rotate-left', labelKey: 'nav.historial', socioOnly: true },
        { href: 'salud-financiera.html', icon: 'fa-chart-pie', labelKey: 'nav.salud_financiera', socioOnly: true },
        { href: 'metas-ahorro.html', icon: 'fa-piggy-bank', labelKey: 'nav.metas_ahorro', socioOnly: true },
        { href: 'prestamos-solidarios.html', icon: 'fa-people-arrows', labelKey: 'nav.prestamos_solidarios', socioOnly: true },
        { href: 'comunidad.html', icon: 'fa-users', labelKey: 'nav.comunidad' },
        { href: 'encuestas.html', icon: 'fa-square-poll-horizontal', labelKey: 'nav.encuestas' },
        { href: 'documentos.html', icon: 'fa-folder-open', labelKey: 'nav.documentos' },
        { href: 'educacion.html', icon: 'fa-graduation-cap', labelKey: 'nav.educacion' },
        { href: 'notificaciones.html', icon: 'fa-bell', labelKey: 'nav.notificaciones' },
        { href: 'beneficios.html', icon: 'fa-gift', labelKey: 'nav.beneficios' },
        { separator: true },
        { labelKey: 'nav.grupo_soporte', group: true },
        { href: 'soporte-tecnico.html', icon: 'fa-headset', labelKey: 'nav.soporte_tecnico' },
        { href: 'ayuda.html', icon: 'fa-circle-question', labelKey: 'nav.centro_ayuda' },
        { separator: true },
        { labelKey: 'nav.grupo_cuenta', group: true },
        { href: 'perfil.html', icon: 'fa-user-circle', labelKey: 'nav.mi_perfil' },
        { href: 'configuracion.html', icon: 'fa-gear', labelKey: 'nav.ajustes' },
        { href: 'seguridad.html', icon: 'fa-shield-halved', labelKey: 'nav.seguridad' },
        { separator: true, adminOnly: true },
        { labelKey: 'nav.grupo_admin', group: true, adminOnly: true },
        { href: 'usuarios.html', icon: 'fa-users-gear', labelKey: 'nav.gestion_usuarios', adminOnly: true, modulo: 'usuarios' },
        { href: 'gestion-prestamos.html', icon: 'fa-hand-holding-dollar', labelKey: 'nav.gestion_prestamos', adminOnly: true, modulo: 'gestion-prestamos' },
        { href: 'reportes-financieros.html', icon: 'fa-file-invoice-dollar', labelKey: 'nav.reportes_bi', adminOnly: true, modulo: 'reportes-financieros' },
        { href: 'auditoria.html', icon: 'fa-magnifying-glass-chart', labelKey: 'nav.auditoria', adminOnly: true, modulo: 'auditoria' },
        { href: 'roles-permisos.html', icon: 'fa-shield-halved', labelKey: 'nav.roles_permisos', adminOnly: true, modulo: 'roles-permisos' },
        { href: 'respaldo-recuperacion.html', icon: 'fa-database', labelKey: 'nav.respaldo', adminOnly: true, modulo: 'respaldo-recuperacion' },
    ];

    /* Vista actual para el admin: 'admin' (default) | 'socio' */
    function getVistaAdmin() {
        return localStorage.getItem('adminVista') || 'admin';
    }
    function setVistaAdmin(v) {
        localStorage.setItem('adminVista', v);
    }

    function injectSidebarHTML() {
        const aside = document.querySelector('.sidebar');
        if (!aside) return;
        aside.innerHTML = `
            <div class="brand-container">
                <img src="../assets/img/logo.png" alt="Bankomunal" class="sidebar-logo">
                <div class="brand-text">
                    <strong>BANKOMUNAL</strong>
                    <span class="subtitle" data-i18n="nav.subtitulo">Microfinanzas Comunitarias</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul class="nav-menu" id="sidebarMenu"></ul>
            </nav>
            <div class="sidebar-footer"><small>ayuda@bankomunal.org</small></div>
        `;
        if (typeof aplicarIdioma === 'function') aplicarIdioma(aside);
    }

    function buildMenu() {
        const ul = document.getElementById('sidebarMenu');
        if (!ul) return;

        const session = JSON.parse(localStorage.getItem('userSession') || '{}');
        const rol = (session.rol || 'socio').toLowerCase();
        const esAdmin = rol === 'admin';
        const permisos = session.permisos || [];

        const tieneAccesoModulo = (modulo) => {
            if (esAdmin) return true;
            const p = permisos.find(x => x.modulo === modulo);
            return !!(p && p.leer);
        };
        /* ¿Tiene el rol acceso a AL MENOS un módulo admin? (tesorero,
           secretario y auditor también son "administrativos" a su manera,
           aunque no sean el rol "admin" literal). */
        const tieneAccesoAdmin = esAdmin || permisos.some(p => p.leer);

        const vistaAdmin = getVistaAdmin(); // 'admin' | 'socio'
        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
        document.body.setAttribute('data-role', rol);

        MENU.forEach(item => {
            /* Ítems admin: solo se muestran si el rol tiene permiso de
               lectura sobre SU módulo específico (o es admin). Los
               separadores/encabezados de la sección "ADMINISTRACIÓN" (sin
               módulo propio) se rigen por "¿tiene acceso a algo ahí?". */
            if (item.adminOnly) {
                if (item.modulo && !tieneAccesoModulo(item.modulo)) return;
                if (!item.modulo && !tieneAccesoAdmin) return;
            }

            /* En vista admin: ocultar items socioOnly para mantener el sidebar limpio */
            if (item.socioOnly && tieneAccesoAdmin && vistaAdmin === 'admin') return;

            /* Separadores y grupos: solo mostrar si hay items visibles en esa sección */
            if (item.separator) {
                const li = document.createElement('li');
                li.className = 'nav-separator';
                ul.appendChild(li);
                return;
            }
            if (item.group) {
                const li = document.createElement('li');
                li.className = 'nav-group-label';
                li.innerHTML = `<span>${t(item.labelKey)}</span>`;
                ul.appendChild(li);
                return;
            }

            /* "Inicio" es dinámico: cualquier rol con algo de acceso admin
               (admin, tesorero, secretario, auditor) en vista admin cae en
               el dashboard de KPIs, no en el dashboard financiero personal
               pensado para el socio. */
            let href = item.href;
            if (href === 'dashboard.html' && tieneAccesoAdmin && vistaAdmin === 'admin') {
                href = 'admin-dashboard.html';
            }

            const isActive = currentPage === href || (href === 'admin-dashboard.html' && currentPage === 'dashboard.html');
            const li = document.createElement('li');
            const badgeHtml = href === 'comunidad.html'
                ? '<span id="sidebarComunidadBadge" class="notif-badge hidden" style="position:static;margin-left:auto">0</span>'
                : '';
            li.innerHTML = `
                <a href="${href}" class="nav-link${isActive ? ' active' : ''}" style="${badgeHtml ? 'display:flex;align-items:center' : ''}">
                    <i class="fa-solid ${item.icon}"></i>
                    <span>${t(item.labelKey)}</span>
                    ${badgeHtml}
                </a>`;
            ul.appendChild(li);
        });

        /* Toggle de vista — para cualquier rol con algo de acceso administrativo */
        if (tieneAccesoAdmin) {
            const sepToggle = document.createElement('li');
            sepToggle.className = 'nav-separator';
            ul.appendChild(sepToggle);

            const liToggle = document.createElement('li');
            const esSocioVista = vistaAdmin === 'socio';
            liToggle.innerHTML = `
                <button id="btnVistaToggle" class="nav-link nav-link-toggle" title="${esSocioVista ? t('nav.volver_admin') : t('nav.ver_paginas_socio')}" style="width:100%;background:none;border:none;cursor:pointer;text-align:left;">
                    <i class="fa-solid ${esSocioVista ? 'fa-shield-halved' : 'fa-user'}"></i>
                    <span>${esSocioVista ? t('nav.vista_admin') : t('nav.vista_socio')}</span>
                </button>`;
            ul.appendChild(liToggle);

            document.getElementById('btnVistaToggle')?.addEventListener('click', () => {
                const nueva = vistaAdmin === 'admin' ? 'socio' : 'admin';
                setVistaAdmin(nueva);

                const currentItem = MENU.find(i => i.href === currentPage);
                const yaNoAplica = (currentPage === 'admin-dashboard.html' && nueva === 'socio') ||
                    (currentItem && (
                        (nueva === 'socio' && currentItem.adminOnly) ||
                        (nueva === 'admin' && currentItem.socioOnly)
                    ));
                if (yaNoAplica) {
                    window.location.href = nueva === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
                    return;
                }

                /* Reconstruir el menú en caliente */
                ul.innerHTML = '';
                buildMenu();
            });
        }

        /* Logout */
        const sep = document.createElement('li'); sep.className = 'nav-separator';
        ul.appendChild(sep);
        const liL = document.createElement('li');
        liL.innerHTML = `<a href="#" id="logoutBtn" class="nav-link logout"><i class="fa-solid fa-right-from-bracket"></i><span>${t('nav.cerrar_sesion')}</span></a>`;
        ul.appendChild(liL);
    }

    function updateUserUI() {
        const session = JSON.parse(localStorage.getItem('userSession') || '{}');
        const nameEl = document.getElementById('nombreUsuario');
        const roleEl = document.getElementById('rolUsuario');
        const avatarEl = document.getElementById('avatarUsuario');
        const nombreCorto = session.nombreCorto ||
            (typeof calcularNombreCorto === 'function' ? calcularNombreCorto(session.nombre) : session.nombre);
        if (nameEl && session.nombre) nameEl.textContent = nombreCorto;
        if (roleEl && session.rol) roleEl.textContent = session.rol;
        if (avatarEl) {
            if (session.fotoUrl) {

                const rel = (typeof normalizarFotoUrlRelativa === 'function')
                    ? normalizarFotoUrlRelativa(session.fotoUrl)
                    : (session.fotoUrl.startsWith('/') ? session.fotoUrl : '/' + session.fotoUrl);
                const urlAbs = rel.startsWith('http') || rel.startsWith('data:')
                    ? rel
                    : 'https://bankomunal-backend.onrender.com' + rel;
                avatarEl.style.backgroundImage = `url(${urlAbs})`;
                avatarEl.style.backgroundSize = 'cover';
                avatarEl.style.backgroundPosition = 'center';
                avatarEl.textContent = '';
            } else if (session.iniciales) {
                avatarEl.textContent = session.iniciales;
            } else if (typeof calcularIniciales === 'function') {
                avatarEl.textContent = calcularIniciales(nombreCorto);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        injectSidebarHTML();
        buildMenu();
        updateUserUI();
        actualizarBadgeComunidad();
    });

    /** Reconstruye el sidebar completo — usado por cambiarIdioma() en i18n.js */
    window.reconstruirSidebar = function () {
        injectSidebarHTML();
        buildMenu();
        updateUserUI();
    };

    /**
     * Punto rojo en "Mi Comunidad" cuando hay mensajes de chat (directos o de
     * grupo) sin leer — se consulta en cualquier página, no solo dentro de
     * comunidad.html, para que el socio se entere sin tener que entrar.
     */
    async function actualizarBadgeComunidad() {
        const badge = document.getElementById('sidebarComunidadBadge');
        if (!badge || typeof apiFetch !== 'function') return;
        try {
            const res = await apiFetch('/chat/hilos');
            if (!res?.ok) return;
            const hilos = await res.json();
            const total = hilos.reduce((acc, h) => acc + (h.noLeidos || 0), 0);
            badge.textContent = total > 9 ? '9+' : String(total);
            badge.classList.toggle('hidden', total === 0);
        } catch { /* silencioso: no bloquear el resto del sidebar por esto */ }
    }
    window.actualizarBadgeComunidad = actualizarBadgeComunidad;
})();