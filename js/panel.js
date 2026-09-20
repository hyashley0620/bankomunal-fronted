/**
 * =============================================================================
 * Panel
 * =============================================================================
 */

/* =============================================================================
   INICIALIZACIÓN — DOMContentLoaded DATOS
   ============================================================================= */
document.addEventListener('DOMContentLoaded', () => {

    const esPaginaReportesFinancieros =
        document.getElementById('mainChart') && document.getElementById('txBody')
        && document.getElementById('distChart') && !document.getElementById('savingsChart');

    if ((document.getElementById('historialBody') || document.getElementById('txBody'))
        && !document.getElementById('tablaUsuarios')
        && !document.getElementById('historialBody')
        && !esPaginaReportesFinancieros) {
        initHistorial();
    }

    /* Dashboard: saldo de préstamos y WebSocket */
    if (document.getElementById('saldoPrestamos')) initDashboardExtra();

    if (document.getElementById('mainChart') && document.getElementById('savingsChart')) initDashboardCharts();

    /* ── MÓDULO ADMIN ── */
    /* Admin y tesorero: gestión de préstamos pendientes */
    if (document.getElementById('listaPrestamosActivos')) {
        const sess = JSON.parse(localStorage.getItem('userSession') || '{}');
        const puedeGestionarPrestamos = sess.rol === 'admin' || sess.role === 'admin' ||
            (typeof tienePermiso === 'function' && tienePermiso('gestion-prestamos'));
        if (puedeGestionarPrestamos) {
            initAdminPrestamos();
            initOrigenPrestamoModal();
        }
    }

    if (document.getElementById('btnExportar')) initAuditoria();

    /* Tabs de navegación interna */
    initTabs();

});


/* =============================================================================
   HISTORIAL DE MOVIMIENTOS
   ============================================================================= */

let movimientosCache = [];

async function initHistorial() {
    const tbody = document.getElementById('historialBody') || document.getElementById('txBody');
    mostrarCargandoTabla(tbody, 6);
    try {
        const res = await apiFetch('/movimientos');
        if (!res?.ok) throw new Error('Sin respuesta');
        movimientosCache = await res.json();
        renderizarHistorial(movimientosCache);
    } catch {
        mostrarErrorTabla(tbody, 'Error al cargar los movimientos', 6);
    }
}

function renderizarHistorial(movimientos) {
    const tbody = document.getElementById('historialBody') || document.getElementById('txBody');
    if (!tbody) return;

    if (!movimientos.length) {
        mostrarVacioTabla(tbody, 'No hay movimientos registrados', 6);
        return;
    }

    tbody.innerHTML = movimientos.map(m => {
        const esIngreso = ['deposit', 'loan_disbursement', 'transfer_received'].includes(m.tipo);
        const fecha = m.fecha
            ? new Date(m.fecha).toLocaleString('es-CO', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
            : '-';

        return `<tr data-tipo="${m.tipo}">
            <td>${fecha}</td>
            <td><strong>${labelTipoTransaccion(m.tipo)}</strong></td>
            <td>${m.descripcion || '-'}</td>
            <td>${m.referencia || '-'}</td>
            <td><span class="status-badge ${m.estado === 'completed' ? 'status-success' : 'status-warning'}">
                ${m.estado === 'completed' ? 'Completado' : m.estado}</span></td>
            <td class="monto-col ${esIngreso ? 'text-ingreso' : 'text-egreso'}">
                ${esIngreso ? '+' : '-'}${formatearCOP(m.monto)}
            </td>
        </tr>`;
    }).join('');
}

/* =============================================================================
   DASHBOARD — KPIs y gráficas
   ============================================================================= */

async function initDashboardExtra() {
    /* Cargar saldo real desde la cuenta */
    try {
        const rc = await apiFetch('/cuentas');
        if (rc?.ok) {
            const cuentas = await rc.json();
            const totalSaldo = cuentas.reduce((s, c) => s + (c.saldo || 0), 0);
            const saldoEl = document.getElementById('saldoGlobal');
            if (saldoEl) saldoEl.textContent = formatearCOP(totalSaldo);
            /* Actualizar sesión con saldo real */
            const sess = JSON.parse(localStorage.getItem('userSession') || '{}');
            sess.saldoTotal = totalSaldo;
            localStorage.setItem('userSession', JSON.stringify(sess));
        }
    } catch { /* Silencioso — usa sesión guardada */ }

    try {
        const res = await apiFetch('/prestamos/mis-prestamos');
        if (!res?.ok) return;
        const data = await res.json();
        const deuda = data
            .filter(p => p.estado === 'active')
            .reduce((s, p) => s + (p.saldoPendiente || 0), 0);

        const el = document.getElementById('saldoPrestamos');
        if (el) el.textContent = formatearCOP(deuda);

        /* Próxima cuota */
        const activo = data.find(p => p.estado === 'active');
        const proxEl = document.getElementById('proximaCuota');
        if (proxEl && activo) proxEl.textContent = formatearCOP(activo.cuotaMensual || 0);

    } catch { /* Silencioso */ }

    /* Fondo común — primer grupo del usuario */
    try {
        const res = await apiFetch('/comunidad/grupos');
        if (res?.ok) {
            const grupos = await res.json();
            const fondoEl = document.getElementById('fondoComun');
            if (fondoEl && grupos.length) {
                const total = grupos.reduce((s, g) => s + (g.fondoComun || 0), 0);
                fondoEl.textContent = formatearCOP(total);
            }
        }
    } catch { /* Silencioso */ }

    if (typeof conectarWebSocket === 'function') conectarWebSocket();
}

async function initDashboardCharts() {
    if (typeof Chart === 'undefined') return;

    let labels = [], ingresos = [], egresos = [];

    try {
        const res = await apiFetch('/movimientos');
        if (res?.ok) {
            const movs = await res.json();
            const meses = {};
            movs.forEach(m => {
                const d = new Date(m.fecha || m.createdAt || Date.now());
                const key = d.toLocaleString('es-CO', { month: 'short', year: '2-digit' });
                if (!meses[key]) meses[key] = { ing: 0, egr: 0 };
                const esIngreso = ['deposit', 'loan_disbursement', 'transfer_received'].includes(m.tipo);
                if (esIngreso) meses[key].ing += parseFloat(m.monto || 0);
                else meses[key].egr += parseFloat(m.monto || 0);
            });
            const keys = Object.keys(meses).slice(-6);
            labels = keys;
            ingresos = keys.map(k => meses[k].ing);
            egresos = keys.map(k => meses[k].egr);
        }
    } catch { /* usa datos vacíos */ }

    /* Si no hay datos reales, mostrar últimos 6 meses en cero */
    if (!labels.length) {
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('es-CO', { month: 'short', year: '2-digit' }));
            ingresos.push(0); egresos.push(0);
        }
    }

    /* Gráfica principal: Evolución de Capital (barras) */
    const ctxMain = document.getElementById('mainChart');
    if (ctxMain) {
        Chart.getChart(ctxMain)?.destroy();
        new Chart(ctxMain.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Ingresos', data: ingresos, backgroundColor: 'rgba(0,95,115,0.80)', borderRadius: 6 },
                    { label: 'Egresos', data: egresos, backgroundColor: 'rgba(238,155,0,0.75)', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => '$ ' + Intl.NumberFormat('es-CO').format(v) }
                    }
                }
            }
        });
    }

    /* Gráfica ahorro: donut */
    const ctxSav = document.getElementById('savingsChart');
    if (ctxSav) {
        Chart.getChart(ctxSav)?.destroy();
        const totalIng = ingresos.reduce((a, b) => a + b, 0) || 1;
        const totalEgr = egresos.reduce((a, b) => a + b, 0) || 0;
        const ahorro = Math.max(0, totalIng - totalEgr);

        new Chart(ctxSav.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Ahorrado', 'Gastos'],
                datasets: [{
                    data: [ahorro, totalEgr],
                    backgroundColor: ['#005F73', '#EE9B00'],
                    borderWidth: 0, hoverOffset: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}


/* =============================================================================
   TABS DE NAVEGACIÓN INTERNA COMUNIDAD
   ============================================================================= */

function initTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
        if (btn.closest('.tab-bar')) return; // gestionado por paginas.js
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            document.querySelectorAll('.tab-content, .tab-panel, .tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(target)?.classList.add('active');
            document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}


/**
 * Modal "Registrar préstamo" — permite a un admin originar una solicitud de
 * crédito a nombre de un socio (para quienes solicitan presencialmente en
 * oficina sin usar la app). Queda pendiente de aprobación como cualquier
 * otra solicitud.
 */
function initOrigenPrestamoModal() {
    const modal = document.getElementById('modalOrigenPrestamo');
    const btnAbrir = document.getElementById('btnAbrirOrigenPrestamo');
    if (!modal || !btnAbrir) return;

    const limpiar = () => {
        document.getElementById('origenBuscarSocio').value = '';
        document.getElementById('origenResultadosSocio').innerHTML = '';
        document.getElementById('origenSocioId').value = '';
        document.getElementById('origenSocioSeleccionado').classList.add('hidden');
        document.getElementById('origenSocioSeleccionado').innerHTML = '';
        document.getElementById('origenMonto').value = '';
        document.getElementById('origenPlazo').value = '';
        document.getElementById('origenMotivo').value = '';
    };

    btnAbrir.addEventListener('click', () => { limpiar(); modal.style.display = 'flex'; });
    document.getElementById('btnCerrarOrigenPrestamo')?.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    /* Buscador de socio con debounce (mismo patrón usado en comunidad.html) */
    let buscarTimeout;
    document.getElementById('origenBuscarSocio')?.addEventListener('input', function () {
        clearTimeout(buscarTimeout);
        const q = this.value.trim();
        const cont = document.getElementById('origenResultadosSocio');
        if (q.length < 2) { cont.innerHTML = ''; return; }
        buscarTimeout = setTimeout(async () => {
            try {
                const res = await apiFetch(`/usuarios/buscar?q=${encodeURIComponent(q)}`);
                const data = res?.ok ? await res.json() : [];
                if (!data.length) {
                    cont.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);padding:.3rem">Sin resultados</p>';
                    return;
                }
                cont.innerHTML = data.slice(0, 6).map(u => {
                    const nombre = `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || '—';
                    return `<div class="search-result-item" data-action="origen-seleccionar-socio"
                        data-id="${u.id}" data-nombre="${nombre.replace(/"/g, '&quot;')}" data-email="${u.email || ''}"
                        style="padding:.4rem .5rem;cursor:pointer;font-size:.85rem;border-bottom:1px solid var(--border-color,#f1f5f9)">
                        <i class="fa-solid fa-user" style="color:var(--primary);margin-right:.4rem;font-size:.75rem"></i>
                        ${nombre} <small style="color:var(--text-muted)">${u.email || ''}</small>
                    </div>`;
                }).join('');
            } catch { cont.innerHTML = ''; }
        }, 350);
    });

    document.getElementById('origenResultadosSocio')?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="origen-seleccionar-socio"]');
        if (!item) return;
        document.getElementById('origenSocioId').value = item.dataset.id;
        document.getElementById('origenBuscarSocio').value = item.dataset.nombre;
        document.getElementById('origenResultadosSocio').innerHTML = '';
        const sel = document.getElementById('origenSocioSeleccionado');
        sel.classList.remove('hidden');
        sel.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#16a34a"></i> Socio seleccionado:
            <strong>${item.dataset.nombre}</strong> · ${item.dataset.email}`;
    });

    document.getElementById('btnConfirmarOrigenPrestamo')?.addEventListener('click', async () => {
        const socioId = document.getElementById('origenSocioId').value;
        const monto = parseFloat(document.getElementById('origenMonto').value);
        const plazo = parseInt(document.getElementById('origenPlazo').value, 10);
        const motivo = document.getElementById('origenMotivo').value.trim();

        if (!socioId) return mostrarToast('Selecciona un socio de la lista.', 'warning');
        if (!monto || monto <= 0) return mostrarToast('Ingresa un monto válido.', 'warning');
        if (!plazo || plazo < 1 || plazo > 120) return mostrarToast('El plazo debe ser entre 1 y 120 meses.', 'warning');

        const btn = document.getElementById('btnConfirmarOrigenPrestamo');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando...';
        try {
            const res = await apiFetch(`/admin/prestamos/socio/${socioId}`, {
                method: 'POST',
                body: JSON.stringify({ montoSolicitado: monto, plazoMeses: plazo, motivo })
            });
            if (res?.ok) {
                mostrarToast('Solicitud registrada — queda pendiente de aprobación ', 'success');
                modal.style.display = 'none';
                if (typeof initAdminPrestamos === 'function') initAdminPrestamos();
            } else {
                const data = await res?.json().catch(() => ({}));
                mostrarToast(data?.mensaje || Object.values(data || {}).join(' | ') || 'No se pudo registrar la solicitud.', 'error');
            }
        } catch {
            mostrarToast('Error de conexión', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Registrar solicitud';
        }
    });
}

/* =============================================================================
   GESTIÓN DE PRÉSTAMOS (ADMIN) — aprobación y rechazo
   ============================================================================= */

async function initAdminPrestamos() {
    const tbody = document.getElementById('listaPrestamosActivos');
    if (!tbody) return;

    /* Cambiar el encabezado de la sección para admin */
    const heading = document.querySelector('h2.section-title, .loan-section h3');
    if (heading) heading.textContent = 'Gestión de Préstamos — Panel Admin';

    mostrarCargandoTabla(tbody, 7);
    try {
        const res = await apiFetch('/admin/prestamos');
        if (!res?.ok) throw new Error();
        const prestamos = await res.json();

        if (!prestamos.length) {
            mostrarVacioTabla(tbody, 'No hay préstamos pendientes', 7);
            return;
        }

        tbody.innerHTML = prestamos.map(p => {
            const estadoLower = (p.estado || '').toLowerCase();
            const cls = {
                'pending': 'status-badge status-warning',
                'approved': 'status-badge status-info',
                'active': 'status-badge status-success',
                'rejected': 'status-badge status-danger',
                'paid': 'status-badge status-info',
                'defaulted': 'status-badge status-danger',
            }[estadoLower] || 'status-badge status-neutral';

            const etiqueta = {
                'pending': 'Pendiente', 'approved': 'Contrato pendiente', 'active': 'Activo',
                'rejected': 'Rechazado', 'paid': 'Pagado', 'defaulted': 'En mora',
            }[estadoLower] || p.estado;

            const puedeGestionar = estadoLower === 'pending';
            const puedeRegistrarPago = estadoLower === 'active';

            return `<tr data-loan-row data-estado="${estadoLower}">
                <td><strong>#${p.id}</strong></td>
                <td>${p.solicitante || p.emailSolicitante || '-'}</td>
                <td>${formatearCOP(p.montoSolicitado || 0)}</td>
                <td>${p.plazoMeses || '-'} meses</td>
                <td><span class="${cls}">${etiqueta}</span></td>
                <td>
                    ${puedeGestionar ? `
                    <button class="btn-link-sm" style="color:var(--success);background:rgba(16,185,129,.1);"
                        data-action="prestamo-accion" data-id="${p.id}" data-tipo="aprobar">
                        <i class="fa-solid fa-check"></i> Aprobar
                    </button>
                    <button class="btn-link-sm" style="color:var(--danger);background:rgba(239,68,68,.1);margin-left:4px;"
                        data-action="prestamo-accion" data-id="${p.id}" data-tipo="rechazar">
                        <i class="fa-solid fa-xmark"></i> Rechazar
                    </button>` : puedeRegistrarPago ? `
                    <button class="btn-link-sm" style="color:var(--primary);background:rgba(59,130,246,.1);"
                        data-action="prestamo-pago" data-id="${p.id}" data-nombre="${(p.solicitante || 'el socio').replace(/"/g, '&quot;')}"
                        data-cuota="${p.cuotaMensual || ''}" data-saldo="${p.saldoPendiente || ''}">
                        <i class="fa-solid fa-hand-holding-dollar"></i> Registrar pago
                    </button>` : `<span class="text-muted" style="font-size:.8rem;">Sin acciones</span>`}
                </td>
                <td><a href="detalle-prestamos.html?id=${p.id}" class="btn-link-sm">Ver</a></td>
            </tr>`;
        }).join('');

        const setKpi = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        const pendientesCount = prestamos.filter(p => (p.estado || '').toLowerCase() === 'pending').length;
        const aprobadosCount = prestamos.filter(p => ['approved', 'active'].includes((p.estado || '').toLowerCase())).length;
        const montoCartera = prestamos
            .filter(p => ['approved', 'active'].includes((p.estado || '').toLowerCase()))
            .reduce((s, p) => s + (p.montoSolicitado || 0), 0);
        setKpi('kpiTotalSolicitudes', prestamos.length);
        setKpi('kpiPrestamosPendientes', pendientesCount);
        setKpi('kpiPrestamosAprobados', aprobadosCount);
        setKpi('kpiMontoCartera', formatearCOP(montoCartera));

        // Búsqueda y filtro de estado (solo existen en gestion-prestamos)
        const aplicarFiltrosPrestamos = () => {
            const q = (document.getElementById('searchPrestamos')?.value || '').toLowerCase();
            const estadoF = document.getElementById('filtroEstadoPrestamo')?.value || '';
            document.querySelectorAll('#listaPrestamosActivos > tr[data-loan-row]').forEach(tr => {
                const texto = tr.textContent.toLowerCase();
                const estado = tr.dataset.estado || '';
                const matchQ = !q || texto.includes(q);
                const matchE = !estadoF || estado === estadoF;
                tr.style.display = (matchQ && matchE) ? '' : 'none';
            });
        };
        document.getElementById('searchPrestamos')?.addEventListener('input', aplicarFiltrosPrestamos);
        document.getElementById('filtroEstadoPrestamo')?.addEventListener('change', aplicarFiltrosPrestamos);

    } catch {
        mostrarErrorTabla(tbody, 'Error al cargar préstamos', 7);
    }
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="prestamo-accion"]');
    if (btn) accionPrestamo(Number(btn.dataset.id), btn.dataset.tipo);
});

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="prestamo-pago"]');
    if (btn) registrarPagoAdminLista(Number(btn.dataset.id), btn.dataset.nombre, {
        totalCuota: btn.dataset.cuota ? Number(btn.dataset.cuota) : null,
        saldoPendiente: btn.dataset.saldo ? Number(btn.dataset.saldo) : null
    });
});

window.registrarPagoAdminLista = function (loanId, nombreSocio, cuotaInfo) {
    abrirModalRegistrarPago(loanId, nombreSocio, cuotaInfo, () => initAdminPrestamos());
};

window.accionPrestamo = async function (loanId, accion) {
    let motivo = null;
    if (accion === 'rechazar') {
        motivo = prompt('Motivo del rechazo (el socio lo verá reflejado en su préstamo):');
        if (motivo === null) return;
    } else if (!confirm(`¿Aprobar el préstamo #${loanId}? Se le enviará el contrato al socio — el desembolso se hace cuando él lo acepte, no ahora.`)) {
        return;
    }
    try {
        const res = await apiFetch(`/admin/prestamos/${loanId}/${accion}`, {
            method: 'PATCH',
            body: accion === 'rechazar' ? JSON.stringify({ motivo }) : undefined
        });
        if (res?.ok) {
            mostrarToast(accion === 'aprobar' ? 'Contrato enviado al socio para su aceptación ' : 'Préstamo rechazado', accion === 'aprobar' ? 'success' : 'warning');
            await initAdminPrestamos();
        } else {
            const d = await res.json().catch(() => ({}));
            mostrarToast(d.mensaje || `Error al ${accion}`, 'error');
        }
    } catch { mostrarToast('Error de conexión', 'error'); }
};

/* =============================================================================
   AUDITORÍA Y LOGS
   ============================================================================= */

async function initAuditoria() {
    cargarLogsAuditoria();
    /* alias for paginas.js listeners */
    window.cargarLogAuditoria = cargarLogsAuditoria;

    document.getElementById('btnExportar')?.addEventListener('click', async () => {
        const f1 = document.getElementById('fechaInicioAudit')?.value;
        const f2 = document.getElementById('fechaFinAudit')?.value;
        const tipo = document.getElementById('filtroTipo')?.value;
        const params = new URLSearchParams();
        if (f1 && f2) { params.set('inicio', f1 + 'T00:00:00'); params.set('fin', f2 + 'T23:59:59'); }
        if (tipo && tipo !== 'all') params.set('tipo', tipo);
        const qs = params.toString();
        await descargarArchivo('/admin/auditoria/exportar' + (qs ? `?${qs}` : ''), 'auditoria-bankomunal.xlsx');
    });

    document.getElementById('btnFiltrar')?.addEventListener('click', cargarLogsAuditoria);
}

async function cargarLogsAuditoria() {
    const tbody = document.getElementById('auditLogBody') ||
        document.querySelector('#tablaAuditoria tbody') ||
        document.querySelector('#auditTable tbody');
    if (!tbody) return;

    const f1 = document.getElementById('fechaInicioAudit')?.value;
    const f2 = document.getElementById('fechaFinAudit')?.value;
    const tipo = document.getElementById('filtroTipo')?.value;

    const params = new URLSearchParams();
    if (f1 && f2) { params.set('inicio', f1 + 'T00:00:00'); params.set('fin', f2 + 'T23:59:59'); }
    if (tipo && tipo !== 'all') params.set('tipo', tipo);
    const qs = params.toString();
    const url = '/admin/auditoria' + (qs ? `?${qs}` : '');

    mostrarCargandoTabla(tbody, 6);

    try {
        const res = await apiFetch(url);
        if (!res?.ok) throw new Error();
        const logs = await res.json();

        if (!logs.length) {
            mostrarVacioTabla(tbody, 'Sin registros de auditoría', 6);
            return;
        }

        const exitosos = logs.filter(l => l.eventType === 'LOGIN_SUCCESS').length;
        const fallidos = logs.filter(l => l.eventType === 'LOGIN_FAILED').length;
        const hoy = new Date().toDateString();
        const hoyCount = logs.filter(l => l.createdAt && new Date(l.createdAt).toDateString() === hoy).length;

        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setEl('countEventos', hoyCount);
        setEl('countExitosos', exitosos);
        setEl('countAlertas', fallidos);
        setEl('countFallidos', fallidos);

        tbody.innerHTML = logs.slice(0, 100).map(l => {
            const esFallido = l.eventType?.includes('FAILED') || l.eventType?.includes('BLOCKED');
            const sevCls = esFallido ? 'sev-error' :
                l.eventType === 'LOGIN_SUCCESS' ? 'sev-ok' :
                    l.eventType?.includes('WARN') ? 'sev-warn' : 'sev-info';
            const sevLabel = esFallido ? 'Crítico' :
                l.eventType === 'LOGIN_SUCCESS' ? 'Info' :
                    l.eventType?.includes('WARN') ? 'Aviso' : 'Info';
            return `<tr>
                <td style="white-space:nowrap;font-size:.82rem;color:var(--text-muted)">
                    ${l.createdAt ? new Date(l.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                </td>
                <td style="font-size:.85rem">
                    <i class="fa-solid fa-user" style="color:#94a3b8;margin-right:4px"></i>
                    ${l.usuario?.email || l.username || '<em style="color:#94a3b8">Sistema</em>'}
                </td>
                <td><span class="status-pill ${esFallido ? 'st-danger' : 'st-success'}" style="font-size:.72rem">${labelEventoAuditoria(l.eventType)}</span></td>
                <td style="font-size:.8rem;color:var(--text-muted)">${l.ipAddress || l.objectType || '—'}</td>
                <td><span class="${sevCls}">${sevLabel}</span></td>
                <td><span class="${esFallido ? 'sev-error' : 'sev-ok'}" style="font-size:.72rem">${esFallido ? 'Alerta' : 'OK'}</span></td>
            </tr>`;
        }).join('');

    } catch {
        await cargarActividadSocio(tbody);
    }
}


/* =============================================================================
   AUDITORÍA — actividad de socios
   ============================================================================= */

/** Fallback para socios: muestra sus movimientos como actividad personal */
async function cargarActividadSocio(tbody) {
    try {
        const res = await apiFetch('/movimientos');
        if (!res?.ok) { mostrarVacioTabla(tbody, 'Sin registros disponibles', 7); return; }
        const movs = await res.json();
        const session = JSON.parse(localStorage.getItem('userSession') || '{}');

        if (!movs.length) { mostrarVacioTabla(tbody, 'Sin movimientos registrados', 7); return; }

        tbody.innerHTML = movs.slice(0, 50).map(m => {
            const fecha = m.fecha || m.createdAt || '';
            const tipo = m.tipo || 'movimiento';
            const desc = m.descripcion || m.referencia || '-';
            const monto = formatearCOP(m.monto || 0);
            const esIngreso = ['deposit', 'loan_disbursement', 'transfer_received'].includes(tipo);
            return `<tr>
                <td>${fecha ? new Date(fecha).toLocaleString('es-CO') : '-'}</td>
                <td>${session.email || session.nombre || '-'}</td>
                <td>${desc}</td>
                <td>localhost</td>
                <td><span class="status-badge ${esIngreso ? 'status-success' : 'status-info'}">${labelTipoTransaccion(tipo).toUpperCase()}</span></td>
                <td><span class="status-badge status-success">OK</span></td>
                <td>${monto}</td>
            </tr>`;
        }).join('');
    } catch { mostrarVacioTabla(tbody, 'Sin datos disponibles', 7); }
}

/* =============================================================================
   SEGURIDAD — botón "Finalizar otras sesiones"
   ============================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.includes('seguridad')) return;
    document.getElementById('logoutAllBtn')?.addEventListener('click', async () => {
        if (!confirm('¿Cerrar todas las demás sesiones activas? Deberás volver a iniciar sesión en otros dispositivos.')) return;
        try {
            const res = await apiFetch('/usuarios/sesiones/cerrar-otras', { method: 'POST' });
            if (res?.ok) mostrarToast('Otras sesiones cerradas exitosamente', 'success');
            else mostrarToast('No se pudieron cerrar las sesiones', 'error');
        } catch { mostrarToast('Error de conexión', 'error'); }
    });
});


document.addEventListener('DOMContentLoaded', () => {
    const sess = JSON.parse(localStorage.getItem('userSession') || '{}');
    const esAdmin = sess.rol === 'admin' || sess.role === 'admin';
    if (esAdmin) {
        document.getElementById('adminBeneficiosSection')?.classList.remove('hidden');
        document.getElementById('adminCursosSection')?.classList.remove('hidden');
    }
    if (esAdmin && document.getElementById('adminCursosList')) {
        initAdminCursos();
    }
});

/* =============================================================================
   GESTIÓN DE CURSOS (ADMIN) — Educación Financiera
   ============================================================================= */

let _cursosAdminCache = [];

async function initAdminCursos() {
    const tbody = document.getElementById('adminCursosList');
    if (!tbody) return;
    try {
        const res = await apiFetch('/admin/educacion/cursos');
        _cursosAdminCache = res?.ok ? await res.json() : [];
    } catch { _cursosAdminCache = []; }
    renderCursosAdmin();

    document.getElementById('btnNuevoCurso')?.addEventListener('click', () => abrirModalCurso(null));
    document.getElementById('btnCerrarModalCurso')?.addEventListener('click', cerrarModalCurso);
    document.getElementById('modalCurso')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalCurso') cerrarModalCurso();
    });
    document.getElementById('btnAgregarLeccion')?.addEventListener('click', () => agregarBloqueLeccion());
    document.getElementById('btnGuardarCurso')?.addEventListener('click', guardarCursoAdmin);

    tbody.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('[data-action="editar-curso"]');
        const btnToggle = e.target.closest('[data-action="toggle-curso"]');
        if (btnEdit) abrirModalCurso(Number(btnEdit.dataset.id));
        if (btnToggle) toggleCursoActivo(Number(btnToggle.dataset.id), btnToggle.dataset.activo === 'true');
    });
}

function renderCursosAdmin() {
    const tbody = document.getElementById('adminCursosList');
    if (!tbody) return;
    if (!_cursosAdminCache.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No hay cursos creados aún.</td></tr>';
        return;
    }
    tbody.innerHTML = _cursosAdminCache.map(c => `
        <tr>
            <td>${c.emoji || ''} <strong>${c.titulo}</strong></td>
            <td style="text-transform:capitalize">${c.categoria || '-'}</td>
            <td>${c.nivel || '-'}</td>
            <td>${(c.lecciones || []).length}</td>
            <td>${c.puntos ?? 0} pts</td>
            <td><span class="status-badge ${c.activo ? 'status-success' : 'status-danger'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>
                <button class="btn-link-sm" style="color:var(--primary)" data-action="editar-curso" data-id="${c.id}">
                    <i class="fa-solid fa-pen"></i> Editar
                </button>
                <button class="btn-link-sm" style="color:${c.activo ? 'var(--danger,#dc2626)' : 'var(--success,#16a34a)'};margin-left:4px"
                    data-action="toggle-curso" data-id="${c.id}" data-activo="${c.activo}">
                    <i class="fa-solid ${c.activo ? 'fa-eye-slash' : 'fa-eye'}"></i> ${c.activo ? 'Desactivar' : 'Reactivar'}
                </button>
            </td>
        </tr>`).join('');
}

function abrirModalCurso(id) {
    const modal = document.getElementById('modalCurso');
    if (!modal) return;
    document.getElementById('listaLeccionesForm').innerHTML = '';

    if (id) {
        const c = _cursosAdminCache.find(x => x.id === id);
        if (!c) return;
        document.getElementById('modalCursoTitulo').innerHTML = '<i class="fa-solid"></i> Editar Curso';
        document.getElementById('cursoId').value = c.id;
        document.getElementById('cursoTitulo').value = c.titulo || '';
        document.getElementById('cursoEmoji').value = c.emoji || '';
        document.getElementById('cursoColor').value = c.color || '#e8f4fb';
        document.getElementById('cursoCategoria').value = c.categoria || 'ahorro';
        document.getElementById('cursoNivel').value = c.nivel || 'Básico';
        document.getElementById('cursoDuracion').value = c.duracion || '';
        document.getElementById('cursoDescripcion').value = c.descripcion || '';
        document.getElementById('cursoPuntos').value = c.puntos ?? 100;
        document.getElementById('cursoActivo').value = String(c.activo);
        (c.lecciones || []).forEach(l => agregarBloqueLeccion(l));
    } else {
        document.getElementById('modalCursoTitulo').innerHTML = '<i class="fa-solid"></i> Nuevo Curso';
        ['cursoId', 'cursoTitulo', 'cursoEmoji', 'cursoDuracion', 'cursoDescripcion'].forEach(id2 => {
            const el = document.getElementById(id2); if (el) el.value = '';
        });
        document.getElementById('cursoColor').value = '#e8f4fb';
        document.getElementById('cursoCategoria').value = 'ahorro';
        document.getElementById('cursoNivel').value = 'Básico';
        document.getElementById('cursoPuntos').value = 100;
        document.getElementById('cursoActivo').value = 'true';
        agregarBloqueLeccion(); // arranca con una lección vacía
    }
    modal.style.display = 'flex';
}

function cerrarModalCurso() {
    const modal = document.getElementById('modalCurso');
    if (modal) modal.style.display = 'none';
}

/** Clona la plantilla de lección y la agrega al formulario, opcionalmente precargada. */
function agregarBloqueLeccion(datos) {
    const tpl = document.getElementById('tplLeccionForm');
    const cont = document.getElementById('listaLeccionesForm');
    if (!tpl || !cont) return;
    const nodo = tpl.content.cloneNode(true);
    const item = nodo.querySelector('.leccion-form-item');

    if (datos) {
        item.querySelector('.leccion-titulo').value = datos.titulo || '';
        item.querySelector('.leccion-contenido').value = datos.contenido || '';
        item.querySelector('.leccion-es-final').checked = !!datos.esFinal;
        if (datos.quiz) {
            item.querySelector('.leccion-quiz-pregunta').value = datos.quiz.pregunta || '';
            const opciones = item.querySelectorAll('.leccion-quiz-opcion');
            (datos.quiz.opciones || []).forEach((op, i) => { if (opciones[i]) opciones[i].value = op; });
            item.querySelector('.leccion-quiz-correcta').value = String(datos.quiz.correcta ?? 0);
        }
    }

    item.querySelector('.btn-quitar-leccion').addEventListener('click', () => {
        item.remove();
        renumerarLecciones();
    });

    cont.appendChild(nodo);
    renumerarLecciones();
}

function renumerarLecciones() {
    document.querySelectorAll('#listaLeccionesForm .leccion-numero').forEach((el, i) => {
        el.textContent = `Lección ${i + 1}`;
    });
}

async function guardarCursoAdmin() {
    const id = document.getElementById('cursoId').value;
    const titulo = document.getElementById('cursoTitulo').value.trim();
    if (!titulo) return mostrarToast('El título del curso es obligatorio.', 'warning');

    const lecciones = Array.from(document.querySelectorAll('#listaLeccionesForm .leccion-form-item')).map(item => {
        const pregunta = item.querySelector('.leccion-quiz-pregunta').value.trim();
        const opciones = Array.from(item.querySelectorAll('.leccion-quiz-opcion'))
            .map(i => i.value.trim()).filter(Boolean);
        return {
            titulo: item.querySelector('.leccion-titulo').value.trim(),
            contenido: item.querySelector('.leccion-contenido').value.trim(),
            esFinal: item.querySelector('.leccion-es-final').checked,
            quizPregunta: pregunta || null,
            quizOpciones: pregunta ? opciones : [],
            quizCorrecta: pregunta ? Number(item.querySelector('.leccion-quiz-correcta').value) : null,
        };
    }).filter(l => l.titulo); // ignora bloques de lección sin título

    if (!lecciones.length) return mostrarToast('Agrega al menos una lección.', 'warning');

    const body = {
        titulo,
        emoji: document.getElementById('cursoEmoji').value.trim(),
        color: document.getElementById('cursoColor').value,
        categoria: document.getElementById('cursoCategoria').value,
        nivel: document.getElementById('cursoNivel').value,
        duracion: document.getElementById('cursoDuracion').value.trim(),
        descripcion: document.getElementById('cursoDescripcion').value.trim(),
        puntos: Number(document.getElementById('cursoPuntos').value) || 0,
        activo: document.getElementById('cursoActivo').value === 'true',
        lecciones,
    };

    const btn = document.getElementById('btnGuardarCurso');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';
    try {
        const res = await apiFetch(id ? `/admin/educacion/cursos/${id}` : '/admin/educacion/cursos', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(body)
        });
        if (res?.ok) {
            mostrarToast(id ? 'Curso actualizado' : 'Curso creado', 'success');
            cerrarModalCurso();
            await initAdminCursos();
        } else {
            const d = await res.json().catch(() => ({}));
            mostrarToast(d.mensaje || Object.values(d || {}).join(' | ') || 'Error al guardar el curso', 'error');
        }
    } catch { mostrarToast('Error de conexión', 'error'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Curso';
    }
}

async function toggleCursoActivo(id, activoActual) {
    const accion = activoActual ? 'desactivar' : 'reactivar';
    if (!confirm(`¿${activoActual ? 'Desactivar' : 'Reactivar'} este curso? ${activoActual ? 'Dejará de verse en el catálogo de los socios, pero no se borra su contenido.' : ''}`)) return;
    try {
        const res = activoActual
            ? await apiFetch(`/admin/educacion/cursos/${id}`, { method: 'DELETE' })
            : await apiFetch(`/admin/educacion/cursos/${id}/reactivar`, { method: 'PATCH' });
        if (res?.ok) {
            mostrarToast(`Curso ${accion === 'desactivar' ? 'desactivado' : 'reactivado'} `, 'success');
            await initAdminCursos();
        } else mostrarToast('No se pudo actualizar el curso', 'error');
    } catch { mostrarToast('Error de conexión', 'error'); }
}