# Copias de seguridad

## Dónde se guardan

Por defecto, las copias se guardan en:

- `backups/`

Archivo origen:

- `data/fabriq-erp.db`

Formato de nombre:

- `fabriq-erp-YYYYMMDD-HHMMSS.db`

Ejemplo:

- `fabriq-erp-20260412-214500.db`

## Cómo ejecutar un backup manual

Desde la carpeta del proyecto:

```powershell
npm run backup:db
```

O directamente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
```

## Cómo cambiar la ruta a una carpeta cloud

Tienes tres opciones, en este orden de prioridad:

1. Pasar la ruta al script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1 -DestinationPath "C:\Users\mateo\OneDrive\ERP-backups"
```

2. Definir la variable de entorno de Windows:

```powershell
setx ERP_BACKUP_DESTINATION "C:\Users\mateo\OneDrive\ERP-backups"
```

3. Crear un archivo local `backup.config.json` a partir de [`backup.config.example.json`](C:/Users/mateo/Documents/New%20project/web/backup.config.example.json).

Ejemplo:

```json
{
  "destinationPath": "C:\\Users\\mateo\\OneDrive\\ERP-backups",
  "retentionDays": 7
}
```

No hace falta guardar credenciales en el proyecto. Si la carpeta cloud requiere que hayas iniciado sesion, ese paso lo haces tu una sola vez en Windows o en la app de sincronizacion.

## Retención

El script mantiene varias copias y aplica esta politica simple:

- conserva los backups de los ultimos 7 dias
- nunca borra el backup mas reciente

Puedes cambiarlo con:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1 -RetentionDays 14
```

## Cómo programarlo cada día en Windows

Comando listo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-backup-task.ps1
```

Ejemplo para OneDrive a las 22:00:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-backup-task.ps1 -RunTime "22:00" -DestinationPath "C:\Users\mateo\OneDrive\ERP-backups" -RetentionDays 7
```

Esto crea una tarea programada diaria en Windows usando el script de backup.

## Cómo restaurar una copia

1. Cierra la app si esta usando la base.
2. Haz una copia de seguridad adicional del archivo actual, si existe.
3. Copia el backup deseado sobre:

- `data/fabriq-erp.db`

Ejemplo:

```powershell
Copy-Item "C:\ruta\al\backup\fabriq-erp-20260412-214500.db" "C:\Users\mateo\Documents\New project\web\data\fabriq-erp.db" -Force
```

4. Arranca la app con `npm run dev`.

## Qué hacer si el backup falla

- Comprueba que `data/fabriq-erp.db` existe.
- Comprueba que la carpeta destino es accesible y tiene espacio.
- Si la base esta bloqueada por otro proceso, vuelve a lanzar el backup en un momento estable o con la app cerrada.
- Si usas una carpeta cloud, verifica que OneDrive o el proveedor correspondiente este sincronizando correctamente.

## Protección adicional

- No se ha añadido ningun boton de reset o borrado sensible a la UI.
- Las copias se crean en archivos nuevos con timestamp; no se sobrescribe siempre el mismo archivo.
- Si en el futuro se exponen acciones destructivas, lo recomendable es protegerlas con autenticacion, roles y confirmaciones explicitas fuera de la UI publica.
