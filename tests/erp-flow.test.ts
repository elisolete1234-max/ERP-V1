import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildCsvFilename, formatCsvDateTime, formatCsvMoney, serializeCsv } from "../lib/csv";
import { row, rows, run } from "../lib/db";
import {
  completeManufacturingOrder,
  confirmOrder,
  createCustomerRecord,
  createInvoicePaymentRecord,
  createMaterialRecord,
  createOrderRecord,
  createPrinterRecord,
  createProductRecord,
  deliverOrder,
  deleteMaterialRecord,
  generateInvoiceForOrder,
  getAppSnapshot,
  getInvoicePaymentsExportRows,
  getInvoicesExportRows,
  resetDatabase,
  restockFinishedProduct,
  setCustomerActiveState,
  setMaterialActiveState,
  setPrinterActiveState,
  setProductActiveState,
  startManufacturingOrder,
  updateManufacturingOrderRecord,
  updateMaterialRecord,
  updateProductRecord,
  updateOrderRecord,
  updatePrinterRecord,
} from "../lib/erp-service";

type CsvFixtureRow = {
  codigo: string;
  cliente: string;
  notas: string;
};

async function ids() {
  return {
    customerId: (await row<{ id: string }>(`SELECT id FROM customers LIMIT 1`))?.id ?? "",
    materialId: (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))?.id ?? "",
    productId: (await row<{ id: string }>(`SELECT id FROM products LIMIT 1`))?.id ?? "",
  };
}

async function setupSingleProductFixture(input?: {
  materialStock?: number;
  productName?: string;
  grams?: number;
  hours?: number;
  electricity?: number;
}) {
  await createCustomerRecord({ nombre: "Cliente Test" });
  await createMaterialRecord({
    nombre: "PLA Test",
    marca: "Marca",
    tipo: "PLA",
    color: "Negro",
    precioKg: 20,
    stockActualG: input?.materialStock ?? 1000,
    stockMinimoG: 100,
  });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;
  await createProductRecord({
    nombre: input?.productName ?? "Producto Test",
    gramosEstimados: input?.grams ?? 100,
    tiempoImpresionHoras: input?.hours ?? 2,
    costeElectricidad: input?.electricity ?? 1.5,
    margen: 10,
    pvp: 30,
    materialId,
  });
  await createPrinterRecord({ nombre: "Impresora 1", costeHora: 2, horasUsoAcumuladas: 0, estado: "LIBRE" });

  return ids();
}

beforeEach(async () => {
  await resetDatabase();
});

test("la base reseteada arranca sin datos de negocio", async () => {
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM customers`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM materials`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM products`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM orders`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM order_lines`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM manufacturing_orders`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM printers`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM finished_product_inventory`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM inventory_movements`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices`))!.total, 0);
});

test("serializeCsv escapa comillas, delimitadores y preserva encabezados", () => {
  const csv = serializeCsv(
    [
      {
        codigo: 'FAC-"001"',
        cliente: "Mateo; Studio",
        notas: "Linea 1\nLinea 2",
      },
    ],
    {
      columns: [
        { header: "codigo_factura", value: (row: CsvFixtureRow) => row.codigo },
        { header: "cliente", value: (row: CsvFixtureRow) => row.cliente },
        { header: "notas", value: (row: CsvFixtureRow) => row.notas },
      ],
    },
  );

  assert.equal(
    csv,
    'codigo_factura;cliente;notas\r\n"FAC-""001""";"Mateo; Studio";Linea 1 Linea 2',
  );
});

test("helpers CSV formatean importes, fechas y nombres de archivo de forma estable", () => {
  assert.equal(formatCsvMoney(1234.5), "1234,50");
  assert.equal(formatCsvDateTime("2026-04-17T08:05:00"), "2026-04-17 08:05");
  assert.equal(buildCsvFilename("facturas", new Date("2026-04-17T08:05:00")), "facturas-20260417-0805.csv");
});

test("usa stock terminado completo sin fabricar", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await restockFinishedProduct(productId, 5, "Carga inicial", "A1", 8);
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 3 }],
  });

  const confirmation = await confirmOrder(orderId);
  const order = (await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!;
  const line = (await row<{ cantidad_desde_stock: number; cantidad_a_fabricar: number }>(
    `SELECT cantidad_desde_stock, cantidad_a_fabricar FROM order_lines WHERE pedido_id = ?`,
    orderId,
  ))!;
  const manufacturingCount = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!;
  const stock = (await row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  ))!;

  assert.equal(confirmation.ok, true);
  assert.equal(confirmation.fromStockUnits, 3);
  assert.equal(confirmation.toManufactureUnits, 0);
  assert.equal(order.estado, "LISTO");
  assert.equal(line.cantidad_desde_stock, 3);
  assert.equal(line.cantidad_a_fabricar, 0);
  assert.equal(manufacturingCount.total, 0);
  assert.equal(stock.cantidad_disponible, 2);
});

test("reconfirmar un pedido no duplica salidas netas de stock terminado", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await restockFinishedProduct(productId, 2, "Carga inicial", "A1", 8);
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 4 }],
  });

  await confirmOrder(orderId);
  await confirmOrder(orderId);

  const stock = (await row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  ))!;
  const manufacturingCount = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!;

  assert.equal(stock.cantidad_disponible, 0);
  assert.equal(manufacturingCount.total, 1);
});

test("flujo mixto usa stock terminado y fabrica el resto", async () => {
  const { customerId, productId, materialId } = await setupSingleProductFixture({ materialStock: 1000, grams: 120, hours: 3, electricity: 2 });
  await restockFinishedProduct(productId, 1, "Carga inicial", "A1", 9);
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 3 }],
  });

  const confirmation = await confirmOrder(orderId);
  const mo = (await row<{ id: string; cantidad: number }>(
    `SELECT id, cantidad FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!;
  await startManufacturingOrder(mo.id);
  await completeManufacturingOrder(mo.id);
  const order = (await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!;
  const material = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;
  const inventory = (await row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  ))!;

  assert.equal(confirmation.fromStockUnits, 1);
  assert.equal(confirmation.toManufactureUnits, 2);
  assert.equal(mo.cantidad, 2);
  assert.equal(order.estado, "LISTO");
  assert.equal(material.stock_actual_g, 760);
  assert.equal(inventory.cantidad_disponible, 0);
});

test("bloquea el pedido si faltan materiales y no consume stock", async () => {
  const { customerId, productId, materialId } = await setupSingleProductFixture({ materialStock: 50, grams: 100 });
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

  const confirmation = await confirmOrder(orderId);
  const order = (await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!;
  const material = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;

  assert.equal(confirmation.ok, false);
  assert.ok(confirmation.incidents.length > 0);
  assert.equal(order.estado, "INCIDENCIA_STOCK");
  assert.equal(material.stock_actual_g, 50);
});

test("fabricacion completa consume materiales y registra movimientos", async () => {
  const { customerId, productId, materialId } = await setupSingleProductFixture({ materialStock: 1000, grams: 200, hours: 4, electricity: 1 });
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

  await confirmOrder(orderId);
  const mo = (await row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId))!;
  await startManufacturingOrder(mo.id);
  const result = await completeManufacturingOrder(mo.id);
  const material = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;
  const stockMovement = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM stock_movements WHERE material_id = ? AND tipo = 'SALIDA'`,
    materialId,
  ))!;
  const inventoryMovements = await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM inventory_movements`,
  );

  assert.equal(result.grams, 400);
  assert.equal(material.stock_actual_g, 600);
  assert.equal(stockMovement.total, 1);
  assert.ok((inventoryMovements?.total ?? 0) >= 2);
});

test("no permite movimientos con cantidad cero ni stock negativo", async () => {
  const { productId } = await setupSingleProductFixture();
  await assert.rejects(() => restockFinishedProduct(productId, 0, "Invalido"), /mayor que cero|cantidad/i);
  await assert.rejects(() => restockFinishedProduct(productId, 1, "Invalido", "A1", -1), /coste unitario/i);
});

test("no permite modificar stock actual del material sin movimiento", async () => {
  const { materialId } = await setupSingleProductFixture();
  await assert.rejects(
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

test("editar material conserva campos opcionales vacios y guarda el detalle V2", async () => {
  const { materialId } = await setupSingleProductFixture();

  await updateMaterialRecord({
    id: materialId,
    nombre: "PLA Studio",
    marca: "ColorLab",
    tipo: "PLA",
    color: "Blanco",
    tipoColor: "Gradient",
    efecto: "Silk",
    colorBase: "Blanco",
    nombreComercial: "Pearl Flow",
    diametroMm: undefined,
    pesoSpoolG: 1000,
    tempExtrusor: 210,
    tempCama: undefined,
    precioKg: 21.5,
    stockActualG: 1000,
    stockMinimoG: 120,
    proveedor: "Proveedor X",
    notas: "Perfil verificado",
  });

  const material = (await row<{
    nombre: string;
    marca: string;
    tipo_color: string | null;
    efecto: string | null;
    color_base: string | null;
    nombre_comercial: string | null;
    diametro_mm: number | null;
    peso_spool_g: number | null;
    temp_extrusor: number | null;
    temp_cama: number | null;
  }>(
    `SELECT nombre, marca, tipo_color, efecto, color_base, nombre_comercial, diametro_mm, peso_spool_g, temp_extrusor, temp_cama
     FROM materials
     WHERE id = ?`,
    materialId,
  ))!;

  assert.equal(material.nombre, "PLA Studio");
  assert.equal(material.marca, "ColorLab");
  assert.equal(material.tipo_color, "Gradient");
  assert.equal(material.efecto, "Silk");
  assert.equal(material.color_base, "Blanco");
  assert.equal(material.nombre_comercial, "Pearl Flow");
  assert.equal(material.diametro_mm, null);
  assert.equal(material.peso_spool_g, 1000);
  assert.equal(material.temp_extrusor, 210);
  assert.equal(material.temp_cama, null);
});

test("permite dar de baja y reactivar materiales sin borrar su historico", async () => {
  const { materialId } = await setupSingleProductFixture();

  await setMaterialActiveState(materialId, false);
  assert.equal((await row<{ activo: number }>(`SELECT activo FROM materials WHERE id = ?`, materialId))!.activo, 0);

  await setMaterialActiveState(materialId, true);
  assert.equal((await row<{ activo: number }>(`SELECT activo FROM materials WHERE id = ?`, materialId))!.activo, 1);
});

test("solo elimina de verdad materiales inactivos y sin historico ni relaciones", async () => {
  await createMaterialRecord({ nombre: "Material temporal" });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  await assert.rejects(() => deleteMaterialRecord(materialId), /dar de baja/i);

  await setMaterialActiveState(materialId, false);
  await deleteMaterialRecord(materialId);

  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM materials WHERE id = ?`, materialId))!.total, 0);
});

test("bloquea la eliminacion real si el material tiene productos o movimientos", async () => {
  const { materialId } = await setupSingleProductFixture();
  await setMaterialActiveState(materialId, false);

  await assert.rejects(
    () => deleteMaterialRecord(materialId),
    /producto|movimiento/i,
  );
});

test("no permite nuevos productos con materiales inactivos", async () => {
  await createCustomerRecord({ nombre: "Cliente base" });
  await createMaterialRecord({ nombre: "Material inactivo" });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;
  await setMaterialActiveState(materialId, false);

  await assert.rejects(
    () => createProductRecord({ nombre: "Producto bloqueado", materialId }),
    /material inactivo/i,
  );
});

test("no permite nuevos pedidos con clientes inactivos", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await setCustomerActiveState(customerId, false);

  await assert.rejects(
    () => createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] }),
    /cliente seleccionado esta inactivo/i,
  );
});

test("no permite nuevas operaciones con productos inactivos", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await setProductActiveState(productId, false);

  await assert.rejects(
    () => createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] }),
    /producto.*inactivo/i,
  );
  await assert.rejects(
    () => restockFinishedProduct(productId, 1, "Entrada manual"),
    /producto esta inactivo/i,
  );
});

test("editar producto actualiza la receta V2 sin romper el producto", async () => {
  const { productId, materialId } = await setupSingleProductFixture();

  await updateProductRecord({
    id: productId,
    nombre: "Producto receta",
    descripcion: "Version revisada",
    enlaceModelo: "https://example.com/modelo",
    gramosEstimados: 125,
    tiempoImpresionHoras: 2.5,
    costeElectricidad: 1.2,
    costeMaquina: 2.1,
    costeManoObra: 0.8,
    costePostprocesado: 0.6,
    margen: 12,
    pvp: 34,
    materialId,
    activo: true,
  });

  const product = (await row<{
    nombre: string;
    coste_maquina: number;
    coste_mano_obra: number;
    coste_postprocesado: number;
    gramos_estimados: number;
  }>(
    `SELECT nombre, coste_maquina, coste_mano_obra, coste_postprocesado, gramos_estimados
     FROM products
     WHERE id = ?`,
    productId,
  ))!;

  assert.equal(product.nombre, "Producto receta");
  assert.equal(product.coste_maquina, 2.1);
  assert.equal(product.coste_mano_obra, 0.8);
  assert.equal(product.coste_postprocesado, 0.6);
  assert.equal(product.gramos_estimados, 125);
});

test("crear material con stock inicial genera movimiento y deja el cache consistente", async () => {
  await createMaterialRecord({
    nombre: "PETG Azul",
    marca: "Marca",
    tipo: "PETG",
    color: "Azul",
    precioKg: 22,
    stockActualG: 750,
    stockMinimoG: 100,
  });

  const material = (await row<{ id: string; stock_actual_g: number }>(`SELECT id, stock_actual_g FROM materials LIMIT 1`))!;
  const movement = (await row<{ tipo: string; cantidad_g: number }>(
    `SELECT tipo, cantidad_g FROM stock_movements WHERE material_id = ?`,
    material.id,
  ))!;

  assert.equal(material.stock_actual_g, 750);
  assert.equal(movement.tipo, "ENTRADA");
  assert.equal(movement.cantidad_g, 750);
});

test("permite crear registros base con los datos minimos necesarios", async () => {
  await createCustomerRecord({ nombre: "Cliente minimo" });
  await createMaterialRecord({ nombre: "Material minimo" });

  const customer = (await row<{ id: string }>(`SELECT id FROM customers LIMIT 1`))!;
  const material = (await row<{
    id: string;
    marca: string;
    tipo: string;
    color: string;
    precio_kg: number;
    stock_minimo_g: number;
  }>(`SELECT id, marca, tipo, color, precio_kg, stock_minimo_g FROM materials LIMIT 1`))!;

  await createProductRecord({
    nombre: "Producto minimo",
    materialId: material.id,
  });
  await createPrinterRecord({ nombre: "Impresora minima" });

  const product = (await row<{
    nombre: string;
    gramos_estimados: number;
    tiempo_impresion_horas: number;
    coste_electricidad: number;
    pvp: number;
  }>(`SELECT nombre, gramos_estimados, tiempo_impresion_horas, coste_electricidad, pvp FROM products LIMIT 1`))!;
  const printer = (await row<{
    nombre: string;
    coste_hora: number;
    horas_uso_acumuladas: number;
    estado: string;
  }>(`SELECT nombre, coste_hora, horas_uso_acumuladas, estado FROM printers LIMIT 1`))!;

  const orderId = await createOrderRecord({
    clienteId: customer.id,
    lines: [{ productId: (await row<{ id: string }>(`SELECT id FROM products LIMIT 1`))!.id, quantity: 1 }],
  });

  assert.equal(material.marca, "Sin marca");
  assert.equal(material.tipo, "Sin tipo");
  assert.equal(material.color, "Sin color");
  assert.equal(material.precio_kg, 0);
  assert.equal(material.stock_minimo_g, 0);
  assert.equal(product.nombre, "Producto minimo");
  assert.equal(product.gramos_estimados, 1);
  assert.equal(product.tiempo_impresion_horas, 0.1);
  assert.equal(product.coste_electricidad, 0);
  assert.equal(product.pvp, 0);
  assert.equal(printer.nombre, "Impresora minima");
  assert.equal(printer.coste_hora, 0);
  assert.equal(printer.horas_uso_acumuladas, 0);
  assert.equal(printer.estado, "LIBRE");
  assert.ok(orderId.length > 0);
});

test("solo permite una orden activa por impresora y asigna impresora correcta", async () => {
  await createCustomerRecord({ nombre: "Cliente Test" });
  await createMaterialRecord({ nombre: "PLA Test", marca: "Marca", tipo: "PLA", color: "Negro", precioKg: 20, stockActualG: 5000, stockMinimoG: 100 });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;
  await createProductRecord({ nombre: "Producto A", gramosEstimados: 100, tiempoImpresionHoras: 2, costeElectricidad: 1, margen: 5, pvp: 20, materialId });
  await createProductRecord({ nombre: "Producto B", gramosEstimados: 100, tiempoImpresionHoras: 2, costeElectricidad: 1, margen: 5, pvp: 20, materialId });
  await createPrinterRecord({ nombre: "Impresora lenta", costeHora: 2, horasUsoAcumuladas: 10, estado: "MANTENIMIENTO" });
  await createPrinterRecord({ nombre: "Impresora fresca", costeHora: 2, horasUsoAcumuladas: 1, estado: "LIBRE" });
  const customerId = (await row<{ id: string }>(`SELECT id FROM customers LIMIT 1`))!.id;
  const products = await rows<{ id: string }>(`SELECT id FROM products ORDER BY nombre ASC`);

  const order1 = await createOrderRecord({ clienteId: customerId, lines: [{ productId: products[0].id, quantity: 1 }] });
  const order2 = await createOrderRecord({ clienteId: customerId, lines: [{ productId: products[1].id, quantity: 1 }] });
  await confirmOrder(order1);
  await confirmOrder(order2);
  const orders = await rows<{ id: string }>(`SELECT id FROM manufacturing_orders ORDER BY codigo ASC`);

  await startManufacturingOrder(orders[0].id);
  const assigned = (await row<{ impresora_nombre: string }>(
    `SELECT pr.nombre AS impresora_nombre
     FROM manufacturing_orders mo JOIN printers pr ON pr.id = mo.impresora_id
     WHERE mo.id = ?`,
    orders[0].id,
  ))!;

  assert.equal(assigned.impresora_nombre, "Impresora fresca");
  await assert.rejects(() => startManufacturingOrder(orders[1].id), /orden activa|impresoras libres/i);
});

test("no permite marcar impresoras manualmente en estados incoherentes", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const printerId = (await row<{ id: string }>(`SELECT id FROM printers LIMIT 1`))!.id;
  await assert.rejects(
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

  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;
  await startManufacturingOrder(manufacturingId);

  await assert.rejects(
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

test("las impresoras inactivas no se asignan a nuevas fabricaciones y no pueden darse de baja con orden activa", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const printerId = (await row<{ id: string }>(`SELECT id FROM printers LIMIT 1`))!.id;
  await setPrinterActiveState(printerId, false);

  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await assert.rejects(() => startManufacturingOrder(manufacturingId), /impresoras libres|inactiva/i);

  await setPrinterActiveState(printerId, true);
  await startManufacturingOrder(manufacturingId);

  await assert.rejects(
    () => setPrinterActiveState(printerId, false),
    /orden de fabricacion activa/i,
  );
});

test("acumula horas y coste por impresora al completar fabricacion", async () => {
  const { customerId, productId } = await setupSingleProductFixture({ materialStock: 1000, grams: 100, hours: 3, electricity: 1 });
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 2 }] });
  await confirmOrder(orderId);
  const mo = (await row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId))!;
  await startManufacturingOrder(mo.id);
  const result = await completeManufacturingOrder(mo.id);
  const printer = (await row<{ horas_uso_acumuladas: number; estado: string }>(`SELECT horas_uso_acumuladas, estado FROM printers LIMIT 1`))!;
  const line = (await row<{ coste_impresora_total: number; coste_total: number }>(
    `SELECT coste_impresora_total, coste_total FROM order_lines WHERE pedido_id = ?`,
    orderId,
  ))!;

  assert.equal(result.totalHours, 6);
  assert.equal(result.printerCost, 12);
  assert.equal(printer.horas_uso_acumuladas, 6);
  assert.equal(printer.estado, "LIBRE");
  assert.equal(line.coste_impresora_total, 12);
  assert.ok(line.coste_total >= 12);
});

test("no permite completar fabricacion sin haber iniciado y asignado impresora", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const mo = (await row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId))!;
  await assert.rejects(() => completeManufacturingOrder(mo.id), /no ha sido iniciada|impresora/i);
});

test("no permite forzar estados manuales de fabricacion ni editar pedidos cerrados logicamente", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const mo = (await row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId))!;

  await assert.rejects(
    () =>
      updateManufacturingOrderRecord({
        id: mo.id,
        estado: "INICIADA",
        cantidad: 1,
      }),
    /acciones dedicadas/i,
  );

  await updateOrderRecord({
    id: orderId,
    clienteId: customerId,
    estado: "FACTURADO",
    lines: [{ productId, quantity: 1 }],
  });

  assert.equal((await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!.estado, "BORRADOR");
});

test("estados del pedido transicionan correctamente y la factura solo se genera cuando procede", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const mo = (await row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderId))!;

  await assert.rejects(() => generateInvoiceForOrder(orderId), /no se puede facturar/i);

  await startManufacturingOrder(mo.id);
  assert.equal((await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!.estado, "EN_PRODUCCION");
  await completeManufacturingOrder(mo.id);
  assert.equal((await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!.estado, "LISTO");
  await deliverOrder(orderId);
  assert.equal((await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!.estado, "ENTREGADO");
  await generateInvoiceForOrder(orderId);
  assert.equal((await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!.estado, "FACTURADO");
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices WHERE pedido_id = ?`, orderId))!.total, 1);
  await generateInvoiceForOrder(orderId);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices WHERE pedido_id = ?`, orderId))!.total, 1);
});

test("la factura arranca pendiente y sincroniza pagos parciales y totales con el pedido", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const invoice = (await row<{
    id: string;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(`SELECT id, total, total_pagado, importe_pendiente, estado_pago FROM invoices WHERE pedido_id = ?`, orderId))!;
  assert.equal((await row<{ estado_pago: string }>(`SELECT estado_pago FROM orders WHERE id = ?`, orderId))!.estado_pago, "PENDIENTE");
  assert.equal(invoice.estado_pago, "PENDIENTE");
  assert.equal(invoice.total_pagado, 0);
  assert.equal(invoice.importe_pendiente, invoice.total);

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: 10,
    notas: "Primer cobro",
  });

  const afterPartial = (await row<{
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(`SELECT total_pagado, importe_pendiente, estado_pago FROM invoices WHERE id = ?`, invoice.id))!;

  assert.equal(afterPartial.estado_pago, "PARCIAL");
  assert.equal(afterPartial.total_pagado, 10);
  assert.equal(afterPartial.importe_pendiente, Number((invoice.total - 10).toFixed(2)));
  assert.equal((await row<{ estado_pago: string }>(`SELECT estado_pago FROM orders WHERE id = ?`, orderId))!.estado_pago, "PARCIAL");

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "BIZUM",
    importe: afterPartial.importe_pendiente,
    notas: "Pago final",
  });

  assert.equal((await row<{ estado_pago: string }>(`SELECT estado_pago FROM invoices WHERE id = ?`, invoice.id))!.estado_pago, "PAGADA");
  assert.equal((await row<{ estado_pago: string }>(`SELECT estado_pago FROM orders WHERE id = ?`, orderId))!.estado_pago, "PAGADA");
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoice_payments WHERE factura_id = ?`, invoice.id))!.total, 2);
});

test("bloquea pagos invalidos o superiores al pendiente", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const invoice = (await row<{ id: string; total: number }>(`SELECT id, total FROM invoices WHERE pedido_id = ?`, orderId))!;

  await assert.rejects(
    () => createInvoicePaymentRecord({ facturaId: invoice.id, metodoPago: "TARJETA", importe: 0 }),
    /mayor que cero/i,
  );
  await assert.rejects(
    () => createInvoicePaymentRecord({ facturaId: invoice.id, metodoPago: "TARJETA", importe: -5 }),
    /mayor que cero/i,
  );
  await assert.rejects(
    () => createInvoicePaymentRecord({ facturaId: invoice.id, metodoPago: "TARJETA", importe: invoice.total + 1 }),
    /supera el importe pendiente/i,
  );
  await assert.rejects(
    () => createInvoicePaymentRecord({ facturaId: invoice.id, metodoPago: "CRIPTO", importe: 5 }),
    /metodo de pago no valido/i,
  );
  await assert.rejects(
    () => createInvoicePaymentRecord({ facturaId: invoice.id, metodoPago: "TARJETA", importe: 5, fechaPago: "fecha-invalida" }),
    /fecha de pago no es valida/i,
  );
});

test("bloquea registrar pagos cuando la factura ya esta totalmente pagada", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const invoice = (await row<{ id: string; total: number }>(`SELECT id, total FROM invoices WHERE pedido_id = ?`, orderId))!;

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: invoice.total,
    notas: "Pago completo",
  });

  await assert.rejects(
    () => createInvoicePaymentRecord({ facturaId: invoice.id, metodoPago: "TARJETA", importe: 1 }),
    /ya esta pagada/i,
  );
});

test("recalcula facturas desincronizadas antes de mostrarlas o registrar cobros", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const invoice = (await row<{ id: string; total: number }>(`SELECT id, total FROM invoices WHERE pedido_id = ?`, orderId))!;

  await run(
    `UPDATE invoices
     SET total_pagado = ?, importe_pendiente = ?, estado_pago = ?
     WHERE id = ?`,
    0,
    0,
    "PENDIENTE",
    invoice.id,
  );

  const snapshot = await getAppSnapshot();
  const visibleInvoice = snapshot.invoices.find((item) => item.id === invoice.id);

  assert.ok(visibleInvoice);
  assert.equal(visibleInvoice!.estado_pago, "PENDIENTE");
  assert.equal(visibleInvoice!.total_pagado, 0);
  assert.equal(visibleInvoice!.importe_pendiente, invoice.total);

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: Number((invoice.total / 2).toFixed(2)),
    notas: "Pago tras resincronizacion",
  });

  const afterPayment = (await row<{
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(`SELECT total_pagado, importe_pendiente, estado_pago FROM invoices WHERE id = ?`, invoice.id))!;

  assert.equal(afterPayment.estado_pago, "PARCIAL");
  assert.equal(afterPayment.total_pagado, Number((invoice.total / 2).toFixed(2)));
  assert.equal(afterPayment.importe_pendiente, Number((invoice.total - afterPayment.total_pagado).toFixed(2)));
});

test("las exportaciones de facturas y pagos respetan rango de fechas y estado", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const invoice = (await row<{ id: string }>(`SELECT id FROM invoices WHERE pedido_id = ?`, orderId))!;

  await run(`UPDATE invoices SET fecha = ? WHERE id = ?`, "2026-04-10T09:00:00.000Z", invoice.id);
  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: 10,
    fechaPago: "2026-04-12",
    notas: "Pago dentro de rango",
  });

  const invoicesInRange = await getInvoicesExportRows("PARCIAL", "2026-04-01", "2026-04-30");
  const invoicesOutOfRange = await getInvoicesExportRows("PARCIAL", "2026-05-01", "2026-05-31");
  const paymentsInRange = await getInvoicePaymentsExportRows("PARCIAL", "2026-04-01", "2026-04-30");
  const paymentsOutOfRange = await getInvoicePaymentsExportRows("PARCIAL", "2026-05-01", "2026-05-31");

  assert.equal(invoicesInRange.length, 1);
  assert.equal(invoicesOutOfRange.length, 0);
  assert.equal(paymentsInRange.length, 1);
  assert.equal(paymentsOutOfRange.length, 0);
});

test("el inventario terminado refleja stock reservado y disponible", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await restockFinishedProduct(productId, 5, "Carga inicial", "A1", 8);
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 3 }],
  });

  await confirmOrder(orderId);

  const inventory = (await row<{
    cantidad_disponible: number;
    unidades_stock: number;
    unidades_reservadas: number;
    unidades_disponibles: number;
  }>(
    `SELECT cantidad_disponible, unidades_stock, unidades_reservadas, unidades_disponibles
     FROM finished_product_inventory
     WHERE product_id = ?`,
    productId,
  ))!;

  assert.equal(inventory.cantidad_disponible, 2);
  assert.equal(inventory.unidades_disponibles, 2);
  assert.equal(inventory.unidades_reservadas, 3);
  assert.equal(inventory.unidades_stock, 5);

  await deliverOrder(orderId);
  const afterDelivery = (await row<{ unidades_reservadas: number; unidades_stock: number }>(
    `SELECT unidades_reservadas, unidades_stock
     FROM finished_product_inventory
     WHERE product_id = ?`,
    productId,
  ))!;
  assert.equal(afterDelivery.unidades_reservadas, 0);
  assert.equal(afterDelivery.unidades_stock, 2);
});
