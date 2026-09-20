/* =============================================================================
   METAS DE AHORRO —  El aporte descuenta de
   verdad de la cuenta del socio y queda registrado como transacción.
   ============================================================================= */

let _metaAportarId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('metasContainer')) return;
    cargarMetas();

    document.getElementById('btnNuevaMeta')?.addEventListener('click', () => {
        document.getElementById('inputNombreMeta').value = '';
        document.getElementById('inputMontoMeta').value = '';
        document.getElementById('inputFechaMeta').value = '';
        document.getElementById('modalNuevaMeta').classList.remove('hidden');
        document.getElementById('modalNuevaMeta').classList.add('active');
    });
    document.getElementById('cerrarModalMeta')?.addEventListener('click', () => cerrarModal('modalNuevaMeta'));
    document.getElementById('cancelarNuevaMeta')?.addEventListener('click', () => cerrarModal('modalNuevaMeta'));
    document.getElementById('confirmarNuevaMeta')?.addEventListener('click', crearMeta);

    document.getElementById('cerrarModalAportar')?.addEventListener('click', () => cerrarModal('modalAportar'));
    document.getElementById('cancelarAporte')?.addEventListener('click', () => cerrarModal('modalAportar'));
    document.getElementById('confirmarAporte')?.addEventListener('click', confirmarAporte);
});

function cerrarModal(id) {
    document.getElementById(id)?.classList.add('hidden');
    document.getElementById(id)?.classList.remove('active');
}

async function cargarMetas() {
    const cont = document.getElementById('metasContainer');
    try {
        const res = await apiFetch('/metas-ahorro');
        if (!res.ok) {
            cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);padding:2rem">
                <span data-i18n="metas.error_cargar">No se pudieron cargar tus metas.</span></div>`;
            return;
        }
        const metas = await res.json();
        renderMetas(metas);
    } catch {
        cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);padding:2rem">
            <span data-i18n="metas.error_cargar">No se pudieron cargar tus metas.</span></div>`;
    }
    if (typeof aplicarIdioma === 'function') aplicarIdioma(document);
}

function renderMetas(metas) {
    const cont = document.getElementById('metasContainer');

    if (!metas || metas.length === 0) {
        cont.innerHTML = `
            <div class="card" style="text-align:center;color:var(--text-muted);padding:2.5rem;grid-column:1/-1">
                <i class="fa-solid fa-piggy-bank" style="font-size:2rem;opacity:.4;margin-bottom:.6rem;display:block"></i>
                <p data-i18n="metas.sin_metas">Todavía no tienes metas de ahorro. ¡Crea la primera!</p>
            </div>`;
        return;
    }

    cont.innerHTML = metas.map(m => {
        const meta = Number(m.montoMeta || 0);
        const actual = Number(m.montoActual || 0);
        const pct = meta > 0 ? Math.min(100, Math.round((actual / meta) * 100)) : 0;
        const fmt = n => '$ ' + Intl.NumberFormat('es-CO').format(Math.round(n));

        const estadoPill = m.status === 'completed'
            ? '<span class="status-pill st-success">Completada</span>'
            : m.status === 'cancelled'
                ? '<span class="status-pill st-error">Cancelada</span>'
                : m.status === 'withdrawn'
                    ? '<span class="status-pill st-neutral">Retirada</span>'
                    : '';

        const fechaLimite = m.fechaLimite
            ? `<div class="bl" style="margin-top:.4rem"><i class="fa-regular fa-calendar"></i> ${m.fechaLimite}</div>`
            : '';

        const acciones = m.status === 'active'
            ? `<button class="btn-ben-primary btn-aportar" data-id="${m.id}" data-nombre="${escapeHtml(m.nombre)}">
                   <i class="fa-solid"></i> Aportar
               </button>
               <button class="btn-ben-outline btn-cancelar-meta" data-id="${m.id}" style="margin-top:.5rem">
                   <i class="fa-solid "></i> Cancelar
               </button>`
            : (m.status === 'completed' || m.status === 'cancelled') && actual > 0
                ? `<button class="btn-ben-primary btn-retirar-meta" data-id="${m.id}" data-nombre="${escapeHtml(m.nombre)}">
                       <i class="fa-solid"></i> Retirar a mi cuenta
                   </button>`
                : '';

        return `
            <div class="ben-card">
                <div class="ben-card-top">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                        <div class="ben-ic bi-blue"><i class="fa-solid fa-piggy-bank"></i></div>
                        ${estadoPill}
                    </div>
                    <h3>${escapeHtml(m.nombre)}</h3>
                    <div class="progress-wrap" style="margin-top:.8rem">
                        <div class="progress-label"><span>${fmt(actual)}</span><span>${fmt(meta)}</span></div>
                        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                    </div>
                    <div class="bl" style="margin-top:.4rem">${pct}% completado</div>
                    ${fechaLimite}
                </div>
                <div class="ben-card-footer" style="display:flex;flex-direction:column;gap:.4rem">
                    ${acciones}
                </div>
            </div>`;
    }).join('');

    cont.querySelectorAll('.btn-aportar').forEach(btn => {
        btn.addEventListener('click', () => {
            _metaAportarId = btn.dataset.id;
            document.getElementById('aportarMetaNombre').textContent = 'Meta: ' + btn.dataset.nombre;
            document.getElementById('inputMontoAporte').value = '';
            document.getElementById('modalAportar').classList.remove('hidden');
            document.getElementById('modalAportar').classList.add('active');
        });
    });
    cont.querySelectorAll('.btn-cancelar-meta').forEach(btn => {
        btn.addEventListener('click', () => cancelarMeta(btn.dataset.id));
    });
    cont.querySelectorAll('.btn-retirar-meta').forEach(btn => {
        btn.addEventListener('click', () => retirarMeta(btn.dataset.id, btn.dataset.nombre));
    });
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

async function crearMeta() {
    const nombre = document.getElementById('inputNombreMeta').value.trim();
    const monto = parseFloat(document.getElementById('inputMontoMeta').value);
    const fechaLimite = document.getElementById('inputFechaMeta').value || null;

    if (!nombre) return mostrarToast('Ponle un nombre a tu meta.', 'error');
    if (!monto || monto <= 0) return mostrarToast('El monto objetivo debe ser mayor a cero.', 'error');

    try {
        const res = await apiFetch('/metas-ahorro', {
            method: 'POST',
            body: JSON.stringify({ nombre, montoMeta: monto, fechaLimite })
        });
        if (res.ok) {
            mostrarToast('¡Meta creada!', 'success');
            cerrarModal('modalNuevaMeta');
            cargarMetas();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo crear la meta'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al crear la meta.', 'error');
    }
}

async function confirmarAporte() {
    const monto = parseFloat(document.getElementById('inputMontoAporte').value);
    if (!monto || monto <= 0) return mostrarToast('El monto a aportar debe ser mayor a cero.', 'error');
    if (!_metaAportarId) return;

    try {
        const res = await apiFetch(`/metas-ahorro/${_metaAportarId}/aportar`, {
            method: 'POST',
            body: JSON.stringify({ monto })
        });
        if (res.ok) {
            mostrarToast('¡Aporte registrado!', 'success');
            cerrarModal('modalAportar');
            cargarMetas();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo registrar el aporte'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al registrar el aporte.', 'error');
    }
}

async function cancelarMeta(id) {
    if (!confirm('¿Cancelar esta meta de ahorro? Podrás retirar a tu cuenta el dinero ya aportado.')) return;
    try {
        const res = await apiFetch(`/metas-ahorro/${id}/cancelar`, { method: 'PATCH' });
        if (res.ok) {
            mostrarToast('Meta cancelada.', 'success');
            cargarMetas();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo cancelar la meta'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al cancelar la meta.', 'error');
    }
}

async function retirarMeta(id, nombre) {
    if (!confirm(`¿Retirar a tu cuenta el dinero ahorrado en "${nombre}"?`)) return;
    try {
        const res = await apiFetch(`/metas-ahorro/${id}/retirar`, { method: 'POST' });
        if (res.ok) {
            mostrarToast('¡Dinero retirado a tu cuenta!', 'success');
            cargarMetas();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo retirar el dinero'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al retirar el dinero.', 'error');
    }
}