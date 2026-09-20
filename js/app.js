/**
 * =============================================================================
 * Módulo de autenticación para páginas públicas.
 * =============================================================================
 */

/* ─── Validador de correo reutilizable (login, registro, recuperación) ───────
   Exige estructura completa: usuario@dominio.tld (con "@" y un punto final
   de al menos 2 letras). Se usa en JS antes de golpear el backend, que
   además valida con la misma regla vía @Email en los DTOs. ────────────────── */
window.esEmailValido = function (email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim());
};

/* ─── Polyfill mostrarToast para páginas públicas ───────────────────────── */
if (typeof mostrarToast === 'undefined') {
    window.mostrarToast = function (mensaje, tipo) {
        tipo = tipo || 'success';
        var container = document.getElementById('toast');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast';
            container.style.cssText =
                'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
            document.body.appendChild(container);
        }
        var colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
        var el = document.createElement('div');
        el.style.cssText =
            'background:' + (colors[tipo] || colors.info) +
            ';color:#fff;padding:12px 18px;border-radius:8px;font-size:14px;' +
            'box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:320px;word-break:break-word;transition:opacity .4s;';
        el.textContent = mensaje;
        container.appendChild(el);
        setTimeout(function () {
            el.style.opacity = '0';
            setTimeout(function () { if (el.parentNode) el.remove(); }, 400);
        }, 3500);
    };
}


/* ─── Bootstrap principal ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    initTogglePassword();
    initLoginForm();
    initRecoverForm();
    initResetPasswordForm();
    initTermsModal();
    initPrivacidadModal();
    initScrollEffects();
});


/* =============================================================================
  TOGGLE VISIBILIDAD DE CONTRASEÑA
============================================================================= */
function initTogglePassword() {
    if (document.getElementById('registerForm')) return;

    const toggleBtn = document.getElementById('togglePwd');
    if (!toggleBtn) return;
    toggleBtn.addEventListener('click', function () {
        const campo = document.getElementById('password') || document.getElementById('newPassword');
        if (!campo) return;

        const mostrar = campo.type === 'password';
        campo.type = mostrar ? 'text' : 'password';

        const icon = this.querySelector('i') || this;
        icon.classList.toggle('fa-eye', !mostrar);
        icon.classList.toggle('fa-eye-slash', mostrar);
    });

    // Toggle campo confirmar contraseña (reset-password)
    const toggleBtn2 = document.getElementById('togglePwd2');
    if (toggleBtn2) {
        toggleBtn2.addEventListener('click', function () {
            const field = document.getElementById('newPassword2');
            if (!field) return;
            const show = field.type === 'password';
            field.type = show ? 'text' : 'password';
            const icon = this.querySelector('i') || this;
            icon.classList.toggle('fa-eye', !show);
            icon.classList.toggle('fa-eye-slash', show);
        });
    }
}


/* =============================================================================
   FORMULARIO DE LOGIN
============================================================================= */
function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    // Mostrar toast si viene del registro
    const regMsg = sessionStorage.getItem('registerSuccess');
    if (regMsg) {
        sessionStorage.removeItem('registerSuccess');
        setTimeout(() => mostrarToast('' + regMsg, 'success'), 400);
    }
    const savedEmail = localStorage.getItem('rememberedEmail');
    const userInput = document.getElementById('user') || document.getElementById('email');
    const rememberChk = document.getElementById('remember');
    if (savedEmail && userInput) {
        userInput.value = savedEmail;
        if (rememberChk) rememberChk.checked = true;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailEl = document.getElementById('user') || document.getElementById('email');
        const email = emailEl?.value?.trim();
        const password = document.getElementById('password')?.value;
        const errorEl = document.getElementById('errorMsg');
        const btn = document.getElementById('btnLogin') || form.querySelector('button[type="submit"]');

        if (!email || !password) {
            mostrarError(errorEl, ' Completa todos los campos.');
            return;
        }
        if (!esEmailValido(email)) {
            mostrarError(errorEl, ' Ingresa un correo electrónico válido (ejemplo@correo.com).');
            return;
        }
        if (rememberChk?.checked) {
            localStorage.setItem('rememberedEmail', email);
        } else {
            localStorage.removeItem('rememberedEmail');
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Ingresando...';

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.mfaRequired) {
                mostrarPasoMfa(data.email);
            } else if (response.ok) {
                establecerSesionYRedirigir(data);
            } else {
                const msg = data.mensaje || Object.values(data || {}).join(' | ') || 'Credenciales incorrectas.';
                mostrarError(errorEl, msg);
            }
        } catch {
            mostrarError(errorEl, ' No se pudo conectar con el servidor. Intenta de nuevo.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar sesión';
        }
    });

    initMfaStep();
}

/** Guarda la sesión (token + datos del usuario) y redirige al panel correspondiente. */
function establecerSesionYRedirigir(data) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('userSession', JSON.stringify({
        id: data.id,
        nombre: data.nombre,
        nombreCorto: data.nombreCorto,
        email: data.email,
        rol: data.rol,
        permisos: data.permisos || [],
        genero: data.genero,
        cuenta: data.cuenta,
        iniciales: data.iniciales,
        saldoTotal: data.saldoTotal,
        fotoUrl: data.fotoUrl || null,
        createdAt: data.createdAt || null,
        mfaEnabled: data.mfaEnabled === true
    }));
    const tieneAccesoAdmin = (data.rol || '').toLowerCase() === 'admin' ||
        (data.permisos || []).some(p => p.leer);
    const destino = tieneAccesoAdmin ? 'pages/admin-dashboard.html' : 'pages/dashboard.html';
    window.location.href = destino;
}

/** Muestra el paso de "ingresa el código" tras un login con 2FA activo. */
function mostrarPasoMfa(email) {
    const pasoLogin = document.getElementById('pasoLogin');
    const pasoMfa = document.getElementById('pasoMfa');
    if (pasoLogin) pasoLogin.classList.add('hidden');
    if (pasoMfa) {
        pasoMfa.classList.remove('hidden');
        pasoMfa.dataset.email = email || '';
        document.getElementById('mfaEmailLabel').textContent = email || '';
        document.getElementById('mfaCodigo')?.focus();
    }
}

/** Maneja el envío del código de verificación (segundo paso del login). */
function initMfaStep() {
    const form = document.getElementById('mfaForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('pasoMfa')?.dataset.email;
        const codigo = document.getElementById('mfaCodigo')?.value?.trim();
        const errorEl = document.getElementById('mfaErrorMsg');
        const btn = form.querySelector('button[type="submit"]');

        if (!codigo) {
            mostrarError(errorEl, ' Ingresa el código que enviamos a tu correo.');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verificando...';

        try {
            const response = await fetch(`${API_BASE}/auth/mfa/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, codigo })
            });
            const data = await response.json();

            if (response.ok) {
                establecerSesionYRedirigir(data);
            } else {
                mostrarError(errorEl, data.mensaje || 'Código incorrecto o expirado.');
            }
        } catch {
            mostrarError(errorEl, ' No se pudo conectar con el servidor. Intenta de nuevo.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Verificar';
        }
    });

    document.getElementById('btnVolverLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('pasoMfa')?.classList.add('hidden');
        document.getElementById('pasoLogin')?.classList.remove('hidden');
    });
}


/* =============================================================================
   FORMULARIO DE RECUPERACIÓN DE CONTRASEÑA
============================================================================= */
function initRecoverForm() {
    const form = document.getElementById('recoverForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('user')?.value?.trim();
        const successEl = document.getElementById('recoverMsg');
        const errorEl = document.getElementById('recoverError');
        const btn = form.querySelector('button[type="submit"]');

        if (successEl) successEl.hidden = true;
        if (errorEl) errorEl.hidden = true;

        if (!email) {
            mostrarError(errorEl, ' Ingresa tu correo electrónico.');
            return;
        }
        if (!esEmailValido(email)) {
            mostrarError(errorEl, ' Ingresa un correo electrónico válido.');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

        try {
            const response = await fetch(`${API_BASE}/auth/recover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();
            if (!response.ok) {
                mostrarError(errorEl, ' ' + (data.mensaje || 'Error al procesar la solicitud. Intenta de nuevo.'));
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar instrucciones';
                return;
            }

            if (successEl) {
                successEl.textContent =
                    ' ' + (data.mensaje ||
                        'Si el correo está registrado, recibirás instrucciones en los próximos minutos.');
                successEl.hidden = false;
            }

            form.querySelector('input').disabled = true;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Instrucciones enviadas';

        } catch {
            mostrarError(errorEl, ' Error al conectar con el servidor. Intenta de nuevo.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar instrucciones';
        }
    });
}


/* =============================================================================
   FORMULARIO DE RESET DE CONTRASEÑA
============================================================================= */
function initResetPasswordForm() {
    const form = document.getElementById('resetPasswordForm');
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const errorEl = document.getElementById('resetError');
    const successEl = document.getElementById('resetSuccess');
    const tokenInput = document.getElementById('resetToken');
    const btn = document.getElementById('btnReset') ||
        form.querySelector('button[type="submit"]');

    if (!token) {
        mostrarError(errorEl, ' Enlace inválido. Solicita un nuevo correo de recuperación.');
        if (btn) btn.disabled = true;
        return;
    }

    if (tokenInput) tokenInput.value = token;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = document.getElementById('newPassword')?.value;
        const password2 = document.getElementById('newPassword2')?.value;

        if (errorEl) errorEl.hidden = true;
        if (successEl) successEl.hidden = true;

        if (!password || !password2) {
            mostrarError(errorEl, ' Completa ambos campos de contraseña.');
            return;
        }
        if (password.length < 8) {
            mostrarError(errorEl, ' La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (password !== password2) {
            mostrarError(errorEl, ' Las contraseñas no coinciden.');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';

        try {
            const response = await fetch(`${API_BASE}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            });

            const data = await response.json();

            if (response.ok) {
                if (successEl) {
                    successEl.textContent =
                        ' ' + (data.mensaje || 'Contraseña actualizada correctamente.');
                    successEl.hidden = false;
                }
                form.querySelectorAll('input, button').forEach(el => el.disabled = true);
                setTimeout(() => { window.location.href = 'login.html'; }, 3000);
            } else {
                mostrarError(errorEl,
                    ' ' + (data.mensaje || 'El enlace es inválido o ha expirado. Solicita uno nuevo.'));
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-key"></i> Guardar nueva contraseña';
            }
        } catch {
            mostrarError(errorEl, ' Error al conectar con el servidor. Intenta de nuevo.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-key"></i> Guardar nueva contraseña';
        }
    });
}


/* =============================================================================
   MODAL DE TÉRMINOS Y CONDICIONES
============================================================================= */
function initTermsModal() {
    const modal = document.getElementById('modalTerminos');
    if (!modal) return;

    const btnAbrir = document.getElementById('openTerms');
    const btnCerrar = document.getElementById('closeModal');
    const btnAceptar = document.getElementById('acceptTermsBtn');
    const checkbox = document.getElementById('terminos');

    const toggle = (mostrar) => {
        modal.classList.toggle('hidden', !mostrar);
        modal.style.display = mostrar ? 'flex' : 'none';
    };

    btnAbrir?.addEventListener('click', (e) => { e.preventDefault(); toggle(true); });
    btnCerrar?.addEventListener('click', () => toggle(false));
    btnAceptar?.addEventListener('click', () => {
        if (checkbox) checkbox.checked = true;
        toggle(false);
    });
    window.addEventListener('click', (e) => { if (e.target === modal) toggle(false); });
}


/* =============================================================================
   MODAL DE POLÍTICA DE PRIVACIDAD
============================================================================= */
function initPrivacidadModal() {
    const modal = document.getElementById('modalPrivacidad');
    if (!modal) return;

    const btnAbrir = document.getElementById('openPrivacidad');
    const btnCerrar = document.getElementById('closeModalPrivacidad');
    const btnAceptar = document.getElementById('acceptPrivacidadBtn');
    const checkbox = document.getElementById('terminos');

    const toggle = (mostrar) => {
        modal.classList.toggle('hidden', !mostrar);
        modal.style.display = mostrar ? 'flex' : 'none';
    };

    btnAbrir?.addEventListener('click', (e) => { e.preventDefault(); toggle(true); });
    btnCerrar?.addEventListener('click', () => toggle(false));
    btnAceptar?.addEventListener('click', () => {
        if (checkbox) checkbox.checked = true;
        toggle(false);
    });
    window.addEventListener('click', (e) => { if (e.target === modal) toggle(false); });
}


/* =============================================================================
   EFECTOS VISUALES
============================================================================= */
function initScrollEffects() {
    const header = document.querySelector('.main-header');
    if (!header) return;
    window.addEventListener('scroll', () => {
        header.classList.toggle('header-scrolled', window.scrollY > 10);
    }, { passive: true });
}


/* =============================================================================
   UTILIDAD GLOBAL
============================================================================= */
function mostrarError(elemento, mensaje) {
    if (!elemento) return;
    elemento.textContent = mensaje;
    elemento.hidden = false;
    elemento.style.color = '';
}


/* =============================================================================
   REGISTRO MULTI-PASO
============================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('registerForm')) return;

    let currentStep = 1;
    const totalSteps = 3;

    /* ── Navegación entre pasos ─────────────────────────────────────────── */
    function goToStep(n) {
        document.querySelectorAll('.form-step').forEach((s, i) => {
            s.classList.toggle('active', i + 1 === n);
        });
        for (let i = 1; i <= totalSteps; i++) {
            const dot = document.getElementById('dot' + i);
            const line = document.getElementById('line' + i);
            if (dot) {
                dot.classList.toggle('active', i === n);
                dot.classList.toggle('done', i < n);
            }
            if (line) line.classList.toggle('done', i < n);
        }
        currentStep = n;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ── Validación por paso ─────────────────────────────────────────────── */
    function validateStep(n) {
        const step = document.getElementById('step' + n);
        const inputs = step.querySelectorAll('input[required], select[required]');
        let ok = true;
        inputs.forEach(inp => {
            if (!inp.value.trim()) { inp.classList.add('error'); ok = false; }
            else { inp.classList.remove('error'); }
        });
        if (!ok) { showRegError(' Completa todos los campos obligatorios.'); return false; }

        if (n === 2) {
            const pwd = document.getElementById('password').value;
            const pwd2 = document.getElementById('password2').value;
            if (pwd.length < 8) { showRegError(' La contraseña debe tener al menos 8 caracteres.'); return false; }
            if (pwd !== pwd2) { showRegError(' Las contraseñas no coinciden.'); return false; }
        }
        hideRegError();
        return true;
    }

    function showRegError(msg) {
        const el = document.getElementById('errorRegister');
        if (el) { el.textContent = msg; el.hidden = false; }
    }
    function hideRegError() {
        const el = document.getElementById('errorRegister');
        if (el) el.hidden = true;
    }

    /* ── Botones de navegación ───────────────────────────────────────────── */
    document.getElementById('btnNext1')?.addEventListener('click', () => { if (validateStep(1)) goToStep(2); });
    document.getElementById('btnNext2')?.addEventListener('click', () => { if (validateStep(2)) goToStep(3); });
    document.getElementById('btnPrev2')?.addEventListener('click', () => goToStep(1));
    document.getElementById('btnPrev3')?.addEventListener('click', () => goToStep(2));

    /* ── Toggle contraseña en registro ───────────────────────────── */

    document.getElementById('togglePwd')?.addEventListener('click', function () {
        const p1 = document.getElementById('password');
        const p2 = document.getElementById('password2');
        const show = p1?.type === 'password';
        [p1, p2].forEach(p => { if (p) p.type = show ? 'text' : 'password'; });
        this.classList.toggle('fa-eye', !show);
        this.classList.toggle('fa-eye-slash', show);
    });

    /* ── Preview de documentos ───────────────────────────────────────────── */
    function setupUpload(inputId, previewId, imgId, nameId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        const img = document.getElementById(imgId);
        const name = document.getElementById(nameId);
        if (!input) return;

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (name) name.textContent = file.name;
            if (file.type.startsWith('image/') && img) {
                const reader = new FileReader();
                reader.onload = ev => { img.src = ev.target.result; };
                reader.readAsDataURL(file);
                if (preview) preview.classList.add('show');
                img.style.display = 'block';
            } else if (preview) {
                if (img) img.style.display = 'none';
                preview.classList.add('show');
            }
        });
    }

    setupUpload('cedula_frontal', 'previewFrontal', 'imgFrontal', 'nameFrontal');
    setupUpload('cedula_posterior', 'previewPosterior', 'imgPosterior', 'namePosterior');
    setupUpload('selfie_cedula', 'previewSelfie', 'imgSelfie', 'nameSelfie');

    /* ── Drag & drop ─────────────────────────────────────────────────────── */
    document.querySelectorAll('.upload-zone').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            const input = zone.querySelector('input[type="file"]');
            if (file && input) {
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            }
        });
    });

    /* ── Envío del formulario (multipart/form-data) ───────────────────────── */
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!document.getElementById('terminos')?.checked) {
            showRegError('Debes aceptar los términos y condiciones.');
            return;
        }
        if (!document.getElementById('autorizaDatos')?.checked) {
            showRegError('Debes autorizar el tratamiento de datos.');
            return;
        }
        const emailRegistro = document.getElementById('email')?.value.trim() || '';
        if (!esEmailValido(emailRegistro)) {
            showRegError(' Ingresa un correo electrónico válido (ejemplo@correo.com).');
            document.getElementById('email')?.focus();
            return;
        }

        const frontalFile = document.getElementById('cedula_frontal')?.files[0];
        if (!frontalFile) {
            showRegError(' Debes subir la foto frontal de tu cédula.');
            return;
        }

        const btn = document.getElementById('btnRegisterSubmit');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando…';

        try {
            const formData = new FormData();
            formData.append('nombres', document.getElementById('nombres')?.value.trim() || '');
            formData.append('apellidos', document.getElementById('apellidos')?.value.trim() || '');
            formData.append('tipoDoc', document.getElementById('tipoDoc')?.value || '');
            formData.append('documento', document.getElementById('documento')?.value.trim() || '');
            formData.append('fechaNacimiento', document.getElementById('fechaNacimiento')?.value || '');
            formData.append('genero', document.getElementById('genero')?.value || '');
            formData.append('telefono', document.getElementById('telefono')?.value.trim() || '');
            formData.append('email', document.getElementById('email')?.value.trim() || '');
            formData.append('direccion', document.getElementById('direccion')?.value.trim() || '');
            formData.append('ciudad', document.getElementById('ciudad')?.value.trim() || '');
            formData.append('departamento', document.getElementById('departamento')?.value.trim() || '');
            formData.append('ocupacion', document.getElementById('ocupacion')?.value || '');
            formData.append('password', document.getElementById('password')?.value || '');
            formData.append('autorizaDatos', 'true');

            formData.append('cedula_frontal', frontalFile);
            const posterior = document.getElementById('cedula_posterior')?.files[0];
            if (posterior) formData.append('cedula_posterior', posterior);
            const selfie = document.getElementById('selfie_cedula')?.files[0];
            if (selfie) formData.append('selfie_cedula', selfie);

            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                sessionStorage.setItem('registerSuccess',
                    data.mensaje || 'Registro exitoso. Ya puedes iniciar sesión.');
                window.location.href = 'login.html';
            } else {
                const msg = data.mensaje || Object.values(data).join(' | ');
                showRegError('❌ ' + msg);
            }
        } catch {
            showRegError(' Error al conectar con el servidor.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Registrarse';
        }
    });

    /* Zonas de carga de archivo: data-trigger="idDelInput" abre el input
       de tipo file asociado, sin necesidad de onclick en el HTML. */
    document.querySelectorAll('[data-trigger]').forEach(zona => {
        zona.addEventListener('click', () => {
            document.getElementById(zona.dataset.trigger)?.click();
        });
    });
});