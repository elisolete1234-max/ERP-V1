"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Image from "next/image";

type ProductImagePreviewProps = {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-11 w-11",
  md: "h-20 w-20",
  lg: "h-full w-full",
};

function isPublicProductPath(value?: string | null) {
  return Boolean(value && value.trim().startsWith("/products/"));
}

export function parseProductGallery(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(isPublicProductPath);
    }
  } catch {
    // Plain text gallery: one path per line, or comma-separated.
  }

  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(isPublicProductPath);
}

export function ProductImagePreview({ src, alt, size = "md", className = "" }: ProductImagePreviewProps) {
  const [failedSrc, setFailedSrc] = useState("");
  const validSrc = isPublicProductPath(src) ? src?.trim() : "";

  if (!validSrc || failedSrc === validSrc) {
    return (
      <div
        className={`${sizeClasses[size]} grid flex-none place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500 ${className}`.trim()}
        aria-label="Sin imagen"
      >
        3D
      </div>
    );
  }

  return (
    <Image
      src={validSrc}
      alt={alt}
      width={size === "lg" ? 640 : size === "md" ? 96 : 48}
      height={size === "lg" ? 480 : size === "md" ? 96 : 48}
      className={`${sizeClasses[size]} flex-none rounded-lg border border-slate-200 bg-slate-100 object-cover ${className}`.trim()}
      onError={() => setFailedSrc(validSrc)}
    />
  );
}

export function ProductImageFields({
  formId,
  imagenUrl,
  galeriaImagenes,
  productName,
}: {
  formId?: string;
  imagenUrl?: string | null;
  galeriaImagenes?: string | null;
  productName?: string;
}) {
  const [mainImage, setMainImage] = useState(imagenUrl ?? "");
  const [galleryText, setGalleryText] = useState(galeriaImagenes ?? "");
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const galleryImages = useMemo(() => parseProductGallery(galleryText).slice(0, 6), [galleryText]);

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("productName", productName || "producto");

    const response = await fetch("/api/uploads/product-images", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as { path?: string; error?: string };

    if (!response.ok || !payload.path) {
      throw new Error(payload.error || "No se pudo subir la imagen.");
    }

    return payload.path;
  }

  async function handleMainUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingMain(true);
    setUploadError(null);
    try {
      const path = await uploadImage(file);
      setMainImage(path);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setUploadingMain(false);
      event.target.value = "";
    }
  }

  async function handleGalleryUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setUploadingGallery(true);
    setUploadError(null);
    try {
      const uploadedPaths = [];
      for (const file of files) {
        uploadedPaths.push(await uploadImage(file));
      }
      const nextGallery = Array.from(new Set([...parseProductGallery(galleryText), ...uploadedPaths]));
      setGalleryText(JSON.stringify(nextGallery, null, 2));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "No se pudieron subir las imagenes.");
    } finally {
      setUploadingGallery(false);
      event.target.value = "";
    }
  }

  function removeGalleryImage(path: string) {
    const nextGallery = parseProductGallery(galleryText).filter((item) => item !== path);
    setGalleryText(nextGallery.length > 0 ? JSON.stringify(nextGallery, null, 2) : "");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Imagenes del producto</p>
      <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
        Guarda las imagenes en public/products/ y escribe aqui la ruta, por ejemplo /products/figura.jpg
      </p>
      <div className="mt-3 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            <span>Imagen principal</span>
            <input
              form={formId}
              name="imagenUrl"
              value={mainImage}
              onChange={(event) => setMainImage(event.target.value)}
              placeholder="/products/rey-ajedrez.jpg"
              className="input"
            />
          </label>
          <div className="grid gap-1 text-sm font-semibold text-slate-700">
            <span>Vista previa</span>
            <ProductImagePreview src={mainImage} alt="Vista previa del producto" size="md" />
          </div>
        </div>

        <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50">
          <span>{uploadingMain ? "Subiendo..." : "Subir imagen"}</span>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploadingMain || uploadingGallery}
            onChange={handleMainUpload}
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          <span>Galeria de imagenes</span>
          <textarea
            form={formId}
            name="galeriaImagenes"
            value={galleryText}
            onChange={(event) => setGalleryText(event.target.value)}
            rows={3}
            className="input"
            placeholder={"/products/rey-1.jpg\n/products/rey-2.jpg"}
          />
        </label>

        <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50">
          <span>{uploadingGallery ? "Subiendo..." : "Anadir imagenes"}</span>
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploadingMain || uploadingGallery}
            onChange={handleGalleryUpload}
          />
        </label>

        {uploadError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {uploadError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {galleryImages.length > 0 ? (
            galleryImages.map((path) => (
              <div key={path} className="relative">
                <ProductImagePreview src={path} alt="Miniatura de galeria" size="sm" />
                <button
                  type="button"
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white shadow"
                  onClick={() => removeGalleryImage(path)}
                  aria-label="Quitar imagen"
                  title="Quitar imagen"
                >
                  x
                </button>
              </div>
            ))
          ) : (
            <ProductImagePreview alt="Galeria sin imagenes" size="sm" />
          )}
        </div>
      </div>
    </div>
  );
}
