"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  completeManufacturingOrder,
  createCustomerRecord,
  createMaterialRecord,
  createOrderRecord,
  createPrinterRecord,
  createProductRecord,
  deliverOrder,
  generateInvoiceForOrder,
  confirmOrder,
  restockMaterial,
  restockFinishedProduct,
  retryOrderAfterRestock,
  updateCustomerRecord,
  updateFinishedInventoryRecord,
  updateInvoiceRecord,
  updateManufacturingOrderRecord,
  updateMaterialRecord,
  updateOrderRecord,
  updatePrinterRecord,
  updateProductRecord,
} from "@/lib/erp-service";

function asString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function asNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asOptionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }

  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function redirectWithMessage(
  message: string,
  tone: "success" | "error" = "success",
  path = "/",
) {
  const [baseWithQuery, hash = ""] = path.split("#");
  const separator = baseWithQuery.includes("?") ? "&" : "?";
  const url = `${baseWithQuery}${separator}message=${encodeURIComponent(message)}&tone=${tone}`;
  redirect(hash ? `${url}#${hash}` : url);
}

async function executeAndRefresh(
  task: () => unknown | Promise<unknown>,
  successMessage: string,
  successPath = "/",
) {
  let errorMessage: string | null = null;

  try {
    await task();
    revalidatePath("/");
  } catch (error) {
    unstable_rethrow(error);
    errorMessage =
      error instanceof Error ? error.message : "Ha ocurrido un error inesperado.";
  }

  if (errorMessage) {
    redirectWithMessage(errorMessage, "error", successPath);
  }

  redirectWithMessage(successMessage, "success", successPath);
}

export async function createCustomerAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createCustomerRecord({
        nombre: asString(formData.get("nombre")),
        telefono: asString(formData.get("telefono")),
        email: asString(formData.get("email")),
        direccion: asString(formData.get("direccion")),
      }),
    "Cliente creado correctamente.",
    "/?section=clientes",
  );
}

export async function updateCustomerAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateCustomerRecord({
        id: asString(formData.get("id")),
        nombre: asString(formData.get("nombre")),
        telefono: asString(formData.get("telefono")),
        email: asString(formData.get("email")),
        direccion: asString(formData.get("direccion")),
      }),
    "Cliente actualizado.",
    "/?section=clientes",
  );
}

export async function createMaterialAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createMaterialRecord({
        nombre: asString(formData.get("nombre")),
        marca: asString(formData.get("marca")),
        tipo: asString(formData.get("tipo")),
        color: asString(formData.get("color")),
        tipoColor: asString(formData.get("tipoColor")),
        efecto: asString(formData.get("efecto")),
        colorBase: asString(formData.get("colorBase")),
        nombreComercial: asString(formData.get("nombreComercial")),
        diametroMm: asOptionalNumber(formData.get("diametroMm")),
        pesoSpoolG: asOptionalNumber(formData.get("pesoSpoolG")),
        tempExtrusor: asOptionalNumber(formData.get("tempExtrusor")),
        tempCama: asOptionalNumber(formData.get("tempCama")),
        precioKg: asNumber(formData.get("precioKg")),
        stockActualG: asNumber(formData.get("stockActualG")),
        stockMinimoG: asNumber(formData.get("stockMinimoG")),
        proveedor: asString(formData.get("proveedor")),
        notas: asString(formData.get("notas")),
      }),
    "Material creado correctamente.",
    "/?section=materiales",
  );
}

export async function updateMaterialAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateMaterialRecord({
        id: asString(formData.get("id")),
        nombre: asString(formData.get("nombre")),
        marca: asString(formData.get("marca")),
        tipo: asString(formData.get("tipo")),
        color: asString(formData.get("color")),
        tipoColor: asString(formData.get("tipoColor")),
        efecto: asString(formData.get("efecto")),
        colorBase: asString(formData.get("colorBase")),
        nombreComercial: asString(formData.get("nombreComercial")),
        diametroMm: asOptionalNumber(formData.get("diametroMm")),
        pesoSpoolG: asOptionalNumber(formData.get("pesoSpoolG")),
        tempExtrusor: asOptionalNumber(formData.get("tempExtrusor")),
        tempCama: asOptionalNumber(formData.get("tempCama")),
        precioKg: asNumber(formData.get("precioKg")),
        stockActualG: asNumber(formData.get("stockActualG")),
        stockMinimoG: asNumber(formData.get("stockMinimoG")),
        proveedor: asString(formData.get("proveedor")),
        notas: asString(formData.get("notas")),
      }),
    "Material actualizado.",
    "/?section=materiales",
  );
}

export async function createProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createProductRecord({
        nombre: asString(formData.get("nombre")),
        descripcion: asString(formData.get("descripcion")),
        enlaceModelo: asString(formData.get("enlaceModelo")),
        gramosEstimados: asNumber(formData.get("gramosEstimados")),
        tiempoImpresionHoras: asNumber(formData.get("tiempoImpresionHoras")),
        costeElectricidad: asNumber(formData.get("costeElectricidad")),
        costeMaquina: asOptionalNumber(formData.get("costeMaquina")),
        costeManoObra: asOptionalNumber(formData.get("costeManoObra")),
        costePostprocesado: asOptionalNumber(formData.get("costePostprocesado")),
        margen: asNumber(formData.get("margen")),
        pvp: asNumber(formData.get("pvp")),
        materialId: asString(formData.get("materialId")),
        activo: formData.get("activo") === "on",
      }),
    "Producto creado correctamente.",
    "/?section=productos",
  );
}

export async function updateProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateProductRecord({
        id: asString(formData.get("id")),
        nombre: asString(formData.get("nombre")),
        descripcion: asString(formData.get("descripcion")),
        enlaceModelo: asString(formData.get("enlaceModelo")),
        gramosEstimados: asNumber(formData.get("gramosEstimados")),
        tiempoImpresionHoras: asNumber(formData.get("tiempoImpresionHoras")),
        costeElectricidad: asNumber(formData.get("costeElectricidad")),
        costeMaquina: asOptionalNumber(formData.get("costeMaquina")),
        costeManoObra: asOptionalNumber(formData.get("costeManoObra")),
        costePostprocesado: asOptionalNumber(formData.get("costePostprocesado")),
        margen: asNumber(formData.get("margen")),
        pvp: asNumber(formData.get("pvp")),
        materialId: asString(formData.get("materialId")),
        activo: formData.get("activo") === "on",
      }),
    "Producto actualizado.",
    "/?section=productos",
  );
}

export async function createOrderAction(formData: FormData) {
  const lines = [1, 2, 3]
    .map((index) => ({
      productId: asString(formData.get(`producto_${index}`)),
      quantity: asNumber(formData.get(`cantidad_${index}`)),
      unitPrice: asNumber(formData.get(`precio_${index}`)) || undefined,
    }))
    .filter((line) => line.productId && line.quantity > 0);

  await executeAndRefresh(
    () =>
      createOrderRecord({
        clienteId: asString(formData.get("clienteId")),
        observaciones: asString(formData.get("observaciones")),
        lines,
      }),
    "Pedido creado en borrador.",
    "/?section=pedidos",
  );
}

export async function updateOrderAction(formData: FormData) {
  const lines = [1, 2, 3]
    .map((index) => ({
      productId: asString(formData.get(`producto_${index}`)),
      quantity: asNumber(formData.get(`cantidad_${index}`)),
      unitPrice: asNumber(formData.get(`precio_${index}`)) || undefined,
    }))
    .filter((line) => line.productId && line.quantity > 0);

  await executeAndRefresh(
    () =>
      updateOrderRecord({
        id: asString(formData.get("id")),
        clienteId: asString(formData.get("clienteId")),
        observaciones: asString(formData.get("observaciones")),
        estado: asString(formData.get("estado")),
        lines,
      }),
    "Pedido actualizado.",
    "/?section=pedidos",
  );
}

export async function confirmOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => confirmOrder(asString(formData.get("pedidoId"))),
    "Pedido confirmado o marcado con incidencia según stock.",
    "/?section=pedidos",
  );
}

export async function retryOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => retryOrderAfterRestock(asString(formData.get("pedidoId"))),
    "Pedido revalidado tras la reposición.",
    "/?section=pedidos",
  );
}

export async function startManufacturingAction(formData: FormData) {
  await executeAndRefresh(
    () => confirmAndStart(formData),
    "Fabricación iniciada.",
    "/?section=fabricacion",
  );
}

async function confirmAndStart(formData: FormData) {
  const manufacturingOrderId = asString(formData.get("fabricacionId"));
  if (!manufacturingOrderId) {
    throw new Error("Debes seleccionar una orden de fabricación.");
  }

  const { startManufacturingOrder } = await import("@/lib/erp-service");
  await startManufacturingOrder(manufacturingOrderId);
}

export async function completeManufacturingAction(formData: FormData) {
  await executeAndRefresh(
    () => completeManufacturingOrder(asString(formData.get("fabricacionId"))),
    "Fabricación completada y stock descontado.",
    "/?section=fabricacion",
  );
}

export async function updateManufacturingAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateManufacturingOrderRecord({
        id: asString(formData.get("id")),
        estado: asString(formData.get("estado")),
        cantidad: asNumber(formData.get("cantidad")),
        tiempoRealHoras: asNumber(formData.get("tiempoRealHoras")),
        incidencia: asString(formData.get("incidencia")),
      }),
    "Orden de fabricacion actualizada.",
    "/?section=fabricacion",
  );
}

export async function restockMaterialAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      restockMaterial(
        asString(formData.get("materialId")),
        asNumber(formData.get("cantidadG")),
        asString(formData.get("motivo")) || "Reposición manual",
      ),
    "Reposición registrada.",
    "/?section=stock",
  );
}

export async function createPrinterAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createPrinterRecord({
        nombre: asString(formData.get("nombre")),
        estado: (asString(formData.get("estado")) || "LIBRE") as "LIBRE" | "IMPRIMIENDO" | "MANTENIMIENTO",
        horasUsoAcumuladas: asNumber(formData.get("horasUsoAcumuladas")),
        costeHora: asNumber(formData.get("costeHora")),
        ubicacion: asString(formData.get("ubicacion")),
      }),
    "Impresora creada correctamente.",
    "/?section=impresoras",
  );
}

export async function updatePrinterAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updatePrinterRecord({
        id: asString(formData.get("id")),
        nombre: asString(formData.get("nombre")),
        estado: (asString(formData.get("estado")) || "LIBRE") as "LIBRE" | "IMPRIMIENDO" | "MANTENIMIENTO",
        horasUsoAcumuladas: asNumber(formData.get("horasUsoAcumuladas")),
        costeHora: asNumber(formData.get("costeHora")),
        ubicacion: asString(formData.get("ubicacion")),
      }),
    "Impresora actualizada.",
    "/?section=impresoras",
  );
}

export async function restockFinishedProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      restockFinishedProduct(
        asString(formData.get("productId")),
        asNumber(formData.get("cantidad")),
        asString(formData.get("motivo")) || "Entrada manual de producto terminado",
        asString(formData.get("ubicacion")),
        asNumber(formData.get("costeUnitario")) || undefined,
      ),
    "Entrada de producto terminado registrada.",
    "/?section=productos-terminados",
  );
}

export async function updateFinishedInventoryAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateFinishedInventoryRecord({
        id: asString(formData.get("id")),
        cantidadDisponible: asNumber(formData.get("cantidadDisponible")),
        ubicacion: asString(formData.get("ubicacion")),
        costeUnitario: asNumber(formData.get("costeUnitario")),
        precioVenta: asNumber(formData.get("precioVenta")),
      }),
    "Inventario de producto terminado actualizado.",
    "/?section=productos-terminados",
  );
}

export async function deliverOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => deliverOrder(asString(formData.get("pedidoId"))),
    "Pedido entregado.",
    "/?section=pedidos",
  );
}

export async function generateInvoiceAction(formData: FormData) {
  await executeAndRefresh(
    () => generateInvoiceForOrder(asString(formData.get("pedidoId"))),
    "Factura generada.",
    "/?section=facturas",
  );
}

export async function updateInvoiceAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateInvoiceRecord({
        id: asString(formData.get("id")),
        estadoPago: asString(formData.get("estadoPago")),
      }),
    "Factura actualizada.",
    "/?section=facturas",
  );
}
