import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import {
  completeManufacturingOrder,
  confirmOrder,
  createCustomerRecord,
  createMaterialRecord,
  createOrderRecord,
  createPrinterRecord,
  createProductRecord,
  deliverOrder,
  generateInvoiceForOrder,
  resetDatabase,
  restockFinishedProduct,
  runDemoSimulation,
  startManufacturingOrder,
  updateManufacturingOrderRecord,
  updateMaterialRecord,
  updateOrderRecord,
  updatePrinterRecord,
} from "../lib/erp-service";

function row<T>(statement: string, ...params: unknown[]) {
  return db.prepare(statement).get(...params) as T | undefined;
}

function rows<T>(statement: string, ...params: unknown[]) {
  return db.prepare(statement).all(...params) as T[];
}

function ids() {
  return {
    customerId: row<{ id: string }>(`SELECT id FROM customers LIMIT 1`)?.id ?? "",
    materialId: row<{ id: string }>(`SELECT id FROM materials LIMIT 1`)?.id ?? "",
    productId: row<{ id: string }>(`SELECT id FROM products LIMIT 1`)?.id ?? "",
  };
}

function setupSingleProductFixture(input?: {
  materialStock?: number;
  productName?: string;
  grams?: number;
  hours?: number;
  electricity?: number;
}) {
  createCustomerRecord({ nombre: "Cliente Test" });
  createMaterialRecord({
    nombre: "PLA Test",
    marca: "Marca",
    tipo: "PLA",
    color: "Negro",
    precioKg: 20,
    stockActualG: input?.materialStock ?? 1000,
    stockMinimoG: 100,
  });
  const materialId = row<{ id: string }>(`SELECT id FROM materials LIMIT 1`)!.id;
  createProductRecord({
    nombre: input?.productName ?? "Producto Test",
    gramosEstimados: input?.grams ?? 100,
    tiempoImpresionHoras: input?.hours ?? 2,
    costeElectricidad: input?.electricity ?? 1.5,
    margen: 10,
    pvp: 30,
    materialId,
  });
  createPrinterRecord({ nombre: "Impresora 1", costeHora: 2, horasUsoAcumuladas: 0, estado: "LIBRE" });

  return ids();
}

beforeEach(() => {
  resetDatabase();
});

test("usa stock terminado completo sin fabricar", () => {
  const { customerId, productId } = setupSingleProductFixture();
  restockFinishedProduct(productId, 5, "Carga inicial", "A1", 8);
  const orderId = createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 3 }],
  });

  const confirmation = confirmOrder(orderId);
  const order = row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!;
  const line = row<{ cantidad_desde_stock: number; cantidad_a_fabricar: number }>(
    `SELECT cantidad_desde_stock, cantidad_a_fabricar FROM order_lines WHERE pedido_id = ?`,
    orderId,
  )!;
  const manufacturingCount = row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  )!;
  const stock = row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  )!;

  assert.equal(confirmation.ok, true);
  assert.equal(confirmation.fromStockUnits, 3);
  assert.equal(confirmation.toManufactureUnits, 0);
  assert.equal(order.estado, "LISTO");
  assert.equal(line.cantidad_desde_stock, 3);
  assert.equal(line.cantidad_a_fabricar, 0);
  assert.equal(manufacturingCount.total, 0);
  assert.equal(stock.cantidad_disponible, 2);
});

test("reconfirmar un pedido no duplica salidas netas de stock terminado", () => {
  const { customerId, productId } = setupSingleProductFixture();
  restockFinishedProduct(productId, 2, "Carga inicial", "A1", 8);
  const orderId = createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 4 }],
  });

  confirmOrder(orderId);
  confirmOrder(orderId);

  const stock = row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  )!;
  const manufacturingCount = row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  )!;

  assert.equal(stock.cantidad_disponible, 0);
  assert.equal(manufacturingCount.total, 1);
});

test("flujo mixto usa stock terminado y fabrica el resto", () => {
  const { customerId, productId, materialId } = setupSingleProductFixture({ materialStock: 1000, grams: 120, hours: 3, electricity: 2 });
  restockFinishedProduct(productId, 1, "Carga inicial", "A1", 9);
  const orderId = createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 3 }],
  });

  const confirmation = confirmOrder(orderId);
  const mo = row<{ id: string; cantidad: number }>(
    `SELECT id, cantidad FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  )!;
  startManufacturingOrder(mo.id);
  completeManufacturingOrder(mo.id);
  const order = row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!;
  const material = row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId)!;
  const inventory = row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  )!;

  assert.equal(confirmation.fromStockUnits, 1);
  assert.equal(confirmation.toManufactureUnits, 2);
  assert.equal(mo.cantidad, 2);
  assert.equal(order.estado, "LISTO");
  assert.equal(material.stock_actual_g, 760);
  assert.equal(inventory.cantidad_disponible, 0);
});

test("bloquea el pedido si faltan materiales y no consume stock", () => {
  const { customerId, productId, materialId } = setupSingleProductFixture({ materialStock: 50, grams: 100 });
  const orderId = createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

  const confirmation = confirmOrder(orderId);
  const order = row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!;
  const material = row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId)!;

  assert.equal(confirmation.ok, false);
  assert.ok(confirmation.incidents.length > 0);
  assert.equal(order.estado, "INCIDENCIA_STOCK");
  assert.equal(material.stock_actual_g, 50);
});

test("fabricacion completa consume materiales y registra movimientos", () => {
  const { customerId, productId, materialId } = setupSingleProductFixture({ materialStock: 1000, grams: 200, hours: 4, electricity: 1 });
  const orderId = createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

  confirmOrder(orderId);
  const mo = row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId)!;
  startManufacturingOrder(mo.id);
  const result = completeManufacturingOrder(mo.id);
  const material = row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId)!;
  const stockMovement = row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM stock_movements WHERE material_id = ? AND tipo = 'SALIDA'`,
    materialId,
  )!;
  const inventoryMovements = row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM inventory_movements`,
  );

  assert.equal(result.grams, 400);
  assert.equal(material.stock_actual_g, 600);
  assert.equal(stockMovement.total, 1);
  assert.ok((inventoryMovements?.total ?? 0) >= 2);
});

test("no permite movimientos con cantidad cero ni stock negativo", () => {
  const { productId } = setupSingleProductFixture();
  assert.throws(() => restockFinishedProduct(productId, 0, "Invalido"), /mayor que cero|cantidad/i);
  assert.throws(() => restockFinishedProduct(productId, 1, "Invalido", "A1", -1), /coste unitario/i);
});

test("no permite modificar stock actual del material sin movimiento", () => {
  const { materialId } = setupSingleProductFixture();
  assert.throws(
    () =>
      updateMaterialRecord({
        id: materialId,
        nombre: "PLA Test",
        marca: "Marca",
        tipo: "PLA",
        color: "Negro",
        precioKg: 20,
        stockActualG: 999,
        stockMinimoG: 100,
      }),
    /stock actual solo se modifica/i,
  );
});

test("solo permite una orden activa por impresora y asigna impresora correcta", () => {
  createCustomerRecord({ nombre: "Cliente Test" });
  createMaterialRecord({ nombre: "PLA Test", marca: "Marca", tipo: "PLA", color: "Negro", precioKg: 20, stockActualG: 5000, stockMinimoG: 100 });
  const materialId = row<{ id: string }>(`SELECT id FROM materials LIMIT 1`)!.id;
  createProductRecord({ nombre: "Producto A", gramosEstimados: 100, tiempoImpresionHoras: 2, costeElectricidad: 1, margen: 5, pvp: 20, materialId });
  createProductRecord({ nombre: "Producto B", gramosEstimados: 100, tiempoImpresionHoras: 2, costeElectricidad: 1, margen: 5, pvp: 20, materialId });
  createPrinterRecord({ nombre: "Impresora lenta", costeHora: 2, horasUsoAcumuladas: 10, estado: "MANTENIMIENTO" });
  createPrinterRecord({ nombre: "Impresora fresca", costeHora: 2, horasUsoAcumuladas: 1, estado: "LIBRE" });
  const customerId = row<{ id: string }>(`SELECT id FROM customers LIMIT 1`)!.id;
  const products = rows<{ id: string }>(`SELECT id FROM products ORDER BY nombre ASC`);

  const order1 = createOrderRecord({ clienteId: customerId, lines: [{ productId: products[0].id, quantity: 1 }] });
  const order2 = createOrderRecord({ clienteId: customerId, lines: [{ productId: products[1].id, quantity: 1 }] });
  confirmOrder(order1);
  confirmOrder(order2);
  const orders = rows<{ id: string }>(`SELECT id FROM manufacturing_orders ORDER BY codigo ASC`);

  startManufacturingOrder(orders[0].id);
  const assigned = row<{ impresora_nombre: string }>(
    `SELECT pr.nombre AS impresora_nombre
     FROM manufacturing_orders mo JOIN printers pr ON pr.id = mo.impresora_id
     WHERE mo.id = ?`,
    orders[0].id,
  )!;

  assert.equal(assigned.impresora_nombre, "Impresora fresca");
  assert.throws(() => startManufacturingOrder(orders[1].id), /orden activa|impresoras libres/i);
});

test("no permite marcar impresoras manualmente en estados incoherentes", () => {
  const { customerId, productId } = setupSingleProductFixture();
  const printerId = row<{ id: string }>(`SELECT id FROM printers LIMIT 1`)!.id;
  assert.throws(
    () =>
      updatePrinterRecord({
        id: printerId,
        nombre: "Impresora 1",
        estado: "IMPRIMIENDO",
        horasUsoAcumuladas: 0,
        costeHora: 2,
      }),
    /exactamente una orden activa/i,
  );

  const orderId = createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  confirmOrder(orderId);
  const manufacturingId = row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  )!.id;
  startManufacturingOrder(manufacturingId);

  assert.throws(
    () =>
      updatePrinterRecord({
        id: printerId,
        nombre: "Impresora 1",
        estado: "MANTENIMIENTO",
        horasUsoAcumuladas: 0,
        costeHora: 2,
      }),
    /orden activa/i,
  );
});

test("acumula horas y coste por impresora al completar fabricacion", () => {
  const { customerId, productId } = setupSingleProductFixture({ materialStock: 1000, grams: 100, hours: 3, electricity: 1 });
  const orderId = createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 2 }] });
  confirmOrder(orderId);
  const mo = row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId)!;
  startManufacturingOrder(mo.id);
  const result = completeManufacturingOrder(mo.id);
  const printer = row<{ horas_uso_acumuladas: number; estado: string }>(`SELECT horas_uso_acumuladas, estado FROM printers LIMIT 1`)!;
  const line = row<{ coste_impresora_total: number; coste_total: number }>(
    `SELECT coste_impresora_total, coste_total FROM order_lines WHERE pedido_id = ?`,
    orderId,
  )!;

  assert.equal(result.totalHours, 6);
  assert.equal(result.printerCost, 12);
  assert.equal(printer.horas_uso_acumuladas, 6);
  assert.equal(printer.estado, "LIBRE");
  assert.equal(line.coste_impresora_total, 12);
  assert.ok(line.coste_total >= 12);
});

test("no permite completar fabricacion sin haber iniciado y asignado impresora", () => {
  const { customerId, productId } = setupSingleProductFixture();
  const orderId = createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  confirmOrder(orderId);
  const mo = row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId)!;
  assert.throws(() => completeManufacturingOrder(mo.id), /no ha sido iniciada|impresora/i);
});

test("no permite forzar estados manuales de fabricacion ni editar pedidos cerrados logicamente", () => {
  const { customerId, productId } = setupSingleProductFixture();
  const orderId = createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  confirmOrder(orderId);
  const mo = row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId)!;

  assert.throws(
    () =>
      updateManufacturingOrderRecord({
        id: mo.id,
        estado: "INICIADA",
        cantidad: 1,
      }),
    /acciones dedicadas/i,
  );

  updateOrderRecord({
    id: orderId,
    clienteId: customerId,
    estado: "FACTURADO",
    lines: [{ productId, quantity: 1 }],
  });

  assert.equal(row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!.estado, "BORRADOR");
});

test("estados del pedido transicionan correctamente y la factura solo se genera cuando procede", () => {
  const { customerId, productId } = setupSingleProductFixture();
  const orderId = createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  confirmOrder(orderId);
  const mo = row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId)!;

  assert.throws(() => generateInvoiceForOrder(orderId), /no se puede facturar/i);

  startManufacturingOrder(mo.id);
  assert.equal(row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!.estado, "EN_PRODUCCION");
  completeManufacturingOrder(mo.id);
  assert.equal(row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!.estado, "LISTO");
  deliverOrder(orderId);
  assert.equal(row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!.estado, "ENTREGADO");
  generateInvoiceForOrder(orderId);
  assert.equal(row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId)!.estado, "FACTURADO");
  assert.equal(row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices WHERE pedido_id = ?`, orderId)!.total, 1);
  generateInvoiceForOrder(orderId);
  assert.equal(row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices WHERE pedido_id = ?`, orderId)!.total, 1);
});

test("la demo completa genera escenarios y trazabilidad", () => {
  runDemoSimulation();
  const scenarios = row<{ total: number }>(`SELECT COUNT(*) AS total FROM demo_scenario_results`)!.total;
  const movements = row<{ total: number }>(`SELECT COUNT(*) AS total FROM inventory_movements`)!.total;
  assert.ok(scenarios >= 4);
  assert.ok(movements > 0);
});
