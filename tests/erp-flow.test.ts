import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createOrderAction, updateProductAction } from "../app/actions";
import { buildCsvFilename, formatCsvDateTime, formatCsvMoney, serializeCsv } from "../lib/csv";
import { formatMaterialDisplay } from "../lib/display-format";
import { row, rows, run } from "../lib/db";
import {
  deriveInvoiceStatus,
  deriveManufacturingStatus,
  deriveOrderStatus,
  getInvoiceStatusTone,
  getNextAllowedActions,
  normalizeOrderStatus,
} from "../lib/erp-status";
import {
  authenticateUser,
  canPerformAction,
  createInitialAdmin,
  createUserRecord,
  filterSnapshotByRole,
  getVisibleSections,
  hasUsers,
  requirePermission,
  requestPasswordReset,
  resetPassword,
  updateUserRecord,
  withMockUser,
  type CurrentUser,
  type AppRole,
} from "../lib/auth";
import {
  approvePurchaseRequest,
  collectInvoicePayment,
  completeManufacturingOrder,
  completeManufacturingWorkflow,
  convertPurchaseRequestToStockEntry,
  confirmOrder,
  createCustomerRecord,
  createInvoicePaymentRecord,
  createMaterialRecord,
  createOrderRecord,
  createPurchaseRequestRecord,
  createStockManufacturingOrder,
  createPrinterRecord,
  createProductRecord,
  deliverOrder,
  deliverOrderWorkflow,
  deleteMaterialRecord,
  generateInvoiceForOrder,
  getAppSnapshot,
  getInvoicePdfData,
  getInvoicePaymentsExportRows,
  getInvoicesExportRows,
  invoiceOrderWorkflow,
  matchesOrderFocusCode,
  processOrder,
  prioritizeOrdersByFocus,
  rejectPurchaseRequest,
  resetDatabase,
  restockFinishedProduct,
  setCustomerActiveState,
  setMaterialActiveState,
  setPrinterActiveState,
  setProductActiveState,
  startManufacturingOrder,
  updateManufacturingOrderRecord,
  updateInvoiceRecord,
  updateMaterialRecord,
  updateProductRecord,
  updateOrderRecord,
  updatePrinterRecord,
} from "../lib/erp-service";
import {
  calculateMaterialCost,
  calculateProductionCost,
  calculateProfitability,
  DEFAULT_ELECTRICITY_COST_PER_HOUR,
  DEFAULT_MACHINE_COST_PER_HOUR,
} from "../lib/production-costs";
import { GET as getInvoicePdfRoute } from "../app/api/exports/invoices/[id]/pdf/route";

type CsvFixtureRow = {
  codigo: string;
  cliente: string;
  notas: string;
};

function getRedirectDigest(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    throw error;
  }

  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) {
    throw error;
  }

  return digest;
}

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
  pvp?: number;
  ivaPercentage?: number;
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
    pvp: input?.pvp ?? 30,
    ivaPorcentaje: input?.ivaPercentage,
    materialId,
  });
  await createPrinterRecord({ nombre: "Impresora 1", costeHora: 2, horasUsoAcumuladas: 0, estado: "LIBRE" });

  return ids();
}

function buildUser(role: AppRole, overrides?: Partial<CurrentUser>): CurrentUser {
  return {
    id: `${role.toLowerCase()}-1`,
    nombre: role,
    email: `${role.toLowerCase()}@eli-print.test`,
    role,
    clienteId: null,
    activo: true,
    ...overrides,
  };
}

async function setupPermissionsFixture() {
  await createCustomerRecord({ nombre: "Cliente Uno" });
  await createCustomerRecord({ nombre: "Cliente Dos" });
  const customerRows = await rows<{ id: string; codigo: string }>(`SELECT id, codigo FROM customers ORDER BY codigo ASC`);

  await createMaterialRecord({
    nombre: "PLA Roles",
    marca: "Marca",
    tipo: "PLA",
    color: "Azul",
    precioKg: 22,
    stockActualG: 2000,
    stockMinimoG: 100,
  });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  await createProductRecord({
    nombre: "Producto Roles",
    gramosEstimados: 100,
    tiempoImpresionHoras: 2,
    costeElectricidad: 1,
    costeMaquina: 0.5,
    costeManoObra: 0.4,
    costePostprocesado: 0.8,
    margen: 12,
    pvp: 35,
    materialId,
  });
  await createPrinterRecord({ nombre: "Impresora Roles", costeHora: 1.8, estado: "LIBRE" });
  const productId = (await row<{ id: string }>(`SELECT id FROM products LIMIT 1`))!.id;

  await createOrderRecord({
    clienteId: customerRows[0].id,
    observaciones: "Pedido cliente uno",
    lines: [{ productId, quantity: 1 }],
  });
  await createOrderRecord({
    clienteId: customerRows[1].id,
    observaciones: "Pedido cliente dos",
    lines: [{ productId, quantity: 2 }],
  });

  const orderRows = await rows<{ id: string; codigo: string }>(`SELECT id, codigo FROM orders ORDER BY codigo ASC`);
  await processOrder(orderRows[0].id);
  await completeManufacturingWorkflow((await row<{ id: string }>(`SELECT id FROM manufacturing_orders WHERE pedido_id = ?`, orderRows[0].id))!.id);
  await deliverOrderWorkflow(orderRows[0].id);
  await invoiceOrderWorkflow(orderRows[0].id);

  const firstInvoice = (await row<{ id: string }>(`SELECT id FROM invoices WHERE pedido_id = ?`, orderRows[0].id))!;
  const operatorUser = await createUserRecord({
    nombre: "Operador Roles",
    email: "operador.roles@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });
  const financialUser = await createUserRecord({
    nombre: "Finanzas Roles",
    email: "finanzas.roles@eli-print.test",
    password: "supersegura123",
    role: "GESTOR_FINANCIERO",
    activo: true,
  });
  const adminUser = await createUserRecord({
    nombre: "Admin Roles",
    email: "admin.roles@eli-print.test",
    password: "supersegura123",
    role: "ADMIN",
    activo: true,
  });
  const clientUser = await createUserRecord({
    nombre: "Cliente Roles",
    email: "cliente.roles@eli-print.test",
    password: "supersegura123",
    role: "CLIENTE",
    clienteId: customerRows[0].id,
    activo: true,
  });

  const operator = buildUser("OPERADOR", { id: operatorUser.id, email: "operador.roles@eli-print.test", nombre: "Operador Roles" });
  const financial = buildUser("GESTOR_FINANCIERO", { id: financialUser.id, email: "finanzas.roles@eli-print.test", nombre: "Finanzas Roles" });
  const admin = buildUser("ADMIN", { id: adminUser.id, email: "admin.roles@eli-print.test", nombre: "Admin Roles" });
  const client = buildUser("CLIENTE", { id: clientUser.id, email: "cliente.roles@eli-print.test", nombre: "Cliente Roles", clienteId: customerRows[0].id });

  return { operator, financial, admin, client, firstInvoiceId: firstInvoice.id, customerRows };
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

test("bootstrap del primer admin solo se permite una vez", async () => {
  assert.equal(await hasUsers(), false);

  const created = await createInitialAdmin({
    nombre: "Admin Inicial",
    email: "admin@eli-print.test",
    password: "supersegura123",
  });

  assert.equal(created.role, "ADMIN");
  assert.equal(await hasUsers(), true);
  await assert.rejects(
    () =>
      createInitialAdmin({
        nombre: "Segundo admin",
        email: "otro@eli-print.test",
        password: "supersegura123",
      }),
    /bootstrap inicial/i,
  );
});

test("solicitar recuperacion con email existente crea token seguro y no expone hash", async () => {
  await createInitialAdmin({
    nombre: "Admin Reset",
    email: "admin.reset@eli-print.test",
    password: "supersegura123",
  });

  const result = await requestPasswordReset({ email: "ADMIN.RESET@eli-print.test" });
  assert.equal(result.message, "Si existe una cuenta con ese email, recibiras instrucciones.");
  assert.ok(result.devResetUrl);

  const stored = (await row<{
    token_hash: string;
    used_at: string | null;
    requested_ip: string | null;
  }>(`SELECT token_hash, used_at, requested_ip FROM password_reset_tokens LIMIT 1`))!;
  assert.equal(stored.used_at, null);
  assert.equal(result.devResetUrl!.includes(stored.token_hash), false);
});

test("solicitar recuperacion con email inexistente no revela si existe cuenta", async () => {
  const result = await requestPasswordReset({ email: "nadie@eli-print.test" });
  assert.equal(result.message, "Si existe una cuenta con ese email, recibiras instrucciones.");
  assert.equal(result.devResetUrl, null);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM password_reset_tokens`))!.total, 0);
});

test("token valido cambia contrasena y permite login con la nueva", async () => {
  await createInitialAdmin({
    nombre: "Admin Reset",
    email: "admin.reset@eli-print.test",
    password: "supersegura123",
  });
  const result = await requestPasswordReset({ email: "admin.reset@eli-print.test" });
  const token = new URL(result.devResetUrl!).searchParams.get("token")!;

  await resetPassword({
    token,
    newPassword: "NuevaSegura1",
    confirmPassword: "NuevaSegura1",
  });

  await assert.rejects(
    () => authenticateUser({ email: "admin.reset@eli-print.test", password: "supersegura123" }),
    /Credenciales invalidas/i,
  );
  const logged = await authenticateUser({ email: "admin.reset@eli-print.test", password: "NuevaSegura1" });
  assert.equal(logged.role, "ADMIN");
});

test("token caducado rechaza el cambio de contrasena", async () => {
  await createInitialAdmin({
    nombre: "Admin Reset",
    email: "admin.reset@eli-print.test",
    password: "supersegura123",
  });
  const result = await requestPasswordReset({ email: "admin.reset@eli-print.test" });
  const token = new URL(result.devResetUrl!).searchParams.get("token")!;
  await run(`UPDATE password_reset_tokens SET expires_at = ?`, "2020-01-01T00:00:00.000Z");

  await assert.rejects(
    () => resetPassword({ token, newPassword: "NuevaSegura1", confirmPassword: "NuevaSegura1" }),
    /no es valido o ha caducado/i,
  );
});

test("token usado rechaza un segundo uso", async () => {
  await createInitialAdmin({
    nombre: "Admin Reset",
    email: "admin.reset@eli-print.test",
    password: "supersegura123",
  });
  const result = await requestPasswordReset({ email: "admin.reset@eli-print.test" });
  const token = new URL(result.devResetUrl!).searchParams.get("token")!;
  await resetPassword({ token, newPassword: "NuevaSegura1", confirmPassword: "NuevaSegura1" });

  await assert.rejects(
    () => resetPassword({ token, newPassword: "OtraSegura1", confirmPassword: "OtraSegura1" }),
    /no es valido o ha caducado/i,
  );
});

test("usuario inactivo no obtiene recuperacion efectiva", async () => {
  await createUserRecord({
    nombre: "Operador Inactivo",
    email: "inactivo@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: false,
  });

  const result = await requestPasswordReset({ email: "inactivo@eli-print.test" });
  assert.equal(result.message, "Si existe una cuenta con ese email, recibiras instrucciones.");
  assert.equal(result.devResetUrl, null);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM password_reset_tokens`))!.total, 0);
});

test("recuperacion rechaza contrasenas no coincidentes o debiles", async () => {
  await createInitialAdmin({
    nombre: "Admin Reset",
    email: "admin.reset@eli-print.test",
    password: "supersegura123",
  });
  const first = await requestPasswordReset({ email: "admin.reset@eli-print.test" });
  const firstToken = new URL(first.devResetUrl!).searchParams.get("token")!;
  await assert.rejects(
    () => resetPassword({ token: firstToken, newPassword: "NuevaSegura1", confirmPassword: "NuevaSegura2" }),
    /no coinciden/i,
  );

  const second = await requestPasswordReset({ email: "admin.reset@eli-print.test" });
  const secondToken = new URL(second.devResetUrl!).searchParams.get("token")!;
  await assert.rejects(
    () => resetPassword({ token: secondToken, newPassword: "debil123", confirmPassword: "debil123" }),
    /mayuscula/i,
  );
});

test("operador no puede cobrar factura y no ve margenes ni pagos", async () => {
  const { operator, firstInvoiceId } = await setupPermissionsFixture();
  const snapshot = filterSnapshotByRole(await getAppSnapshot(), operator);

  assert.equal(canPerformAction(operator, "collect_payment"), false);
  assert.equal(canPerformAction(operator, "restock_material"), false);
  assert.equal(getVisibleSections(operator).includes("materiales"), true);
  await assert.rejects(
    () => withMockUser(operator, () => requirePermission("collect_payment")),
    /No tienes permisos/i,
  );
  await assert.rejects(
    () => withMockUser(operator, () => requirePermission("restock_material")),
    /No tienes permisos/i,
  );
  assert.equal(snapshot.invoices.length, 0);
  assert.equal(snapshot.orders.length, 0);
  assert.equal(snapshot.materials.length > 0, true);
  assert.equal(snapshot.materials[0]?.precio_kg ?? 0, 0);
  assert.equal(snapshot.materials[0]?.proveedor ?? null, null);
  assert.equal(snapshot.manufacturingOrders[0]?.coste_estimado_total ?? 0, 0);
  assert.equal(snapshot.manufacturingOrders[0]?.margen_estimado_porcentaje ?? 0, 0);
  assert.equal(firstInvoiceId.length > 0, true);
});

test("gestor financiero no puede completar fabricacion", async () => {
  const { financial } = await setupPermissionsFixture();
  const snapshot = filterSnapshotByRole(await getAppSnapshot(), financial);

  assert.equal(canPerformAction(financial, "complete_manufacturing"), false);
  assert.equal(canPerformAction(financial, "restock_material"), true);
  await assert.rejects(
    () => withMockUser(financial, () => requirePermission("complete_manufacturing")),
    /No tienes permisos/i,
  );
  await assert.doesNotReject(
    () => withMockUser(financial, () => requirePermission("restock_material")),
  );
  assert.equal(getVisibleSections(financial).includes("materiales"), true);
  assert.equal(getVisibleSections(financial).includes("stock"), true);
  assert.equal(getVisibleSections(financial).includes("fabricacion"), false);
  assert.equal(snapshot.manufacturingOrders.length, 0);
  assert.equal(snapshot.materials.length > 0, true);
  assert.equal((snapshot.materials[0]?.precio_kg ?? 0) > 0, true);
});

test("cliente solo ve sus pedidos", async () => {
  const { client, customerRows } = await setupPermissionsFixture();
  const snapshot = filterSnapshotByRole(await getAppSnapshot(), client);

  assert.deepEqual(getVisibleSections(client), ["pedidos"]);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.orders[0]?.cliente_id, customerRows[0].id);
  assert.equal(snapshot.customers.length, 1);
  assert.equal(snapshot.customers[0]?.id, customerRows[0].id);
  assert.equal(snapshot.invoices.length, 0);
  assert.equal(snapshot.materials.length, 0);
  assert.equal(snapshot.products.length, 0);
  assert.equal(snapshot.purchaseRequests.length, 0);
  assert.equal(snapshot.inventoryMovements.length, 0);
});

test("admin puede todo y puede crear usuarios internos y cliente", async () => {
  const { admin, customerRows } = await setupPermissionsFixture();
  const snapshot = filterSnapshotByRole(await getAppSnapshot(), admin);

  assert.equal(canPerformAction(admin, "manage_users"), true);
  assert.equal(canPerformAction(admin, "complete_manufacturing"), true);
  assert.equal(canPerformAction(admin, "collect_payment"), true);
  assert.equal(canPerformAction(admin, "edit_material"), true);
  assert.equal(canPerformAction(admin, "restock_material"), true);
  assert.equal(getVisibleSections(admin).includes("usuarios"), true);
  assert.equal(snapshot.invoices.length > 0, true);
  assert.equal(snapshot.orders.length, 2);
  assert.equal(snapshot.materials.length > 0, true);
  assert.equal(canPerformAction(admin, "product:create"), true);
  assert.equal(canPerformAction(admin, "product:editTechnical"), true);
  assert.equal(canPerformAction(admin, "product:editFinancial"), true);
  assert.equal(canPerformAction(admin, "purchaseRequest:approve"), true);
  assert.equal(canPerformAction(admin, "purchaseRequest:convertToStockEntry"), true);

  const internalUser = await createUserRecord({
    nombre: "Operario Uno",
    email: "operario@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });
  const customerUser = await createUserRecord({
    nombre: "Cliente Uno",
    email: "cliente@eli-print.test",
    password: "supersegura123",
    role: "CLIENTE",
    clienteId: customerRows[0].id,
    activo: true,
  });

  assert.equal(internalUser.role, "OPERADOR");
  assert.equal(customerUser.role, "CLIENTE");
});

test("operador puede crear solicitud de compra y verla en su bandeja", async () => {
  const { operator, admin } = await setupPermissionsFixture();
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  await withMockUser(operator, () =>
    createPurchaseRequestRecord({
      materialId,
      cantidadSolicitada: 750,
      motivo: "Reposicion para produccion",
      prioridad: "ALTA",
    }),
  );

  const stored = (await row<{
    estado: string;
    cantidad_solicitada: number;
    solicitante_user_id: string;
  }>(`SELECT estado, cantidad_solicitada, solicitante_user_id FROM purchase_requests LIMIT 1`))!;
  assert.equal(stored.estado, "PENDIENTE");
  assert.equal(stored.cantidad_solicitada, 750);
  assert.equal(stored.solicitante_user_id, operator.id);

  const operatorView = filterSnapshotByRole(await getAppSnapshot(), operator);
  const adminView = filterSnapshotByRole(await getAppSnapshot(), admin);
  assert.equal(operatorView.purchaseRequests.length, 1);
  assert.equal(adminView.purchaseRequests.length, 1);
  assert.equal(adminView.purchaseRequests.filter((request) => request.estado === "PENDIENTE").length, 1);
});

test("operador no puede aprobar ni convertir solicitudes en entrada de stock", async () => {
  const { operator, admin } = await setupPermissionsFixture();
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  const created = await withMockUser(operator, () =>
    createPurchaseRequestRecord({
      materialId,
      cantidadSolicitada: 500,
      motivo: "Reposicion operador",
    }),
  );

  await assert.rejects(
    () => withMockUser(operator, () => approvePurchaseRequest(created.id)),
    /No tienes permisos/i,
  );
  await withMockUser(admin, () => approvePurchaseRequest(created.id));
  await assert.rejects(
    () =>
      withMockUser(operator, () =>
        convertPurchaseRequestToStockEntry({
          requestId: created.id,
        }),
      ),
    /No tienes permisos/i,
  );
});

test("gestor financiero puede aprobar, rechazar y convertir solicitudes aprobadas en entrada de stock", async () => {
  const { operator, financial } = await setupPermissionsFixture();
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  const approved = await withMockUser(operator, () =>
    createPurchaseRequestRecord({
      materialId,
      cantidadSolicitada: 600,
      motivo: "Material urgente",
    }),
  );
  const rejected = await withMockUser(operator, () =>
    createPurchaseRequestRecord({
      materialId,
      cantidadSolicitada: 300,
      motivo: "Solicitud secundaria",
    }),
  );

  await withMockUser(financial, () =>
    approvePurchaseRequest(approved.id, { observacionesRevision: "Aprobada para compra" }),
  );
  await withMockUser(financial, () =>
    rejectPurchaseRequest(rejected.id, { observacionesRevision: "No procede" }),
  );

  const approvedRow = (await row<{ estado: string; revisado_por_user_id: string | null }>(
    `SELECT estado, revisado_por_user_id FROM purchase_requests WHERE id = ?`,
    approved.id,
  ))!;
  const rejectedRow = (await row<{ estado: string; revisado_por_user_id: string | null }>(
    `SELECT estado, revisado_por_user_id FROM purchase_requests WHERE id = ?`,
    rejected.id,
  ))!;
  assert.equal(approvedRow.estado, "APROBADA");
  assert.equal(approvedRow.revisado_por_user_id, financial.id);
  assert.equal(rejectedRow.estado, "RECHAZADA");
  assert.equal(rejectedRow.revisado_por_user_id, financial.id);

  const stockBefore = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!.stock_actual_g;
  await withMockUser(financial, () =>
    convertPurchaseRequestToStockEntry({
      requestId: approved.id,
      cantidadG: 650,
      motivo: "Entrada real desde solicitud",
    }),
  );
  const stockAfter = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!.stock_actual_g;
  const requestAfter = (await row<{ estado: string; registrado_por_user_id: string | null }>(
    `SELECT estado, registrado_por_user_id FROM purchase_requests WHERE id = ?`,
    approved.id,
  ))!;
  const movement = (await row<{ tipo: string; cantidad_g: number; referencia: string }>(
    `SELECT tipo, cantidad_g, referencia
     FROM stock_movements
     WHERE referencia = (SELECT codigo FROM purchase_requests WHERE id = ?)
     ORDER BY fecha DESC
     LIMIT 1`,
    approved.id,
  ))!;

  assert.equal(stockAfter, stockBefore + 650);
  assert.equal(requestAfter.estado, "RECIBIDA");
  assert.equal(requestAfter.registrado_por_user_id, financial.id);
  assert.equal(movement.tipo, "ENTRADA");
  assert.equal(movement.cantidad_g, 650);
});

test("operador puede crear producto tecnico pero no editar PVP, margen ni IVA", async () => {
  const { operator } = await setupPermissionsFixture();
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  await withMockUser(operator, () =>
    createProductRecord({
      nombre: "Producto tecnico operador",
      materialId,
      gramosEstimados: 80,
      tiempoImpresionHoras: 1.5,
      descripcion: "Ficha tecnica",
      enlaceModelo: "https://modelo.test/1",
    }),
  );

  const created = (await row<{
    nombre: string;
    gramos_estimados: number;
    pvp: number;
    iva_porcentaje: number;
  }>(`SELECT nombre, gramos_estimados, pvp, iva_porcentaje FROM products ORDER BY codigo DESC LIMIT 1`))!;
  assert.equal(created.nombre, "Producto tecnico operador");
  assert.equal(created.gramos_estimados, 80);
  assert.equal(created.pvp, 0);
  assert.equal(created.iva_porcentaje, 21);

  const productId = (await row<{ id: string }>(`SELECT id FROM products ORDER BY codigo DESC LIMIT 1`))!.id;
  await assert.rejects(
    () =>
      withMockUser(operator, () =>
        updateProductRecord({
          id: productId,
          pvp: 25,
          margen: 10,
          ivaPorcentaje: 10,
        }),
      ),
    /No tienes permisos/i,
  );
});

test("gestor financiero puede editar PVP, IVA y margen pero no gramos, tiempo ni material tecnico", async () => {
  const { productId } = await setupSingleProductFixture();
  const financial = buildUser("GESTOR_FINANCIERO");
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  await withMockUser(financial, () =>
    updateProductRecord({
      id: productId,
      pvp: 44,
      margen: 18,
      ivaPorcentaje: 10,
    }),
  );

  const updated = (await row<{ pvp: number; margen: number; iva_porcentaje: number }>(
    `SELECT pvp, margen, iva_porcentaje FROM products WHERE id = ?`,
    productId,
  ))!;
  assert.equal(updated.pvp, 44);
  assert.equal(updated.margen, 18);
  assert.equal(updated.iva_porcentaje, 10);

  await assert.rejects(
    () =>
      withMockUser(financial, () =>
        updateProductRecord({
          id: productId,
          gramosEstimados: 999,
          tiempoImpresionHoras: 8,
          materialId,
        }),
      ),
    /No tienes permisos/i,
  );
});

test("admin puede editar todos los campos de producto", async () => {
  const { productId, materialId } = await setupSingleProductFixture();
  const admin = buildUser("ADMIN");

  await withMockUser(admin, () =>
    updateProductRecord({
      id: productId,
      nombre: "Producto admin",
      gramosEstimados: 140,
      tiempoImpresionHoras: 4,
      materialId,
      costeElectricidad: 2.5,
      costeMaquina: 1.2,
      costeManoObra: 0.8,
      costePostprocesado: 1.1,
      pvp: 55,
      margen: 22,
      ivaPorcentaje: 4,
    }),
  );

  const updated = (await row<{
    nombre: string;
    gramos_estimados: number;
    tiempo_impresion_horas: number;
    pvp: number;
    margen: number;
    iva_porcentaje: number;
  }>(`SELECT nombre, gramos_estimados, tiempo_impresion_horas, pvp, margen, iva_porcentaje FROM products WHERE id = ?`, productId))!;
  assert.equal(updated.nombre, "Producto admin");
  assert.equal(updated.gramos_estimados, 140);
  assert.equal(updated.tiempo_impresion_horas, 4);
  assert.equal(updated.pvp, 55);
  assert.equal(updated.margen, 22);
  assert.equal(updated.iva_porcentaje, 4);
});

test("ADMIN autenticado puede crear pedido desde la action sin reenviar email ni contrasena", async () => {
  const { admin } = await setupPermissionsFixture();
  const customerId = (await row<{ id: string }>(`SELECT id FROM customers ORDER BY codigo ASC LIMIT 1`))!.id;
  const productId = (await row<{ id: string }>(`SELECT id FROM products ORDER BY codigo ASC LIMIT 1`))!.id;
  const formData = new FormData();
  formData.set("clienteId", customerId);
  formData.set("producto_1", productId);
  formData.set("cantidad_1", "2");
  formData.set("precio_1", "30");
  formData.set("descuento", "0");
  formData.set("observaciones", "Pedido desde sesion");

  await withMockUser(admin, async () => {
    await assert.rejects(
      () => createOrderAction(formData),
      (error) => {
        const digest = getRedirectDigest(error);
        assert.match(digest, /section=pedidos/);
        assert.doesNotMatch(decodeURIComponent(digest), /Debes iniciar sesion|No tienes permisos/);
        return true;
      },
    );
  });

  const created = await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM orders WHERE observaciones = ?`,
    "Pedido desde sesion",
  );
  assert.equal(created?.total, 1);
});

test("las server actions internas rechazan crear pedido sin sesion valida", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const formData = new FormData();
  formData.set("clienteId", customerId);
  formData.set("producto_1", productId);
  formData.set("cantidad_1", "1");
  formData.set("precio_1", "30");
  formData.set("descuento", "0");

  await assert.rejects(
    () => createOrderAction(formData),
    (error) => {
      const digest = getRedirectDigest(error);
      assert.match(digest, /tone=error/);
      assert.match(decodeURIComponent(digest), /Debes iniciar sesion para acceder/);
      return true;
    },
  );

  const totalOrders = await row<{ total: number }>(`SELECT COUNT(*) AS total FROM orders`);
  assert.equal(totalOrders?.total, 0);
});

test("OPERADOR sigue bloqueado en la action de producto si intenta enviar campos economicos manualmente", async () => {
  const { operator } = await setupPermissionsFixture();
  const productId = (await row<{ id: string }>(`SELECT id FROM products ORDER BY codigo ASC LIMIT 1`))!.id;
  const formData = new FormData();
  formData.set("id", productId);
  formData.set("pvp", "48");
  formData.set("margen", "15");
  formData.set("ivaPorcentaje", "10");

  await withMockUser(operator, async () => {
    await assert.rejects(
      () => updateProductAction(formData),
      (error) => {
        const digest = getRedirectDigest(error);
        assert.match(digest, /tone=error/);
        assert.match(decodeURIComponent(digest), /No tienes permisos/);
        return true;
      },
    );
  });

  const stored = (await row<{ pvp: number; margen: number; iva_porcentaje: number }>(
    `SELECT pvp, margen, iva_porcentaje FROM products WHERE id = ?`,
    productId,
  ))!;
  assert.equal(stored.pvp, 35);
  assert.equal(stored.margen, 12);
  assert.equal(stored.iva_porcentaje, 21);
});

test("GESTOR_FINANCIERO puede editar campos economicos desde la action y no tecnicos", async () => {
  const { financial } = await setupPermissionsFixture();
  const productId = (await row<{ id: string }>(`SELECT id FROM products ORDER BY codigo ASC LIMIT 1`))!.id;

  const financialForm = new FormData();
  financialForm.set("id", productId);
  financialForm.set("pvp", "44");
  financialForm.set("margen", "18");
  financialForm.set("ivaPorcentaje", "10");

  await withMockUser(financial, async () => {
    await assert.rejects(
      () => updateProductAction(financialForm),
      (error) => {
        const digest = getRedirectDigest(error);
        assert.match(digest, /section=productos/);
        assert.doesNotMatch(decodeURIComponent(digest), /No tienes permisos/);
        return true;
      },
    );
  });

  const financialUpdate = (await row<{ pvp: number; margen: number; iva_porcentaje: number }>(
    `SELECT pvp, margen, iva_porcentaje FROM products WHERE id = ?`,
    productId,
  ))!;
  assert.equal(financialUpdate.pvp, 44);
  assert.equal(financialUpdate.margen, 18);
  assert.equal(financialUpdate.iva_porcentaje, 10);

  const technicalForm = new FormData();
  technicalForm.set("id", productId);
  technicalForm.set("gramosEstimados", "999");
  technicalForm.set("tiempoImpresionHoras", "8");

  await withMockUser(financial, async () => {
    await assert.rejects(
      () => updateProductAction(technicalForm),
      (error) => {
        const digest = getRedirectDigest(error);
        assert.match(digest, /tone=error/);
        assert.match(decodeURIComponent(digest), /No tienes permisos/);
        return true;
      },
    );
  });
});

test("ADMIN puede editar nombre, email y rol de un usuario", async () => {
  await createInitialAdmin({
    nombre: "Admin",
    email: "admin@eli-print.test",
    password: "supersegura123",
  });
  const created = await createUserRecord({
    nombre: "Usuario Base",
    email: "usuario@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });

  const updated = await updateUserRecord({
    id: created.id,
    nombre: "Usuario Editado",
    email: "editado@eli-print.test",
    role: "GESTOR_FINANCIERO",
    activo: true,
  });
  const stored = await row<{ nombre: string; email: string; role: AppRole }>(
    `SELECT nombre, email, role FROM users WHERE id = ?`,
    created.id,
  );

  assert.equal(updated.role, "GESTOR_FINANCIERO");
  assert.equal(stored?.nombre, "Usuario Editado");
  assert.equal(stored?.email, "editado@eli-print.test");
  assert.equal(stored?.role, "GESTOR_FINANCIERO");
});

test("no ADMIN no puede editar usuarios", async () => {
  const operator = buildUser("OPERADOR");

  await assert.rejects(
    () => withMockUser(operator, () => requirePermission("manage_users")),
    /No tienes permisos/i,
  );
});

test("no permite email duplicado al editar usuario", async () => {
  await createInitialAdmin({
    nombre: "Admin",
    email: "admin@eli-print.test",
    password: "supersegura123",
  });
  const first = await createUserRecord({
    nombre: "Uno",
    email: "uno@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });
  await createUserRecord({
    nombre: "Dos",
    email: "dos@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });

  await assert.rejects(
    () =>
      updateUserRecord({
        id: first.id,
        nombre: "Uno",
        email: "dos@eli-print.test",
        role: "OPERADOR",
        activo: true,
      }),
    /Ya existe un usuario con ese email/i,
  );
});

test("no permite desactivar ni degradar el ultimo ADMIN activo", async () => {
  const admin = await createInitialAdmin({
    nombre: "Admin",
    email: "admin@eli-print.test",
    password: "supersegura123",
  });

  await assert.rejects(
    () =>
      updateUserRecord({
        id: admin.id,
        nombre: "Admin",
        email: "admin@eli-print.test",
        role: "ADMIN",
        activo: false,
      }),
    /sin ningun ADMIN activo/i,
  );

  await assert.rejects(
    () =>
      updateUserRecord({
        id: admin.id,
        nombre: "Admin",
        email: "admin@eli-print.test",
        role: "OPERADOR",
        activo: true,
      }),
    /sin ningun ADMIN activo/i,
  );
});

test("cambiar contrasena actualiza el hash y contrasena vacia lo conserva", async () => {
  await createInitialAdmin({
    nombre: "Admin",
    email: "admin@eli-print.test",
    password: "supersegura123",
  });
  const created = await createUserRecord({
    nombre: "Clave",
    email: "clave@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });

  const originalHash = (await row<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    created.id,
  ))!.password_hash;

  await updateUserRecord({
    id: created.id,
    nombre: "Clave",
    email: "clave@eli-print.test",
    role: "OPERADOR",
    activo: true,
    password: "",
  });

  const preservedHash = (await row<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    created.id,
  ))!.password_hash;
  assert.equal(preservedHash, originalHash);

  await updateUserRecord({
    id: created.id,
    nombre: "Clave",
    email: "clave@eli-print.test",
    role: "OPERADOR",
    activo: true,
    password: "nuevaClave123",
  });

  const changedHash = (await row<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    created.id,
  ))!.password_hash;
  assert.notEqual(changedHash, originalHash);
  await assert.rejects(
    () => authenticateUser({ email: "clave@eli-print.test", password: "supersegura123" }),
    /Credenciales invalidas/i,
  );
  const authenticated = await authenticateUser({ email: "clave@eli-print.test", password: "nuevaClave123" });
  assert.equal(authenticated.email, "clave@eli-print.test");
});

test("usuario inactivo no puede iniciar sesion", async () => {
  await createInitialAdmin({
    nombre: "Admin",
    email: "admin@eli-print.test",
    password: "supersegura123",
  });
  const created = await createUserRecord({
    nombre: "Dormido",
    email: "dormido@eli-print.test",
    password: "supersegura123",
    role: "OPERADOR",
    activo: true,
  });

  await updateUserRecord({
    id: created.id,
    nombre: "Dormido",
    email: "dormido@eli-print.test",
    role: "OPERADOR",
    activo: false,
  });

  await assert.rejects(
    () => authenticateUser({ email: "dormido@eli-print.test", password: "supersegura123" }),
    /inactivo/i,
  );
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

test("los helpers de estado normalizan estados legacy y exponen acciones permitidas", () => {
  assert.equal(normalizeOrderStatus("INCIDENCIA_STOCK"), "EN_PRODUCCION");
  assert.equal(
    deriveOrderStatus({
      estado: "CONFIRMADO",
      ordenesFabricacion: [{ estado: "PENDIENTE" }],
    }),
    "EN_PRODUCCION",
  );
  assert.equal(deriveManufacturingStatus({ estado: "INICIADA" }), "EN_CURSO");
  assert.equal(
    deriveInvoiceStatus({
      fecha: "2026-03-01T10:00:00.000Z",
      total: 100,
      total_pagado: 0,
      importe_pendiente: 100,
      now: new Date("2026-04-29T10:00:00.000Z"),
    }),
    "VENCIDA",
  );
  assert.deepEqual(
    getNextAllowedActions({
      module: "order",
      rawStatus: "INCIDENCIA_STOCK",
      derivedStatus: "EN_PRODUCCION",
      hasManufacturing: true,
      hasStockIncident: true,
    }),
    ["process_order", "restock_material", "view_manufacturing"],
  );
});

test("el estado visual de factura diferencia pagada, parcial y pendiente", () => {
  const paidStatus = deriveInvoiceStatus({
    total: 100,
    total_pagado: 100,
    importe_pendiente: 0,
  });
  const partialStatus = deriveInvoiceStatus({
    total: 100,
    total_pagado: 40,
    importe_pendiente: 60,
  });
  const pendingStatus = deriveInvoiceStatus({
    total: 100,
    total_pagado: 0,
    importe_pendiente: 100,
  });

  assert.equal(paidStatus, "PAGADA");
  assert.equal(getInvoiceStatusTone(paidStatus), "success");
  assert.equal(partialStatus, "PARCIAL");
  assert.equal(getInvoiceStatusTone(partialStatus), "warn");
  assert.equal(pendingStatus, "PENDIENTE");
  assert.equal(getInvoiceStatusTone(pendingStatus), "danger");
});

test("el resumen visual de material muestra codigo, marca y variante completa", () => {
  const display = formatMaterialDisplay({
    codigo: "MAT-001",
    marca: "Panchroma",
    tipo: "PLA",
    color: "Negro",
    efecto: "Mate",
  });

  assert.equal(display.code, "MAT-001");
  assert.equal(display.title, "Panchroma");
  assert.equal(display.variant, "PLA · Negro · Mate");
});

test("calcula coste de filamento correctamente con precio por kilo", () => {
  const result = calculateMaterialCost({
    gramsPerUnit: 125,
    quantity: 3,
    materialPricePerKg: 24,
  });

  assert.equal(result.gramsUsed, 375);
  assert.equal(result.pricePerGram, 0.02);
  assert.equal(result.filamentCost, 7.5);
});

test("calcula coste total, coste unitario, beneficio y margen con electricidad, maquina y postprocesado", () => {
  const result = calculateProductionCost({
    quantity: 2,
    gramsPerUnit: 100,
    materialPricePerKg: 20,
    printHoursPerUnit: 3,
    salePricePerUnit: 30,
    electricityCostPerHour: 0.1,
    machineCostPerHour: 0.5,
    postProcessingCostPerUnit: 2,
  });

  assert.equal(result.costeFilamento, 4);
  assert.equal(result.costeElectricidad, 0.6);
  assert.equal(result.costeMaquina, 3);
  assert.equal(result.costePostprocesado, 4);
  assert.equal(result.costeTotal, 11.6);
  assert.equal(result.costeUnitario, 5.8);
  assert.equal(result.beneficioUnitario, 24.2);
  assert.equal(result.beneficioTotal, 48.4);
  assert.equal(result.margenPorcentaje, 80.67);
});

test("evita division por cero si el PVP es 0 y avisa cuando usa costes horarios por defecto", () => {
  const result = calculateProductionCost({
    quantity: 1,
    gramsPerUnit: 50,
    materialPricePerKg: 18,
    printHoursPerUnit: 2,
    salePricePerUnit: 0,
  });
  const profitability = calculateProfitability({
    quantity: 1,
    salePricePerUnit: 0,
    totalCost: result.costeTotal,
  });

  assert.equal(result.costeElectricidad, Number((2 * DEFAULT_ELECTRICITY_COST_PER_HOUR).toFixed(2)));
  assert.equal(result.costeMaquina, Number((2 * DEFAULT_MACHINE_COST_PER_HOUR).toFixed(2)));
  assert.equal(result.margenPorcentaje, 0);
  assert.equal(profitability.margenPorcentaje, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("PVP del producto es 0")));
});

test("helpers CSV formatean importes, fechas y nombres de archivo de forma estable", () => {
  assert.equal(formatCsvMoney(1234.5), "1234,50");
  assert.equal(formatCsvDateTime("2026-04-17T08:05:00"), "2026-04-17 08:05");
  assert.equal(buildCsvFilename("facturas", new Date("2026-04-17T08:05:00")), "facturas-20260417-0805.csv");
});

test("pedidoId prioriza el pedido correcto usando codigo visible y formatos compatibles", () => {
  const fixture = [
    { id: "uuid-1", codigo: "PED-001", estado: "BORRADOR" },
    { id: "uuid-2", codigo: "PED-007", pedido_codigo: "PED-007", estado: "CONFIRMADO" },
    { id: "PED-099", codigo: "TMP-099", estado: "LISTO" },
  ];

  assert.equal(matchesOrderFocusCode(fixture[1], "PED-007"), true);
  assert.equal(matchesOrderFocusCode(fixture[2], "PED-099"), true);
  assert.deepEqual(
    prioritizeOrdersByFocus(fixture, "PED-007").map((order) => order.codigo),
    ["PED-007", "PED-001", "TMP-099"],
  );
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

test("procesar pedido reutiliza la logica existente y evita duplicados al pulsarlo dos veces", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await restockFinishedProduct(productId, 2, "Carga inicial", "A1", 8);
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 4 }],
  });

  const firstRun = await processOrder(orderId);
  const secondRun = await processOrder(orderId);
  const stock = (await row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  ))!;
  const manufacturingCount = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!;
  const order = (await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!;

  assert.equal(firstRun.action, "processed");
  assert.equal(firstRun.fromStockUnits, 2);
  assert.equal(firstRun.toManufactureUnits, 2);
  assert.equal(firstRun.orderStatus, "EN_PRODUCCION");
  assert.equal(secondRun.action, "noop");
  assert.equal(secondRun.orderStatus, "EN_PRODUCCION");
  assert.equal(stock.cantidad_disponible, 0);
  assert.equal(manufacturingCount.total, 1);
  assert.equal(order.estado, "CONFIRMADO");
});

test("el snapshot expone estados derivados y acciones coherentes para pedidos, fabricacion y facturas", async () => {
  const { customerId, productId } = await setupSingleProductFixture({ materialStock: 50, grams: 100 });
  const blockedOrderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

  await processOrder(blockedOrderId);

  let snapshot = await getAppSnapshot();
  let visibleOrder = snapshot.orders.find((item) => item.id === blockedOrderId);
  const visibleManufacturing = snapshot.manufacturingOrders.find((item) => item.pedido_id === blockedOrderId);

  assert.ok(visibleOrder);
  assert.equal(visibleOrder!.estado, "INCIDENCIA_STOCK");
  assert.equal(visibleOrder!.estado_derivado, "EN_PRODUCCION");
  assert.equal(visibleOrder!.tiene_incidencia_stock, true);
  assert.deepEqual(visibleOrder!.acciones_permitidas, ["process_order", "restock_material", "view_manufacturing"]);

  assert.ok(visibleManufacturing);
  assert.equal(visibleManufacturing!.estado, "BLOQUEADA_POR_STOCK");
  assert.equal(visibleManufacturing!.estado_derivado, "PENDIENTE");
  assert.deepEqual(visibleManufacturing!.acciones_permitidas, ["restock_material"]);

  await restockFinishedProduct(productId, 1, "Stock listo para facturar", "A1", 12);
  const invoiceReadyOrderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });
  await processOrder(invoiceReadyOrderId);
  await deliverOrderWorkflow(invoiceReadyOrderId);
  await invoiceOrderWorkflow(invoiceReadyOrderId);

  snapshot = await getAppSnapshot();
  visibleOrder = snapshot.orders.find((item) => item.id === invoiceReadyOrderId);
  const visibleInvoice = snapshot.invoices.find((item) => item.pedido_id === invoiceReadyOrderId);

  assert.ok(visibleOrder);
  assert.ok(visibleInvoice);
  assert.equal(visibleOrder!.estado_derivado, "FACTURADO");
  assert.equal(visibleInvoice!.estado_pago_derivado, "PENDIENTE");
  assert.deepEqual(visibleInvoice!.acciones_permitidas, ["collect_invoice_payment", "open_payment_detail"]);
});

test("el snapshot principal ordena los listados del mas nuevo al mas antiguo", async () => {
  await createCustomerRecord({ nombre: "Cliente Uno" });
  await createCustomerRecord({ nombre: "Cliente Dos" });
  await createMaterialRecord({
    nombre: "Material Uno",
    marca: "Marca",
    tipo: "PLA",
    color: "Negro",
    precioKg: 18,
    stockActualG: 800,
    stockMinimoG: 100,
  });
  await createMaterialRecord({
    nombre: "Material Dos",
    marca: "Marca",
    tipo: "PLA",
    color: "Blanco",
    precioKg: 19,
    stockActualG: 900,
    stockMinimoG: 100,
  });

  const customerRows = await rows<{ id: string; codigo: string }>(`SELECT id, codigo FROM customers ORDER BY codigo ASC`);
  const materialRows = await rows<{ id: string; codigo: string }>(`SELECT id, codigo FROM materials ORDER BY codigo ASC`);

  await createProductRecord({
    nombre: "Producto Uno",
    gramosEstimados: 90,
    tiempoImpresionHoras: 2,
    costeElectricidad: 1.2,
    margen: 10,
    pvp: 25,
    materialId: materialRows[0].id,
  });
  await createProductRecord({
    nombre: "Producto Dos",
    gramosEstimados: 95,
    tiempoImpresionHoras: 2.5,
    costeElectricidad: 1.3,
    margen: 10,
    pvp: 28,
    materialId: materialRows[1].id,
  });
  await createPrinterRecord({ nombre: "Impresora Uno", costeHora: 2, horasUsoAcumuladas: 0, estado: "LIBRE" });
  await createPrinterRecord({ nombre: "Impresora Dos", costeHora: 2.5, horasUsoAcumuladas: 0, estado: "LIBRE" });

  const productRows = await rows<{ id: string; codigo: string }>(`SELECT id, codigo FROM products ORDER BY codigo ASC`);
  const firstOrderId = await createOrderRecord({
    clienteId: customerRows[0].id,
    lines: [{ productId: productRows[0].id, quantity: 1 }],
  });
  const secondOrderId = await createOrderRecord({
    clienteId: customerRows[1].id,
    lines: [{ productId: productRows[1].id, quantity: 1 }],
  });
  await restockFinishedProduct(productRows[1].id, 1, "Carga inicial", "A1", 10);
  await processOrder(secondOrderId);
  await deliverOrderWorkflow(secondOrderId);
  await invoiceOrderWorkflow(secondOrderId);

  const snapshot = await getAppSnapshot();

  assert.equal(snapshot.customers[0].codigo, "CLI-002");
  assert.equal(snapshot.materials[0].codigo, "MAT-002");
  assert.equal(snapshot.products[0].codigo, "PRO-002");
  assert.equal(snapshot.printers[0].codigo, "IMP-002");
  assert.equal(snapshot.orders[0].id, secondOrderId);
  assert.equal(snapshot.orders[1].id, firstOrderId);
  assert.equal(snapshot.invoices[0].pedido_id, secondOrderId);
  assert.equal(snapshot.finishedInventory[0].producto_codigo, "PRO-002");
  assert.equal(snapshot.inventoryMovements[0].referencia, "PED-002");
});

test("el snapshot de fabricacion ordena por codigo descendente cuando faltan fechas y mantiene para stock arriba", async () => {
  const { customerId, productId, materialId } = await setupSingleProductFixture({ materialStock: 5000 });
  const firstOrderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });
  const secondOrderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });
  await confirmOrder(firstOrderId);
  await confirmOrder(secondOrderId);
  const linkedManufacturing = await rows<{ id: string }>(
    `SELECT id
     FROM manufacturing_orders
     ORDER BY codigo ASC`,
  );
  const stockManufacturing = await createStockManufacturingOrder({
    productId,
    quantity: 2,
    materialId,
  });

  await run(`UPDATE manufacturing_orders SET codigo = ?, fecha_inicio = NULL, fecha_fin = NULL WHERE id = ?`, "OF-001", linkedManufacturing[0].id);
  await run(`UPDATE manufacturing_orders SET codigo = ?, fecha_inicio = NULL, fecha_fin = NULL WHERE id = ?`, "OF-002", linkedManufacturing[1].id);
  await run(`UPDATE manufacturing_orders SET codigo = ?, fecha_inicio = NULL, fecha_fin = NULL WHERE id = ?`, "OF-008", stockManufacturing.manufacturingId);

  const snapshot = await getAppSnapshot();
  const codes = snapshot.manufacturingOrders.slice(0, 3).map((item) => item.codigo);
  const stockOrder = snapshot.manufacturingOrders.find((item) => item.id === stockManufacturing.manufacturingId);
  const pendingCodes = snapshot.manufacturingOrders
    .filter((item) => item.estado_derivado === "PENDIENTE")
    .map((item) => item.codigo)
    .slice(0, 3);

  assert.deepEqual(codes, ["OF-008", "OF-002", "OF-001"]);
  assert.equal(stockOrder?.origen_fabricacion, "PARA_STOCK");
  assert.deepEqual(pendingCodes, ["OF-008", "OF-002", "OF-001"]);
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

test("completar fabricacion en un paso inicia y finaliza la orden pendiente", async () => {
  const { customerId, productId } = await setupSingleProductFixture({ materialStock: 1000, grams: 150, hours: 2.5, electricity: 1.2 });
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

  await processOrder(orderId);
  const manufacturing = (await row<{ id: string; estado: string }>(
    `SELECT id, estado FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!;

  const result = await completeManufacturingWorkflow(manufacturing.id);
  const refreshedManufacturing = (await row<{ estado: string }>(
    `SELECT estado FROM manufacturing_orders WHERE id = ?`,
    manufacturing.id,
  ))!;
  const order = (await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!;

  assert.equal(manufacturing.estado, "PENDIENTE");
  assert.equal(result.action, "completed");
  assert.equal(result.autoStarted, true);
  assert.equal(refreshedManufacturing.estado, "COMPLETADA");
  assert.equal(order.estado, "LISTO");
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

test("archivar materiales no elimina el registro y desarchivar lo devuelve al listado activo", async () => {
  const { materialId } = await setupSingleProductFixture();

  await setMaterialActiveState(materialId, false);
  assert.equal((await row<{ activo: number }>(`SELECT activo FROM materials WHERE id = ?`, materialId))!.activo, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM materials WHERE id = ?`, materialId))!.total, 1);

  const archivedSnapshot = await getAppSnapshot();
  assert.equal(archivedSnapshot.materials.find((material) => material.id === materialId)?.activo, false);
  assert.equal(archivedSnapshot.materials.filter((material) => material.activo).some((material) => material.id === materialId), false);

  await setMaterialActiveState(materialId, true);
  assert.equal((await row<{ activo: number }>(`SELECT activo FROM materials WHERE id = ?`, materialId))!.activo, 1);

  const activeSnapshot = await getAppSnapshot();
  assert.equal(activeSnapshot.materials.filter((material) => material.activo).some((material) => material.id === materialId), true);
});

test("el borrado fisico queda bloqueado aunque el material este archivado", async () => {
  await createMaterialRecord({ nombre: "Material temporal" });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;

  await assert.rejects(() => deleteMaterialRecord(materialId), /borrado fisico.*deshabilitado|archiva el material/i);

  await setMaterialActiveState(materialId, false);
  await assert.rejects(() => deleteMaterialRecord(materialId), /borrado fisico.*deshabilitado|archiva el material/i);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM materials WHERE id = ?`, materialId))!.total, 1);
});

test("no permite nuevos productos con materiales archivados", async () => {
  await createCustomerRecord({ nombre: "Cliente base" });
  await createMaterialRecord({ nombre: "Material archivado" });
  const materialId = (await row<{ id: string }>(`SELECT id FROM materials LIMIT 1`))!.id;
  await setMaterialActiveState(materialId, false);

  await assert.rejects(
    () => createProductRecord({ nombre: "Producto bloqueado", materialId }),
    /material archivado/i,
  );
});

test("no permite nuevos pedidos con clientes archivados", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await setCustomerActiveState(customerId, false);

  await assert.rejects(
    () => createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] }),
    /cliente seleccionado esta archivado/i,
  );
});

test("no permite nuevas operaciones con productos archivados", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  await setProductActiveState(productId, false);

  await assert.rejects(
    () => createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] }),
    /producto.*archivado/i,
  );
  await assert.rejects(
    () => restockFinishedProduct(productId, 1, "Entrada manual"),
    /producto esta archivado/i,
  );
});

test("los registros archivados siguen accesibles desde pedidos y facturas historicas", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 2 }] });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;
  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  await setCustomerActiveState(customerId, false);
  await setProductActiveState(productId, false);

  const snapshot = await getAppSnapshot();
  const archivedCustomer = snapshot.customers.find((customer) => customer.id === customerId);
  const archivedProduct = snapshot.products.find((product) => product.id === productId);
  const order = snapshot.orders.find((item) => item.id === orderId);
  const invoice = snapshot.invoices.find((item) => item.pedido_id === orderId);

  assert.ok(archivedCustomer);
  assert.equal(archivedCustomer!.activo, false);
  assert.ok(archivedProduct);
  assert.equal(archivedProduct!.activo, false);
  assert.ok(order);
  assert.equal(order!.cliente_id, customerId);
  assert.equal(order!.lineas.some((linea) => linea.producto_id === productId), true);
  assert.ok(invoice);
  assert.equal(invoice!.cliente_id, customerId);
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

test("crear fabricacion para stock la deja visible como para stock sin crear pedido ni factura", async () => {
  const { productId, materialId } = await setupSingleProductFixture({ materialStock: 1200 });

  const created = await createStockManufacturingOrder({
    productId,
    quantity: 3,
    materialId,
  });

  assert.equal(created.action, "created");
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM orders`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices`))!.total, 0);

  const manufacturing = (await row<{
    pedido_id: string | null;
    linea_pedido_id: string | null;
    material_id: string | null;
    estado: string;
  }>(`SELECT pedido_id, linea_pedido_id, material_id, estado FROM manufacturing_orders WHERE id = ?`, created.manufacturingId))!;

  assert.equal(manufacturing.pedido_id, null);
  assert.equal(manufacturing.linea_pedido_id, null);
  assert.equal(manufacturing.material_id, materialId);
  assert.equal(manufacturing.estado, "PENDIENTE");

  const snapshot = await getAppSnapshot();
  const visibleOrder = snapshot.manufacturingOrders.find((item) => item.id === created.manufacturingId);
  assert.ok(visibleOrder);
  assert.equal(visibleOrder!.origen_fabricacion, "PARA_STOCK");
  assert.equal(visibleOrder!.origen_fabricacion_label, "Para stock");
  assert.equal(visibleOrder!.pedido_codigo, null);
  assert.equal(visibleOrder!.material_id, materialId);
  assert.equal(visibleOrder!.coste_material, 6);
  assert.equal(visibleOrder!.coste_electricidad, 4.5);
  assert.equal(
    visibleOrder!.coste_impresora_visual,
    Number((visibleOrder!.coste_electricidad + visibleOrder!.coste_maquina).toFixed(2)),
  );
  assert.equal(visibleOrder!.coste_postprocesado, 0);
  assert.equal(visibleOrder!.coste_mano_obra, 0);
  assert.equal(
    visibleOrder!.coste_estimado_total,
    Number(
      (
        visibleOrder!.coste_material +
        visibleOrder!.coste_impresora_visual +
        visibleOrder!.coste_postprocesado +
        visibleOrder!.coste_mano_obra
      ).toFixed(2),
    ),
  );
  assert.ok(visibleOrder!.coste_estimado_total > 0);
  assert.ok(visibleOrder!.coste_estimado_unitario > 0);
});

test("completar fabricacion para stock aumenta stock, consume material y no duplica al repetir", async () => {
  const { productId, materialId } = await setupSingleProductFixture({ materialStock: 1500, grams: 100, hours: 2, electricity: 1 });

  const beforeMaterial = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;
  const beforeInventory = (await row<{ cantidad_disponible: number }>(
    `SELECT cantidad_disponible FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  ))!;

  const created = await createStockManufacturingOrder({
    productId,
    quantity: 2,
    materialId,
  });

  const firstCompletion = await completeManufacturingWorkflow(created.manufacturingId);
  const secondCompletion = await completeManufacturingWorkflow(created.manufacturingId);

  const afterMaterial = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;
  const afterInventory = (await row<{ cantidad_disponible: number; coste_unitario: number }>(
    `SELECT cantidad_disponible, coste_unitario FROM finished_product_inventory WHERE product_id = ?`,
    productId,
  ))!;
  const manufacturing = (await row<{ estado: string }>(`SELECT estado FROM manufacturing_orders WHERE id = ?`, created.manufacturingId))!;
  const productEntries = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM inventory_movements
     WHERE inventario_tipo = 'PRODUCTO_TERMINADO'
       AND referencia = ?
       AND tipo = 'ENTRADA'`,
    created.manufacturingCode,
  ))!;
  const materialConsumptions = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM stock_movements
     WHERE referencia = ?
       AND tipo = 'SALIDA'`,
    created.manufacturingCode,
  ))!;

  assert.equal(firstCompletion.action, "completed");
  assert.equal(secondCompletion.action, "noop");
  assert.equal(manufacturing.estado, "COMPLETADA");
  assert.equal(afterInventory.cantidad_disponible, beforeInventory.cantidad_disponible + 2);
  assert.ok(afterInventory.coste_unitario > 0);
  assert.equal(afterMaterial.stock_actual_g, beforeMaterial.stock_actual_g - 200);
  assert.equal(productEntries.total, 1);
  assert.equal(materialConsumptions.total, 1);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM orders`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoices`))!.total, 0);
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM customers`))!.total, 1);
});

test("fabricacion para stock usa el material seleccionado y cambia el coste calculado", async () => {
  const { productId, materialId } = await setupSingleProductFixture({ materialStock: 2000, grams: 100, hours: 2, electricity: 1, pvp: 20 });
  await createMaterialRecord({
    nombre: "PLA Premium",
    marca: "Marca",
    tipo: "PLA",
    color: "Rojo",
    precioKg: 40,
    stockActualG: 2000,
    stockMinimoG: 100,
  });
  const materials = await rows<{ id: string; codigo: string; precio_kg: number }>(`SELECT id, codigo, precio_kg FROM materials ORDER BY codigo ASC`);
  const alternateMaterial = materials.find((material) => material.id !== materialId)!;

  const baseOrder = await createStockManufacturingOrder({
    productId,
    quantity: 1,
    materialId,
  });
  const alternateOrder = await createStockManufacturingOrder({
    productId,
    quantity: 2,
    materialId: alternateMaterial.id,
  });

  const baseSnapshot = (await getAppSnapshot()).manufacturingOrders.find((item) => item.id === baseOrder.manufacturingId)!;
  const alternateSnapshot = (await getAppSnapshot()).manufacturingOrders.find((item) => item.id === alternateOrder.manufacturingId)!;
  const alternateRow = (await row<{ material_id: string | null }>(
    `SELECT material_id FROM manufacturing_orders WHERE id = ?`,
    alternateOrder.manufacturingId,
  ))!;

  assert.equal(alternateRow.material_id, alternateMaterial.id);
  assert.equal(alternateSnapshot.material_id, alternateMaterial.id);
  assert.equal(alternateSnapshot.material_codigo, alternateMaterial.codigo);
  assert.ok(alternateSnapshot.coste_estimado_total > baseSnapshot.coste_estimado_total);

  const beforeBaseStock = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;
  const beforeAlternateStock = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, alternateMaterial.id))!;

  await completeManufacturingWorkflow(alternateOrder.manufacturingId);

  const afterBaseStock = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, materialId))!;
  const afterAlternateStock = (await row<{ stock_actual_g: number }>(`SELECT stock_actual_g FROM materials WHERE id = ?`, alternateMaterial.id))!;

  assert.equal(afterBaseStock.stock_actual_g, beforeBaseStock.stock_actual_g);
  assert.equal(afterAlternateStock.stock_actual_g, beforeAlternateStock.stock_actual_g - 200);
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

test("entregar pedido inteligente no duplica la entrega de pedidos ya cerrados", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await processOrder(orderId);

  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await completeManufacturingWorkflow(manufacturingId);

  const firstDelivery = await deliverOrderWorkflow(orderId);
  const secondDelivery = await deliverOrderWorkflow(orderId);

  assert.equal(firstDelivery.action, "delivered");
  assert.equal(secondDelivery.action, "noop");
  assert.equal((await row<{ estado: string }>(`SELECT estado FROM orders WHERE id = ?`, orderId))!.estado, "ENTREGADO");
});

test("facturar pedido inteligente reutiliza la factura ya creada si la accion se repite", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await processOrder(orderId);

  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await completeManufacturingWorkflow(manufacturingId);
  await deliverOrderWorkflow(orderId);

  const firstInvoice = await invoiceOrderWorkflow(orderId);
  const secondInvoice = await invoiceOrderWorkflow(orderId);
  const invoiceCount = (await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM invoices WHERE pedido_id = ?`,
    orderId,
  ))!;

  assert.equal(firstInvoice.action, "invoiced");
  assert.equal(secondInvoice.action, "noop");
  assert.equal(invoiceCount.total, 1);
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
  const pendingVisible = (await getAppSnapshot()).invoices.find((item) => item.id === invoice.id)!;
  assert.equal(pendingVisible.estado_pago_derivado, "PENDIENTE");
  assert.equal(pendingVisible.estado_pago_badge_tone, "danger");

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
  const partialVisible = (await getAppSnapshot()).invoices.find((item) => item.id === invoice.id)!;
  assert.equal(partialVisible.estado_pago_derivado, "PARCIAL");
  assert.equal(partialVisible.estado_pago_badge_tone, "warn");

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "BIZUM",
    importe: afterPartial.importe_pendiente,
    notas: "Pago final",
  });

  assert.equal((await row<{ estado_pago: string }>(`SELECT estado_pago FROM invoices WHERE id = ?`, invoice.id))!.estado_pago, "PAGADA");
  assert.equal((await row<{ estado_pago: string }>(`SELECT estado_pago FROM orders WHERE id = ?`, orderId))!.estado_pago, "PAGADA");
  assert.equal((await row<{ total: number }>(`SELECT COUNT(*) AS total FROM invoice_payments WHERE factura_id = ?`, invoice.id))!.total, 2);
  const paidVisible = (await getAppSnapshot()).invoices.find((item) => item.id === invoice.id)!;
  assert.equal(paidVisible.estado_pago_derivado, "PAGADA");
  assert.equal(paidVisible.estado_pago_badge_tone, "success");
});

test("cobrar factura rapido liquida todo el pendiente y es idempotente al repetirlo", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await processOrder(orderId);

  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;

  await completeManufacturingWorkflow(manufacturingId);
  await deliverOrderWorkflow(orderId);
  await invoiceOrderWorkflow(orderId);

  const invoice = (await row<{ id: string; total: number; codigo: string }>(
    `SELECT id, total, codigo FROM invoices WHERE pedido_id = ?`,
    orderId,
  ))!;

  const firstCollection = await collectInvoicePayment(invoice.id);
  const secondCollection = await collectInvoicePayment(invoice.id);
  const refreshedInvoice = (await row<{
    estado_pago: string;
    total_pagado: number;
    importe_pendiente: number;
  }>(`SELECT estado_pago, total_pagado, importe_pendiente FROM invoices WHERE id = ?`, invoice.id))!;

  assert.equal(firstCollection.action, "collected");
  assert.equal(firstCollection.amountCollected, invoice.total);
  assert.equal(secondCollection.action, "noop");
  assert.equal(refreshedInvoice.estado_pago, "PAGADA");
  assert.equal(refreshedInvoice.total_pagado, invoice.total);
  assert.equal(refreshedInvoice.importe_pendiente, 0);
});

test("el snapshot distingue facturas pagadas y abiertas para acciones de cobro segun rol", async () => {
  const { customerId, productId } = await setupSingleProductFixture();

  const paidOrderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await processOrder(paidOrderId);
  const paidManufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    paidOrderId,
  ))!.id;
  await completeManufacturingWorkflow(paidManufacturingId);
  await deliverOrderWorkflow(paidOrderId);
  await invoiceOrderWorkflow(paidOrderId);
  const paidInvoiceId = (await row<{ id: string }>(`SELECT id FROM invoices WHERE pedido_id = ?`, paidOrderId))!.id;
  await collectInvoicePayment(paidInvoiceId);

  const partialOrderId = await createOrderRecord({ clienteId: customerId, lines: [{ productId, quantity: 1 }] });
  await processOrder(partialOrderId);
  const partialManufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    partialOrderId,
  ))!.id;
  await completeManufacturingWorkflow(partialManufacturingId);
  await deliverOrderWorkflow(partialOrderId);
  await invoiceOrderWorkflow(partialOrderId);
  const partialInvoice = (await row<{ id: string; total: number }>(
    `SELECT id, total FROM invoices WHERE pedido_id = ?`,
    partialOrderId,
  ))!;
  await createInvoicePaymentRecord({
    facturaId: partialInvoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: Number((partialInvoice.total / 2).toFixed(2)),
  });

  const snapshot = await getAppSnapshot();
  const paidVisible = snapshot.invoices.find((invoice) => invoice.id === paidInvoiceId)!;
  const partialVisible = snapshot.invoices.find((invoice) => invoice.id === partialInvoice.id)!;

  assert.equal(paidVisible.estado_pago_derivado, "PAGADA");
  assert.deepEqual(paidVisible.acciones_permitidas, []);
  assert.equal(partialVisible.estado_pago_derivado, "PARCIAL");
  assert.deepEqual(partialVisible.acciones_permitidas, ["collect_invoice_payment", "open_payment_detail"]);

  const operatorView = filterSnapshotByRole(snapshot, buildUser("OPERADOR"));
  const financialView = filterSnapshotByRole(snapshot, buildUser("GESTOR_FINANCIERO"));

  assert.equal(operatorView.invoices.length, 0);
  assert.equal(
    financialView.invoices.some(
      (invoice) => invoice.id === partialInvoice.id && invoice.acciones_permitidas.includes("collect_invoice_payment"),
    ),
    true,
  );
});

test("muestra codigos visibles de pago numerados por pedido", async () => {
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
  const order = (await row<{ codigo: string }>(`SELECT codigo FROM orders WHERE id = ?`, orderId))!;

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: 2,
    fechaPago: "2026-04-10",
  });
  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "BIZUM",
    importe: 3,
    fechaPago: "2026-04-11",
  });

  const pdfData = await getInvoicePdfData(invoice.id);
  assert.deepEqual(
    pdfData.pagos.map((payment) => payment.displayCode),
    [`PAG-${order.codigo}-01`, `PAG-${order.codigo}-02`],
  );

  const snapshot = await getAppSnapshot();
  const visibleInvoice = snapshot.invoices.find((item: (typeof snapshot.invoices)[number]) => item.id === invoice.id);
  assert.ok(visibleInvoice);
  assert.deepEqual(
    [...visibleInvoice!.pagos]
      .sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago) || a.codigo.localeCompare(b.codigo))
      .map((payment) => payment.displayCode),
    [`PAG-${order.codigo}-01`, `PAG-${order.codigo}-02`],
  );

  const paymentExport = await getInvoicePaymentsExportRows("PARCIAL");
  assert.equal(paymentExport.length, 2);
  assert.deepEqual(
    [...paymentExport]
      .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago))
      .map((payment) => payment.codigoPago),
    [`PAG-${order.codigo}-01`, `PAG-${order.codigo}-02`],
  );
});

test("pedido y factura sin descuento mantienen el comportamiento actual", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });

  const order = (await row<{
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
  }>(`SELECT subtotal, descuento, iva, total FROM orders WHERE id = ?`, orderId))!;

  assert.equal(order.subtotal, 30);
  assert.equal(order.descuento, 0);
  assert.equal(order.iva, 5.21);
  assert.equal(order.total, 30);

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
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
  }>(`SELECT subtotal, descuento, iva, total FROM invoices WHERE pedido_id = ?`, orderId))!;

  assert.equal(invoice.subtotal, 30);
  assert.equal(invoice.descuento, 0);
  assert.equal(invoice.iva, 5.21);
  assert.equal(invoice.total, 30);
});

test("desglosa correctamente un PVP con IVA incluido y un descuento final con IVA incluido", async () => {
  const { customerId, productId } = await setupSingleProductFixture({ pvp: 5 });

  const singleOrderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });

  const singleOrder = (await row<{
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
  }>(`SELECT subtotal, descuento, iva, total FROM orders WHERE id = ?`, singleOrderId))!;

  assert.equal(singleOrder.subtotal, 5);
  assert.equal(singleOrder.descuento, 0);
  assert.equal(singleOrder.total, 5);
  assert.equal(singleOrder.iva, 0.87);

  const discountedOrderId = await createOrderRecord({
    clienteId: customerId,
    descuento: 2,
    lines: [{ productId, quantity: 2 }],
  });

  const discountedOrder = (await row<{
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
  }>(`SELECT subtotal, descuento, iva, total FROM orders WHERE id = ?`, discountedOrderId))!;

  assert.equal(discountedOrder.subtotal, 10);
  assert.equal(discountedOrder.descuento, 2);
  assert.equal(discountedOrder.total, 8);
  assert.equal(discountedOrder.iva, 1.39);
});

test("aplica el IVA propio del producto en 21, 10, 4 y 0 por ciento", async () => {
  const vatCases = [
    { vat: 21, expectedBase: 4.13, expectedIva: 0.87 },
    { vat: 10, expectedBase: 4.55, expectedIva: 0.45 },
    { vat: 4, expectedBase: 4.81, expectedIva: 0.19 },
    { vat: 0, expectedBase: 5, expectedIva: 0 },
  ];

  for (const vatCase of vatCases) {
    await resetDatabase();
    const { customerId, productId } = await setupSingleProductFixture({ pvp: 5, ivaPercentage: vatCase.vat });
    const orderId = await createOrderRecord({
      clienteId: customerId,
      lines: [{ productId, quantity: 1 }],
    });

    const order = (await row<{
      subtotal: number;
      iva: number;
      total: number;
    }>(`SELECT subtotal, iva, total FROM orders WHERE id = ?`, orderId))!;

    assert.equal(order.subtotal, 5);
    assert.equal(order.total, 5);
    assert.equal(Number((order.total - order.iva).toFixed(2)), vatCase.expectedBase);
    assert.equal(order.iva, vatCase.expectedIva);
  }
});

test("pedido y factura con descuento calculan base, IVA y total final correctamente", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({
    clienteId: customerId,
    descuento: 5,
    lines: [{ productId, quantity: 2 }],
  });

  const order = (await row<{
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
    beneficio_total: number;
  }>(`SELECT subtotal, descuento, iva, total, beneficio_total FROM orders WHERE id = ?`, orderId))!;

  assert.equal(order.subtotal, 60);
  assert.equal(order.descuento, 5);
  assert.equal(order.iva, 9.55);
  assert.equal(order.total, 55);
  assert.equal(order.beneficio_total, 38.45);

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
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
  }>(`SELECT subtotal, descuento, iva, total FROM invoices WHERE pedido_id = ?`, orderId))!;

  assert.equal(invoice.subtotal, 60);
  assert.equal(invoice.descuento, 5);
  assert.equal(invoice.iva, 9.55);
  assert.equal(invoice.total, 55);
});

test("los pagos usan el total final con descuento como pendiente", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({
    clienteId: customerId,
    descuento: 5,
    lines: [{ productId, quantity: 2 }],
  });

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
  }>(`SELECT id, total, total_pagado, importe_pendiente FROM invoices WHERE pedido_id = ?`, orderId))!;

  assert.equal(invoice.total, 55);
  assert.equal(invoice.total_pagado, 0);
  assert.equal(invoice.importe_pendiente, 55);

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: 20,
  });

  const afterPayment = (await row<{
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(`SELECT total_pagado, importe_pendiente, estado_pago FROM invoices WHERE id = ?`, invoice.id))!;

  assert.equal(afterPayment.total_pagado, 20);
  assert.equal(afterPayment.importe_pendiente, 35);
  assert.equal(afterPayment.estado_pago, "PARCIAL");
});

test("permite editar el descuento de una factura no pagada y recalcula total y pendiente", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

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
    subtotal: number;
    descuento: number;
    iva: number;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
  }>(`SELECT id, subtotal, descuento, iva, total, total_pagado, importe_pendiente FROM invoices WHERE pedido_id = ?`, orderId))!;

  assert.equal(invoice.total, 60);
  await updateInvoiceRecord({ id: invoice.id, descuento: 5 });

  const updated = (await row<{
    descuento: number;
    iva: number;
    total: number;
    total_pagado: number;
    importe_pendiente: number;
    estado_pago: string;
  }>(`SELECT descuento, iva, total, total_pagado, importe_pendiente, estado_pago FROM invoices WHERE id = ?`, invoice.id))!;

  assert.equal(updated.descuento, 5);
  assert.equal(updated.iva, 9.55);
  assert.equal(updated.total, 55);
  assert.equal(updated.total_pagado, 0);
  assert.equal(updated.importe_pendiente, 55);
  assert.equal(updated.estado_pago, "PENDIENTE");
});

test("la factura historica conserva el IVA aplicado aunque el producto cambie despues", async () => {
  const { customerId, productId, materialId } = await setupSingleProductFixture({ pvp: 5, ivaPercentage: 10 });
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });

  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;
  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const beforeChange = (await row<{ iva: number; total: number }>(
    `SELECT iva, total FROM invoices WHERE pedido_id = ?`,
    orderId,
  ))!;

  await updateProductRecord({
    id: productId,
    nombre: "Producto Test",
    gramosEstimados: 100,
    tiempoImpresionHoras: 2,
    costeElectricidad: 1.5,
    margen: 10,
    pvp: 5,
    ivaPorcentaje: 21,
    materialId,
    activo: true,
  });

  const afterChange = (await row<{ iva: number; total: number }>(
    `SELECT iva, total FROM invoices WHERE pedido_id = ?`,
    orderId,
  ))!;

  assert.equal(beforeChange.total, 5);
  assert.equal(beforeChange.iva, 0.45);
  assert.equal(afterChange.total, 5);
  assert.equal(afterChange.iva, 0.45);
});

test("bloquea descuentos en factura parcial si el nuevo total queda por debajo de lo ya cobrado", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 2 }],
  });

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

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: 40,
  });

  await assert.rejects(
    () => updateInvoiceRecord({ id: invoice.id, descuento: 30 }),
    /total final por debajo de lo ya cobrado/i,
  );
});

test("bloquea editar el descuento cuando la factura ya esta pagada", async () => {
  const { customerId, productId } = await setupSingleProductFixture();
  const orderId = await createOrderRecord({
    clienteId: customerId,
    lines: [{ productId, quantity: 1 }],
  });

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
  });

  await assert.rejects(
    () => updateInvoiceRecord({ id: invoice.id, descuento: 1 }),
    /factura ya pagada/i,
  );
});

test("bloquea descuentos negativos o superiores al subtotal", async () => {
  const { customerId, productId } = await setupSingleProductFixture();

  await assert.rejects(
    () =>
      createOrderRecord({
        clienteId: customerId,
        descuento: -1,
        lines: [{ productId, quantity: 1 }],
      }),
    /descuento no puede ser negativo/i,
  );

  await assert.rejects(
    () =>
      createOrderRecord({
        clienteId: customerId,
        descuento: 31,
        lines: [{ productId, quantity: 1 }],
      }),
    /descuento no puede superar el subtotal/i,
  );
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
  const visibleInvoice = snapshot.invoices.find((item: (typeof snapshot.invoices)[number]) => item.id === invoice.id);

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

test("el PDF de factura usa los importes reales y se descarga como adjunto", async () => {
  const { customerId, productId } = await setupSingleProductFixture({ pvp: 5, ivaPercentage: 10 });
  const orderId = await createOrderRecord({
    clienteId: customerId,
    descuento: 1,
    lines: [{ productId, quantity: 2 }],
  });
  await confirmOrder(orderId);
  const manufacturingId = (await row<{ id: string }>(
    `SELECT id FROM manufacturing_orders WHERE pedido_id = ?`,
    orderId,
  ))!.id;
  await startManufacturingOrder(manufacturingId);
  await completeManufacturingOrder(manufacturingId);
  await deliverOrder(orderId);
  await generateInvoiceForOrder(orderId);

  const invoice = (await row<{ id: string; codigo: string; total: number }>(
    `SELECT id, codigo, total FROM invoices WHERE pedido_id = ?`,
    orderId,
  ))!;

  await createInvoicePaymentRecord({
    facturaId: invoice.id,
    metodoPago: "TRANSFERENCIA",
    importe: 4,
    notas: "Primer pago PDF",
  });

  const pdfData = await getInvoicePdfData(invoice.id);
  assert.equal(pdfData.resumen.subtotal, 10);
  assert.equal(pdfData.resumen.descuento, 1);
  assert.equal(pdfData.resumen.total, 9);
  assert.equal(pdfData.resumen.baseImponible, 8.18);
  assert.equal(pdfData.resumen.iva, 0.82);
  assert.equal(pdfData.resumen.totalPagado, 4);
  assert.equal(pdfData.resumen.importePendiente, 5);
  assert.equal(pdfData.resumen.estadoPago, "PARCIAL");
  assert.equal(pdfData.lineas.length, 1);
  assert.equal(pdfData.lineas[0]?.iva_porcentaje, 10);

  const response = await withMockUser(buildUser("ADMIN"), () =>
    getInvoicePdfRoute(new Request(`http://localhost/api/exports/invoices/${invoice.id}/pdf`), {
      params: Promise.resolve({ id: invoice.id }),
    }),
  );
  const pdfText = Buffer.from(await response.arrayBuffer()).toString("latin1");

  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition") ?? "", new RegExp(`factura-${invoice.codigo.toLowerCase()}\\.pdf`));
  assert.match(pdfText, /^%PDF-/);
  assert.match(pdfText, new RegExp(invoice.codigo));
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
