/* =============================================================================
   PRÉSTAMOS SOLIDARIOS
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('prestamosSolidariosContainer')) return;

    cargarGruposPS();

    document.getElementById('selectGrupoPS')?.addEventListener('change', cargarPrestamosSolidarios);
    document.getElementById('btnProponer')?.addEventListener('click', () => {
        if (!grupoSeleccionadoPS()) return mostrarToast('Primero selecciona un grupo.', 'error');
        document.getElementById('inputMontoPS').value = '';
        document.getElementById('inputPlazoPS').value = '6';
        document.getElementById('inputMotivoPS').value = '';
        document.getElementById('modalProponer').classList.remove('hidden');
        document.getElementById('modalProponer').classList.add('active');
    });
    document.getElementById('cerrarModalProponer')?.addEventListener('click', () => cerrarModalPS());
    document.getElementById('cancelarProponer')?.addEventListener('click', () => cerrarModalPS());
    document.getElementById('confirmarProponer')?.addEventListener('click', enviarPropuestaPS);
});

function cerrarModalPS() {
    document.getElementById('modalProponer')?.classList.add('hidden');
    document.getElementById('modalProponer')?.classList.remove('active');
}

function grupoSeleccionadoPS() {
    return document.getElementById('selectGrupoPS')?.value || null;
}

async function cargarGruposPS() {
    const sel = document.getElementById('selectGrupoPS');
    if (!sel) return;
    try {
        const res = await apiFetch('/comunidad/grupos');
        if (!res?.ok) return;
        const grupos = await res.json();
        sel.innerHTML = grupos.map(g => `<option value="${g.id}">${escapeHtmlPS(g.nombre)}</option>`).join('');
        if (grupos.length > 0) cargarPrestamosSolidarios();
    } catch { /* silencioso, igual que el resto de dropdowns de grupo */ }
}

async function cargarPrestamosSolidarios() {
    const cont = document.getElementById('prestamosSolidariosContainer');
    const grupoId = grupoSeleccionadoPS();
    if (!grupoId) return;

    cargarFondoPS(grupoId);

    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);padding:2rem;grid-column:1/-1">
        <span data-i18n="common.cargando">Cargando...</span></div>`;

    try {
        const res = await apiFetch(`/comunidad/grupos/${grupoId}/prestamos-solidarios`);
        if (!res?.ok) {
            cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);padding:2rem;grid-column:1/-1">
                <span data-i18n="prestsol.error_cargar">No se pudieron cargar los préstamos solidarios.</span></div>`;
            return;
        }
        renderPrestamosSolidarios(await res.json());
    } catch {
        cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);padding:2rem;grid-column:1/-1">
            <span data-i18n="prestsol.error_cargar">No se pudieron cargar los préstamos solidarios.</span></div>`;
    }
    if (typeof aplicarIdioma === 'function') aplicarIdioma(document);
}

const ESTADOS_PS = {
    pending: { label: 'En votación', bg: 'rgba(234,179,8,.12)', fg: '#ca8a04' },
    approved: { label: 'Aprobado — esperando firma', bg: 'rgba(59,130,246,.12)', fg: '#2563eb' },
    active: { label: 'Activo', bg: 'rgba(34,197,94,.12)', fg: '#16a34a' },
    paid: { label: 'Pagado', bg: 'rgba(34,197,94,.12)', fg: '#16a34a' },
    rejected: { label: 'Rechazado', bg: 'rgba(239,68,68,.12)', fg: '#dc2626' },
    defaulted: { label: 'En mora', bg: 'rgba(239,68,68,.12)', fg: '#dc2626' }
};

function renderPrestamosSolidarios(items) {
    const cont = document.getElementById('prestamosSolidariosContainer');

    if (!items || items.length === 0) {
        cont.innerHTML = `
            <div class="card" style="text-align:center;color:var(--text-muted);padding:2.5rem;grid-column:1/-1">
                <i class="fa-solid fa-people-arrows" style="font-size:2rem;opacity:.4;margin-bottom:.6rem;display:block"></i>
                <p data-i18n="prestsol.sin_prestamos">Este grupo todavía no tiene préstamos solidarios propuestos.</p>
            </div>`;
        return;
    }

    cont.innerHTML = items.map(p => {
        const estado = ESTADOS_PS[p.estado] || { label: p.estado, bg: 'rgba(100,116,139,.12)', fg: '#64748b' };
        const fmt = n => '$ ' + Intl.NumberFormat('es-CO').format(Math.round(Number(n || 0)));

        const votar = p.estado === 'pending'
            ? `<div style="display:flex;gap:.5rem;margin-top:.5rem">
                   <button class="btn-ben-primary btn-votar-si" data-id="${p.id}" style="flex:1">
                       <i class="fa-solid fa-check"></i> A favor
                   </button>
                   <button class="btn-ben-outline btn-votar-no" data-id="${p.id}" style="flex:1">
                       <i class="fa-solid fa-xmark"></i> En contra
                   </button>
               </div>`
            : '';

        return `
            <div class="ben-card">
                <div class="ben-card-top">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                        <div class="ben-ic bi-blue"><i class="fa-solid fa-people-arrows"></i></div>
                        <span style="background:${estado.bg};color:${estado.fg};padding:.25rem .6rem;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase">${estado.label}</span>
                    </div>
                    <h3>${escapeHtmlPS(p.solicitanteNombre || 'Socio')}</h3>
                    <div class="bl" style="margin-top:.3rem">${fmt(p.monto)} · ${p.plazoMeses} meses</div>
                    ${p.motivo ? `<p style="font-size:.82rem;color:var(--text-muted);margin:.5rem 0 0">${escapeHtmlPS(p.motivo)}</p>` : ''}
                </div>
                <div class="ben-card-footer">
                    ${votar}
                </div>
            </div>`;
    }).join('');

    cont.querySelectorAll('.btn-votar-si').forEach(b => b.addEventListener('click', () => votarPS(b.dataset.id, true)));
    cont.querySelectorAll('.btn-votar-no').forEach(b => b.addEventListener('click', () => votarPS(b.dataset.id, false)));
}

async function votarPS(loanId, aprobar) {
    const grupoId = grupoSeleccionadoPS();
    if (!confirm(aprobar ? '¿Confirmas tu voto A FAVOR de este préstamo?' : '¿Confirmas tu voto EN CONTRA de este préstamo?')) return;

    try {
        const res = await apiFetch(`/comunidad/grupos/${grupoId}/prestamos-solidarios/${loanId}/votar`, {
            method: 'POST',
            body: JSON.stringify({ aprobar })
        });
        if (res?.ok) {
            const data = await res.json();
            mostrarToast(data.mensaje || 'Voto registrado.', 'success');
            cargarPrestamosSolidarios();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo registrar el voto'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al votar.', 'error');
    }
}

async function enviarPropuestaPS() {
    const grupoId = grupoSeleccionadoPS();
    const montoSolicitado = parseFloat(document.getElementById('inputMontoPS').value);
    const plazoMeses = parseInt(document.getElementById('inputPlazoPS').value, 10);
    const motivo = document.getElementById('inputMotivoPS').value.trim();

    if (!montoSolicitado || montoSolicitado <= 0) return mostrarToast('El monto debe ser mayor a cero.', 'error');
    if (!plazoMeses || plazoMeses <= 0) return mostrarToast('El plazo debe ser mayor a cero.', 'error');

    try {
        const res = await apiFetch(`/comunidad/grupos/${grupoId}/prestamos-solidarios`, {
            method: 'POST',
            body: JSON.stringify({ montoSolicitado, plazoMeses, motivo })
        });
        if (res?.ok) {
            mostrarToast('Propuesta enviada. Se abrió la votación entre los socios.', 'success');
            cerrarModalPS();
            cargarPrestamosSolidarios();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo enviar la propuesta'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al enviar la propuesta.', 'error');
    }
}

function escapeHtmlPS(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

async function cargarFondoPS(grupoId) {
    const card = document.getElementById('fondoPSCard');
    if (!card) return;
    try {
        const res = await apiFetch(`/comunidad/grupos/${grupoId}/prestamos-solidarios/fondo`);
        if (!res?.ok) { card.style.display = 'none'; return; }
        const data = await res.json();
        const fmt = n => '$ ' + Intl.NumberFormat('es-CO').format(Math.round(Number(n || 0)));
        document.getElementById('fondoPSTotal').textContent = fmt(data.balance);
        document.getElementById('fondoPSComprometido').textContent = fmt(data.comprometido);
        document.getElementById('fondoPSDisponible').textContent = fmt(data.disponible);
        card.style.display = 'block';
    } catch {
        card.style.display = 'none';
    }
}