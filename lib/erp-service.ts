import { randomUUID } from "node:crypto";
import { row, rows, run, transaction } from "./db";

type LineInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

type PrinterState = "LIBRE" | "IMPRIMIENDO" | "MANTENIMIENTO";
type InventoryMovementType = "ENTRADA" | "SALIDA" | "AJUSTE";
type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "BIZUM" | "PAYPAL" | "OTRO";
const PAYMENT_METHODS: PaymentMethod[] = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "BIZUM", "PAYPAL", "OTRO"];
type InvoicePaymentStatus = "PENDIENTE" | "PARCIAL" | "PAGADA";
type WorkflowTone = "success" | "warn";

export const DEFAULT_VAT_RATE = 21;

type OrderFocusCandidate = {
  id: string;
  codigo?: string | null;
  pedido_codigo?: string | null;
};

export function matchesOrderFocusCode(order: OrderFocusCandidate, focusedOrderCode?: string | null) {
  const normalizedFocus = focusedOrderCode?.trim();
  if (!normalizedFocus) {
    return false;
  }

  return [order.codigo, order.pedido_codigo, order.id].some((value) => value?.trim() === normalizedFocus);
}

export function prioritizeOrdersByFocus<T extends OrderFocusCandidate>(orders: T[], focusedOrderCode?: string | null) {
  if (!focusedOrderCode?.trim()) {
    return orders;
  }

  const focused = orders.find((order) => matchesOrderFocusCode(order, focusedOrderCode));
  if (!focused) {
    return orders;
  }

  return [focused, ...orders.filter((order) => order !== focused)];
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeVatRate(input: number | undefined) {
  if (input == null || !Number.isFinite(input)) {
    return DEFAULT_VAT_RATE;
  }

  const vatRate = roundMoney(input);
  if (vatRate < 0) {
    throw new Error("El IVA del producto no puede ser negativo.");
  }
  if (vatRate > 100) {
    throw new Error("El IVA del producto no puede superar el 100%.");
  }

  return vatRate;
}

function normalizeDiscount(input: number | undefined, subtotal: number) {
  if (input == null) {
    return 0;
  }

  if (!Number.isFinite(input)) {
    throw new Error("El descuento no es valido.");
  }

  const discount = roundMoney(input);
  if (discount < 0) {
    throw new Error("El descuento no puede ser negativo.");
  }
  if (discount > subtotal) {
    throw new Error("El descuento no puede superar el subtotal.");
  }

  return discount;
}

function clampStoredDiscount(input: number | null | undefined, subtotal: number) {
  if (!Number.isFinite(input ?? 0)) {
    return 0;
  }

  return roundMoney(Math.min(Math.max(input ?? 0, 0), subtotal));
}

function calculateOrderFinancials(input: {
  lineTotals: Array<{ grossTotal: number; vatRate?: number }>;
  costeTotalPedido: number;
  discount?: number;
}) {
  const lineTotals = input.lineTotals.map((line) => ({
    grossTotal: roundMoney(line.grossTotal),
    vatRate: normalizeVatRate(line.vatRate),
  }));
  const subtotal = roundMoney(lineTotals.reduce((sum, line) => sum + line.grossTotal, 0));
  const descuento = normalizeDiscount(input.discount, subtotal);
  const total = roundMoney(subtotal - descuento);
  if (subtotal <= 0 || lineTotals.length === 0) {
    const costeTotalPedido = roundMoney(input.costeTotalPedido);
    return {
      subtotal,
      descuento,
      baseImponible: 0,
      iva: 0,
      total,
      costeTotalPedido,
      beneficioTotal: roundMoney(-costeTotalPedido),
    };
  }

  let remainingDiscountedTotal = total;
  let baseImponible = 0;

  lineTotals.forEach((line, index) => {
    const lineTotalWithDiscount =
      index === lineTotals.length - 1
        ? remainingDiscountedTotal
        : roundMoney(total * (line.grossTotal / subtotal));
    remainingDiscountedTotal = roundMoney(remainingDiscountedTotal - lineTotalWithDiscount);
    baseImponible = roundMoney(baseImponible + lineTotalWithDiscount / (1 + line.vatRate / 100));
  });

  const iva = roundMoney(total - baseImponible);
  const costeTotalPedido = roundMoney(input.costeTotalPedido);
  const beneficioTotal = roundMoney(baseImponible - costeTotalPedido);

  return {
    subtotal,
    descuento,
    baseImponible,
    iva,
    total,
    costeTotalPedido,
    beneficioTotal,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function parseBoolean(value: number) {
  return value === 1;
}

async function nextCode(table: string, prefix: string) {
  const result = await row<{ codigo: string }>(
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

async function getProductOrThrow(productId: string) {
  const product = await row<{
    id: string;
    nombre: string;
    gramos_estimados: number;
    tiempo_impresion_horas: number;
    coste_electricidad: number;
    coste_maquina: number;
    coste_mano_obra: number;
    coste_postprocesado: number;
    pvp: number;
    iva_porcentaje: number;
    precio_kg: number;
    activo: number;
    material_activo: number;
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
       p.iva_porcentaje,
       p.activo,
       m.precio_kg,
       m.activo AS material_activo
     FROM products p
     JOIN materials m ON m.id = p.material_id
     WHERE p.id = ?`,
    productId,
  );

  if (!product) {
    throw new Error("Uno de los productos seleccionados no existe.");
  }

  if (!parseBoolean(product.activo)) {
    throw new Error("Uno de los productos seleccionados esta archivado.");
  }

  if (!parseBoolean(product.material_activo)) {
    throw new Error("Uno de los productos seleccionados depende de un material archivado.");
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

function draftLineCalculations(product: Awaited<ReturnType<typeof getProductOrThrow>>, quantity: number, unitPrice?: number) {
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
    ivaPorcentaje: normalizeVatRate(product.iva_porcentaje),
    precioTotalLinea: roundMoney(precioUnitario * quantity),
    costeMaterial: costs.costeMaterial,
    costeElectricidadTotal: costs.costeElectricidadTotal,
    costeImpresoraTotal: costs.costeImpresoraTotal,
    costeTotal: costs.costeTotal,
    beneficio: costs.beneficio,
  };
}

async function getMaterialComputedStock(materialId: string) {
  const totals = await row<{ total: number }>(
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

async function syncMaterialStockCache(materialId: string) {
  const nextStock = await getMaterialComputedStock(materialId);
  await run(
    `UPDATE materials
     SET stock_actual_g = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    nextStock,
    nowIso(),
    materialId,
  );

  return nextStock;
}

async function syncFinishedInventoryMetrics(productId: string) {
  await ensureFinishedInventoryRow(productId);
  const reserved =
    (await row<{ total: number }>(
    `SELECT COALESCE(SUM(l.cantidad_desde_stock), 0) AS total
     FROM order_lines l
     JOIN orders o ON o.id = l.pedido_id
     WHERE l.producto_id = ?
       AND o.estado IN ('CONFIRMADO', 'EN_PRODUCCION', 'LISTO')`,
    productId,
    ))?.total ?? 0;

  const current = await row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  );
  const available = Math.max(0, Math.round(current?.cantidad_disponible ?? 0));
  await run(
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

async function syncFinishedInventoryMetricsForOrder(orderId: string) {
  const productIds = await rows<{ producto_id: string }>(
    `SELECT DISTINCT producto_id FROM order_lines WHERE pedido_id = ?`,
    orderId,
  );

  for (const item of productIds) {
    await syncFinishedInventoryMetrics(item.producto_id);
  }
}

async function recalculateOrderTotals(orderId: string, vatRate = DEFAULT_VAT_RATE) {
  const order = await row<{ descuento: number | null }>(
    `SELECT descuento FROM orders WHERE id = ?`,
    orderId,
  );
  const lines = await rows<{
    precio_total_linea: number;
    coste_total: number;
    iva_porcentaje: number | null;
  }>(
    `SELECT precio_total_linea, coste_total, iva_porcentaje
     FROM order_lines
     WHERE pedido_id = ?`,
    orderId,
  );

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.precio_total_linea, 0));
  const costeTotal = roundMoney(lines.reduce((sum, line) => sum + line.coste_total, 0));
  const financials = calculateOrderFinancials({
    lineTotals: lines.map((line) => ({
      grossTotal: line.precio_total_linea,
      vatRate: line.iva_porcentaje ?? vatRate,
    })),
    costeTotalPedido: costeTotal,
    discount: clampStoredDiscount(order?.descuento, subtotal),
  });
  const beneficio = financials.beneficioTotal;

  await run(
    `UPDATE orders
     SET subtotal = ?, descuento = ?, iva = ?, total = ?, coste_total_pedido = ?, beneficio_total = ?
     WHERE id = ?`,
    financials.subtotal,
    financials.descuento,
    financials.iva,
    financials.total,
    financials.costeTotalPedido,
    beneficio,
    orderId,
  );

  return {
    subtotal: financials.subtotal,
    descuento: financials.descuento,
    iva: financials.iva,
    total: financials.total,
    costeTotal: financials.costeTotalPedido,
    beneficio,
  };
}

async function registerOrderHistory(pedidoId: string, estado: string, nota: string) {
  await run(
    `INSERT INTO order_status_history (id, pedido_id, estado, nota, fecha) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    pedidoId,
    estado,
    nota,
    nowIso(),
  );
}

function normalizePaymentMethod(method: string): PaymentMethod {
  const normalized = method.trim().toUpperCase() as PaymentMethod;
  if (!PAYMENT_METHODS.includes(normalized)) {
    throw new Error("Metodo de pago no valido.");
  }
  return normalized;
}

function normalizeInvoiceStatusFilter(status?: string | null): InvoicePaymentStatus | undefined {
  const normalized = status?.trim().toUpperCase();
  if (!normalized || normalized === "ALL") {
    return undefined;
  }
  if (normalized === "PENDIENTE" || normalized === "PARCIAL" || normalized === "PAGADA") {
    return normalized;
  }
  throw new Error("Filtro de estado de factura no valido.");
}

function normalizeDateFilter(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Filtro de fecha no valido.");
  }

  return normalized;
}

function comparePaymentSequence(
  a: { fecha_pago: string; codigo: string },
  b: { fecha_pago: string; codigo: string },
) {
  const byDate = a.fecha_pago.localeCompare(b.fecha_pago);
  if (byDate !== 0) {
    return byDate;
  }
  return a.codigo.localeCompare(b.codigo);
}

function buildPaymentDisplayCode(orderCode: string | null | undefined, sequence: number) {
  const normalizedOrderCode = orderCode?.trim() || "PED-000";
  return `PAG-${normalizedOrderCode}-${String(sequence).padStart(2, "0")}`;
}

function withPaymentDisplayCodes<T extends { id: string; codigo: string; fecha_pago: string }>(
  payments: T[],
  orderCode: string | null | undefined,
) {
  const ordered = [...payments].sort(comparePaymentSequence);
  const displayCodeById = new Map(
    ordered.map((payment, index) => [payment.id, buildPaymentDisplayCode(orderCode, index + 1)]),
  );

  return payments.map((payment) => ({
    ...payment,
    displayCode: displayCodeById.get(payment.id) ?? payment.codigo,
  }));
}

async function syncInvoicePaymentSummary(invoiceId: string) {
  const invoice = await row<{
    id: string;
    pedido_id: string;
    total: number;
  }>(`SELECT id, pedido_id, total FROM invoices WHERE id = ?`, invoiceId);

  if (!invoice) {
    throw new Error("La factura no existe.");
  }

  const totals = await row<{ total_pagado: number }>(
    `SELECT COALESCE(SUM(importe), 0) AS total_pagado FROM invoice_payments WHERE factura_id = ?`,
    invoiceId,
  );

  const totalPagado = roundMoney(totals?.total_pagado ?? 0);
  const importePendiente = roundMoney(Math.max(invoice.total - totalPagado, 0));
  const estadoPago =
    totalPagado <= 0 ? "PENDIENTE" : totalPagado < invoice.total ? "PARCIAL" : "PAGADA";

  await run(
    `UPDATE invoices
     SET total_pagado = ?, importe_pendiente = ?, estado_pago = ?
     WHERE id = ?`,
    totalPagado,
    importePendiente,
    estadoPago,
    invoiceId,
  );
  await run(
    `UPDATE orders
     SET estado_pago = ?
     WHERE id = ?`,
    estadoPago,
    invoice.pedido_id,
  );

  return {
    totalPagado,
    importePendiente,
    estadoPago,
  };
}

async function registerInventoryMovement(input: {
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

  await run(
    `INSERT INTO inventory_movements
      (id, codigo, inventario_tipo, item_id, item_codigo, tipo, fecha, cantidad, motivo, referencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    await nextCode("inventory_movements", "MIV-"),
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

async function getMaterialInventoryOrThrow(materialId: string) {
  const material = await row<{
    id: string;
    codigo: string;
    stock_actual_g: number;
    activo: number;
  }>(`SELECT id, codigo, stock_actual_g, activo FROM materials WHERE id = ?`, materialId);

  if (!material) {
    throw new Error("El material no existe.");
  }

  const computedStock = await getMaterialComputedStock(materialId);
  if (computedStock !== material.stock_actual_g) {
    await run(
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

async function getMaterialStatusOrThrow(materialId: string) {
  const material = await row<{
    id: string;
    codigo: string;
    nombre: string;
    activo: number;
  }>(`SELECT id, codigo, nombre, activo FROM materials WHERE id = ?`, materialId);

  if (!material) {
    throw new Error("El material no existe.");
  }

  return {
    ...material,
    activo: Boolean(material.activo),
  };
}

async function getCustomerStatusOrThrow(customerId: string) {
  const customer = await row<{
    id: string;
    codigo: string;
    nombre: string;
    activo: number;
  }>(`SELECT id, codigo, nombre, activo FROM customers WHERE id = ?`, customerId);

  if (!customer) {
    throw new Error("El cliente no existe.");
  }

  return {
    ...customer,
    activo: parseBoolean(customer.activo),
  };
}

async function getProductStatusOrThrow(productId: string) {
  const product = await row<{
    id: string;
    codigo: string;
    nombre: string;
    activo: number;
  }>(`SELECT id, codigo, nombre, activo FROM products WHERE id = ?`, productId);

  if (!product) {
    throw new Error("El producto no existe.");
  }

  return {
    ...product,
    activo: parseBoolean(product.activo),
  };
}

async function getPrinterStatusOrThrow(printerId: string) {
  const printer = await row<{
    id: string;
    codigo: string;
    nombre: string;
    estado: PrinterState;
    activo: number;
  }>(`SELECT id, codigo, nombre, estado, activo FROM printers WHERE id = ?`, printerId);

  if (!printer) {
    throw new Error("La impresora no existe.");
  }

  return {
    ...printer,
    activo: parseBoolean(printer.activo),
  };
}

async function applyMaterialInventoryMovement(input: {
  materialId: string;
  tipo: "ENTRADA" | "SALIDA";
  cantidadG: number;
  motivo: string;
  referencia: string;
}) {
  const quantity = requirePositiveInteger(input.cantidadG, "La cantidad del movimiento debe ser mayor que cero.");
  const material = await getMaterialInventoryOrThrow(input.materialId);
  const delta = input.tipo === "SALIDA" ? -quantity : quantity;
  const nextStock = material.stock_actual_g + delta;
  if (nextStock < 0) {
    throw new Error("No se puede dejar el stock de materiales en negativo.");
  }
  await run(
    `INSERT INTO stock_movements
      (id, codigo, material_id, tipo, cantidad_g, motivo, referencia, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    await nextCode("stock_movements", "MOV-"),
    input.materialId,
    input.tipo,
    quantity,
    input.motivo,
    input.referencia,
    nowIso(),
  );
  await registerInventoryMovement({
    inventarioTipo: "MATERIAL",
    itemId: input.materialId,
    itemCodigo: material.codigo,
    tipo: input.tipo,
    cantidad: quantity,
    motivo: input.motivo,
    referencia: input.referencia,
  });

  await syncMaterialStockCache(input.materialId);

  return { previousStock: material.stock_actual_g, nextStock, itemCodigo: material.codigo };
}

async function getFinishedInventoryOrThrow(productId: string) {
  await ensureFinishedInventoryRow(productId);
  const inventory = await row<{
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

  await syncFinishedInventoryMetrics(productId);
  return inventory;
}

async function countUnfulfilledOrderLines(orderId: string) {
  return (
    (await row<{ total: number }>(
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
    ))?.total ?? 0
  );
}

async function applyFinishedInventoryMovement(input: {
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
  const inventory = await getFinishedInventoryOrThrow(input.productId);
  const signedDelta = input.signedDelta ?? (input.tipo === "SALIDA" ? -quantity : quantity);
  const nextQuantity = inventory.cantidad_disponible + signedDelta;
  if (nextQuantity < 0) {
    throw new Error("No se puede dejar el stock de producto terminado en negativo.");
  }

  await run(
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
  await registerInventoryMovement({
    inventarioTipo: "PRODUCTO_TERMINADO",
    itemId: input.productId,
    itemCodigo: inventory.codigo,
    tipo: input.tipo,
    cantidad: quantity,
    motivo: input.motivo,
    referencia: input.referencia,
  });
  await syncFinishedInventoryMetrics(input.productId);

  return { previousQuantity: inventory.cantidad_disponible, nextQuantity, itemCodigo: inventory.codigo };
}

async function ensureFinishedInventoryRow(productId: string) {
  const existing = await row<{ id: string }>(
    `SELECT id FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  );
  if (existing) {
    return;
  }

  const product = await row<{ pvp: number }>(`SELECT pvp FROM products WHERE id = ?`, productId);
  if (!product) {
    throw new Error("El producto no existe.");
  }

  await run(
    `INSERT INTO finished_product_inventory
      (id, codigo, product_id, cantidad_disponible, unidades_stock, unidades_reservadas, unidades_disponibles, ubicacion, coste_unitario, precio_venta, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    await nextCode("finished_product_inventory", "STK-"),
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
  await syncFinishedInventoryMetrics(productId);
}

async function getFirstAvailablePrinter() {
  return await row<{
    id: string;
    codigo: string;
    nombre: string;
    estado: PrinterState;
    horas_uso_acumuladas: number;
    coste_hora: number;
    activo: number;
  }>(
    `SELECT *
     FROM printers
     WHERE estado = 'LIBRE' AND activo = 1
     ORDER BY horas_uso_acumuladas ASC, nombre ASC
     LIMIT 1`,
  );
}

async function restoreOrderInventoryAllocations(orderId: string, orderCode: string) {
  const allocations = await rows<{
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
      await run(
        `UPDATE finished_product_inventory
         SET cantidad_disponible = cantidad_disponible + ?, fecha_actualizacion = ?
         WHERE product_id = ?`,
        allocation.cantidad_desde_stock,
        nowIso(),
        allocation.producto_id,
      );
      await registerInventoryMovement({
        inventarioTipo: "PRODUCTO_TERMINADO",
        itemId: allocation.producto_id,
        itemCodigo: allocation.inventario_codigo,
        tipo: "AJUSTE",
        cantidad: allocation.cantidad_desde_stock,
        motivo: `Recalculo de reserva del pedido ${orderCode}`,
        referencia: orderCode,
      });
    }

    await run(
      `UPDATE order_lines
       SET cantidad_desde_stock = 0, cantidad_a_fabricar = 0
       WHERE id = ?`,
      allocation.id,
    );
  }

  const activePrinters = await rows<{ impresora_id: string | null }>(
    `SELECT impresora_id
     FROM manufacturing_orders
     WHERE pedido_id = ? AND estado = 'INICIADA' AND impresora_id IS NOT NULL`,
    orderId,
  );

  for (const item of activePrinters) {
    if (item.impresora_id) {
      await run(
        `UPDATE printers
         SET estado = 'LIBRE', fecha_actualizacion = ?
         WHERE id = ?`,
        nowIso(),
        item.impresora_id,
      );
    }
  }

  await run(`DELETE FROM manufacturing_orders WHERE pedido_id = ?`, orderId);
  await syncFinishedInventoryMetricsForOrder(orderId);
}

export async function getAppSnapshot() {
  const materialIds = await rows<{ id: string }>(`SELECT id FROM materials`);
  for (const item of materialIds) {
    await syncMaterialStockCache(item.id);
  }

  const inventoryProducts = await rows<{ product_id: string }>(`SELECT product_id FROM finished_product_inventory`);
  for (const item of inventoryProducts) {
    await syncFinishedInventoryMetrics(item.product_id);
  }

  const invoiceIds = await rows<{ id: string }>(`SELECT id FROM invoices`);
  for (const item of invoiceIds) {
    await syncInvoicePaymentSummary(item.id);
  }

  const customers = await rows<{
    id: string;
    codigo: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    activo: number;
    fecha_creacion: string;
  }>(`SELECT * FROM customers ORDER BY fecha_creacion DESC`);
  const normalizedCustomers = customers.map((customer) => ({
    ...customer,
    activo: parseBoolean(customer.activo),
  }));

  const materialsBase = await rows<{
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
    activo: number;
    fecha_actualizacion: string;
  }>(`SELECT * FROM materials ORDER BY nombre ASC`);
  const materials = materialsBase.map((material) => ({
    ...material,
    activo: Boolean(material.activo),
  }));

  const productsBase = await rows<{
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
    iva_porcentaje: number;
    material_id: string;
    activo: number;
    material_nombre: string;
    precio_kg: number;
  }>(
    `SELECT p.*, m.nombre AS material_nombre, m.precio_kg
     FROM products p
     JOIN materials m ON m.id = p.material_id
     ORDER BY p.nombre ASC`,
  );

  const products = productsBase.map((product) => {
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

  const ordersBase = await rows<{
    id: string;
    codigo: string;
    cliente_id: string;
    cliente_codigo: string;
    fecha_pedido: string;
    estado: string;
    estado_pago: string;
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
    coste_total_pedido: number;
    beneficio_total: number;
    observaciones: string | null;
    cliente_nombre: string;
  }>(
    `SELECT o.*, c.codigo AS cliente_codigo, c.nombre AS cliente_nombre
     FROM orders o
     JOIN customers c ON c.id = o.cliente_id
     ORDER BY o.fecha_pedido DESC`,
  );

  const orders = await Promise.all(ordersBase.map(async (order) => ({
    ...order,
    subtotal: roundMoney(order.total + (order.descuento ?? 0)),
    lineas: await rows<{
      id: string;
      codigo: string;
      pedido_id: string;
      producto_id: string;
      producto_codigo: string;
      cantidad: number;
      cantidad_desde_stock: number;
      cantidad_a_fabricar: number;
      precio_unitario: number;
      precio_total_linea: number;
      iva_porcentaje: number;
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
         p.codigo AS producto_codigo,
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
    historial: await rows<{
      id: string;
      pedido_id: string;
      estado: string;
      nota: string;
      fecha: string;
    }>(`SELECT * FROM order_status_history WHERE pedido_id = ? ORDER BY fecha DESC`, order.id),
    ordenesFabricacion: await rows<{
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
    factura: (await row<{ id: string }>(`SELECT id FROM invoices WHERE pedido_id = ?`, order.id)) ?? null,
  })));

  const manufacturingOrders = await rows<{
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

  const stockMovements = await rows<{
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

  const invoicesBase = await rows<{
    id: string;
    codigo: string;
    pedido_id: string;
    cliente_id: string;
    cliente_codigo: string;
    fecha: string;
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
    pedido_codigo: string;
    cliente_nombre: string;
  }>(
    `SELECT
       i.*,
       o.codigo AS pedido_codigo,
       c.codigo AS cliente_codigo,
       c.nombre AS cliente_nombre
     FROM invoices i
     JOIN orders o ON o.id = i.pedido_id
     JOIN customers c ON c.id = i.cliente_id
     ORDER BY i.fecha DESC`,
  );

  const invoices = await Promise.all(
    invoicesBase.map(async (invoice) => {
      const totalPagado = roundMoney(invoice.total_pagado ?? 0);
      const importePendiente = roundMoney(Math.max(invoice.total - totalPagado, 0));
      const estadoPago =
        totalPagado <= 0 ? "PENDIENTE" : totalPagado < invoice.total ? "PARCIAL" : "PAGADA";

      const pagos = await rows<{
        id: string;
        codigo: string;
        factura_id: string;
        fecha_pago: string;
        metodo_pago: string;
        importe: number;
        notas: string | null;
      }>(
        `SELECT * FROM invoice_payments WHERE factura_id = ? ORDER BY fecha_pago DESC, codigo DESC`,
        invoice.id,
      );

      return {
        ...invoice,
        subtotal: roundMoney(invoice.total + (invoice.descuento ?? 0)),
        total_pagado: totalPagado,
        importe_pendiente: importePendiente,
        estado_pago: estadoPago,
        pagos: withPaymentDisplayCodes(pagos, invoice.pedido_codigo),
      };
    }),
  );

  const finishedInventory = await rows<{
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

  const printers = await rows<{
    id: string;
    codigo: string;
    nombre: string;
    estado: PrinterState;
    horas_uso_acumuladas: number;
    coste_hora: number;
    ubicacion: string | null;
    activo: number;
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
  const normalizedPrinters = printers.map((printer) => ({
    ...printer,
    activo: parseBoolean(printer.activo),
  }));

  const inventoryMovements = await rows<{
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
    customers: normalizedCustomers,
    materials,
    products,
    orders,
    manufacturingOrders,
    stockMovements,
    finishedInventory,
    printers: normalizedPrinters,
    inventoryMovements,
    invoices,
  };
}

export async function getInvoicesExportRows(status?: string, fromDate?: string, toDate?: string) {
  const statusFilter = normalizeInvoiceStatusFilter(status);
  const startDate = normalizeDateFilter(fromDate);
  const endDate = normalizeDateFilter(toDate);
  return await rows<{
    codigoFactura: string;
    codigoPedido: string;
    cliente: string;
    fechaFactura: string;
    subtotal: number;
    descuento: number;
    baseImponible: number;
    iva: number;
    total: number;
    totalPagado: number;
    importePendiente: number;
    estadoPago: string;
  }>(
    `SELECT
       i.codigo AS codigoFactura,
       o.codigo AS codigoPedido,
       c.nombre AS cliente,
       i.fecha AS fechaFactura,
       ROUND(i.total + i.descuento, 2) AS subtotal,
       i.descuento AS descuento,
       ROUND(i.total - i.iva, 2) AS baseImponible,
       i.iva AS iva,
       i.total AS total,
       i.total_pagado AS totalPagado,
       i.importe_pendiente AS importePendiente,
       i.estado_pago AS estadoPago
     FROM invoices i
     JOIN orders o ON o.id = i.pedido_id
     JOIN customers c ON c.id = i.cliente_id
     WHERE (? IS NULL OR i.estado_pago = ?)
       AND (? IS NULL OR substr(i.fecha, 1, 10) >= ?)
       AND (? IS NULL OR substr(i.fecha, 1, 10) <= ?)
     ORDER BY i.fecha DESC, i.codigo DESC`,
    statusFilter ?? null,
    statusFilter ?? null,
    startDate ?? null,
    startDate ?? null,
    endDate ?? null,
    endDate ?? null,
  );
}

export async function getInvoicePdfData(invoiceId: string) {
  if (!invoiceId) {
    throw new Error("La factura necesita ID.");
  }

  await syncInvoicePaymentSummary(invoiceId);

  const invoice = await row<{
    id: string;
    codigo: string;
    pedido_id: string;
    cliente_id: string;
    fecha: string;
    descuento: number;
    iva: number;
    total: number;
    total_pagado: number;
    pedido_codigo: string;
    fecha_pedido: string;
    observaciones: string | null;
    cliente_codigo: string;
    cliente_nombre: string;
    cliente_telefono: string | null;
    cliente_email: string | null;
    cliente_direccion: string | null;
  }>(
    `SELECT
       i.id,
       i.codigo,
       i.pedido_id,
       i.cliente_id,
       i.fecha,
       i.descuento,
       i.iva,
       i.total,
       i.total_pagado,
       o.codigo AS pedido_codigo,
       o.fecha_pedido,
       o.observaciones,
       c.codigo AS cliente_codigo,
       c.nombre AS cliente_nombre,
       c.telefono AS cliente_telefono,
       c.email AS cliente_email,
       c.direccion AS cliente_direccion
     FROM invoices i
     JOIN orders o ON o.id = i.pedido_id
     JOIN customers c ON c.id = i.cliente_id
     WHERE i.id = ?`,
    invoiceId,
  );

  if (!invoice) {
    throw new Error("La factura no existe.");
  }

  const lineas = await rows<{
    id: string;
    codigo: string;
    producto_id: string;
    producto_codigo: string;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
    precio_total_linea: number;
    iva_porcentaje: number | null;
  }>(
    `SELECT
       l.id,
       l.codigo,
       l.producto_id,
       p.codigo AS producto_codigo,
       p.nombre AS producto_nombre,
       l.cantidad,
       l.precio_unitario,
       l.precio_total_linea,
       l.iva_porcentaje
     FROM order_lines l
     JOIN products p ON p.id = l.producto_id
     WHERE l.pedido_id = ?
     ORDER BY l.codigo ASC`,
    invoice.pedido_id,
  );

  const pagos = await rows<{
    id: string;
    codigo: string;
    fecha_pago: string;
    metodo_pago: string;
    importe: number;
    notas: string | null;
  }>(
    `SELECT id, codigo, fecha_pago, metodo_pago, importe, notas
     FROM invoice_payments
     WHERE factura_id = ?
     ORDER BY fecha_pago ASC, codigo ASC`,
    invoiceId,
  );

  const subtotal = roundMoney(invoice.total + (invoice.descuento ?? 0));
  const totalPagado = roundMoney(invoice.total_pagado ?? 0);
  const importePendiente = roundMoney(Math.max(invoice.total - totalPagado, 0));
  const estadoPago: InvoicePaymentStatus =
    totalPagado <= 0 ? "PENDIENTE" : totalPagado < invoice.total ? "PARCIAL" : "PAGADA";
  const baseImponible = roundMoney(Math.max(invoice.total - invoice.iva, 0));

  return {
    id: invoice.id,
    codigo: invoice.codigo,
    fecha: invoice.fecha,
    pedido: {
      id: invoice.pedido_id,
      codigo: invoice.pedido_codigo,
      fecha: invoice.fecha_pedido,
      observaciones: invoice.observaciones,
    },
    cliente: {
      id: invoice.cliente_id,
      codigo: invoice.cliente_codigo,
      nombre: invoice.cliente_nombre,
      telefono: invoice.cliente_telefono,
      email: invoice.cliente_email,
      direccion: invoice.cliente_direccion,
    },
    lineas: lineas.map((linea) => ({
      ...linea,
      iva_porcentaje: normalizeVatRate(linea.iva_porcentaje ?? DEFAULT_VAT_RATE),
    })),
    pagos: withPaymentDisplayCodes(pagos, invoice.pedido_codigo),
    resumen: {
      subtotal,
      descuento: roundMoney(invoice.descuento ?? 0),
      baseImponible,
      iva: roundMoney(invoice.iva ?? 0),
      total: roundMoney(invoice.total ?? 0),
      totalPagado,
      importePendiente,
      estadoPago,
    },
  };
}

export async function getInvoicePaymentsExportRows(status?: string, fromDate?: string, toDate?: string) {
  const statusFilter = normalizeInvoiceStatusFilter(status);
  const startDate = normalizeDateFilter(fromDate);
  const endDate = normalizeDateFilter(toDate);
  const payments = await rows<{
    id: string;
    codigoPago: string;
    codigoFactura: string;
    codigoPedido: string;
    cliente: string;
    fechaPago: string;
    metodoPago: string;
    importe: number;
    notas: string | null;
  }>(
      `SELECT
         p.id AS id,
         p.codigo AS codigoPago,
         i.codigo AS codigoFactura,
         o.codigo AS codigoPedido,
         c.nombre AS cliente,
         p.fecha_pago AS fechaPago,
       p.metodo_pago AS metodoPago,
       p.importe AS importe,
       p.notas AS notas
     FROM invoice_payments p
     JOIN invoices i ON i.id = p.factura_id
     JOIN orders o ON o.id = i.pedido_id
     JOIN customers c ON c.id = i.cliente_id
     WHERE (? IS NULL OR i.estado_pago = ?)
       AND (? IS NULL OR substr(p.fecha_pago, 1, 10) >= ?)
       AND (? IS NULL OR substr(p.fecha_pago, 1, 10) <= ?)
     ORDER BY p.fecha_pago DESC, p.codigo DESC`,
    statusFilter ?? null,
    statusFilter ?? null,
    startDate ?? null,
      startDate ?? null,
      endDate ?? null,
      endDate ?? null,
    );

  const orderedForSequence = [...payments].sort(
    (a, b) =>
      a.codigoPedido.localeCompare(b.codigoPedido) ||
      a.fechaPago.localeCompare(b.fechaPago) ||
      a.codigoPago.localeCompare(b.codigoPago),
  );
  const displayCodeById = new Map<string, string>();
  const paymentCountByOrder = new Map<string, number>();

  for (const payment of orderedForSequence) {
    const nextSequence = (paymentCountByOrder.get(payment.codigoPedido) ?? 0) + 1;
    paymentCountByOrder.set(payment.codigoPedido, nextSequence);
    displayCodeById.set(payment.id, buildPaymentDisplayCode(payment.codigoPedido, nextSequence));
  }

  return payments.map((payment) => ({
    ...payment,
    codigoPago: displayCodeById.get(payment.id) ?? payment.codigoPago,
  }));
}

export async function resetDatabase() {
  await transaction(async () => {
    await run("DELETE FROM demo_scenario_results");
    await run("DELETE FROM demo_runs");
    await run("DELETE FROM inventory_movements");
    await run("DELETE FROM invoice_payments");
    await run("DELETE FROM order_status_history");
    await run("DELETE FROM invoices");
    await run("DELETE FROM stock_movements");
    await run("DELETE FROM manufacturing_orders");
    await run("DELETE FROM order_lines");
    await run("DELETE FROM orders");
    await run("DELETE FROM finished_product_inventory");
    await run("DELETE FROM printers");
    await run("DELETE FROM products");
    await run("DELETE FROM materials");
    await run("DELETE FROM customers");
  });
}

export async function createCustomerRecord(input: {
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}) {
  if (!input.nombre.trim()) {
    throw new Error("El cliente necesita al menos un nombre.");
  }

  await run(
    `INSERT INTO customers (id, codigo, nombre, telefono, email, direccion, activo, fecha_creacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    await nextCode("customers", "CLI-"),
    input.nombre.trim(),
    input.telefono?.trim() || null,
    input.email?.trim() || null,
    input.direccion?.trim() || null,
    1,
    nowIso(),
  );
}

export async function updateCustomerRecord(input: {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}) {
  if (!input.id || !input.nombre.trim()) {
    throw new Error("El cliente necesita ID y nombre.");
  }

  await run(
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

export async function setCustomerActiveState(customerId: string, active: boolean) {
  const customer = await getCustomerStatusOrThrow(customerId);

  if (customer.activo === active) {
    return;
  }

  if (!active) {
    const openOrders = (await row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM orders
       WHERE cliente_id = ?
         AND estado IN ('BORRADOR', 'CONFIRMADO', 'EN_PRODUCCION', 'LISTO', 'ENTREGADO', 'INCIDENCIA_STOCK')`,
      customerId,
    ))?.total ?? 0;

    if (openOrders > 0) {
      throw new Error("No se puede archivar el cliente porque tiene pedidos abiertos o pendientes de cierre.");
    }
  }

  await run(`UPDATE customers SET activo = ? WHERE id = ?`, active ? 1 : 0, customerId);
}

export async function archiveCustomer(customerId: string) {
  await setCustomerActiveState(customerId, false);
}

export async function unarchiveCustomer(customerId: string) {
  await setCustomerActiveState(customerId, true);
}

export async function createMaterialRecord(input: {
  nombre: string;
  marca?: string;
  tipo?: string;
  color?: string;
  tipoColor?: string;
  efecto?: string;
  colorBase?: string;
  nombreComercial?: string;
  diametroMm?: number;
  pesoSpoolG?: number;
  tempExtrusor?: number;
  tempCama?: number;
  precioKg?: number;
  stockActualG?: number;
  stockMinimoG?: number;
  proveedor?: string;
  notas?: string;
}) {
  const nombre = input.nombre.trim();
  const marca = input.marca?.trim() || "Sin marca";
  const tipo = input.tipo?.trim() || "Sin tipo";
  const color = input.color?.trim() || "Sin color";
  const precioKg = roundMoney(input.precioKg ?? 0);
  const stockActualG = Math.max(0, Math.round(input.stockActualG ?? 0));
  const stockMinimoG = Math.max(0, Math.round(input.stockMinimoG ?? 0));

  if (!nombre) {
    throw new Error("El material necesita al menos un nombre.");
  }
  if (
    precioKg < 0 ||
    stockActualG < 0 ||
    stockMinimoG < 0 ||
    (input.diametroMm ?? 0) < 0 ||
    (input.pesoSpoolG ?? 0) < 0 ||
    (input.tempExtrusor ?? 0) < 0 ||
    (input.tempCama ?? 0) < 0
  ) {
    throw new Error("No se permiten importes ni stock negativos.");
  }

  const materialId = randomUUID();
  await transaction(async () => {
    await run(
      `INSERT INTO materials
        (id, codigo, nombre, marca, tipo, color, tipo_color, efecto, color_base, nombre_comercial, diametro_mm, peso_spool_g, temp_extrusor, temp_cama, precio_kg, stock_actual_g, stock_minimo_g, proveedor, notas, activo, fecha_actualizacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      materialId,
      await nextCode("materials", "MAT-"),
      nombre,
      marca,
      tipo,
      color,
      input.tipoColor?.trim() || null,
      input.efecto?.trim() || null,
      input.colorBase?.trim() || null,
      input.nombreComercial?.trim() || null,
      input.diametroMm != null ? roundMoney(input.diametroMm) : null,
      input.pesoSpoolG != null ? Math.round(input.pesoSpoolG) : null,
      input.tempExtrusor != null ? Math.round(input.tempExtrusor) : null,
      input.tempCama != null ? Math.round(input.tempCama) : null,
      precioKg,
      0,
      stockMinimoG,
      input.proveedor?.trim() || null,
      input.notas?.trim() || null,
      1,
      nowIso(),
    );

    if (stockActualG > 0) {
      await applyMaterialInventoryMovement({
        materialId,
        tipo: "ENTRADA",
        cantidadG: stockActualG,
        motivo: "Stock inicial del material",
        referencia: "ALTA_MATERIAL",
      });
    }
  });
}

export async function updateMaterialRecord(input: {
  id: string;
  nombre: string;
  marca?: string;
  tipo?: string;
  color?: string;
  tipoColor?: string;
  efecto?: string;
  colorBase?: string;
  nombreComercial?: string;
  diametroMm?: number;
  pesoSpoolG?: number;
  tempExtrusor?: number;
  tempCama?: number;
  precioKg?: number;
  stockActualG?: number;
  stockMinimoG?: number;
  proveedor?: string;
  notas?: string;
}) {
  const nombre = input.nombre.trim();
  const marca = input.marca?.trim() || "Sin marca";
  const tipo = input.tipo?.trim() || "Sin tipo";
  const color = input.color?.trim() || "Sin color";
  const precioKg = roundMoney(input.precioKg ?? 0);
  const stockMinimoG = Math.max(0, Math.round(input.stockMinimoG ?? 0));

  if (!input.id || !nombre) {
    throw new Error("Material incompleto.");
  }
  if (
    precioKg < 0 ||
    stockMinimoG < 0 ||
    (input.diametroMm ?? 0) < 0 ||
    (input.pesoSpoolG ?? 0) < 0 ||
    (input.tempExtrusor ?? 0) < 0 ||
    (input.tempCama ?? 0) < 0
  ) {
    throw new Error("No se permiten importes ni stock minimo negativos.");
  }

  const current = await row<{ stock_actual_g: number; activo: number }>(
    `SELECT stock_actual_g, activo FROM materials WHERE id = ?`,
    input.id,
  );
  if (!current) {
    throw new Error("El material no existe.");
  }
  const stockActualG = input.stockActualG != null ? Math.round(input.stockActualG) : current.stock_actual_g;
  if (stockActualG !== current.stock_actual_g) {
    throw new Error("El stock actual solo se modifica mediante movimientos de inventario.");
  }

  await run(
    `UPDATE materials
     SET nombre = ?, marca = ?, tipo = ?, color = ?, tipo_color = ?, efecto = ?, color_base = ?, nombre_comercial = ?, diametro_mm = ?, peso_spool_g = ?, temp_extrusor = ?, temp_cama = ?, precio_kg = ?, stock_minimo_g = ?, proveedor = ?, notas = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    nombre,
    marca,
    tipo,
    color,
    input.tipoColor?.trim() || null,
    input.efecto?.trim() || null,
    input.colorBase?.trim() || null,
    input.nombreComercial?.trim() || null,
    input.diametroMm != null ? roundMoney(input.diametroMm) : null,
    input.pesoSpoolG != null ? Math.round(input.pesoSpoolG) : null,
    input.tempExtrusor != null ? Math.round(input.tempExtrusor) : null,
    input.tempCama != null ? Math.round(input.tempCama) : null,
    precioKg,
    stockMinimoG,
    input.proveedor?.trim() || null,
    input.notas?.trim() || null,
    nowIso(),
    input.id,
  );
}

export async function setMaterialActiveState(materialId: string, active: boolean) {
  const material = await getMaterialStatusOrThrow(materialId);

  if (material.activo === active) {
    return;
  }

  await run(
    `UPDATE materials
     SET activo = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    active ? 1 : 0,
    nowIso(),
    materialId,
  );
}

export async function archiveMaterial(materialId: string) {
  await setMaterialActiveState(materialId, false);
}

export async function unarchiveMaterial(materialId: string) {
  await setMaterialActiveState(materialId, true);
}

export async function deleteMaterialRecord(materialId: string) {
  await getMaterialStatusOrThrow(materialId);
  throw new Error("El borrado fisico esta deshabilitado. Archiva el material para retirarlo del uso diario.");
}

export async function createProductRecord(input: {
  nombre: string;
  descripcion?: string;
  enlaceModelo?: string;
  gramosEstimados?: number;
  tiempoImpresionHoras?: number;
  costeElectricidad?: number;
  costeMaquina?: number;
  costeManoObra?: number;
  costePostprocesado?: number;
  margen?: number;
  pvp?: number;
  ivaPorcentaje?: number;
  materialId: string;
  activo?: boolean;
}) {
  const nombre = input.nombre.trim();
  const gramosEstimados = Math.max(1, Math.round(input.gramosEstimados ?? 1));
  const tiempoImpresionHoras = roundMoney(input.tiempoImpresionHoras ?? 0.1);
  const costeElectricidad = roundMoney(input.costeElectricidad ?? 0);
  const margen = roundMoney(input.margen ?? 0);
  const pvp = roundMoney(input.pvp ?? 0);
  const ivaPorcentaje = normalizeVatRate(input.ivaPorcentaje);

  if (!nombre) {
    throw new Error("El producto necesita al menos un nombre.");
  }
  if (!input.materialId) {
    throw new Error("No se puede crear un producto sin material principal.");
  }
  if (
    tiempoImpresionHoras < 0 ||
    pvp < 0 ||
    costeElectricidad < 0 ||
    (input.costeMaquina ?? 0) < 0 ||
    (input.costeManoObra ?? 0) < 0 ||
    (input.costePostprocesado ?? 0) < 0
  ) {
    throw new Error("Revisa el producto: tiempo, PVP y costes deben ser validos.");
  }

  const material = await row<{ id: string; activo: number }>(
    `SELECT id, activo FROM materials WHERE id = ?`,
    input.materialId,
  );
  if (!material) {
    throw new Error("El material principal no existe.");
  }
  if (!material.activo) {
    throw new Error("No se puede crear un producto nuevo con un material archivado.");
  }

  const productId = randomUUID();
  await transaction(async () => {
    await run(
      `INSERT INTO products
        (id, codigo, nombre, descripcion, enlace_modelo, gramos_estimados, tiempo_impresion_horas, coste_electricidad, coste_maquina, coste_mano_obra, coste_postprocesado, margen, pvp, iva_porcentaje, material_id, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      productId,
      await nextCode("products", "PRO-"),
      nombre,
      input.descripcion?.trim() || null,
      input.enlaceModelo?.trim() || null,
      gramosEstimados,
      tiempoImpresionHoras,
      costeElectricidad,
      roundMoney(input.costeMaquina ?? 0),
      roundMoney(input.costeManoObra ?? 0),
      roundMoney(input.costePostprocesado ?? 0),
      margen,
      pvp,
      ivaPorcentaje,
      input.materialId,
      input.activo === false ? 0 : 1,
    );
    await ensureFinishedInventoryRow(productId);
    await run(
      `UPDATE finished_product_inventory
       SET precio_venta = ?, fecha_actualizacion = ?
       WHERE product_id = ?`,
      pvp,
      nowIso(),
      productId,
    );
  });
}

export async function updateProductRecord(input: {
  id: string;
  nombre: string;
  descripcion?: string;
  enlaceModelo?: string;
  gramosEstimados?: number;
  tiempoImpresionHoras?: number;
  costeElectricidad?: number;
  costeMaquina?: number;
  costeManoObra?: number;
  costePostprocesado?: number;
  margen?: number;
  pvp?: number;
  ivaPorcentaje?: number;
  materialId: string;
  activo?: boolean;
}) {
  const nombre = input.nombre.trim();
  const gramosEstimados = Math.max(1, Math.round(input.gramosEstimados ?? 1));
  const tiempoImpresionHoras = roundMoney(input.tiempoImpresionHoras ?? 0.1);
  const costeElectricidad = roundMoney(input.costeElectricidad ?? 0);
  const margen = roundMoney(input.margen ?? 0);
  const pvp = roundMoney(input.pvp ?? 0);
  const ivaPorcentaje = normalizeVatRate(input.ivaPorcentaje);

  if (!input.id || !input.materialId || !nombre) {
    throw new Error("Producto incompleto.");
  }
  if (
    tiempoImpresionHoras < 0 ||
    pvp < 0 ||
    costeElectricidad < 0 ||
    (input.costeMaquina ?? 0) < 0 ||
    (input.costeManoObra ?? 0) < 0 ||
    (input.costePostprocesado ?? 0) < 0
  ) {
    throw new Error("Revisa el producto: tiempo, PVP y costes deben ser validos.");
  }

  const currentProduct = await row<{ material_id: string; activo: number }>(
    `SELECT material_id, activo FROM products WHERE id = ?`,
    input.id,
  );
  if (!currentProduct) {
    throw new Error("El producto no existe.");
  }

  const material = await row<{ id: string; activo: number }>(
    `SELECT id, activo FROM materials WHERE id = ?`,
    input.materialId,
  );
  if (!material) {
    throw new Error("El material principal no existe.");
  }
  if (!material.activo && currentProduct.material_id !== input.materialId) {
    throw new Error("No se puede asignar un material archivado a nuevos usos.");
  }

  if (parseBoolean(currentProduct.activo) && input.activo === false) {
    const openOrderLines = (await row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM order_lines l
       JOIN orders o ON o.id = l.pedido_id
       WHERE l.producto_id = ?
         AND o.estado IN ('BORRADOR', 'CONFIRMADO', 'EN_PRODUCCION', 'LISTO', 'ENTREGADO', 'INCIDENCIA_STOCK')`,
      input.id,
    ))?.total ?? 0;
    const openManufacturing = (await row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM manufacturing_orders
       WHERE producto_id = ?
         AND estado IN ('PENDIENTE', 'INICIADA', 'BLOQUEADA_POR_STOCK')`,
      input.id,
    ))?.total ?? 0;

    if (openOrderLines > 0 || openManufacturing > 0) {
      throw new Error("No se puede desactivar el producto mientras participe en pedidos u ordenes de fabricacion abiertas.");
    }
  }

  await transaction(async () => {
    await run(
      `UPDATE products
       SET nombre = ?, descripcion = ?, enlace_modelo = ?, gramos_estimados = ?, tiempo_impresion_horas = ?, coste_electricidad = ?, coste_maquina = ?, coste_mano_obra = ?, coste_postprocesado = ?, margen = ?, pvp = ?, iva_porcentaje = ?, material_id = ?, activo = ?
       WHERE id = ?`,
      nombre,
      input.descripcion?.trim() || null,
      input.enlaceModelo?.trim() || null,
      gramosEstimados,
      tiempoImpresionHoras,
      costeElectricidad,
      roundMoney(input.costeMaquina ?? 0),
      roundMoney(input.costeManoObra ?? 0),
      roundMoney(input.costePostprocesado ?? 0),
      margen,
      pvp,
      ivaPorcentaje,
      input.materialId,
      input.activo === false ? 0 : 1,
      input.id,
    );
    await ensureFinishedInventoryRow(input.id);
    await run(
      `UPDATE finished_product_inventory
       SET precio_venta = ?, fecha_actualizacion = ?
       WHERE product_id = ?`,
      pvp,
      nowIso(),
      input.id,
    );
  });
}

export async function setProductActiveState(productId: string, active: boolean) {
  const product = await getProductStatusOrThrow(productId);

  if (product.activo === active) {
    return;
  }

  if (!active) {
    const openOrderLines = (await row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM order_lines l
       JOIN orders o ON o.id = l.pedido_id
       WHERE l.producto_id = ?
         AND o.estado IN ('BORRADOR', 'CONFIRMADO', 'EN_PRODUCCION', 'LISTO', 'ENTREGADO', 'INCIDENCIA_STOCK')`,
      productId,
    ))?.total ?? 0;
    const openManufacturing = (await row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM manufacturing_orders
       WHERE producto_id = ?
         AND estado IN ('PENDIENTE', 'INICIADA', 'BLOQUEADA_POR_STOCK')`,
      productId,
    ))?.total ?? 0;

    if (openOrderLines > 0 || openManufacturing > 0) {
      throw new Error("No se puede archivar el producto porque participa en pedidos u ordenes de fabricacion abiertas.");
    }
  }

  await run(`UPDATE products SET activo = ? WHERE id = ?`, active ? 1 : 0, productId);
}

export async function archiveProduct(productId: string) {
  await setProductActiveState(productId, false);
}

export async function unarchiveProduct(productId: string) {
  await setProductActiveState(productId, true);
}

export async function createOrderRecord(input: {
  clienteId: string;
  observaciones?: string;
  descuento?: number;
  lines: LineInput[];
}) {
  if (!input.clienteId) {
    throw new Error("Debes seleccionar un cliente.");
  }
  const customer = await row<{ id: string; activo: number }>(
    `SELECT id, activo FROM customers WHERE id = ?`,
    input.clienteId,
  );
  if (!customer) {
    throw new Error("El cliente no existe.");
  }
  if (!parseBoolean(customer.activo)) {
    throw new Error("El cliente seleccionado esta archivado. Desarchivalo antes de crear pedidos nuevos.");
  }
  const validLines = input.lines.filter((line) => line.productId && line.quantity > 0);
  if (validLines.length === 0) {
    throw new Error("Debes añadir al menos una linea valida al pedido.");
  }

  const codigo = await nextCode("orders", "PED-");
  const calculations = await Promise.all(
    validLines.map(async (line) => {
      const product = await getProductOrThrow(line.productId);
      const values = draftLineCalculations(product, Math.round(line.quantity), line.unitPrice);
      return { line, values };
    }),
  );

  const costeTotalPedido = roundMoney(
    calculations.reduce((sum, item) => sum + item.values.costeTotal, 0),
  );
  const financials = calculateOrderFinancials({
    lineTotals: calculations.map((item) => ({
      grossTotal: item.values.precioTotalLinea,
      vatRate: item.values.ivaPorcentaje,
    })),
    costeTotalPedido,
    discount: input.descuento,
  });
  const orderId = randomUUID();

  await transaction(async () => {
    await run(
      `INSERT INTO orders
        (id, codigo, cliente_id, fecha_pedido, estado, estado_pago, subtotal, descuento, iva, total, coste_total_pedido, beneficio_total, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      codigo,
      input.clienteId,
      nowIso(),
      "BORRADOR",
      "NO_FACTURADO",
      financials.subtotal,
      financials.descuento,
      financials.iva,
      financials.total,
      financials.costeTotalPedido,
      financials.beneficioTotal,
      input.observaciones?.trim() || null,
    );

    for (const item of calculations) {
      await run(
        `INSERT INTO order_lines
          (id, codigo, pedido_id, producto_id, cantidad, cantidad_desde_stock, cantidad_a_fabricar, precio_unitario, precio_total_linea, iva_porcentaje, gramos_totales, coste_material, coste_electricidad_total, coste_impresora_total, coste_total, beneficio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        await nextCode("order_lines", "LIN-"),
        orderId,
        item.line.productId,
        Math.round(item.line.quantity),
        0,
        0,
        item.values.precioUnitario,
        item.values.precioTotalLinea,
        item.values.ivaPorcentaje,
        item.values.gramosTotales,
        item.values.costeMaterial,
        item.values.costeElectricidadTotal,
        item.values.costeImpresoraTotal,
        item.values.costeTotal,
        item.values.beneficio,
      );
    }

    await registerOrderHistory(orderId, "BORRADOR", "Pedido creado en borrador.");
    await recalculateOrderTotals(orderId);
  });

  return orderId;
}

export async function updateManufacturingOrderRecord(input: {
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

  const current = await row<{ estado: string; impresora_id: string | null }>(
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

  await run(
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

export async function updateInvoiceRecord(input: {
  id: string;
  estadoPago?: string;
  descuento?: number;
}) {
  if (!input.id) {
    throw new Error("La factura necesita ID.");
  }
  const wantsDiscountUpdate = input.descuento != null;
  const wantsStatusUpdate = typeof input.estadoPago === "string" && input.estadoPago.length > 0;

  if (!wantsDiscountUpdate && !wantsStatusUpdate) {
    throw new Error("No hay cambios que aplicar en la factura.");
  }

  if (wantsDiscountUpdate) {
    await syncInvoicePaymentSummary(input.id);
    const invoice = await row<{
      id: string;
      pedido_id: string;
      subtotal: number;
      descuento: number;
      iva: number;
      total: number;
      total_pagado: number;
      importe_pendiente: number;
      estado_pago: string;
    }>(
      `SELECT id, pedido_id, subtotal, descuento, iva, total, total_pagado, importe_pendiente, estado_pago
       FROM invoices
       WHERE id = ?`,
      input.id,
    );

    if (!invoice) {
      throw new Error("La factura no existe.");
    }
    if (invoice.estado_pago === "PAGADA" || invoice.importe_pendiente <= 0) {
      throw new Error("No se puede modificar el descuento de una factura ya pagada.");
    }

    const invoiceLines = await rows<{ precio_total_linea: number; iva_porcentaje: number | null }>(
      `SELECT precio_total_linea, iva_porcentaje
       FROM order_lines
       WHERE pedido_id = ?`,
      invoice.pedido_id,
    );
    const nextFinancials = calculateOrderFinancials({
      lineTotals:
        invoiceLines.length > 0
          ? invoiceLines.map((line) => ({
              grossTotal: line.precio_total_linea,
              vatRate: line.iva_porcentaje ?? DEFAULT_VAT_RATE,
            }))
          : [{ grossTotal: roundMoney(invoice.total + (invoice.descuento ?? 0)), vatRate: DEFAULT_VAT_RATE }],
      costeTotalPedido: 0,
      discount: input.descuento,
    });

    if (roundMoney(invoice.total_pagado) > nextFinancials.total) {
      throw new Error("El descuento no puede dejar el total final por debajo de lo ya cobrado.");
    }

    await transaction(async () => {
      await run(
        `UPDATE invoices
         SET descuento = ?, iva = ?, total = ?
         WHERE id = ?`,
        nextFinancials.descuento,
        nextFinancials.iva,
        nextFinancials.total,
        input.id,
      );
      await syncInvoicePaymentSummary(input.id);
    });

    return;
  }

  if (!["PENDIENTE", "PARCIAL", "PAGADA"].includes(input.estadoPago!)) {
    throw new Error("Estado de pago no valido.");
  }

  const invoice = await row<{
    id: string;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
  }>(`SELECT id, total, total_pagado, importe_pendiente FROM invoices WHERE id = ?`, input.id);
  if (!invoice) {
    throw new Error("La factura no existe.");
  }

  if (input.estadoPago === "PENDIENTE") {
    const paymentCount = await row<{ total: number }>(
      `SELECT COUNT(*) AS total FROM invoice_payments WHERE factura_id = ?`,
      input.id,
    );
    if ((paymentCount?.total ?? 0) > 0) {
      throw new Error("No se puede forzar una factura a pendiente si ya tiene pagos registrados.");
    }
    await syncInvoicePaymentSummary(input.id);
    return;
  }

  if (input.estadoPago === "PARCIAL") {
    throw new Error("El estado parcial se calcula automaticamente a partir de los pagos.");
  }

  if (invoice.importe_pendiente <= 0) {
    await syncInvoicePaymentSummary(input.id);
    return;
  }

  await transaction(async () => {
    await run(
      `INSERT INTO invoice_payments
        (id, codigo, factura_id, fecha_pago, metodo_pago, importe, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      await nextCode("invoice_payments", "PAG-"),
      input.id,
      nowIso(),
      "OTRO",
      invoice.importe_pendiente,
      "Regularizacion manual desde edicion de factura",
    );
    await syncInvoicePaymentSummary(input.id);
  });
}

export async function createInvoicePaymentRecord(input: {
  facturaId: string;
  fechaPago?: string;
  metodoPago: string;
  importe: number;
  notas?: string;
}) {
  if (!input.facturaId) {
    throw new Error("Debes indicar la factura.");
  }
  if (!Number.isFinite(input.importe) || input.importe <= 0) {
    throw new Error("El importe del pago debe ser mayor que cero.");
  }

  await syncInvoicePaymentSummary(input.facturaId);

  const invoice = await row<{
    id: string;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(
    `SELECT id, total, total_pagado, importe_pendiente, estado_pago FROM invoices WHERE id = ?`,
    input.facturaId,
  );

  if (!invoice) {
    throw new Error("La factura no existe.");
  }
  if (invoice.estado_pago === "PAGADA" || invoice.importe_pendiente <= 0) {
    throw new Error("La factura ya esta pagada y no admite mas pagos.");
  }

  const metodoPago = normalizePaymentMethod(input.metodoPago);
  const rawDate = input.fechaPago?.trim();
  const fechaPago = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(fechaPago.getTime())) {
    throw new Error("La fecha de pago no es valida.");
  }

  const importe = roundMoney(input.importe);
  if (importe <= 0) {
    throw new Error("El importe del pago debe ser mayor que cero.");
  }
  if (importe > roundMoney(invoice.importe_pendiente)) {
    throw new Error("El pago supera el importe pendiente de la factura.");
  }
  if (roundMoney(invoice.total_pagado + importe) > roundMoney(invoice.total)) {
    throw new Error("El pago supera el importe pendiente de la factura.");
  }

  await transaction(async () => {
    await run(
      `INSERT INTO invoice_payments
        (id, codigo, factura_id, fecha_pago, metodo_pago, importe, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      await nextCode("invoice_payments", "PAG-"),
      input.facturaId,
      fechaPago.toISOString(),
      metodoPago,
      importe,
      input.notas?.trim() || null,
    );
    await syncInvoicePaymentSummary(input.facturaId);
  });
}

export async function createPrinterRecord(input: {
  nombre: string;
  estado?: PrinterState;
  horasUsoAcumuladas?: number;
  costeHora?: number;
  ubicacion?: string;
}) {
  if (!input.nombre.trim()) {
    throw new Error("La impresora necesita un nombre.");
  }
  if ((input.horasUsoAcumuladas ?? 0) < 0 || (input.costeHora ?? 0) < 0) {
    throw new Error("No se permiten horas ni costes negativos.");
  }

  await run(
    `INSERT INTO printers
      (id, codigo, nombre, estado, horas_uso_acumuladas, coste_hora, ubicacion, activo, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    await nextCode("printers", "IMP-"),
    input.nombre.trim(),
    input.estado ?? "LIBRE",
    roundMoney(input.horasUsoAcumuladas ?? 0),
    roundMoney(input.costeHora ?? 0),
    input.ubicacion?.trim() || null,
    1,
    nowIso(),
  );
}

export async function updatePrinterRecord(input: {
  id: string;
  nombre: string;
  estado: PrinterState;
  horasUsoAcumuladas?: number;
  costeHora?: number;
  ubicacion?: string;
}) {
  if (!input.id || !input.nombre.trim()) {
    throw new Error("La impresora necesita ID y nombre.");
  }
  const horasUsoAcumuladas = roundMoney(input.horasUsoAcumuladas ?? 0);
  const costeHora = roundMoney(input.costeHora ?? 0);
  if (horasUsoAcumuladas < 0 || costeHora < 0) {
    throw new Error("No se permiten horas ni costes negativos.");
  }

  const activeOrders = await rows<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE impresora_id = ? AND estado = 'INICIADA'`,
    input.id,
  );
  if (input.estado === "IMPRIMIENDO" && activeOrders.length !== 1) {
    throw new Error("Una impresora solo puede estar imprimiendo si tiene exactamente una orden activa asignada.");
  }
  if (input.estado !== "IMPRIMIENDO" && activeOrders.length > 0) {
    throw new Error("No se puede cambiar el estado de una impresora con una orden activa.");
  }

  await run(
    `UPDATE printers
     SET nombre = ?, estado = ?, horas_uso_acumuladas = ?, coste_hora = ?, ubicacion = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    input.nombre.trim(),
    input.estado,
    horasUsoAcumuladas,
    costeHora,
    input.ubicacion?.trim() || null,
    nowIso(),
    input.id,
  );
}

export async function setPrinterActiveState(printerId: string, active: boolean) {
  const printer = await getPrinterStatusOrThrow(printerId);

  if (printer.activo === active) {
    return;
  }

  if (!active) {
    const activeOrders = (await row<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM manufacturing_orders
       WHERE impresora_id = ? AND estado = 'INICIADA'`,
      printerId,
    ))?.total ?? 0;

    if (activeOrders > 0 || printer.estado === "IMPRIMIENDO") {
      throw new Error("No se puede archivar la impresora mientras tenga una orden de fabricacion activa.");
    }
  }

  await run(
    `UPDATE printers
     SET activo = ?, fecha_actualizacion = ?
     WHERE id = ?`,
    active ? 1 : 0,
    nowIso(),
    printerId,
  );
}

export async function archivePrinter(printerId: string) {
  await setPrinterActiveState(printerId, false);
}

export async function unarchivePrinter(printerId: string) {
  await setPrinterActiveState(printerId, true);
}

export async function restockFinishedProduct(
  productId: string,
  quantity: number,
  reason: string,
  location?: string,
  unitCost?: number,
) {
  const parsedQuantity = requirePositiveInteger(quantity, "La entrada de producto terminado debe ser mayor que cero.");
  const product = await row<{ id: string; pvp: number; activo: number }>(
    `SELECT id, pvp, activo FROM products WHERE id = ?`,
    productId,
  );
  if (!product) {
    throw new Error("El producto no existe.");
  }
  if (!parseBoolean(product.activo)) {
    throw new Error("El producto esta archivado. Desarchivalo antes de registrar nuevas entradas.");
  }
  if (unitCost != null && unitCost < 0) {
    throw new Error("El coste unitario no puede ser negativo.");
  }

  await transaction(async () => {
    await applyFinishedInventoryMovement({
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

export async function updateFinishedInventoryRecord(input: {
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

  const current = await row<{
    id: string;
    codigo: string;
    product_id: string;
    cantidad_disponible: number;
  }>(`SELECT id, codigo, product_id, cantidad_disponible FROM finished_product_inventory WHERE id = ?`, input.id);
  if (!current) {
    throw new Error("El registro de inventario no existe.");
  }

  await transaction(async () => {
    const delta = Math.round(input.cantidadDisponible) - current.cantidad_disponible;
    if (delta === 0) {
      await run(
        `UPDATE finished_product_inventory
         SET ubicacion = ?, coste_unitario = ?, precio_venta = ?, fecha_actualizacion = ?
         WHERE id = ?`,
        input.ubicacion?.trim() || null,
        roundMoney(input.costeUnitario),
        roundMoney(input.precioVenta),
        nowIso(),
        input.id,
      );
      await syncFinishedInventoryMetrics(current.product_id);
      return;
    }

    await applyFinishedInventoryMovement({
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

export async function confirmOrder(orderId: string) {
  const order = await row<{ id: string; codigo: string; estado: string }>(
    `SELECT id, codigo, estado FROM orders WHERE id = ?`,
    orderId,
  );
  if (!order) {
    throw new Error("El pedido no existe.");
  }
  if (["EN_PRODUCCION", "LISTO", "ENTREGADO", "FACTURADO"].includes(order.estado)) {
    throw new Error("Solo se pueden confirmar pedidos pendientes de planificacion.");
  }

  const linesBase = await rows<{ producto_id: string }>(
    `SELECT producto_id FROM order_lines WHERE pedido_id = ?`,
    orderId,
  );
  if (linesBase.length === 0) {
    throw new Error("El pedido no existe o no tiene lineas.");
  }

  for (const line of linesBase) {
    await ensureFinishedInventoryRow(line.producto_id);
  }

  const lines = await rows<{
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

  await transaction(async () => {
    await restoreOrderInventoryAllocations(orderId, order.codigo);

    const materialNeeds = new Map<string, { required: number; available: number; label: string }>();
    const planning = [];
    for (const line of lines) {
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

      await run(
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
        await applyFinishedInventoryMovement({
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

      planning.push({ ...line, toManufacture });
    }

    incidents.push(
      ...Array.from(materialNeeds.values())
        .filter((entry) => entry.available < entry.required)
        .map((entry) => `${entry.label}: requiere ${entry.required} g y solo hay ${entry.available} g.`),
    );

    for (const line of planning) {
      if (line.toManufacture <= 0) {
        continue;
      }

      await run(
        `INSERT INTO manufacturing_orders
          (id, codigo, pedido_id, linea_pedido_id, producto_id, cantidad, estado, fecha_inicio, fecha_fin, gramos_consumidos, tiempo_real_horas, coste_impresora_total, incidencia)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        await nextCode("manufacturing_orders", "OF-"),
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

    await run(`UPDATE orders SET estado = ? WHERE id = ?`, nextStatus, orderId);
    await registerOrderHistory(
      orderId,
      nextStatus,
      nextStatus === "LISTO"
        ? `Pedido cubierto con stock terminado. ${totalFromStock} unidades salen directamente del inventario.`
        : incidents.length > 0
          ? incidents.join(" ")
          : `Pedido confirmado. ${totalFromStock} unidades salen de stock y ${totalToManufacture} pasan a fabricacion.`,
    );
    await recalculateOrderTotals(orderId);
    await syncFinishedInventoryMetricsForOrder(orderId);
  });

  return {
    ok: incidents.length === 0,
    incidents,
    fromStockUnits: totalFromStock,
    toManufactureUnits: totalToManufacture,
  };
}

export async function retryOrderAfterRestock(orderId: string) {
  return await confirmOrder(orderId);
}

export async function processOrder(orderId: string) {
  const order = await row<{ id: string; codigo: string; estado: string }>(
    `SELECT id, codigo, estado FROM orders WHERE id = ?`,
    orderId,
  );

  if (!order) {
    throw new Error("El pedido no existe.");
  }

  if (order.estado === "BORRADOR" || order.estado === "INCIDENCIA_STOCK") {
    const confirmation = await confirmOrder(orderId);
    const refreshedOrder = await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId);
    const nextStatus = refreshedOrder?.estado ?? order.estado;
    const message = confirmation.ok
      ? confirmation.toManufactureUnits > 0
        ? `Pedido ${order.codigo} procesado. ${confirmation.fromStockUnits} uds reservadas y ${confirmation.toManufactureUnits} uds enviadas a fabricacion.`
        : `Pedido ${order.codigo} procesado. Todo el stock terminado quedo reservado y el pedido esta listo.`
      : `Pedido ${order.codigo} procesado con aviso: ${confirmation.incidents.join(" ")}`;

    return {
      action: "processed" as const,
      orderCode: order.codigo,
      orderStatus: nextStatus,
      ok: confirmation.ok,
      incidents: confirmation.incidents,
      fromStockUnits: confirmation.fromStockUnits,
      toManufactureUnits: confirmation.toManufactureUnits,
      message,
      tone: (confirmation.ok ? "success" : "warn") as WorkflowTone,
    };
  }

  const passiveMessageByStatus: Record<string, string> = {
    CONFIRMADO: `El pedido ${order.codigo} ya estaba procesado y pendiente de fabricacion.`,
    EN_PRODUCCION: `El pedido ${order.codigo} ya esta en produccion.`,
    LISTO: `El pedido ${order.codigo} ya esta listo para entregar.`,
    ENTREGADO: `El pedido ${order.codigo} ya estaba entregado.`,
    FACTURADO: `El pedido ${order.codigo} ya estaba facturado.`,
  };

  return {
    action: "noop" as const,
    orderCode: order.codigo,
    orderStatus: order.estado,
    ok: order.estado !== "INCIDENCIA_STOCK",
    incidents: [],
    fromStockUnits: 0,
    toManufactureUnits: 0,
    message: passiveMessageByStatus[order.estado] ?? `El pedido ${order.codigo} ya estaba actualizado.`,
    tone: "success" as WorkflowTone,
  };
}

export async function updateOrderRecord(input: {
  id: string;
  clienteId: string;
  observaciones?: string;
  estado?: string;
  descuento?: number;
  lines: LineInput[];
}) {
  if (!input.id || !input.clienteId) {
    throw new Error("Pedido incompleto.");
  }

  const current = await row<{ estado: string; codigo: string }>(
    `SELECT estado, codigo FROM orders WHERE id = ?`,
    input.id,
  );
  if (!current) {
    throw new Error("El pedido no existe.");
  }
  const customer = await row<{ id: string; activo: number }>(
    `SELECT id, activo FROM customers WHERE id = ?`,
    input.clienteId,
  );
  if (!customer) {
    throw new Error("El cliente no existe.");
  }
  if (!parseBoolean(customer.activo)) {
    throw new Error("El cliente seleccionado esta archivado. Desarchivalo antes de editar el pedido.");
  }
  if (["EN_PRODUCCION", "LISTO", "ENTREGADO", "FACTURADO"].includes(current.estado)) {
    throw new Error("No se pueden editar pedidos ya lanzados a produccion o cerrados.");
  }

  const validLines = input.lines.filter((line) => line.productId && line.quantity > 0);
  if (validLines.length === 0) {
    throw new Error("Debes mantener al menos una linea valida.");
  }

  const calculations = await Promise.all(
    validLines.map(async (line) => {
      const product = await getProductOrThrow(line.productId);
      const values = draftLineCalculations(product, Math.round(line.quantity), line.unitPrice);
      return { line, values };
    }),
  );
  const costeTotalPedido = roundMoney(
    calculations.reduce((sum, item) => sum + item.values.costeTotal, 0),
  );
  const financials = calculateOrderFinancials({
    lineTotals: calculations.map((item) => ({
      grossTotal: item.values.precioTotalLinea,
      vatRate: item.values.ivaPorcentaje,
    })),
    costeTotalPedido,
    discount: input.descuento,
  });
  const nextStatus = current.estado === "INCIDENCIA_STOCK" ? "INCIDENCIA_STOCK" : "BORRADOR";

  await transaction(async () => {
    await restoreOrderInventoryAllocations(input.id, current.codigo);
    await run(`DELETE FROM order_lines WHERE pedido_id = ?`, input.id);
    await run(
      `UPDATE orders
       SET cliente_id = ?, observaciones = ?, estado = ?, subtotal = ?, descuento = ?, iva = ?, total = ?, coste_total_pedido = ?, beneficio_total = ?
       WHERE id = ?`,
      input.clienteId,
      input.observaciones?.trim() || null,
      nextStatus,
      financials.subtotal,
      financials.descuento,
      financials.iva,
      financials.total,
      financials.costeTotalPedido,
      financials.beneficioTotal,
      input.id,
    );

    for (const item of calculations) {
      await run(
      `INSERT INTO order_lines
          (id, codigo, pedido_id, producto_id, cantidad, cantidad_desde_stock, cantidad_a_fabricar, precio_unitario, precio_total_linea, iva_porcentaje, gramos_totales, coste_material, coste_electricidad_total, coste_impresora_total, coste_total, beneficio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        await nextCode("order_lines", "LIN-"),
        input.id,
        item.line.productId,
        Math.round(item.line.quantity),
        0,
        0,
        item.values.precioUnitario,
        item.values.precioTotalLinea,
        item.values.ivaPorcentaje,
        item.values.gramosTotales,
        item.values.costeMaterial,
        item.values.costeElectricidadTotal,
        item.values.costeImpresoraTotal,
        item.values.costeTotal,
        item.values.beneficio,
      );
    }

    await registerOrderHistory(
      input.id,
      nextStatus,
      nextStatus === "INCIDENCIA_STOCK"
        ? "Pedido editado manualmente. Mantiene incidencia hasta revalidar stock."
        : "Pedido editado manualmente. Vuelve a borrador para recalcular stock y fabricacion.",
    );
    await recalculateOrderTotals(input.id);
    await syncFinishedInventoryMetricsForOrder(input.id);
  });
}

export async function startManufacturingOrder(manufacturingOrderId: string) {
  const manufacturingOrder = await row<{
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
    await transaction(async () => {
      await run(
        `UPDATE manufacturing_orders
         SET estado = ?, incidencia = ?
         WHERE id = ?`,
        "BLOQUEADA_POR_STOCK",
        `No hay stock suficiente. Requiere ${gramsRequired} g y hay ${manufacturingOrder.stock_actual_g} g.`,
        manufacturingOrderId,
      );
      await run(`UPDATE orders SET estado = ? WHERE id = ?`, "INCIDENCIA_STOCK", manufacturingOrder.pedido_id);
      await registerOrderHistory(
        manufacturingOrder.pedido_id,
        "INCIDENCIA_STOCK",
        "La fabricacion no pudo iniciarse por falta de material.",
      );
    });
    throw new Error("No se puede iniciar fabricacion sin stock suficiente.");
  }

  const printer =
    (manufacturingOrder.impresora_id
      ? await row<{
          id: string;
          codigo: string;
          nombre: string;
          estado: PrinterState;
          horas_uso_acumuladas: number;
          coste_hora: number;
          activo: number;
        }>(`SELECT * FROM printers WHERE id = ?`, manufacturingOrder.impresora_id)
      : undefined) ?? (await getFirstAvailablePrinter());

  if (!printer) {
    throw new Error("No hay impresoras libres para lanzar la orden.");
  }
  if (!parseBoolean(printer.activo)) {
    throw new Error("La impresora asignada esta inactiva. Reactivala antes de iniciar la fabricacion.");
  }
  if (printer.estado !== "LIBRE") {
    throw new Error("La impresora asignada no esta libre.");
  }

  const busyConflict = await row<{ id: string }>(
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

  await transaction(async () => {
    await run(
      `UPDATE manufacturing_orders
       SET estado = ?, impresora_id = ?, fecha_inicio = COALESCE(fecha_inicio, ?), incidencia = NULL
       WHERE id = ?`,
      "INICIADA",
      printer.id,
      nowIso(),
      manufacturingOrderId,
    );
    await run(
      `UPDATE printers
       SET estado = 'IMPRIMIENDO', fecha_actualizacion = ?
       WHERE id = ?`,
      nowIso(),
      printer.id,
    );
    await run(`UPDATE orders SET estado = ? WHERE id = ?`, "EN_PRODUCCION", manufacturingOrder.pedido_id);
    await registerOrderHistory(
      manufacturingOrder.pedido_id,
      "EN_PRODUCCION",
      `Fabricacion iniciada para ${manufacturingOrder.producto_nombre} en ${printer.nombre}.`,
    );
  });
}

export async function completeManufacturingOrder(manufacturingOrderId: string) {
  const manufacturingOrder = await row<{
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

  await transaction(async () => {
    await run(
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
    await run(
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

    await applyMaterialInventoryMovement({
      materialId: manufacturingOrder.material_id,
      tipo: "SALIDA",
      cantidadG: gramsRequired,
      motivo: `Consumo en ${manufacturingOrder.codigo}`,
      referencia: manufacturingOrder.pedido_codigo,
    });

    await applyFinishedInventoryMovement({
      productId: manufacturingOrder.producto_id,
      tipo: "ENTRADA",
      cantidad: manufacturingOrder.cantidad,
      motivo: `Produccion completada en ${manufacturingOrder.codigo}`,
      referencia: manufacturingOrder.codigo,
      costeUnitario: unitCost,
    });

    await applyFinishedInventoryMovement({
      productId: manufacturingOrder.producto_id,
      tipo: "SALIDA",
      cantidad: manufacturingOrder.cantidad,
      motivo: `Producto fabricado asignado a ${manufacturingOrder.pedido_codigo}`,
      referencia: manufacturingOrder.pedido_codigo,
    });

    await run(
      `UPDATE printers
       SET estado = 'LIBRE', horas_uso_acumuladas = horas_uso_acumuladas + ?, fecha_actualizacion = ?
       WHERE id = ?`,
      totalHours,
      nowIso(),
      manufacturingOrder.impresora_id,
    );

    const pendingStateRows = await rows<{ estado: string }>(
      `SELECT estado FROM manufacturing_orders WHERE pedido_id = ?`,
      manufacturingOrder.pedido_id,
    );
    const pendingStates = pendingStateRows.map((item) => item.estado);

    const nextStatus = pendingStates.some((item) => item === "BLOQUEADA_POR_STOCK")
      ? "INCIDENCIA_STOCK"
      : pendingStates.every((item) => item === "COMPLETADA")
        ? "LISTO"
        : "EN_PRODUCCION";

    await run(`UPDATE orders SET estado = ? WHERE id = ?`, nextStatus, manufacturingOrder.pedido_id);
    await registerOrderHistory(
      manufacturingOrder.pedido_id,
      nextStatus,
      nextStatus === "LISTO"
        ? "Todas las lineas fabricables estan completadas. Pedido listo."
        : `Fabricacion completada para ${manufacturingOrder.producto_nombre}.`,
    );
    await recalculateOrderTotals(manufacturingOrder.pedido_id);
    await syncFinishedInventoryMetrics(manufacturingOrder.producto_id);
  });

  return {
    grams: gramsRequired,
    materialCost,
    electricityCost,
    printerCost,
    totalHours,
  };
}

export async function completeManufacturingWorkflow(manufacturingOrderId: string) {
  const manufacturingOrder = await row<{
    id: string;
    codigo: string;
    estado: string;
    pedido_id: string;
    incidencia: string | null;
  }>(
    `SELECT id, codigo, estado, pedido_id, incidencia
     FROM manufacturing_orders
     WHERE id = ?`,
    manufacturingOrderId,
  );

  if (!manufacturingOrder) {
    throw new Error("La orden de fabricacion no existe.");
  }

  if (manufacturingOrder.estado === "COMPLETADA") {
    const order = await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, manufacturingOrder.pedido_id);
    return {
      action: "noop" as const,
      manufacturingCode: manufacturingOrder.codigo,
      manufacturingStatus: manufacturingOrder.estado,
      orderStatus: order?.estado ?? "LISTO",
      autoStarted: false,
      message: `La fabricacion ${manufacturingOrder.codigo} ya estaba completada.`,
      tone: "success" as WorkflowTone,
    };
  }

  if (manufacturingOrder.estado === "BLOQUEADA_POR_STOCK") {
    throw new Error(
      manufacturingOrder.incidencia?.trim() || "La fabricacion sigue bloqueada por stock. Repon material antes de completarla.",
    );
  }

  let autoStarted = false;
  if (manufacturingOrder.estado === "PENDIENTE") {
    await startManufacturingOrder(manufacturingOrderId);
    autoStarted = true;
  }

  const completion = await completeManufacturingOrder(manufacturingOrderId);
  const refreshed = await row<{ estado: string }>(
    `SELECT estado FROM orders WHERE id = ?`,
    manufacturingOrder.pedido_id,
  );

  return {
    action: "completed" as const,
    manufacturingCode: manufacturingOrder.codigo,
    manufacturingStatus: "COMPLETADA",
    orderStatus: refreshed?.estado ?? "LISTO",
    autoStarted,
    grams: completion.grams,
    totalHours: completion.totalHours,
    message: autoStarted
      ? `Fabricacion ${manufacturingOrder.codigo} completada en un paso. Se inicio y finalizo automaticamente.`
      : `Fabricacion ${manufacturingOrder.codigo} completada y stock actualizado.`,
    tone: "success" as WorkflowTone,
  };
}

export async function restockMaterial(materialId: string, quantityG: number, reason: string) {
  const parsedQuantity = requirePositiveInteger(quantityG, "La reposicion debe ser mayor que cero.");
  const material = await getMaterialStatusOrThrow(materialId);

  if (!material.activo) {
    throw new Error("El material esta archivado. Desarchivalo antes de registrar una reposicion.");
  }

  await transaction(async () => {
    await applyMaterialInventoryMovement({
      materialId,
      tipo: "ENTRADA",
      cantidadG: parsedQuantity,
      motivo: reason.trim() || "Reposicion manual",
      referencia: "REPOSICION",
    });
  });
}

export async function deliverOrder(orderId: string) {
  const order = await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId);
  if (!order) {
    throw new Error("El pedido no existe.");
  }
  if (order.estado !== "LISTO") {
    throw new Error("Solo se pueden entregar pedidos que esten listos.");
  }

  const pendingUnits = await countUnfulfilledOrderLines(orderId);
  if (pendingUnits > 0) {
    throw new Error("No se puede entregar un pedido con unidades pendientes.");
  }

  await transaction(async () => {
    await run(`UPDATE orders SET estado = ? WHERE id = ?`, "ENTREGADO", orderId);
    await registerOrderHistory(orderId, "ENTREGADO", "Pedido entregado al cliente.");
    await syncFinishedInventoryMetricsForOrder(orderId);
  });
}

export async function deliverOrderWorkflow(orderId: string) {
  const order = await row<{ id: string; codigo: string; estado: string }>(
    `SELECT id, codigo, estado FROM orders WHERE id = ?`,
    orderId,
  );

  if (!order) {
    throw new Error("El pedido no existe.");
  }

  if (order.estado === "ENTREGADO" || order.estado === "FACTURADO") {
    return {
      action: "noop" as const,
      orderCode: order.codigo,
      orderStatus: order.estado,
      message:
        order.estado === "FACTURADO"
          ? `El pedido ${order.codigo} ya estaba facturado y entregado.`
          : `El pedido ${order.codigo} ya estaba entregado.`,
      tone: "success" as WorkflowTone,
    };
  }

  await deliverOrder(orderId);

  return {
    action: "delivered" as const,
    orderCode: order.codigo,
    orderStatus: "ENTREGADO",
    message: `Pedido ${order.codigo} entregado correctamente.`,
    tone: "success" as WorkflowTone,
  };
}

export async function generateInvoiceForOrder(orderId: string) {
  const order = await row<{
    id: string;
    codigo: string;
    cliente_id: string;
    estado: string;
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
  }>(`SELECT * FROM orders WHERE id = ?`, orderId);

  if (!order) {
    throw new Error("El pedido no existe.");
  }
  if ((await countUnfulfilledOrderLines(orderId)) > 0) {
    throw new Error("No se puede facturar un pedido incompleto.");
  }

  const existing = await row(`SELECT id FROM invoices WHERE pedido_id = ?`, orderId);
  if (existing) {
    return;
  }
  if (order.estado !== "ENTREGADO") {
    throw new Error("No se puede facturar si el pedido no esta entregado.");
  }

  await transaction(async () => {
    const codigo = await nextCode("invoices", "FAC-");
    await run(
      `INSERT INTO invoices
        (id, codigo, pedido_id, cliente_id, fecha, subtotal, descuento, iva, total, total_pagado, importe_pendiente, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      codigo,
      order.id,
      order.cliente_id,
      nowIso(),
      order.subtotal,
      order.descuento ?? 0,
      order.iva,
      order.total,
      0,
      order.total,
      "PENDIENTE",
    );
    await run(`UPDATE orders SET estado = ?, estado_pago = ? WHERE id = ?`, "FACTURADO", "PENDIENTE", orderId);
    await registerOrderHistory(orderId, "FACTURADO", `Factura ${codigo} generada.`);
    await syncFinishedInventoryMetricsForOrder(orderId);
  });
}

export async function invoiceOrderWorkflow(orderId: string) {
  const order = await row<{ id: string; codigo: string; estado: string }>(
    `SELECT id, codigo, estado FROM orders WHERE id = ?`,
    orderId,
  );

  if (!order) {
    throw new Error("El pedido no existe.");
  }

  const existingInvoice = await row<{ codigo: string }>(
    `SELECT codigo FROM invoices WHERE pedido_id = ?`,
    orderId,
  );

  if (existingInvoice) {
    return {
      action: "noop" as const,
      orderCode: order.codigo,
      invoiceCode: existingInvoice.codigo,
      orderStatus: order.estado,
      message: `El pedido ${order.codigo} ya tiene la factura ${existingInvoice.codigo}.`,
      tone: "success" as WorkflowTone,
    };
  }

  await generateInvoiceForOrder(orderId);

  const invoice = await row<{ codigo: string }>(`SELECT codigo FROM invoices WHERE pedido_id = ?`, orderId);

  return {
    action: "invoiced" as const,
    orderCode: order.codigo,
    invoiceCode: invoice?.codigo ?? null,
    orderStatus: "FACTURADO",
    message: invoice?.codigo
      ? `Factura ${invoice.codigo} generada para el pedido ${order.codigo}.`
      : `Factura generada para el pedido ${order.codigo}.`,
    tone: "success" as WorkflowTone,
  };
}

export async function collectInvoicePayment(invoiceId: string, paymentMethod: PaymentMethod = "TRANSFERENCIA") {
  await syncInvoicePaymentSummary(invoiceId);

  const invoice = await row<{
    id: string;
    codigo: string;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(
    `SELECT id, codigo, total, total_pagado, importe_pendiente, estado_pago
     FROM invoices
     WHERE id = ?`,
    invoiceId,
  );

  if (!invoice) {
    throw new Error("La factura no existe.");
  }

  if (invoice.estado_pago === "PAGADA" || invoice.importe_pendiente <= 0) {
    return {
      action: "noop" as const,
      invoiceCode: invoice.codigo,
      paymentStatus: "PAGADA",
      amountCollected: 0,
      message: `La factura ${invoice.codigo} ya estaba totalmente cobrada.`,
      tone: "success" as WorkflowTone,
    };
  }

  const amount = roundMoney(invoice.importe_pendiente);
  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: paymentMethod,
    importe: amount,
    notas: "Cobro rapido desde la accion principal.",
  });

  const refreshed = await row<{ estado_pago: string; total_pagado: number; importe_pendiente: number }>(
    `SELECT estado_pago, total_pagado, importe_pendiente
     FROM invoices
     WHERE id = ?`,
    invoice.id,
  );

  return {
    action: "collected" as const,
    invoiceCode: invoice.codigo,
    paymentStatus: refreshed?.estado_pago ?? "PAGADA",
    amountCollected: amount,
    totalPaid: refreshed?.total_pagado ?? invoice.total,
    pendingAmount: refreshed?.importe_pendiente ?? 0,
    message: `Factura ${invoice.codigo} cobrada por ${amount.toFixed(2)} EUR.`,
    tone: "success" as WorkflowTone,
  };
}
