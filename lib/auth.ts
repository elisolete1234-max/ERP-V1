import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { row, rows, run } from "./db";

export type AppRole = "ADMIN" | "OPERADOR" | "GESTOR_FINANCIERO" | "CLIENTE";
export type AppModule =
  | "dashboard"
  | "pedidos"
  | "fabricacion"
  | "stock"
  | "solicitudes-compra"
  | "productos-terminados"
  | "facturas"
  | "impresoras"
  | "productos"
  | "materiales"
  | "clientes"
  | "movimientos"
  | "usuarios";
export type AppPermission =
  | "view_costs"
  | "view_margins"
  | "create_customer"
  | "edit_customer"
  | "archive_customer"
  | "create_material"
  | "edit_material"
  | "archive_material"
  | "product:create"
  | "product:editTechnical"
  | "product:editFinancial"
  | "product:archive"
  | "create_product"
  | "edit_product"
  | "archive_product"
  | "create_order"
  | "edit_order"
  | "confirm_order"
  | "process_order"
  | "retry_order"
  | "start_manufacturing"
  | "complete_manufacturing"
  | "create_stock_manufacturing"
  | "edit_manufacturing"
  | "restock_material"
  | "purchaseRequest:create"
  | "purchaseRequest:approve"
  | "purchaseRequest:reject"
  | "purchaseRequest:convertToStockEntry"
  | "purchaseRequest:cancelOwn"
  | "create_printer"
  | "edit_printer"
  | "archive_printer"
  | "restock_finished_inventory"
  | "edit_finished_inventory"
  | "deliver_order"
  | "invoice_order"
  | "collect_payment"
  | "edit_invoice"
  | "register_payment"
  | "export_data"
  | "manage_users"
  | "change_configuration";

export type CurrentUser = {
  id: string;
  nombre: string;
  email: string;
  role: AppRole;
  clienteId: string | null;
  activo: boolean;
};

type AuthContext = {
  user: CurrentUser | null;
};

const SESSION_COOKIE = "eli_print_3d_session";
const PASSWORD_KEYLEN = 64;
const SESSION_TOKEN_BYTES = 32;
const SESSION_DAYS = 30;
const authStorage = new AsyncLocalStorage<AuthContext>();

const roleLabels: Record<AppRole, string> = {
  ADMIN: "Admin",
  OPERADOR: "Operador",
  GESTOR_FINANCIERO: "Gestor financiero",
  CLIENTE: "Cliente",
};

const roleModules: Record<AppRole, AppModule[]> = {
  ADMIN: [
    "dashboard",
    "pedidos",
    "fabricacion",
    "stock",
    "solicitudes-compra",
    "productos-terminados",
    "facturas",
    "impresoras",
    "productos",
    "materiales",
    "clientes",
    "movimientos",
    "usuarios",
  ],
  OPERADOR: [
    "fabricacion",
    "stock",
    "solicitudes-compra",
    "productos-terminados",
    "impresoras",
    "productos",
    "materiales",
    "movimientos",
  ],
  GESTOR_FINANCIERO: [
    "pedidos",
    "solicitudes-compra",
    "facturas",
    "stock",
    "productos",
    "materiales",
    "clientes",
  ],
  CLIENTE: [
    "pedidos",
  ],
};

const rolePermissions: Record<AppRole, AppPermission[]> = {
  ADMIN: [
    "view_costs",
    "view_margins",
    "create_customer",
    "edit_customer",
    "archive_customer",
    "create_material",
    "edit_material",
    "archive_material",
    "product:create",
    "product:editTechnical",
    "product:editFinancial",
    "product:archive",
    "create_product",
    "edit_product",
    "archive_product",
    "create_order",
    "edit_order",
    "confirm_order",
    "process_order",
    "retry_order",
    "start_manufacturing",
    "complete_manufacturing",
    "create_stock_manufacturing",
    "edit_manufacturing",
    "restock_material",
    "purchaseRequest:create",
    "purchaseRequest:approve",
    "purchaseRequest:reject",
    "purchaseRequest:convertToStockEntry",
    "purchaseRequest:cancelOwn",
    "create_printer",
    "edit_printer",
    "archive_printer",
    "restock_finished_inventory",
    "edit_finished_inventory",
    "deliver_order",
    "invoice_order",
    "collect_payment",
    "edit_invoice",
    "register_payment",
    "export_data",
    "manage_users",
    "change_configuration",
  ],
  OPERADOR: [
    "product:create",
    "product:editTechnical",
    "purchaseRequest:create",
    "purchaseRequest:cancelOwn",
    "start_manufacturing",
    "complete_manufacturing",
    "create_stock_manufacturing",
    "edit_manufacturing",
    "restock_finished_inventory",
    "edit_finished_inventory",
  ],
  GESTOR_FINANCIERO: [
    "view_costs",
    "view_margins",
    "product:editFinancial",
    "create_customer",
    "edit_customer",
    "archive_customer",
    "create_order",
    "edit_order",
    "confirm_order",
    "process_order",
    "retry_order",
    "deliver_order",
    "invoice_order",
    "collect_payment",
    "edit_invoice",
    "register_payment",
    "restock_material",
    "purchaseRequest:approve",
    "purchaseRequest:reject",
    "purchaseRequest:convertToStockEntry",
    "export_data",
  ],
  CLIENTE: [],
};

function nowIso() {
  return new Date().toISOString();
}

function sessionExpiryIso() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPasswordHash(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, PASSWORD_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function sanitizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validatePassword(password: string) {
  if (password.trim().length < 8) {
    throw new Error("La contrasena debe tener al menos 8 caracteres.");
  }
}

function requireActiveCustomerForClient(role: AppRole, clienteId?: string | null) {
  if (role === "CLIENTE" && !clienteId?.trim()) {
    throw new Error("Los usuarios cliente deben estar vinculados a un cliente.");
  }
}

async function ensureCustomerLinkIsValid(clienteId: string | null) {
  if (!clienteId) {
    return;
  }

  const customer = await row<{ id: string; activo: number }>(
    `SELECT id, activo FROM customers WHERE id = ?`,
    clienteId,
  );
  if (!customer) {
    throw new Error("El cliente asociado no existe.");
  }
  if (customer.activo !== 1) {
    throw new Error("No se puede vincular un usuario a un cliente archivado.");
  }
}

async function countActiveAdmins() {
  const result = await row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND activo = 1`,
  );
  return result?.total ?? 0;
}

async function invalidateSessionsForUser(userId: string) {
  await run(`DELETE FROM user_sessions WHERE user_id = ?`, userId);
}

export function getRoleLabel(role: AppRole) {
  return roleLabels[role];
}

export function listRoles() {
  return Object.keys(roleLabels) as AppRole[];
}

export async function hasUsers() {
  const result = await row<{ total: number }>(`SELECT COUNT(*) AS total FROM users`);
  return (result?.total ?? 0) > 0;
}

export async function listUsers() {
  return rows<{
    id: string;
    nombre: string;
    email: string;
    role: AppRole;
    cliente_id: string | null;
    activo: number;
    creado_en: string;
    cliente_nombre: string | null;
  }>(
    `SELECT
       u.id,
       u.nombre,
       u.email,
       u.role,
       u.cliente_id,
       u.activo,
       u.creado_en,
       c.nombre AS cliente_nombre
     FROM users u
     LEFT JOIN customers c ON c.id = u.cliente_id
     ORDER BY u.creado_en DESC, u.nombre ASC`,
  );
}

export async function createInitialAdmin(input: {
  nombre: string;
  email: string;
  password: string;
}) {
  if (await hasUsers()) {
    throw new Error("Ya existen usuarios. El bootstrap inicial ya no esta disponible.");
  }

  const nombre = input.nombre.trim();
  const email = sanitizeEmail(input.email);
  validatePassword(input.password);

  if (!nombre || !email) {
    throw new Error("Debes indicar nombre y email para el administrador inicial.");
  }

  const userId = randomUUID();
  await run(
    `INSERT INTO users (id, nombre, email, password_hash, role, cliente_id, activo, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    nombre,
    email,
    buildPasswordHash(input.password),
    "ADMIN",
    null,
    1,
    nowIso(),
  );

  await logAuditEvent({
    userId,
    userEmail: email,
    action: "bootstrap_admin",
    entityType: "user",
    entityId: userId,
    summary: `Bootstrap del primer usuario administrador ${email}`,
  });

  return { id: userId, email, role: "ADMIN" as const };
}

export async function createUserRecord(input: {
  nombre: string;
  email: string;
  password: string;
  role: AppRole;
  clienteId?: string | null;
  activo?: boolean;
}) {
  const nombre = input.nombre.trim();
  const email = sanitizeEmail(input.email);
  const role = input.role;
  const clienteId = input.clienteId?.trim() || null;
  validatePassword(input.password);
  requireActiveCustomerForClient(role, clienteId);

  if (!nombre || !email) {
    throw new Error("El usuario necesita nombre y email.");
  }

  const existing = await row<{ id: string }>(`SELECT id FROM users WHERE email = ?`, email);
  if (existing) {
    throw new Error("Ya existe un usuario con ese email.");
  }

  await ensureCustomerLinkIsValid(clienteId);

  const userId = randomUUID();
  await run(
    `INSERT INTO users (id, nombre, email, password_hash, role, cliente_id, activo, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    nombre,
    email,
    buildPasswordHash(input.password),
    role,
    clienteId,
    input.activo === false ? 0 : 1,
    nowIso(),
  );

  await logAuditEvent({
    action: "create_user",
    entityType: "user",
    entityId: userId,
    summary: `Creado usuario ${email} con rol ${role}`,
  });

  return { id: userId, email, role };
}

export async function updateUserRecord(input: {
  id: string;
  nombre: string;
  email: string;
  role: AppRole;
  activo: boolean;
  clienteId?: string | null;
  password?: string;
}) {
  const userId = input.id.trim();
  const nombre = input.nombre.trim();
  const email = sanitizeEmail(input.email);
  const role = input.role;
  const clienteId = role === "CLIENTE" ? input.clienteId?.trim() || null : null;
  const password = input.password?.trim() || "";

  if (!userId || !nombre || !email) {
    throw new Error("El usuario necesita nombre y email.");
  }

  requireActiveCustomerForClient(role, clienteId);
  await ensureCustomerLinkIsValid(clienteId);

  const existingUser = await row<{
    id: string;
    nombre: string;
    email: string;
    role: AppRole;
    cliente_id: string | null;
    activo: number;
    password_hash: string;
  }>(
    `SELECT id, nombre, email, role, cliente_id, activo, password_hash
     FROM users
     WHERE id = ?`,
    userId,
  );

  if (!existingUser) {
    throw new Error("El usuario no existe.");
  }

  const duplicate = await row<{ id: string }>(
    `SELECT id FROM users WHERE email = ? AND id != ?`,
    email,
    userId,
  );
  if (duplicate) {
    throw new Error("Ya existe un usuario con ese email.");
  }

  const targetActivo = input.activo ? 1 : 0;
  const adminWouldStopBeingActive =
    existingUser.role === "ADMIN" &&
    existingUser.activo === 1 &&
    (role !== "ADMIN" || targetActivo !== 1);

  if (adminWouldStopBeingActive && (await countActiveAdmins()) <= 1) {
    throw new Error("No puedes dejar la app sin ningun ADMIN activo.");
  }

  const nextPasswordHash = password ? buildPasswordHash(password) : existingUser.password_hash;
  if (password) {
    validatePassword(password);
  }

  await run(
    `UPDATE users
     SET nombre = ?, email = ?, role = ?, cliente_id = ?, activo = ?, password_hash = ?
     WHERE id = ?`,
    nombre,
    email,
    role,
    clienteId,
    targetActivo,
    nextPasswordHash,
    userId,
  );

  if (targetActivo !== 1) {
    await invalidateSessionsForUser(userId);
  }

  const summaryParts = ["Usuario actualizado"];
  if (existingUser.role !== role) {
    summaryParts.push(`rol ${existingUser.role} -> ${role}`);
    await logAuditEvent({
      action: "change_user_role",
      entityType: "user",
      entityId: userId,
      summary: `Rol cambiado de ${existingUser.role} a ${role} para ${email}`,
    });
  }
  if (existingUser.activo !== targetActivo) {
    const stateLabel = targetActivo === 1 ? "activado" : "desactivado";
    summaryParts.push(stateLabel);
    await logAuditEvent({
      action: targetActivo === 1 ? "activate_user" : "deactivate_user",
      entityType: "user",
      entityId: userId,
      summary: `Usuario ${email} ${stateLabel}`,
    });
  }
  if (existingUser.email !== email || existingUser.nombre !== nombre || existingUser.cliente_id !== clienteId) {
    await logAuditEvent({
      action: "edit_user",
      entityType: "user",
      entityId: userId,
      summary: `Ficha actualizada para ${email}`,
    });
  }
  if (password) {
    summaryParts.push("contrasena reseteada");
    await logAuditEvent({
      action: "reset_user_password",
      entityType: "user",
      entityId: userId,
      summary: `Contrasena reseteada para ${email}`,
    });
  }

  return {
    id: userId,
    email,
    role,
    message: `${summaryParts.join(", ")}.`,
  };
}

export async function authenticateUser(input: { email: string; password: string }) {
  const email = sanitizeEmail(input.email);
  const user = await row<{
    id: string;
    nombre: string;
    email: string;
    password_hash: string;
    role: AppRole;
    cliente_id: string | null;
    activo: number;
  }>(
    `SELECT id, nombre, email, password_hash, role, cliente_id, activo
     FROM users
     WHERE email = ?`,
    email,
  );

  if (!user || !verifyPasswordHash(input.password, user.password_hash)) {
    throw new Error("Credenciales invalidas.");
  }

  if (user.activo !== 1) {
    throw new Error("Tu usuario esta inactivo.");
  }

  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role,
    clienteId: user.cliente_id,
    activo: true,
  } satisfies CurrentUser;
}

export async function createUserSession(userId: string) {
  const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  await run(
    `INSERT INTO user_sessions (id, user_id, token_hash, creado_en, expira_en)
     VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    userId,
    tokenHash,
    nowIso(),
    sessionExpiryIso(),
  );
  return rawToken;
}

export async function invalidateUserSession(rawToken: string | null | undefined) {
  if (!rawToken?.trim()) {
    return;
  }

  await run(`DELETE FROM user_sessions WHERE token_hash = ?`, hashSessionToken(rawToken));
}

async function findUserBySessionToken(rawToken: string) {
  const tokenHash = hashSessionToken(rawToken);
  const user = await row<{
    id: string;
    nombre: string;
    email: string;
    role: AppRole;
    cliente_id: string | null;
    activo: number;
    expira_en: string;
  }>(
    `SELECT
       u.id,
       u.nombre,
       u.email,
       u.role,
       u.cliente_id,
       u.activo,
       s.expira_en
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    tokenHash,
  );

  if (!user) {
    return null;
  }

  if (user.activo !== 1) {
    await run(`DELETE FROM user_sessions WHERE token_hash = ?`, tokenHash);
    return null;
  }

  if (new Date(user.expira_en).getTime() <= Date.now()) {
    await run(`DELETE FROM user_sessions WHERE token_hash = ?`, tokenHash);
    return null;
  }

  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role,
    clienteId: user.cliente_id,
    activo: true,
  } satisfies CurrentUser;
}

export async function readCurrentSessionToken() {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export async function writeSessionCookie(token: string) {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const context = authStorage.getStore();
  if (context) {
    return context.user;
  }

  const token = await readCurrentSessionToken();
  if (!token) {
    return null;
  }

  return findUserBySessionToken(token);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Debes iniciar sesion para acceder.");
  }
  return user;
}

export function canAccessModule(user: Pick<CurrentUser, "role">, module: AppModule) {
  return roleModules[user.role].includes(module);
}

export function canPerformAction(user: Pick<CurrentUser, "role">, permission: AppPermission) {
  return rolePermissions[user.role].includes(permission);
}

export async function requirePermission(permission: AppPermission) {
  const user = await requireCurrentUser();
  if (!canPerformAction(user, permission)) {
    throw new Error("No tienes permisos para realizar esta accion.");
  }
  return user;
}

export function getVisibleSections(user: Pick<CurrentUser, "role">) {
  return roleModules[user.role];
}

function canViewCosts(user: Pick<CurrentUser, "role">) {
  return canPerformAction(user, "view_costs");
}

function canViewMargins(user: Pick<CurrentUser, "role">) {
  return canPerformAction(user, "view_margins");
}

function canViewProductFinancials(user: Pick<CurrentUser, "role">) {
  return user.role === "ADMIN" || user.role === "GESTOR_FINANCIERO";
}

function redactOrder(order: Record<string, unknown>, user: Pick<CurrentUser, "role">) {
  const canSeeCosts = canViewCosts(user);
  const canSeeMargins = canViewMargins(user);
  const rawOrder = order as {
    observaciones?: string | null;
    lineas?: Array<Record<string, unknown>>;
    ordenesFabricacion?: Array<Record<string, unknown>>;
    factura?: Record<string, unknown> | null;
    acciones_permitidas?: string[];
  };

  return {
    ...rawOrder,
    observaciones: user.role === "CLIENTE" ? null : rawOrder.observaciones ?? null,
    coste_total_pedido: canSeeCosts ? order.coste_total_pedido : 0,
    beneficio_total: canSeeMargins ? order.beneficio_total : 0,
    acciones_permitidas:
      user.role === "ADMIN"
        ? rawOrder.acciones_permitidas ?? []
        : (rawOrder.acciones_permitidas ?? []).filter((action) => {
            if (action === "confirm_order") return canPerformAction(user, "confirm_order");
            if (action === "process_order") return canPerformAction(user, "process_order");
            if (action === "retry_order") return canPerformAction(user, "retry_order");
            if (action === "deliver_order") return canPerformAction(user, "deliver_order");
            if (action === "invoice_order") return canPerformAction(user, "invoice_order");
            return false;
          }),
    lineas: (rawOrder.lineas ?? []).map((line) => ({
      ...line,
      coste_total: canSeeCosts ? line.coste_total : 0,
      beneficio: canSeeMargins ? line.beneficio : 0,
    })),
    ordenesFabricacion: user.role === "CLIENTE" ? [] : rawOrder.ordenesFabricacion ?? [],
  };
}

function redactInvoice(invoice: Record<string, unknown>, user: Pick<CurrentUser, "role">) {
  const rawInvoice = invoice as {
    pagos?: Array<Record<string, unknown>>;
    acciones_permitidas?: string[];
  };

  return {
    ...rawInvoice,
    pagos: user.role === "CLIENTE" ? [] : rawInvoice.pagos ?? [],
    acciones_permitidas:
      user.role === "ADMIN"
        ? rawInvoice.acciones_permitidas ?? []
        : (rawInvoice.acciones_permitidas ?? []).filter((action) => {
            if (action === "collect_payment" || action === "collect_invoice_payment") {
              return canPerformAction(user, "collect_payment");
            }
            if (action === "register_payment" || action === "open_payment_detail") {
              return canPerformAction(user, "register_payment") || canPerformAction(user, "collect_payment");
            }
            if (action === "edit_invoice") return canPerformAction(user, "edit_invoice");
            return false;
          }),
  };
}

export function filterSnapshotByRole<T extends {
  customers: Array<Record<string, unknown>>;
  materials: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  purchaseRequests: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  manufacturingOrders: Array<Record<string, unknown>>;
  stockMovements: Array<Record<string, unknown>>;
  finishedInventory: Array<Record<string, unknown>>;
  printers: Array<Record<string, unknown>>;
  inventoryMovements: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
}>(snapshot: T, user: CurrentUser): T {
  if (user.role === "ADMIN") {
    return snapshot;
  }

  const filteredOrders = snapshot.orders
    .filter((order) => (user.role === "CLIENTE" ? order.cliente_id === user.clienteId : canAccessModule(user, "pedidos")))
    .map((order) => redactOrder(order, user));
  const filteredInvoices = snapshot.invoices
    .filter((invoice) => {
      if (user.role === "CLIENTE") {
        return canAccessModule(user, "facturas") && invoice.cliente_id === user.clienteId;
      }
      return canAccessModule(user, "facturas");
    })
    .map((invoice) => redactInvoice(invoice, user));

  return {
    ...snapshot,
    customers:
      user.role === "CLIENTE"
        ? snapshot.customers.filter((customer) => customer.id === user.clienteId)
        : canAccessModule(user, "clientes")
          ? snapshot.customers
          : [],
    materials: canAccessModule(user, "materiales")
      ? snapshot.materials.map((material) => ({
          ...material,
          precio_kg: canViewCosts(user) ? material.precio_kg : 0,
          proveedor: canViewCosts(user) ? material.proveedor : null,
        }))
      : [],
    products: canAccessModule(user, "productos")
      ? snapshot.products.map((product) => ({
          ...product,
          pvp: canViewProductFinancials(user) ? product.pvp : 0,
          iva_porcentaje: canViewProductFinancials(user) ? product.iva_porcentaje : 0,
          coste_electricidad: canViewCosts(user) ? product.coste_electricidad : 0,
          coste_maquina: canViewCosts(user) ? product.coste_maquina : 0,
          coste_mano_obra: canViewCosts(user) ? product.coste_mano_obra : 0,
          coste_postprocesado: canViewCosts(user) ? product.coste_postprocesado : 0,
          coste_material_estimado: canViewCosts(user) ? product.coste_material_estimado : 0,
          coste_total_producto: canViewCosts(user) ? product.coste_total_producto : 0,
          margen: canViewMargins(user) ? product.margen : 0,
        }))
      : [],
    purchaseRequests: canAccessModule(user, "solicitudes-compra")
      ? snapshot.purchaseRequests.filter((request) => {
          if (user.role === "ADMIN" || user.role === "GESTOR_FINANCIERO") {
            return true;
          }

          return request.solicitante_user_id === user.id;
        })
      : [],
    orders: filteredOrders,
    manufacturingOrders: canAccessModule(user, "fabricacion")
      ? snapshot.manufacturingOrders.map((order) => {
          const rawOrder = order as Record<string, unknown> & { acciones_permitidas?: string[] };
          return {
            ...rawOrder,
            coste_impresora_visual: canViewCosts(user) ? rawOrder.coste_impresora_visual : 0,
            coste_material: canViewCosts(user) ? rawOrder.coste_material : 0,
            coste_electricidad: canViewCosts(user) ? rawOrder.coste_electricidad : 0,
            coste_maquina: canViewCosts(user) ? rawOrder.coste_maquina : 0,
            coste_postprocesado: canViewCosts(user) ? rawOrder.coste_postprocesado : 0,
            coste_mano_obra: canViewCosts(user) ? rawOrder.coste_mano_obra : 0,
            coste_estimado_total: canViewCosts(user) ? rawOrder.coste_estimado_total : 0,
            coste_estimado_unitario: canViewCosts(user) ? rawOrder.coste_estimado_unitario : 0,
            beneficio_estimado_total: canViewMargins(user) ? rawOrder.beneficio_estimado_total : 0,
            margen_estimado_porcentaje: canViewMargins(user) ? rawOrder.margen_estimado_porcentaje : 0,
            coste_warnings: canViewCosts(user) ? rawOrder.coste_warnings : [],
            acciones_permitidas: (rawOrder.acciones_permitidas ?? []).filter((action) => {
              if (action === "complete_manufacturing") return canPerformAction(user, "complete_manufacturing");
              return canPerformAction(user, "edit_manufacturing");
            }),
          };
        })
      : [],
    stockMovements: canAccessModule(user, "movimientos") ? snapshot.stockMovements : [],
    finishedInventory: canAccessModule(user, "productos-terminados")
      ? snapshot.finishedInventory.map((item) => ({
          ...item,
          coste_unitario: canViewCosts(user) ? item.coste_unitario : 0,
          precio_venta: canViewCosts(user) ? item.precio_venta : 0,
        }))
      : [],
    printers: canAccessModule(user, "impresoras")
      ? snapshot.printers.map((printer) => ({
          ...printer,
          coste_hora: canViewCosts(user) ? printer.coste_hora : 0,
        }))
      : [],
    inventoryMovements: canAccessModule(user, "movimientos") ? snapshot.inventoryMovements : [],
    invoices: filteredInvoices,
  };
}

export async function assertInvoiceAccess(invoiceId: string, user?: CurrentUser | null) {
  const actor = user ?? (await requireCurrentUser());
  if (actor.role === "ADMIN" || actor.role === "GESTOR_FINANCIERO") {
    return;
  }

  if (actor.role !== "CLIENTE" || !actor.clienteId) {
    throw new Error("No tienes permisos para acceder a esta factura.");
  }

  const invoice = await row<{ id: string }>(
    `SELECT id FROM invoices WHERE id = ? AND cliente_id = ?`,
    invoiceId,
    actor.clienteId,
  );
  if (!invoice) {
    throw new Error("No tienes permisos para acceder a esta factura.");
  }
}

export async function logAuditEvent(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  userId?: string | null;
  userEmail?: string | null;
}) {
  const user = input.userId || input.userEmail ? null : await getCurrentUser();
  await run(
    `INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, summary, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.userId ?? user?.id ?? null,
    input.userEmail ?? user?.email ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.summary,
    nowIso(),
  );
}

export async function withMockUser<T>(user: CurrentUser | null, task: () => Promise<T>) {
  return authStorage.run({ user }, task);
}
