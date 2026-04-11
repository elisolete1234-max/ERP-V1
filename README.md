# Fabriq Flow ERP V1

## Estado del proyecto

Version: `v1.0.0` (estable)

Incluye:

- ERP completa funcional
- Inventario de materiales y producto terminado
- Sistema de pedidos, fabricacion y facturacion
- Control de impresoras
- UX optimizada
- Diseno visual tipo SaaS
- Tests y validaciones completas

Estado:

Proyecto estable, listo para demostracion y evolucion futura (V2).

---

ERP demo funcional para un negocio de impresion 3D. Esta V1 permite gestionar clientes, materiales, productos, pedidos, fabricacion, inventario, impresoras, movimientos y facturacion con logica real de negocio, datos semilla y simulaciones completas.

La version actual queda cerrada como V1 estable:

- sin cambios grandes pendientes
- con logica de negocio centralizada
- con UX consolidada
- con diseno visual estable
- lista para demo, validacion con usuarios o evolucion posterior

---

## 1. Descripcion general

Fabriq Flow cubre el flujo principal del negocio desde que entra un pedido hasta que se valida el stock, se decide si sale de inventario terminado o si hay que fabricar, se asigna impresora, se consumen materiales, se entrega y finalmente se factura.

Objetivos de esta V1:

- demo local sencilla de ejecutar
- logica funcional, no solo pantallas
- trazabilidad visible del proceso
- base clara para evolucionar a una V2

---

## 2. Arquitectura actual

### Stack

- Frontend: Next.js 16 App Router
- Backend: Server Actions de Next.js
- UI: React 19 + Tailwind CSS 4 + estilos propios
- Base de datos: SQLite local mediante `node:sqlite`
- Tests: Node test runner + TypeScript

### Principios de arquitectura

- Una sola fuente de verdad de negocio en [`lib/erp-service.ts`](./lib/erp-service.ts)
- Acciones de servidor en [`app/actions.ts`](./app/actions.ts) para disparar operaciones desde la UI
- Persistencia local en [`lib/db.ts`](./lib/db.ts) con creacion y migracion automatica de la base
- Interfaz principal en [`app/page.tsx`](./app/page.tsx)
- Componentes de tabla inline en [`app/components/editable-tables.tsx`](./app/components/editable-tables.tsx)
- Sistema visual y UX en [`app/globals.css`](./app/globals.css) y [`app/components/form-ui.tsx`](./app/components/form-ui.tsx)

### Base de datos

La base se crea automaticamente en:

- `data/fabriq-erp.db`

No hace falta instalar un servidor externo de base de datos.

---

## 3. Modulos principales

La V1 incluye estos modulos:

1. Clientes
2. Materiales / filamentos
3. Productos
4. Pedidos
5. Lineas de pedido
6. Ordenes de fabricacion
7. Inventario de materiales
8. Inventario de productos terminados
9. Impresoras
10. Movimientos de inventario
11. Facturas
12. Dashboard y simulacion de escenarios

---

## 4. Flujo principal de negocio

Flujo operativo implementado:

`cliente -> producto -> pedido -> validacion de stock -> uso de stock terminado o fabricacion -> consumo de materiales -> actualizacion de inventario -> entrega -> factura`

### Comportamiento principal

1. Se crea un pedido con una o varias lineas.
2. Al confirmar el pedido:
   - el sistema intenta usar primero stock de producto terminado
   - si no es suficiente, calcula la parte a fabricar
   - si faltan materiales, bloquea el pedido con incidencia
3. Si hay material suficiente:
   - crea ordenes de fabricacion
   - asigna impresoras disponibles
4. Al completar fabricacion:
   - descuenta materiales
   - registra movimientos
   - actualiza producto terminado cuando corresponde
   - acumula horas y coste de impresora
5. Cuando el pedido queda listo:
   - puede entregarse
6. Una vez entregado:
   - puede generarse la factura

### Escenarios demo implementados

La demo funcional genera y muestra escenarios como:

- pedido normal con stock y material suficiente
- falta de stock de materiales
- reposicion y continuacion del pedido bloqueado
- pedido servido completamente desde producto terminado
- flujo mixto: parte desde stock terminado y parte fabricada

---

## 5. Logica critica implementada

### Inventario

- inventario de materiales en gramos
- inventario de productos terminados en unidades
- movimientos trazables de entrada, salida y ajuste

### Priorizacion de stock

- primero usa stock de productos terminados
- despues fabrica solo lo que falte
- la fabricacion consume materiales

### Impresoras

- una impresora solo puede tener una orden activa
- registro de horas de uso acumuladas
- calculo de coste de impresora por tiempo

### Costes

La V1 usa una logica coherente de coste:

`coste_total = coste_material + coste_electricidad + coste_impresora`

Se evita duplicar el calculo en varias capas.

### Trazabilidad

Se conserva trazabilidad en:

- historial de estados del pedido
- movimientos de inventario
- ordenes de fabricacion
- simulacion de escenarios
- relacion pedido / linea / fabricacion / factura

---

## 6. Validaciones clave

La V1 incorpora validaciones reales de negocio. Entre las mas importantes:

- no permitir cantidades negativas
- no permitir stock negativo
- no permitir movimientos de inventario con cantidad `0`
- no permitir modificar stock de materiales por fuera de movimientos registrados
- no permitir crear productos sin material principal
- no permitir fabricar sin materiales suficientes
- no permitir completar fabricacion sin haberla iniciado correctamente
- no permitir completar fabricacion sin impresora asignada
- no permitir dos ordenes activas en la misma impresora
- no permitir estados manuales incoherentes en fabricacion
- no permitir editar pedidos que ya estan logicamente cerrados o lanzados a produccion
- no permitir entregar pedidos incompletos
- no permitir facturar pedidos no entregados
- no permitir duplicar salidas netas de stock al reconfirmar pedidos

---

## 7. Tests disponibles

Los tests principales estan en:

- [`tests/erp-flow.test.ts`](./tests/erp-flow.test.ts)

Cobertura actual:

- uso completo de stock terminado sin fabricar
- reconfirmacion sin duplicar salidas netas
- flujo mixto stock terminado + fabricacion
- bloqueo correcto por falta de materiales
- consumo correcto de materiales al fabricar
- registro correcto de movimientos de inventario
- proteccion frente a stock negativo
- proteccion frente a movimientos con cantidad cero
- bloqueo de modificacion manual indebida de stock
- restriccion de una sola orden activa por impresora
- asignacion correcta de impresoras
- acumulacion correcta de horas y coste por impresora
- transiciones correctas de estado del pedido
- facturacion solo cuando procede
- ejecucion de la demo completa con trazabilidad

Comandos de verificacion:

```bash
npm test
npm run lint
npm run build
```

---

## 8. Instrucciones para arrancar el proyecto

### Requisitos

- Node.js 24 recomendado
- npm

### Instalacion

```bash
npm install
```

### Desarrollo local

```bash
npm run dev
```

Abrir:

```text
http://localhost:3000
```

### Build de produccion local

```bash
npm run build
npm start
```

### Que probar rapidamente

- `Cargar datos de ejemplo`
  Crea datos iniciales para navegar la app.

- `Ejecutar demo`
  Ejecuta los escenarios de negocio con trazabilidad visible.

---

## 9. Estructura de carpetas

Estructura relevante de la V1:

```text
web/
|-- app/
|   |-- actions.ts
|   |-- globals.css
|   |-- layout.tsx
|   |-- page.tsx
|   `-- components/
|       |-- editable-tables.tsx
|       `-- form-ui.tsx
|-- data/
|   `-- fabriq-erp.db
|-- lib/
|   |-- db.ts
|   `-- erp-service.ts
|-- tests/
|   `-- erp-flow.test.ts
|-- types/
|   `-- node-sqlite.d.ts
|-- package.json
|-- tsconfig.json
|-- tsconfig.tests.json
`-- README.md
```

### Notas sobre carpetas auxiliares

- `.next/` y `.test-dist/` son generadas automaticamente
- `node_modules/` contiene dependencias
- `prisma/` puede seguir presente en el repo por arrastre historico, pero no forma parte de la arquitectura activa de esta V1

---

## 10. Decisiones de UX y diseno

La V1 ya incluye una capa de UX y diseno visual estable:

- navegacion orientada a la operativa diaria
- accesos rapidos a tareas frecuentes
- acciones inline en tablas y listas
- estados y badges coherentes
- tablas con scroll interno y cabecera fija
- resaltado visual discreto para incidencias reales
- estilo visual tipo SaaS moderno y profesional

Objetivo: que la herramienta sea clara, rapida y presentable sin sacrificar la logica.

---

## 11. Limitaciones conocidas

Limitaciones actuales de la V1:

- `node:sqlite` sigue siendo experimental en Node 24 y muestra warning, aunque funciona correctamente
- la app esta pensada para uso local y demo, no para despliegue multiusuario real
- no hay autenticacion ni sistema de roles
- no hay exportacion a PDF o CSV
- no hay control avanzado de concurrencia para edicion simultanea
- el dashboard esta orientado a operativa, no a analitica profunda
- la simulacion es funcional y trazable, pero no sustituye un motor de planificacion industrial completo

---

## 12. Mejoras futuras propuestas para V2

Siguientes pasos recomendados para una V2:

### Producto y negocio

- autenticacion y permisos por rol
- multiusuario real
- clientes, proveedores y contactos mas detallados
- presupuestos previos a pedido
- cobros y vencimientos mas completos

### Operaciones

- planificacion de carga por impresora y calendario
- estimaciones de capacidad y plazos
- compras a proveedor desde alertas de stock
- lotes o trazabilidad mas granular de materiales
- incidencias operativas con seguimiento estructurado

### Datos y reporting

- exportacion PDF/CSV
- informes de rentabilidad
- KPIs historicos
- analitica de produccion, margen y ocupacion de impresoras

### UX y producto

- buscador global
- filtros avanzados
- ordenacion por columna en tablas
- acciones bulk
- vistas especializadas por perfil operativo

### Tecnico

- backend o API separable si se evoluciona fuera de Next Server Actions
- estrategia de migraciones mas formal
- despliegue con persistencia real para entornos compartidos
- auditoria mas avanzada por usuario y accion

---

## 13. Estado actual de esta V1

Esta version se considera:

- V1 estable
- funcional de extremo a extremo
- validada con tests, lint y build
- apta para demo, presentacion o continuacion futura

Ultima verificacion de esta V1:

```bash
npm run lint
npm run build
npm test
```

---

## 14. Resumen rapido

Fabriq Flow ERP V1 es una demo local profesional de un ERP para impresion 3D con:

- logica real de negocio
- inventario dual: materiales y producto terminado
- fabricacion con impresoras
- trazabilidad
- facturacion
- simulacion de escenarios
- UI presentable y estable

Sirve tanto para ensenar el proyecto como para retomarlo mas adelante sin perder contexto.
