import { createClient } from "@libsql/client";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PASSWORD_KEYLEN = 64;
const VALID_ROLES = new Set(["ADMIN", "OPERADOR", "GESTOR_FINANCIERO", "CLIENTE"]);

function parseArgs(argv) {
  const flags = new Set();
  const args = [];
  for (const arg of argv) {
    if (arg === "--local" || arg === "--remote") {
      flags.add(arg);
      continue;
    }
    args.push(arg);
  }

  if (flags.has("--local") && flags.has("--remote")) {
    throw new Error("Usa solo --local o --remote, no ambos.");
  }

  return { flags, args };
}

function getDatabasePath() {
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "fabriq-erp.db");
}

function getDatabase(flags = new Set()) {
  const forceLocal = flags.has("--local");
  const forceRemote = flags.has("--remote");
  const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
  const remoteToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if ((forceRemote || (!forceLocal && remoteUrl)) && remoteUrl) {
    if (!remoteUrl.startsWith("libsql://")) {
      throw new Error("TURSO_DATABASE_URL debe empezar por libsql://");
    }
    if (!remoteToken) {
      throw new Error("Falta TURSO_AUTH_TOKEN para operar contra Turso/Vercel.");
    }
    return {
      target: "remote",
      label: remoteUrl,
      db: createClient({
        url: remoteUrl,
        authToken: remoteToken,
        intMode: "number",
      }),
    };
  }

  if (forceRemote) {
    throw new Error("No hay TURSO_DATABASE_URL. No se puede usar --remote.");
  }

  const localPath = getDatabasePath();
  return {
    target: "local",
    label: localPath,
    db: createClient({
      url: pathToFileURL(localPath).toString(),
      intMode: "number",
    }),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeEmail(email) {
  return email.trim().toLowerCase();
}

function validatePassword(password) {
  if (password.trim().length < 8) {
    throw new Error("La contrasena debe tener al menos 8 caracteres.");
  }
}

function buildPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function getUsers(db) {
  const result = await db.execute(
    `SELECT id, nombre, email, role, cliente_id, activo, creado_en
     FROM users
     ORDER BY creado_en ASC`,
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    nombre: String(row.nombre),
    email: String(row.email),
    role: String(row.role),
    clienteId: row.cliente_id ? String(row.cliente_id) : null,
    activo: Number(row.activo) === 1,
    creadoEn: String(row.creado_en),
  }));
}

async function tableExists(db, tableName) {
  const result = await db.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName],
  );
  return Boolean(result.rows[0]);
}

async function logMaintenanceEvent(db, input) {
  if (!(await tableExists(db, "audit_logs"))) {
    return;
  }

  await db.execute(
    `INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, summary, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      null,
      "maintenance-script",
      input.action,
      "user",
      input.userId ?? null,
      input.summary,
      nowIso(),
    ],
  );
}

async function invalidateUserSessions(db, userId) {
  if (!(await tableExists(db, "user_sessions"))) {
    return;
  }

  await db.execute(`DELETE FROM user_sessions WHERE user_id = ?`, [userId]);
}

async function countActiveAdmins(db) {
  const result = await db.execute(
    `SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND activo = 1`,
  );
  return Number(result.rows[0]?.total ?? 0);
}

function printResult(context, payload) {
  console.log(JSON.stringify({ database: context.target, source: context.label, ...payload }, null, 2));
}

async function listUsers(flags) {
  const context = getDatabase(flags);
  const { db } = context;
  const users = await getUsers(db);
  printResult(context, {
    action: "list-users",
    users: users.map((user) => ({
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      activo: user.activo,
      creadoEn: user.creadoEn,
    })),
  });
}

async function resetPassword(flags, emailArg, passwordArg) {
  if (!emailArg || !passwordArg) {
    throw new Error("Uso: npm run users:reset-password -- [--local|--remote] <email> <NuevaPassword123>");
  }

  const context = getDatabase(flags);
  const { db } = context;
  const email = sanitizeEmail(emailArg);
  validatePassword(passwordArg);

  const result = await db.execute(
    `SELECT id, nombre, email, role, cliente_id, activo, creado_en
     FROM users
     WHERE email = ?`,
    [email],
  );
  const user = result.rows[0];

  if (!user) {
    throw new Error(`No existe ningun usuario con email ${email}.`);
  }

  await db.execute(
    `UPDATE users
     SET password_hash = ?
     WHERE id = ?`,
    [buildPasswordHash(passwordArg), String(user.id)],
  );

  await invalidateUserSessions(db, String(user.id));
  await logMaintenanceEvent(db, {
    action: "maintenance_reset_password",
    userId: String(user.id),
    summary: `Contrasena reseteada por mantenimiento para ${email}`,
  });

  printResult(context, {
    action: "reset-password",
    email,
    nombre: String(user.nombre),
    role: String(user.role),
    activo: Number(user.activo) === 1,
    sessionsInvalidated: true,
  });
}

async function promoteAdmin(flags, emailArg) {
  if (!emailArg) {
    throw new Error("Uso: npm run users:promote-admin -- [--local|--remote] <email>");
  }

  const context = getDatabase(flags);
  const { db } = context;
  const email = sanitizeEmail(emailArg);
  const result = await db.execute(
    `SELECT id, nombre, email, role, activo
     FROM users
     WHERE email = ?`,
    [email],
  );
  const user = result.rows[0];

  if (!user) {
    throw new Error(`No existe ningun usuario con email ${email}.`);
  }

  await db.execute(
    `UPDATE users
     SET role = 'ADMIN', activo = 1
     WHERE id = ?`,
    [String(user.id)],
  );

  await logMaintenanceEvent(db, {
    action: "maintenance_promote_admin",
    userId: String(user.id),
    summary: `Usuario promovido a ADMIN por mantenimiento: ${email}`,
  });

  printResult(context, {
    action: "promote-admin",
    email,
    nombre: String(user.nombre),
    role: "ADMIN",
    activo: true,
  });
}

async function createAdmin(flags, emailArg, passwordArg, nameArg) {
  if (!emailArg || !passwordArg) {
    throw new Error("Uso: npm run users:create-admin -- [--local|--remote] <email> <NuevaPassword123> [Nombre]");
  }

  const context = getDatabase(flags);
  const { db } = context;
  const email = sanitizeEmail(emailArg);
  const nombre = nameArg?.trim() || "Admin local mantenimiento";
  validatePassword(passwordArg);

  const existing = await db.execute(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing.rows[0]) {
    throw new Error(`Ya existe un usuario con email ${email}.`);
  }

  await db.execute(
    `INSERT INTO users (id, nombre, email, password_hash, role, cliente_id, activo, creado_en)
     VALUES (?, ?, ?, ?, 'ADMIN', NULL, 1, ?)`,
    [randomUUID(), nombre, email, buildPasswordHash(passwordArg), nowIso()],
  );

  const created = await db.execute(`SELECT id FROM users WHERE email = ?`, [email]);
  const userId = created.rows[0] ? String(created.rows[0].id) : null;
  await logMaintenanceEvent(db, {
    action: "maintenance_create_admin",
    userId,
    summary: `ADMIN creado por mantenimiento: ${email}`,
  });

  printResult(context, {
    action: "create-admin",
    email,
    nombre,
    role: "ADMIN",
    activo: true,
  });
}

async function recoverAdmin(flags, emailArg, passwordArg, nameArg) {
  if (!emailArg || !passwordArg) {
    throw new Error("Uso: npm run users:recover-admin -- [--local|--remote] <email> <NuevaPassword123> [Nombre]");
  }

  const context = getDatabase(flags);
  const { db } = context;
  const email = sanitizeEmail(emailArg);
  const nombre = nameArg?.trim() || "Admin recuperacion";
  validatePassword(passwordArg);

  const result = await db.execute(
    `SELECT id, nombre, email, role, activo
     FROM users
     WHERE email = ?`,
    [email],
  );
  const user = result.rows[0];

  if (!user) {
    await db.execute(
      `INSERT INTO users (id, nombre, email, password_hash, role, cliente_id, activo, creado_en)
       VALUES (?, ?, ?, ?, 'ADMIN', NULL, 1, ?)`,
      [randomUUID(), nombre, email, buildPasswordHash(passwordArg), nowIso()],
    );
    const created = await db.execute(`SELECT id FROM users WHERE email = ?`, [email]);
    const userId = created.rows[0] ? String(created.rows[0].id) : null;
    await logMaintenanceEvent(db, {
      action: "maintenance_recover_admin",
      userId,
      summary: `ADMIN creado por recuperacion: ${email}`,
    });
    printResult(context, {
      action: "recover-admin",
      mode: "created",
      email,
      nombre,
      role: "ADMIN",
      activo: true,
    });
    return;
  }

  await db.execute(
    `UPDATE users
     SET password_hash = ?, role = 'ADMIN', activo = 1
     WHERE id = ?`,
    [buildPasswordHash(passwordArg), String(user.id)],
  );
  await invalidateUserSessions(db, String(user.id));
  await logMaintenanceEvent(db, {
    action: "maintenance_recover_admin",
    userId: String(user.id),
    summary: `ADMIN recuperado por mantenimiento: ${email}`,
  });

  printResult(context, {
    action: "recover-admin",
    mode: "updated",
    email,
    nombre: String(user.nombre),
    previousRole: String(user.role),
    role: "ADMIN",
    activo: true,
    sessionsInvalidated: true,
  });
}

async function setRole(flags, emailArg, roleArg) {
  if (!emailArg || !roleArg) {
    throw new Error("Uso: npm run users:set-role -- [--local|--remote] <email> <ADMIN|OPERADOR|GESTOR_FINANCIERO|CLIENTE>");
  }

  const role = roleArg.trim().toUpperCase();
  if (!VALID_ROLES.has(role)) {
    throw new Error("Rol no valido. Usa: ADMIN, OPERADOR, GESTOR_FINANCIERO o CLIENTE.");
  }

  const context = getDatabase(flags);
  const { db } = context;
  const email = sanitizeEmail(emailArg);
  const result = await db.execute(
    `SELECT id, nombre, email, role, activo
     FROM users
     WHERE email = ?`,
    [email],
  );
  const user = result.rows[0];

  if (!user) {
    throw new Error(`No existe ningun usuario con email ${email}.`);
  }

  if (String(user.role) === "ADMIN" && role !== "ADMIN" && Number(user.activo) === 1 && (await countActiveAdmins(db)) <= 1) {
    throw new Error("No puedes dejar la app sin ningun ADMIN activo.");
  }

  await db.execute(
    `UPDATE users
     SET role = ?
     WHERE id = ?`,
    [role, String(user.id)],
  );

  await logMaintenanceEvent(db, {
    action: "maintenance_set_role",
    userId: String(user.id),
    summary: `Rol cambiado por mantenimiento para ${email}: ${String(user.role)} -> ${role}`,
  });

  printResult(context, {
    action: "set-role",
    email,
    nombre: String(user.nombre),
    previousRole: String(user.role),
    role,
    activo: Number(user.activo) === 1,
  });
}

function listRoles() {
  console.log(
    JSON.stringify(
      {
        action: "list-roles",
        roles: [
          { role: "ADMIN", description: "Acceso total y gestion de usuarios." },
          { role: "OPERADOR", description: "Operacion, fabricacion, stock tecnico y solicitudes de compra." },
          { role: "GESTOR_FINANCIERO", description: "Clientes, pedidos, costes, facturas, pagos y compras." },
          { role: "CLIENTE", description: "Acceso limitado a sus propios pedidos/facturas." },
        ],
      },
      null,
      2,
    ),
  );
}

async function main() {
  const [, , command, ...rawArgs] = process.argv;
  const { flags, args } = parseArgs(rawArgs);

  if (command === "list") {
    await listUsers(flags);
    return;
  }

  if (command === "roles") {
    listRoles();
    return;
  }

  if (command === "reset-password") {
    await resetPassword(flags, args[0], args[1]);
    return;
  }

  if (command === "promote-admin") {
    await promoteAdmin(flags, args[0]);
    return;
  }

  if (command === "create-admin") {
    await createAdmin(flags, args[0], args[1], args[2]);
    return;
  }

  if (command === "recover-admin") {
    await recoverAdmin(flags, args[0], args[1], args[2]);
    return;
  }

  if (command === "set-role") {
    await setRole(flags, args[0], args[1]);
    return;
  }

  throw new Error(
    "Comando no valido. Usa: list | roles | reset-password <email> <password> | promote-admin <email> | create-admin <email> <password> [nombre] | recover-admin <email> <password> [nombre] | set-role <email> <rol>. Anade --local o --remote si quieres forzar destino.",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
