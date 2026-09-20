/**
 * =============================================================================
 * ADMIN-DASHBOARD — Página de inicio para administradores.
 * =============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('kpiCarteraTotal') || !window.location.pathname.includes('admin-dashboard')) return;

    ajustarAccesosRapidos();

    if (typeof tienePermiso !== 'function' || tienePermiso('reportes-financieros')) cargarKpisAdmin();
    else document.querySelector('.kpi-row')?.classList.add('hidden');

    if (typeof tienePermiso !== 'function' || tienePermiso('gestion-prestamos')) {
        cargarPendientesAprobacion();
    } else {
        ocultarTarjetaDe('listaPendientesAprobacion');
    }

    // Tickets de soporte: solo admin (no forma parte de los 6 módulos con permisos)
    const session = getSession?.() || {};
    if ((session.rol || '').toLowerCase() === 'admin') {
        cargarTicketsAbiertosResumen();
    } else {
        ocultarTarjetaDe('listaTicketsAbiertos');
    }

    if (typeof tienePermiso !== 'function' || tienePermiso('auditoria')) cargarActividadReciente();
    else document.getElementById('tbodyActividadReciente')?.closest('section')?.classList.add('hidden');
});

/** Oculta la tarjeta/sección completa que contiene un elemento, si el rol no tiene acceso a esos datos. */
function ocultarTarjetaDe(idContenido) {
    document.getElementById(idContenido)?.closest('section')?.classList.add('hidden');
}

/** Muestra solo los accesos rápidos que el rol puede realmente usar. */
function ajustarAccesosRapidos() {
    const mapa = {
        'usuarios.html': 'usuarios',
        'gestion-prestamos.html': 'gestion-prestamos',
        'reportes-financieros.html': 'reportes-financieros',
        'auditoria.html': 'auditoria',
    };
    document.querySelectorAll('.quick-actions-bar a').forEach(a => {
        const href = a.getAttribute('href');
        const modulo = mapa[href];
        if (modulo && typeof tienePermiso === 'function' && !tienePermiso(modulo)) {
            a.remove();
        }
    });
}

async function cargarKpisAdmin() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    try {
        const res = await apiFetch('/admin/reportes');
        if (!res?.ok) throw new Error('Sin acceso a reportes');
        const data = await res.json();

        set('kpiCarteraTotal', formatearCOP(data.carteraTotal || data.montoCartera || 0));
        set('kpiIndiceMora', (data.indiceMora || 0).toFixed(1) + '%');
        set('kpiSociosActivos', data.sociosActivos ?? data.totalUsuarios ?? '--');
        set('kpiPrestamosActivos', data.prestamosActivos ?? data.totalPrestamos ?? '--');
        set('kpiTasaPago', (data.tasaPago || 0).toFixed(1) + '%');

        const setTrend = (id, texto) => { const el = document.getElementById(id); if (el && texto) el.textContent = texto; };
        setTrend('trendCartera', data.tendenciaCartera);
        setTrend('trendMora', data.tendenciaMora);
        setTrend('trendSocios', data.tendenciaSocios);
    } catch (err) {
        console.error('[admin-dashboard] KPIs', err);
    }
}

async function cargarPendientesAprobacion() {
    const cont = document.getElementById('listaPendientesAprobacion');
    if (!cont) return;
    try {
        const res = await apiFetch('/admin/prestamos');
        if (!res?.ok) throw new Error();
        const prestamos = (await res.json()).filter(p => (p.estado || '').toLowerCase() === 'pending');

        if (!prestamos.length) {
            cont.innerHTML = '<p class="text-muted" style="padding:1rem 0"><i class="fa-solid" style="color:#16a34a"></i> No hay préstamos pendientes de aprobación.</p>';
            return;
        }

        cont.innerHTML = prestamos.slice(0, 6).map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:.55rem 0;border-bottom:1px solid var(--border-color,#f1f5f9)">
                <div>
                    <div style="font-weight:600;font-size:.88rem">${p.solicitante || '—'}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${formatearCOP(p.montoSolicitado || 0)} · ${p.plazoMeses || '--'} meses</div>
                </div>
                <a href="detalle-prestamos.html?id=${p.id}" class="btn-secondary" style="padding:.35rem .7rem;font-size:.78rem">Revisar</a>
            </div>`).join('');

        if (prestamos.length > 6) {
            cont.innerHTML += `<p class="text-muted" style="font-size:.78rem;padding-top:.5rem">+${prestamos.length - 6} más pendientes.</p>`;
        }
    } catch (err) {
        cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">No se pudo cargar la lista de préstamos.</p>';
    }
}

async function cargarTicketsAbiertosResumen() {
    const cont = document.getElementById('listaTicketsAbiertos');
    if (!cont) return;
    try {
        const res = await apiFetch('/admin/soporte/tickets');
        if (!res?.ok) throw new Error();
        const tickets = (await res.json()).filter(t => t.estado === 'open' || t.estado === 'in_progress');

        if (!tickets.length) {
            cont.innerHTML = '<p class="text-muted" style="padding:1rem 0"><i class="fa-solid" style="color:#16a34a"></i> No hay tickets abiertos.</p>';
            return;
        }

        const prioColor = { alta: '#dc2626', media: '#92400e', baja: '#64748b' };
        cont.innerHTML = tickets.slice(0, 6).map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:.55rem 0;border-bottom:1px solid var(--border-color,#f1f5f9)">
                <div>
                    <div style="font-weight:600;font-size:.88rem">#${t.id} · ${t.asunto || '—'}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${t.solicitanteNombre || '—'}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;color:${prioColor[t.prioridad] || '#64748b'}">${(t.prioridad || 'media').toUpperCase()}</span>
            </div>`).join('');

        if (tickets.length > 6) {
            cont.innerHTML += `<p class="text-muted" style="font-size:.78rem;padding-top:.5rem">+${tickets.length - 6} más abiertos.</p>`;
        }
    } catch (err) {
        cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">No se pudo cargar la lista de tickets.</p>';
    }
}

async function cargarActividadReciente() {
    const tbody = document.getElementById('tbodyActividadReciente');
    if (!tbody) return;
    try {
        const res = await apiFetch('/admin/auditoria');
        if (!res?.ok) throw new Error();
        const logs = await res.json();

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Sin actividad registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.slice(0, 8).map(l => {
            const fecha = l.createdAt ? new Date(l.createdAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
            const correo = l.userEmail || l.usuario?.email || '—';
            return `<tr>
                <td style="font-size:.8rem;color:var(--text-muted)">${fecha}</td>
                <td style="font-size:.85rem">${correo}</td>
                <td style="font-size:.85rem">${labelEventoAuditoria(l.eventType)}</td>
                <td style="font-size:.8rem;color:var(--text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.details || ''}">${l.details || '—'}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No se pudo cargar la auditoría.</td></tr>';
    }
}