# Despliegue V2 con Turso y Vercel

Este documento deja la V2 preparada para desplegarse sin cambiar la UX, las pantallas ni la logica de negocio.

## 1. Resumen tecnico

- Desarrollo local sin variables: la app usa `data/fabriq-erp.db`
- Produccion o Vercel: la app exige `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`
- Si la base remota esta vacia, la app crea solo el schema
- No existen seeds automaticos ni datos demo

## 2. Pasos manuales en Turso

1. Crear cuenta o iniciar sesion.
2. Instalar la CLI si quieres trabajar desde terminal.
3. Autenticarse:

```bash
turso auth login
```

4. Crear la base:

```bash
turso db create fabriq-flow-v2
```

5. Obtener la URL de conexion:

```bash
turso db show fabriq-flow-v2
```

6. Crear un token:

```bash
turso db tokens create fabriq-flow-v2
```

Variables que debes guardar:

- `TURSO_DATABASE_URL`
  Formato esperado: `libsql://<database>-<org>.turso.io`
- `TURSO_AUTH_TOKEN`
  Token generado para esa base
- `APP_BASE_URL`
  URL publica de la app, por ejemplo `https://tu-app.vercel.app`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  Credenciales SMTP para enviar emails de recuperacion de contrasena.

## 3. Pasos manuales en Vercel

### Opcion A: dos proyectos separados

- Proyecto 1: rama `main` para la V1
- Proyecto 2: rama `v2-dev` para la V2

### Opcion B: un proyecto con produccion + preview

- `main` como rama de produccion
- `v2-dev` como rama de preview

Pasos:

1. Conectar el repositorio en Vercel.
2. Crear el proyecto.
3. En `Settings > Environment Variables`, cargar:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
4. Si usas dos proyectos, repetir el proceso para cada uno.
5. Si usas un solo proyecto, dejar `main` como produccion y empujar `v2-dev` para previews.

## 4. Variables de entorno exactas

Copiar en Vercel:

```text
TURSO_DATABASE_URL=libsql://tu-base-tu-organizacion.turso.io
TURSO_AUTH_TOKEN=tu-token-de-turso
APP_BASE_URL=https://tu-app.vercel.app
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_USER=usuario-smtp
SMTP_PASS=password-smtp
SMTP_FROM=Eli Print 3D <no-reply@tu-dominio.com>
```

Opcional en local:

```text
ERP_BACKUP_DESTINATION=C:\Users\mateo\OneDrive\ERP-backups
```

## 5. Recuperacion de usuarios y roles

Las contrasenas no se guardan en claro y no se pueden leer. Si alguien pierde acceso, se debe resetear la contrasena o recuperar un administrador.

Para operar contra la base local:

```bash
npm run users:list -- --local
npm run users:roles
npm run users:reset-password -- --local elisolete1234@gmail.com NuevaPassword123
npm run users:recover-admin -- --local elisolete1234@gmail.com NuevaPassword123 Eli
```

Para operar contra la base remota de Vercel/Turso, primero carga estas variables en tu terminal:

```bash
TURSO_DATABASE_URL=libsql://tu-base-tu-organizacion.turso.io
TURSO_AUTH_TOKEN=tu-token-de-turso
```

Luego usa:

```bash
npm run users:list -- --remote
npm run users:reset-password -- --remote elisolete1234@gmail.com NuevaPassword123
npm run users:recover-admin -- --remote elisolete1234@gmail.com NuevaPassword123 Eli
npm run users:set-role -- --remote usuario@email.com ADMIN
```

`recover-admin` crea el usuario si no existe; si ya existe, lo activa, le pone rol `ADMIN`, cambia la contrasena e invalida sesiones anteriores.

## 6. Como usar despues V1 y V2

### V1 estable

```bash
git checkout main
npm install
npm run dev
```

### V2

```bash
git checkout v2-dev
npm install
npm run dev
```

### Despliegue separado mas adelante

- V1: desplegar `main`
- V2: desplegar `v2-dev`

## 7. Notas importantes

- SQLite local no es adecuado para Vercel porque el sistema de archivos del runtime no es persistente entre ejecuciones.
- Turso si aporta persistencia online y acceso multiusuario.
- La migracion realizada toca solo la capa de persistencia.
- La V2 debe verse y comportarse igual que antes a nivel visual y funcional.
