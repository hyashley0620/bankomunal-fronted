# Bankomunal

Sistema web de gestión de fondos comunitarios (bancos comunales) que permite a un grupo de socios administrar aportes, préstamos solidarios, metas de ahorro, encuestas de grupo, reuniones y comunicación, con un panel administrativo completo.

# Bankomunal — Frontend

Interfaz web del sistema de gestión de fondos comunitarios **Bankomunal**, construida con HTML, CSS y JavaScript puro (sin frameworks).

> El backend (API REST en Spring Boot) de este proyecto vive en un repositorio aparte: [bankomunal-backend](https://github.com/hyashley0620/bankomunal-backend).

## Tecnologías

- HTML5, CSS3 y JavaScript vanilla
- jsPDF (generación de PDF)
- QRCode.js
- Font Awesome
- SockJS / Stomp.js (consumo de WebSocket para notificaciones y chat en tiempo real)

## Estructura del proyecto

```
frontend/
├── *.html            # 32 páginas (login, registro, panel de socio y de administrador)
├── css/
├── js/
│   ├── core.js        # utilidades base, sidebar, tema
│   ├── api.js          # cliente HTTP hacia el backend
│   ├── app.js
│   ├── i18n.js          # internacionalización ES/EN
│   └── ...             # un módulo JS por sección (finanzas, educacion, comunidad, etc.)
└── assets/
```

## Funcionalidades

- Login, registro y recuperación de contraseña
- Panel de socio: cuentas, transferencias, pagos, tarjeta virtual, préstamos, metas de ahorro, simulador de crédito, historial y reportes
- Panel de administrador: gestión de usuarios y roles, límites de transacción, salud financiera, respaldo y recuperación, auditoría
- Comunidad: grupos, publicaciones, encuestas/votaciones y reuniones con actas
- Educación financiera con cursos y certificados descargables
- Notificaciones y chat de soporte en tiempo real
- Interfaz responsive y con soporte de idioma ES/EN

## Requisitos previos

- Un servidor estático para servir los archivos, por ejemplo la extensión **Live Server** de VS Code
- El backend de Bankomunal corriendo (ver repositorio `bankomunal-backend`)

## Instalación y ejecución local

### 1. Clonar el repositorio

```bash
git clone https://github.com/hyashley0620/bankomunal-frontend.git
cd bankomunal-frontend
```

### 2. Configurar la URL de la API

`js/api.js` apunta por defecto a `http://localhost:8080`. Si tu backend corre en otra URL o puerto, actualiza esa constante antes de servir el frontend.

### 3. Servir los archivos

Abre la carpeta con **Live Server** (puerto recomendado `5500`) o cualquier servidor estático, y entra a `login.html`.

> El backend ya tiene habilitado CORS para `http://localhost:5500` y `http://127.0.0.1:5500`. Si usas otro puerto, deberás agregarlo en la configuración de CORS del backend.

## Autor

** Wendy Hyashley Duarte Contreras **
Tecnología en Análisis y Desarrollo de Software (ADSO) — SENA