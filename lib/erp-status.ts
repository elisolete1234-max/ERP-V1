export type StatusTone = "neutral" | "info" | "warn" | "success" | "danger" | "accent" | "strong";

export type OrderWorkflowStatus =
  | "BORRADOR"
  | "CONFIRMADO"
  | "EN_PRODUCCION"
  | "LISTO"
  | "ENTREGADO"
  | "FACTURADO"
  | "CANCELADO";

export type ManufacturingWorkflowStatus = "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";
export type InvoiceWorkflowStatus = "PENDIENTE" | "PARCIAL" | "PAGADA" | "VENCIDA";
export type PaymentWorkflowStatus = "PENDIENTE" | "PARCIAL" | "PAGADO";

export type WorkflowAction =
  | "process_order"
  | "deliver_order"
  | "invoice_order"
  | "collect_invoice_payment"
  | "open_payment_detail"
  | "view_invoice"
  | "view_manufacturing"
  | "complete_manufacturing"
  | "restock_material";

export const ORDER_STATUS_LABELS: Record<OrderWorkflowStatus, string> = {
  BORRADOR: "borrador",
  CONFIRMADO: "confirmado",
  EN_PRODUCCION: "en produccion",
  LISTO: "listo",
  ENTREGADO: "entregado",
  FACTURADO: "facturado",
  CANCELADO: "cancelado",
};

export const MANUFACTURING_STATUS_LABELS: Record<ManufacturingWorkflowStatus, string> = {
  PENDIENTE: "pendiente",
  EN_CURSO: "en curso",
  COMPLETADA: "completada",
  CANCELADA: "cancelada",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceWorkflowStatus, string> = {
  PENDIENTE: "pendiente",
  PARCIAL: "parcial",
  PAGADA: "pagada",
  VENCIDA: "vencida",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentWorkflowStatus, string> = {
  PENDIENTE: "pendiente",
  PARCIAL: "parcial",
  PAGADO: "pagado",
};

export const ORDER_STATUS_FILTERS: OrderWorkflowStatus[] = [
  "BORRADOR",
  "CONFIRMADO",
  "EN_PRODUCCION",
  "LISTO",
  "ENTREGADO",
  "FACTURADO",
  "CANCELADO",
];

export const MANUFACTURING_STATUS_FILTERS: ManufacturingWorkflowStatus[] = [
  "PENDIENTE",
  "EN_CURSO",
  "COMPLETADA",
  "CANCELADA",
];

export const INVOICE_STATUS_FILTERS: InvoiceWorkflowStatus[] = ["PENDIENTE", "PARCIAL", "PAGADA", "VENCIDA"];

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function addDays(dateValue: string, days: number) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setDate(parsed.getDate() + days);
  return parsed;
}

export function normalizeOrderStatus(status: string | null | undefined): OrderWorkflowStatus {
  switch (String(status ?? "").trim().toUpperCase()) {
    case "BORRADOR":
      return "BORRADOR";
    case "CONFIRMADO":
      return "CONFIRMADO";
    case "EN_PRODUCCION":
      return "EN_PRODUCCION";
    case "LISTO":
      return "LISTO";
    case "ENTREGADO":
      return "ENTREGADO";
    case "FACTURADO":
      return "FACTURADO";
    case "CANCELADO":
      return "CANCELADO";
    case "INCIDENCIA_STOCK":
      return "EN_PRODUCCION";
    default:
      return "BORRADOR";
  }
}

export function deriveManufacturingStatus(
  input:
    | string
    | {
        estado?: string | null;
      },
): ManufacturingWorkflowStatus {
  const rawStatus = typeof input === "string" ? input : input.estado;
  switch (String(rawStatus ?? "").trim().toUpperCase()) {
    case "COMPLETADA":
      return "COMPLETADA";
    case "INICIADA":
    case "EN_CURSO":
      return "EN_CURSO";
    case "CANCELADA":
      return "CANCELADA";
    case "BLOQUEADA_POR_STOCK":
    case "PENDIENTE":
    default:
      return "PENDIENTE";
  }
}

export function deriveInvoiceStatus(input: {
  fecha?: string | null;
  total?: number | null;
  total_pagado?: number | null;
  importe_pendiente?: number | null;
  dueDays?: number;
  now?: Date;
}): InvoiceWorkflowStatus {
  const total = roundMoney(Math.max(input.total ?? 0, 0));
  const totalPaid = roundMoney(Math.max(input.total_pagado ?? 0, 0));
  const pendingAmount = roundMoney(
    Math.max(input.importe_pendiente ?? Math.max(total - totalPaid, 0), 0),
  );

  if (total > 0 && totalPaid >= total) {
    return "PAGADA";
  }
  if (totalPaid > 0) {
    return "PARCIAL";
  }

  const dueDate = input.fecha ? addDays(input.fecha, input.dueDays ?? 30) : null;
  const referenceNow = input.now ?? new Date();
  if (pendingAmount > 0 && dueDate && dueDate.getTime() < referenceNow.getTime()) {
    return "VENCIDA";
  }

  return "PENDIENTE";
}

export function derivePaymentStatus(input: {
  total?: number | null;
  total_pagado?: number | null;
  importe_pendiente?: number | null;
}): PaymentWorkflowStatus {
  const total = roundMoney(Math.max(input.total ?? 0, 0));
  const totalPaid = roundMoney(Math.max(input.total_pagado ?? 0, 0));
  const pendingAmount = roundMoney(
    Math.max(input.importe_pendiente ?? Math.max(total - totalPaid, 0), 0),
  );

  if (pendingAmount <= 0 && total > 0) {
    return "PAGADO";
  }
  if (totalPaid > 0) {
    return "PARCIAL";
  }
  return "PENDIENTE";
}

export function deriveOrderStatus(input: {
  estado?: string | null;
  factura?: { id: string } | boolean | null;
  lineas?: Array<{
    cantidad: number;
    cantidad_desde_stock?: number | null;
    cantidad_a_fabricar?: number | null;
  }>;
  ordenesFabricacion?: Array<{
    estado?: string | null;
  }>;
}): OrderWorkflowStatus {
  const normalized = normalizeOrderStatus(input.estado);

  if (normalized === "BORRADOR" || normalized === "CANCELADO") {
    return normalized;
  }
  if (normalized === "ENTREGADO" || normalized === "FACTURADO") {
    return input.factura ? "FACTURADO" : normalized;
  }

  const manufacturingStatuses = (input.ordenesFabricacion ?? []).map((order) =>
    deriveManufacturingStatus(order),
  );

  if (manufacturingStatuses.length > 0) {
    if (manufacturingStatuses.every((status) => status === "COMPLETADA")) {
      return "LISTO";
    }
    return "EN_PRODUCCION";
  }

  const totalUnits = (input.lineas ?? []).reduce((sum, line) => sum + Math.max(line.cantidad, 0), 0);
  const reservedUnits = (input.lineas ?? []).reduce(
    (sum, line) => sum + Math.max(line.cantidad_desde_stock ?? 0, 0),
    0,
  );
  const unitsToManufacture = (input.lineas ?? []).reduce(
    (sum, line) => sum + Math.max(line.cantidad_a_fabricar ?? 0, 0),
    0,
  );

  if (totalUnits > 0 && reservedUnits >= totalUnits && unitsToManufacture <= 0) {
    return "LISTO";
  }
  if (unitsToManufacture > 0) {
    return "EN_PRODUCCION";
  }

  return normalized === "LISTO" ? "LISTO" : "CONFIRMADO";
}

export function getOrderStatusTone(status: OrderWorkflowStatus): StatusTone {
  if (status === "LISTO") return "success";
  if (status === "ENTREGADO") return "accent";
  if (status === "FACTURADO") return "strong";
  if (status === "EN_PRODUCCION") return "warn";
  if (status === "CONFIRMADO") return "info";
  if (status === "CANCELADO") return "danger";
  return "neutral";
}

export function getManufacturingStatusTone(status: ManufacturingWorkflowStatus): StatusTone {
  if (status === "COMPLETADA") return "success";
  if (status === "EN_CURSO") return "info";
  if (status === "CANCELADA") return "danger";
  return "warn";
}

export function getInvoiceStatusTone(status: InvoiceWorkflowStatus): StatusTone {
  if (status === "PAGADA") return "success";
  if (status === "PARCIAL") return "info";
  if (status === "VENCIDA") return "danger";
  return "warn";
}

export function getPaymentStatusTone(status: PaymentWorkflowStatus): StatusTone {
  if (status === "PAGADO") return "success";
  if (status === "PARCIAL") return "info";
  return "warn";
}

export function getNextAllowedActions(
  input:
    | {
        module: "order";
        rawStatus?: string | null;
        derivedStatus: OrderWorkflowStatus;
        hasInvoice?: boolean;
        hasManufacturing?: boolean;
        hasStockIncident?: boolean;
        invoiceStatus?: InvoiceWorkflowStatus | null;
      }
    | {
        module: "manufacturing";
        rawStatus?: string | null;
        derivedStatus: ManufacturingWorkflowStatus;
        hasStockIncident?: boolean;
      }
    | {
        module: "invoice";
        derivedStatus: InvoiceWorkflowStatus;
      },
): WorkflowAction[] {
  if (input.module === "order") {
    if (input.derivedStatus === "BORRADOR") {
      return ["process_order"];
    }
    if (input.derivedStatus === "CONFIRMADO") {
      return input.hasManufacturing ? ["view_manufacturing"] : [];
    }
    if (input.derivedStatus === "EN_PRODUCCION") {
      if (input.hasStockIncident) {
        return ["process_order", "restock_material", ...(input.hasManufacturing ? ["view_manufacturing" as const] : [])];
      }
      return input.hasManufacturing ? ["view_manufacturing"] : [];
    }
    if (input.derivedStatus === "LISTO") {
      return ["deliver_order"];
    }
    if (input.derivedStatus === "ENTREGADO") {
      return ["invoice_order"];
    }
    if (input.derivedStatus === "FACTURADO") {
      if (input.hasInvoice && input.invoiceStatus && input.invoiceStatus !== "PAGADA") {
        return ["view_invoice", "collect_invoice_payment"];
      }
      return input.hasInvoice ? ["view_invoice"] : [];
    }
    return [];
  }

  if (input.module === "manufacturing") {
    const rawStatus = String(input.rawStatus ?? "").trim().toUpperCase();
    if (rawStatus === "BLOQUEADA_POR_STOCK" || input.hasStockIncident) {
      return ["restock_material"];
    }
    if (input.derivedStatus === "PENDIENTE" || input.derivedStatus === "EN_CURSO") {
      return ["complete_manufacturing"];
    }
    return [];
  }

  if (input.derivedStatus === "PAGADA") {
    return [];
  }

  return ["collect_invoice_payment", "open_payment_detail"];
}
