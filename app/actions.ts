"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  archiveCustomer,
  archiveMaterial,
  archivePrinter,
  archiveProduct,
  collectInvoicePayment,
  completeManufacturingWorkflow,
  createCustomerRecord,
  createMaterialRecord,
  createOrderRecord,
  createInvoicePaymentRecord,
  createPrinterRecord,
  createProductRecord,
  deliverOrderWorkflow,
  confirmOrder,
  invoiceOrderWorkflow,
  processOrder,
  restockMaterial,
  restockFinishedProduct,
  retryOrderAfterRestock,
  setCustomerActiveState,
  setMaterialActiveState,
  setPrinterActiveState,
  setProductActiveState,
  unarchiveCustomer,
  unarchiveMaterial,
  unarchivePrinter,
  unarchiveProduct,
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

function asDefaultNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = asOptionalNumber(value);
  return parsed ?? fallback;
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
  tone: "success" | "warn" | "error" = "success",
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
  let resolvedMessage = successMessage;
  let resolvedTone: "success" | "warn" = "success";

  try {
    const result = await task();
    if (result && typeof result === "object") {
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        resolvedMessage = result.message.trim();
      }
      if ("tone" in result && (result.tone === "success" || result.tone === "warn")) {
        resolvedTone = result.tone;
      }
    }
    revalidatePath("/");
  } catch (error) {
    unstable_rethrow(error);
    errorMessage =
      error instanceof Error ? error.message : "Ha ocurrido un error inesperado.";
  }

  if (errorMessage) {
    redirectWithMessage(errorMessage, "error", successPath);
  }

  redirectWithMessage(resolvedMessage, resolvedTone, successPath);
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

export async function toggleCustomerActiveAction(formData: FormData) {
  const customerId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setCustomerActiveState(customerId, active),
    active ? "Cliente desarchivado." : "Cliente archivado.",
    "/?section=clientes",
  );
}

export async function archiveClienteAction(formData: FormData) {
  const customerId = asString(formData.get("id"));
  await executeAndRefresh(() => archiveCustomer(customerId), "Cliente archivado.", "/?section=clientes");
}

export async function unarchiveClienteAction(formData: FormData) {
  const customerId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchiveCustomer(customerId), "Cliente desarchivado.", "/?section=clientes");
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
        precioKg: asOptionalNumber(formData.get("precioKg")),
        stockActualG: asOptionalNumber(formData.get("stockActualG")),
        stockMinimoG: asOptionalNumber(formData.get("stockMinimoG")),
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
        precioKg: asOptionalNumber(formData.get("precioKg")),
        stockActualG: asOptionalNumber(formData.get("stockActualG")),
        stockMinimoG: asOptionalNumber(formData.get("stockMinimoG")),
        proveedor: asString(formData.get("proveedor")),
        notas: asString(formData.get("notas")),
      }),
    "Material actualizado.",
    "/?section=materiales",
  );
}

export async function toggleMaterialActiveAction(formData: FormData) {
  const materialId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setMaterialActiveState(materialId, active),
    active ? "Material desarchivado." : "Material archivado.",
    "/?section=materiales",
  );
}

export async function archiveMaterialAction(formData: FormData) {
  const materialId = asString(formData.get("id"));
  await executeAndRefresh(() => archiveMaterial(materialId), "Material archivado.", "/?section=materiales");
}

export async function unarchiveMaterialAction(formData: FormData) {
  const materialId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchiveMaterial(materialId), "Material desarchivado.", "/?section=materiales");
}

export async function deleteMaterialAction() {
  await executeAndRefresh(
    () => Promise.reject(new Error("El borrado fisico esta deshabilitado. Archiva el material para retirarlo del uso diario.")),
    "Accion no disponible.",
    "/?section=materiales&materialFilter=ALL",
  );
}

export async function createProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createProductRecord({
        nombre: asString(formData.get("nombre")),
        descripcion: asString(formData.get("descripcion")),
        enlaceModelo: asString(formData.get("enlaceModelo")),
        gramosEstimados: asOptionalNumber(formData.get("gramosEstimados")),
        tiempoImpresionHoras: asOptionalNumber(formData.get("tiempoImpresionHoras")),
        costeElectricidad: asOptionalNumber(formData.get("costeElectricidad")),
        costeMaquina: asOptionalNumber(formData.get("costeMaquina")),
        costeManoObra: asOptionalNumber(formData.get("costeManoObra")),
        costePostprocesado: asOptionalNumber(formData.get("costePostprocesado")),
        margen: asOptionalNumber(formData.get("margen")),
        pvp: asOptionalNumber(formData.get("pvp")),
        ivaPorcentaje: asOptionalNumber(formData.get("ivaPorcentaje")),
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
        gramosEstimados: asOptionalNumber(formData.get("gramosEstimados")),
        tiempoImpresionHoras: asOptionalNumber(formData.get("tiempoImpresionHoras")),
        costeElectricidad: asOptionalNumber(formData.get("costeElectricidad")),
        costeMaquina: asOptionalNumber(formData.get("costeMaquina")),
        costeManoObra: asOptionalNumber(formData.get("costeManoObra")),
        costePostprocesado: asOptionalNumber(formData.get("costePostprocesado")),
        margen: asOptionalNumber(formData.get("margen")),
        pvp: asOptionalNumber(formData.get("pvp")),
        ivaPorcentaje: asOptionalNumber(formData.get("ivaPorcentaje")),
        materialId: asString(formData.get("materialId")),
        activo: formData.get("activo") === "on",
      }),
    "Producto actualizado.",
    "/?section=productos",
  );
}

export async function toggleProductActiveAction(formData: FormData) {
  const productId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setProductActiveState(productId, active),
    active ? "Producto desarchivado." : "Producto archivado.",
    "/?section=productos",
  );
}

export async function archiveProductoAction(formData: FormData) {
  const productId = asString(formData.get("id"));
  await executeAndRefresh(() => archiveProduct(productId), "Producto archivado.", "/?section=productos");
}

export async function unarchiveProductoAction(formData: FormData) {
  const productId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchiveProduct(productId), "Producto desarchivado.", "/?section=productos");
}

export async function createOrderAction(formData: FormData) {
  const lines = [1, 2, 3]
    .map((index) => ({
      productId: asString(formData.get(`producto_${index}`)),
      quantity: asDefaultNumber(formData.get(`cantidad_${index}`)),
      unitPrice: asOptionalNumber(formData.get(`precio_${index}`)),
    }))
    .filter((line) => line.productId && line.quantity > 0);

  await executeAndRefresh(
    () =>
      createOrderRecord({
        clienteId: asString(formData.get("clienteId")),
        observaciones: asString(formData.get("observaciones")),
        descuento: asDefaultNumber(formData.get("descuento")),
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
      quantity: asDefaultNumber(formData.get(`cantidad_${index}`)),
      unitPrice: asOptionalNumber(formData.get(`precio_${index}`)),
    }))
    .filter((line) => line.productId && line.quantity > 0);

  await executeAndRefresh(
    () =>
      updateOrderRecord({
        id: asString(formData.get("id")),
        clienteId: asString(formData.get("clienteId")),
        observaciones: asString(formData.get("observaciones")),
        estado: asString(formData.get("estado")),
        descuento: asDefaultNumber(formData.get("descuento")),
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

export async function processOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => processOrder(asString(formData.get("pedidoId"))),
    "Pedido procesado.",
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
    () => completeManufacturingWorkflow(asString(formData.get("fabricacionId"))),
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
        tiempoRealHoras: asOptionalNumber(formData.get("tiempoRealHoras")),
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
        horasUsoAcumuladas: asOptionalNumber(formData.get("horasUsoAcumuladas")),
        costeHora: asOptionalNumber(formData.get("costeHora")),
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
        horasUsoAcumuladas: asOptionalNumber(formData.get("horasUsoAcumuladas")),
        costeHora: asOptionalNumber(formData.get("costeHora")),
        ubicacion: asString(formData.get("ubicacion")),
      }),
    "Impresora actualizada.",
    "/?section=impresoras",
  );
}

export async function togglePrinterActiveAction(formData: FormData) {
  const printerId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setPrinterActiveState(printerId, active),
    active ? "Impresora desarchivada." : "Impresora archivada.",
    "/?section=impresoras",
  );
}

export async function archiveImpresoraAction(formData: FormData) {
  const printerId = asString(formData.get("id"));
  await executeAndRefresh(() => archivePrinter(printerId), "Impresora archivada.", "/?section=impresoras");
}

export async function unarchiveImpresoraAction(formData: FormData) {
  const printerId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchivePrinter(printerId), "Impresora desarchivada.", "/?section=impresoras");
}

export async function restockFinishedProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      restockFinishedProduct(
        asString(formData.get("productId")),
        asNumber(formData.get("cantidad")),
        asString(formData.get("motivo")) || "Entrada manual de producto terminado",
        asString(formData.get("ubicacion")),
        asOptionalNumber(formData.get("costeUnitario")),
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
    () => deliverOrderWorkflow(asString(formData.get("pedidoId"))),
    "Pedido entregado.",
    "/?section=pedidos",
  );
}

export async function generateInvoiceAction(formData: FormData) {
  await executeAndRefresh(
    () => invoiceOrderWorkflow(asString(formData.get("pedidoId"))),
    "Factura generada.",
    "/?section=facturas",
  );
}

export async function collectInvoicePaymentAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      collectInvoicePayment(
        asString(formData.get("facturaId")),
        (asString(formData.get("metodoPago")) || "TRANSFERENCIA") as
          | "EFECTIVO"
          | "TRANSFERENCIA"
          | "TARJETA"
          | "BIZUM"
          | "PAYPAL"
          | "OTRO",
      ),
    "Factura cobrada.",
    "/?section=facturas",
  );
}

export async function updateInvoiceAction(formData: FormData) {
  const discountValue = asString(formData.get("descuento"));
  await executeAndRefresh(
    () =>
      updateInvoiceRecord({
        id: asString(formData.get("id")),
        estadoPago: asString(formData.get("estadoPago")) || undefined,
        descuento: discountValue ? asDefaultNumber(formData.get("descuento")) : undefined,
      }),
    "Factura actualizada.",
    "/?section=facturas",
  );
}

export async function registerInvoicePaymentAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createInvoicePaymentRecord({
        facturaId: asString(formData.get("facturaId")),
        fechaPago: asString(formData.get("fechaPago")) || undefined,
        metodoPago: asString(formData.get("metodoPago")),
        importe: asNumber(formData.get("importe")),
        notas: asString(formData.get("notas")),
      }),
    "Pago registrado correctamente.",
    "/?section=facturas",
  );
}
