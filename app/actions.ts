"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  authenticateUser,
  clearSessionCookie,
  createInitialAdmin,
  createUserRecord,
  createUserSession,
  getCurrentUser,
  invalidateUserSession,
  logAuditEvent,
  requestPasswordReset,
  resetPassword,
  readCurrentSessionToken,
  requirePermission,
  updateUserRecord,
  writeSessionCookie,
  type AppPermission,
  type AppRole,
} from "@/lib/auth";
import {
  archiveCustomer,
  archiveMaterial,
  archivePrinter,
  archiveProduct,
  collectInvoicePayment,
  completeManufacturingWorkflow,
  convertPurchaseRequestToStockEntry,
  createCustomerRecord,
  createMaterialRecord,
  createPurchaseRequestRecord,
  createStockManufacturingOrder,
  createOrderRecord,
  createInvoicePaymentRecord,
  createPrinterRecord,
  createProductRecord,
  deliverOrderWorkflow,
  confirmOrder,
  invoiceOrderWorkflow,
  markPurchaseRequestPurchased,
  processOrder,
  approvePurchaseRequest,
  rejectPurchaseRequest,
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
  cancelPurchaseRequest,
} from "@/lib/erp-service";
import { createPublicQuoteRequest } from "@/lib/public-site";

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

function maybeString(formData: FormData, key: string) {
  return formData.has(key) ? asString(formData.get(key)) : undefined;
}

function maybeOptionalNumber(formData: FormData, key: string) {
  return formData.has(key) ? asOptionalNumber(formData.get(key)) : undefined;
}

function maybeCheckbox(formData: FormData, key: string) {
  return formData.has(key) ? formData.getAll(key).some((value) => String(value) === "on") : undefined;
}

function asRole(value: FormDataEntryValue | null) {
  const role = asString(value).toUpperCase();
  if (role === "ADMIN" || role === "OPERADOR" || role === "GESTOR_FINANCIERO" || role === "CLIENTE") {
    return role as AppRole;
  }
  throw new Error("Rol de usuario no valido.");
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
  options?: {
    permission?: AppPermission;
    auditAction?: string;
    auditEntityType?: string;
    auditEntityId?: string | null;
  },
) {
  let errorMessage: string | null = null;
  let resolvedMessage = successMessage;
  let resolvedTone: "success" | "warn" = "success";
  let actor: Awaited<ReturnType<typeof getCurrentUser>> = null;

  try {
    if (options?.permission) {
      actor = await requirePermission(options.permission);
    }
    const result = await task();
    if (result && typeof result === "object") {
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        resolvedMessage = result.message.trim();
      }
      if ("tone" in result && (result.tone === "success" || result.tone === "warn")) {
        resolvedTone = result.tone;
      }
    }
    if (options?.auditAction && options.auditEntityType) {
      await logAuditEvent({
        userId: actor?.id ?? null,
        userEmail: actor?.email ?? null,
        action: options.auditAction,
        entityType: options.auditEntityType,
        entityId: options.auditEntityId ?? null,
        summary: resolvedMessage,
      });
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

export async function bootstrapAdminAction(formData: FormData) {
  try {
    const created = await createInitialAdmin({
      nombre: asString(formData.get("nombre")),
      email: asString(formData.get("email")),
      password: asString(formData.get("password")),
    });
    const token = await createUserSession(created.id);
    await writeSessionCookie(token);
    revalidatePath("/");
    redirectWithMessage("Administrador inicial creado y sesion iniciada.", "success", "/");
  } catch (error) {
    unstable_rethrow(error);
    redirectWithMessage(error instanceof Error ? error.message : "No se pudo crear el administrador inicial.", "error", "/");
  }
}

export async function loginAction(formData: FormData) {
  try {
    const user = await authenticateUser({
      email: asString(formData.get("email")),
      password: asString(formData.get("password")),
    });
    const token = await createUserSession(user.id);
    await writeSessionCookie(token);
    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      action: "login",
      entityType: "session",
      entityId: user.id,
      summary: `Inicio de sesion de ${user.email}`,
    });
    revalidatePath("/");
    redirectWithMessage(`Sesion iniciada como ${user.nombre}.`, "success", "/");
  } catch (error) {
    unstable_rethrow(error);
    redirectWithMessage(error instanceof Error ? error.message : "No se pudo iniciar sesion.", "error", "/");
  }
}

export async function logoutAction() {
  const currentUser = await getCurrentUser();
  const currentToken = await readCurrentSessionToken();
  await invalidateUserSession(currentToken);
  await clearSessionCookie();
  if (currentUser) {
    await logAuditEvent({
      userId: currentUser.id,
      userEmail: currentUser.email,
      action: "logout",
      entityType: "session",
      entityId: currentUser.id,
      summary: `Cierre de sesion de ${currentUser.email}`,
    });
  }
  revalidatePath("/");
  redirectWithMessage("Sesion cerrada.", "success", "/");
}

export async function requestPasswordResetAction(formData: FormData) {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const result = await requestPasswordReset({
      email: asString(formData.get("email")),
      requestedIp: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: headerStore.get("user-agent"),
    });
    if (result.devResetUrl) {
      console.info(`[Eli Print 3D] Enlace de recuperacion generado: ${result.devResetUrl}`);
    }
    redirectWithMessage(result.message, "success", "/?auth=recover");
  } catch (error) {
    unstable_rethrow(error);
    console.error("No se pudo solicitar recuperacion de contrasena", error);
    redirectWithMessage("No se pudo preparar la recuperacion. Revisalo en servidor.", "error", "/?auth=recover");
  }
}

export async function resetPasswordAction(formData: FormData) {
  try {
    const result = await resetPassword({
      token: asString(formData.get("token")),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });
    revalidatePath("/");
    redirectWithMessage(result.message, "success", "/");
  } catch (error) {
    unstable_rethrow(error);
    const token = encodeURIComponent(asString(formData.get("token")));
    const message = encodeURIComponent(error instanceof Error ? error.message : "No se pudo actualizar la contrasena.");
    redirect(`/reset-password?token=${token}&message=${message}&tone=error`);
  }
}

export async function createUserAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createUserRecord({
        nombre: asString(formData.get("nombre")),
        email: asString(formData.get("email")),
        password: asString(formData.get("password")),
        role: asRole(formData.get("role")),
        clienteId: asString(formData.get("clienteId")) || null,
        activo: formData.get("activo") === "on",
      }),
    "Usuario creado correctamente.",
    "/?section=usuarios",
    {
      permission: "manage_users",
      auditAction: "create_user",
      auditEntityType: "user",
    },
  );
}

export async function updateUserAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateUserRecord({
        id: asString(formData.get("id")),
        nombre: asString(formData.get("nombre")),
        email: asString(formData.get("email")),
        role: asRole(formData.get("role")),
        clienteId: asString(formData.get("clienteId")) || null,
        activo: formData.get("activo") === "on",
        password: asString(formData.get("password")) || undefined,
      }),
    "Usuario actualizado correctamente.",
    "/?section=usuarios",
    {
      permission: "manage_users",
      auditAction: "update_user",
      auditEntityType: "user",
      auditEntityId: asString(formData.get("id")),
    },
  );
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
    { permission: "create_customer", auditAction: "create_customer", auditEntityType: "customer" },
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
    {
      permission: "edit_customer",
      auditAction: "edit_customer",
      auditEntityType: "customer",
      auditEntityId: asString(formData.get("id")),
    },
  );
}

export async function toggleCustomerActiveAction(formData: FormData) {
  const customerId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setCustomerActiveState(customerId, active),
    active ? "Cliente desarchivado." : "Cliente archivado.",
    "/?section=clientes",
    {
      permission: "archive_customer",
      auditAction: active ? "unarchive_customer" : "archive_customer",
      auditEntityType: "customer",
      auditEntityId: customerId,
    },
  );
}

export async function archiveClienteAction(formData: FormData) {
  const customerId = asString(formData.get("id"));
  await executeAndRefresh(() => archiveCustomer(customerId), "Cliente archivado.", "/?section=clientes", {
    permission: "archive_customer",
    auditAction: "archive_customer",
    auditEntityType: "customer",
    auditEntityId: customerId,
  });
}

export async function unarchiveClienteAction(formData: FormData) {
  const customerId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchiveCustomer(customerId), "Cliente desarchivado.", "/?section=clientes", {
    permission: "archive_customer",
    auditAction: "unarchive_customer",
    auditEntityType: "customer",
    auditEntityId: customerId,
  });
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
    { permission: "create_material", auditAction: "create_material", auditEntityType: "material" },
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
    {
      permission: "edit_material",
      auditAction: "edit_material",
      auditEntityType: "material",
      auditEntityId: asString(formData.get("id")),
    },
  );
}

export async function toggleMaterialActiveAction(formData: FormData) {
  const materialId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setMaterialActiveState(materialId, active),
    active ? "Material desarchivado." : "Material archivado.",
    "/?section=materiales",
    {
      permission: "archive_material",
      auditAction: active ? "unarchive_material" : "archive_material",
      auditEntityType: "material",
      auditEntityId: materialId,
    },
  );
}

export async function archiveMaterialAction(formData: FormData) {
  const materialId = asString(formData.get("id"));
  await executeAndRefresh(() => archiveMaterial(materialId), "Material archivado.", "/?section=materiales", {
    permission: "archive_material",
    auditAction: "archive_material",
    auditEntityType: "material",
    auditEntityId: materialId,
  });
}

export async function unarchiveMaterialAction(formData: FormData) {
  const materialId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchiveMaterial(materialId), "Material desarchivado.", "/?section=materiales", {
    permission: "archive_material",
    auditAction: "unarchive_material",
    auditEntityType: "material",
    auditEntityId: materialId,
  });
}

export async function deleteMaterialAction() {
  await executeAndRefresh(
    () => Promise.reject(new Error("El borrado fisico esta deshabilitado. Archiva el material para retirarlo del uso diario.")),
    "Accion no disponible.",
    "/?section=materiales&materialFilter=ALL",
    { permission: "archive_material", auditAction: "delete_material_blocked", auditEntityType: "material" },
  );
}

export async function createProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createProductRecord({
        nombre: maybeString(formData, "nombre"),
        descripcion: maybeString(formData, "descripcion"),
        enlaceModelo: maybeString(formData, "enlaceModelo"),
        gramosEstimados: maybeOptionalNumber(formData, "gramosEstimados"),
        tiempoImpresionHoras: maybeOptionalNumber(formData, "tiempoImpresionHoras"),
        costeElectricidad: maybeOptionalNumber(formData, "costeElectricidad"),
        costeMaquina: maybeOptionalNumber(formData, "costeMaquina"),
        costeManoObra: maybeOptionalNumber(formData, "costeManoObra"),
        costePostprocesado: maybeOptionalNumber(formData, "costePostprocesado"),
        margen: maybeOptionalNumber(formData, "margen"),
        pvp: maybeOptionalNumber(formData, "pvp"),
        ivaPorcentaje: maybeOptionalNumber(formData, "ivaPorcentaje"),
        materialId: maybeString(formData, "materialId"),
        activo: formData.has("activo") ? formData.get("activo") === "on" : undefined,
        imagenUrl: maybeString(formData, "imagenUrl"),
        descripcionPublica: maybeString(formData, "descripcionPublica"),
        visibleEnTienda: maybeCheckbox(formData, "visibleEnTienda") ?? false,
        destacado: maybeCheckbox(formData, "destacado") ?? false,
        ordenTienda: maybeOptionalNumber(formData, "ordenTienda"),
        categoriaPublica: maybeString(formData, "categoriaPublica"),
        galeriaImagenes: maybeString(formData, "galeriaImagenes"),
      }),
    "Producto creado correctamente.",
    "/?section=productos",
    { permission: "product:create", auditAction: "create_product", auditEntityType: "product" },
  );
}

export async function updateProductAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      updateProductRecord({
        id: asString(formData.get("id")),
        nombre: maybeString(formData, "nombre"),
        descripcion: maybeString(formData, "descripcion"),
        enlaceModelo: maybeString(formData, "enlaceModelo"),
        gramosEstimados: maybeOptionalNumber(formData, "gramosEstimados"),
        tiempoImpresionHoras: maybeOptionalNumber(formData, "tiempoImpresionHoras"),
        costeElectricidad: maybeOptionalNumber(formData, "costeElectricidad"),
        costeMaquina: maybeOptionalNumber(formData, "costeMaquina"),
        costeManoObra: maybeOptionalNumber(formData, "costeManoObra"),
        costePostprocesado: maybeOptionalNumber(formData, "costePostprocesado"),
        margen: maybeOptionalNumber(formData, "margen"),
        pvp: maybeOptionalNumber(formData, "pvp"),
        ivaPorcentaje: maybeOptionalNumber(formData, "ivaPorcentaje"),
        materialId: maybeString(formData, "materialId"),
        activo: formData.has("activo") ? formData.get("activo") === "on" : undefined,
        imagenUrl: maybeString(formData, "imagenUrl"),
        descripcionPublica: maybeString(formData, "descripcionPublica"),
        visibleEnTienda: maybeCheckbox(formData, "visibleEnTienda"),
        destacado: maybeCheckbox(formData, "destacado"),
        ordenTienda: maybeOptionalNumber(formData, "ordenTienda"),
        categoriaPublica: maybeString(formData, "categoriaPublica"),
        galeriaImagenes: maybeString(formData, "galeriaImagenes"),
      }),
    "Producto actualizado.",
    "/?section=productos",
    {
      auditAction: "edit_product",
      auditEntityType: "product",
      auditEntityId: asString(formData.get("id")),
    },
  );
}

export async function toggleProductActiveAction(formData: FormData) {
  const productId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setProductActiveState(productId, active),
    active ? "Producto desarchivado." : "Producto archivado.",
    "/?section=productos",
    {
      permission: "product:archive",
      auditAction: active ? "unarchive_product" : "archive_product",
      auditEntityType: "product",
      auditEntityId: productId,
    },
  );
}

export async function archiveProductoAction(formData: FormData) {
  const productId = asString(formData.get("id"));
  await executeAndRefresh(() => archiveProduct(productId), "Producto archivado.", "/?section=productos", {
    permission: "product:archive",
    auditAction: "archive_product",
    auditEntityType: "product",
    auditEntityId: productId,
  });
}

export async function unarchiveProductoAction(formData: FormData) {
  const productId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchiveProduct(productId), "Producto desarchivado.", "/?section=productos", {
    permission: "product:archive",
    auditAction: "unarchive_product",
    auditEntityType: "product",
    auditEntityId: productId,
  });
}

export async function createPurchaseRequestAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createPurchaseRequestRecord({
        materialId: asString(formData.get("materialId")),
        cantidadSolicitada: asNumber(formData.get("cantidadSolicitada")),
        unidad: asString(formData.get("unidad")) || "g",
        motivo: asString(formData.get("motivo")),
        prioridad: asString(formData.get("prioridad")) || "NORMAL",
      }),
    "Solicitud de compra creada.",
    "/?section=solicitudes-compra",
    {
      permission: "purchaseRequest:create",
      auditAction: "create_purchase_request",
      auditEntityType: "purchase_request",
    },
  );
}

export async function approvePurchaseRequestAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      approvePurchaseRequest(asString(formData.get("requestId")), {
        observacionesRevision: asString(formData.get("observacionesRevision")),
      }),
    "Solicitud aprobada.",
    "/?section=solicitudes-compra",
    {
      permission: "purchaseRequest:approve",
      auditAction: "approve_purchase_request",
      auditEntityType: "purchase_request",
      auditEntityId: asString(formData.get("requestId")),
    },
  );
}

export async function rejectPurchaseRequestAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      rejectPurchaseRequest(asString(formData.get("requestId")), {
        observacionesRevision: asString(formData.get("observacionesRevision")),
      }),
    "Solicitud rechazada.",
    "/?section=solicitudes-compra",
    {
      permission: "purchaseRequest:reject",
      auditAction: "reject_purchase_request",
      auditEntityType: "purchase_request",
      auditEntityId: asString(formData.get("requestId")),
    },
  );
}

export async function cancelPurchaseRequestAction(formData: FormData) {
  await executeAndRefresh(
    () => cancelPurchaseRequest(asString(formData.get("requestId"))),
    "Solicitud cancelada.",
    "/?section=solicitudes-compra",
    {
      permission: "purchaseRequest:cancelOwn",
      auditAction: "cancel_purchase_request",
      auditEntityType: "purchase_request",
      auditEntityId: asString(formData.get("requestId")),
    },
  );
}

export async function markPurchaseRequestPurchasedAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      markPurchaseRequestPurchased(asString(formData.get("requestId")), {
        compraId: asString(formData.get("compraId")) || undefined,
        observacionesRevision: asString(formData.get("observacionesRevision")) || undefined,
      }),
    "Solicitud marcada como comprada.",
    "/?section=solicitudes-compra",
    {
      permission: "purchaseRequest:convertToStockEntry",
      auditAction: "mark_purchase_request_purchased",
      auditEntityType: "purchase_request",
      auditEntityId: asString(formData.get("requestId")),
    },
  );
}

export async function convertPurchaseRequestToStockEntryAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      convertPurchaseRequestToStockEntry({
        requestId: asString(formData.get("requestId")),
        cantidadG: asOptionalNumber(formData.get("cantidadG")),
        motivo: asString(formData.get("motivo")) || undefined,
        compraId: asString(formData.get("compraId")) || undefined,
      }),
    "Entrada de stock registrada desde la solicitud.",
    "/?section=solicitudes-compra",
    {
      permission: "purchaseRequest:convertToStockEntry",
      auditAction: "convert_purchase_request_to_stock",
      auditEntityType: "purchase_request",
      auditEntityId: asString(formData.get("requestId")),
    },
  );
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
    { permission: "create_order", auditAction: "create_order", auditEntityType: "order" },
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
    {
      permission: "edit_order",
      auditAction: "edit_order",
      auditEntityType: "order",
      auditEntityId: asString(formData.get("id")),
    },
  );
}

export async function confirmOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => confirmOrder(asString(formData.get("pedidoId"))),
    "Pedido confirmado o marcado con incidencia según stock.",
    "/?section=pedidos",
    {
      permission: "confirm_order",
      auditAction: "confirm_order",
      auditEntityType: "order",
      auditEntityId: asString(formData.get("pedidoId")),
    },
  );
}

export async function processOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => processOrder(asString(formData.get("pedidoId"))),
    "Pedido procesado.",
    "/?section=pedidos",
    {
      permission: "process_order",
      auditAction: "process_order",
      auditEntityType: "order",
      auditEntityId: asString(formData.get("pedidoId")),
    },
  );
}

export async function retryOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => retryOrderAfterRestock(asString(formData.get("pedidoId"))),
    "Pedido revalidado tras la reposición.",
    "/?section=pedidos",
    {
      permission: "retry_order",
      auditAction: "retry_order",
      auditEntityType: "order",
      auditEntityId: asString(formData.get("pedidoId")),
    },
  );
}

export async function startManufacturingAction(formData: FormData) {
  await executeAndRefresh(
    () => confirmAndStart(formData),
    "Fabricación iniciada.",
    "/?section=fabricacion",
    {
      permission: "start_manufacturing",
      auditAction: "start_manufacturing",
      auditEntityType: "manufacturing",
      auditEntityId: asString(formData.get("fabricacionId")),
    },
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
    {
      permission: "complete_manufacturing",
      auditAction: "complete_manufacturing",
      auditEntityType: "manufacturing",
      auditEntityId: asString(formData.get("fabricacionId")),
    },
  );
}

export async function createStockManufacturingAction(formData: FormData) {
  await executeAndRefresh(
    () =>
      createStockManufacturingOrder({
        productId: asString(formData.get("productId")),
        quantity: asNumber(formData.get("cantidad")),
        materialId: asString(formData.get("materialId")),
      }),
    "Fabricacion para stock creada.",
    "/?section=productos-terminados",
    {
      permission: "create_stock_manufacturing",
      auditAction: "create_stock_manufacturing",
      auditEntityType: "manufacturing",
    },
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
    {
      permission: "edit_manufacturing",
      auditAction: "edit_manufacturing",
      auditEntityType: "manufacturing",
      auditEntityId: asString(formData.get("id")),
    },
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
    {
      permission: "restock_material",
      auditAction: "restock_material",
      auditEntityType: "material",
      auditEntityId: asString(formData.get("materialId")),
    },
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
    { permission: "create_printer", auditAction: "create_printer", auditEntityType: "printer" },
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
    {
      permission: "edit_printer",
      auditAction: "edit_printer",
      auditEntityType: "printer",
      auditEntityId: asString(formData.get("id")),
    },
  );
}

export async function togglePrinterActiveAction(formData: FormData) {
  const printerId = asString(formData.get("id"));
  const active = asString(formData.get("active")) === "true";

  await executeAndRefresh(
    () => setPrinterActiveState(printerId, active),
    active ? "Impresora desarchivada." : "Impresora archivada.",
    "/?section=impresoras",
    {
      permission: "archive_printer",
      auditAction: active ? "unarchive_printer" : "archive_printer",
      auditEntityType: "printer",
      auditEntityId: printerId,
    },
  );
}

export async function archiveImpresoraAction(formData: FormData) {
  const printerId = asString(formData.get("id"));
  await executeAndRefresh(() => archivePrinter(printerId), "Impresora archivada.", "/?section=impresoras", {
    permission: "archive_printer",
    auditAction: "archive_printer",
    auditEntityType: "printer",
    auditEntityId: printerId,
  });
}

export async function unarchiveImpresoraAction(formData: FormData) {
  const printerId = asString(formData.get("id"));
  await executeAndRefresh(() => unarchivePrinter(printerId), "Impresora desarchivada.", "/?section=impresoras", {
    permission: "archive_printer",
    auditAction: "unarchive_printer",
    auditEntityType: "printer",
    auditEntityId: printerId,
  });
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
    {
      permission: "restock_finished_inventory",
      auditAction: "restock_finished_inventory",
      auditEntityType: "finished_inventory",
      auditEntityId: asString(formData.get("productId")),
    },
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
    {
      permission: "edit_finished_inventory",
      auditAction: "edit_finished_inventory",
      auditEntityType: "finished_inventory",
      auditEntityId: asString(formData.get("id")),
    },
  );
}

export async function deliverOrderAction(formData: FormData) {
  await executeAndRefresh(
    () => deliverOrderWorkflow(asString(formData.get("pedidoId"))),
    "Pedido entregado.",
    "/?section=pedidos",
    {
      permission: "deliver_order",
      auditAction: "deliver_order",
      auditEntityType: "order",
      auditEntityId: asString(formData.get("pedidoId")),
    },
  );
}

export async function generateInvoiceAction(formData: FormData) {
  await executeAndRefresh(
    () => invoiceOrderWorkflow(asString(formData.get("pedidoId"))),
    "Factura generada.",
    "/?section=facturas",
    {
      permission: "invoice_order",
      auditAction: "invoice_order",
      auditEntityType: "order",
      auditEntityId: asString(formData.get("pedidoId")),
    },
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
    {
      permission: "collect_payment",
      auditAction: "collect_payment",
      auditEntityType: "invoice",
      auditEntityId: asString(formData.get("facturaId")),
    },
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
    {
      permission: "edit_invoice",
      auditAction: "edit_invoice",
      auditEntityType: "invoice",
      auditEntityId: asString(formData.get("id")),
    },
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
    {
      permission: "register_payment",
      auditAction: "register_payment",
      auditEntityType: "invoice_payment",
      auditEntityId: asString(formData.get("facturaId")),
    },
  );
}

export async function submitPublicQuoteAction(formData: FormData) {
  try {
    await createPublicQuoteRequest({
      nombre: asString(formData.get("nombre")),
      email: asString(formData.get("email")),
      telefono: asString(formData.get("telefono")),
      servicio: asString(formData.get("servicio")),
      material: asString(formData.get("material")),
      cantidad: asString(formData.get("cantidad")),
      mensaje: asString(formData.get("mensaje")),
    });
    redirect("/tienda?contact=ok#presupuesto");
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "No se pudo enviar la solicitud.";
    redirect(`/tienda?contact=error&error=${encodeURIComponent(message)}#presupuesto`);
  }
}
