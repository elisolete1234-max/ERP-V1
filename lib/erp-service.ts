import { randomUUID } from "node:crypto";
import { db } from "./db";

type LineInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

type PrinterState = "LIBRE" | "IMPRIMIENDO" | "MANTENIMIENTO";
type InventoryMovementType = "ENTRADA" | "SALIDA" | "AJUSTE";

export const DEFAULT_VAT_RATE = 21;

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function nowIso() {
  return new Date().toISOString();
}

function parseBoolean(value: number) {
  return value === 1;
}

function row<T>(statement: string, ...params: unknown[]) {
  return db.prepare(statement).get(...params) as T | undefined;
}

function rows<T>(statement: string, ...params: unknown[]) {
  return db.prepare(statement).all(...params) as T[];
}

function run(statement: string, ...params: unknown[]) {
  return db.prepare(statement).run(...params);
}

function transaction<T>(task: () => T) {
  run("BEGIN");
  try {
    const result = task();
    run("COMMIT");
    return result;
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
}

function nextCode(table: string, prefix: string) {
  const result = row<{ codigo: string }>(
    `SELECT codigo FROM ${table} WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`,
    `${prefix}%`,
  );
  const current = result?.codigo ?? `${prefix}000`;
  const numeric = Number(current.replace(prefix, "")) || 0;
  return `${prefix}${String(numeric + 1).padStart(3, "0")}`;
}

function requirePositiveInteger(value: number, message: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
  return Math.round(value);
}

function getProductOrThrow(productId: string) {
  const product = row<{
    id: string;
    nombre: string;
    gramos_estimados: number;
    tiempo_impresion_horas: number;
    coste_electricidad: number;
    coste_maquina: number;
    coste_mano_obra: number;
    coste_postprocesado: number;
    pvp: number;
    precio_kg: number;
  }>(
    `SELECT
       p.id,
       p.nombre,
       p.gramos_estimados,
       p.tiempo_impresion_horas,
       p.coste_electricidad,
       p.coste_maquina,
       p.coste_mano_obra,
       p.coste_postprocesado,
       p.pvp,
       m.precio_kg
     FROM products p
     JOIN materials m ON m.id = p.material_id
     WHERE p.id = ?`,
    productId,
  );

  if (!product) {
    throw new Error("Uno de los productos seleccionados no existe.");
  }

  return product;
}

function calculateLineCosts(input: {
  quantity: number;
  unitPrice: number;
  gramsPerUnit: number;
  materialPricePerKg: number;
  electricityCostPerUnit: number;
  fromStockUnits?: number;
  finishedUnitCost?: number;
  printerCostTotal?: number;
}) {
  const fromStockUnits = Math.max(0, Math.round(input.fromStockUnits ?? 0));
  const quantity = Math.round(input.quantity);
  const producedUnits = Math.max(0, quantity - fromStockUnits);
  const gramosTotales = input.gramsPerUnit * quantity;
  const stockMaterialCost = roundMoney((input.finishedUnitCost ?? 0) * fromStockUnits);
  const producedMaterialCost = roundMoney(
    (input.materialPricePerKg / 1000) * (input.gramsPerUnit * producedUnits),
  );
  const costeMaterial = roundMoney(stockMaterialCost + producedMaterialCost);
  const costeElectricidadTotal = roundMoney(input.electricityCostPerUnit * producedUnits);
  const costeImpresoraTotal = roundMoney(input.printerCostTotal ?? 0);
  const costeTotal = roundMoney(costeMaterial + costeElectricidadTotal + costeImpresoraTotal);
  const beneficio = roundMoney(input.unitPrice * quantity - costeTotal);

  return {
    gramosTotales,
    costeMaterial,
    costeElectricidadTotal,
    costeImpresoraTotal,
    costeTotal,
    beneficio,
  };
}

function draftLineCalculations(product: ReturnType<typeof getProductOrThrow>, quantity: number, unitPrice?: number) {
  const precioUnitario = roundMoney(unitPrice && unitPrice > 0 ? unitPrice : product.pvp);
  const costs = calculateLineCosts({
    quantity,
    unitPrice: precioUnitario,
    gramsPerUnit: product.gramos_estimados,
    materialPricePerKg: product.precio_kg,
    electricityCostPerUnit: product.coste_electricidad,
  });

  return {
    gramosTotales: costs.gramosTotales,
    precioUnitario,
    precioTotalLinea: roundMoney(precioUnitario * quantity),
    costeMaterial: costs.costeMaterial,
    costeElectricidadTotal: costs.costeElectricidadTotal,
    costeImpresoraTotal: costs.costeImpresoraTotal,
    costeTotal: costs.costeTotal,
    beneficio: costs.beneficio,
  };
}

function getMaterialComputedStock(materialId: string) {
  const totals = row<{ total: number }>(
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
    materialId,
  );

  return Math.round(totals?.total ?? 0);
}

function syncMaterialStockCache(materialId: string) {
  const nextStock = getMaterialComputedStock(materialId);
  run(
    `UPDATE materials
     SET stock_actual_g = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    nextStock,
    nowIso(),
    materialId,
  );

  return nextStock;
}

function syncFinishedInventoryMetrics(productId: string) {
  ensureFinishedInventoryRow(productId);
  const reserved = row<{ total: number }>(
    `SELECT COALESCE(SUM(l.cantidad_desde_stock), 0) AS total
     FROM order_lines l
     JOIN orders o ON o.id = l.pedido_id
     WHERE l.producto_id = ?
       AND o.estado IN ('CONFIRMADO', 'EN_PRODUCCION', 'LISTO')`,
    productId,
  )?.total ?? 0;

  const current = row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  );
  const available = Math.max(0, Math.round(current?.cantidad_disponible ?? 0));
  run(
    `UPDATE finished_product_inventory
     SET unidades_reservadas = ?, unidades_disponibles = ?, unidades_stock = ?, fecha_actualizacion = ?
     WHERE product_id = ?`,
    Math.max(0, Math.round(reserved)),
    available,
    available + Math.max(0, Math.round(reserved)),
    nowIso(),
    productId,
  );
}

function syncFinishedInventoryMetricsForOrder(orderId: string) {
  const productIds = rows<{ producto_id: string }>(
    `SELECT DISTINCT producto_id FROM order_lines WHERE pedido_id = ?`,
    orderId,
  );

  for (const item of productIds) {
    syncFinishedInventoryMetrics(item.producto_id);
  }
}

function recalculateOrderTotals(orderId: string, vatRate = DEFAULT_VAT_RATE) {
  const totals = row<{
    subtotal: number;
    coste_total: number;
    beneficio: number;
  }>(
    `SELECT
       COALESCE(SUM(precio_total_linea), 0) AS subtotal,
       COALESCE(SUM(coste_total), 0) AS coste_total,
       COALESCE(SUM(beneficio), 0) AS beneficio
     FROM order_lines
     WHERE pedido_id = ?`,
    orderId,
  );

  const subtotal = roundMoney(totals?.subtotal ?? 0);
  const iva = roundMoney((subtotal * vatRate) / 100);
  const total = roundMoney(subtotal + iva);
  const costeTotal = roundMoney(totals?.coste_total ?? 0);
  const beneficio = roundMoney(totals?.beneficio ?? 0);

  run(
    `UPDATE orders
     SET subtotal = ?, iva = ?, total = ?, coste_total_pedido = ?, beneficio_total = ?
     WHERE id = ?`,
    subtotal,
    iva,
    total,
    costeTotal,
    beneficio,
    orderId,
  );

  return { subtotal, iva, total, costeTotal, beneficio };
}

function registerOrderHistory(pedidoId: string, estado: string, nota: string) {
  run(
    `INSERT INTO order_status_history (id, pedido_id, estado, nota, fecha) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    pedidoId,
    estado,
    nota,
    nowIso(),
  );
}

function registerInventoryMovement(input: {
  inventarioTipo: "MATERIAL" | "PRODUCTO_TERMINADO";
  itemId: string;
  itemCodigo?: string | null;
  tipo: InventoryMovementType;
  cantidad: number;
  motivo: string;
  referencia: string;
}) {
  if (!Number.isFinite(input.cantidad) || input.cantidad <= 0) {
    throw new Error("No se permiten movimientos de inventario con cantidad 0 o negativa.");
  }

  run(
    `INSERT INTO inventory_movements
      (id, codigo, inventario_tipo, item_id, item_codigo, tipo, fecha, cantidad, motivo, referencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nextCode("inventory_movements", "MIV-"),
    input.inventarioTipo,
    input.itemId,
    input.itemCodigo ?? null,
    input.tipo,
    nowIso(),
    input.cantidad,
    input.motivo,
    input.referencia,
  );
}

function getMaterialInventoryOrThrow(materialId: string) {
  const material = row<{
    id: string;
    codigo: string;
    stock_actual_g: number;
  }>(`SELECT id, codigo, stock_actual_g FROM materials WHERE id = ?`, materialId);

  if (!material) {
    throw new Error("El material no existe.");
  }

  const computedStock = getMaterialComputedStock(materialId);
  if (computedStock !== material.stock_actual_g) {
    run(
      `UPDATE materials
       SET stock_actual_g = ?, fecha_actualizacion = ?
       WHERE id = ?`,
      computedStock,
      nowIso(),
      materialId,
    );
  }

  return { ...material, stock_actual_g: computedStock };
}

function applyMaterialInventoryMovement(input: {
  materialId: string;
  tipo: "ENTRADA" | "SALIDA";
  cantidadG: number;
  motivo: string;
  referencia: string;
}) {
  const quantity = requirePositiveInteger(input.cantidadG, "La cantidad del movimiento debe ser mayor que cero.");
  const material = getMaterialInventoryOrThrow(input.materialId);
  const delta = input.tipo === "SALIDA" ? -quantity : quantity;
  const nextStock = material.stock_actual_g + delta;
  if (nextStock < 0) {
    throw new Error("No se puede dejar el stock de materiales en negativo.");
  }
  run(
    `INSERT INTO stock_movements
      (id, codigo, material_id, tipo, cantidad_g, motivo, referencia, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nextCode("stock_movements", "MOV-"),
    input.materialId,
    input.tipo,
    quantity,
    input.motivo,
    input.referencia,
    nowIso(),
  );
  registerInventoryMovement({
    inventarioTipo: "MATERIAL",
    itemId: input.materialId,
    itemCodigo: material.codigo,
    tipo: input.tipo,
    cantidad: quantity,
    motivo: input.motivo,
    referencia: input.referencia,
  });

  syncMaterialStockCache(input.materialId);

  return { previousStock: material.stock_actual_g, nextStock, itemCodigo: material.codigo };
}

function getFinishedInventoryOrThrow(productId: string) {
  ensureFinishedInventoryRow(productId);
  const inventory = row<{
    id: string;
    codigo: string;
    product_id: string;
    cantidad_disponible: number;
    ubicacion: string | null;
    coste_unitario: number;
    precio_venta: number;
  }>(
    `SELECT id, codigo, product_id, cantidad_disponible, ubicacion, coste_unitario, precio_venta
     FROM finished_product_inventory
     WHERE product_id = ?`,
    productId,
  );

  if (!inventory) {
    throw new Error("El inventario de producto terminado no existe.");
  }

  syncFinishedInventoryMetrics(productId);
  return inventory;
}

function countUnfulfilledOrderLines(orderId: string) {
  return (
    row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM order_lines l
       WHERE l.pedido_id = ?
         AND (
           l.cantidad_desde_stock +
           COALESCE((
             SELECT SUM(mo.cantidad)
             FROM manufacturing_orders mo
             WHERE mo.linea_pedido_id = l.id AND mo.estado = 'COMPLETADA'
           ), 0)
         ) < l.cantidad`,
      orderId,
    )?.total ?? 0
  );
}

function applyFinishedInventoryMovement(input: {
  productId: string;
  tipo: InventoryMovementType;
  cantidad: number;
  signedDelta?: number;
  motivo: string;
  referencia: string;
  ubicacion?: string | null;
  costeUnitario?: number | null;
  precioVenta?: number | null;
}) {
  const quantity = requirePositiveInteger(input.cantidad, "La cantidad del movimiento debe ser mayor que cero.");
  const inventory = getFinishedInventoryOrThrow(input.productId);
  const signedDelta = input.signedDelta ?? (input.tipo === "SALIDA" ? -quantity : quantity);
  const nextQuantity = inventory.cantidad_disponible + signedDelta;
  if (nextQuantity < 0) {
    throw new Error("No se puede dejar el stock de producto terminado en negativo.");
  }

  run(
    `UPDATE finished_product_inventory
     SET cantidad_disponible = ?, ubicacion = ?, coste_unitario = ?, precio_venta = ?, fecha_actualizacion = ?
     WHERE product_id = ?`,
    nextQuantity,
    input.ubicacion === undefined ? inventory.ubicacion : input.ubicacion,
    roundMoney(input.costeUnitario ?? inventory.coste_unitario),
    roundMoney(input.precioVenta ?? inventory.precio_venta),
    nowIso(),
    input.productId,
  );
  registerInventoryMovement({
    inventarioTipo: "PRODUCTO_TERMINADO",
    itemId: input.productId,
    itemCodigo: inventory.codigo,
    tipo: input.tipo,
    cantidad: quantity,
    motivo: input.motivo,
    referencia: input.referencia,
  });
  syncFinishedInventoryMetrics(input.productId);

  return { previousQuantity: inventory.cantidad_disponible, nextQuantity, itemCodigo: inventory.codigo };
}

function ensureFinishedInventoryRow(productId: string) {
  const existing = row<{ id: string }>(
    `SELECT id FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  );
  if (existing) {
    return;
  }

  const product = row<{ pvp: number }>(`SELECT pvp FROM products WHERE id = ?`, productId);
  if (!product) {
    throw new Error("El producto no existe.");
  }

  run(
    `INSERT INTO finished_product_inventory
      (id, codigo, product_id, cantidad_disponible, unidades_stock, unidades_reservadas, unidades_disponibles, ubicacion, coste_unitario, precio_venta, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nextCode("finished_product_inventory", "STK-"),
    productId,
    0,
    0,
    0,
    0,
    "Estanteria principal",
    0,
    roundMoney(product.pvp),
    nowIso(),
  );
  syncFinishedInventoryMetrics(productId);
}

function getFirstAvailablePrinter() {
  return row<{
    id: string;
    codigo: string;
    nombre: string;
    estado: PrinterState;
    horas_uso_acumuladas: number;
    coste_hora: number;
  }>(
    `SELECT *
     FROM printers
     WHERE estado = 'LIBRE'
     ORDER BY horas_uso_acumuladas ASC, nombre ASC
     LIMIT 1`,
  );
}

function restoreOrderInventoryAllocations(orderId: string, orderCode: string) {
  const allocations = rows<{
    id: string;
    producto_id: string;
    cantidad_desde_stock: number;
    inventario_codigo: string | null;
  }>(
    `SELECT
       l.id,
       l.producto_id,
       l.cantidad_desde_stock,
       fi.codigo AS inventario_codigo
     FROM order_lines l
     LEFT JOIN finished_product_inventory fi ON fi.product_id = l.producto_id
     WHERE l.pedido_id = ?`,
    orderId,
  );

  for (const allocation of allocations) {
    if (allocation.cantidad_desde_stock > 0) {
      run(
        `UPDATE finished_product_inventory
         SET cantidad_disponible = cantidad_disponible + ?, fecha_actualizacion = ?
         WHERE product_id = ?`,
        allocation.cantidad_desde_stock,
        nowIso(),
        allocation.producto_id,
      );
      registerInventoryMovement({
        inventarioTipo: "PRODUCTO_TERMINADO",
        itemId: allocation.producto_id,
        itemCodigo: allocation.inventario_codigo,
        tipo: "AJUSTE",
        cantidad: allocation.cantidad_desde_stock,
        motivo: `Recalculo de reserva del pedido ${orderCode}`,
        referencia: orderCode,
      });
    }

    run(
      `UPDATE order_lines
       SET cantidad_desde_stock = 0, cantidad_a_fabricar = 0
       WHERE id = ?`,
      allocation.id,
    );
  }

  const activePrinters = rows<{ impresora_id: string | null }>(
    `SELECT impresora_id
     FROM manufacturing_orders
     WHERE pedido_id = ? AND estado = 'INICIADA' AND impresora_id IS NOT NULL`,
    orderId,
  );

  for (const item of activePrinters) {
    if (item.impresora_id) {
      run(
        `UPDATE printers
         SET estado = 'LIBRE', fecha_actualizacion = ?
         WHERE id = ?`,
        nowIso(),
        item.impresora_id,
      );
    }
  }

  run(`DELETE FROM manufacturing_orders WHERE pedido_id = ?`, orderId);
  syncFinishedInventoryMetricsForOrder(orderId);
}

export function getAppSnapshot() {
  const materialIds = rows<{ id: string }>(`SELECT id FROM materials`);
  for (const item of materialIds) {
    syncMaterialStockCache(item.id);
  }

  const inventoryProducts = rows<{ product_id: string }>(`SELECT product_id FROM finished_product_inventory`);
  for (const item of inventoryProducts) {
    syncFinishedInventoryMetrics(item.product_id);
  }

  const customers = rows<{
    id: string;
    codigo: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    fecha_creacion: string;
  }>(`SELECT * FROM customers ORDER BY fecha_creacion DESC`);

  const materials = rows<{
    id: string;
    codigo: string;
    nombre: string;
    marca: string;
    tipo: string;
    color: string;
    tipo_color: string | null;
    efecto: string | null;
    color_base: string | null;
    nombre_comercial: string | null;
    diametro_mm: number | null;
    peso_spool_g: number | null;
    temp_extrusor: number | null;
    temp_cama: number | null;
    precio_kg: number;
    stock_actual_g: number;
    stock_minimo_g: number;
    proveedor: string | null;
    notas: string | null;
    fecha_actualizacion: string;
  }>(`SELECT * FROM materials ORDER BY nombre ASC`);

  const products = rows<{
    id: string;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    enlace_modelo: string | null;
    gramos_estimados: number;
    tiempo_impresion_horas: number;
    coste_electricidad: number;
    coste_maquina: number;
    coste_mano_obra: number;
    coste_postprocesado: number;
    margen: number;
    pvp: number;
    material_id: string;
    activo: number;
    material_nombre: string;
    precio_kg: number;
  }>(
    `SELECT p.*, m.nombre AS material_nombre, m.precio_kg
     FROM products p
     JOIN materials m ON m.id = p.material_id
     ORDER BY p.nombre ASC`,
  ).map((product) => {
    const costeMaterial = roundMoney((product.precio_kg / 1000) * product.gramos_estimados);
    const costeTotalReceta = roundMoney(
      costeMaterial +
        product.coste_electricidad +
        product.coste_maquina +
        product.coste_mano_obra +
        product.coste_postprocesado,
    );

    return {
      ...product,
      activo: parseBoolean(product.activo),
      coste_material_estimado: costeMaterial,
      coste_total_producto: costeTotalReceta,
    };
  });

  const orders = rows<{
    id: string;
    codigo: string;
    cliente_id: string;
    fecha_pedido: string;
    estado: string;
    estado_pago: string;
    subtotal: number;
    iva: number;
    total: number;
    coste_total_pedido: number;
    beneficio_total: number;
    observaciones: string | null;
    cliente_nombre: string;
  }>(
    `SELECT o.*, c.nombre AS cliente_nombre
     FROM orders o
     JOIN customers c ON c.id = o.cliente_id
     ORDER BY o.fecha_pedido DESC`,
  ).map((order) => ({
    ...order,
    lineas: rows<{
      id: string;
      codigo: string;
      pedido_id: string;
      producto_id: string;
      cantidad: number;
      cantidad_desde_stock: number;
      cantidad_a_fabricar: number;
      precio_unitario: number;
      precio_total_linea: number;
      gramos_totales: number;
      coste_material: number;
      coste_electricidad_total: number;
      coste_impresora_total: number;
      coste_total: number;
      beneficio: number;
      producto_nombre: string;
      tiempo_impresion_horas: number;
      material_nombre: string;
      material_color: string;
      material_id: string;
    }>(
      `SELECT
         l.*,
         p.nombre AS producto_nombre,
         p.tiempo_impresion_horas,
         m.nombre AS material_nombre,
         m.color AS material_color,
         m.id AS material_id
       FROM order_lines l
       JOIN products p ON p.id = l.producto_id
       JOIN materials m ON m.id = p.material_id
       WHERE l.pedido_id = ?
       ORDER BY l.codigo ASC`,
      order.id,
    ),
    historial: rows<{
      id: string;
      pedido_id: string;
      estado: string;
      nota: string;
      fecha: string;
    }>(`SELECT * FROM order_status_history WHERE pedido_id = ? ORDER BY fecha DESC`, order.id),
    ordenesFabricacion: rows<{
      id: string;
      codigo: string;
      pedido_id: string;
      linea_pedido_id: string;
      producto_id: string;
      cantidad: number;
      estado: string;
      impresora_id: string | null;
      tiempo_estimado_horas: number | null;
      fecha_inicio: string | null;
      fecha_fin: string | null;
      gramos_consumidos: number | null;
      tiempo_real_horas: number | null;
      coste_impresora_total: number | null;
      incidencia: string | null;
    }>(
      `SELECT * FROM manufacturing_orders WHERE pedido_id = ? ORDER BY codigo ASC`,
      order.id,
    ),
    factura: row<{ id: string }>(`SELECT id FROM invoices WHERE pedido_id = ?`, order.id) ?? null,
  }));

  const manufacturingOrders = rows<{
    id: string;
    codigo: string;
    pedido_id: string;
    linea_pedido_id: string;
    producto_id: string;
    cantidad: number;
    estado: string;
    impresora_id: string | null;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    gramos_consumidos: number | null;
    tiempo_real_horas: number | null;
    coste_impresora_total: number | null;
    incidencia: string | null;
    pedido_codigo: string;
    producto_nombre: string;
    impresora_codigo: string | null;
    impresora_nombre: string | null;
  }>(
    `SELECT
       mo.*,
       o.codigo AS pedido_codigo,
       p.nombre AS producto_nombre,
       pr.codigo AS impresora_codigo,
       pr.nombre AS impresora_nombre
     FROM manufacturing_orders mo
     JOIN orders o ON o.id = mo.pedido_id
     JOIN products p ON p.id = mo.producto_id
     LEFT JOIN printers pr ON pr.id = mo.impresora_id
     ORDER BY mo.codigo ASC`,
  );

  const stockMovements = rows<{
    id: string;
    codigo: string;
    material_id: string;
    tipo: string;
    cantidad_g: number;
    motivo: string;
    referencia: string;
    fecha: string;
    material_nombre: string;
  }>(
    `SELECT sm.*, m.nombre AS material_nombre
     FROM stock_movements sm
     JOIN materials m ON m.id = sm.material_id
     ORDER BY sm.fecha DESC`,
  );

  const invoices = rows<{
    id: string;
    codigo: string;
    pedido_id: string;
    cliente_id: string;
    fecha: string;
    subtotal: number;
    iva: number;
    total: number;
    estado_pago: string;
    pedido_codigo: string;
    cliente_nombre: string;
  }>(
    `SELECT
       i.*,
       o.codigo AS pedido_codigo,
       c.nombre AS cliente_nombre
     FROM invoices i
     JOIN orders o ON o.id = i.pedido_id
     JOIN customers c ON c.id = i.cliente_id
     ORDER BY i.fecha DESC`,
  );

  const finishedInventory = rows<{
    id: string;
    codigo: string;
    product_id: string;
    cantidad_disponible: number;
    unidades_stock: number;
    unidades_reservadas: number;
    unidades_disponibles: number;
    ubicacion: string | null;
    coste_unitario: number;
    precio_venta: number;
    fecha_actualizacion: string;
    producto_codigo: string;
    producto_nombre: string;
  }>(
    `SELECT
       fi.*,
       p.codigo AS producto_codigo,
       p.nombre AS producto_nombre
     FROM finished_product_inventory fi
     JOIN products p ON p.id = fi.product_id
     ORDER BY p.nombre ASC`,
  );

  const printers = rows<{
    id: string;
    codigo: string;
    nombre: string;
    estado: PrinterState;
    horas_uso_acumuladas: number;
    coste_hora: number;
    ubicacion: string | null;
    fecha_actualizacion: string;
    orden_activa_codigo: string | null;
  }>(
    `SELECT
       pr.*,
       mo.codigo AS orden_activa_codigo
     FROM printers pr
     LEFT JOIN manufacturing_orders mo
       ON mo.impresora_id = pr.id
      AND mo.estado = 'INICIADA'
     ORDER BY pr.codigo ASC, pr.nombre ASC`,
  );

  const inventoryMovements = rows<{
    id: string;
    codigo: string;
    inventario_tipo: string;
    item_id: string;
    item_codigo: string | null;
    tipo: string;
    fecha: string;
    cantidad: number;
    motivo: string;
    referencia: string;
  }>(`SELECT * FROM inventory_movements ORDER BY fecha DESC, codigo DESC`);

  return {
    customers,
    materials,
    products,
    orders,
    manufacturingOrders,
    stockMovements,
    finishedInventory,
    printers,
    inventoryMovements,
    invoices,
  };
}

export function resetDatabase() {
  transaction(() => {
    run("DELETE FROM demo_scenario_results");
    run("DELETE FROM demo_runs");
    run("DELETE FROM inventory_movements");
    run("DELETE FROM order_status_history");
    run("DELETE FROM invoices");
    run("DELETE FROM stock_movements");
    run("DELETE FROM manufacturing_orders");
    run("DELETE FROM order_lines");
    run("DELETE FROM orders");
    run("DELETE FROM finished_product_inventory");
    run("DELETE FROM printers");
    run("DELETE FROM products");
    run("DELETE FROM materials");
    run("DELETE FROM customers");
  });
}

export function createCustomerRecord(input: {
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}) {
  if (!input.nombre.trim()) {
    throw new Error("El cliente necesita al menos un nombre.");
  }

  run(
    `INSERT INTO customers (id, codigo, nombre, telefono, email, direccion, fecha_creacion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nextCode("customers", "CLI-"),
    input.nombre.trim(),
    input.telefono?.trim() || null,
    input.email?.trim() || null,
    input.direccion?.trim() || null,
    nowIso(),
  );
}

export function updateCustomerRecord(input: {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}) {
  if (!input.id || !input.nombre.trim()) {
    throw new Error("El cliente necesita ID y nombre.");
  }

  run(
    `UPDATE customers
     SET nombre = ?, telefono = ?, email = ?, direccion = ?
     WHERE id = ?`,
    input.nombre.trim(),
    input.telefono?.trim() || null,
    input.email?.trim() || null,
    input.direccion?.trim() || null,
    input.id,
  );
}

export function createMaterialRecord(input: {
  nombre: string;
  marca: string;
  tipo: string;
  color: string;
  tipoColor?: string;
  efecto?: string;
  colorBase?: string;
  nombreComercial?: string;
  diametroMm?: number;
  pesoSpoolG?: number;
  tempExtrusor?: number;
  tempCama?: number;
  precioKg: number;
  stockActualG: number;
  stockMinimoG: number;
  proveedor?: string;
  notas?: string;
}) {
  if (!input.nombre.trim() || !input.marca.trim() || !input.tipo.trim() || !input.color.trim()) {
    throw new Error("Material incompleto. Nombre, marca, tipo y color son obligatorios.");
  }
  if (
    input.precioKg < 0 ||
    input.stockActualG < 0 ||
    input.stockMinimoG < 0 ||
    (input.diametroMm ?? 0) < 0 ||
    (input.pesoSpoolG ?? 0) < 0 ||
    (input.tempExtrusor ?? 0) < 0 ||
    (input.tempCama ?? 0) < 0
  ) {
    throw new Error("No se permiten importes ni stock negativos.");
  }

  const materialId = randomUUID();
  transaction(() => {
    run(
      `INSERT INTO materials
        (id, codigo, nombre, marca, tipo, color, tipo_color, efecto, color_base, nombre_comercial, diametro_mm, peso_spool_g, temp_extrusor, temp_cama, precio_kg, stock_actual_g, stock_minimo_g, proveedor, notas, fecha_actualizacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      materialId,
      nextCode("materials", "MAT-"),
      input.nombre.trim(),
      input.marca.trim(),
      input.tipo.trim(),
      input.color.trim(),
      input.tipoColor?.trim() || null,
      input.efecto?.trim() || null,
      input.colorBase?.trim() || null,
      input.nombreComercial?.trim() || null,
      input.diametroMm != null ? roundMoney(input.diametroMm) : null,
      input.pesoSpoolG != null ? Math.round(input.pesoSpoolG) : null,
      input.tempExtrusor != null ? Math.round(input.tempExtrusor) : null,
      input.tempCama != null ? Math.round(input.tempCama) : null,
      roundMoney(input.precioKg),
      0,
      Math.round(input.stockMinimoG),
      input.proveedor?.trim() || null,
      input.notas?.trim() || null,
      nowIso(),
    );

    if (Math.round(input.stockActualG) > 0) {
      applyMaterialInventoryMovement({
        materialId,
        tipo: "ENTRADA",
        cantidadG: Math.round(input.stockActualG),
        motivo: "Stock inicial del material",
        referencia: "ALTA_MATERIAL",
      });
    }
  });
}

export function updateMaterialRecord(input: {
  id: string;
  nombre: string;
  marca: string;
  tipo: string;
  color: string;
  tipoColor?: string;
  efecto?: string;
  colorBase?: string;
  nombreComercial?: string;
  diametroMm?: number;
  pesoSpoolG?: number;
  tempExtrusor?: number;
  tempCama?: number;
  precioKg: number;
  stockActualG: number;
  stockMinimoG: number;
  proveedor?: string;
  notas?: string;
}) {
  if (!input.id || !input.nombre.trim() || !input.marca.trim() || !input.tipo.trim() || !input.color.trim()) {
    throw new Error("Material incompleto.");
  }
  if (
    input.precioKg < 0 ||
    input.stockMinimoG < 0 ||
    (input.diametroMm ?? 0) < 0 ||
    (input.pesoSpoolG ?? 0) < 0 ||
    (input.tempExtrusor ?? 0) < 0 ||
    (input.tempCama ?? 0) < 0
  ) {
    throw new Error("No se permiten importes ni stock minimo negativos.");
  }

  const current = row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, input.id);
  if (!current) {
    throw new Error("El material no existe.");
  }
  if (Math.round(input.stockActualG) !== current.stock_actual_g) {
    throw new Error("El stock actual solo se modifica mediante movimientos de inventario.");
  }

  run(
    `UPDATE materials
     SET nombre = ?, marca = ?, tipo = ?, color = ?, tipo_color = ?, efecto = ?, color_base = ?, nombre_comercial = ?, diametro_mm = ?, peso_spool_g = ?, temp_extrusor = ?, temp_cama = ?, precio_kg = ?, stock_minimo_g = ?, proveedor = ?, notas = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    input.nombre.trim(),
    input.marca.trim(),
    input.tipo.trim(),
    input.color.trim(),
    input.tipoColor?.trim() || null,
    input.efecto?.trim() || null,
    input.colorBase?.trim() || null,
    input.nombreComercial?.trim() || null,
    input.diametroMm != null ? roundMoney(input.diametroMm) : null,
    input.pesoSpoolG != null ? Math.round(input.pesoSpoolG) : null,
    input.tempExtrusor != null ? Math.round(input.tempExtrusor) : null,
    input.tempCama != null ? Math.round(input.tempCama) : null,
    roundMoney(input.precioKg),
    Math.round(input.stockMinimoG),
    input.proveedor?.trim() || null,
    input.notas?.trim() || null,
    nowIso(),
    input.id,
  );
}

export function createProductRecord(input: {
  nombre: string;
  descripcion?: string;
  enlaceModelo?: string;
  gramosEstimados: number;
  tiempoImpresionHoras: number;
  costeElectricidad: number;
  costeMaquina?: number;
  costeManoObra?: number;
  costePostprocesado?: number;
  margen: number;
  pvp: number;
  materialId: string;
  activo?: boolean;
}) {
  if (!input.materialId) {
    throw new Error("No se puede crear un producto sin material principal.");
  }
  requirePositiveInteger(input.gramosEstimados, "Los gramos estimados deben ser positivos.");
  if (
    input.tiempoImpresionHoras <= 0 ||
    input.pvp <= 0 ||
    input.costeElectricidad < 0 ||
    (input.costeMaquina ?? 0) < 0 ||
    (input.costeManoObra ?? 0) < 0 ||
    (input.costePostprocesado ?? 0) < 0
  ) {
    throw new Error("Revisa el producto: tiempo, PVP y costes deben ser validos.");
  }

  const material = row(`SELECT id FROM materials WHERE id = ?`, input.materialId);
  if (!material) {
    throw new Error("El material principal no existe.");
  }

  const productId = randomUUID();
  transaction(() => {
    run(
      `INSERT INTO products
        (id, codigo, nombre, descripcion, enlace_modelo, gramos_estimados, tiempo_impresion_horas, coste_electricidad, coste_maquina, coste_mano_obra, coste_postprocesado, margen, pvp, material_id, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      productId,
      nextCode("products", "PRO-"),
      input.nombre.trim(),
      input.descripcion?.trim() || null,
      input.enlaceModelo?.trim() || null,
      Math.round(input.gramosEstimados),
      roundMoney(input.tiempoImpresionHoras),
      roundMoney(input.costeElectricidad),
      roundMoney(input.costeMaquina ?? 0),
      roundMoney(input.costeManoObra ?? 0),
      roundMoney(input.costePostprocesado ?? 0),
      roundMoney(input.margen),
      roundMoney(input.pvp),
      input.materialId,
      input.activo === false ? 0 : 1,
    );
    ensureFinishedInventoryRow(productId);
    run(
      `UPDATE finished_product_inventory
       SET precio_venta = ?, fecha_actualizacion = ?
       WHERE product_id = ?`,
      roundMoney(input.pvp),
      nowIso(),
      productId,
    );
  });
}

export function updateProductRecord(input: {
  id: string;
  nombre: string;
  descripcion?: string;
  enlaceModelo?: string;
  gramosEstimados: number;
  tiempoImpresionHoras: number;
  costeElectricidad: number;
  costeMaquina?: number;
  costeManoObra?: number;
  costePostprocesado?: number;
  margen: number;
  pvp: number;
  materialId: string;
  activo?: boolean;
}) {
  if (!input.id || !input.materialId || !input.nombre.trim()) {
    throw new Error("Producto incompleto.");
  }
  requirePositiveInteger(input.gramosEstimados, "Los gramos estimados deben ser positivos.");
  if (
    input.tiempoImpresionHoras <= 0 ||
    input.pvp <= 0 ||
    input.costeElectricidad < 0 ||
    (input.costeMaquina ?? 0) < 0 ||
    (input.costeManoObra ?? 0) < 0 ||
    (input.costePostprocesado ?? 0) < 0
  ) {
    throw new Error("Revisa el producto: tiempo, PVP y costes deben ser validos.");
  }

  const material = row(`SELECT id FROM materials WHERE id = ?`, input.materialId);
  if (!material) {
    throw new Error("El material principal no existe.");
  }

  transaction(() => {
    run(
      `UPDATE products
       SET nombre = ?, descripcion = ?, enlace_modelo = ?, gramos_estimados = ?, tiempo_impresion_horas = ?, coste_electricidad = ?, coste_maquina = ?, coste_mano_obra = ?, coste_postprocesado = ?, margen = ?, pvp = ?, material_id = ?, activo = ?
       WHERE id = ?`,
      input.nombre.trim(),
      input.descripcion?.trim() || null,
      input.enlaceModelo?.trim() || null,
      Math.round(input.gramosEstimados),
      roundMoney(input.tiempoImpresionHoras),
      roundMoney(input.costeElectricidad),
      roundMoney(input.costeMaquina ?? 0),
      roundMoney(input.costeManoObra ?? 0),
      roundMoney(input.costePostprocesado ?? 0),
      roundMoney(input.margen),
      roundMoney(input.pvp),
      input.materialId,
      input.activo === false ? 0 : 1,
      input.id,
    );
    ensureFinishedInventoryRow(input.id);
    run(
      `UPDATE finished_product_inventory
       SET precio_venta = ?, fecha_actualizacion = ?
       WHERE product_id = ?`,
      roundMoney(input.pvp),
      nowIso(),
      input.id,
    );
  });
}

export function createOrderRecord(input: {
  clienteId: string;
  observaciones?: string;
  vatRate?: number;
  lines: LineInput[];
}) {
  if (!input.clienteId) {
    throw new Error("Debes seleccionar un cliente.");
  }
  const customer = row(`SELECT id FROM customers WHERE id = ?`, input.clienteId);
  if (!customer) {
    throw new Error("El cliente no existe.");
  }
  if (input.vatRate != null && (input.vatRate < 0 || input.vatRate > 100)) {
    throw new Error("El IVA debe estar entre 0 y 100.");
  }

  const validLines = input.lines.filter((line) => line.productId && line.quantity > 0);
  if (validLines.length === 0) {
    throw new Error("Debes añadir al menos una linea valida al pedido.");
  }

  const codigo = nextCode("orders", "PED-");
  const calculations = validLines.map((line) => {
    const product = getProductOrThrow(line.productId);
    const values = draftLineCalculations(product, Math.round(line.quantity), line.unitPrice);
    return { line, values };
  });

  const subtotal = roundMoney(
    calculations.reduce((sum, item) => sum + item.values.precioUnitario * item.line.quantity, 0),
  );
  const costeTotalPedido = roundMoney(
    calculations.reduce((sum, item) => sum + item.values.costeTotal, 0),
  );
  const iva = roundMoney((subtotal * (input.vatRate ?? DEFAULT_VAT_RATE)) / 100);
  const total = roundMoney(subtotal + iva);
  const beneficioTotal = roundMoney(subtotal - costeTotalPedido);
  const orderId = randomUUID();

  transaction(() => {
    run(
      `INSERT INTO orders
        (id, codigo, cliente_id, fecha_pedido, estado, estado_pago, subtotal, iva, total, coste_total_pedido, beneficio_total, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      codigo,
      input.clienteId,
      nowIso(),
      "BORRADOR",
      "NO_FACTURADO",
      subtotal,
      iva,
      total,
      costeTotalPedido,
      beneficioTotal,
      input.observaciones?.trim() || null,
    );

    for (const item of calculations) {
      run(
        `INSERT INTO order_lines
          (id, codigo, pedido_id, producto_id, cantidad, cantidad_desde_stock, cantidad_a_fabricar, precio_unitario, precio_total_linea, gramos_totales, coste_material, coste_electricidad_total, coste_impresora_total, coste_total, beneficio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        nextCode("order_lines", "LIN-"),
        orderId,
        item.line.productId,
        Math.round(item.line.quantity),
        0,
        0,
        item.values.precioUnitario,
        item.values.precioTotalLinea,
        item.values.gramosTotales,
        item.values.costeMaterial,
        item.values.costeElectricidadTotal,
        item.values.costeImpresoraTotal,
        item.values.costeTotal,
        item.values.beneficio,
      );
    }

    registerOrderHistory(orderId, "BORRADOR", "Pedido creado en borrador.");
    recalculateOrderTotals(orderId, input.vatRate ?? DEFAULT_VAT_RATE);
  });

  return orderId;
}

export function updateManufacturingOrderRecord(input: {
  id: string;
  estado: string;
  cantidad: number;
  tiempoRealHoras?: number;
  incidencia?: string;
}) {
  if (!input.id) {
    throw new Error("La orden de fabricacion necesita ID.");
  }
  if (input.cantidad <= 0) {
    throw new Error("La cantidad debe ser positiva.");
  }
  if (input.tiempoRealHoras != null && input.tiempoRealHoras < 0) {
    throw new Error("El tiempo real no puede ser negativo.");
  }

  const current = row<{ estado: string; impresora_id: string | null }>(
    `SELECT estado, impresora_id FROM manufacturing_orders WHERE id = ?`,
    input.id,
  );
  if (!current) {
    throw new Error("La orden de fabricacion no existe.");
  }
  if (current.estado === "COMPLETADA") {
    throw new Error("No se puede editar una orden de fabricacion ya completada.");
  }
  if (["INICIADA", "COMPLETADA"].includes(input.estado)) {
    throw new Error("Los cambios de estado a iniciada o completada deben hacerse con sus acciones dedicadas.");
  }
  if (!["PENDIENTE", "BLOQUEADA_POR_STOCK"].includes(input.estado)) {
    throw new Error("Estado de fabricacion no valido para edicion manual.");
  }

  run(
    `UPDATE manufacturing_orders
     SET estado = ?, cantidad = ?, tiempo_real_horas = ?, incidencia = ?
     WHERE id = ?`,
    input.estado,
    Math.round(input.cantidad),
    input.tiempoRealHoras && input.tiempoRealHoras > 0 ? roundMoney(input.tiempoRealHoras) : null,
    input.incidencia?.trim() || null,
    input.id,
  );
}

export function updateInvoiceRecord(input: {
  id: string;
  estadoPago: string;
}) {
  if (!input.id) {
    throw new Error("La factura necesita ID.");
  }
  if (!["PENDIENTE", "PAGADA"].includes(input.estadoPago)) {
    throw new Error("Estado de pago no valido.");
  }

  const invoice = row<{ pedido_id: string }>(`SELECT pedido_id FROM invoices WHERE id = ?`, input.id);
  if (!invoice) {
    throw new Error("La factura no existe.");
  }

  transaction(() => {
    run(`UPDATE invoices SET estado_pago = ? WHERE id = ?`, input.estadoPago, input.id);
    run(`UPDATE orders SET estado_pago = ? WHERE id = ?`, input.estadoPago, invoice.pedido_id);
  });
}

export function createPrinterRecord(input: {
  nombre: string;
  estado?: PrinterState;
  horasUsoAcumuladas?: number;
  costeHora: number;
  ubicacion?: string;
}) {
  if (!input.nombre.trim()) {
    throw new Error("La impresora necesita un nombre.");
  }
  if ((input.horasUsoAcumuladas ?? 0) < 0 || input.costeHora < 0) {
    throw new Error("No se permiten horas ni costes negativos.");
  }

  run(
    `INSERT INTO printers
      (id, codigo, nombre, estado, horas_uso_acumuladas, coste_hora, ubicacion, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nextCode("printers", "IMP-"),
    input.nombre.trim(),
    input.estado ?? "LIBRE",
    roundMoney(input.horasUsoAcumuladas ?? 0),
    roundMoney(input.costeHora),
    input.ubicacion?.trim() || null,
    nowIso(),
  );
}

export function updatePrinterRecord(input: {
  id: string;
  nombre: string;
  estado: PrinterState;
  horasUsoAcumuladas: number;
  costeHora: number;
  ubicacion?: string;
}) {
  if (!input.id || !input.nombre.trim()) {
    throw new Error("La impresora necesita ID y nombre.");
  }
  if (input.horasUsoAcumuladas < 0 || input.costeHora < 0) {
    throw new Error("No se permiten horas ni costes negativos.");
  }

  const activeOrders = rows<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE impresora_id = ? AND estado = 'INICIADA'`,
    input.id,
  );
  if (input.estado === "IMPRIMIENDO" && activeOrders.length !== 1) {
    throw new Error("Una impresora solo puede estar imprimiendo si tiene exactamente una orden activa asignada.");
  }
  if (input.estado !== "IMPRIMIENDO" && activeOrders.length > 0) {
    throw new Error("No se puede cambiar el estado de una impresora con una orden activa.");
  }

  run(
    `UPDATE printers
     SET nombre = ?, estado = ?, horas_uso_acumuladas = ?, coste_hora = ?, ubicacion = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    input.nombre.trim(),
    input.estado,
    roundMoney(input.horasUsoAcumuladas),
    roundMoney(input.costeHora),
    input.ubicacion?.trim() || null,
    nowIso(),
    input.id,
  );
}

export function restockFinishedProduct(
  productId: string,
  quantity: number,
  reason: string,
  location?: string,
  unitCost?: number,
) {
  const parsedQuantity = requirePositiveInteger(quantity, "La entrada de producto terminado debe ser mayor que cero.");
  const product = row<{ id: string; pvp: number }>(`SELECT id, pvp FROM products WHERE id = ?`, productId);
  if (!product) {
    throw new Error("El producto no existe.");
  }
  if (unitCost != null && unitCost < 0) {
    throw new Error("El coste unitario no puede ser negativo.");
  }

  transaction(() => {
    applyFinishedInventoryMovement({
      productId,
      tipo: "ENTRADA",
      cantidad: parsedQuantity,
      motivo: reason.trim() || "Entrada manual de producto terminado",
      referencia: "STOCK_PRODUCTO",
      ubicacion: location?.trim() ? location.trim() : undefined,
      costeUnitario: unitCost ?? undefined,
      precioVenta: product.pvp,
    });
  });
}

export function updateFinishedInventoryRecord(input: {
  id: string;
  cantidadDisponible: number;
  ubicacion?: string;
  costeUnitario: number;
  precioVenta: number;
}) {
  if (!input.id) {
    throw new Error("El inventario necesita ID.");
  }
  if (input.cantidadDisponible < 0 || input.costeUnitario < 0 || input.precioVenta < 0) {
    throw new Error("No se permiten cantidades ni importes negativos.");
  }

  const current = row<{
    id: string;
    codigo: string;
    product_id: string;
    cantidad_disponible: number;
  }>(`SELECT id, codigo, product_id, cantidad_disponible FROM finished_product_inventory WHERE id = ?`, input.id);
  if (!current) {
    throw new Error("El registro de inventario no existe.");
  }

  transaction(() => {
    const delta = Math.round(input.cantidadDisponible) - current.cantidad_disponible;
    if (delta === 0) {
      run(
        `UPDATE finished_product_inventory
         SET ubicacion = ?, coste_unitario = ?, precio_venta = ?, fecha_actualizacion = ?
         WHERE id = ?`,
        input.ubicacion?.trim() || null,
        roundMoney(input.costeUnitario),
        roundMoney(input.precioVenta),
        nowIso(),
        input.id,
      );
      syncFinishedInventoryMetrics(current.product_id);
      return;
    }

    applyFinishedInventoryMovement({
      productId: current.product_id,
      tipo: "AJUSTE",
      cantidad: Math.abs(delta),
      signedDelta: delta,
      motivo: delta > 0 ? "Ajuste manual al alza" : "Ajuste manual a la baja",
      referencia: current.codigo,
      ubicacion: input.ubicacion?.trim() || null,
      costeUnitario: input.costeUnitario,
      precioVenta: input.precioVenta,
    });
  });
}

export function confirmOrder(orderId: string) {
  const order = row<{ id: string; codigo: string; estado: string }>(
    `SELECT id, codigo, estado FROM orders WHERE id = ?`,
    orderId,
  );
  if (!order) {
    throw new Error("El pedido no existe.");
  }
  if (["EN_PRODUCCION", "LISTO", "ENTREGADO", "FACTURADO"].includes(order.estado)) {
    throw new Error("Solo se pueden confirmar pedidos pendientes de planificacion.");
  }

  const linesBase = rows<{ producto_id: string }>(
    `SELECT producto_id FROM order_lines WHERE pedido_id = ?`,
    orderId,
  );
  if (linesBase.length === 0) {
    throw new Error("El pedido no existe o no tiene lineas.");
  }

  for (const line of linesBase) {
    ensureFinishedInventoryRow(line.producto_id);
  }

  const lines = rows<{
    id: string;
    producto_id: string;
    cantidad: number;
    cantidad_desde_stock: number;
    precio_unitario: number;
    gramos_totales: number;
    producto_nombre: string;
    gramos_estimados: number;
    coste_electricidad: number;
    material_id: string;
    material_codigo: string;
    material_nombre: string;
    material_color: string;
    precio_kg: number;
    stock_actual_g: number;
    stock_producto_terminado: number;
    stock_coste_unitario: number;
  }>(
    `SELECT
       l.id,
       l.producto_id,
       l.cantidad,
       l.cantidad_desde_stock,
       l.precio_unitario,
       l.gramos_totales,
       p.nombre AS producto_nombre,
       p.gramos_estimados,
       p.coste_electricidad,
       m.id AS material_id,
       m.codigo AS material_codigo,
       m.nombre AS material_nombre,
       m.color AS material_color,
       m.precio_kg,
       m.stock_actual_g,
       fi.cantidad_disponible AS stock_producto_terminado,
       fi.coste_unitario AS stock_coste_unitario
     FROM order_lines l
     JOIN products p ON p.id = l.producto_id
     JOIN materials m ON m.id = p.material_id
     JOIN finished_product_inventory fi ON fi.product_id = l.producto_id
     WHERE l.pedido_id = ?
     ORDER BY l.codigo ASC`,
    orderId,
  );

  const incidents: string[] = [];
  let totalFromStock = 0;
  let totalToManufacture = 0;

  transaction(() => {
    restoreOrderInventoryAllocations(orderId, order.codigo);

    const materialNeeds = new Map<string, { required: number; available: number; label: string }>();
    const planning = lines.map((line) => {
      const availableFinished = line.stock_producto_terminado + line.cantidad_desde_stock;
      const fromStock = Math.min(line.cantidad, availableFinished);
      const toManufacture = line.cantidad - fromStock;
      const costs = calculateLineCosts({
        quantity: line.cantidad,
        unitPrice: line.precio_unitario,
        gramsPerUnit: line.gramos_estimados,
        materialPricePerKg: line.precio_kg,
        electricityCostPerUnit: line.coste_electricidad,
        fromStockUnits: fromStock,
        finishedUnitCost: line.stock_coste_unitario,
      });
      totalFromStock += fromStock;
      totalToManufacture += toManufacture;

      run(
        `UPDATE order_lines
         SET cantidad_desde_stock = ?, cantidad_a_fabricar = ?, precio_total_linea = ?, coste_material = ?, coste_electricidad_total = ?, coste_impresora_total = 0, coste_total = ?, beneficio = ?
         WHERE id = ?`,
        fromStock,
        toManufacture,
        roundMoney(line.precio_unitario * line.cantidad),
        costs.costeMaterial,
        costs.costeElectricidadTotal,
        costs.costeTotal,
        costs.beneficio,
        line.id,
      );

      if (fromStock > 0) {
        applyFinishedInventoryMovement({
          productId: line.producto_id,
          tipo: "SALIDA",
          cantidad: fromStock,
          motivo: `Stock terminado asignado a ${order.codigo}`,
          referencia: order.codigo,
        });
      }

      if (toManufacture > 0) {
        const materialEntry = materialNeeds.get(line.material_id) ?? {
          required: 0,
          available: line.stock_actual_g,
          label: `${line.material_codigo} ${line.material_nombre} ${line.material_color}`,
        };
        materialEntry.required += line.gramos_estimados * toManufacture;
        materialNeeds.set(line.material_id, materialEntry);
      }

      return { ...line, toManufacture };
    });

    incidents.push(
      ...Array.from(materialNeeds.values())
        .filter((entry) => entry.available < entry.required)
        .map((entry) => `${entry.label}: requiere ${entry.required} g y solo hay ${entry.available} g.`),
    );

    for (const line of planning) {
      if (line.toManufacture <= 0) {
        continue;
      }

      run(
        `INSERT INTO manufacturing_orders
          (id, codigo, pedido_id, linea_pedido_id, producto_id, cantidad, estado, fecha_inicio, fecha_fin, gramos_consumidos, tiempo_real_horas, coste_impresora_total, incidencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        nextCode("manufacturing_orders", "OF-"),
        orderId,
        line.id,
        line.producto_id,
        line.toManufacture,
        incidents.length > 0 ? "BLOQUEADA_POR_STOCK" : "PENDIENTE",
        null,
        null,
        null,
        null,
        0,
        incidents.length > 0 ? "Pendiente de reposicion de material." : null,
      );
    }

    const nextStatus =
      incidents.length > 0
        ? "INCIDENCIA_STOCK"
        : totalToManufacture === 0
          ? "LISTO"
          : "CONFIRMADO";

    run(`UPDATE orders SET estado = ? WHERE id = ?`, nextStatus, orderId);
    registerOrderHistory(
      orderId,
      nextStatus,
      nextStatus === "LISTO"
        ? `Pedido cubierto con stock terminado. ${totalFromStock} unidades salen directamente del inventario.`
        : incidents.length > 0
          ? incidents.join(" ")
          : `Pedido confirmado. ${totalFromStock} unidades salen de stock y ${totalToManufacture} pasan a fabricacion.`,
    );
    recalculateOrderTotals(orderId);
    syncFinishedInventoryMetricsForOrder(orderId);
  });

  return {
    ok: incidents.length === 0,
    incidents,
    fromStockUnits: totalFromStock,
    toManufactureUnits: totalToManufacture,
  };
}

export function retryOrderAfterRestock(orderId: string) {
  return confirmOrder(orderId);
}

export function updateOrderRecord(input: {
  id: string;
  clienteId: string;
  observaciones?: string;
  estado?: string;
  lines: LineInput[];
}) {
  if (!input.id || !input.clienteId) {
    throw new Error("Pedido incompleto.");
  }

  const current = row<{ estado: string; codigo: string }>(
    `SELECT estado, codigo FROM orders WHERE id = ?`,
    input.id,
  );
  if (!current) {
    throw new Error("El pedido no existe.");
  }
  const customer = row(`SELECT id FROM customers WHERE id = ?`, input.clienteId);
  if (!customer) {
    throw new Error("El cliente no existe.");
  }
  if (["EN_PRODUCCION", "LISTO", "ENTREGADO", "FACTURADO"].includes(current.estado)) {
    throw new Error("No se pueden editar pedidos ya lanzados a produccion o cerrados.");
  }

  const validLines = input.lines.filter((line) => line.productId && line.quantity > 0);
  if (validLines.length === 0) {
    throw new Error("Debes mantener al menos una linea valida.");
  }

  const calculations = validLines.map((line) => {
    const product = getProductOrThrow(line.productId);
    const values = draftLineCalculations(product, Math.round(line.quantity), line.unitPrice);
    return { line, values };
  });
  const subtotal = roundMoney(
    calculations.reduce((sum, item) => sum + item.values.precioUnitario * item.line.quantity, 0),
  );
  const costeTotalPedido = roundMoney(
    calculations.reduce((sum, item) => sum + item.values.costeTotal, 0),
  );
  const iva = roundMoney((subtotal * DEFAULT_VAT_RATE) / 100);
  const total = roundMoney(subtotal + iva);
  const beneficioTotal = roundMoney(subtotal - costeTotalPedido);
  const nextStatus = current.estado === "INCIDENCIA_STOCK" ? "INCIDENCIA_STOCK" : "BORRADOR";

  transaction(() => {
    restoreOrderInventoryAllocations(input.id, current.codigo);
    run(`DELETE FROM order_lines WHERE pedido_id = ?`, input.id);
    run(
      `UPDATE orders
       SET cliente_id = ?, observaciones = ?, estado = ?, subtotal = ?, iva = ?, total = ?, coste_total_pedido = ?, beneficio_total = ?
       WHERE id = ?`,
      input.clienteId,
      input.observaciones?.trim() || null,
      nextStatus,
      subtotal,
      iva,
      total,
      costeTotalPedido,
      beneficioTotal,
      input.id,
    );

    for (const item of calculations) {
      run(
        `INSERT INTO order_lines
          (id, codigo, pedido_id, producto_id, cantidad, cantidad_desde_stock, cantidad_a_fabricar, precio_unitario, precio_total_linea, gramos_totales, coste_material, coste_electricidad_total, coste_impresora_total, coste_total, beneficio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        nextCode("order_lines", "LIN-"),
        input.id,
        item.line.productId,
        Math.round(item.line.quantity),
        0,
        0,
        item.values.precioUnitario,
        item.values.precioTotalLinea,
        item.values.gramosTotales,
        item.values.costeMaterial,
        item.values.costeElectricidadTotal,
        item.values.costeImpresoraTotal,
        item.values.costeTotal,
        item.values.beneficio,
      );
    }

    registerOrderHistory(
      input.id,
      nextStatus,
      nextStatus === "INCIDENCIA_STOCK"
        ? "Pedido editado manualmente. Mantiene incidencia hasta revalidar stock."
        : "Pedido editado manualmente. Vuelve a borrador para recalcular stock y fabricacion.",
    );
    recalculateOrderTotals(input.id);
    syncFinishedInventoryMetricsForOrder(input.id);
  });
}

export function startManufacturingOrder(manufacturingOrderId: string) {
  const manufacturingOrder = row<{
    id: string;
    pedido_id: string;
    codigo: string;
    estado: string;
    cantidad: number;
    producto_nombre: string;
    gramos_estimados: number;
    stock_actual_g: number;
    impresora_id: string | null;
  }>(
    `SELECT
       mo.id,
       mo.pedido_id,
       mo.codigo,
       mo.estado,
       mo.cantidad,
       p.nombre AS producto_nombre,
       p.gramos_estimados,
       m.stock_actual_g,
       mo.impresora_id
     FROM manufacturing_orders mo
     JOIN products p ON p.id = mo.producto_id
     JOIN materials m ON m.id = p.material_id
     WHERE mo.id = ?`,
    manufacturingOrderId,
  );

  if (!manufacturingOrder) {
    throw new Error("La orden de fabricacion no existe.");
  }
  if (manufacturingOrder.estado === "INICIADA") {
    throw new Error("La orden ya esta iniciada.");
  }
  if (manufacturingOrder.estado === "COMPLETADA") {
    throw new Error("La orden ya esta completada.");
  }

  const gramsRequired = manufacturingOrder.gramos_estimados * manufacturingOrder.cantidad;
  if (manufacturingOrder.stock_actual_g < gramsRequired) {
    transaction(() => {
      run(
        `UPDATE manufacturing_orders
         SET estado = ?, incidencia = ?
         WHERE id = ?`,
        "BLOQUEADA_POR_STOCK",
        `No hay stock suficiente. Requiere ${gramsRequired} g y hay ${manufacturingOrder.stock_actual_g} g.`,
        manufacturingOrderId,
      );
      run(`UPDATE orders SET estado = ? WHERE id = ?`, "INCIDENCIA_STOCK", manufacturingOrder.pedido_id);
      registerOrderHistory(
        manufacturingOrder.pedido_id,
        "INCIDENCIA_STOCK",
        "La fabricacion no pudo iniciarse por falta de material.",
      );
    });
    throw new Error("No se puede iniciar fabricacion sin stock suficiente.");
  }

  const printer =
    (manufacturingOrder.impresora_id
      ? row<{
          id: string;
          codigo: string;
          nombre: string;
          estado: PrinterState;
          horas_uso_acumuladas: number;
          coste_hora: number;
        }>(`SELECT * FROM printers WHERE id = ?`, manufacturingOrder.impresora_id)
      : undefined) ?? getFirstAvailablePrinter();

  if (!printer) {
    throw new Error("No hay impresoras libres para lanzar la orden.");
  }
  if (printer.estado !== "LIBRE") {
    throw new Error("La impresora asignada no esta libre.");
  }

  const busyConflict = row<{ id: string }>(
    `SELECT id
     FROM manufacturing_orders
     WHERE impresora_id = ? AND estado = 'INICIADA' AND id <> ?
     LIMIT 1`,
    printer.id,
    manufacturingOrderId,
  );
  if (busyConflict) {
    throw new Error("La impresora seleccionada ya tiene una orden activa.");
  }

  transaction(() => {
    run(
      `UPDATE manufacturing_orders
       SET estado = ?, impresora_id = ?, fecha_inicio = COALESCE(fecha_inicio, ?), incidencia = NULL
       WHERE id = ?`,
      "INICIADA",
      printer.id,
      nowIso(),
      manufacturingOrderId,
    );
    run(
      `UPDATE printers
       SET estado = 'IMPRIMIENDO', fecha_actualizacion = ?
       WHERE id = ?`,
      nowIso(),
      printer.id,
    );
    run(`UPDATE orders SET estado = ? WHERE id = ?`, "EN_PRODUCCION", manufacturingOrder.pedido_id);
    registerOrderHistory(
      manufacturingOrder.pedido_id,
      "EN_PRODUCCION",
      `Fabricacion iniciada para ${manufacturingOrder.producto_nombre} en ${printer.nombre}.`,
    );
  });
}

export function completeManufacturingOrder(manufacturingOrderId: string) {
  const manufacturingOrder = row<{
    id: string;
    codigo: string;
    pedido_id: string;
    linea_pedido_id: string;
    producto_id: string;
    cantidad: number;
    estado: string;
    tiempo_real_horas: number | null;
    producto_nombre: string;
    gramos_estimados: number;
    tiempo_impresion_horas: number;
    coste_electricidad: number;
    material_id: string;
    precio_kg: number;
    stock_actual_g: number;
    pedido_codigo: string;
    impresora_id: string | null;
    impresora_nombre: string | null;
    coste_hora: number | null;
    line_precio_unitario: number;
    line_coste_material: number;
    line_coste_electricidad_total: number;
    line_cantidad_desde_stock: number;
  }>(
    `SELECT
       mo.id,
       mo.codigo,
       mo.pedido_id,
       mo.linea_pedido_id,
       mo.producto_id,
       mo.cantidad,
       mo.estado,
       mo.tiempo_real_horas,
       p.nombre AS producto_nombre,
       p.gramos_estimados,
       p.tiempo_impresion_horas,
       p.coste_electricidad,
       m.id AS material_id,
       m.precio_kg,
       m.stock_actual_g,
       o.codigo AS pedido_codigo,
       pr.id AS impresora_id,
       pr.nombre AS impresora_nombre,
       pr.coste_hora,
       l.precio_unitario AS line_precio_unitario,
       l.coste_material AS line_coste_material,
       l.coste_electricidad_total AS line_coste_electricidad_total,
       l.cantidad_desde_stock AS line_cantidad_desde_stock
     FROM manufacturing_orders mo
     JOIN order_lines l ON l.id = mo.linea_pedido_id
     JOIN products p ON p.id = mo.producto_id
     JOIN materials m ON m.id = p.material_id
     JOIN orders o ON o.id = mo.pedido_id
     LEFT JOIN printers pr ON pr.id = mo.impresora_id
     WHERE mo.id = ?`,
    manufacturingOrderId,
  );

  if (!manufacturingOrder) {
    throw new Error("La orden de fabricacion no existe.");
  }

  if (manufacturingOrder.estado !== "INICIADA") {
    throw new Error("No se puede completar una fabricacion que no ha sido iniciada.");
  }

  const gramsRequired = manufacturingOrder.gramos_estimados * manufacturingOrder.cantidad;
  if (manufacturingOrder.stock_actual_g < gramsRequired) {
    throw new Error("No se puede fabricar sin stock suficiente.");
  }
  if (!manufacturingOrder.impresora_id || !manufacturingOrder.impresora_nombre) {
    throw new Error("La orden necesita una impresora asignada.");
  }

  const totalHours = roundMoney(
    manufacturingOrder.tiempo_real_horas && manufacturingOrder.tiempo_real_horas > 0
      ? manufacturingOrder.tiempo_real_horas
      : manufacturingOrder.tiempo_impresion_horas * manufacturingOrder.cantidad,
  );
  const materialCost = roundMoney((manufacturingOrder.precio_kg / 1000) * gramsRequired);
  const electricityCost = roundMoney(
    manufacturingOrder.coste_electricidad * manufacturingOrder.cantidad,
  );
  const printerCost = roundMoney((manufacturingOrder.coste_hora ?? 0) * totalHours);
  const unitCost = roundMoney((materialCost + electricityCost + printerCost) / manufacturingOrder.cantidad);
  const updatedLineCosts = calculateLineCosts({
    quantity: manufacturingOrder.line_cantidad_desde_stock + manufacturingOrder.cantidad,
    unitPrice: manufacturingOrder.line_precio_unitario,
    gramsPerUnit: manufacturingOrder.gramos_estimados,
    materialPricePerKg: manufacturingOrder.precio_kg,
    electricityCostPerUnit: manufacturingOrder.coste_electricidad,
    fromStockUnits: manufacturingOrder.line_cantidad_desde_stock,
    finishedUnitCost:
      manufacturingOrder.line_cantidad_desde_stock > 0
        ? manufacturingOrder.line_coste_material / manufacturingOrder.line_cantidad_desde_stock
        : 0,
    printerCostTotal: printerCost,
  });

  transaction(() => {
    run(
      `UPDATE manufacturing_orders
       SET estado = ?, fecha_fin = ?, gramos_consumidos = ?, tiempo_real_horas = ?, coste_impresora_total = ?, incidencia = NULL
       WHERE id = ?`,
      "COMPLETADA",
      nowIso(),
      gramsRequired,
      totalHours,
      printerCost,
      manufacturingOrderId,
    );
    run(
      `UPDATE order_lines
       SET precio_total_linea = ?, coste_material = ?, coste_electricidad_total = ?, coste_impresora_total = ?, coste_total = ?, beneficio = ?
       WHERE id = ?`,
      roundMoney(manufacturingOrder.line_precio_unitario * (manufacturingOrder.line_cantidad_desde_stock + manufacturingOrder.cantidad)),
      updatedLineCosts.costeMaterial,
      updatedLineCosts.costeElectricidadTotal,
      updatedLineCosts.costeImpresoraTotal,
      updatedLineCosts.costeTotal,
      updatedLineCosts.beneficio,
      manufacturingOrder.linea_pedido_id,
    );

    applyMaterialInventoryMovement({
      materialId: manufacturingOrder.material_id,
      tipo: "SALIDA",
      cantidadG: gramsRequired,
      motivo: `Consumo en ${manufacturingOrder.codigo}`,
      referencia: manufacturingOrder.pedido_codigo,
    });

    applyFinishedInventoryMovement({
      productId: manufacturingOrder.producto_id,
      tipo: "ENTRADA",
      cantidad: manufacturingOrder.cantidad,
      motivo: `Produccion completada en ${manufacturingOrder.codigo}`,
      referencia: manufacturingOrder.codigo,
      costeUnitario: unitCost,
    });

    applyFinishedInventoryMovement({
      productId: manufacturingOrder.producto_id,
      tipo: "SALIDA",
      cantidad: manufacturingOrder.cantidad,
      motivo: `Producto fabricado asignado a ${manufacturingOrder.pedido_codigo}`,
      referencia: manufacturingOrder.pedido_codigo,
    });

    run(
      `UPDATE printers
       SET estado = 'LIBRE', horas_uso_acumuladas = horas_uso_acumuladas + ?, fecha_actualizacion = ?
       WHERE id = ?`,
      totalHours,
      nowIso(),
      manufacturingOrder.impresora_id,
    );

    const pendingStates = rows<{ estado: string }>(
      `SELECT estado FROM manufacturing_orders WHERE pedido_id = ?`,
      manufacturingOrder.pedido_id,
    ).map((item) => item.estado);

    const nextStatus = pendingStates.some((item) => item === "BLOQUEADA_POR_STOCK")
      ? "INCIDENCIA_STOCK"
      : pendingStates.every((item) => item === "COMPLETADA")
        ? "LISTO"
        : "EN_PRODUCCION";

    run(`UPDATE orders SET estado = ? WHERE id = ?`, nextStatus, manufacturingOrder.pedido_id);
    registerOrderHistory(
      manufacturingOrder.pedido_id,
      nextStatus,
      nextStatus === "LISTO"
        ? "Todas las lineas fabricables estan completadas. Pedido listo."
        : `Fabricacion completada para ${manufacturingOrder.producto_nombre}.`,
    );
    recalculateOrderTotals(manufacturingOrder.pedido_id);
    syncFinishedInventoryMetrics(manufacturingOrder.producto_id);
  });

  return {
    grams: gramsRequired,
    materialCost,
    electricityCost,
    printerCost,
    totalHours,
  };
}

export function restockMaterial(materialId: string, quantityG: number, reason: string) {
  const parsedQuantity = requirePositiveInteger(quantityG, "La reposicion debe ser mayor que cero.");

  transaction(() => {
    applyMaterialInventoryMovement({
      materialId,
      tipo: "ENTRADA",
      cantidadG: parsedQuantity,
      motivo: reason.trim() || "Reposicion manual",
      referencia: "REPOSICION",
    });
  });
}

export function deliverOrder(orderId: string) {
  const order = row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId);
  if (!order) {
    throw new Error("El pedido no existe.");
  }
  if (order.estado !== "LISTO") {
    throw new Error("Solo se pueden entregar pedidos que esten listos.");
  }

  const pendingUnits = countUnfulfilledOrderLines(orderId);
  if (pendingUnits > 0) {
    throw new Error("No se puede entregar un pedido con unidades pendientes.");
  }

  transaction(() => {
    run(`UPDATE orders SET estado = ? WHERE id = ?`, "ENTREGADO", orderId);
    registerOrderHistory(orderId, "ENTREGADO", "Pedido entregado al cliente.");
    syncFinishedInventoryMetricsForOrder(orderId);
  });
}

export function generateInvoiceForOrder(orderId: string) {
  const order = row<{
    id: string;
    codigo: string;
    cliente_id: string;
    estado: string;
    subtotal: number;
    iva: number;
    total: number;
  }>(`SELECT * FROM orders WHERE id = ?`, orderId);

  if (!order) {
    throw new Error("El pedido no existe.");
  }
  if (countUnfulfilledOrderLines(orderId) > 0) {
    throw new Error("No se puede facturar un pedido incompleto.");
  }

  const existing = row(`SELECT id FROM invoices WHERE pedido_id = ?`, orderId);
  if (existing) {
    return;
  }
  if (order.estado !== "ENTREGADO") {
    throw new Error("No se puede facturar si el pedido no esta entregado.");
  }

  transaction(() => {
    const codigo = nextCode("invoices", "FAC-");
    run(
      `INSERT INTO invoices
        (id, codigo, pedido_id, cliente_id, fecha, subtotal, iva, total, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      codigo,
      order.id,
      order.cliente_id,
      nowIso(),
      order.subtotal,
      order.iva,
      order.total,
      "PENDIENTE",
    );
    run(`UPDATE orders SET estado = ?, estado_pago = ? WHERE id = ?`, "FACTURADO", "PENDIENTE", orderId);
    registerOrderHistory(orderId, "FACTURADO", `Factura ${codigo} generada.`);
    syncFinishedInventoryMetricsForOrder(orderId);
  });
}
