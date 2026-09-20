/**
 * =============================================================================
 * Operaciones financieras.
 * =============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    /* Cargar cuentas si hay selectores en la página */
    if (document.getElementById('originAccount'))
        initModuloCuentas();

    /* Módulos según elementos presentes en el DOM */


    if (document.getElementById('transferForm') && document.getElementById('originAccount'))
        initTransferForm();
    if (document.getElementById('formSimularPrestamo') || document.getElementById('simuladorForm'))
        initSimuladorCredito();
    if (document.getElementById('ahorroMensual')) initSimuladorAhorro();
    /* La tabla de "Mis Créditos Activos" (#listaPrestamosActivos) se renderiza
       desde paginas.js → initPaginaPrestamos(), que ya arma columnas, progreso
       y modal de confirmación. No inicializar aquí para evitar que esta versión
       (columnas desalineadas, sin traducir el estado, y sin modal de confirmación)
       sobreescriba esa tabla en una carrera de peticiones. */
    if (document.getElementById('loanTitle')) initDetallePrestamo();

    /* Aplicar máscara de moneda a inputs numéricos */
    ['montoInput', 'monto', 'amount', 'payAmount', 'ahorroMensual', 'inputMontoPago']
        .forEach(id => setupMoneyInput(id));

    /* Botón certificado bancario: se maneja en paginas.js (initDetallePrestamo).
       No registrar listener aquí para evitar conflicto de doble disparo. */
});


/* -----------------------------------------------------------------------------
   CUENTAS
   Carga las cuentas del usuario en los selectores de la página.
----------------------------------------------------------------------------- */

async function initModuloCuentas() {
    /* Todos los selectores de cuenta en la página actual */
    const selectores = [
        document.getElementById('originAccount'),
        document.getElementById('metodoPago')
    ].filter(Boolean);

    if (!selectores.length) return;

    try {
        const res = await apiFetch('/cuentas');
        if (!res?.ok) throw new Error('Sin respuesta');
        const cuentas = await res.json();

        /* Guardar cuentas globalmente para acceso rápido */
        window._cuentasUsuario = cuentas;

        selectores.forEach(select => {
            select.innerHTML = '';

            if (!cuentas.length) {
                select.innerHTML = '<option disabled selected>No hay cuentas activas</option>';
                return;
            }

            /* Opción placeholder */
            const def = document.createElement('option');
            def.value = ''; def.disabled = true; def.selected = true;
            def.textContent = 'Selecciona una cuenta';
            select.appendChild(def);

            /* Una opción por cuenta — value = numero de cuenta (código) */
            cuentas.forEach(cta => {
                const opt = document.createElement('option');
                opt.value = cta.numero;   /* ← código BKM-CARLOS-001 */
                opt.dataset.id = cta.id;
                opt.textContent = `${labelTipoCuenta(cta.tipo)} · ****${(cta.numero || '').slice(-4)} (${formatearCOP(cta.saldo)})`;
                select.appendChild(opt);
            });
        });

        /* KPI strip en transferencias.html */
        const setKpi = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        if (cuentas.length) {
            const totalSaldo = cuentas.reduce((acc, c) => acc + (c.saldo || 0), 0);
            setKpi('kpiSaldo', formatearCOP(totalSaldo));
        }

        /* QR con número de cuenta principal (si existe el contenedor) */
        const qrContainer = document.getElementById('qrcode');
        if (qrContainer && cuentas[0] && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: `bankomunal:transfer:${cuentas[0].numero}`,
                width: 180, height: 180,
                colorDark: '#005f73'
            });
        }

    } catch {
        selectores.forEach(s => {
            s.innerHTML = '<option disabled selected>Error cargando cuentas</option>';
        });
    }
}


/* -----------------------------------------------------------------------------
   TRANSFERENCIAS
----------------------------------------------------------------------------- */

/* Cierra la tarjeta de comprobante generada dinámicamente, sin onclick inline. */
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="cerrar-comprobante"]');
    if (!btn) return;
    btn.closest('.comprobante-card')?.parentElement?.classList.add('hidden');
});

/* Imprime/descarga el comprobante de transferencia (mismo helper que usan
   los comprobantes de pago y el certificado de préstamos). */
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="imprimir-comprobante-transferencia"]');
    if (!btn) return;
    const d = btn.dataset;
    imprimirComprobante('Comprobante de Transferencia', [
        ['Referencia', d.referencia],
        ['Cuenta origen', d.origen],
        ['Cuenta destino', d.destino],
        ['Monto', formatearCOP(Number(d.monto) || 0)],
        ['Fecha', d.fecha],
        ['Estado', d.estado],
    ], 'TRF');
});

async function initTransferForm() {
    const form = document.getElementById('transferForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const montoRaw = document.getElementById('amount').value.replace(/\D/g, '');

        if (!montoRaw || parseInt(montoRaw) <= 0)
            return mostrarToast('El monto debe ser mayor a 0', 'warning');

        const payload = {
            origen: document.getElementById('originAccount').value.trim(),
            destino: document.getElementById('toAccount').value.trim(),
            monto: parseInt(montoRaw),
            descripcion: document.getElementById('concept')?.value?.trim() || 'Transferencia Bankomunal'
        };

        if (!payload.origen) return mostrarToast('Selecciona una cuenta origen', 'warning');
        if (!payload.destino) return mostrarToast('Ingresa el número de cuenta destino', 'warning');

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

        try {
            const res = await apiFetch('/transferencias', {
                method: 'POST', body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok) {
                mostrarToast('Transferencia realizada con éxito ', 'success');
                form.reset();

                const block = document.getElementById('summaryBlock');
                if (block) {
                    const fecha = data.fecha
                        ? new Date(data.fecha).toLocaleString('es-CO')
                        : new Date().toLocaleString('es-CO');
                    block.innerHTML = `
                        <div class="comprobante-card" style="
                            background: var(--bg-card, #fff);
                            border: 1px solid var(--border-color, #e0e0e0);
                            border-radius: 12px;
                            padding: 1.5rem;
                            margin-top: 1.5rem;
                        ">
                            <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem">
                                <i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:1.4rem"></i>
                                <h3 style="margin:0;color:var(--text-main,#111);font-size:1rem">
                                    Transferencia completada
                                </h3>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem .4rem;font-size:.875rem">
                                <span style="color:var(--text-muted,#666)">Referencia</span>
                                <span style="font-weight:600">${data.referencia || '-'}</span>

                                <span style="color:var(--text-muted,#666)">Cuenta origen</span>
                                <span>${data.cuentaOrigen || payload.origen}</span>

                                <span style="color:var(--text-muted,#666)">Cuenta destino</span>
                                <span>${data.cuentaDestino || payload.destino}</span>

                                <span style="color:var(--text-muted,#666)">Monto</span>
                                <span style="font-weight:700;color:#005f73">
                                    ${formatearCOP(data.monto ?? parseInt(montoRaw))}
                                </span>

                                <span style="color:var(--text-muted,#666)">Fecha</span>
                                <span>${fecha}</span>

                                <span style="color:var(--text-muted,#666)">Estado</span>
                                <span class="status-badge status-success" style="width:fit-content">
                                    ${data.estado || 'completada'}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-action="cerrar-comprobante"
                                style="
                                    margin-top:1rem;width:100%;padding:.5rem;
                                    border:1px solid var(--border-color,#e0e0e0);
                                    border-radius:8px;background:transparent;
                                    cursor:pointer;font-size:.85rem;color:var(--text-muted,#666)
                                ">
                                Cerrar comprobante
                            </button>
                            <button
                                type="button"
                                data-action="imprimir-comprobante-transferencia"
                                data-referencia="${data.referencia || '-'}"
                                data-origen="${data.cuentaOrigen || payload.origen}"
                                data-destino="${data.cuentaDestino || payload.destino}"
                                data-monto="${data.monto ?? parseInt(montoRaw)}"
                                data-fecha="${fecha}"
                                data-estado="${data.estado || 'completada'}"
                                style="
                                    margin-top:.6rem;width:100%;padding:.5rem;
                                    border:none;border-radius:8px;background:#005F73;
                                    cursor:pointer;font-size:.85rem;color:#fff;font-weight:600
                                ">
                                <i class="fa-solid fa-print"></i> Imprimir / Descargar
                            </button>
                        </div>`;
                    block.classList.remove('hidden');
                    block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                initModuloCuentas();
                if (typeof initPaginaTransferencias === 'function') initPaginaTransferencias();
            } else {
                mostrarToast(data.mensaje || 'No se pudo completar la transferencia', 'error');
            }
        } catch {
            mostrarToast('Error de conexión con el servidor', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Continuar';
        }
    });
}


/* -----------------------------------------------------------------------------
   SIMULADOR DE CRÉDITO
   Calcula la cuota mensual usando el backend (fórmula de amortización francesa).
----------------------------------------------------------------------------- */

async function initSimuladorCredito() {
    /*
     * Soporta DOS layouts de HTML:
     *  A) prestamos.html        → ids: montoInput, plazoSelect, cuotaResult, tablaAmortizacion
     *  B) simulador-credito.html→ ids: monto, plazo, tasa, txtCuota, txtInteres, txtTotal,
     *                              cuerpoTabla, simuladorForm, btnPDF
     */
    const getMonto = () => {
        const el = document.getElementById('montoInput') || document.getElementById('monto');
        return parseInt((el?.value || '').replace(/\D/g, '')) || 0;
    };
    const getPlazo = () => {
        const el = document.getElementById('plazoSelect') || document.getElementById('plazo');
        return parseInt(el?.value) || 12;
    };
    const getTasa = () => {
        const el = document.getElementById('tasa');
        return el ? (parseFloat(el.value) || 1.5) / 100 : 0.015;
    };

    let chartInstance = null;

    const calcular = async () => {
        const monto = getMonto();
        const plazo = getPlazo();
        const r = getTasa();

        if (monto <= 0) {
            ['txtCuota', 'cuotaResult'].forEach(id => {
                const el = document.getElementById(id); if (el) el.innerText = '$ 0';
            });
            return;
        }

        const factor = Math.pow(1 + r, plazo);
        const cuota = (monto * r * factor) / (factor - 1);
        const totalP = cuota * plazo;
        const totalI = totalP - monto;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        set('cuotaResult', formatearCOP(cuota));
        set('totalPagar', formatearCOP(totalP));
        set('totalIntereses', formatearCOP(totalI));
        set('tasaInteres', (r * 100).toFixed(2) + '% mensual');
        set('txtCuota', formatearCOP(cuota));
        set('txtInteres', formatearCOP(totalI));
        set('txtTotal', formatearCOP(totalP));
        set('kpiSimInteres', formatearCOP(totalI));
        set('kpiSimTotal', formatearCOP(totalP));
        set('kpiSimMeses', plazo);
        set('resumenCuota', formatearCOP(cuota));
        set('resumenCapital', formatearCOP(monto));

        actualizarGrafica(monto, totalI);
        generarTabla(monto, r, plazo, cuota);

        try {
            const res = await apiFetch('/prestamos/simular', {
                method: 'POST', body: JSON.stringify({ monto, plazoMeses: plazo })
            });
            if (res?.ok) {
                const data = await res.json();
                set('cuotaResult', formatearCOP(data.cuotaMensual));
                set('txtCuota', formatearCOP(data.cuotaMensual));
                set('totalPagar', formatearCOP(data.totalPagar));
                set('totalIntereses', formatearCOP(data.totalIntereses));
                set('txtInteres', formatearCOP(data.totalIntereses));
                set('txtTotal', formatearCOP(data.totalPagar));
            }
        } catch { /* cálculo local visible */ }
    };

    const actualizarGrafica = (capital, intereses) => {
        const ctx = document.getElementById('graficoAmortizacion');
        if (!ctx || typeof Chart === 'undefined') return;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        chartInstance = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Capital', 'Intereses'],
                datasets: [{
                    label: 'Composición', data: [Math.round(capital), Math.round(intereses)],
                    backgroundColor: ['rgba(0,95,115,0.85)', 'rgba(238,155,0,0.85)'],
                    borderRadius: 6, borderSkipped: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (i) => ' ' + formatearCOP(i.raw) } }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => '$ ' + Intl.NumberFormat('es-CO').format(v) }
                    }
                }
            }
        });
    };

    const generarTabla = (principal, r, plazo, cuota) => {
        const tbody = document.getElementById('cuerpoTabla') ||
            document.getElementById('tablaAmortizacion');
        if (!tbody) return;
        let saldo = principal;
        tbody.innerHTML = Array.from({ length: plazo }, (_, i) => {
            const n = i + 1, interes = saldo * r, capital = cuota - interes;
            saldo = Math.max(0, saldo - capital);
            return `<tr>
                <td class="text-center">${n}</td>
                <td class="text-right">${formatearCOP(cuota)}</td>
                <td class="text-right" style="color:#EE9B00">${formatearCOP(interes)}</td>
                <td class="text-right" style="color:#005F73">${formatearCOP(capital)}</td>
                <td class="text-right"><strong>${formatearCOP(saldo)}</strong></td>
            </tr>`;
        }).join('');
    };

    /* PDF (simulador-credito.html) */
    document.getElementById('btnPDF')?.addEventListener('click', () => {
        const monto = getMonto(), plazo = getPlazo(), r = getTasa();
        if (!monto) return mostrarToast('Primero calcula una proyección', 'warning');
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const factor = Math.pow(1 + r, plazo);
            const cuota = (monto * r * factor) / (factor - 1);
            doc.setFontSize(16); doc.setTextColor(0, 95, 115);
            doc.text('BANKOMUNAL — Plan de Amortización', 14, 20);
            doc.setFontSize(10); doc.setTextColor(50);
            doc.text(`Monto: ${formatearCOP(monto)}   Plazo: ${plazo} meses   Tasa: ${(r * 100).toFixed(2)}% mensual`, 14, 30);
            doc.text(`Cuota fija: ${formatearCOP(cuota)}`, 14, 37);
            let saldo = monto;
            const rows = Array.from({ length: plazo }, (_, i) => {
                const n = i + 1, interes = saldo * r, capital = cuota - interes;
                saldo = Math.max(0, saldo - capital);
                return [n, formatearCOP(cuota), formatearCOP(interes), formatearCOP(capital), formatearCOP(saldo)];
            });
            doc.autoTable({
                startY: 44, head: [['Mes', 'Cuota Fija', 'Interés', 'Abono Capital', 'Saldo']],
                body: rows, theme: 'striped',
                headStyles: { fillColor: [0, 95, 115], textColor: 255 },
                styles: { fontSize: 9, halign: 'right' }, columnStyles: { 0: { halign: 'center' } }
            });
            doc.save(`plan-amortizacion-${plazo}meses.pdf`);
            mostrarToast('PDF descargado ', 'success');
        } catch { mostrarToast('Error al generar PDF', 'error'); }
    });

    /* Eventos */
    document.getElementById('simuladorForm')?.addEventListener('submit', e => { e.preventDefault(); calcular(); });
    document.getElementById('montoInput')?.addEventListener('change', calcular);
    setTimeout(calcular, 300);
    document.getElementById('montoInput')?.addEventListener('input', calcular);
    document.getElementById('plazoSelect')?.addEventListener('change', calcular);
    document.getElementById('monto')?.addEventListener('input', calcular);
    document.getElementById('plazo')?.addEventListener('input', calcular);
    document.getElementById('tasa')?.addEventListener('input', calcular);
}


/* -----------------------------------------------------------------------------
   SIMULADOR DE AHORRO (cálculo 100% local)
----------------------------------------------------------------------------- */

function initSimuladorAhorro() {
    const montoInput = document.getElementById('ahorroMensual');
    const rangeInput = document.getElementById('mesesRange');
    const labelMeses = document.getElementById('lblMeses');
    const resultado = document.getElementById('ahorroResult');
    const TASA = 0.005; /* 0.5% mensual de rendimiento cooperativo */

    const calcular = () => {
        const ahorro = parseFloat(montoInput?.value.replace(/\D/g, '')) || 0;
        const meses = parseInt(rangeInput?.value) || 12;
        if (labelMeses) labelMeses.innerText = meses;
        if (ahorro > 0) {
            /* Fórmula valor futuro de una anualidad ordinaria */
            const total = ahorro * ((Math.pow(1 + TASA, meses) - 1) / TASA);
            if (resultado) resultado.innerText = formatearCOP(total);
        } else {
            if (resultado) resultado.innerText = '$ 0';
        }
    };

    montoInput?.addEventListener('input', calcular);
    rangeInput?.addEventListener('input', calcular);
}

/* -----------------------------------------------------------------------------
   DETALLE DE PRÉSTAMO
   Carga el plan de amortización desde GET /api/prestamos/{id}/detalle
   y maneja el flujo completo de pago de cuotas.
----------------------------------------------------------------------------- */

async function initDetallePrestamo() {
    const params = new URLSearchParams(window.location.search);
    const loanId = params.get('id');
    if (!loanId) {
        document.getElementById('loanTitle').textContent = 'Préstamo no especificado';
        return;
    }

    await cargarDetallePrestamo(loanId);
    initModalPago(loanId);

    /* ── Botón Reportar Problema ────────────────────────────────────────── */
    document.getElementById('btnReportarProblema')?.addEventListener('click', async () => {
        const desc = prompt('Describe brevemente el problema con tu préstamo:');
        if (!desc?.trim()) return;
        try {
            const res = await apiFetch('/soporte/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    asunto: `Problema con préstamo #${loanId}`,
                    descripcion: desc,
                    categoria: 'prestamo',
                    tipo: 'tecnico'
                })
            });
            if (res?.ok) {
                const d = await res.json();
                mostrarToast(`Ticket #${d.id} creado. Un asesor te contactará `, 'success');
            } else { mostrarToast('Error al crear el ticket', 'error'); }
        } catch { mostrarToast('Error de conexión', 'error'); }
    });
}

/** Carga y renderiza el detalle completo del préstamo */
async function cargarDetallePrestamo(loanId) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    try {
        const res = await apiFetch(`/prestamos/${loanId}/detalle`);
        if (!res?.ok) throw new Error('Sin respuesta');
        const p = await res.json();

        const loanTitleEl = document.getElementById('loanTitle');
        if (loanTitleEl) {
            const idSpan = document.getElementById('loanId');
            loanTitleEl.textContent = 'Préstamo ';
            if (idSpan) loanTitleEl.appendChild(idSpan); // re-anexar el span ya existente
        }
        set('loanId', '#' + p.id);

        const statusEl = document.getElementById('loanStatus');
        if (statusEl) {
            statusEl.textContent = estadoLabel(p.estado);
            statusEl.className = 'status-pill ' + estadoClase(p.estado);
        }

        if (p.fechaSolicitud)
            set('loanApprovalDate',
                new Date(p.fechaSolicitud).toLocaleDateString('es-CO', { dateStyle: 'long' }));

        // ── Barra de progreso ─────────────────────────────────────────────────
        const bar = document.getElementById('progressBar');
        if (bar) bar.style.width = (p.porcentajePagado || 0) + '%';
        set('progressPercentage', (p.porcentajePagado || 0) + '%');
        set('amountPaid', formatearCOP(p.montoPagado || 0));
        set('totalLoanAmount', formatearCOP(p.totalPagar || 0));
        set('pendingBalance', formatearCOP(p.saldoPendiente || 0));
        set('pendingBalance2', formatearCOP(p.saldoPendiente || 0));
        set('kpiMonto', formatearCOP(p.montoSolicitado || 0));
        set('kpiCuotaMensual', formatearCOP(p.cuotaMensual || 0));

        if (p.proximoVencimiento)
            set('nextDueDate',
                new Date(p.proximoVencimiento + 'T00:00:00').toLocaleDateString('es-CO'));

        // ── Resumen técnico ───────────────────────────────────────────────────
        const tasaPct = p.tasaInteresMensual
            ? (parseFloat(p.tasaInteresMensual) * 100).toFixed(2) + '% mensual'
            : '1.80% mensual';
        set('monthlyRate', tasaPct);
        set('totalTerm', (p.plazoMeses || '--') + ' Meses');
        set('kpiPlazo', (p.plazoMeses || '--') + ' meses');  // KPI strip
        set('paymentFrequency', 'Mensual');
        set('insuranceCost', formatearCOP(0));

        // ── Tabla de amortización ─────────────────────────────────────────────
        renderTablaAmortizacion(p.amortizacion || [], p.cuotasPagadas || 0);

        // Guardar cuota en el modal para mostrarla
        window._cuotaMensual = p.cuotaMensual;
        window._loanSaldoPend = p.saldoPendiente;
        window._loanEstado = p.estado;
        window._loanTitular = { id: p.titularId, nombre: p.titularNombre, email: p.titularEmail };

        adaptarVistaSegunRol(loanId, p);
        manejarEstadoContrato(loanId, p);

    } catch (err) {
        document.getElementById('loanTitle').textContent = 'Error al cargar préstamo';
        console.error(err);
    }
}

/**
 * Maneja los estados del préstamo que no son "activo con cuotas normales":
 * - pending: en revisión, todavía no hay contrato.
 * - approved: el admin ya aprobó — se muestra el contrato con sus términos
 *   y el socio debe aceptarlo para que se haga el desembolso (igual que
 *   Nequi o plataformas similares).
 * - rejected: se muestra el motivo que dio el admin.
 * En cualquiera de estos tres casos se ocultan "Pagar cuota" y "Reportar
 * problema", porque todavía no hay cuotas activas que pagar.
 */
function manejarEstadoContrato(loanId, p) {
    const session = getSession?.() || {};
    const esMio = p.titularId && session.id && p.titularId == session.id;
    const banner = document.getElementById('bannerEstadoPrestamo');
    if (!banner) return;

    const estado = (p.estado || '').toLowerCase();
    if (estado === 'active' || estado === 'paid' || estado === 'defaulted') {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return; // flujo normal, ya cubierto por el resto de la página
    }

    // En pending/approved/rejected no hay cuotas activas que pagar todavía
    document.getElementById('btnAbrirAbono')?.remove();
    document.getElementById('btnReportarProblema')?.remove();

    if (estado === 'pending') {
        banner.innerHTML = `
            <div class="card p-20 shadow-sm mb-25" style="border-left:4px solid #f59e0b">
                <strong><i class="fa-solid fa-hourglass-half"></i> Solicitud en revisión</strong>
                <p class="text-muted" style="margin-top:.4rem;font-size:.88rem">
                    Tu solicitud está siendo evaluada por un asesor. Te avisaremos apenas haya una decisión.
                </p>
            </div>`;
        banner.classList.remove('hidden');
        return;
    }

    if (estado === 'rejected') {
        banner.innerHTML = `
            <div class="card p-20 shadow-sm mb-25" style="border-left:4px solid #dc2626">
                <strong style="color:#dc2626"><i class="fa-solid fa-circle-xmark"></i> Solicitud rechazada</strong>
                <p style="margin-top:.4rem;font-size:.88rem">${p.motivoRechazo || 'No se especificó un motivo.'}</p>
            </div>`;
        banner.classList.remove('hidden');
        return;
    }

    if (estado === 'approved') {
        if (!esMio) {
            // Un admin viendo el contrato de otro: solo informativo, no puede firmarlo por el socio
            banner.innerHTML = `
                <div class="card p-20 shadow-sm mb-25" style="border-left:4px solid #005f73">
                    <strong><i class="fa-solid fa-file-signature"></i> Contrato pendiente de aceptación</strong>
                    <p class="text-muted" style="margin-top:.4rem;font-size:.88rem">
                        El préstamo fue aprobado. Está esperando a que ${p.titularNombre || 'el socio'} acepte el
                        contrato desde su cuenta — el desembolso se hace en ese momento, no antes.
                    </p>
                </div>`;
            banner.classList.remove('hidden');
            return;
        }

        // El propio socio: mostrar el contrato completo con botón de aceptar
        const tasaPct = p.tasaInteresMensual ? (parseFloat(p.tasaInteresMensual) * 100).toFixed(2) : '1.80';
        banner.innerHTML = `
            <div class="card p-20 shadow-sm mb-25" style="border-left:4px solid #005f73">
                <strong><i class="fa-solid fa-file-signature"></i> Tu contrato está listo</strong>
                <p class="text-muted" style="margin-top:.3rem;font-size:.85rem">
                    Revisa los términos. El desembolso a tu cuenta se hace justo al aceptar.
                </p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem .9rem;margin:.9rem 0;font-size:.85rem">
                    <div><span class="text-muted">Monto a recibir</span><br><strong>${formatearCOP(p.montoSolicitado || 0)}</strong></div>
                    <div><span class="text-muted">Plazo</span><br><strong>${p.plazoMeses || '--'} meses</strong></div>
                    <div><span class="text-muted">Cuota mensual</span><br><strong>${formatearCOP(p.cuotaMensual || 0)}</strong></div>
                    <div><span class="text-muted">Tasa mensual</span><br><strong>${tasaPct}%</strong></div>
                    <div><span class="text-muted">Total a pagar</span><br><strong>${formatearCOP(p.totalPagar || 0)}</strong></div>
                    <div><span class="text-muted">Primer vencimiento</span><br><strong>${p.proximoVencimiento ? new Date(p.proximoVencimiento + 'T00:00:00').toLocaleDateString('es-CO') : '--'}</strong></div>
                </div>
                <label style="display:flex;gap:.5rem;align-items:flex-start;font-size:.82rem;margin-bottom:.8rem;cursor:pointer">
                    <input type="checkbox" id="chkAceptaContrato" style="margin-top:.2rem">
                    <span>Leí y acepto los términos de este préstamo: monto, plazo, tasa y cuota mensual indicados arriba.</span>
                </label>
                <button id="btnAceptarContrato" class="btn-primary w-100">
                    <i class="fa-solid fa-signature"></i> Aceptar contrato y recibir desembolso
                </button>
            </div>`;
        banner.classList.remove('hidden');

        document.getElementById('btnAceptarContrato')?.addEventListener('click', async function () {
            if (!document.getElementById('chkAceptaContrato')?.checked) {
                mostrarToast('Debes marcar que aceptas los términos primero.', 'warning');
                return;
            }
            this.disabled = true;
            this.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Procesando...';
            try {
                const res = await apiFetch(`/prestamos/${loanId}/aceptar`, { method: 'POST' });
                if (res?.ok) {
                    mostrarToast('Contrato aceptado — dinero disponible en tu cuenta', 'success');
                    setTimeout(() => cargarDetallePrestamo(loanId), 1200);
                } else {
                    const data = await res.json().catch(() => ({}));
                    mostrarToast(data.mensaje || 'No se pudo aceptar el contrato.', 'error');
                    this.disabled = false;
                    this.innerHTML = '<i class="fa-solid fa-signature"></i> Aceptar contrato y recibir desembolso';
                }
            } catch {
                mostrarToast('Error de conexión', 'error');
                this.disabled = false;
                this.innerHTML = '<i class="fa-solid fa-signature"></i> Aceptar contrato y recibir desembolso';
            }
        });
    }
}


/**
 * Consulta GET /api/admin/prestamos/socio/{userId}/riesgo (CreditRiskService)
 * y pinta un score de riesgo compacto en la revisión del préstamo, para que
 * el admin/tesorero lo vea de un vistazo antes de aprobar o rechazar.
 */
async function cargarRiesgoSocio(userId, cardEl) {
    try {
        const res = await apiFetch(`/admin/prestamos/socio/${userId}/riesgo`);
        if (!res?.ok) {
            cardEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:.85rem">No se pudo consultar el riesgo crediticio.</div>';
            return;
        }
        const data = await res.json();
        const nivel = (data.nivel || 'medio').toLowerCase();
        const colores = {
            bajo: { bg: 'rgba(34,197,94,.12)', fg: '#16a34a', label: 'Riesgo bajo' },
            medio: { bg: 'rgba(234,179,8,.12)', fg: '#ca8a04', label: 'Riesgo medio' },
            alto: { bg: 'rgba(239,68,68,.12)', fg: '#dc2626', label: 'Riesgo alto' }
        };
        const c = colores[nivel] || colores.medio;

        const historialHtml = (data.historial || []).slice(0, 3).map(h =>
            `<div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-muted);padding:.15rem 0">
                <span>${escapeHtmlRiesgo(h.motivo || '')}</span><span>${h.score}</span>
            </div>`
        ).join('');

        cardEl.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem">
                <div>
                    <div style="font-size:.75rem;color:var(--text-muted)">Score de riesgo crediticio</div>
                    <div style="font-size:1.4rem;font-weight:700">${data.score ?? '—'}</div>
                </div>
                <span style="background:${c.bg};color:${c.fg};padding:.3rem .7rem;border-radius:999px;font-size:.78rem;font-weight:600">
                    ${c.label}
                </span>
            </div>
            ${historialHtml ? `<div style="margin-top:.6rem;border-top:1px solid var(--border);padding-top:.5rem">${historialHtml}</div>` : ''}
        `;
    } catch {
        cardEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:.85rem">Error de conexión al consultar el riesgo.</div>';
    }
}

function escapeHtmlRiesgo(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

/**
 * Si quien ve la página puede gestionar préstamos (admin o tesorero) y el
 * préstamo NO es suyo, se adapta la vista: se ocultan las acciones que solo
 * tienen sentido para el propio socio (abonar, reportar problema) y se
 * muestra quién es el titular real + acciones de aprobación cuando el
 * préstamo está pendiente.
 */
function adaptarVistaSegunRol(loanId, p) {
    const session = getSession?.() || {};
    const puedeGestionar = typeof tienePermiso === 'function' && tienePermiso('gestion-prestamos', 'editar');
    const esMio = p.titularId && session.id && p.titularId == session.id;

    if (!puedeGestionar || esMio) return; // vista normal de socio: no se toca nada

    /* Insertar aviso con el titular real justo debajo del título */
    const tituloWrap = document.getElementById('loanTitle')?.parentElement;
    if (tituloWrap && !document.getElementById('avisoTitularAdmin')) {
        const aviso = document.createElement('p');
        aviso.id = 'avisoTitularAdmin';
        aviso.className = 'text-muted';
        aviso.style.cssText = 'font-size:.85rem;margin-top:.15rem';
        aviso.innerHTML = `<i class="fa-solid fa-user"></i> Titular: <strong>${p.titularNombre || '—'}</strong> · ${p.titularEmail || ''}`;
        tituloWrap.appendChild(aviso);
    }

    /* Ocultar acciones que solo aplican al propio socio */
    document.getElementById('btnAbrirAbono')?.remove();
    document.getElementById('btnReportarProblema')?.remove();

    /* Si el préstamo está activo y tiene cuotas pendientes, el admin puede
       dejar constancia de un pago hecho presencialmente (efectivo, etc.) */
    if ((p.estado || '').toLowerCase() === 'active' && (p.cuotasPendientes || 0) > 0) {
        const contenedor = document.getElementById('btnDescargarCert')?.parentElement;
        if (contenedor && !document.getElementById('btnAdminRegistrarPago')) {
            const btnPago = document.createElement('button');
            btnPago.id = 'btnAdminRegistrarPago';
            btnPago.className = 'btn-primary w-100';
            btnPago.style.marginTop = '.5rem';
            btnPago.innerHTML = '<i class="fa-solid fa-hand-holding-dollar"></i> Registrar pago en oficina';
            btnPago.addEventListener('click', () => {
                abrirModalRegistrarPago(loanId, p.titularNombre, {
                    totalCuota: p.cuotaMensual,
                    saldoPendiente: p.saldoPendiente
                }, () => cargarDetallePrestamo(loanId));
            });
            contenedor.appendChild(btnPago);
        }
    }

    /* Si el préstamo está pendiente de aprobación, mostrar acciones de admin.
       Excepto si es un préstamo SOLIDARIO (fondo del grupo): ese lo aprueba
       o rechaza la votación de los socios, no un admin — mostrarle aquí los
       botones de aprobar/rechazar directo le permitiría saltarse la
       votación por completo. */
    const esSolidario = p.fundingSource === 'group_fund';
    if (((p.estado || '').toLowerCase() === 'pending' || (p.estado || '').toLowerCase() === 'pendiente') && esSolidario) {
        const contenedor = document.getElementById('btnDescargarCert')?.parentElement;
        if (contenedor && !document.getElementById('avisoSolidarioAdmin')) {
            const aviso = document.createElement('div');
            aviso.id = 'avisoSolidarioAdmin';
            aviso.className = 'card';
            aviso.style.cssText = 'margin-top:.6rem;padding:.9rem 1rem;text-align:center;color:var(--text-muted);font-size:.85rem';
            aviso.innerHTML = '<i class="fa-solid fa-users"></i> Este es un préstamo solidario: lo aprueba o rechaza la votación de los socios del grupo, no un administrador.';
            contenedor.appendChild(aviso);
        }
    }
    if (((p.estado || '').toLowerCase() === 'pending' || (p.estado || '').toLowerCase() === 'pendiente') && !esSolidario) {
        const contenedor = document.getElementById('btnDescargarCert')?.parentElement;
        if (contenedor && !document.getElementById('btnAdminAprobar')) {

            if (p.titularId && !document.getElementById('cardRiesgoSocio')) {
                const cardRiesgo = document.createElement('div');
                cardRiesgo.id = 'cardRiesgoSocio';
                cardRiesgo.className = 'card';
                cardRiesgo.style.marginTop = '.6rem';
                cardRiesgo.style.padding = '.9rem 1rem';
                cardRiesgo.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:.85rem">' +
                    '<i class="fa-solid fa-spinner fa-spin"></i> Consultando riesgo crediticio...</div>';
                contenedor.appendChild(cardRiesgo);
                cargarRiesgoSocio(p.titularId, cardRiesgo);
            }

            const btnAprobar = document.createElement('button');
            btnAprobar.id = 'btnAdminAprobar';
            btnAprobar.className = 'btn-primary w-100';
            btnAprobar.style.marginTop = '.5rem';
            btnAprobar.innerHTML = '<i class="fa-solid fa-check"></i> Aprobar préstamo';
            btnAprobar.addEventListener('click', async () => {
                if (!confirm(`¿Aprobar este préstamo? Se enviará el contrato a ${p.titularNombre || 'el socio'} — el desembolso se hace solo cuando él lo acepte, no ahora.`)) return;
                try {
                    const res = await apiFetch(`/admin/prestamos/${loanId}/aprobar`, { method: 'PATCH' });
                    if (res?.ok) { mostrarToast('Contrato enviado al socio para su aceptación', 'success'); cargarDetallePrestamo(loanId); }
                    else mostrarToast('No se pudo aprobar', 'error');
                } catch { mostrarToast('Error de conexión', 'error'); }
            });

            const btnRechazar = document.createElement('button');
            btnRechazar.id = 'btnAdminRechazar';
            btnRechazar.className = 'btn-ghost w-100';
            btnRechazar.style.marginTop = '.4rem';
            btnRechazar.innerHTML = '<i class="fa-solid fa-xmark"></i> Rechazar préstamo';
            btnRechazar.addEventListener('click', async () => {
                const motivo = prompt('Motivo del rechazo (opcional):') || '';
                try {
                    const res = await apiFetch(`/admin/prestamos/${loanId}/rechazar`, {
                        method: 'PATCH', body: JSON.stringify({ motivo })
                    });
                    if (res?.ok) { mostrarToast('Préstamo rechazado', 'success'); cargarDetallePrestamo(loanId); }
                    else mostrarToast('No se pudo rechazar', 'error');
                } catch { mostrarToast('Error de conexión', 'error'); }
            });

            contenedor.appendChild(btnAprobar);
            contenedor.appendChild(btnRechazar);
        }
    }
}

/** Renderiza la tabla de amortización con estado visual por fila */
function renderTablaAmortizacion(amortizacion, cuotasPagadas) {
    const tbody = document.getElementById('amortizacionBody');
    if (!tbody) return;

    if (!amortizacion.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-40 text-muted">
            Sin plan de pagos disponible</td></tr>`;
        return;
    }

    /* El backend entrega el estado de cada cuota como el nombre del enum
       PaymentStatus (pending | paid | overdue), no en español. La primera
       cuota "pending" en orden cronológico se resalta como "Próxima". */
    let siguienteMarcada = false;

    tbody.innerHTML = amortizacion.map(c => {
        const estadoRaw = (c.estado || '').toLowerCase();
        // Normaliza también valores heredados en español, por si el backend
        // llegara a enviarlos así en algún flujo antiguo.
        const esPagada = estadoRaw === 'paid' || estadoRaw === 'pagada';
        const esVencida = estadoRaw === 'overdue' || estadoRaw === 'vencida';
        const esPendiente = estadoRaw === 'pending' || estadoRaw === 'pendiente';

        let estadoKey = estadoRaw;
        if (esPagada) estadoKey = 'pagada';
        else if (esVencida) estadoKey = 'vencida';
        else if (esPendiente) {
            estadoKey = siguienteMarcada ? 'pendiente' : 'proxima';
            if (!siguienteMarcada) siguienteMarcada = true;
        }

        const estadoCss = {
            pagada: 'status-badge status-success',
            proxima: 'status-badge status-info',
            vencida: 'status-badge status-error',
            pendiente: 'status-badge status-neutral'
        }[estadoKey] || 'status-badge';

        const estadoTxt = {
            pagada: '✓ Pagada',
            proxima: '⬡ Próxima',
            vencida: '⚠ Vencida',
            pendiente: '○ Pendiente'
        }[estadoKey] || (c.estado || '—');

        const vencDate = new Date(c.vencimiento + 'T00:00:00')
            .toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

        const fechaCol = c.fechaPago
            ? new Date(c.fechaPago + 'T00:00:00')
                .toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
            : vencDate;

        return `
        <tr class="cuota-row ${estadoKey === 'pagada' ? 'row-pagada' : ''}
                              ${estadoKey === 'vencida' ? 'row-vencida' : ''}
                              ${estadoKey === 'proxima' ? 'row-proxima' : ''}">
            <td class="text-center"><strong>${c.numeroCuota}</strong></td>
            <td>${fechaCol}</td>
            <td class="text-right">${formatearCOP(c.capital)}</td>
            <td class="text-right text-muted">${formatearCOP(c.interes)}</td>
            <td class="text-right"><strong>${formatearCOP(c.totalCuota)}</strong></td>
            <td><span class="${estadoCss}">${estadoTxt}</span></td>
        </tr>`;
    }).join('');
}

/** Inicializa el modal de pago de cuota */
async function initModalPago(loanId) {
    const btnAbrir = document.getElementById('btnAbrirAbono');
    const modal = document.getElementById('modalAbono');
    const btnCerrar = document.getElementById('closeModal');
    const btnCancelar = document.getElementById('btnCancelar');
    const formAbono = document.getElementById('formAbono');

    if (!btnAbrir || !modal) return;

    // Abrir modal
    async function poblarCuentas() {
        const sel = document.getElementById('metodoPago');
        if (!sel) return;
        try {
            const res = await apiFetch('/cuentas');
            if (res?.ok) {
                const ctas = await res.json();
                sel.innerHTML = '<option value="">Selecciona cuenta...</option>' +
                    ctas.map(ct => `<option value="${ct.numero || ct.accountCode}">${ct.tipo || ct.accountType || 'Individual'} — ${ct.numero || ct.accountCode} (${typeof formatearCOP === 'function' ? formatearCOP(ct.saldo || ct.balance || 0) : '$' + (ct.saldo || ct.balance || 0)})</option>`).join('');
            }
        } catch { }
    }

    btnAbrir.addEventListener('click', async () => {
        await poblarCuentas();
        if (window._loanEstado !== 'active') {
            mostrarToast('Este préstamo no está activo', 'warning');
            return;
        }
        const inputMonto = document.getElementById('inputMontoPago');
        if (inputMonto && window._cuotaMensual)
            inputMonto.value = formatearCOP(window._cuotaMensual);

        const newBal = document.getElementById('newPendingBalance');
        if (newBal && window._loanSaldoPend && window._cuotaMensual)
            newBal.textContent = formatearCOP(
                Math.max(0, window._loanSaldoPend - window._cuotaMensual));
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    });

    const cerrarModal = () => {
        modal.classList.add('hidden'); modal.classList.remove('active');
        modal.style.display = 'none';
    };
    btnCerrar?.addEventListener('click', cerrarModal);
    btnCancelar?.addEventListener('click', cerrarModal);
    modal.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });

    // Confirmar pago
    formAbono.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnConfirmarPago');

        const cuentaId = document.getElementById('metodoPago')?.value;
        if (!cuentaId) return mostrarToast('Selecciona una cuenta de origen', 'warning');

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Procesando...';

        try {

            const res = await apiFetch(`/prestamos/${loanId}/pagar`, {
                method: 'POST',
                body: JSON.stringify({ numeroCuenta: cuentaId })
            });
            const data = await res.json();

            if (res.ok) {
                cerrarModal();
                mostrarToast(' Cuota pagada exitosamente', 'success');
                renderTablaAmortizacion(data.amortizacion || [], data.cuotasPagadas || 0);

                const bar = document.getElementById('progressBar');
                if (bar) bar.style.width = (data.porcentajePagado || 0) + '%';
                const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
                set('progressPercentage', (data.porcentajePagado || 0) + '%');
                set('amountPaid', formatearCOP(data.montoPagado || 0));
                set('pendingBalance', formatearCOP(data.saldoPendiente || 0));
                set('pendingBalance2', formatearCOP(data.saldoPendiente || 0));

                window._cuotaMensual = data.cuotaMensual;
                window._loanSaldoPend = data.saldoPendiente;
                window._loanEstado = data.estado;

                if (data.estado === 'paid') {
                    mostrarToast(' ¡Felicitaciones! Tu préstamo ha sido pagado completamente.', 'success');
                    document.getElementById('loanStatus').textContent = 'PAGADO';
                    btnAbrir.disabled = true;
                }
            } else {
                mostrarToast(data.mensaje || 'Error al procesar el pago', 'error');
            }
        } catch {
            mostrarToast('Error de conexión con el servidor', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Confirmar Pago';
        }
    });
}

function estadoLabel(e) {
    return {
        pending: 'En revisión', approved: 'Contrato pendiente', active: 'Activo',
        paid: 'Pagado', rejected: 'Rechazado', defaulted: 'En mora'
    }[e] || e;
}
function estadoClase(e) {
    return {
        pending: 'pill-warning', approved: 'pill-info', active: 'pill-success',
        paid: 'pill-neutral', rejected: 'pill-error', defaulted: 'pill-error'
    }[e] || '';
}


/* -----------------------------------------------------------------------------
   TARJETA VIRTUAL
----------------------------------------------------------------------------- */

/** Genera número de tarjeta de 16 dígitos agrupados de 4 en 4 */
function generarNumeroTarjeta(seed) {
    const r = (s, m) => ((s * 1664525 + 1013904223) & 0x7fffffff) % m;
    let s = seed * 999983;
    const g = () => { s = r(s, 100000); return String(s).padStart(4, '0').slice(-4); };
    return `4921 ${g()} ${g()} ${g()}`;
}

/** Genera fecha de vencimiento 3 años desde hoy */
function generarVencimiento(seed) {
    const now = new Date();
    const mm = String((now.getMonth() + 1 + (seed % 12))).slice(-2).padStart(2, '0');
    const yy = String(now.getFullYear() + 3).slice(-2);
    return `${mm}/${yy}`;
}

/** Genera CVV de 3 dígitos */
function generarCVV(seed) {
    return String(100 + (seed * 7919) % 900);
}

/* =============================================================================
   MODAL TRANSFERENCIA RÁPIDA (dashboard)
   ============================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('overlay');
    const dashForm = document.getElementById('transferForm');
    const originSelect = document.getElementById('originAccount');

    /* Solo aplica si es el form del dashboard (sin selector de origen) */
    if (!dashForm || originSelect) return;

    const abrirModalTransfer = () => {
        overlay?.classList.remove('hidden');
        overlay?.classList.add('active');
    };
    const cerrarModalTransfer = () => {
        overlay?.classList.add('hidden');
        overlay?.classList.remove('active');
    };

    document.getElementById('openTransfer')?.addEventListener('click', abrirModalTransfer);
    document.getElementById('cancelModal')?.addEventListener('click', cerrarModalTransfer);
    document.getElementById('cancelModal2')?.addEventListener('click', cerrarModalTransfer);
    overlay?.addEventListener('click', e => { if (e.target === overlay) cerrarModalTransfer(); });

    dashForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.querySelector('button[type="submit"][form="transferForm"]');
        const montoRaw = (document.getElementById('amount')?.value || '').replace(/\D/g, '');
        const destino = (document.getElementById('toAccount')?.value || '').trim();

        if (!montoRaw || parseInt(montoRaw) <= 0)
            return mostrarToast('El monto debe ser mayor a 0', 'warning');
        if (!destino)
            return mostrarToast('Ingresa la cuenta destino', 'warning');

        btn && (btn.disabled = true);
        if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

        let origen = '';
        try {
            const rc = await apiFetch('/cuentas');
            if (rc?.ok) {
                const cuentas = await rc.json();
                if (cuentas.length) origen = cuentas[0].numero;
            }
        } catch { /* continúa */ }

        if (!origen) {
            mostrarToast('No tienes cuentas disponibles', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Confirmar'; }
            return;
        }

        try {
            const res = await apiFetch('/transferencias', {
                method: 'POST',
                body: JSON.stringify({
                    origen,
                    destino,
                    monto: parseInt(montoRaw),
                    descripcion: 'Transferencia rápida desde dashboard'
                })
            });
            const data = await res.json();

            if (res.ok) {
                mostrarToast('Transferencia realizada con éxito', 'success');
                dashForm.reset();
                if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('active'); }

                /* Refleja el cambio de una vez en el dashboard, sin recargar
                   la página: tabla de transacciones, KPIs (saldo, préstamos,
                   fondo común) y gráficas. */
                if (typeof initHistorial === 'function') initHistorial();
                if (typeof initDashboardExtra === 'function') initDashboardExtra();
                if (typeof initDashboardCharts === 'function') initDashboardCharts();
            } else {
                mostrarToast(data.mensaje || 'No se pudo completar la transferencia', 'error');
            }
        } catch {
            mostrarToast('Error de conexión con el servidor', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Confirmar'; }
        }
    });
});


document.addEventListener('DOMContentLoaded', () => {
    let html5QrCode = null;

    const qrModal = document.getElementById('qrScanModal') || document.getElementById('qrModal');

    function detenerYCerrarQR() {
        if (html5QrCode) {
            html5QrCode.stop().catch(() => { });
            html5QrCode = null;
        }
        if (qrModal) { qrModal.classList.add('hidden'); qrModal.classList.remove('active'); }
    }

    document.getElementById('btnScanQR')?.addEventListener('click', () => {
        if (typeof Html5Qrcode === 'undefined') {
            mostrarToast('Escáner QR no disponible en esta página.', 'warning');
            return;
        }
        if (!qrModal) {
            mostrarToast('Función de escáner QR próximamente disponible.', 'info');
            return;
        }
        qrModal.classList.remove('hidden');
        qrModal.classList.add('active');
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                mostrarToast('QR leído: ' + decodedText, 'success');
                detenerYCerrarQR();
            },
            (errorMsg) => { }
        ).catch(() => {
            mostrarToast('No se pudo acceder a la cámara.', 'error');
            qrModal.classList.add('hidden'); qrModal.classList.remove('active');
            html5QrCode = null;
        });
    });

    document.getElementById('closeQR')?.addEventListener('click', detenerYCerrarQR);
    qrModal?.addEventListener('click', e => { if (e.target === qrModal) detenerYCerrarQR(); });
});