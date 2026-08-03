import { createClient } from "@libsql/client";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PASSWORD_KEYLEN = 64;

function getDatabasePath() {
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "fabriq-erp.db");
}

function getDatabase() {
  return createClient({
    url: pathToFileURL(getDatabasePath()).toString(),
    intMode: "number",
  });
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

async function listUsers() {
  const db = getDatabase();
  const users = await getUsers(db);
  console.log(JSON.stringify(users.map((user) => ({
    nombre: user.nombre,
    email: user.email,
    role: user.role,
    activo: user.activo,
    creadoEn: user.creadoEn,
  })), null, 2));
}

async function resetPassword(emailArg, passwordArg) {
  if (!emailArg || !passwordArg) {
    throw new Error("Uso: npm run users:reset-password -- <email> <NuevaPassword123>");
  }

  const db = getDatabase();
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

  console.log(
    JSON.stringify(
      {
        action: "reset-password",
        email,
        nombre: String(user.nombre),
        role: String(user.role),
        activo: Number(user.activo) === 1,
      },
      null,
      2,
    ),
  );
}

async function promoteAdmin(emailArg) {
  if (!emailArg) {
    throw new Error("Uso: npm run users:promote-admin -- <email>");
  }

  const db = getDatabase();
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

  console.log(
    JSON.stringify(
      {
        action: "promote-admin",
        email,
        nombre: String(user.nombre),
        role: "ADMIN",
        activo: true,
      },
      null,
      2,
    ),
  );
}

async function createAdmin(emailArg, passwordArg, nameArg) {
  if (!emailArg || !passwordArg) {
    throw new Error("Uso: npm run users:create-admin -- <email> <NuevaPassword123> [Nombre]");
  }

  const db = getDatabase();
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

  console.log(
    JSON.stringify(
      {
        action: "create-admin",
        email,
        nombre,
        role: "ADMIN",
        activo: true,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (command === "list") {
    await listUsers();
    return;
  }

  if (command === "reset-password") {
    await resetPassword(args[0], args[1]);
    return;
  }

  if (command === "promote-admin") {
    await promoteAdmin(args[0]);
    return;
  }

  if (command === "create-admin") {
    await createAdmin(args[0], args[1], args[2]);
    return;
  }

  throw new Error(
    "Comando no valido. Usa: list | reset-password <email> <password> | promote-admin <email> | create-admin <email> <password> [nombre]",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
