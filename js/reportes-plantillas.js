/* =============================================================================
   PLANTILLAS DE REPORTE — pages/historial.html
   Guarda combinaciones de filtros (fecha desde/hasta, tipo de movimiento) con
   un nombre para reutilizarlas al exportar, en vez de tener que volver a
   escribirlas cada vez. Consume /api/exportar/plantillas (ReportTemplateService).
   window._plantillaSeleccionada la lee initExportButtons() en core.js para
   pasar ?plantillaId=X a la descarga.
   ============================================================================= */

window._plantillaSeleccionada = null;

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('selectPlantilla');
    if (!select) return; // esta página no tiene el selector de plantillas

    cargarPlantillas();

    select.addEventListener('change', () => {
        const id = select.value;
        window._plantillaSeleccionada = id || null;
        document.getElementById('btnEliminarPlantilla')?.classList.toggle('hidden', !id);
        if (!id) return;

        const opt = select.options[select.selectedIndex];
        if (opt.dataset.desde) document.getElementById('fechaInicio').value = opt.dataset.desde.split('T')[0];
        if (opt.dataset.hasta) document.getElementById('fechaFin').value = opt.dataset.hasta.split('T')[0];
        const filterTipo = document.getElementById('filterTipo');
        if (filterTipo && opt.dataset.tipo) filterTipo.value = opt.dataset.tipo;

        document.getElementById('btnFiltrar')?.click();
    });

    document.getElementById('btnGuardarPlantilla')?.addEventListener('click', guardarPlantillaActual);
    document.getElementById('btnEliminarPlantilla')?.addEventListener('click', eliminarPlantillaSeleccionada);
});

async function cargarPlantillas() {
    const select = document.getElementById('selectPlantilla');
    if (!select) return;
    try {
        const res = await apiFetch('/exportar/plantillas');
        if (!res?.ok) return;
        const plantillas = await res.json();

        const valorActual = select.value;
        select.innerHTML = '<option value="" data-i18n="plantillas.sin_plantilla">— Sin plantilla —</option>' +
            plantillas.map(p => {
                let params = {};
                try { params = JSON.parse(p.parametros || '{}'); } catch { /* plantilla vieja/corrupta, se ignora */ }
                return `<option value="${p.id}" data-desde="${params.desde || ''}" data-hasta="${params.hasta || ''}" data-tipo="${params.tipoMovimiento || ''}">
                    ${escapeHtmlPlantilla(p.nombre)}
                </option>`;
            }).join('');
        select.value = valorActual || '';
    } catch {
        // Sin plantillas guardadas todavía o error de red — no es bloqueante, se sigue exportando sin plantilla.
    }
}

async function guardarPlantillaActual() {
    const nombre = prompt('Nombre para esta plantilla (ej. "Movimientos del mes"):');
    if (!nombre || !nombre.trim()) return;

    const fechaInicio = document.getElementById('fechaInicio')?.value;
    const fechaFin = document.getElementById('fechaFin')?.value;
    const filterTipo = document.getElementById('filterTipo');
    const tipoMovimiento = filterTipo?.value || null;

    try {
        const res = await apiFetch('/exportar/plantillas', {
            method: 'POST',
            body: JSON.stringify({
                nombre: nombre.trim(),
                tipo: 'movimientos',
                desde: fechaInicio ? fechaInicio + 'T00:00:00' : null,
                hasta: fechaFin ? fechaFin + 'T23:59:59' : null,
                tipoMovimiento,
                esPublico: false
            })
        });
        if (res?.ok) {
            mostrarToast('Plantilla guardada', 'success');
            await cargarPlantillas();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo guardar la plantilla'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al guardar la plantilla.', 'error');
    }
}

async function eliminarPlantillaSeleccionada() {
    const select = document.getElementById('selectPlantilla');
    const id = select?.value;
    if (!id) return;
    if (!confirm('¿Eliminar esta plantilla guardada?')) return;

    try {
        const res = await apiFetch(`/exportar/plantillas/${id}`, { method: 'DELETE' });
        if (res?.ok || res?.status === 204) {
            mostrarToast('Plantilla eliminada.', 'success');
            window._plantillaSeleccionada = null;
            document.getElementById('btnEliminarPlantilla')?.classList.add('hidden');
            await cargarPlantillas();
        } else {
            mostrarToast(await extraerMensajeError(res, 'No se pudo eliminar la plantilla'), 'error');
        }
    } catch {
        mostrarToast('Error de conexión al eliminar la plantilla.', 'error');
    }
}

function escapeHtmlPlantilla(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}