# calculoptachapero

Calcula distancia entre puerta y usuario usando el orden visual real del chapero.

Reglas aplicadas:
- Normaliza chapas a formato `7xxxx` (ejemplo `2683` -> `72683`).
- Distancia por posicion en chapero (no por diferencia numerica).
- Cuenta solo chapas no contratadas (gris).

## Instalacion
- `npm install`
- `npx playwright install chromium`

## Login
- `npm run login`
- Resuelve Cloudflare + login y pulsa Enter en consola.

## Interfaz web
- `npm start`
- Abre `http://localhost:3088`
- Introduce la chapa y pulsa calcular.

## CLI
- `npm run cli -- --chapa 2683 --manual`

`--manual` sirve cuando el portal no abre el chapero automaticamente. El script te pedira que lo abras y pulses Enter.

## Extension Chrome (recomendado para usuarios)
- Carpeta: `extension`
- Carga local:
1. Abre `chrome://extensions`
2. Activa `Modo desarrollador`
3. `Cargar descomprimida`
4. Selecciona `C:\Users\adria\Proyectos _IA\calculoptachapero\extension`
- Uso:
1. Inicia sesion en `https://portal.cpevalencia.com/`
2. Abre `Chapero por especialidades`
3. Pulsa el icono de la extension
4. Introduce chapa (ej. `2683`) y pulsa `Calcular`

## Despliegue en Internet (sin depender de tu PC)
Este proyecto **no es apto para Vercel** tal como esta porque usa Playwright con perfil de sesion persistente.

Si quieres un enlace publico estable, despliega como contenedor en Render/Railway/Fly/VPS.

### Variables de entorno
- `PORT` (lo asigna la plataforma; por defecto `3088`)
- `AUTH_PROFILE_DIR` (por defecto `/app/.auth/chrome-profile` en Docker)
- `PLAYWRIGHT_HEADLESS=true` para servidor
- `PLAYWRIGHT_CHANNEL=none` para usar Chromium incluido en la imagen

### Opcion recomendada: Render (Docker)
1. Sube este repo a GitHub.
2. En Render, crea `New +` -> `Web Service` -> conecta el repo.
3. Render detectara `Dockerfile` (incluido en este repo).
4. Despliega y abre `https://tu-servicio.onrender.com/api/health` para comprobar estado.

### Sesion/login en servidor
El scraper necesita un perfil logueado en CPE (`.auth/chrome-profile`).
Sin ese perfil, `/api/calculate` devolvera error de sesion.

Para hacerlo robusto en produccion, necesitas una estrategia de autenticacion de backend (no interactiva) o una aproximacion cliente (extension/app del usuario).
