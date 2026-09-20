/**
 * =============================================================================
 * Notificaciones
 * =============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
    await cargarNotificaciones();
    initBotonesNotif();
    initFiltrosNotif();
    document.getElementById('buscarNotif')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        aplicarFiltrosNotif(q);
    });
});

let _todasNotificaciones = [];
let _filtroActivoNotif = 'todas';

function initFiltrosNotif() {
    document.querySelectorAll('.ntf-pill[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ntf-pill[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _filtroActivoNotif = btn.dataset.filter;
            aplicarFiltrosNotif(document.getElementById('buscarNotif')?.value?.toLowerCase() || '');
        });
    });
}

/** Determina a qué categoría de filtro pertenece una notificación. */
function clasificarNotif(n) {
    const tipo = (n.type || n.tipo || '').toLowerCase();
    const titulo = (n.titulo || '').toLowerCase();

    if (tipo.startsWith('loan_') || titulo.includes('préstamo') || titulo.includes('credito') || titulo.includes('crédito') || titulo.includes('cuota')) {
        return 'prestamos';
    }
    if (tipo === 'payment' || tipo.startsWith('transfer_') || titulo.includes('pago') || titulo.includes('transferencia')) {
        return 'pagos';
    }
    if (tipo.includes('security') || tipo.includes('mfa') || tipo.includes('login') || tipo.includes('sesion') ||
        titulo.includes('seguridad') || titulo.includes('sesión') || titulo.includes('contraseña') || titulo.includes('bloque')) {
        return 'seguridad';
    }
    if (tipo.includes('system') || tipo.includes('bienvenid') || titulo.includes('sistema') || titulo.includes('bienvenid') || titulo.includes('mantenimiento')) {
        return 'sistema';
    }
    /* Cualquier tipo no reconocido cae en "sistema" para no perderlo de la lista general */
    return 'sistema';
}

/** Aplica el filtro de pestaña activo + el texto de búsqueda sobre _todasNotificaciones */
function aplicarFiltrosNotif(q) {
    let filtradas = _todasNotificaciones;
    if (_filtroActivoNotif && _filtroActivoNotif !== 'todas') {
        filtradas = filtradas.filter(n => clasificarNotif(n) === _filtroActivoNotif);
    }
    if (q) {
        filtradas = filtradas.filter(n =>
            (n.titulo || '').toLowerCase().includes(q) ||
            (n.mensaje || '').toLowerCase().includes(q));
    }
    const lista = document.getElementById('notificacionesList');
    renderNotificaciones(filtradas, lista);
}

async function cargarNotificaciones() {
    const lista = document.getElementById('notificacionesList');
    if (!lista) return;

    lista.innerHTML = '<p class="loading-text" style="padding:2rem;text-align:center;color:var(--text-muted)"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando notificaciones...</p>';

    try {
        const res = await apiFetch('/notificaciones');
        if (!res?.ok) { lista.innerHTML = '<p class="empty-state" style="padding:2rem;text-align:center;color:var(--text-muted)">No se pudieron cargar las notificaciones.</p>'; return; }
        _todasNotificaciones = await res.json();
        renderNotificaciones(_todasNotificaciones, lista);
        actualizarKpisNotif(_todasNotificaciones);
    } catch {
        lista.innerHTML = '<p class="empty-state" style="padding:2rem;text-align:center;color:var(--text-muted)">Error al cargar notificaciones.</p>';
    }
}

function renderNotificaciones(data, lista) {
    if (!lista) lista = document.getElementById('notificacionesList');
    if (!lista) return;

    if (!data.length) {
        lista.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--text-muted)"><i class="fa-solid fa-bell-slash fa-2x" style="opacity:.3"></i><br>No tienes notificaciones.</p>';
        return;
    }

    lista.innerHTML = data.map(n => `
        <div class="notif-item ${n.leida ? 'leida' : 'no-leida'}" data-id="${n.id}"
             style="display:flex;align-items:flex-start;gap:.8rem;padding:1rem;border-bottom:1px solid var(--border);${!n.leida ? 'background:var(--bg-highlight,#f0f9ff);' : ''}${resolverEnlaceNotificacion(n) ? 'cursor:pointer;' : ''}">
            <div class="notif-icon" style="width:2rem;text-align:center;padding-top:.15rem;color:var(--primary)">
                <i class="fa-solid ${iconoNotif(n.titulo)}"></i>
            </div>
            <div class="notif-body" style="flex:1;min-width:0">
                <p class="notif-titulo" style="margin:0 0 .2rem;font-weight:600;font-size:.9rem">${escHtml(n.titulo)}</p>
                <p class="notif-mensaje" style="margin:0 0 .3rem;font-size:.82rem;color:var(--text-secondary)">${escHtml(n.mensaje)}</p>
                <span class="notif-fecha" style="font-size:.75rem;color:var(--text-muted)">${formatFecha(n.fecha || n.createdAt)}</span>
            </div>
            ${!n.leida ? `<button class="btn-marcar-leida" data-id="${n.id}" title="Marcar como leída"
                style="background:none;border:1px solid var(--border);border-radius:6px;padding:.3rem .6rem;cursor:pointer;color:var(--text-muted)">
                <i class="fa-solid fa-check"></i>
            </button>` : '<i class="fa-solid fa-check-double" style="color:var(--text-muted);opacity:.5;margin-top:.2rem"></i>'}
        </div>
    `).join('');

    // Evento: clic en la notificación navega a la página/elemento relacionado
    lista.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', () => {
            const n = data.find(x => String(x.id) === String(el.dataset.id));
            if (n) irANotificacion(n);
        });
    });

    // Evento: marcar individual como leída
    lista.querySelectorAll('.btn-marcar-leida').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            try { await apiFetch(`/notificaciones/${id}/leer`, { method: 'PUT' }); } catch { }
            btn.closest('.notif-item').classList.replace('no-leida', 'leida');
            btn.style.background = '';
            btn.replaceWith(document.createRange().createContextualFragment('<i class="fa-solid fa-check-double" style="color:var(--text-muted);opacity:.5;margin-top:.2rem"></i>'));
            // Update local data
            const n = _todasNotificaciones.find(x => String(x.id) === String(id));
            if (n) n.leida = true;
            actualizarBadge();
            actualizarKpisNotif(_todasNotificaciones);
        });
    });
}

function actualizarKpisNotif(data) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const noLeidas = data.filter(n => !n.leida).length;
    const leidas = data.filter(n => n.leida).length;
    const alertas = data.filter(n => (n.tipo || n.titulo || '').toLowerCase().includes('alert') ||
        (n.titulo || '').toLowerCase().includes('bloqu')).length;
    set('kpiTotalNotif', data.length);
    set('kpiNoLeidas', noLeidas);
    set('kpiLeidas', leidas);
    set('kpiAlertas', alertas);
    actualizarBadge(noLeidas);
}

function initBotonesNotif() {
    // Botón "Marcar todas como leídas"
    const btnMarcar = document.getElementById('btnMarcarTodasLeidas');
    btnMarcar?.addEventListener('click', async () => {
        try {
            await apiFetch('/notificaciones/marcar-leidas', { method: 'POST' });
            document.querySelectorAll('.notif-item.no-leida').forEach(el => {
                el.classList.replace('no-leida', 'leida');
                el.querySelector('.btn-marcar-leida')?.remove();
            });
            actualizarBadge(0);
            if (typeof mostrarToast === 'function') mostrarToast('Todas las notificaciones marcadas como leídas', 'success');
        } catch { /* silencioso */ }
    });
}

function actualizarBadge(count) {
    const badge = document.querySelector('.notif-badge');
    if (!badge) return;
    const noLeidas = count !== undefined
        ? count
        : document.querySelectorAll('.notif-item.no-leida').length;
    if (noLeidas > 0) {
        badge.style.display = 'flex';
        badge.textContent = noLeidas;
    } else {
        badge.style.display = 'none';
        badge.textContent = '';
    }
}

function iconoNotif(titulo) {
    if (!titulo) return 'fa-bell';
    const t = titulo.toLowerCase();
    if (t.includes('préstamo') || t.includes('credito')) return 'fa-hand-holding-dollar';
    if (t.includes('transferencia') || t.includes('pago')) return 'fa-arrow-right-arrow-left';
    if (t.includes('aprobado')) return 'fa-circle-check';
    if (t.includes('rechazad')) return 'fa-circle-xmark';
    if (t.includes('bienvenid')) return 'fa-star';
    return 'fa-bell';
}

function formatFecha(fechaStr) {
    if (!fechaStr) return '';
    try {
        return new Date(fechaStr).toLocaleString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch { return fechaStr; }
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}