/* ============================================================
   EDUCACIÓN FINANCIERA
   ============================================================ */

let CURSOS = [];

/** Trae el catálogo de cursos activos desde el backend. */
async function cargarCatalogoCursos() {
    try {
        const res = await apiFetch('/educacion/catalogo');
        if (!res?.ok) { CURSOS = []; return; }
        const data = await res.json();
        // Los ids se normalizan a string: el progreso/certificados del socio
        // siempre ha manejado cursoId como string, y los dataset.id del DOM
        // también son strings — evita bugs de comparación "1" !== 1.
        CURSOS = data.map(c => ({
            ...c,
            id: String(c.id),
            cat: c.categoria,
            desc: c.descripcion,
        }));
    } catch {
        CURSOS = [];
        mostrarToast?.('No se pudo cargar el catálogo de cursos.', 'error');
    }
}

/* ── Estado local ─────────────────────────────────────────── */
let progreso = JSON.parse(localStorage.getItem('bkm_edu_progreso') || '{}');
// progreso[cursoId] = { leccionActual: 0, completado: false, cert: false }

let cursoActual = null, leccionActual = 0, catActual = 'todos';

/* ── Guardar progreso ─────────────────────────────────────── */
function guardarProgreso() {
    localStorage.setItem('bkm_edu_progreso', JSON.stringify(progreso));
}

/* ── Renderizar tarjetas ─────────────────────────────────── */
function renderCursos(cat = 'todos') {
    const grid = document.getElementById('cursosGrid');
    const q = (document.getElementById('buscarCurso')?.value || '').toLowerCase();
    const lista = CURSOS.filter(c =>
        (cat === 'todos' || c.cat === cat) &&
        (c.titulo.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
    );

    if (!lista.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted)"><i class="fa-solid fa-search fa-2x"></i><p style="margin-top:.6rem">Sin resultados para "${q}"</p></div>`;
        return;
    }

    grid.innerHTML = lista.map(c => {
        const p = progreso[c.id] || {};
        const pc = p.completado ? 100 : Math.round(((p.leccionActual || 0) / c.lecciones.length) * 100);
        let btnClass = 'btn-iniciar', btnTxt = 'Iniciar curso', btnIcon = 'fa-play';
        if (p.completado) { btnClass = 'btn-completado'; btnTxt = 'Completado'; btnIcon = 'fa-check'; }
        else if (pc > 0) { btnClass = 'btn-continuar'; btnTxt = 'Continuar'; btnIcon = 'fa-forward'; }

        return `<div class="course-card">
            <div class="course-banner" style="background:${c.color}">${c.emoji}</div>
            <div class="course-body">
                <div class="course-meta">
                    <span class="badge-pill badge-nivel">${c.nivel}</span>
                    <span class="badge-pill badge-dur"><i class="fa-regular fa-clock"></i> ${c.duracion}</span>
                    <span class="badge-pill badge-dur"><i class="fa-solid fa-star" style="color:#f39c12"></i> ${c.puntos} pts</span>
                </div>
                <div class="course-title">${c.titulo}</div>
                <div class="course-desc">${c.desc}</div>
                <div class="progress-wrap">
                    <div class="progress-label"><span>Progreso</span><span>${pc}%</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${pc}%"></div></div>
                </div>
                <button class="btn-curso ${btnClass}" data-id="${c.id}" ${p.completado ? 'disabled' : ''}>
                    <i class="fa-solid ${btnIcon}"></i> ${btnTxt}
                </button>
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => abrirCurso(btn.dataset.id));
    });
}

/* ── Abrir curso / lección ───────────────────────────────── */
function abrirCurso(id) {
    cursoActual = CURSOS.find(c => c.id === id);
    if (!cursoActual) return;
    if (!progreso[id]) progreso[id] = { leccionActual: 0, completado: false, cert: false };
    leccionActual = progreso[id].leccionActual || 0;
    renderLeccion();
    document.getElementById('lessonModal').classList.add('open');
}

function renderLeccion() {
    const lec = cursoActual.lecciones[leccionActual];
    document.getElementById('lessonCursoNombre').textContent = cursoActual.titulo + ` — Lección ${leccionActual + 1}/${cursoActual.lecciones.length}`;
    document.getElementById('lessonTitulo').textContent = lec.titulo;
    document.getElementById('lessonContenido').innerHTML = lec.contenido.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    const quizEl = document.getElementById('quizBlock');
    const certEl = document.getElementById('certModal');
    document.getElementById('quizResultado').textContent = '';

    if (lec.esFinal) {
        quizEl.style.display = 'none';
        certEl.classList.remove('hidden');
        document.getElementById('certCursoNombre').textContent = cursoActual.titulo;
        document.getElementById('btnSiguienteLeccion').innerHTML = '<i class="fa-solid fa-check"></i> Finalizar';
    } else {
        certEl.classList.add('hidden');
        if (lec.quiz) {
            quizEl.style.display = 'block';
            document.getElementById('quizPregunta').textContent = lec.quiz.pregunta;
            document.getElementById('quizOpciones').innerHTML = lec.quiz.opciones.map((op, i) =>
                `<label class="quiz-opt"><input type="radio" name="quiz" value="${i}"> <span>${op}</span></label>`
            ).join('');
        } else {
            quizEl.style.display = 'none';
        }
        document.getElementById('btnSiguienteLeccion').innerHTML = 'Siguiente <i class="fa-solid fa-arrow-right"></i>';
    }

    document.getElementById('btnAnteriorLeccion').disabled = leccionActual === 0;
}

/* ── Navegar lecciones ───────────────────────────────────── */
document.getElementById('btnSiguienteLeccion').addEventListener('click', () => {
    const lec = cursoActual.lecciones[leccionActual];

    // Validar quiz si existe
    if (lec.quiz && !lec.esFinal) {
        const sel = document.querySelector('input[name="quiz"]:checked');
        if (!sel) { mostrarToast('Selecciona una respuesta antes de continuar.', 'warning'); return; }
        const correcto = parseInt(sel.value) === lec.quiz.correcta;
        const res = document.getElementById('quizResultado');
        res.className = 'quiz-result ' + (correcto ? 'correct' : 'wrong');
        res.textContent = correcto ? '¡Correcto!' : 'Incorrecto. Revisa el contenido e intenta de nuevo.';
        if (!correcto) return;
    }

    if (lec.esFinal) {
        // Completar curso
        progreso[cursoActual.id].completado = true;
        progreso[cursoActual.id].cert = true;
        guardarProgreso();
        document.getElementById('lessonModal').classList.remove('open');
        renderCursos(catActual);
        actualizarStats();
        renderCerts();
        mostrarToast(' ¡Curso completado! Certificado disponible.', 'success');
        syncProgresoBackend(cursoActual.id, true, cursoActual.titulo, cursoActual.puntos);
        return;
    }

    leccionActual++;
    progreso[cursoActual.id].leccionActual = leccionActual;
    guardarProgreso();
    syncProgresoBackend(cursoActual.id, false, cursoActual.titulo, cursoActual.puntos);
    renderLeccion();
});

document.getElementById('btnAnteriorLeccion').addEventListener('click', () => {
    if (leccionActual > 0) { leccionActual--; renderLeccion(); }
});

document.getElementById('closeLessonModal').addEventListener('click', () => {
    document.getElementById('lessonModal').classList.remove('open');
    document.getElementById('certModal')?.classList.add('hidden');
    renderCursos(catActual);
});
document.getElementById('closeCertModal')?.addEventListener('click', () => {
    document.getElementById('certModal').classList.add('hidden');
});

/* ── Generar PDF de certificado en el cliente con jsPDF ── */

document.getElementById('certList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'descargar-cert-local') {
        descargarCertificadoPorId(Number(btn.dataset.id), btn.dataset.titulo);
    } else if (btn.dataset.action === 'generar-cert-pdf') {
        generarCertificadoPDF(btn.dataset.nombre, btn.dataset.codigo);
    }
});

async function generarCertificadoPDF(cursoNombre, codigoCert) {
    /* Cargar jsPDF dinámicamente si no está disponible */
    if (typeof window.jspdf === 'undefined') {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    const { jsPDF } = window.jspdf;
    const session = typeof getSession === 'function' ? getSession() : {};
    const nombre = session.nombre || 'Participante';
    const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const codigo = codigoCert || ('BKM-EDU-' + Date.now());

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    /* Fondo degradado simulado con rectángulos */
    doc.setFillColor(0, 95, 115);   /* azul oscuro */
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(14, 134, 159);
    doc.rect(8, 8, W - 16, H - 16, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(14, 14, W - 28, H - 28, 'F');

    /* Línea decorativa */
    doc.setDrawColor(0, 95, 115);
    doc.setLineWidth(1.2);
    doc.rect(18, 18, W - 36, H - 36);

    /* Logo / título institucional */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(0, 95, 115);
    doc.text('BANKOMUNAL', W / 2, 38, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Microfinanzas Comunitarias', W / 2, 46, { align: 'center' });

    /* Separador */
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(40, 52, W - 40, 52);

    /* Cuerpo del certificado */
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.text('Certifica que', W / 2, 66, { align: 'center' });

    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 95, 115);
    doc.text(nombre, W / 2, 80, { align: 'center' });

    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('ha completado satisfactoriamente el curso de Educación Financiera:', W / 2, 91, { align: 'center' });

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 95, 115);
    doc.text(cursoNombre, W / 2, 104, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Fecha de emisión: ${fecha}`, W / 2, 116, { align: 'center' });
    doc.text(`Código de verificación: ${codigo}`, W / 2, 124, { align: 'center' });

    /* Pie */
    doc.setDrawColor(200, 200, 200);
    doc.line(40, 132, W - 40, 132);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Este certificado acredita la participación y aprobación del curso indicado.', W / 2, 140, { align: 'center' });
    doc.text('Bankomunal — Plataforma de Microfinanzas Comunitarias © 2026', W / 2, 147, { align: 'center' });

    /* Descargar */
    const nombreArchivo = `certificado-${cursoNombre.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    doc.save(nombreArchivo);
}

/* ── Descargar certificado ── */
document.getElementById('btnDescargarCert').addEventListener('click', async () => {
    if (!cursoActual) return;
    mostrarToast('Generando certificado...', 'info');
    try {
        /* 1. Asegurar que el certificado exista en el backend */
        let codigoCert = progreso[cursoActual.id]?.codigoCert;
        if (!codigoCert) {
            const res = await apiFetch(`/educacion/cursos/${cursoActual.id}/certificado`, {
                method: 'POST',
                body: JSON.stringify({ cursoNombre: cursoActual.titulo, puntos: cursoActual.puntos })
            });
            if (res?.ok) {
                const data = await res.json();
                codigoCert = data.codigoCertificado;
                if (!progreso[cursoActual.id]) progreso[cursoActual.id] = {};
                progreso[cursoActual.id].codigoCert = codigoCert;
                guardarProgreso();
            }
        }

        /* 2. Intentar descarga desde el backend */
        const resPdf = await apiFetch(`/educacion/certificados/${cursoActual.id}/pdf`);
        if (resPdf?.ok) {
            const blob = await resPdf.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `certificado-${cursoActual.titulo.replace(/[^a-zA-Z0-9]/g, '-')}.html`;
            a.click();
            URL.revokeObjectURL(url);
            mostrarToast(' Certificado descargado — ábrelo en el navegador y usa Ctrl+P para guardar como PDF.', 'success');
        } else {
            /* Fallback: generar en cliente con jsPDF si el backend devuelve 404 (curso no completado en BD) */
            await generarCertificadoPDF(cursoActual.titulo, codigoCert);
            mostrarToast(' Certificado PDF generado localmente.', 'success');
        }
    } catch (err) {
        console.error('Error al generar certificado:', err);
        mostrarToast('No se pudo generar el certificado. Intenta de nuevo.', 'error');
    }
    document.getElementById('certModal')?.classList.add('hidden');
    document.getElementById('lessonModal')?.classList.remove('open');
    renderCursos(catActual);
    renderCerts();
});

/* ── Descargar certificado desde lista de "Mis certificados" ── */
async function descargarCertBackend(cursoId, cursoTitulo) {
    mostrarToast(' Descargando certificado oficial...', 'info');
    try {
        const res = await apiFetch(`/educacion/certificados/${cursoId}/pdf`);
        if (res?.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `certificado-${cursoTitulo.replace(/[^a-zA-Z0-9]/g, '-')}.html`;
            a.click();
            URL.revokeObjectURL(url);
            mostrarToast(' Abre el archivo en el navegador y usa Ctrl+P → Guardar como PDF.', 'success');
        } else {
            /* Fallback local */
            const codigoCert = progreso[cursoId]?.codigoCert;
            await generarCertificadoPDF(cursoTitulo, codigoCert);
            mostrarToast(' Certificado generado localmente.', 'success');
        }
    } catch {
        mostrarToast('No se pudo descargar el certificado.', 'error');
    }
}

/* ── Filtros ─────────────────────────────────────────────── */
document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        catActual = btn.dataset.cat;
        renderCursos(catActual);
    });
});

document.getElementById('buscarCurso')?.addEventListener('input', () => renderCursos(catActual));

/* ── Stats ───────────────────────────────────────────────── */
function actualizarStats() {
    const completados = Object.values(progreso).filter(p => p.completado).length;
    const enCurso = Object.values(progreso).filter(p => !p.completado && p.leccionActual > 0).length;
    const certs = Object.values(progreso).filter(p => p.cert).length;
    const puntos = CURSOS.filter(c => progreso[c.id]?.completado).reduce((acc, c) => acc + c.puntos, 0);
    document.getElementById('statCompletados').textContent = completados;
    document.getElementById('statEnCurso').textContent = enCurso;
    document.getElementById('statCerts').textContent = certs;
    document.getElementById('statPuntos').textContent = puntos;
}

/* ── Certificados ────────────────────────────────────────── */
function renderCerts() {
    const list = document.getElementById('certList');
    const completados = CURSOS.filter(c => progreso[c.id]?.cert);
    if (!completados.length) {
        list.innerHTML = `<p style="color:var(--text-muted);font-size:.88rem;padding:.5rem 0">Completa un curso para obtener tu primer certificado.</p>`;
        return;
    }
    list.innerHTML = completados.map(c =>
        `<div style="display:flex;align-items:center;gap:1rem;padding:.8rem;border:1px solid var(--border);border-radius:10px;margin-bottom:.7rem;background:var(--bg-main)">
            <span style="font-size:2rem">${c.emoji}</span>
            <div style="flex:1">
                <div style="font-weight:600;font-size:.92rem">${c.titulo}</div>
                <div style="font-size:.78rem;color:var(--text-muted)">${c.puntos} puntos · Completado${progreso[c.id]?.codigoCert ? ' · ' + progreso[c.id].codigoCert : ''}</div>
            </div>
            <button class="btn-secondary" style="font-size:.78rem;padding:.35rem .7rem" data-action="descargar-cert-local" data-id="${c.id}" data-titulo="${c.titulo}" title="Descargar certificado oficial">
                <i class="fa-solid fa-download"></i> Descargar
            </button>
        </div>`
    ).join('');
}

/* Descarga el certificado de un curso (backend-first, fallback local) */
async function descargarCertificadoPorId(cursoId, cursoTitulo) {
    await descargarCertBackend(cursoId, cursoTitulo);
}

/* ── Backend sync ────────────────────────────────────────── */

/**
 * Sincroniza el avance del curso con el backend (POST /api/educacion/cursos/:id/avanzar)
 * y cuando se completa emite el certificado (POST /api/educacion/cursos/:id/certificado)
 */
async function syncProgresoBackend(cursoId, completado, cursoNombre, puntos) {
    try {
        await apiFetch(`/educacion/cursos/${cursoId}/avanzar`, {
            method: 'POST',
            body: JSON.stringify({ leccionActual, cursoNombre, puntos })
        });
        if (completado) {
            const res = await apiFetch(`/educacion/cursos/${cursoId}/certificado`, {
                method: 'POST',
                body: JSON.stringify({ cursoNombre, puntos })
            });
            if (res?.ok) {
                const data = await res.json();
                if (data.codigoCertificado) {
                    // Guardar código de certificado en progreso local
                    if (!progreso[cursoId]) progreso[cursoId] = {};
                    progreso[cursoId].codigoCert = data.codigoCertificado;
                    guardarProgreso();
                }
            }
        }
    } catch { /* silencioso — progreso guardado localmente */ }
}

/**
 * Carga el progreso del backend al iniciar y fusiona con el local.
 */
async function sincronizarCursosBackend() {
    try {
        const res = await apiFetch('/educacion/cursos');
        if (!res?.ok) return;
        const cursosBackend = await res.json();
        cursosBackend.forEach(cb => {
            if (!progreso[cb.id]) progreso[cb.id] = {};
            if (cb.leccionActual > (progreso[cb.id].leccionActual || 0)) {
                progreso[cb.id].leccionActual = cb.leccionActual;
            }
            if (cb.completado) progreso[cb.id].completado = true;
            if (cb.certificado) progreso[cb.id].cert = true;
        });
        guardarProgreso();
        renderCursos(catActual);
        actualizarStats();
        renderCerts();
    } catch { /* silencioso — usa datos locales */ }
}

/**
 * Obtiene los certificados del backend y actualiza la lista.
 */
async function cargarCertificadosBackend() {
    try {
        const res = await apiFetch('/educacion/certificados');
        if (!res?.ok) return;
        const certs = await res.json();
        const list = document.getElementById('certList');
        if (!list || !certs.length) return;
        const extra = certs.filter(c => !CURSOS.find(cur => cur.id === String(c.courseId)));
        if (extra.length) {
            extra.forEach(c => {
                list.insertAdjacentHTML('beforeend', `
                    <div style="display:flex;align-items:center;gap:1rem;padding:.8rem;border:1px solid var(--border);border-radius:10px;margin-bottom:.7rem;background:var(--bg-main)">
                        <span style="font-size:2rem">🏅</span>
                        <div style="flex:1">
                            <div style="font-weight:600;font-size:.92rem">${c.cursoNombre || 'Curso'}</div>
                            <div style="font-size:.78rem;color:var(--text-muted)">Código: ${c.codigoCertificado || '-'}</div>
                        </div>
                        <button class="btn-secondary" style="font-size:.78rem;padding:.35rem .7rem" data-action="generar-cert-pdf" data-nombre="${(c.cursoNombre || 'Curso')}" data-codigo="${c.codigoCertificado || ''}">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    </div>`);
            });
        }
    } catch { /* silencioso */ }
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    await cargarCatalogoCursos();
    renderCursos();
    actualizarStats();
    renderCerts();
    cargarBadgeNotificaciones();
    // Sincronizar con backend (no bloquea el render local)
    sincronizarCursosBackend().then(() => cargarCertificadosBackend());
});