/**
 * =============================================================================
 * RESPALDO Y RECUPERACIÓN — lógica real de la pantalla
 * =============================================================================
 * Reemplaza la versión anterior, que estaba repartida entre panel.js y
 * paginas.js y era enteramente simulada:
 *   - El historial de la tabla eran 4 filas fijas generadas en JS (o, en la
 *     otra versión, un arreglo guardado en localStorage del navegador).
 *   - El botón "Restaurar" solo mostraba un toast diciendo que no estaba
 *     disponible.
 *   - "Almacenamiento usado", "Próximo respaldo" y "Encriptación AES-256: ON"
 *     eran valores fijos en el HTML, no venían de ningún lado.
 *
 * Ahora todo viene de /api/admin/respaldo, que genera y restaura respaldos
 * reales de la base de datos completa (ver BackupService en el backend).
 * =============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.includes('respaldo-recuperacion')) return;
    initRespaldoRecuperacion();
});

function initRespaldoRecuperacion() {
    const puedeCrear = typeof tienePermiso === 'function' ? tienePermiso('respaldo-recuperacion', 'crear') : true;
    const puedeBorrar = typeof tienePermiso === 'function' ? tienePermiso('respaldo-recuperacion', 'borrar') : true;

    const btnIniciar = document.getElementById('btnIniciarBackup');
    if (btnIniciar && !puedeCrear) {
        btnIniciar.disabled = true;
        btnIniciar.title = 'No tienes permiso para ejecutar respaldos';
    }

    cargarResumen();
    cargarHistorial(puedeBorrar);

    btnIniciar?.addEventListener('click', async () => {
        if (!puedeCrear) return;
        btnIniciar.disabled = true;
        const textoOriginal = btnIniciar.innerHTML;
        btnIniciar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando respaldo...';
        try {
            const res = await apiFetch('/admin/respaldo', { method: 'POST' });
            if (res.ok) {
                mostrarToast('Respaldo generado correctamente ✅', 'success');
                cargarResumen();
                cargarHistorial(puedeBorrar);
            } else {
                mostrarToast(await extraerMensajeError(res, 'No se pudo generar el respaldo'), 'error');
            }
        } catch {
            mostrarToast('Error de conexión al generar el respaldo', 'error');
        } finally {
            btnIniciar.disabled = !puedeCrear;
            btnIniciar.innerHTML = textoOriginal;
        }
    });

    document.getElementById('btnRefreshBackups')?.addEventListener('click', () => {
        mostrarToast('Actualizando historial...', 'info');
        cargarResumen();
        cargarHistorial(puedeBorrar);
    });

    document.getElementById('backupHistory')?.addEventListener('click', (e) => {
        const btnRestaurar = e.target.closest('[data-action="restaurar-backup"]');
        const btnDescargar = e.target.closest('[data-action="descargar-backup"]');
        const btnEliminar = e.target.closest('[data-action="eliminar-backup"]');

        if (btnDescargar) {
            const id = btnDescargar.dataset.id;
            descargarArchivo(`/admin/respaldo/${id}/descargar`, `bankomunal-respaldo-${id}.sql`);
        }

        if (btnRestaurar) {
            restaurarBackup(btnRestaurar.dataset.id, puedeBorrar);
        }

        if (btnEliminar) {
            eliminarBackup(btnEliminar.dataset.id, puedeBorrar);
        }
    });
}

async function restaurarBackup(id, puedeBorrar) {
    if (!puedeBorrar) {
        mostrarToast('No tienes permiso para restaurar respaldos', 'error');
        return;
    }
    const advertencia = '⚠️ ESTO REEMPLAZARÁ TODOS LOS DATOS ACTUALES del sistema con el ' +
        `contenido del respaldo #${id}. Antes de continuar se tomará automáticamente un ` +
        'respaldo de seguridad del estado actual, pero esta acción no debe tomarse a la ligera.\n\n' +
        'Para confirmar, escribe exactamente: RESTAURAR';
    const confirmacion = prompt(advertencia);
    if (confirmacion === null) return;
    if (confirmacion.trim() !== 'RESTAURAR') {
        mostrarToast('Restauración cancelada: el texto no coincidió con "RESTAURAR"', 'warning');
        return;
    }

    mostrarToast('Restaurando sistema, esto puede tardar unos segundos...', 'info');
    try {
        const res = await apiFetch(`/admin/respaldo/${id}/restaurar`, {
            method: 'POST',
            body: JSON.stringify({ confirmacion: confirmacion.trim() })
        });
        if (res.ok) {
            mostrarToast('Sistema restaurado correctamente ✅', 'success');
            cargarResumen();
            cargarHistorial(puedeBorrar);
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo restaurar el respaldo'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al restaurar el respaldo', 'error');
    }
}

async function eliminarBackup(id, puedeBorrar) {
    if (!puedeBorrar) {
        mostrarToast('No tienes permiso para eliminar respaldos', 'error');
        return;
    }
    if (!confirm('¿Eliminar este respaldo? Esta acción no se puede deshacer.')) return;
    try {
        const res = await apiFetch(`/admin/respaldo/${id}`, { method: 'DELETE' });
        if (res.ok) {
            mostrarToast('Respaldo eliminado', 'success');
            cargarResumen();
            cargarHistorial(puedeBorrar);
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo eliminar el respaldo'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al eliminar el respaldo', 'error');
    }
}

async function cargarResumen() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    try {
        const res = await apiFetch('/admin/respaldo/resumen');
        if (!res.ok) throw new Error('resumen falló');
        const r = await res.json();

        set('kpiTotalBackups', r.totalBackups);
        set('kpiStorageUsed', r.almacenamientoUsadoLegible);
        set('kpiUltimoBackup', r.ultimoBackupLegible);
        set('kpiEstadoCore', r.baseDatosActiva ? 'OK' : 'ERROR');

        set('usedCapacityPercent', `${r.porcentajeUsado}% del total`);
        set('storageDetails', r.capacidadDetalle);
        const bar = document.getElementById('mainStorageBar');
        if (bar) bar.style.width = Math.min(100, r.porcentajeUsado) + '%';

        const nextInfo = document.getElementById('nextBackupInfo');
        if (nextInfo && r.proximoBackupAutomatico) {
            const fecha = new Date(r.proximoBackupAutomatico);
            nextInfo.innerHTML = '<i class="fa-regular fa-calendar-check" style="color:var(--primary)"></i> ' +
                `<span>${fecha.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>`;
        }

        const encriptacionEl = document.getElementById('valorEncriptacion');
        if (encriptacionEl) encriptacionEl.textContent = r.cifradoActivo ? 'ON' : 'OFF (sin llave configurada)';
        pintarDot('dotEncriptacion', r.cifradoActivo ? 'verde' : 'amarillo');

        const baseDatosEl = document.getElementById('valorBaseDatos');
        if (baseDatosEl) baseDatosEl.textContent = r.baseDatosActiva ? 'Activa' : 'Inactiva';
        pintarDot('dotBaseDatos', r.baseDatosActiva ? 'verde' : 'rojo');

        const integridadEl = document.getElementById('systemStatus');
        if (integridadEl) integridadEl.textContent = r.integridadUltimoRespaldo;
        pintarDot('dotIntegridad', r.integridadUltimoRespaldo.startsWith('Verificado') ? 'verde' : 'amarillo');
    } catch {
        mostrarToast('No se pudo cargar el resumen de respaldos', 'error');
    }
}

function pintarDot(id, color) {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.classList.remove('dot-green', 'dot-yellow', 'dot-red');
    dot.classList.add({ verde: 'dot-green', amarillo: 'dot-yellow', rojo: 'dot-red' }[color] || 'dot-yellow');
}

async function cargarHistorial(puedeBorrar) {
    const tbody = document.getElementById('backupHistory');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-20">
        <i class="fa-solid fa-spinner fa-spin"></i> Consultando registros...</td></tr>`;

    try {
        const res = await apiFetch('/admin/respaldo');
        if (!res.ok) throw new Error('listado falló');
        const backups = await res.json();

        if (!backups.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-20" style="color:var(--text-muted)">
                Aún no hay respaldos. Genera el primero con "Ejecutar Backup Manual".</td></tr>`;
            return;
        }

        const etiquetaMetodo = { MANUAL: 'Manual', AUTOMATICO: 'Automático', PRE_RESTAURACION: 'Pre-restauración' };
        const etiquetaEstado = {
            COMPLETADO: ['st-success', 'Completado'],
            RESTAURADO: ['st-info', 'Restaurado'],
            FALLIDO: ['st-error', 'Fallido'],
            EN_PROGRESO: ['st-neutral', 'En progreso'],
        };

        tbody.innerHTML = backups.map(b => {
            const [clase, texto] = etiquetaEstado[b.estado] || ['st-info', b.estado];
            const fecha = new Date(b.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
            const acciones = [];
            if (b.descargable) {
                acciones.push(`<button class="btn-secondary" style="font-size:.75rem;padding:.3rem .65rem"
                    title="Descargar" data-action="descargar-backup" data-id="${b.id}">
                    <i class="fa-solid fa-download"></i></button>`);
            }
            if (b.restaurable && puedeBorrar) {
                acciones.push(`<button class="btn-secondary" style="font-size:.75rem;padding:.3rem .65rem"
                    title="Restaurar" data-action="restaurar-backup" data-id="${b.id}">
                    <i class="fa-solid fa-rotate-left"></i></button>`);
            }
            if (puedeBorrar) {
                acciones.push(`<button class="btn-secondary" style="font-size:.75rem;padding:.3rem .65rem"
                    title="Eliminar" data-action="eliminar-backup" data-id="${b.id}">
                    <i class="fa-solid fa-trash"></i></button>`);
            }

            return `<tr>
                <td>${fecha}</td>
                <td style="font-family:var(--font-mono,monospace);font-size:.8rem">#${b.id}</td>
                <td>${b.responsable}${b.cifrado ? ' <i class="fa-solid fa-lock" title="Cifrado AES-256" style="color:var(--text-muted)"></i>' : ''}</td>
                <td><span class="status-pill ${b.metodo === 'MANUAL' ? 'st-info' : 'st-success'}">${etiquetaMetodo[b.metodo] || b.metodo}</span></td>
                <td style="color:var(--text-muted);font-size:.82rem">${b.tamanoLegible}</td>
                <td><span class="status-pill ${clase}">${texto}</span></td>
                <td style="text-align:right">${acciones.join(' ')}</td>
            </tr>`;
        }).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-20" style="color:var(--text-muted)">
            No se pudo cargar el historial de respaldos.</td></tr>`;
    }
}
