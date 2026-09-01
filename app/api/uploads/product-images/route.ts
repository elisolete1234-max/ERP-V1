import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const PRODUCTS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "products");
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildUniqueFileName(baseName: string, extension: string) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const unique = randomUUID().slice(0, 8);
  const safeBase = slugify(baseName) || "producto";
  let fileName = `${safeBase}-${stamp}-${unique}${extension}`;
  let targetPath = path.join(PRODUCTS_DIR, fileName);

  while (await pathExists(targetPath)) {
    fileName = `${safeBase}-${stamp}-${randomUUID().slice(0, 8)}${extension}`;
    targetPath = path.join(PRODUCTS_DIR, fileName);
  }

  return { fileName, targetPath };
}

export async function POST(request: Request) {
  try {
    await requirePermission("product:editTechnical");

    const formData = await request.formData();
    const file = formData.get("file");
    const productName = String(formData.get("productName") ?? "producto");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecciona una imagen valida." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "La imagen esta vacia." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "La imagen supera el limite de 5 MB." }, { status: 400 });
    }

    const originalExtension = path.extname(file.name).toLowerCase();
    const mimeExtension = allowedTypes.get(file.type);

    if (!mimeExtension || !allowedExtensions.has(originalExtension)) {
      return NextResponse.json({ error: "Formato no permitido. Usa JPG, PNG o WEBP." }, { status: 400 });
    }

    const extension = originalExtension === ".jpeg" ? ".jpg" : mimeExtension;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { fileName, targetPath } = await buildUniqueFileName(productName, extension);
    const resolvedTarget = path.resolve(targetPath);
    const resolvedProductsDir = path.resolve(PRODUCTS_DIR);

    if (!resolvedTarget.startsWith(`${resolvedProductsDir}${path.sep}`)) {
      return NextResponse.json({ error: "Ruta de destino no valida." }, { status: 400 });
    }

    await mkdir(PRODUCTS_DIR, { recursive: true });

    // Local dev writes to public/products. In production on Vercel, replace this
    // block with Cloudinary, Supabase Storage, S3 or UploadThing persistence.
    await writeFile(resolvedTarget, bytes, { flag: "wx" });

    return NextResponse.json({ path: `/products/${fileName}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo subir la imagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
