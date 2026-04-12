import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type GlobalDb = typeof globalThis & {
  fabriqDb?: DatabaseSync;
};

const globalDb = globalThis as GlobalDb;

function hasColumn(database: DatabaseSync, table: string, column: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  if (!hasColumn(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function backfillCodes(database: DatabaseSync, table: string, prefix: string, orderBy = "rowid ASC") {
  const rows = database
    .prepare(`SELECT id FROM ${table} WHERE codigo IS NULL OR codigo = '' ORDER BY ${orderBy}`)
    .all() as Array<{ id: string }>;
  const currentMax = database
    .prepare(`SELECT codigo FROM ${table} WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`)
    .get(`${prefix}%`) as { codigo?: string } | undefined;
  const base = currentMax?.codigo ? Number(String(currentMax.codigo).replace(prefix, "")) || 0 : 0;

  rows.forEach((item, index) => {
    const code = `${prefix}${String(base + index + 1).padStart(3, "0")}`;
    database.prepare(`UPDATE ${table} SET codigo = ? WHERE id = ?`).run(code, item.id);
  });
}

function nextCodeFromDatabase(database: DatabaseSync, table: string, prefix: string) {
  const result = database
    .prepare(`SELECT codigo FROM ${table} WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`)
    .get(`${prefix}%`) as { codigo?: string } | undefined;
  const current = result?.codigo ?? `${prefix}000`;
  const numeric = Number(String(current).replace(prefix, "")) || 0;
  return `${prefix}${String(numeric + 1).padStart(3, "0")}`;
}

function ensureIndexes(database: DatabaseSync) {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_codigo ON customers(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_codigo ON materials(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_codigo ON products(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_codigo ON orders(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_lines_codigo ON order_lines(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturing_orders_codigo ON manufacturing_orders(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_codigo ON stock_movements(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_codigo ON invoices(codigo);
  `);
}

function ensureMaterialMovementBaselines(database: DatabaseSync) {
  const materials = database.prepare(
    `SELECT id, codigo, stock_actual_g FROM materials ORDER BY rowid ASC`,
  ).all() as Array<{ id: string; codigo: string | null; stock_actual_g: number }>;

  for (const material of materials) {
    const movementCount = database
      .prepare(`SELECT COUNT(*) AS total FROM stock_movements WHERE material_id = ?`)
      .get(material.id) as { total: number } | undefined;

    if ((movementCount?.total ?? 0) === 0 && material.stock_actual_g > 0) {
      database.prepare(
        `INSERT INTO stock_movements
          (id, codigo, material_id, tipo, cantidad_g, motivo, referencia, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        nextCodeFromDatabase(database, "stock_movements", "MOV-"),
        material.id,
        "ENTRADA",
        Math.round(material.stock_actual_g),
        "Stock inicial migrado a movimientos",
        "MIGRACION_V2",
        new Date().toISOString(),
      );
    }

    const recalculatedStock = database.prepare(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN tipo = 'ENTRADA' THEN cantidad_g
             WHEN tipo = 'SALIDA' THEN -cantidad_g
             ELSE 0
           END
         ), 0) AS total
       FROM stock_movements
       WHERE material_id = ?`,
    ).get(material.id) as { total: number } | undefined;

    database.prepare(
      `UPDATE materials SET stock_actual_g = ? WHERE id = ?`,
    ).run(Math.round(recalculatedStock?.total ?? 0), material.id);
  }
}

function migrateDatabase(database: DatabaseSync) {
  ensureColumn(database, "customers", "codigo", "TEXT");
  ensureColumn(database, "materials", "codigo", "TEXT");
  ensureColumn(database, "materials", "tipo_color", "TEXT");
  ensureColumn(database, "materials", "efecto", "TEXT");
  ensureColumn(database, "materials", "color_base", "TEXT");
  ensureColumn(database, "materials", "nombre_comercial", "TEXT");
  ensureColumn(database, "materials", "diametro_mm", "REAL");
  ensureColumn(database, "materials", "peso_spool_g", "INTEGER");
  ensureColumn(database, "materials", "temp_extrusor", "INTEGER");
  ensureColumn(database, "materials", "temp_cama", "INTEGER");
  ensureColumn(database, "materials", "notas", "TEXT");
  ensureColumn(database, "products", "codigo", "TEXT");
  ensureColumn(database, "products", "coste_maquina", "REAL DEFAULT 0");
  ensureColumn(database, "products", "coste_mano_obra", "REAL DEFAULT 0");
  ensureColumn(database, "products", "coste_postprocesado", "REAL DEFAULT 0");
  ensureColumn(database, "order_lines", "codigo", "TEXT");
  ensureColumn(database, "order_lines", "cantidad_desde_stock", "INTEGER DEFAULT 0");
  ensureColumn(database, "order_lines", "cantidad_a_fabricar", "INTEGER DEFAULT 0");
  ensureColumn(database, "order_lines", "coste_impresora_total", "REAL DEFAULT 0");
  ensureColumn(database, "order_lines", "precio_total_linea", "REAL DEFAULT 0");
  ensureColumn(database, "orders", "estado_pago", "TEXT DEFAULT 'NO_FACTURADO'");
  ensureColumn(database, "orders", "coste_total_pedido", "REAL DEFAULT 0");
  ensureColumn(database, "orders", "beneficio_total", "REAL DEFAULT 0");
  ensureColumn(database, "stock_movements", "codigo", "TEXT");
  ensureColumn(database, "manufacturing_orders", "impresora_id", "TEXT");
  ensureColumn(database, "manufacturing_orders", "coste_impresora_total", "REAL DEFAULT 0");
  ensureColumn(database, "manufacturing_orders", "tiempo_estimado_horas", "REAL");
  ensureColumn(database, "finished_product_inventory", "unidades_stock", "INTEGER DEFAULT 0");
  ensureColumn(database, "finished_product_inventory", "unidades_reservadas", "INTEGER DEFAULT 0");
  ensureColumn(database, "finished_product_inventory", "unidades_disponibles", "INTEGER DEFAULT 0");
  ensureIndexes(database);
  backfillCodes(database, "customers", "CLI-", "fecha_creacion ASC");
  backfillCodes(database, "materials", "MAT-", "fecha_actualizacion ASC");
  backfillCodes(database, "products", "PRO-", "nombre ASC");
  backfillCodes(database, "orders", "PED-", "fecha_pedido ASC");
  backfillCodes(database, "order_lines", "LIN-", "rowid ASC");
  backfillCodes(database, "manufacturing_orders", "OF-", "rowid ASC");
  backfillCodes(database, "stock_movements", "MOV-", "fecha ASC");
  backfillCodes(database, "invoices", "FAC-", "fecha ASC");
  ensureMaterialMovementBaselines(database);
}

function createDatabase() {
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const database = new DatabaseSync(path.join(dataDir, "fabriq-erp.db"));
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      codigo TEXT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      fecha_creacion TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      codigo TEXT,
      nombre TEXT NOT NULL,
      marca TEXT NOT NULL,
      tipo TEXT NOT NULL,
      color TEXT NOT NULL,
      tipo_color TEXT,
      efecto TEXT,
      color_base TEXT,
      nombre_comercial TEXT,
      diametro_mm REAL,
      peso_spool_g INTEGER,
      temp_extrusor INTEGER,
      temp_cama INTEGER,
      precio_kg REAL NOT NULL,
      stock_actual_g INTEGER NOT NULL,
      stock_minimo_g INTEGER NOT NULL,
      proveedor TEXT,
      notas TEXT,
      fecha_actualizacion TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      codigo TEXT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      enlace_modelo TEXT,
      gramos_estimados INTEGER NOT NULL,
      tiempo_impresion_horas REAL NOT NULL,
      coste_electricidad REAL NOT NULL,
      coste_maquina REAL NOT NULL DEFAULT 0,
      coste_mano_obra REAL NOT NULL DEFAULT 0,
      coste_postprocesado REAL NOT NULL DEFAULT 0,
      margen REAL NOT NULL,
      pvp REAL NOT NULL,
      material_id TEXT NOT NULL,
      activo INTEGER NOT NULL,
      FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      cliente_id TEXT NOT NULL,
      fecha_pedido TEXT NOT NULL,
      estado TEXT NOT NULL,
      estado_pago TEXT NOT NULL DEFAULT 'NO_FACTURADO',
      subtotal REAL NOT NULL,
      iva REAL NOT NULL,
      total REAL NOT NULL,
      coste_total_pedido REAL NOT NULL DEFAULT 0,
      beneficio_total REAL NOT NULL DEFAULT 0,
      observaciones TEXT,
      escenario_demo TEXT,
      FOREIGN KEY(cliente_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS order_lines (
      id TEXT PRIMARY KEY,
      codigo TEXT,
      pedido_id TEXT NOT NULL,
      producto_id TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      cantidad_desde_stock INTEGER NOT NULL DEFAULT 0,
      cantidad_a_fabricar INTEGER NOT NULL DEFAULT 0,
      precio_unitario REAL NOT NULL,
      precio_total_linea REAL NOT NULL DEFAULT 0,
      gramos_totales INTEGER NOT NULL,
      coste_material REAL NOT NULL,
      coste_electricidad_total REAL NOT NULL,
      coste_impresora_total REAL NOT NULL DEFAULT 0,
      coste_total REAL NOT NULL,
      beneficio REAL NOT NULL,
      FOREIGN KEY(pedido_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(producto_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS manufacturing_orders (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      pedido_id TEXT NOT NULL,
      linea_pedido_id TEXT NOT NULL,
      producto_id TEXT NOT NULL,
      impresora_id TEXT,
      cantidad INTEGER NOT NULL,
      estado TEXT NOT NULL,
      tiempo_estimado_horas REAL,
      fecha_inicio TEXT,
      fecha_fin TEXT,
      gramos_consumidos INTEGER,
      tiempo_real_horas REAL,
      coste_impresora_total REAL DEFAULT 0,
      incidencia TEXT,
      FOREIGN KEY(pedido_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY(linea_pedido_id) REFERENCES order_lines(id) ON DELETE CASCADE,
      FOREIGN KEY(producto_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      codigo TEXT,
      material_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      cantidad_g INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      referencia TEXT NOT NULL,
      fecha TEXT NOT NULL,
      FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      pedido_id TEXT NOT NULL UNIQUE,
      cliente_id TEXT NOT NULL,
      fecha TEXT NOT NULL,
      subtotal REAL NOT NULL,
      iva REAL NOT NULL,
      total REAL NOT NULL,
      estado_pago TEXT NOT NULL,
      FOREIGN KEY(pedido_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(cliente_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      pedido_id TEXT NOT NULL,
      estado TEXT NOT NULL,
      nota TEXT NOT NULL,
      fecha TEXT NOT NULL,
      FOREIGN KEY(pedido_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS demo_runs (
      id TEXT PRIMARY KEY,
      ejecutado_en TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demo_scenario_results (
      id TEXT PRIMARY KEY,
      demo_run_id TEXT NOT NULL,
      codigo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      cliente TEXT NOT NULL,
      pedido_codigo TEXT NOT NULL,
      productos TEXT NOT NULL,
      material TEXT NOT NULL,
      stock_inicial_g INTEGER NOT NULL,
      gramos_requeridos INTEGER NOT NULL,
      validacion_stock TEXT NOT NULL,
      orden_fabricacion TEXT,
      materiales_consumidos TEXT,
      stock_final_g INTEGER,
      coste_material REAL,
      coste_electricidad REAL,
      coste_total REAL,
      beneficio REAL,
      subtotal_factura REAL,
      iva_factura REAL,
      total_factura REAL,
      incidencias TEXT,
      estado_final_pedido TEXT NOT NULL,
      resumen_flujo TEXT NOT NULL,
      FOREIGN KEY(demo_run_id) REFERENCES demo_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS finished_product_inventory (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE,
      product_id TEXT NOT NULL UNIQUE,
      cantidad_disponible INTEGER NOT NULL DEFAULT 0,
      unidades_stock INTEGER NOT NULL DEFAULT 0,
      unidades_reservadas INTEGER NOT NULL DEFAULT 0,
      unidades_disponibles INTEGER NOT NULL DEFAULT 0,
      ubicacion TEXT,
      coste_unitario REAL NOT NULL DEFAULT 0,
      precio_venta REAL NOT NULL DEFAULT 0,
      fecha_actualizacion TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE,
      nombre TEXT NOT NULL,
      estado TEXT NOT NULL,
      horas_uso_acumuladas REAL NOT NULL DEFAULT 0,
      coste_hora REAL NOT NULL DEFAULT 0,
      ubicacion TEXT,
      fecha_actualizacion TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE,
      inventario_tipo TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_codigo TEXT,
      tipo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      cantidad REAL NOT NULL,
      motivo TEXT NOT NULL,
      referencia TEXT NOT NULL
    );
  `);

  migrateDatabase(database);
  ensureColumn(database, "finished_product_inventory", "codigo", "TEXT");
  ensureColumn(database, "printers", "codigo", "TEXT");
  ensureColumn(database, "inventory_movements", "codigo", "TEXT");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_finished_inventory_codigo ON finished_product_inventory(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_printers_codigo ON printers(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_codigo ON inventory_movements(codigo);
  `);
  backfillCodes(database, "finished_product_inventory", "STK-", "rowid ASC");
  backfillCodes(database, "printers", "IMP-", "rowid ASC");
  backfillCodes(database, "inventory_movements", "MIV-", "fecha ASC");

  return database;
}

export const db = globalDb.fabriqDb ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalDb.fabriqDb = db;
}
