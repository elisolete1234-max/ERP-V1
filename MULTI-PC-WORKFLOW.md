# Flujo de trabajo profesional multi-PC

Este proyecto queda preparado para trabajar desde varios PCs usando Git como fuente de verdad del codigo.

OneDrive debe usarse solo como copia de seguridad de archivos locales, especialmente de backups de la base de datos, y no como mecanismo de sincronizacion en vivo del proyecto mientras se desarrolla.

## 1. Principios del flujo

- El codigo vive en Git.
- Cada PC tiene su propia copia local del repositorio.
- Cada PC instala sus propias dependencias.
- Cada PC genera sus propios artefactos temporales (`node_modules`, `.next`, caches, logs).
- La base local `data/fabriq-erp.db` es local a cada entorno y no se versiona.
- Las copias de seguridad pueden guardarse fuera del repo, por ejemplo en OneDrive.

## 2. Que NO debe sincronizarse entre PCs

No uses sincronizacion en vivo de OneDrive sobre la carpeta de trabajo activa del repo mientras ejecutas la app.

Elementos locales que no deben versionarse ni compartirse por sincronizacion en caliente:

- `node_modules/`
- `.next/`
- `.npm-cache/`
- `.test-dist/`
- `data/*.db`
- `backups/*`
- `.env`
- logs, caches y temporales

## 3. Arranque en un PC nuevo

1. Instalar Node.js 24 y Git.
2. Clonar el repositorio en una carpeta local normal, fuera de una carpeta sincronizada en vivo.
3. Entrar en `web/`.
4. Instalar dependencias:

```powershell
npm install
```

5. Crear el archivo de entorno local a partir de `.env.example` si necesitas variables remotas:

```powershell
Copy-Item .env.example .env
```

6. Arrancar en desarrollo:

```powershell
npm run dev
```

## 4. Flujo diario recomendado

Al empezar:

```powershell
git pull
npm install
```

Durante el trabajo:

```powershell
git checkout -b nombre-de-tu-rama
```

Verificaciones antes de subir cambios:

```powershell
npm run lint
npm test
npm run build
```

Publicar cambios:

```powershell
git add .
git commit -m "Tu mensaje"
git push
```

## 5. Uso correcto de OneDrive

Uso recomendado:

- guardar exportaciones o documentos
- guardar backups de la base local
- mantener una copia historica fuera del repo

Uso no recomendado:

- abrir el mismo repo activo desde varios PCs con sincronizacion en vivo
- confiar en OneDrive para unir cambios de codigo
- compartir la base SQLite activa entre maquinas

## 6. Base de datos local y backups

- Desarrollo local: `data/fabriq-erp.db`
- Backups locales del proyecto: `backups/`
- Destino externo recomendado para backup: carpeta aparte en OneDrive u otro almacenamiento

Ejemplo de backup manual:

```powershell
npm run backup:db
```

Si quieres enviar backups a OneDrive, usa una carpeta externa al repo con `ERP_BACKUP_DESTINATION` o `backup.config.json`.

## 7. Preparado para crecer

Esta base queda lista para:

- trabajo por ramas
- commits y merges limpios
- despliegues futuros
- refactors incrementales
- separacion entre codigo versionado y datos locales
