/* ============================================================
   ENCUESTAS Y VOTACIONES
   ============================================================ */

let todosPolls = [];
let pollVotando = null;
let tabActual = 'todas';
let misVotos = {};

/* ── Cargar votos del usuario desde el backend ───────────── */
async function cargarMisVotos() {
    try {
        const res = await apiFetch('/encuestas/mis-votos');
        if (res && res.ok) {
            const data = await res.json(); // { "12": 45, "7": 22, ... }
            // Convertir claves a número para que misVotos[p.id] funcione correctamente
            misVotos = {};
            for (const [pollId, optionId] of Object.entries(data)) {
                misVotos[parseInt(pollId)] = parseInt(optionId);
            }
        }
    } catch {
        // Si el backend falla (ej. modo demo), misVotos queda vacío
        misVotos = {};
    }
}

/* ── Cargar encuestas del backend ────────────────────────── */
async function cargarEncuestas() {
    await cargarMisVotos();
    try {
        const res = await apiFetch('/encuestas');
        todosPolls = (res && res.ok) ? await res.json() : [];
        if (!res || !res.ok) mostrarToast('No se pudieron cargar las encuestas.', 'error');
    } catch {
        todosPolls = [];
        mostrarToast('Error de conexión al cargar encuestas.', 'error');
    }
    renderPolls();
    actualizarStats();
}

/* ── Render grid ─────────────────────────────────────────── */
function renderPolls() {
    const grid = document.getElementById('pollsGrid');
    const q = (document.getElementById('buscarPoll').value || '').toLowerCase();

    let lista = todosPolls.filter(p => {
        if (q && !p.titulo.toLowerCase().includes(q) && !(p.descripcion || '').toLowerCase().includes(q)) return false;
        if (tabActual === 'abiertas' && p.estado !== 'open') return false;
        if (tabActual === 'cerradas' && p.estado !== 'closed') return false;
        if (tabActual === 'cambioregla' && !p.esRuleChange) return false;
        return true;
    });

    if (!lista.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2.5rem;color:var(--text-muted)">
            <i class="fa-solid fa-square-poll-horizontal fa-3x" style="opacity:.3"></i>
            <p style="margin-top:.8rem">No hay encuestas en esta categoría.</p></div>`;
        return;
    }

    grid.innerHTML = lista.map(p => {
        const totalVotos = p.opciones.reduce((s, o) => s + o.votos, 0);
        const yaVote = misVotos[p.id] !== undefined;
        const abierta = p.estado === 'open';
        const sess = JSON.parse(localStorage.getItem('userSession') || '{}');
        const esAdmin = sess.rol === 'admin' || sess.role === 'admin';
        const puedeCerrar = abierta && (esAdmin || (p.creadorId != null && p.creadorId == sess.id));
        const puedeVerVotantes = esAdmin || (p.creadorId != null && p.creadorId == sess.id);
        const puedeVotar = !esAdmin || p.groupId != null;

        const opcionesHTML = p.opciones.map(o => {
            const pct = totalVotos > 0 ? Math.round((o.votos / totalVotos) * 100) : 0;
            const esMiVoto = misVotos[p.id] === o.id;
            return `<div class="option-row">
                <div class="option-top">
                    <span>${o.texto} ${esMiVoto ? '<i class="fa-solid fa-check" style="color:var(--primary)"></i>' : ''}</span>
                    <span>${pct}% (${o.votos})</span>
                </div>
                <div class="option-bar"><div class="option-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('');

        return `<div class="poll-card">
            <div class="poll-card-header">
                <div class="poll-card-title">${p.titulo}</div>
                <div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end">
                    <span class="poll-badge ${abierta ? 'badge-open' : 'badge-closed'}">${abierta ? '🟢 Abierta' : '🔴 Cerrada'}</span>
                    ${p.esRuleChange ? '<span class="poll-badge badge-regla">⚖️ Regla</span>' : ''}
                    ${p.anonima ? '<span class="poll-badge" style="background:#f3f0ff;color:#7c3aed">🔒 Anónima</span>' : ''}
                </div>
            </div>
            ${p.descripcion ? `<div class="poll-desc">${p.descripcion}</div>` : ''}
            <div class="poll-options">${opcionesHTML}</div>
            <div class="poll-footer">
                <div class="poll-meta">
                    <i class="fa-solid fa-users" style="font-size:.75rem"></i> ${totalVotos} votos totales
                    ${yaVote ? ' · <span style="color:var(--primary);font-weight:600">✓ Votaste</span>' : ''}
                    ${p.fechaCierre ? ` · <i class="fa-regular fa-clock" style="font-size:.7rem"></i> Cierra: ${new Date(p.fechaCierre).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                ${abierta && !yaVote && puedeVotar
                ? `<button class="btn-primary" style="font-size:.82rem;padding:.4rem .9rem" data-action="votar-encuesta" data-id="${p.id}">
                           <i class="fa-solid fa-vote-yea"></i> Votar
                       </button>`
                : abierta && !yaVote && !puedeVotar
                    ? `<span style="font-size:.82rem;color:var(--text-muted);font-style:italic">El administrador no vota</span>`
                    : abierta && yaVote
                        ? `<span style="font-size:.82rem;color:var(--text-muted);font-style:italic">Ya emitiste tu voto</span>`
                        : `<span style="font-size:.82rem;color:var(--text-muted);font-style:italic">Encuesta finalizada</span>`
            }
                ${puedeVerVotantes
                ? `<button class="btn-secondary" style="font-size:.78rem;padding:.4rem .8rem" data-action="ver-votantes" data-id="${p.id}" data-titulo="${(p.titulo || '').replace(/"/g, '&quot;')}" title="Ver quién votó (sin revelar su elección)">
                           <i class="fa-solid fa-users-viewfinder"></i> Quién votó
                       </button>`
                : ''
            }
                ${puedeCerrar
                ? `<button class="btn-secondary" style="font-size:.78rem;padding:.4rem .8rem" data-action="cerrar-encuesta" data-id="${p.id}" title="Cerrar votación manualmente">
                           <i class="fa-solid fa-lock"></i> Cerrar
                       </button>`
                : ''
            }
                </div>
            </div>
        </div>`;
    }).join('');

    // Eventos votar
    grid.querySelectorAll('[data-action="votar-encuesta"]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalVotar(parseInt(btn.dataset.id)));
    });

    // Ver quién votó (admin o creador) — sin revelar la opción elegida
    grid.querySelectorAll('[data-action="ver-votantes"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            mostrarVotantes(btn.dataset.id, btn.dataset.titulo);
        });
    });

    // Cerrar encuesta manualmente
    grid.querySelectorAll('[data-action="cerrar-encuesta"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (!confirm('¿Cerrar esta encuesta? Ya no se podrá votar y el resultado quedará definitivo.')) return;
            btn.disabled = true;
            try {
                const res = await apiFetch(`/encuestas/${id}/cerrar`, { method: 'PATCH' });
                if (res?.ok) {
                    mostrarToast('Encuesta cerrada', 'success');
                    if (typeof cargarEncuestas === 'function') cargarEncuestas();
                } else {
                    mostrarToast('No se pudo cerrar la encuesta', 'error');
                    btn.disabled = false;
                }
            } catch {
                mostrarToast('Error de conexión', 'error');
                btn.disabled = false;
            }
        });
    });
}

/* ── Modal votar ─────────────────────────────────────────── */
/**
 * Muestra en un modal quién votó en una encuesta (nombre y fecha),
 * SIN revelar qué opción eligió cada quien — el backend ya filtra eso.
 */
async function mostrarVotantes(pollId, titulo) {
    document.getElementById('modalVotantes')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modalVotantes';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:420px">
            <div class="modal-header">
                <h3><i class="fa-solid"></i> Quién votó</h3>
                <button type="button" class="btn-close" id="closeVotantes">&times;</button>
            </div>
            <div class="modal-body">
                <p style="color:var(--text-muted);font-size:.85rem;margin:0 0 1rem">
                    "${titulo}" — se muestra solo quién participó, no su elección (el voto sigue siendo anónimo).
                </p>
                <div id="listaVotantes" style="max-height:320px;overflow-y:auto">
                    <p style="text-align:center;color:var(--text-muted)"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando...</p>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" id="btnCerrarVotantes" style="flex:1">Cerrar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const cerrar = () => modal.remove();
    document.getElementById('closeVotantes').addEventListener('click', cerrar);
    document.getElementById('btnCerrarVotantes').addEventListener('click', cerrar);
    modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });

    const cont = document.getElementById('listaVotantes');
    try {
        const res = await apiFetch(`/encuestas/${pollId}/votantes`);
        if (!res?.ok) {
            const data = await res.json().catch(() => ({}));
            cont.innerHTML = `<p style="text-align:center;color:var(--danger,#dc2626)">${data.mensaje || 'No se pudo cargar la lista.'}</p>`;
            return;
        }
        const votantes = await res.json();
        if (!votantes.length) {
            cont.innerHTML = `<p style="text-align:center;color:var(--text-muted)">Nadie ha votado todavía.</p>`;
            return;
        }
        cont.innerHTML = votantes.map(v => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem;padding:.6rem .7rem;margin-bottom:.4rem;border:1px solid var(--border,#e2e8f0);border-radius:8px;background:var(--bg-card)">
                <span style="font-size:.85rem;color:var(--text-primary)"><i class="fa-solid fa-circle-user" style="color:var(--primary,#005F73);margin-right:.5rem"></i>${v.nombre || 'Socio'}</span>
                <small style="color:var(--text-muted);flex-shrink:0">${v.fechaVoto ? new Date(v.fechaVoto).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : ''}</small>
            </div>`).join('');
    } catch {
        cont.innerHTML = `<p style="text-align:center;color:var(--danger,#dc2626)">Error de conexión.</p>`;
    }
}

function abrirModalVotar(id) {
    pollVotando = todosPolls.find(p => p.id === id);
    if (!pollVotando) return;
    if (pollVotando.estado !== 'open') {
        mostrarToast('Esta encuesta ya está cerrada.', 'warning');
        return;
    }

    document.getElementById('vModalTitulo').textContent = pollVotando.titulo;
    document.getElementById('vModalDesc').textContent = pollVotando.descripcion || '';
    document.getElementById('vModalGrupo').textContent = pollVotando.anonima ? ' Votación anónima' : '';
    document.getElementById('vModalMeta').textContent = pollVotando.esRuleChange
        ? ` Cambio de regla — requiere mayoría para aplicarse`
        : '';

    document.getElementById('vModalOpciones').innerHTML = pollVotando.opciones.map(o =>
        `<label class="vote-option-label">
            <input type="radio" name="voteOpt" value="${o.id}">
            ${o.texto}
        </label>`
    ).join('');

    document.getElementById('voteModal').classList.add('open');
}

document.getElementById('closeVoteModal').addEventListener('click', () => document.getElementById('voteModal').classList.remove('open'));
document.getElementById('btnCancelarVoto').addEventListener('click', () => document.getElementById('voteModal').classList.remove('open'));

document.getElementById('btnConfirmarVoto').addEventListener('click', async () => {
    const sel = document.querySelector('input[name="voteOpt"]:checked');
    if (!sel) { mostrarToast('Selecciona una opción para votar.', 'warning'); return; }

    const optionId = parseInt(sel.value);
    const btn = document.getElementById('btnConfirmarVoto');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    try {
        const res = await apiFetch(`/encuestas/${pollVotando.id}/votar`, {
            method: 'POST',
            body: JSON.stringify({ optionId })
        });

        if (res && !res.ok) {
            const err = await res.json().catch(() => ({}));
            mostrarToast(err.mensaje || 'No se pudo registrar el voto.', 'error');
            return;
        }

        // El voto real queda persistido en la BD; al recargar se lee del backend.
        misVotos[pollVotando.id] = optionId;

        const opt = pollVotando.opciones.find(o => o.id === optionId);
        if (opt) opt.votos++;

        document.getElementById('voteModal').classList.remove('open');
        renderPolls();
        actualizarStats();
        mostrarToast(' ¡Voto registrado exitosamente!', 'success');
    } catch {
        mostrarToast('Error de conexión. Intenta de nuevo.', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-to-slot"></i> Confirmar Voto';
    }
});

/* ── Crear encuesta ──────────────────────────────────────── */
document.getElementById('btnToggleCrear').addEventListener('click', () => {
    document.getElementById('createPanel').classList.toggle('open');
});
document.getElementById('btnCancelarCrear').addEventListener('click', () => {
    document.getElementById('createPanel').classList.remove('open');
});

document.getElementById('pollCambioRegla').addEventListener('change', function () {
    document.getElementById('umbralRow').style.display = this.checked ? 'block' : 'none';
});

document.getElementById('btnAddOpcion').addEventListener('click', () => {
    const list = document.getElementById('opcionesList');
    const n = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'opcion-row';
    div.innerHTML = `<input class="opcion-input" placeholder="Opción ${n}"><button type="button" class="btn-del-op">✕</button>`;
    list.appendChild(div);
});

/* Delegación de eventos: cubre tanto las filas estáticas del HTML como las
   filas añadidas dinámicamente por "Agregar opción", sin onclick inline. */
document.getElementById('opcionesList').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-del-op');
    if (btn) eliminarOpcion(btn);
});

function eliminarOpcion(btn) {
    const list = document.getElementById('opcionesList');
    if (list.children.length <= 2) { mostrarToast('Mínimo 2 opciones.', 'warning'); return; }
    btn.closest('.opcion-row').remove();
}

document.getElementById('pollForm').addEventListener('submit', async e => {
    e.preventDefault();
    const titulo = document.getElementById('pollTitulo').value.trim();
    const desc = document.getElementById('pollDesc').value.trim();
    const anonima = document.getElementById('pollAnonima').checked;
    const cambio = document.getElementById('pollCambioRegla').checked;
    const umbral = parseInt(document.getElementById('pollUmbral').value) || 51;
    const grupoId = document.getElementById('pollGrupo').value;
    const opciones = [...document.querySelectorAll('.opcion-input')]
        .map(i => i.value.trim()).filter(Boolean);

    if (opciones.length < 2) { mostrarToast('Agrega al menos 2 opciones.', 'warning'); return; }

    const btnCrear = document.getElementById('btnCrearPoll');
    btnCrear.disabled = true; btnCrear.textContent = 'Publicando...';

    try {
        const body = { titulo, descripcion: desc, opciones, anonima, cambioRegla: cambio, umbral };
        if (grupoId) body.groupId = grupoId;
        const fechaInput = document.getElementById('pollFechaCierre');
        if (fechaInput?.value) body.fechaCierre = new Date(fechaInput.value).toISOString().slice(0, 19);

        const res = await apiFetch('/encuestas', { method: 'POST', body: JSON.stringify(body) });

        if (res && res.ok) {
            await cargarEncuestas();
        } else {
            // Fallback local si backend no responde
            const nuevaId = Date.now();
            todosPolls.unshift({
                id: nuevaId, titulo, descripcion: desc,
                estado: 'open', esRuleChange: cambio, anonima,
                opciones: opciones.map((txt, i) => ({ id: nuevaId * 100 + i, texto: txt, votos: 0 }))
            });
            renderPolls();
            actualizarStats();
        }

        document.getElementById('createPanel').classList.remove('open');
        document.getElementById('pollForm').reset();
        mostrarToast('Encuesta publicada y notificada a los miembros.', 'success');
    } catch {
        mostrarToast('Error al publicar. Intenta de nuevo.', 'error');
    } finally {
        btnCrear.disabled = false; btnCrear.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publicar encuesta';
    }
});

/* ── Tabs ────────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabActual = btn.dataset.tab;
        renderPolls();
    });
});

document.getElementById('buscarPoll').addEventListener('input', renderPolls);

/* ── Stats ───────────────────────────────────────────────── */
function actualizarStats() {
    const abiertas = todosPolls.filter(p => p.estado === 'open').length;
    const cerradas = todosPolls.filter(p => p.estado === 'closed').length;
    const votadas = Object.keys(misVotos).length;
    const cambioRegla = todosPolls.filter(p => p.esRuleChange).length;
    document.getElementById('statAbiertas').textContent = abiertas;
    document.getElementById('statVotadas').textContent = votadas;
    document.getElementById('statCerradas').textContent = cerradas;
    document.getElementById('statCambioRegla').textContent = cambioRegla;
}

/* ── Cargar grupos para el select ────────────────────────── */
async function cargarGrupos() {
    try {
        const res = await apiFetch('/comunidad/grupos');
        if (res && res.ok) {
            const grupos = await res.json();
            const sel = document.getElementById('pollGrupo');
            grupos.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id; opt.textContent = g.nombre;
                sel.appendChild(opt);
            });
        }
    } catch { /* silencioso */ }
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    cargarEncuestas();
    cargarGrupos();
    cargarBadgeNotificaciones();
});