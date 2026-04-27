import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient, type Client, type InArgs, type ResultSet, type Transaction } from "@libsql/client";

type GlobalDb = typeof globalThis & {
  fabriqDb?: Client;
  fabriqDbInit?: Promise<void>;
  fabriqDbBootstrapping?: boolean;
};

type ColumnInfo = {
  name: string;
};

type DbExecutor = {
  execute: (statement: string, params?: InArgs) => Promise<ResultSet>;
  executeScript: (sql: string) => Promise<void>;
};

const globalDb = globalThis as GlobalDb;
const transactionStorage = new AsyncLocalStorage<DbExecutor>();

function getProjectDatabaseFile() {
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "fabriq-erp.db");
}

function isRemoteDatabaseConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}

function getRemoteDatabaseConfig() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url) {
    if (process.env.VERCEL) {
      throw new Error("Falta TURSO_DATABASE_URL en Vercel. Debe tener formato libsql://<database>-<org>.turso.io");
    }
    return null;
  }

  if (!/^libsql:\/\//i.test(url)) {
    throw new Error("TURSO_DATABASE_URL no es valido. Debe empezar por libsql://");
  }

  if (!authToken) {
    throw new Error("Falta TURSO_AUTH_TOKEN. Debes configurarlo en Vercel para conectar con Turso.");
  }

  return { url, authToken };
}

function getDatabaseUrl() {
  const remoteConfig = getRemoteDatabaseConfig();
  if (remoteConfig) {
    return remoteConfig.url;
  }

  if (process.env.VERCEL) {
    throw new Error("TURSO_DATABASE_URL es obligatorio en despliegue Vercel.");
  }

  return pathToFileURL(getProjectDatabaseFile()).toString();
}

function createDatabaseClient() {
  const remoteConfig = getRemoteDatabaseConfig();
  const url = remoteConfig?.url ?? getDatabaseUrl();
  const authToken = remoteConfig?.authToken;

  return createClient({
    url,
    authToken: authToken || undefined,
    intMode: "number",
  });
}

export const db = globalDb.fabriqDb ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalDb.fabriqDb = db;
}

function getActiveExecutor(): DbExecutor {
  return (
    transactionStorage.getStore() ?? {
      execute: (statement: string, params?: InArgs) => db.execute(statement, params),
      executeScript: async (sql: string) => {
        for (const statement of splitSqlScript(sql)) {
          await db.execute(statement);
        }
      },
    }
  );
}

function splitSqlScript(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeArgs(params: unknown[]): InArgs | undefined {
  if (params.length === 0) {
    return undefined;
  }

  return params.map((value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value as string | number | boolean | null;
  });
}

function toPlainRows<T>(resultSet: ResultSet) {
  return resultSet.rows.map((entry) => {
    const row: Record<string, unknown> = {};
    for (const column of resultSet.columns) {
      row[column] = entry[column];
    }
    return row as T;
  });
}

async function hasColumn(table: string, column: string) {
  const columns = await rows<ColumnInfo>(`PRAGMA table_info(${table})`);
  return columns.some((item) => item.name === column);
}

async function ensureColumn(table: string, column: string, definition: string) {
  if (!(await hasColumn(table, column))) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

async function backfillCodes(table: string, prefix: string, orderBy = "rowid ASC") {
  const pendingRows = await rows<{ id: string }>(
    `SELECT id FROM ${table} WHERE codigo IS NULL OR codigo = '' ORDER BY ${orderBy}`,
  );
  const currentMax = await row<{ codigo?: string }>(
    `SELECT codigo FROM ${table} WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`,
    `${prefix}%`,
  );
  const base = currentMax?.codigo ? Number(String(currentMax.codigo).replace(prefix, "")) || 0 : 0;

  for (const [index, item] of pendingRows.entries()) {
    const code = `${prefix}${String(base + index + 1).padStart(3, "0")}`;
    await run(`UPDATE ${table} SET codigo = ? WHERE id = ?`, code, item.id);
  }
}

async function nextCodeFromDatabase(table: string, prefix: string) {
  const result = await row<{ codigo?: string }>(
    `SELECT codigo FROM ${table} WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`,
    `${prefix}%`,
  );
  const current = result?.codigo ?? `${prefix}000`;
  const numeric = Number(String(current).replace(prefix, "")) || 0;
  return `${prefix}${String(numeric + 1).padStart(3, "0")}`;
}

async function ensureIndexes() {
  await exec(`
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

async function ensureMaterialMovementBaselines() {
  const materials = await rows<{ id: string; codigo: string | null; stock_actual_g: number }>(
    `SELECT id, codigo, stock_actual_g FROM materials ORDER BY rowid ASC`,
  );

  for (const material of materials) {
    const movementCount = await row<{ total: number }>(
      `SELECT COUNT(*) AS total FROM stock_movements WHERE material_id = ?`,
      material.id,
    );

    if ((movementCount?.total ?? 0) === 0 && material.stock_actual_g > 0) {
      await run(
        `INSERT INTO stock_movements
          (id, codigo, material_id, tipo, cantidad_g, motivo, referencia, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        await nextCodeFromDatabase("stock_movements", "MOV-"),
        material.id,
        "ENTRADA",
        Math.round(material.stock_actual_g),
        "Stock inicial migrado a movimientos",
        "MIGRACION_V2",
        new Date().toISOString(),
      );
    }

    const recalculatedStock = await row<{ total: number }>(
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
      material.id,
    );

    await run(
      `UPDATE materials SET stock_actual_g = ? WHERE id = ?`,
      Math.round(recalculatedStock?.total ?? 0),
      material.id,
    );
  }
}

async function migrateDatabase() {
  await ensureColumn("customers", "codigo", "TEXT");
  await ensureColumn("customers", "activo", "INTEGER DEFAULT 1");
  await ensureColumn("materials", "codigo", "TEXT");
  await ensureColumn("materials", "tipo_color", "TEXT");
  await ensureColumn("materials", "efecto", "TEXT");
  await ensureColumn("materials", "color_base", "TEXT");
  await ensureColumn("materials", "nombre_comercial", "TEXT");
  await ensureColumn("materials", "diametro_mm", "REAL");
  await ensureColumn("materials", "peso_spool_g", "INTEGER");
  await ensureColumn("materials", "temp_extrusor", "INTEGER");
  await ensureColumn("materials", "temp_cama", "INTEGER");
  await ensureColumn("materials", "notas", "TEXT");
  await ensureColumn("materials", "activo", "INTEGER DEFAULT 1");
  await ensureColumn("products", "codigo", "TEXT");
  await ensureColumn("products", "activo", "INTEGER DEFAULT 1");
  await ensureColumn("products", "iva_porcentaje", "REAL DEFAULT 21");
  await ensureColumn("products", "coste_maquina", "REAL DEFAULT 0");
  await ensureColumn("products", "coste_mano_obra", "REAL DEFAULT 0");
  await ensureColumn("products", "coste_postprocesado", "REAL DEFAULT 0");
  await ensureColumn("order_lines", "codigo", "TEXT");
  await ensureColumn("order_lines", "cantidad_desde_stock", "INTEGER DEFAULT 0");
  await ensureColumn("order_lines", "cantidad_a_fabricar", "INTEGER DEFAULT 0");
  await ensureColumn("order_lines", "iva_porcentaje", "REAL DEFAULT 21");
  await ensureColumn("order_lines", "coste_impresora_total", "REAL DEFAULT 0");
  await ensureColumn("order_lines", "precio_total_linea", "REAL DEFAULT 0");
  await ensureColumn("orders", "estado_pago", "TEXT DEFAULT 'NO_FACTURADO'");
  await ensureColumn("orders", "descuento", "REAL DEFAULT 0");
  await ensureColumn("orders", "coste_total_pedido", "REAL DEFAULT 0");
  await ensureColumn("orders", "beneficio_total", "REAL DEFAULT 0");
  await ensureColumn("stock_movements", "codigo", "TEXT");
  await ensureColumn("manufacturing_orders", "impresora_id", "TEXT");
  await ensureColumn("manufacturing_orders", "coste_impresora_total", "REAL DEFAULT 0");
  await ensureColumn("manufacturing_orders", "tiempo_estimado_horas", "REAL");
  await ensureColumn("invoices", "total_pagado", "REAL DEFAULT 0");
  await ensureColumn("invoices", "importe_pendiente", "REAL DEFAULT 0");
  await ensureColumn("invoices", "descuento", "REAL DEFAULT 0");
  await ensureColumn("finished_product_inventory", "unidades_stock", "INTEGER DEFAULT 0");
  await ensureColumn("finished_product_inventory", "unidades_reservadas", "INTEGER DEFAULT 0");
  await ensureColumn("finished_product_inventory", "unidades_disponibles", "INTEGER DEFAULT 0");
  await ensureColumn("printers", "activo", "INTEGER DEFAULT 1");
  await ensureIndexes();
  await backfillCodes("customers", "CLI-", "fecha_creacion ASC");
  await backfillCodes("materials", "MAT-", "fecha_actualizacion ASC");
  await backfillCodes("products", "PRO-", "nombre ASC");
  await backfillCodes("orders", "PED-", "fecha_pedido ASC");
  await backfillCodes("order_lines", "LIN-", "rowid ASC");
  await backfillCodes("manufacturing_orders", "OF-", "rowid ASC");
  await backfillCodes("stock_movements", "MOV-", "fecha ASC");
  await backfillCodes("invoices", "FAC-", "fecha ASC");
  await ensureMaterialMovementBaselines();
}

async function createSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      codigo TEXT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
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
      activo INTEGER NOT NULL DEFAULT 1,
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
      iva_porcentaje REAL NOT NULL DEFAULT 21,
      material_id TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
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
      descuento REAL NOT NULL DEFAULT 0,
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
      iva_porcentaje REAL NOT NULL DEFAULT 21,
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
      descuento REAL NOT NULL DEFAULT 0,
      iva REAL NOT NULL,
      total REAL NOT NULL,
      total_pagado REAL NOT NULL DEFAULT 0,
      importe_pendiente REAL NOT NULL DEFAULT 0,
      estado_pago TEXT NOT NULL,
      FOREIGN KEY(pedido_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(cliente_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE,
      factura_id TEXT NOT NULL,
      fecha_pago TEXT NOT NULL,
      metodo_pago TEXT NOT NULL,
      importe REAL NOT NULL,
      notas TEXT,
      FOREIGN KEY(factura_id) REFERENCES invoices(id) ON DELETE RESTRICT
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
      activo INTEGER NOT NULL DEFAULT 1,
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

  await migrateDatabase();
  await ensureColumn("finished_product_inventory", "codigo", "TEXT");
  await ensureColumn("printers", "codigo", "TEXT");
  await ensureColumn("inventory_movements", "codigo", "TEXT");
  await ensureColumn("invoice_payments", "codigo", "TEXT");
  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_finished_inventory_codigo ON finished_product_inventory(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_printers_codigo ON printers(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_codigo ON inventory_movements(codigo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_codigo ON invoice_payments(codigo);
  `);
  await backfillCodes("finished_product_inventory", "STK-", "rowid ASC");
  await backfillCodes("printers", "IMP-", "rowid ASC");
  await backfillCodes("inventory_movements", "MIV-", "fecha ASC");
  await backfillCodes("invoice_payments", "PAG-", "fecha_pago ASC");
}

export async function ensureDatabaseReady() {
  if (!globalDb.fabriqDbInit) {
    globalDb.fabriqDbBootstrapping = true;
    globalDb.fabriqDbInit = createSchema()
      .catch((error) => {
        globalDb.fabriqDbInit = undefined;
        if (isRemoteDatabaseConfigured() && error instanceof Error) {
          throw new Error(`No se pudo conectar o inicializar Turso: ${error.message}`);
        }
        throw error;
      })
      .finally(() => {
        globalDb.fabriqDbBootstrapping = false;
      });
  }

  await globalDb.fabriqDbInit;
}

export async function row<T>(statement: string, ...params: unknown[]) {
  if (!globalDb.fabriqDbBootstrapping) {
    await ensureDatabaseReady();
  }
  const result = await getActiveExecutor().execute(statement, normalizeArgs(params));
  return toPlainRows<T>(result)[0];
}

export async function rows<T>(statement: string, ...params: unknown[]) {
  if (!globalDb.fabriqDbBootstrapping) {
    await ensureDatabaseReady();
  }
  const result = await getActiveExecutor().execute(statement, normalizeArgs(params));
  return toPlainRows<T>(result);
}

export async function run(statement: string, ...params: unknown[]) {
  if (!globalDb.fabriqDbBootstrapping) {
    await ensureDatabaseReady();
  }
  return getActiveExecutor().execute(statement, normalizeArgs(params));
}

export async function exec(sql: string) {
  if (!globalDb.fabriqDbBootstrapping) {
    await ensureDatabaseReady();
  }
  return getActiveExecutor().executeScript(sql);
}

function createTransactionExecutor(transactionHandle: Transaction): DbExecutor {
  return {
    execute: (statement: string, params?: InArgs) => transactionHandle.execute({ sql: statement, args: params }),
    executeScript: async (sql: string) => {
      for (const statement of splitSqlScript(sql)) {
        await transactionHandle.execute(statement);
      }
    },
  };
}

export async function transaction<T>(task: () => Promise<T>) {
  await ensureDatabaseReady();
  const transactionHandle = await db.transaction("write");
  const executor = createTransactionExecutor(transactionHandle);

  try {
    const result = await transactionStorage.run(executor, task);
    await transactionHandle.commit();
    return result;
  } catch (error) {
    if (!transactionHandle.closed) {
      await transactionHandle.rollback();
    }
    throw error;
  } finally {
    transactionHandle.close();
  }
}

export function getDatabaseRuntimeInfo() {
  return {
    mode: isRemoteDatabaseConfigured() ? "turso-remote" : "local-file",
    url: getDatabaseUrl(),
  };
}
