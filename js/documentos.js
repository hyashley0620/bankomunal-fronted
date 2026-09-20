/* ============================================================
   GESTIÓN DOCUMENTAL
   ============================================================ */

let docs = [];
let catActual = 'todas';
let archivoSeleccionado = null;

const ICONS = {
    pdf: { clase: 'pdf', icon: 'fa-file-pdf' },
    docx: { clase: 'docx', icon: 'fa-file-word' },
    doc: { clase: 'docx', icon: 'fa-file-word' },
    xlsx: { clase: 'xlsx', icon: 'fa-file-excel' },
    xls: { clase: 'xlsx', icon: 'fa-file-excel' },
    png: { clase: 'img', icon: 'fa-file-image' },
    jpg: { clase: 'img', icon: 'fa-file-image' },
    jpeg: { clase: 'img', icon: 'fa-file-image' },
};

const CAT_LABEL = {
    contrato: 'Contrato', estado_financiero: 'Est. Financiero',
    identidad: 'Identidad', reporte: 'Reporte', acta: 'Acta', otro: 'Otro'
};

function extDe(nombreArchivo) {
    return (nombreArchivo || '').split('.').pop().toLowerCase();
}

/* ── Carga inicial desde backend ─────────────────────────── */
async function cargarDocumentosBackend() {
    const grid = document.getElementById('docsGrid');
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted)"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando documentos...</div>';
    try {
        const res = await apiFetch('/documentos');
        docs = res?.ok ? await res.json() : [];
    } catch {
        docs = [];
    }
    renderDocs();
}

/* ── Render ──────────────────────────────────────────────── */
function renderDocs() {
    const grid = document.getElementById('docsGrid');
    if (!grid) return;
    const q = (document.getElementById('buscarDoc')?.value || '').toLowerCase();
    const sort = document.getElementById('sortOrder')?.value || 'fecha_desc';

    let lista = docs.filter(d => {
        if (catActual !== 'todas' && d.categoria !== catActual) return false;
        const nombre = (d.nombre || '').toLowerCase();
        const archivo = (d.nombreArchivo || '').toLowerCase();
        if (q && !nombre.includes(q) && !archivo.includes(q)) return false;
        return true;
    });

    const fechaMs = d => d.createdAt ? new Date(d.createdAt).getTime() : 0;
    if (sort === 'fecha_asc') lista.sort((a, b) => fechaMs(a) - fechaMs(b));
    else if (sort === 'nombre') lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    else lista.sort((a, b) => fechaMs(b) - fechaMs(a));

    if (!lista.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2.5rem;color:var(--text-muted)">
            <i class="fa-solid fa-folder-open fa-3x" style="opacity:.25"></i>
            <p style="margin-top:.8rem">${catActual === 'todas' ? 'No tienes documentos aún. ¡Sube el primero!' : 'Sin documentos en esta categoría.'}</p>
        </div>`;
        actualizarStats();
        return;
    }

    grid.innerHTML = lista.map(d => {
        const ext = extDe(d.nombreArchivo || d.nombre);
        const ic = ICONS[ext] || { clase: 'other', icon: 'fa-file' };
        const fecha = d.createdAt ? new Date(d.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
        const catLbl = CAT_LABEL[d.categoria] || d.categoria || 'Otro';

        return `<div class="doc-card">
            <div class="doc-icon-row">
                <div class="doc-icon ${ic.clase}"><i class="fa-solid ${ic.icon}"></i></div>
                <div class="doc-name">${d.nombre}</div>
            </div>
            <div class="doc-meta">
                <div><i class="fa-solid fa-tag" style="width:14px"></i> ${catLbl}</div>
                <div><i class="fa-regular fa-calendar" style="width:14px"></i> ${fecha}</div>
                <div><i class="fa-solid fa-weight-hanging" style="width:14px"></i> ${d.tamano || '-'}</div>
                <div><i class="fa-solid fa-code-branch" style="width:14px"></i> Versión ${d.versionActual || 1}</div>
            </div>
            <div class="doc-actions">
                <button class="btn-doc-action" data-action="ver" data-id="${d.id}">
                    <i class="fa-solid fa-eye"></i> Ver
                </button>
                <button class="btn-doc-action" data-action="descargar" data-id="${d.id}">
                    <i class="fa-solid fa-download"></i> Descargar
                </button>
                ${d.categoria === 'identidad' ? `
                <span class="btn-doc-action" style="opacity:.5;cursor:default" title="Documento de identidad — solo un administrador puede eliminarlo">
                    <i class="fa-solid fa-lock"></i>
                </span>` : `
                <button class="btn-doc-action delete" data-action="eliminar" data-id="${d.id}">
                    <i class="fa-solid fa-trash"></i>
                </button>`}
            </div>
        </div>`;
    }).join('');

    actualizarStats();
}

/* ── Upload logica ────────────────────────────────────────── */
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadMeta = document.getElementById('uploadMeta');

uploadZone?.addEventListener('click', () => fileInput.click());
uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone?.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
});

fileInput?.addEventListener('change', () => {
    if (fileInput.files[0]) procesarArchivo(fileInput.files[0]);
});

function procesarArchivo(file) {
    const maxMB = 10;
    if (file.size > maxMB * 1024 * 1024) {
        mostrarToast(`El archivo supera los ${maxMB} MB permitidos.`, 'error'); return;
    }
    archivoSeleccionado = file;
    document.getElementById('docNombre').value = file.name.replace(/\.[^/.]+$/, '');
    if (uploadMeta) uploadMeta.style.display = 'block';
    if (uploadZone) uploadZone.innerHTML = `<i class="fa-solid fa-file-check" style="color:var(--primary)"></i>
        <strong>${file.name}</strong>
        <p>${(file.size / 1024 / 1024).toFixed(2)} MB · Listo para subir</p>`;
}

function resetZonaSubida() {
    if (uploadMeta) uploadMeta.style.display = 'none';
    if (uploadZone) uploadZone.innerHTML = `<i class="fa-solid fa-file-arrow-up"></i>
        <strong>Arrastra tu archivo aquí</strong>
        <p>o haz clic para seleccionar</p>
        <p style="font-size:.78rem">PDF, Word, Excel, imágenes — Máx. 10 MB</p>`;
    archivoSeleccionado = null;
    if (fileInput) fileInput.value = '';
}

document.getElementById('btnSubir')?.addEventListener('click', async () => {
    if (!archivoSeleccionado) { mostrarToast('Selecciona un archivo primero.', 'warning'); return; }
    const nombre = document.getElementById('docNombre').value.trim() || archivoSeleccionado.name;
    const categoria = document.getElementById('docCategoria').value;

    const btn = document.getElementById('btnSubir');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Subiendo...';

    const progEl = document.getElementById('uploadProgress');
    const fillEl = document.getElementById('uploadFill');
    if (progEl) progEl.style.display = 'block';
    let pct = 0;
    const interval = setInterval(() => {
        pct = Math.min(pct + Math.random() * 20, 90);
        if (fillEl) fillEl.style.width = pct + '%';
    }, 150);

    try {
        const fd = new FormData();
        fd.append('file', archivoSeleccionado);
        fd.append('nombre', nombre);
        fd.append('categoria', categoria);

        const res = await fetch(`${API_BASE}/documentos`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}` },
            body: fd
        });

        clearInterval(interval);
        if (fillEl) fillEl.style.width = '100%';

        if (res.ok) {
            mostrarToast(' Documento subido exitosamente.', 'success');
            await cargarDocumentosBackend();
        } else {
            const d = await res.json().catch(() => ({}));
            mostrarToast(d.mensaje || 'Error al subir el documento.', 'error');
        }
    } catch {
        clearInterval(interval);
        mostrarToast('Error de conexión con el servidor.', 'error');
    }

    setTimeout(() => { if (progEl) progEl.style.display = 'none'; if (fillEl) fillEl.style.width = '0%'; }, 500);
    resetZonaSubida();
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Subir';
});

/* ── Detalle / vista previa real ─────────────────────────── */
async function verDetalle(id) {
    const doc = docs.find(d => String(d.id) === String(id));
    if (!doc) return;

    const titEl = document.getElementById('prevTitulo');
    const bodyEl = document.getElementById('prevBody');
    const modal = document.getElementById('previewModal');
    if (!bodyEl || !modal) return;

    if (titEl) titEl.textContent = doc.nombre;
    const ext = extDe(doc.nombreArchivo || doc.nombre);
    const ic = ICONS[ext] || { clase: 'other', icon: 'fa-file' };
    const catLbl = CAT_LABEL[doc.categoria] || doc.categoria || 'Otro';
    const fecha = doc.createdAt ? new Date(doc.createdAt).toLocaleString('es-CO') : '-';
    const versiones = doc.versiones || [];

    bodyEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--bg-main);border-radius:10px;margin-bottom:1rem">
            <div class="doc-icon ${ic.clase}" style="width:52px;height:52px;font-size:1.5rem"><i class="fa-solid ${ic.icon}"></i></div>
            <div>
                <div style="font-weight:700;font-size:.95rem">${doc.nombre}</div>
                <div style="font-size:.8rem;color:var(--text-muted)">${doc.nombreArchivo || ''} · ${doc.tamano || '-'}</div>
            </div>
        </div>
        <div id="prevVisual" style="margin-bottom:1rem;border-radius:10px;overflow:hidden;background:var(--bg-main);min-height:80px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:.82rem">
            <i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Cargando vista previa...
        </div>
        <table style="width:100%;font-size:.84rem;border-collapse:collapse">
            <tr><td style="padding:.4rem 0;color:var(--text-muted);width:120px">Categoría</td><td><strong>${catLbl}</strong></td></tr>
            <tr><td style="padding:.4rem 0;color:var(--text-muted)">Subido el</td><td>${fecha}</td></tr>
            <tr><td style="padding:.4rem 0;color:var(--text-muted)">Versiones</td><td>${versiones.length || 1}</td></tr>
        </table>
        ${versiones.length > 1 ? `
        <div style="margin-top:1.2rem">
            <div style="font-weight:600;font-size:.88rem;margin-bottom:.6rem">Historial de versiones</div>
            <div class="version-list">
                ${versiones.map(v => `
                    <div class="version-item">
                        <i class="fa-solid fa-code-branch" style="color:var(--primary);font-size:.85rem"></i>
                        <span>Versión ${v.version}</span>
                        <span style="color:var(--text-muted);font-size:.78rem;flex:1">${new Date(v.fecha).toLocaleDateString('es-CO')}</span>
                        <span style="font-size:.78rem">${v.tamano}</span>
                        <button class="btn-doc-action" style="padding:.2rem .5rem" data-action="descargar-version" data-id="${doc.id}" data-version="${v.version}" title="Descargar esta versión">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    </div>`).join('')}
            </div>
        </div>` : ''}
        <div style="display:flex;gap:.8rem;margin-top:1.4rem;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn-secondary" data-action="descargar" data-id="${doc.id}">
                <i class="fa-solid fa-download"></i> Descargar
            </button>
            ${doc.categoria === 'identidad' ? `
            <span style="font-size:.78rem;color:var(--text-muted);display:flex;align-items:center;gap:.3rem">
                <i class="fa-solid fa-lock"></i> Documento de identidad — solo un administrador puede modificarlo
            </span>` : `
            <button class="btn-primary" data-action="nueva-version" data-id="${doc.id}">
                <i class="fa-solid fa-code-branch"></i> Nueva versión
            </button>`}
        </div>`;


    modal.classList.add('open');
    modal.style.display = 'flex';
    const contentBox = modal.querySelector('div');
    if (contentBox && (ic.clase === 'img' || ic.clase === 'pdf')) contentBox.style.maxWidth = '680px';

    cargarVistaPrevia(doc.id, ic.clase, doc.nombreArchivo || doc.nombre);
}

/* Trae el archivo autenticado y lo embebe (imagen/PDF) o muestra fallback */
async function cargarVistaPrevia(id, claseIcono, nombreArchivo) {
    const visual = document.getElementById('prevVisual');
    if (!visual) return;
    try {
        const res = await fetch(`${API_BASE}/documentos/${id}/preview`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        if (claseIcono === 'img') {
            visual.innerHTML = `<img src="${url}" alt="${nombreArchivo}" style="max-width:100%;max-height:420px;display:block;margin:0 auto">`;
        } else if (claseIcono === 'pdf') {
            visual.innerHTML = `<iframe src="${url}" style="width:100%;height:420px;border:none"></iframe>`;
        } else {
            visual.innerHTML = `<div style="padding:1.5rem;text-align:center">
                <i class="fa-solid fa-file fa-2x" style="opacity:.3"></i>
                <p style="margin-top:.5rem">Vista previa no disponible para este tipo de archivo.<br>Descárgalo para verlo.</p>
            </div>`;
        }
    } catch {
        visual.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--danger)">
            <i class="fa-solid fa-triangle-exclamation"></i> No se pudo cargar la vista previa.
        </div>`;
    }
}

document.getElementById('closePreview')?.addEventListener('click', cerrarPreview);
document.getElementById('previewModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('previewModal')) cerrarPreview();
});
function cerrarPreview() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.style.display = 'none';
}

/* Delegación de eventos: cubre los botones de acción tanto de las tarjetas
   de documento como del modal de detalle/versiones, sin onclick inline. */
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    switch (btn.dataset.action) {
        case 'ver': verDetalle(id); break;
        case 'descargar': descargarDoc(id); break;
        case 'eliminar': eliminarDoc(id); break;
        case 'nueva-version': subirNuevaVersion(id); break;
        case 'descargar-version': descargarVersion(id, Number(btn.dataset.version)); break;
    }
});

/* ── Nueva versión ───────────────────────────────────────── */
function subirNuevaVersion(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { mostrarToast('El archivo supera los 10 MB permitidos.', 'error'); return; }

        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API_BASE}/documentos/${id}/version`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
                body: fd
            });
            if (res.ok) {
                mostrarToast('Nueva versión subida exitosamente.', 'success');
                cerrarPreview();
                await cargarDocumentosBackend();
            } else {
                const d = await res.json().catch(() => ({}));
                mostrarToast(d.mensaje || 'Error al subir la nueva versión.', 'error');
            }
        } catch { mostrarToast('Error de conexión.', 'error'); }
    };
    input.click();
}

/* ── Descargar ───────────────────────────────────────────── */
async function descargarDoc(id) {
    const doc = docs.find(d => String(d.id) === String(id));
    if (!doc) return;
    mostrarToast(` Descargando "${doc.nombre}"...`, 'info');
    await descargarArchivo(`/documentos/${id}/download`, doc.nombreArchivo || doc.nombre);
}

async function descargarVersion(id, version) {
    const doc = docs.find(d => String(d.id) === String(id));
    await descargarArchivo(`/documentos/${id}/version/${version}/download`, `v${version}_${doc?.nombreArchivo || 'documento'}`);
}

/* ── Eliminar ────────────────────────────────────────────── */
async function eliminarDoc(id) {
    const doc = docs.find(d => String(d.id) === String(id));
    if (!doc) return;
    if (!confirm(`¿Eliminar "${doc.nombre}"? Esta acción no se puede deshacer.`)) return;

    try {
        const res = await apiFetch(`/documentos/${id}`, { method: 'DELETE' });
        if (res?.ok) {
            mostrarToast('Documento eliminado.', 'info');
            docs = docs.filter(d => String(d.id) !== String(id));
            renderDocs();
        } else {
            mostrarToast('No se pudo eliminar el documento.', 'error');
        }
    } catch { mostrarToast('Error de conexión.', 'error'); }
}

/* ── Filtros / búsqueda ──────────────────────────────────── */
document.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        catActual = btn.dataset.cat;
        renderDocs();
    });
});

document.getElementById('buscarDoc')?.addEventListener('input', renderDocs);
document.getElementById('sortOrder')?.addEventListener('change', renderDocs);

/* ── Stats ───────────────────────────────────────────────── */
function actualizarStats() {
    const total = docs.length;
    const pdfs = docs.filter(d => extDe(d.nombreArchivo || d.nombre) === 'pdf').length;
    const mbTot = docs.reduce((acc, d) => {
        const t = (d.tamano || '').toString();
        const m = parseFloat(t);
        if (isNaN(m)) return acc;
        return acc + (t.toUpperCase().includes('KB') ? m / 1024 : m);
    }, 0);
    const cats = new Set(docs.map(d => d.categoria)).size;
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('statTotal', total);
    setEl('statPDF', pdfs);
    setEl('statMB', mbTot.toFixed(1));
    setEl('statCat', cats);
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    cargarDocumentosBackend();
    if (typeof cargarBadgeNotificaciones === 'function') cargarBadgeNotificaciones();
});