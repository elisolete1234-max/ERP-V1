import { randomUUID } from "node:crypto";
import { rows, run } from "./db";

export type PublicStoreProduct = {
  id: string;
  codigo: string;
  nombre: string;
  descripcionPublica: string;
  imagenUrl: string | null;
  pvp: number;
  categoriaPublica: string;
  destacado: boolean;
  galeriaImagenes: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function ensureMax(value: string, max: number, label: string) {
  if (value.length > max) {
    throw new Error(`${label} supera el maximo permitido (${max}).`);
  }
}

export async function createPublicQuoteRequest(input: {
  nombre: string;
  email: string;
  telefono?: string;
  servicio?: string;
  material?: string;
  cantidad?: string;
  mensaje: string;
}) {
  const nombre = normalizeText(input.nombre);
  const email = normalizeText(input.email).toLowerCase();
  const telefono = normalizeText(input.telefono ?? "");
  const servicio = normalizeText(input.servicio ?? "");
  const material = normalizeText(input.material ?? "");
  const cantidad = normalizeText(input.cantidad ?? "");
  const mensaje = normalizeText(input.mensaje);

  if (!nombre || !email || !mensaje) {
    throw new Error("Debes completar nombre, email y detalles para solicitar presupuesto.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("El email no tiene un formato valido.");
  }

  ensureMax(nombre, 120, "El nombre");
  ensureMax(email, 160, "El email");
  ensureMax(telefono, 40, "El telefono");
  ensureMax(servicio, 80, "El servicio");
  ensureMax(material, 80, "El material");
  ensureMax(cantidad, 30, "La cantidad");
  ensureMax(mensaje, 4000, "El mensaje");

  await run(
    `INSERT INTO public_quote_requests
      (id, nombre, email, telefono, servicio, material, cantidad, mensaje, estado, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nombre,
    email,
    telefono || null,
    servicio || null,
    material || null,
    cantidad || null,
    mensaje,
    "NUEVA",
    nowIso(),
  );
}

export async function getPublicStoreProducts() {
  const products = await rows<{
    id: string;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    descripcion_publica: string | null;
    imagen_url: string | null;
    galeria_imagenes: string | null;
    pvp: number;
    categoria_publica: string | null;
    destacado: number;
  }>(
    `SELECT id, codigo, nombre, descripcion, descripcion_publica, imagen_url, galeria_imagenes, pvp, categoria_publica, destacado
     FROM products
     WHERE activo = 1
       AND visible_en_tienda = 1
     ORDER BY destacado DESC, orden_tienda ASC, nombre ASC`,
  );

  return products.map((product) => ({
    id: product.id,
    codigo: product.codigo,
    nombre: product.nombre,
    descripcionPublica: product.descripcion_publica || product.descripcion || "Producto fabricado bajo pedido con acabado cuidado.",
    imagenUrl: product.imagen_url || null,
    galeriaImagenes: parseGalleryImages(product.galeria_imagenes),
    pvp: Number(product.pvp ?? 0),
    categoriaPublica: product.categoria_publica || "Impresion 3D",
    destacado: Boolean(product.destacado),
  })) satisfies PublicStoreProduct[];
}

function parseGalleryImages(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.startsWith("/products/"));
    }
  } catch {
    return raw.split(/[\n,]+/).map((item) => item.trim()).filter((item) => item.startsWith("/products/"));
  }

  return [];
}
