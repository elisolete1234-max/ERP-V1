"use client";

import { Fragment, useState, type FormEvent } from "react";
import {
  collectInvoicePaymentAction,
  completeManufacturingAction,
  deliverOrderAction,
  generateInvoiceAction,
  processOrderAction,
  registerInvoicePaymentAction,
  retryOrderAction,
  toggleCustomerActiveAction,
  toggleMaterialActiveAction,
  togglePrinterActiveAction,
  toggleProductActiveAction,
  updateFinishedInventoryAction,
  updateCustomerAction,
  updateInvoiceAction,
  updateManufacturingAction,
  updateMaterialAction,
  updateOrderAction,
  updatePrinterAction,
  updateProductAction,
} from "@/app/actions";
import {
  deriveInvoiceStatus,
  getInvoiceStatusTone,
  INVOICE_STATUS_LABELS,
  MANUFACTURING_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from "@/lib/erp-status";
import type { StatusTone } from "@/lib/erp-status";
import { SubmitButton } from "./form-ui";

type Customer = {
  id: string;
  codigo: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
  fecha_creacion: string;
};

type Material = {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  tipo: string;
  color: string;
  tipo_color: string | null;
  efecto: string | null;
  color_base: string | null;
  nombre_comercial: string | null;
  diametro_mm: number | null;
  peso_spool_g: number | null;
  temp_extrusor: number | null;
  temp_cama: number | null;
  precio_kg: number;
  stock_actual_g: number;
  stock_minimo_g: number;
  proveedor: string | null;
  notas: string | null;
  activo: boolean;
  fecha_actualizacion: string;
};

type Product = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  enlace_modelo: string | null;
  gramos_estimados: number;
  tiempo_impresion_horas: number;
  coste_electricidad: number;
  coste_maquina: number;
  coste_mano_obra: number;
  coste_postprocesado: number;
  coste_material_estimado: number;
  coste_total_producto: number;
  margen: number;
  pvp: number;
  iva_porcentaje: number;
  material_id: string;
  activo: boolean;
  material_nombre: string;
  precio_kg: number;
};

type ManufacturingOrder = {
  id: string;
  codigo: string;
  pedido_id: string | null;
  linea_pedido_id: string | null;
  producto_id: string;
  cantidad: number;
  estado: string;
  impresora_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  gramos_consumidos: number | null;
  tiempo_real_horas: number | null;
  coste_impresora_total: number | null;
  incidencia: string | null;
  pedido_codigo: string | null;
  producto_nombre: string;
  impresora_codigo: string | null;
  impresora_nombre: string | null;
  origen_fabricacion: string;
  origen_fabricacion_label: string;
  estado_derivado: string;
  estado_badge_tone: StatusTone;
  tiene_incidencia_stock: boolean;
  acciones_permitidas: string[];
};

type Invoice = {
  id: string;
  codigo: string;
  pedido_id: string;
  cliente_id: string;
  cliente_codigo: string;
  fecha: string;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  total_pagado: number;
  importe_pendiente: number;
  estado_pago: string;
  estado_pago_derivado: string;
  estado_pago_badge_tone: StatusTone;
  acciones_permitidas: string[];
  pedido_codigo: string;
  cliente_nombre: string;
  pagos: Array<{
    id: string;
    codigo: string;
    displayCode: string;
    factura_id: string;
    fecha_pago: string;
    metodo_pago: string;
    importe: number;
    notas: string | null;
  }>;
};

type FinishedInventory = {
  id: string;
  codigo: string;
  product_id: string;
  cantidad_disponible: number;
  unidades_stock: number;
  unidades_reservadas: number;
  unidades_disponibles: number;
  ubicacion: string | null;
  coste_unitario: number;
  precio_venta: number;
  fecha_actualizacion: string;
  producto_codigo: string;
  producto_nombre: string;
};

type Printer = {
  id: string;
  codigo: string;
  nombre: string;
  estado: "LIBRE" | "IMPRIMIENDO" | "MANTENIMIENTO";
  horas_uso_acumuladas: number;
  coste_hora: number;
  ubicacion: string | null;
  activo: boolean;
  fecha_actualizacion: string;
  orden_activa_codigo: string | null;
};

type MaterialOption = {
  id: string;
  codigo: string;
  nombre: string;
  color: string;
  activo: boolean;
};

type ProductOption = {
  id: string;
  codigo: string;
  nombre: string;
};

type CustomerOption = {
  id: string;
  codigo: string;
  nombre: string;
};

type CustomerOrderSummary = {
  id: string;
  codigo: string;
  cliente_id: string;
  fecha_pedido: string;
  estado: string;
  estado_derivado: string;
  estado_badge_tone: StatusTone;
  lineas: Array<{
    id: string;
    producto_codigo: string;
    producto_nombre: string;
    cantidad: number;
  }>;
};

type CustomerInvoiceSummary = {
  id: string;
  codigo: string;
  cliente_id: string;
  fecha: string;
  estado_pago: string;
  estado_pago_derivado: string;
  estado_pago_badge_tone: StatusTone;
  total: number;
};

type OrderLine = {
  id: string;
  codigo: string;
  producto_id: string;
  cantidad: number;
  cantidad_desde_stock: number;
  cantidad_a_fabricar: number;
  precio_unitario: number;
  precio_total_linea: number;
  coste_total: number;
  beneficio: number;
  producto_nombre: string;
};

type OrderCard = {
  id: string;
  codigo: string;
  cliente_id: string;
  cliente_codigo: string;
  cliente_nombre: string;
  fecha_pedido: string;
  estado: string;
  estado_derivado: string;
  estado_badge_tone: StatusTone;
  tiene_incidencia_stock: boolean;
  acciones_permitidas: string[];
  estado_pago: string;
  estado_pago_derivado: string;
  estado_pago_badge_tone: StatusTone;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  coste_total_pedido: number;
  beneficio_total: number;
  observaciones: string | null;
  lineas: OrderLine[];
  historial: Array<{ fecha: string; nota: string }>;
  ordenesFabricacion: Array<{ id: string }>;
  factura: { id: string } | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function badgeClasses(tone: "neutral" | "success" | "warn" | "danger" | "info" | "accent" | "strong") {
  if (tone === "success") {
    return "border border-emerald-200 bg-emerald-50/90 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]";
  }
  if (tone === "warn") {
    return "border border-amber-200 bg-amber-50/90 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]";
  }
  if (tone === "danger") {
    return "border border-rose-200 bg-rose-50/90 text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]";
  }
  if (tone === "info") {
    return "border border-sky-200 bg-sky-50/90 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]";
  }
  if (tone === "accent") {
    return "border border-violet-200 bg-violet-50/90 text-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]";
  }
  if (tone === "strong") {
    return "border border-slate-500 bg-slate-300/90 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]";
  }
  return "border border-black/10 bg-white/90 text-[color:var(--muted-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";
}

function orderTone(status: string) {
  if (status === "COMPLETADA" || status === "LIBRE" || status === "PAGADA") {
    return "success";
  }
  if (status === "INICIADA" || status === "IMPRIMIENDO") {
    return "info";
  }
  if (status === "BLOQUEADA_POR_STOCK" || status === "MANTENIMIENTO") {
    return "danger";
  }
  return "warn";
}

function paymentTone(status: string) {
  return getInvoiceStatusTone(status as never);
}

function paymentMethodLabel(method: string) {
  return method.toLowerCase().replaceAll("_", " ");
}

function deriveInvoicePaymentView(invoice: Pick<Invoice, "total" | "total_pagado">) {
  const total = Number(invoice.total.toFixed(2));
  const totalPaid = Number(invoice.total_pagado.toFixed(2));
  const pendingAmount = Number(Math.max(total - totalPaid, 0).toFixed(2));
  const paymentStatus = deriveInvoiceStatus({
    total,
    total_pagado: totalPaid,
    importe_pendiente: pendingAmount,
  });
  const canRegisterPayment = pendingAmount > 0 && totalPaid < total;

  return {
    total,
    totalPaid,
    pendingAmount,
    paymentStatus,
    canRegisterPayment,
  };
}

function deriveTaxableBase(total: number, iva: number) {
  return Number(Math.max(total - iva, 0).toFixed(2));
}

function rowHighlight(level?: "danger" | "warn" | "attention" | null) {
  if (level === "danger") return "row-danger";
  if (level === "warn") return "row-warn";
  if (level === "attention") return "row-attention";
  return "";
}

function orderStatusLabel(status: string) {
  return ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status.toLowerCase().replaceAll("_", " ");
}

const tableInputClass = "input table-input";
const tableTextareaClass = "input table-input";

function InlineField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="table-inline-field">
      <span className="table-inline-label">{label}</span>
      {hint ? <span className="table-inline-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M13.9 3.6a1.7 1.7 0 0 1 2.4 2.4L8 14.3l-3.2.8.8-3.2 8.3-8.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m4.8 10.4 3.3 3.3 7.1-7.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5.5 5.5 14.5 14.5M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M15.7 9.9A5.7 5.7 0 1 1 10 4.3c1.3 0 2.5.4 3.5 1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12.8 2.9h3.5v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5.5h9v6.1H3zM12 7.4h2.8l2 2.1v2.1H12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="6" cy="14.1" r="1.3" fill="currentColor" />
      <circle cx="14.3" cy="14.1" r="1.3" fill="currentColor" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 3.5h8v13l-2-1.2-2 1.2-2-1.2-2 1.2v-13Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.7 7h4.6M7.7 10h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.8 10s2.6-4.2 7.2-4.2 7.2 4.2 7.2 4.2-2.6 4.2-7.2 4.2S2.8 10 2.8 10Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 5.5h12v9H4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 8.2h12M10 10v3.2M8.5 11.4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.5v8.2M6.8 8.8 10 12l3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14.2h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.2 5.4h11.6v2.5H4.2zM5.4 7.9h9.2v6.7H5.4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5.2 8.2A5.5 5.5 0 1 1 10 15.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.1 4.8v3.7h3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="animate-spin">
      <path d="M10 3.2a6.8 6.8 0 1 1-4.8 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const ARCHIVE_CONFIRMATION_MESSAGE =
  "Archivar no borra el registro. Seguira disponible en historicos y documentos relacionados.";

function archiveStatusLabel(active: boolean) {
  return active ? "Activo" : "Archivado";
}

function archiveActionLabel(active: boolean) {
  return active ? "Archivar" : "Desarchivar";
}

function confirmArchiveOnSubmit(active: boolean) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (active && !window.confirm(ARCHIVE_CONFIRMATION_MESSAGE)) {
      event.preventDefault();
    }
  };
}

function ActionButtons({
  editing,
  onEdit,
  onCancel,
  formId,
}: {
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  formId: string;
}) {
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        title="Editar"
        aria-label="Editar"
        className="icon-action-button icon-action-button--soft"
      >
        <PencilIcon />
      </button>
    );
  }

  return (
    <div className="table-action-group">
      <button
        type="submit"
        form={formId}
        title="Guardar"
        aria-label="Guardar"
        className="icon-action-button icon-action-button--dark"
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Cancelar"
        aria-label="Cancelar"
        className="icon-action-button"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function CustomersInlineTable({
  customers,
  focusedCustomerCode,
  focusOriginLabel,
  orders,
  invoices,
}: {
  customers: Customer[];
  focusedCustomerCode?: string | null;
  focusOriginLabel?: string | null;
  orders: CustomerOrderSummary[];
  invoices: CustomerInvoiceSummary[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeCustomerTab, setActiveCustomerTab] = useState<"orders" | "invoices" | "products">("orders");
  const [activeProductTab, setActiveProductTab] = useState<"customers" | "orders" | "invoices" | "printers">("customers");

  const focusedCustomer = focusedCustomerCode ? customers.find((customer) => customer.codigo === focusedCustomerCode) ?? null : null;
  const focusedProduct = {} as Product;
  const focusedInventory = { cantidad_disponible: 0 } as FinishedInventory;
  const customerPurchases: Array<{ clienteId: string; clienteCodigo: string; clienteNombre: string; cantidad: number }> = [];
  const productOrders: Array<OrderCard> = [];
  const relatedInvoices: Array<Invoice> = [];
  const printerUsage: Array<{ impresoraId: string; impresoraCodigo: string; impresoraNombre: string; fabricaciones: number; cantidad: number }> = [];

  const summarizePurchasedProducts = (customerOrders: CustomerOrderSummary[]) =>
    Array.from(
      customerOrders
        .flatMap((order) => order.lineas)
        .reduce((accumulator, line) => {
          const current = accumulator.get(line.producto_codigo);
          accumulator.set(line.producto_codigo, {
            codigo: line.producto_codigo,
            nombre: line.producto_nombre,
            cantidad: (current?.cantidad ?? 0) + line.cantidad,
          });
          return accumulator;
        }, new Map<string, { codigo: string; nombre: string; cantidad: number }>())
        .values(),
    ).sort((a, b) => a.codigo.localeCompare(b.codigo, "es"));

  if (focusedCustomer) {
    const editing = editingId === focusedCustomer.id;
    const formId = `customer-form-${focusedCustomer.id}`;
    const customerOrders = orders.filter((order) => order.cliente_id === focusedCustomer.id);
    const customerInvoices = invoices.filter((invoice) => invoice.cliente_id === focusedCustomer.id);
    const purchasedProducts = summarizePurchasedProducts(customerOrders);

    return (
      <div className="odoo-page">
        <article className="odoo-record">
          <div className="odoo-record-header">
            <div>
              <p className="eyebrow">Cliente</p>
              <h3 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.04em] text-slate-950">
                {focusedCustomer.nombre}
              </h3>
              <p className="mt-2 text-sm font-semibold text-sky-700">{focusedCustomer.codigo}</p>
              <div className="mt-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                Cliente abierto desde {focusOriginLabel ?? "pedido/factura/pago"}
              </div>
            </div>
            <div className="table-action-group">
              {editing ? (
                <form id={formId} action={updateCustomerAction}>
                  <input type="hidden" name="id" value={focusedCustomer.id} />
                </form>
              ) : null}
              <ActionButtons
                editing={editing}
                onEdit={() => setEditingId(focusedCustomer.id)}
                onCancel={() => setEditingId(null)}
                formId={formId}
              />
              {!editing ? (
                <form action={toggleCustomerActiveAction} onSubmit={confirmArchiveOnSubmit(focusedCustomer.activo)}>
                  <input type="hidden" name="id" value={focusedCustomer.id} />
                  <input type="hidden" name="active" value={focusedCustomer.activo ? "false" : "true"} />
                  <SubmitButton
                    variant={focusedCustomer.activo ? "icon-soft" : "icon-dark"}
                    pendingText={<SpinnerIcon />}
                    title={archiveActionLabel(focusedCustomer.activo)}
                    aria-label={archiveActionLabel(focusedCustomer.activo)}
                  >
                    {focusedCustomer.activo ? <ArchiveIcon /> : <RestoreIcon />}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </div>

          {editing ? (
            <div className="odoo-record-body">
              <form action={updateCustomerAction} id={formId} className="space-y-4">
                <input type="hidden" name="id" value={focusedCustomer.id} />
                <div className="odoo-record-grid">
                  <InlineField label="Nombre">
                    <input name="nombre" defaultValue={focusedCustomer.nombre} className={tableInputClass} />
                  </InlineField>
                  <InlineField label="Telefono">
                    <input name="telefono" defaultValue={focusedCustomer.telefono ?? ""} className={tableInputClass} />
                  </InlineField>
                  <InlineField label="Email">
                    <input name="email" type="email" defaultValue={focusedCustomer.email ?? ""} className={tableInputClass} />
                  </InlineField>
                  <InlineField label="Estado">
                    <div className="odoo-field-value">{archiveStatusLabel(focusedCustomer.activo)}</div>
                  </InlineField>
                </div>
                <div className="table-edit-card">
                  <InlineField label="Direccion">
                    <textarea name="direccion" defaultValue={focusedCustomer.direccion ?? ""} rows={3} className={tableTextareaClass} />
                  </InlineField>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="odoo-record-grid">
                <div className="odoo-field">
                  <span className="odoo-field-label">Codigo</span>
                  <span className="odoo-field-value">{focusedCustomer.codigo}</span>
                </div>
                <div className="odoo-field">
                  <span className="odoo-field-label">Estado</span>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedCustomer.activo ? "success" : "neutral")}`}>
                    {archiveStatusLabel(focusedCustomer.activo)}
                  </span>
                </div>
                <div className="odoo-field">
                  <span className="odoo-field-label">Telefono</span>
                  <span className="odoo-field-value">{focusedCustomer.telefono || "-"}</span>
                </div>
                <div className="odoo-field">
                  <span className="odoo-field-label">Email</span>
                  <span className="odoo-field-value">{focusedCustomer.email || "-"}</span>
                </div>
                <div className="odoo-field">
                  <span className="odoo-field-label">Direccion</span>
                  <span className="odoo-field-value">{focusedCustomer.direccion || "-"}</span>
                </div>
                <div className="odoo-field">
                  <span className="odoo-field-label">Alta</span>
                  <span className="odoo-field-value">{formatDate(focusedCustomer.fecha_creacion)}</span>
                </div>
              </div>

              <div className="odoo-tabs">
                <button
                  type="button"
                  onClick={() => setActiveCustomerTab("orders")}
                  className={`odoo-tab ${activeCustomerTab === "orders" ? "is-active" : ""}`}
                >
                  Pedidos
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{customerOrders.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCustomerTab("invoices")}
                  className={`odoo-tab ${activeCustomerTab === "invoices" ? "is-active" : ""}`}
                >
                  Facturas
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{customerInvoices.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCustomerTab("products")}
                  className={`odoo-tab ${activeCustomerTab === "products" ? "is-active" : ""}`}
                >
                  Productos comprados
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{purchasedProducts.length}</span>
                </button>
              </div>

              <div className="odoo-record-body">
                {activeCustomerTab === "orders" ? (
                  customerOrders.length === 0 ? (
                    <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin pedidos registrados.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="odoo-list-table">
                        <thead>
                          <tr>
                            <th>Pedido</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerOrders.map((order) => (
                            <tr key={order.id}>
                              <td>
                                <a href={`/?section=pedidos&pedidoId=${encodeURIComponent(order.codigo)}`} className="odoo-link">
                                  {order.codigo}
                                </a>
                              </td>
                              <td>{formatDate(order.fecha_pedido)}</td>
                              <td>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_badge_tone)}`}>
                                  {orderStatusLabel(order.estado_derivado)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}

                {activeCustomerTab === "invoices" ? (
                  customerInvoices.length === 0 ? (
                    <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin facturas relacionadas.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="odoo-list-table">
                        <thead>
                          <tr>
                            <th>Factura</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerInvoices.map((invoice) => (
                            <tr key={invoice.id}>
                              <td>
                                <a href={`/?section=facturas&facturaId=${encodeURIComponent(invoice.codigo)}`} className="odoo-link">
                                  {invoice.codigo}
                                </a>
                              </td>
                              <td>{formatDate(invoice.fecha)}</td>
                              <td>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(invoice.estado_pago_badge_tone)}`}>
                                  {INVOICE_STATUS_LABELS[invoice.estado_pago_derivado as keyof typeof INVOICE_STATUS_LABELS] ?? invoice.estado_pago_derivado.toLowerCase()}
                                </span>
                              </td>
                              <td>{formatCurrency(invoice.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}

                {activeCustomerTab === "products" ? (
                  purchasedProducts.length === 0 ? (
                    <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin productos comprados.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="odoo-list-table">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cantidad total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchasedProducts.map((product) => (
                            <tr key={`${focusedCustomer.id}-${product.codigo}`}>
                              <td>
                                <a
                                  href={`/?section=productos&productoId=${encodeURIComponent(product.codigo)}&origen=cliente`}
                                  className="odoo-link"
                                >
                                  {product.codigo} · {product.nombre}
                                </a>
                              </td>
                              <td>{product.cantidad} uds</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}
              </div>
            </>
          )}
        </article>
      </div>
    );
  }

  return (
    <>
      {false ? (
        <div className="mb-5 odoo-page">
          <article className="odoo-record ring-2 ring-[color:var(--brand)] ring-offset-2 ring-offset-[color:var(--surface)] shadow-[0_22px_55px_rgba(37,99,235,0.18)]">
            <div className="odoo-record-header">
              <div>
                <p className="eyebrow">Producto</p>
                <h3 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {focusedProduct.nombre}
                </h3>
                <p className="mt-2 text-sm font-semibold text-sky-700">{focusedProduct.codigo}</p>
                <div className="mt-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  Producto abierto desde {focusOriginLabel ?? "cliente/pedido/factura"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedProduct.activo ? "success" : "neutral")}`}>
                    {archiveStatusLabel(focusedProduct.activo)}
                </span>
                {focusedInventory ? (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedInventory.cantidad_disponible > 0 ? "info" : "neutral")}`}>
                    stock: {focusedInventory.cantidad_disponible} uds
                  </span>
                ) : null}
              </div>
            </div>

            <div className="odoo-record-grid">
              <div className="odoo-field">
                <span className="odoo-field-label">Codigo</span>
                <span className="odoo-field-value">{focusedProduct.codigo}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Enlace / modelo</span>
                <span className="odoo-field-value">
                  {focusedProduct.enlace_modelo ? (
                    <a href={focusedProduct.enlace_modelo ?? undefined} className="odoo-link" target="_blank" rel="noreferrer">
                      Abrir modelo
                    </a>
                  ) : (
                    "-"
                  )}
                </span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Gramos estimados</span>
                <span className="odoo-field-value">{focusedProduct.gramos_estimados} g</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Coste total</span>
                <span className="odoo-field-value">{formatCurrency(focusedProduct.coste_total_producto)}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">PVP</span>
                <span className="odoo-field-value">{formatCurrency(focusedProduct.pvp)}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Margen</span>
                <span className="odoo-field-value">{formatCurrency(focusedProduct.margen)}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Estado / stock</span>
                <span className="odoo-field-value">
                  {focusedInventory
                    ? `${archiveStatusLabel(focusedProduct.activo)} · ${focusedInventory.cantidad_disponible} uds disponibles`
                    : archiveStatusLabel(focusedProduct.activo)}
                </span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Material base</span>
                <span className="odoo-field-value">{focusedProduct.material_nombre}</span>
              </div>
            </div>

            <div className="odoo-tabs">
              <button
                type="button"
                onClick={() => setActiveProductTab("customers")}
                className={`odoo-tab ${activeProductTab === "customers" ? "is-active" : ""}`}
              >
                Clientes que lo han comprado
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{customerPurchases.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveProductTab("orders")}
                className={`odoo-tab ${activeProductTab === "orders" ? "is-active" : ""}`}
              >
                Pedidos relacionados
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{productOrders.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveProductTab("invoices")}
                className={`odoo-tab ${activeProductTab === "invoices" ? "is-active" : ""}`}
              >
                Facturas relacionadas
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{relatedInvoices.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveProductTab("printers")}
                className={`odoo-tab ${activeProductTab === "printers" ? "is-active" : ""}`}
              >
                Impresoras utilizadas
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{printerUsage.length}</span>
              </button>
            </div>

            <div className="odoo-record-body">
              {activeProductTab === "customers" ? (
                customerPurchases.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin clientes relacionados.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Cantidad total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerPurchases.map((customer) => (
                          <tr key={`${focusedProduct.id}-${customer.clienteId}`}>
                            <td>
                              <a href={`/?section=clientes&clienteId=${encodeURIComponent(customer.clienteCodigo)}`} className="odoo-link">
                                {customer.clienteCodigo} · {customer.clienteNombre}
                              </a>
                            </td>
                            <td>{customer.cantidad} uds</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}

              {activeProductTab === "orders" ? (
                productOrders.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin pedidos relacionados.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Pedido</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th>Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productOrders.map((order) => {
                          const quantity = order.lineas
                            .filter((line) => line.producto_id === focusedProduct.id)
                            .reduce((sum, line) => sum + line.cantidad, 0);

                          return (
                            <tr key={`${focusedProduct.id}-${order.id}`}>
                              <td>
                                <a href={`/?section=pedidos&pedidoId=${encodeURIComponent(order.codigo)}`} className="odoo-link">
                                  {order.codigo}
                                </a>
                              </td>
                              <td>{formatDate(order.fecha_pedido)}</td>
                              <td>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_badge_tone)}`}>
                                  {orderStatusLabel(order.estado_derivado)}
                                </span>
                              </td>
                              <td>{quantity} uds</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}

              {activeProductTab === "invoices" ? (
                relatedInvoices.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin facturas relacionadas.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Factura</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatedInvoices.map((invoice) => (
                          <tr key={`${focusedProduct.id}-${invoice.id}`}>
                            <td>
                              <a href={`/?section=facturas&facturaId=${encodeURIComponent(invoice.codigo)}`} className="odoo-link">
                                {invoice.codigo}
                              </a>
                            </td>
                            <td>{formatDate(invoice.fecha)}</td>
                            <td>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(invoice.estado_pago_badge_tone)}`}>
                                {INVOICE_STATUS_LABELS[invoice.estado_pago_derivado as keyof typeof INVOICE_STATUS_LABELS] ?? invoice.estado_pago_derivado.toLowerCase()}
                              </span>
                            </td>
                            <td>{formatCurrency(invoice.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}

              {activeProductTab === "printers" ? (
                printerUsage.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin impresoras relacionadas.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Impresora</th>
                          <th>Fabricaciones</th>
                          <th>Cantidad fabricada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printerUsage.map((printer) => (
                          <tr key={`${focusedProduct.id}-${printer.impresoraId}`}>
                            <td>
                              <a
                                href={`/?section=impresoras&impresoraId=${encodeURIComponent(printer.impresoraCodigo)}&origen=producto`}
                                className="odoo-link"
                              >
                                {printer.impresoraCodigo} · {printer.impresoraNombre}
                              </a>
                            </td>
                            <td>{printer.fabricaciones}</td>
                            <td>{printer.cantidad} uds</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Nombre</th><th>Contacto</th><th>Alta</th><th>Estado</th></tr>
      </thead>
      <tbody>
          {customers.map((customer) => {
            const editing = editingId === customer.id;
            const focused = focusedCustomerCode === customer.codigo;
            const formId = `customer-form-${customer.id}`;
            const customerOrders = orders.filter((order) => order.cliente_id === customer.id);
            const customerInvoices = invoices.filter((invoice) => invoice.cliente_id === customer.id);
            const purchasedProducts = summarizePurchasedProducts(customerOrders);
            return (
              <Fragment key={customer.id}>
                <tr
                  key={customer.id}
                  className={`${
                    focused
                      ? "bg-sky-50/90 ring-2 ring-inset ring-sky-300"
                      : !customer.activo
                        ? `${rowHighlight("attention")} opacity-75`
                        : ""
                  }`.trim()}
                >
                  <td>
                    <form id={formId} action={updateCustomerAction}>
                      <input type="hidden" name="id" value={customer.id} />
                    </form>
                    <div className="table-action-group">
                      <ActionButtons
                        editing={editing}
                        onEdit={() => setEditingId(customer.id)}
                        onCancel={() => setEditingId(null)}
                        formId={formId}
                      />
                      {!editing ? (
                        <form action={toggleCustomerActiveAction} onSubmit={confirmArchiveOnSubmit(customer.activo)}>
                          <input type="hidden" name="id" value={customer.id} />
                          <input type="hidden" name="active" value={customer.activo ? "false" : "true"} />
                          <SubmitButton
                            variant={customer.activo ? "icon-soft" : "icon-dark"}
                            pendingText={<SpinnerIcon />}
                            title={archiveActionLabel(customer.activo)}
                            aria-label={archiveActionLabel(customer.activo)}
                          >
                            {customer.activo ? <ArchiveIcon /> : <RestoreIcon />}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                  <td>{customer.codigo}</td>
                  <td>
                    {editing ? (
                      <InlineField label="Nombre">
                        <input form={formId} name="nombre" defaultValue={customer.nombre} className={tableInputClass} />
                      </InlineField>
                    ) : (
                      <div>
                        <a href={`/?section=clientes&clienteId=${encodeURIComponent(customer.codigo)}`} className="odoo-link font-medium">{customer.nombre}</a>
                        {focused ? (
                          <div className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                            Cliente abierto desde {focusOriginLabel ?? "pedido/factura/pago"}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <div className="table-edit-stack table-cell-edit table-edit-card">
                        <InlineField label="Telefono">
                          <input form={formId} name="telefono" defaultValue={customer.telefono ?? ""} placeholder="Telefono" className={tableInputClass} />
                        </InlineField>
                        <InlineField label="Email">
                          <input form={formId} name="email" type="email" defaultValue={customer.email ?? ""} placeholder="Email" className={tableInputClass} />
                        </InlineField>
                        <InlineField label="Direccion">
                          <textarea form={formId} name="direccion" defaultValue={customer.direccion ?? ""} rows={2} placeholder="Direccion" className={tableTextareaClass} />
                        </InlineField>
                      </div>
                    ) : (
                      <div>
                        <div>{customer.email || customer.telefono || "-"}</div>
                        <div className="text-xs text-[color:var(--muted)]">{customer.direccion || "-"}</div>
                      </div>
                    )}
                  </td>
                  <td>{formatDate(customer.fecha_creacion)}</td>
                  <td>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(customer.activo ? "success" : "neutral")}`}>
                      {archiveStatusLabel(customer.activo)}
                    </span>
                  </td>
                </tr>
                {!editing && focused ? (
                  <tr key={`${customer.id}-history`} className={focused ? "bg-sky-50/55" : ""}>
                    <td colSpan={6} className="bg-[color:var(--surface-strong)]">
                      <div className="grid gap-4 px-3 py-4 xl:grid-cols-3">
                        <section className="erp-subsection">
                          <p className="eyebrow">Pedidos del cliente</p>
                          <div className="mt-3 space-y-2">
                            {customerOrders.length === 0 ? (
                              <p className="text-sm text-[color:var(--muted)]">Sin pedidos registrados.</p>
                            ) : (
                              customerOrders.map((order) => (
                                <a
                                  key={order.id}
                                  href={`/?section=pedidos&pedidoId=${encodeURIComponent(order.codigo)}`}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/45 px-3 py-2 text-sm transition hover:border-sky-200 hover:bg-sky-50"
                                >
                                  <span className="font-semibold text-sky-800">{order.codigo}</span>
                                  <span className="text-slate-600">{formatDate(order.fecha_pedido)}</span>
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClasses(order.estado_badge_tone)}`}>
                                    {orderStatusLabel(order.estado_derivado)}
                                  </span>
                                </a>
                              ))
                            )}
                          </div>
                        </section>
                        <section className="erp-subsection">
                          <p className="eyebrow">Facturas del cliente</p>
                          <div className="mt-3 space-y-2">
                            {customerInvoices.length === 0 ? (
                              <p className="text-sm text-[color:var(--muted)]">Sin facturas relacionadas.</p>
                            ) : (
                              customerInvoices.map((invoice) => (
                                <a
                                  key={invoice.id}
                                  href={`/?section=facturas&facturaId=${encodeURIComponent(invoice.codigo)}`}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/45 px-3 py-2 text-sm transition hover:border-sky-200 hover:bg-sky-50"
                                >
                                  <span className="font-semibold text-sky-800">{invoice.codigo}</span>
                                  <span className="text-slate-600">{formatDate(invoice.fecha)}</span>
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClasses(invoice.estado_pago_badge_tone)}`}>
                                    {INVOICE_STATUS_LABELS[invoice.estado_pago_derivado as keyof typeof INVOICE_STATUS_LABELS] ?? invoice.estado_pago_derivado.toLowerCase()}
                                  </span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(invoice.total)}</span>
                                </a>
                              ))
                            )}
                          </div>
                        </section>
                        <section className="erp-subsection">
                          <p className="eyebrow">Productos comprados</p>
                          <div className="mt-3 space-y-2">
                            {purchasedProducts.length === 0 ? (
                              <p className="text-sm text-[color:var(--muted)]">Sin productos comprados.</p>
                            ) : (
                              purchasedProducts.map((product) => (
                                <div
                                  key={`${customer.id}-${product.codigo}`}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-2 text-sm"
                                >
                                  <a
                                    href={`/?section=productos&productoId=${encodeURIComponent(product.codigo)}&origen=cliente`}
                                    className="odoo-link"
                                  >
                                    {product.codigo} · {product.nombre}
                                  </a>
                                  <span className="text-[color:var(--muted)]">{product.cantidad} uds</span>
                                </div>
                              ))
                            )}
                          </div>
                        </section>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
      </tbody>
      </table>
    </>
  );
}

export function OrdersInlineBoard({
  orders,
  customers,
  products,
  focusedOrderCode,
  focusedCustomerCode,
}: {
  orders: OrderCard[];
  customers: CustomerOption[];
  products: ProductOption[];
  focusedOrderCode?: string | null;
  focusedCustomerCode?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const focusedOrder = focusedOrderCode ? orders.find((order) => order.codigo === focusedOrderCode) ?? null : null;
  const visibleOrders = focusedOrder ? [focusedOrder] : orders;

  return (
    <div className="odoo-page">
      {visibleOrders.map((order) => {
        const editing = editingId === order.id;
        const focused = focusedOrderCode === order.codigo;
        const latestHistory = order.historial[0] ?? null;
        const editable = ["BORRADOR", "INCIDENCIA_STOCK"].includes(order.estado);
        const lineDraft = [...order.lineas.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - order.lineas.length) }, () => null)];

        return (
            <article
              key={order.id}
              className={`odoo-record ${
                focused
                  ? "ring-2 ring-[color:var(--brand)] ring-offset-2 ring-offset-[color:var(--surface)] shadow-[0_22px_55px_rgba(37,99,235,0.18)]"
                : order.tiene_incidencia_stock
                ? rowHighlight("danger")
                : order.estado_derivado === "LISTO" || order.estado_derivado === "ENTREGADO"
                  ? rowHighlight("attention")
                  : ""
            }`}
          >
            {editing ? (
              <form action={updateOrderAction} className="space-y-4">
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="estado" value={order.estado} />
                <div className="table-edit-toolbar">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">{order.codigo}</p>
                    <h4 className="mt-2 text-lg font-semibold">Editar pedido</h4>
                  </div>
                  <div className="table-action-group">
                    <SubmitButton
                      variant="icon-dark"
                      pendingText={<SpinnerIcon />}
                      title="Guardar"
                      aria-label="Guardar"
                    >
                      <CheckIcon />
                    </SubmitButton>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      title="Cancelar"
                      aria-label="Cancelar"
                      className="icon-action-button"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>
                <div className="table-edit-card">
                  <InlineField label="Cliente">
                    <select name="clienteId" className={tableInputClass} defaultValue={order.cliente_id}>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.codigo} - {customer.nombre}
                        </option>
                      ))}
                    </select>
                  </InlineField>
                </div>
                <div className="table-edit-card">
                  <InlineField
                    label="Descuento (€)"
                    hint="Importe final a descontar, IVA incluido"
                  >
                    <input
                      name="descuento"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={order.descuento.toFixed(2)}
                      className={tableInputClass}
                    />
                  </InlineField>
                </div>
                {lineDraft.map((line, index) => (
                  <div key={`${order.id}-line-${index}`} className="table-edit-card">
                    <p className="table-inline-label">Linea {index + 1}</p>
                    <div className="mt-3 table-edit-grid-3">
                      <InlineField label="Producto">
                        <select
                          name={`producto_${index + 1}`}
                          className={tableInputClass}
                          defaultValue={line?.producto_id ?? ""}
                        >
                          <option value="">Producto linea {index + 1}</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.codigo} - {product.nombre}
                            </option>
                          ))}
                        </select>
                      </InlineField>
                      <InlineField label="Cantidad">
                        <input
                          name={`cantidad_${index + 1}`}
                          type="number"
                          min="0"
                          defaultValue={line?.cantidad ?? ""}
                          className={tableInputClass}
                        />
                      </InlineField>
                      <InlineField label="Precio unitario">
                        <input
                          name={`precio_${index + 1}`}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={line?.precio_unitario ?? ""}
                          className={tableInputClass}
                        />
                      </InlineField>
                    </div>
                  </div>
                ))}
                <div className="table-edit-card">
                  <InlineField label="Observaciones">
                    <textarea
                      name="observaciones"
                      rows={3}
                      defaultValue={order.observaciones ?? ""}
                      className={tableTextareaClass}
                      placeholder="Observaciones"
                    />
                  </InlineField>
                </div>
              </form>
            ) : (
              <>
                {(() => {
                  const baseImponible = deriveTaxableBase(order.total, order.iva);
                  return (
                    <>
                      {focused ? (
                        <div className="mb-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                          Pedido relacionado abierto desde facturas
                        </div>
                      ) : null}
                      <div className="odoo-record-header">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">{order.codigo}</p>
                          <h4 className="mt-2 text-[1.55rem] font-semibold tracking-[-0.03em]">{order.cliente_nombre}</h4>
                          <a
                            href={`/?section=clientes&clienteId=${encodeURIComponent(order.cliente_codigo)}&origen=pedido`}
                            className="mt-2 inline-flex items-center text-sm font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-900"
                          >
                            Ver cliente {order.cliente_codigo}
                          </a>
                          <p className="mt-2 text-sm text-[color:var(--muted)]">{formatDate(order.fecha_pedido)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_badge_tone)}`}>
                            {orderStatusLabel(order.estado_derivado)}
                          </span>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_pago_badge_tone)}`}>
                            pago: {INVOICE_STATUS_LABELS[order.estado_pago_derivado as keyof typeof INVOICE_STATUS_LABELS] ?? order.estado_pago_derivado.toLowerCase()}
                          </span>
                            {focused ? (
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses("info")}`}>
                                trazabilidad activa
                              </span>
                            ) : null}
                            {focusedCustomerCode === order.cliente_codigo ? (
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses("info")}`}>
                                cliente relacionado
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="odoo-record-grid">
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Subtotal IVA incluido</p>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(order.subtotal)}</p>
                        </div>
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Descuento IVA incluido</p>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(order.descuento)}</p>
                        </div>
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Base imponible</p>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(baseImponible)}</p>
                        </div>
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">IVA incluido</p>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(order.iva)}</p>
                        </div>
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Total pedido</p>
                          <p className="mt-2 text-lg font-semibold">{formatCurrency(order.total)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Coste</p>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(order.coste_total_pedido)}</p>
                        </div>
                        <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Beneficio</p>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(order.beneficio_total)}</p>
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div className="odoo-record-body">
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Desde stock</th>
                          <th>A fabricar</th>
                          <th>Precio unitario</th>
                          <th>Venta linea</th>
                          <th>Coste linea</th>
                          <th>Beneficio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lineas.map((line) => (
                          <tr key={line.id}>
                            <td>{line.producto_nombre}</td>
                            <td>{line.cantidad}</td>
                            <td>{line.cantidad_desde_stock} uds</td>
                            <td>{line.cantidad_a_fabricar} uds</td>
                            <td>{formatCurrency(line.precio_unitario)}</td>
                            <td>{formatCurrency(line.precio_total_linea)}</td>
                            <td>{formatCurrency(line.coste_total)}</td>
                            <td>{formatCurrency(line.beneficio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {latestHistory ? (
                  <p className="mt-3 text-sm text-[color:var(--muted)]">
                    Ultimo cambio: {formatDate(latestHistory.fecha)} - {latestHistory.nota}
                  </p>
                ) : null}

                <div className="mt-3 table-action-group">
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setEditingId(order.id)}
                      title="Editar"
                      aria-label="Editar"
                      className="icon-action-button icon-action-button--soft"
                    >
                      <PencilIcon />
                    </button>
                  ) : null}
                  {order.acciones_permitidas.includes("process_order") ? (
                    <form action={processOrderAction}>
                      <input type="hidden" name="pedidoId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Procesar pedido"
                        aria-label="Procesar pedido"
                      >
                        <CheckIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {order.tiene_incidencia_stock ? (
                    <form action={retryOrderAction}>
                      <input type="hidden" name="pedidoId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Reintentar"
                        aria-label="Reintentar"
                      >
                        <RotateIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {order.acciones_permitidas.includes("deliver_order") ? (
                    <form action={deliverOrderAction}>
                      <input type="hidden" name="pedidoId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Entregar"
                        aria-label="Entregar"
                      >
                        <TruckIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {order.acciones_permitidas.includes("invoice_order") ? (
                    <form action={generateInvoiceAction}>
                      <input type="hidden" name="pedidoId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Generar factura"
                        aria-label="Generar factura"
                      >
                        <InvoiceIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {order.acciones_permitidas.includes("view_manufacturing") ? (
                    <span className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--muted)]">
                      Fabricacion pendiente en cola
                    </span>
                  ) : null}
                  {order.factura ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      Factura generada
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function MaterialsInlineTable({ materials }: { materials: Material[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeProductTab, setActiveProductTab] = useState<"customers" | "orders" | "invoices" | "printers">("customers");
  const focusedProduct = {} as Product;
  const focusOriginLabel = null;
  const focusedInventory = { cantidad_disponible: 0 } as FinishedInventory;
  const customerPurchases: Array<{ clienteId: string; clienteCodigo: string; clienteNombre: string; cantidad: number }> = [];
  const productOrders: Array<OrderCard> = [];
  const relatedInvoices: Array<Invoice> = [];
  const printerUsage: Array<{ impresoraId: string; impresoraCodigo: string; impresoraNombre: string; fabricaciones: number; cantidad: number }> = [];

  return (
    <>
      {false ? (
        <div className="mb-5 odoo-page">
          <article className="odoo-record ring-2 ring-[color:var(--brand)] ring-offset-2 ring-offset-[color:var(--surface)] shadow-[0_22px_55px_rgba(37,99,235,0.18)]">
            <div className="odoo-record-header">
              <div>
                <p className="eyebrow">Producto</p>
                <h3 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {focusedProduct.nombre}
                </h3>
                <p className="mt-2 text-sm font-semibold text-sky-700">{focusedProduct.codigo}</p>
                <div className="mt-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  Producto abierto desde {focusOriginLabel ?? "cliente/pedido/factura"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedProduct.activo ? "success" : "neutral")}`}>
                    {archiveStatusLabel(focusedProduct.activo)}
                </span>
                {focusedInventory ? (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedInventory.cantidad_disponible > 0 ? "info" : "neutral")}`}>
                    stock: {focusedInventory.cantidad_disponible} uds
                  </span>
                ) : null}
              </div>
            </div>

            <div className="odoo-record-grid">
              <div className="odoo-field">
                <span className="odoo-field-label">Codigo</span>
                <span className="odoo-field-value">{focusedProduct.codigo}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Enlace / modelo</span>
                <span className="odoo-field-value">
                  {focusedProduct.enlace_modelo ? (
                    <a href={focusedProduct.enlace_modelo ?? undefined} className="odoo-link" target="_blank" rel="noreferrer">
                      Abrir modelo
                    </a>
                  ) : (
                    "-"
                  )}
                </span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Gramos estimados</span>
                <span className="odoo-field-value">{focusedProduct.gramos_estimados} g</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Coste total</span>
                <span className="odoo-field-value">{formatCurrency(focusedProduct.coste_total_producto)}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">PVP</span>
                <span className="odoo-field-value">{formatCurrency(focusedProduct.pvp)}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Margen</span>
                <span className="odoo-field-value">{formatCurrency(focusedProduct.margen)}</span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Estado / stock</span>
                <span className="odoo-field-value">
                  {focusedInventory
                    ? `${archiveStatusLabel(focusedProduct.activo)} · ${focusedInventory.cantidad_disponible} uds disponibles`
                    : archiveStatusLabel(focusedProduct.activo)}
                </span>
              </div>
              <div className="odoo-field">
                <span className="odoo-field-label">Material base</span>
                <span className="odoo-field-value">{focusedProduct.material_nombre}</span>
              </div>
            </div>

            <div className="odoo-tabs">
              <button type="button" onClick={() => setActiveProductTab("customers")} className={`odoo-tab ${activeProductTab === "customers" ? "is-active" : ""}`}>
                Clientes que lo han comprado
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{customerPurchases.length}</span>
              </button>
              <button type="button" onClick={() => setActiveProductTab("orders")} className={`odoo-tab ${activeProductTab === "orders" ? "is-active" : ""}`}>
                Pedidos relacionados
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{productOrders.length}</span>
              </button>
              <button type="button" onClick={() => setActiveProductTab("invoices")} className={`odoo-tab ${activeProductTab === "invoices" ? "is-active" : ""}`}>
                Facturas relacionadas
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{relatedInvoices.length}</span>
              </button>
              <button type="button" onClick={() => setActiveProductTab("printers")} className={`odoo-tab ${activeProductTab === "printers" ? "is-active" : ""}`}>
                Impresoras utilizadas
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{printerUsage.length}</span>
              </button>
            </div>

            <div className="odoo-record-body">
              {activeProductTab === "customers" ? (
                customerPurchases.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin clientes relacionados.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr><th>Cliente</th><th>Cantidad total</th></tr>
                      </thead>
                      <tbody>
                        {customerPurchases.map((customer) => (
                          <tr key={`${focusedProduct.id}-${customer.clienteId}`}>
                            <td><a href={`/?section=clientes&clienteId=${encodeURIComponent(customer.clienteCodigo)}`} className="odoo-link">{customer.clienteCodigo} · {customer.clienteNombre}</a></td>
                            <td>{customer.cantidad} uds</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
              {activeProductTab === "orders" ? (
                productOrders.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin pedidos relacionados.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Cantidad</th></tr>
                      </thead>
                      <tbody>
                        {productOrders.map((order) => {
                          const quantity = order.lineas.filter((line) => line.producto_id === focusedProduct.id).reduce((sum, line) => sum + line.cantidad, 0);
                          return (
                            <tr key={`${focusedProduct.id}-${order.id}`}>
                              <td><a href={`/?section=pedidos&pedidoId=${encodeURIComponent(order.codigo)}`} className="odoo-link">{order.codigo}</a></td>
                              <td>{formatDate(order.fecha_pedido)}</td>
                              <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_badge_tone)}`}>{orderStatusLabel(order.estado_derivado)}</span></td>
                              <td>{quantity} uds</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
              {activeProductTab === "invoices" ? (
                relatedInvoices.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin facturas relacionadas.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr><th>Factura</th><th>Fecha</th><th>Estado</th><th>Total</th></tr>
                      </thead>
                      <tbody>
                        {relatedInvoices.map((invoice) => (
                          <tr key={`${focusedProduct.id}-${invoice.id}`}>
                            <td><a href={`/?section=facturas&facturaId=${encodeURIComponent(invoice.codigo)}`} className="odoo-link">{invoice.codigo}</a></td>
                            <td>{formatDate(invoice.fecha)}</td>
                            <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(invoice.estado_pago_badge_tone)}`}>{INVOICE_STATUS_LABELS[invoice.estado_pago_derivado as keyof typeof INVOICE_STATUS_LABELS] ?? invoice.estado_pago_derivado.toLowerCase()}</span></td>
                            <td>{formatCurrency(invoice.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
              {activeProductTab === "printers" ? (
                printerUsage.length === 0 ? (
                  <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin impresoras relacionadas.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr><th>Impresora</th><th>Fabricaciones</th><th>Cantidad fabricada</th></tr>
                      </thead>
                      <tbody>
                        {printerUsage.map((printer) => (
                          <tr key={`${focusedProduct.id}-${printer.impresoraId}`}>
                            <td><a href={`/?section=impresoras&impresoraId=${encodeURIComponent(printer.impresoraCodigo)}&origen=producto`} className="odoo-link">{printer.impresoraCodigo} · {printer.impresoraNombre}</a></td>
                            <td>{printer.fabricaciones}</td>
                            <td>{printer.cantidad} uds</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
            </div>
          </article>
        </div>
      ) : null}
      <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Material</th><th>Precio/kg</th><th>Stock</th><th>Alerta</th></tr>
      </thead>
      <tbody>
        {materials.map((material) => {
          const editing = editingId === material.id;
          const formId = `material-form-${material.id}`;
          const stockTone =
            material.stock_actual_g === 0
              ? "danger"
              : material.stock_actual_g <= material.stock_minimo_g
                ? "warn"
                : null;
          return (
            <tr
              key={material.id}
              className={rowHighlight(
                !material.activo
                  ? "attention"
                  : stockTone,
              )}
            >
              <td>
                <form id={formId} action={updateMaterialAction}>
                  <input type="hidden" name="id" value={material.id} />
                </form>
                <div className="table-action-group">
                  <ActionButtons
                    editing={editing}
                    onEdit={() => setEditingId(material.id)}
                    onCancel={() => setEditingId(null)}
                    formId={formId}
                  />
                  {!editing ? (
                    <form action={toggleMaterialActiveAction} onSubmit={confirmArchiveOnSubmit(material.activo)}>
                      <input type="hidden" name="id" value={material.id} />
                      <input type="hidden" name="active" value={material.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={material.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={archiveActionLabel(material.activo)}
                        aria-label={archiveActionLabel(material.activo)}
                      >
                        {material.activo ? <ArchiveIcon /> : <RestoreIcon />}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </td>
              <td>{material.codigo}</td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit--wide table-edit-card">
                    <div className="table-edit-grid-2">
                      <InlineField label="Material">
                        <input form={formId} name="nombre" defaultValue={material.nombre} className={tableInputClass} placeholder="Material" />
                      </InlineField>
                      <InlineField label="Nombre comercial">
                        <input form={formId} name="nombreComercial" defaultValue={material.nombre_comercial ?? ""} className={tableInputClass} placeholder="Nombre comercial" />
                      </InlineField>
                    </div>
                    <div className="table-edit-grid-2">
                      <InlineField label="Marca">
                        <input form={formId} name="marca" defaultValue={material.marca} className={tableInputClass} placeholder="Marca" />
                      </InlineField>
                      <InlineField label="Tipo">
                        <input form={formId} name="tipo" defaultValue={material.tipo} className={tableInputClass} placeholder="Tipo" />
                      </InlineField>
                    </div>
                    <div className="table-edit-grid-2">
                      <InlineField label="Color visible">
                        <input form={formId} name="color" defaultValue={material.color} className={tableInputClass} placeholder="Color visible" />
                      </InlineField>
                      <InlineField label="Tipo color">
                        <input form={formId} name="tipoColor" defaultValue={material.tipo_color ?? ""} className={tableInputClass} placeholder="Tipo color" />
                      </InlineField>
                    </div>
                    <div className="table-edit-grid-2">
                      <InlineField label="Color base">
                        <input form={formId} name="colorBase" defaultValue={material.color_base ?? ""} className={tableInputClass} placeholder="Color base" />
                      </InlineField>
                      <InlineField label="Efecto">
                        <input form={formId} name="efecto" defaultValue={material.efecto ?? ""} className={tableInputClass} placeholder="Efecto" />
                      </InlineField>
                    </div>
                    <div className="table-edit-grid-2">
                      <InlineField label="Diametro mm">
                        <input form={formId} name="diametroMm" type="number" min="0" step="0.01" defaultValue={material.diametro_mm ?? ""} className={tableInputClass} placeholder="Diametro mm" />
                      </InlineField>
                      <InlineField label="Peso spool g">
                        <input form={formId} name="pesoSpoolG" type="number" min="0" defaultValue={material.peso_spool_g ?? ""} className={tableInputClass} placeholder="Peso spool g" />
                      </InlineField>
                    </div>
                    <div className="table-edit-grid-2">
                      <InlineField label="Temp extrusor">
                        <input form={formId} name="tempExtrusor" type="number" min="0" defaultValue={material.temp_extrusor ?? ""} className={tableInputClass} placeholder="Temp extrusor" />
                      </InlineField>
                      <InlineField label="Temp cama">
                        <input form={formId} name="tempCama" type="number" min="0" defaultValue={material.temp_cama ?? ""} className={tableInputClass} placeholder="Temp cama" />
                      </InlineField>
                    </div>
                    <InlineField label="Proveedor">
                      <input form={formId} name="proveedor" defaultValue={material.proveedor ?? ""} className={tableInputClass} placeholder="Proveedor" />
                    </InlineField>
                    <InlineField label="Notas">
                      <textarea form={formId} name="notas" defaultValue={material.notas ?? ""} rows={2} className={tableTextareaClass} placeholder="Notas" />
                    </InlineField>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-[color:var(--muted)]">
                      <span className="font-semibold text-[color:var(--foreground)]">
                        {material.marca} - {material.tipo}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {[
                        material.tipo_color,
                        material.efecto,
                        material.color_base ?? material.color,
                      ]
                        .filter(Boolean)
                        .join(" · ") || material.color}
                    </div>
                    {material.nombre_comercial || material.nombre ? (
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        {[material.nombre, material.nombre_comercial]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(material.activo ? "success" : "neutral")}`}>
                        {archiveStatusLabel(material.activo)}
                      </span>
                    </div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="precioKg" type="number" min="0" step="0.01" defaultValue={material.precio_kg} className={tableInputClass} />
                ) : (
                  `${material.precio_kg.toFixed(2)} EUR`
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit table-edit-card">
                    <input form={formId} name="stockActualG" type="hidden" value={material.stock_actual_g} />
                    <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-2 text-sm">
                      Stock actual: {material.stock_actual_g} g
                    </div>
                    <InlineField label="Stock minimo">
                      <input form={formId} name="stockMinimoG" type="number" min="0" defaultValue={material.stock_minimo_g} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  <div>
                    <div>{material.stock_actual_g} g</div>
                    <div className="text-xs text-[color:var(--muted)]">Min: {material.stock_minimo_g} g</div>
                  </div>
                )}
              </td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      stockTone === "danger"
                        ? badgeClasses("danger")
                        : stockTone === "warn"
                          ? badgeClasses("warn")
                          : badgeClasses("success")
                    }`}
                  >
                    {stockTone === "danger" ? "Sin stock" : stockTone === "warn" ? "Bajo minimo" : "OK"}
                  </span>
                  {!material.activo ? (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses("neutral")}`}>
                      Archivado
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
      </table>
    </>
  );
}

export function ProductsInlineTable({
  products,
  materials,
  focusedProductCode,
  focusOriginLabel,
  orders,
  invoices,
  manufacturingOrders,
  finishedInventory,
  showFocusedDetails = true,
}: {
  products: Product[];
  materials: MaterialOption[];
  focusedProductCode?: string | null;
  focusOriginLabel?: string | null;
  orders: OrderCard[];
  invoices: Invoice[];
  manufacturingOrders: ManufacturingOrder[];
  finishedInventory: FinishedInventory[];
  showFocusedDetails?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeProductTab, setActiveProductTab] = useState<"customers" | "orders" | "invoices" | "printers">("customers");
  const focusedProduct = focusedProductCode ? products.find((product) => product.codigo === focusedProductCode) ?? null : null;
  const visibleProducts = focusedProduct
    ? [focusedProduct, ...products.filter((product) => product.codigo !== focusedProductCode)]
    : products;
  const focusedInventory = focusedProduct
    ? finishedInventory.find((item) => item.product_id === focusedProduct.id) ?? null
    : null;
  const productOrders = focusedProduct
    ? orders.filter((order) => order.lineas.some((line) => line.producto_id === focusedProduct.id))
    : [];
  const relatedOrderIds = new Set(productOrders.map((order) => order.id));
  const relatedInvoices = focusedProduct ? invoices.filter((invoice) => relatedOrderIds.has(invoice.pedido_id)) : [];
  const customerPurchases = focusedProduct
    ? Array.from(
        productOrders
          .reduce((accumulator, order) => {
            const quantity = order.lineas
              .filter((line) => line.producto_id === focusedProduct.id)
              .reduce((sum, line) => sum + line.cantidad, 0);
            const current = accumulator.get(order.cliente_id);
            accumulator.set(order.cliente_id, {
              clienteId: order.cliente_id,
              clienteCodigo: order.cliente_codigo,
              clienteNombre: order.cliente_nombre,
              cantidad: (current?.cantidad ?? 0) + quantity,
            });
            return accumulator;
          }, new Map<string, { clienteId: string; clienteCodigo: string; clienteNombre: string; cantidad: number }>())
          .values(),
      ).sort((a, b) => a.clienteCodigo.localeCompare(b.clienteCodigo, "es"))
    : [];
  const printerUsage = focusedProduct
    ? Array.from(
        manufacturingOrders
          .filter(
            (order) =>
              order.producto_id === focusedProduct.id &&
              order.impresora_id &&
              order.impresora_codigo &&
              order.impresora_nombre,
          )
          .reduce((accumulator, order) => {
            const current = accumulator.get(order.impresora_id!);
            accumulator.set(order.impresora_id!, {
              impresoraId: order.impresora_id!,
              impresoraCodigo: order.impresora_codigo!,
              impresoraNombre: order.impresora_nombre!,
              fabricaciones: (current?.fabricaciones ?? 0) + 1,
              cantidad: (current?.cantidad ?? 0) + order.cantidad,
            });
            return accumulator;
          }, new Map<string, { impresoraId: string; impresoraCodigo: string; impresoraNombre: string; fabricaciones: number; cantidad: number }>())
          .values(),
      ).sort((a, b) => a.impresoraCodigo.localeCompare(b.impresoraCodigo, "es"))
    : [];

  return (
    <>
      {showFocusedDetails && focusedProduct ? (
        <div className="mb-5 odoo-page">
          <article className="odoo-record ring-2 ring-[color:var(--brand)] ring-offset-2 ring-offset-[color:var(--surface)] shadow-[0_22px_55px_rgba(37,99,235,0.18)]">
            <div className="odoo-record-header">
              <div>
                <p className="eyebrow">Producto</p>
                <h3 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.04em] text-slate-950">{focusedProduct.nombre}</h3>
                <p className="mt-2 text-sm font-semibold text-sky-700">{focusedProduct.codigo}</p>
                <div className="mt-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  Producto abierto desde {focusOriginLabel ?? "cliente/pedido/factura"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedProduct.activo ? "success" : "neutral")}`}>
                    {archiveStatusLabel(focusedProduct.activo)}
                </span>
                {focusedInventory ? (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(focusedInventory.cantidad_disponible > 0 ? "info" : "neutral")}`}>
                    stock: {focusedInventory.cantidad_disponible} uds
                  </span>
                ) : null}
              </div>
            </div>
            <div className="odoo-record-grid">
              <div className="odoo-field"><span className="odoo-field-label">Codigo</span><span className="odoo-field-value">{focusedProduct.codigo}</span></div>
              <div className="odoo-field"><span className="odoo-field-label">Enlace / modelo</span><span className="odoo-field-value">{focusedProduct.enlace_modelo ? <a href={focusedProduct.enlace_modelo} className="odoo-link" target="_blank" rel="noreferrer">Abrir modelo</a> : "-"}</span></div>
              <div className="odoo-field"><span className="odoo-field-label">Gramos estimados</span><span className="odoo-field-value">{focusedProduct.gramos_estimados} g</span></div>
              <div className="odoo-field"><span className="odoo-field-label">Coste total</span><span className="odoo-field-value">{formatCurrency(focusedProduct.coste_total_producto)}</span></div>
              <div className="odoo-field"><span className="odoo-field-label">PVP</span><span className="odoo-field-value">{formatCurrency(focusedProduct.pvp)}</span></div>
              <div className="odoo-field"><span className="odoo-field-label">Margen</span><span className="odoo-field-value">{formatCurrency(focusedProduct.margen)}</span></div>
                  <div className="odoo-field"><span className="odoo-field-label">Estado / stock</span><span className="odoo-field-value">{focusedInventory ? `${archiveStatusLabel(focusedProduct.activo)} · ${focusedInventory.cantidad_disponible} uds disponibles` : archiveStatusLabel(focusedProduct.activo)}</span></div>
              <div className="odoo-field"><span className="odoo-field-label">Material base</span><span className="odoo-field-value">{focusedProduct.material_nombre}</span></div>
            </div>
            <div className="odoo-tabs">
              <button type="button" onClick={() => setActiveProductTab("customers")} className={`odoo-tab ${activeProductTab === "customers" ? "is-active" : ""}`}>Clientes que lo han comprado<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{customerPurchases.length}</span></button>
              <button type="button" onClick={() => setActiveProductTab("orders")} className={`odoo-tab ${activeProductTab === "orders" ? "is-active" : ""}`}>Pedidos relacionados<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{productOrders.length}</span></button>
              <button type="button" onClick={() => setActiveProductTab("invoices")} className={`odoo-tab ${activeProductTab === "invoices" ? "is-active" : ""}`}>Facturas relacionadas<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{relatedInvoices.length}</span></button>
              <button type="button" onClick={() => setActiveProductTab("printers")} className={`odoo-tab ${activeProductTab === "printers" ? "is-active" : ""}`}>Impresoras utilizadas<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{printerUsage.length}</span></button>
            </div>
            <div className="odoo-record-body">
              {activeProductTab === "customers" ? (customerPurchases.length === 0 ? <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin clientes relacionados.</div> : <div className="table-wrap"><table className="odoo-list-table"><thead><tr><th>Cliente</th><th>Cantidad total</th></tr></thead><tbody>{customerPurchases.map((customer) => <tr key={`${focusedProduct.id}-${customer.clienteId}`}><td><a href={`/?section=clientes&clienteId=${encodeURIComponent(customer.clienteCodigo)}`} className="odoo-link">{customer.clienteCodigo} · {customer.clienteNombre}</a></td><td>{customer.cantidad} uds</td></tr>)}</tbody></table></div>) : null}
              {activeProductTab === "orders" ? (productOrders.length === 0 ? <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin pedidos relacionados.</div> : <div className="table-wrap"><table className="odoo-list-table"><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Cantidad</th></tr></thead><tbody>{productOrders.map((order) => { const quantity = order.lineas.filter((line) => line.producto_id === focusedProduct.id).reduce((sum, line) => sum + line.cantidad, 0); return <tr key={`${focusedProduct.id}-${order.id}`}><td><a href={`/?section=pedidos&pedidoId=${encodeURIComponent(order.codigo)}`} className="odoo-link">{order.codigo}</a></td><td>{formatDate(order.fecha_pedido)}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_badge_tone)}`}>{orderStatusLabel(order.estado_derivado)}</span></td><td>{quantity} uds</td></tr>; })}</tbody></table></div>) : null}
              {activeProductTab === "invoices" ? (relatedInvoices.length === 0 ? <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin facturas relacionadas.</div> : <div className="table-wrap"><table className="odoo-list-table"><thead><tr><th>Factura</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead><tbody>{relatedInvoices.map((invoice) => <tr key={`${focusedProduct.id}-${invoice.id}`}><td><a href={`/?section=facturas&facturaId=${encodeURIComponent(invoice.codigo)}`} className="odoo-link">{invoice.codigo}</a></td><td>{formatDate(invoice.fecha)}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(invoice.estado_pago_badge_tone)}`}>{INVOICE_STATUS_LABELS[invoice.estado_pago_derivado as keyof typeof INVOICE_STATUS_LABELS] ?? invoice.estado_pago_derivado.toLowerCase()}</span></td><td>{formatCurrency(invoice.total)}</td></tr>)}</tbody></table></div>) : null}
              {activeProductTab === "printers" ? (printerUsage.length === 0 ? <div className="odoo-muted-box text-sm text-[color:var(--muted)]">Sin impresoras relacionadas.</div> : <div className="table-wrap"><table className="odoo-list-table"><thead><tr><th>Impresora</th><th>Fabricaciones</th><th>Cantidad fabricada</th></tr></thead><tbody>{printerUsage.map((printer) => <tr key={`${focusedProduct.id}-${printer.impresoraId}`}><td><a href={`/?section=impresoras&impresoraId=${encodeURIComponent(printer.impresoraCodigo)}&origen=producto`} className="odoo-link">{printer.impresoraCodigo} · {printer.impresoraNombre}</a></td><td>{printer.fabricaciones}</td><td>{printer.cantidad} uds</td></tr>)}</tbody></table></div>) : null}
            </div>
          </article>
        </div>
      ) : null}
      <table className="table">
      <thead>
        <tr>
          <th>Acciones</th>
          <th>ID</th>
          <th>Producto</th>
          <th>Material</th>
          <th>Costes</th>
          <th>PVP / IVA</th>
        </tr>
      </thead>
      <tbody>
        {visibleProducts.map((product) => {
          const editing = editingId === product.id;
          const focused = focusedProductCode === product.codigo;
          const formId = `product-form-${product.id}`;
          const availableMaterials = materials.filter(
            (material) => material.activo || material.id === product.material_id,
          );

          return (
            <tr
              key={product.id}
              className={`${
                focused
                  ? "bg-sky-50/90 ring-2 ring-inset ring-sky-300"
                  : !product.activo
                    ? `${rowHighlight("attention")} opacity-75`
                    : ""
              }`.trim()}
            >
              <td>
                <form id={formId} action={updateProductAction}>
                  <input type="hidden" name="id" value={product.id} />
                </form>
                <div className="table-action-group">
                  <ActionButtons
                    editing={editing}
                    onEdit={() => setEditingId(product.id)}
                    onCancel={() => setEditingId(null)}
                    formId={formId}
                  />
                  {!editing ? (
                    <form action={toggleProductActiveAction} onSubmit={confirmArchiveOnSubmit(product.activo)}>
                      <input type="hidden" name="id" value={product.id} />
                      <input type="hidden" name="active" value={product.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={product.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={archiveActionLabel(product.activo)}
                        aria-label={archiveActionLabel(product.activo)}
                      >
                        {product.activo ? <ArchiveIcon /> : <RestoreIcon />}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </td>

              <td>{product.codigo}</td>

              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit--wide">
                    <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                        Datos básicos
                      </p>

                      <div className="table-edit-stack">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Nombre del producto
                          </label>
                          <input
                            form={formId}
                            name="nombre"
                            defaultValue={product.nombre}
                            className={tableInputClass}
                            placeholder="Ej: Figura decorativa"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Descripción
                          </label>
                          <textarea
                            form={formId}
                            name="descripcion"
                            defaultValue={product.descripcion ?? ""}
                            rows={2}
                            className={tableTextareaClass}
                            placeholder="Descripción breve del producto"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Enlace del modelo
                          </label>
                          <input
                            form={formId}
                            name="enlaceModelo"
                            defaultValue={product.enlace_modelo ?? ""}
                            className={tableInputClass}
                            placeholder="https://..."
                          />
                        </div>

                        <label className="mt-1 flex items-center gap-2 text-sm font-medium text-[color:var(--muted-strong)]">
                          <input
                            form={formId}
                            type="checkbox"
                            name="activo"
                            defaultChecked={product.activo}
                          />
                          Producto activo
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <a href={`/?section=productos&productoId=${encodeURIComponent(product.codigo)}`} className="odoo-link font-medium">{product.nombre}</a>
                    <div className="text-xs text-[color:var(--muted)]">
                      {product.gramos_estimados} g · {product.tiempo_impresion_horas} h
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          badgeClasses(product.activo ? "success" : "neutral")
                        }`}
                      >
                          {archiveStatusLabel(product.activo)}
                      </span>
                    </div>
                  </div>
                )}
              </td>

              <td>
                {editing ? (
                  <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                      Material base
                    </p>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                      Material
                    </label>
                    <select
                      form={formId}
                      name="materialId"
                      defaultValue={product.material_id}
                      className={tableInputClass}
                    >
                      {availableMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.codigo} - {material.nombre} - {material.color}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  product.material_nombre
                )}
              </td>

              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit">
                    <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                        Producción
                      </p>

                      <div className="table-edit-grid-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Gramos estimados
                          </label>
                          <input
                            form={formId}
                            name="gramosEstimados"
                            type="number"
                            min="1"
                            defaultValue={product.gramos_estimados}
                            className={tableInputClass}
                            placeholder="120"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Tiempo impresión (h)
                          </label>
                          <input
                            form={formId}
                            name="tiempoImpresionHoras"
                            type="number"
                            min="0.1"
                            step="0.1"
                            defaultValue={product.tiempo_impresion_horas}
                            className={tableInputClass}
                            placeholder="3.5"
                          />
                        </div>
                      </div>

                      <div className="mt-3 table-edit-grid-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Coste electricidad
                          </label>
                          <input
                            form={formId}
                            name="costeElectricidad"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={product.coste_electricidad}
                            className={tableInputClass}
                            placeholder="0.50"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Coste máquina
                          </label>
                          <input
                            form={formId}
                            name="costeMaquina"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={product.coste_maquina}
                            className={tableInputClass}
                            placeholder="1.20"
                          />
                        </div>
                      </div>

                      <div className="mt-3 table-edit-grid-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Coste mano de obra
                          </label>
                          <input
                            form={formId}
                            name="costeManoObra"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={product.coste_mano_obra}
                            className={tableInputClass}
                            placeholder="2.00"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                            Coste postprocesado
                          </label>
                          <input
                            form={formId}
                            name="costePostprocesado"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={product.coste_postprocesado}
                            className={tableInputClass}
                            placeholder="1.00"
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                          Margen
                        </label>
                        <input
                          form={formId}
                          name="margen"
                          type="number"
                          step="0.01"
                          defaultValue={product.margen}
                          className={tableInputClass}
                          placeholder="2.20"
                        />
                      </div>

                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                          IVA producto (%)
                        </label>
                        <input
                          form={formId}
                          name="ivaPorcentaje"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          defaultValue={product.iva_porcentaje}
                          className={tableInputClass}
                          placeholder="21"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div>Receta: {formatCurrency(product.coste_total_producto)}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      Material {formatCurrency(product.coste_material_estimado)} · Máquina {formatCurrency(product.coste_maquina)}
                    </div>
                  </div>
                )}
              </td>

              <td>
                {editing ? (
                  <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                      Venta
                    </p>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--muted-strong)]">
                      PVP
                    </label>
                    <input
                      form={formId}
                      name="pvp"
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={product.pvp}
                      className={tableInputClass}
                      placeholder="15.00"
                    />
                  </div>
                ) : (
                  <div>
                    <div>{formatCurrency(product.pvp)}</div>
                    <div className="text-xs text-[color:var(--muted)]">IVA: {product.iva_porcentaje}%</div>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

export function ManufacturingInlineTable({
  manufacturingOrders,
}: {
  manufacturingOrders: ManufacturingOrder[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Origen</th><th>Pedido</th><th>Producto</th><th>Estado</th><th>Impresora</th><th>Consumo</th></tr>
      </thead>
      <tbody>
        {manufacturingOrders.map((order) => {
          const editing = editingId === order.id;
          const formId = `manufacturing-form-${order.id}`;
          return (
            <tr
              key={order.id}
              className={rowHighlight(
                order.tiene_incidencia_stock || order.incidencia
                  ? "danger"
                  : order.estado_derivado === "EN_CURSO"
                    ? "attention"
                    : null,
              )}
            >
              <td>
                <form id={formId} action={updateManufacturingAction}>
                  <input type="hidden" name="id" value={order.id} />
                </form>
                <div className="table-action-group">
                  {!editing && order.acciones_permitidas.includes("complete_manufacturing") ? (
                    <form action={completeManufacturingAction}>
                      <input type="hidden" name="fabricacionId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Completar fabricación"
                        aria-label="Completar fabricación"
                      >
                        <CheckIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  <ActionButtons
                    editing={editing}
                    onEdit={() => setEditingId(order.id)}
                    onCancel={() => setEditingId(null)}
                    formId={formId}
                  />
                </div>
              </td>
              <td>{order.codigo}</td>
              <td>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.origen_fabricacion === "PARA_STOCK" ? "accent" : "info")}`}>
                  {order.origen_fabricacion_label}
                </span>
              </td>
              <td>{order.pedido_codigo ?? "-"}</td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit">
                    <div className="text-sm font-medium">{order.producto_nombre}</div>
                    <input form={formId} name="cantidad" type="number" min="1" defaultValue={order.cantidad} className={tableInputClass} />
                    <textarea form={formId} name="incidencia" defaultValue={order.incidencia ?? ""} rows={2} className={tableTextareaClass} />
                  </div>
                ) : (
                  order.producto_nombre
                )}
              </td>
              <td>
                {editing ? (
                  <select form={formId} name="estado" defaultValue={order.estado} className={tableInputClass}>
                    <option value="PENDIENTE">pendiente</option>
                    <option value="BLOQUEADA_POR_STOCK">bloqueada_por_stock</option>
                  </select>
                ) : (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_badge_tone)}`}>
                    {MANUFACTURING_STATUS_LABELS[order.estado_derivado as keyof typeof MANUFACTURING_STATUS_LABELS] ?? order.estado_derivado.toLowerCase()}
                  </span>
                )}
              </td>
              <td>
                {order.impresora_nombre ? (
                  <div>
                    <div>{order.impresora_codigo} - {order.impresora_nombre}</div>
                    <div className="text-xs text-[color:var(--muted)]">Coste: {formatCurrency(order.coste_impresora_total ?? 0)}</div>
                  </div>
                ) : (
                  "-"
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="tiempoRealHoras" type="number" min="0" step="0.1" defaultValue={order.tiempo_real_horas ?? ""} className={tableInputClass} />
                ) : (
                  <div>
                    <div>{order.gramos_consumidos ?? "-"} g</div>
                    <div className="text-xs text-[color:var(--muted)]">{order.tiempo_real_horas ?? "-"} h</div>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InvoicesInlineTable({
  invoices,
  focusedInvoiceCode,
}: {
  invoices: Invoice[];
  focusedInvoiceCode?: string | null;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const focusedInvoice = focusedInvoiceCode ? invoices.find((invoice) => invoice.codigo === focusedInvoiceCode) ?? null : null;
  const visibleInvoices = focusedInvoice ? [focusedInvoice, ...invoices.filter((invoice) => invoice.codigo !== focusedInvoiceCode)] : invoices;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Acciones</th>
          <th>Factura</th>
          <th>Pedido</th>
          <th>Cliente</th>
          <th>Subtotal IVA incl.</th>
          <th>Descuento IVA incl.</th>
          <th>Base</th>
          <th>IVA incl.</th>
          <th>Total</th>
          <th>Pagado</th>
          <th>Pendiente</th>
          <th>Pago</th>
        </tr>
      </thead>
      <tbody>
          {visibleInvoices.map((invoice) => {
            const focused = focusedInvoiceCode === invoice.codigo;
            const expanded = detailId === invoice.id || focused;
          const registeringPayment = paymentId === invoice.id;
          const { total, totalPaid, pendingAmount, paymentStatus, canRegisterPayment } =
            deriveInvoicePaymentView(invoice);
          const taxableBase = deriveTaxableBase(total, invoice.iva);
          const canEditDiscount = paymentStatus !== "PAGADA";
          const highlight =
            paymentStatus === "PENDIENTE"
              ? "warn"
              : paymentStatus === "PARCIAL"
                ? "attention"
                : null;

          return [
              <tr
                key={`invoice-${invoice.id}`}
                className={`${focused ? "bg-sky-50/80 ring-2 ring-inset ring-sky-300" : rowHighlight(highlight)}`.trim()}
              >
                <td>
                  <div className="table-action-group">
                    <button
                      type="button"
                      title={expanded ? "Ocultar detalle" : "Ver detalle"}
                      aria-label={expanded ? "Ocultar detalle" : "Ver detalle"}
                      className="icon-action-button icon-action-button--soft"
                      onClick={() => {
                        const nextOpen = detailId === invoice.id ? null : invoice.id;
                        setDetailId(nextOpen);
                        if (nextOpen === null) {
                          setPaymentId((current) => (current === invoice.id ? null : current));
                        }
                      }}
                    >
                      <EyeIcon />
                    </button>
                    <form action={collectInvoicePaymentAction}>
                      <input type="hidden" name="facturaId" value={invoice.id} />
                      <input type="hidden" name="metodoPago" value="TRANSFERENCIA" />
                      <SubmitButton
                        variant={canRegisterPayment ? "icon-dark" : "icon-soft"}
                        pendingText={<SpinnerIcon />}
                        title={canRegisterPayment ? "Cobrar factura" : "Factura totalmente pagada"}
                        aria-label={canRegisterPayment ? "Cobrar factura" : "Factura totalmente pagada"}
                        disabled={!canRegisterPayment}
                      >
                        <PaymentIcon />
                      </SubmitButton>
                    </form>
                    <a
                      href={`/api/exports/invoices/${invoice.id}/pdf`}
                      title="Descargar PDF"
                      aria-label="Descargar PDF"
                      className="icon-action-button icon-action-button--soft"
                    >
                      <DownloadIcon />
                    </a>
                  </div>
                </td>
                <td>{invoice.codigo}</td>
                <td>
                  <a
                    href={`/?section=pedidos&pedidoId=${encodeURIComponent(invoice.pedido_codigo)}`}
                    className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-900"
                  >
                    {invoice.pedido_codigo}
                  </a>
                </td>
                <td>
                  <div className="flex flex-col gap-1">
                    <span>{invoice.cliente_nombre}</span>
                    <a
                      href={`/?section=clientes&clienteId=${encodeURIComponent(invoice.cliente_codigo)}&origen=factura`}
                      className="text-xs font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-900"
                    >
                      Ver cliente {invoice.cliente_codigo}
                    </a>
                  </div>
                </td>
                <td>{formatCurrency(invoice.subtotal)}</td>
                <td>{formatCurrency(invoice.descuento)}</td>
                <td>{formatCurrency(taxableBase)}</td>
                <td>{formatCurrency(invoice.iva)}</td>
                <td>{formatCurrency(total)}</td>
                <td>{formatCurrency(totalPaid)}</td>
                <td>{formatCurrency(pendingAmount)}</td>
                <td>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(paymentTone(paymentStatus))}`}>
                    {paymentStatus.toLowerCase()}
                  </span>
                </td>
              </tr>,
              expanded ? (
                <tr key={`invoice-detail-${invoice.id}`} className={focused ? "bg-sky-50/40" : rowHighlight(highlight)}>
                  <td colSpan={12} className="bg-[color:var(--surface-strong)]">
                    <div className="grid gap-4 px-2 py-4 xl:grid-cols-[1.25fr_0.95fr]">
                      <div className="odoo-record">
                        <div className="odoo-record-header">
                          <div>
                            <p className="eyebrow">Factura</p>
                            <h4 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.03em] text-slate-950">
                              {invoice.codigo}
                            </h4>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">
                              Pedido{" "}
                              <a href={`/?section=pedidos&pedidoId=${encodeURIComponent(invoice.pedido_codigo)}`} className="odoo-link">
                                {invoice.pedido_codigo}
                              </a>
                              {" · "}
                              Cliente{" "}
                              <a href={`/?section=clientes&clienteId=${encodeURIComponent(invoice.cliente_codigo)}&origen=factura`} className="odoo-link">
                                {invoice.cliente_codigo}
                              </a>
                            </p>
                          </div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(paymentTone(paymentStatus))}`}>
                            {paymentStatus.toLowerCase()}
                          </span>
                        </div>
                        <div className="odoo-record-body">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="eyebrow">Trazabilidad de cobro</p>
                            <h4 className="mt-2 text-base font-semibold text-slate-900">Historial de pagos</h4>
                          </div>
                          <div className="table-action-group">
                            <a href={`/?section=pedidos&pedidoId=${encodeURIComponent(invoice.pedido_codigo)}`} className="erp-button-secondary">
                              Ver pedido
                            </a>
                            <a href={`/?section=clientes&clienteId=${encodeURIComponent(invoice.cliente_codigo)}&origen=factura`} className="erp-button-secondary">
                              Ver cliente
                            </a>
                          </div>
                        </div>
                        <div className="mt-4 odoo-summary-grid">
                          <div className="odoo-muted-box"><p className="odoo-field-label">Subtotal IVA incluido</p><p className="mt-2 font-semibold">{formatCurrency(invoice.subtotal)}</p></div>
                          <div className="odoo-muted-box"><p className="odoo-field-label">Descuento IVA incluido</p><p className="mt-2 font-semibold">{formatCurrency(invoice.descuento)}</p></div>
                          <div className="odoo-muted-box"><p className="odoo-field-label">Base imponible</p><p className="mt-2 font-semibold">{formatCurrency(taxableBase)}</p></div>
                          <div className="odoo-muted-box"><p className="odoo-field-label">IVA incluido</p><p className="mt-2 font-semibold">{formatCurrency(invoice.iva)}</p></div>
                          <div className="odoo-muted-box"><p className="odoo-field-label">Cobrado</p><p className="mt-2 font-semibold">{formatCurrency(totalPaid)}</p></div>
                          <div className="odoo-muted-box"><p className="odoo-field-label">Pendiente</p><p className="mt-2 font-semibold">{formatCurrency(pendingAmount)}</p></div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="odoo-field-label">Pagos registrados</p>
                          {invoice.pagos.length === 0 ? (
                            <p className="mt-2 text-sm text-[color:var(--muted)]">Esta factura aun no tiene pagos registrados.</p>
                          ) : (
                            <div className="table-wrap mt-3">
                              <table className="odoo-list-table">
                                <thead>
                                  <tr>
                                    <th>Pago</th>
                                    <th>Fecha</th>
                                    <th>Pedido</th>
                                    <th>Cliente</th>
                                    <th>Metodo</th>
                                    <th>Importe</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoice.pagos.map((payment) => (
                                    <tr key={payment.id}>
                                      <td>{payment.displayCode}</td>
                                      <td>{formatDate(payment.fecha_pago)}</td>
                                      <td><a href={`/?section=pedidos&pedidoId=${encodeURIComponent(invoice.pedido_codigo)}`} className="odoo-link">{invoice.pedido_codigo}</a></td>
                                      <td><a href={`/?section=clientes&clienteId=${encodeURIComponent(invoice.cliente_codigo)}&origen=pago`} className="odoo-link">{invoice.cliente_codigo}</a></td>
                                      <td>{payment.metodo_pago.toLowerCase()}</td>
                                      <td>{formatCurrency(payment.importe)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        </div>
                      </div>

                      <div className="odoo-record">
                        <div className="odoo-record-header">
                          <div>
                            <p className="eyebrow">Resumen economico</p>
                            <h4 className="mt-2 text-base font-semibold text-slate-900">Cobro y ajustes</h4>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Total final</p>
                            <p className="mt-2 text-xl font-semibold text-slate-950">{formatCurrency(total)}</p>
                          </div>
                        </div>
                        <div className="odoo-record-body">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="eyebrow">Ajustes y cobro</p>
                            <h4 className="mt-2 text-base font-semibold text-slate-900">Factura {invoice.codigo}</h4>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <a
                              href={`/api/exports/invoices/${invoice.id}/pdf`}
                              className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:-translate-y-0.5 hover:bg-sky-100"
                            >
                              Descargar PDF
                            </a>
                            <div className="text-right text-xs text-[color:var(--muted)]">
                              <div>Total: {formatCurrency(total)}</div>
                              <div>Cobrado: {formatCurrency(totalPaid)}</div>
                              <div>Pendiente: {formatCurrency(pendingAmount)}</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 odoo-muted-box">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="eyebrow">Descuento final</p>
                              <h5 className="mt-2 text-sm font-semibold text-slate-900">Editar descuento de factura</h5>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(canEditDiscount ? "info" : "neutral")}`}>
                              {canEditDiscount ? "editable" : "bloqueada"}
                            </span>
                          </div>
                          {canEditDiscount ? (
                            <form action={updateInvoiceAction} className="mt-4 space-y-3">
                              <input type="hidden" name="id" value={invoice.id} />
                              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-800">
                                Puedes ajustar el descuento mientras la factura no este totalmente pagada. El total nunca puede quedar por debajo de lo ya cobrado.
                              </div>
                              <div className="table-edit-card">
                                <InlineField label="Descuento (€)" hint="Importe final a descontar, IVA incluido">
                                  <input
                                    name="descuento"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    defaultValue={invoice.descuento.toFixed(2)}
                                    className={tableInputClass}
                                    required
                                  />
                                </InlineField>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Base actual</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(taxableBase)}</p>
                                </div>
                                <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Total actual</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(total)}</p>
                                </div>
                                <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Cobrado</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(totalPaid)}</p>
                                </div>
                              </div>
                              <SubmitButton variant="chip-dark" pendingText="Actualizando...">
                                Guardar descuento
                              </SubmitButton>
                            </form>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-black/8 bg-white/92 px-4 py-3 text-sm text-[color:var(--muted)]">
                              La factura ya esta totalmente pagada. El descuento queda bloqueado para no alterar el cobro historico.
                            </div>
                          )}
                        </div>

                        {registeringPayment && canRegisterPayment ? (
                          <form action={registerInvoicePaymentAction} className="mt-4 space-y-3">
                            <input type="hidden" name="facturaId" value={invoice.id} />
                            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-800">
                              Introduce un importe entre 0,01 EUR y {formatCurrency(pendingAmount)}. Este formulario queda para cobros parciales o para usar un metodo distinto al cobro rapido.
                              <div className="mt-1 text-xs text-sky-700">
                                Metodos admitidos: {["EFECTIVO", "TRANSFERENCIA", "TARJETA", "BIZUM", "PAYPAL", "OTRO"].map(paymentMethodLabel).join(", ")}.
                              </div>
                            </div>
                            <div className="table-edit-card">
                              <div className="table-edit-grid-2">
                                <InlineField label="Importe">
                                  <input
                                    name="importe"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    max={pendingAmount.toFixed(2)}
                                    defaultValue={pendingAmount.toFixed(2)}
                                    placeholder="Importe"
                                    className={tableInputClass}
                                    required
                                  />
                                </InlineField>
                                <InlineField label="Metodo de pago">
                                  <select name="metodoPago" defaultValue="TRANSFERENCIA" className={tableInputClass}>
                                    <option value="EFECTIVO">efectivo</option>
                                    <option value="TRANSFERENCIA">transferencia</option>
                                    <option value="TARJETA">tarjeta</option>
                                    <option value="BIZUM">bizum</option>
                                    <option value="PAYPAL">paypal</option>
                                    <option value="OTRO">otro</option>
                                  </select>
                                </InlineField>
                              </div>
                            </div>
                            <div className="table-edit-card">
                              <InlineField label="Fecha de pago">
                                <input
                                  name="fechaPago"
                                  type="date"
                                  defaultValue={new Date().toISOString().slice(0, 10)}
                                  className={tableInputClass}
                                  required
                                />
                              </InlineField>
                            </div>
                            <div className="table-edit-card">
                              <InlineField label="Notas del pago">
                                <textarea
                                  name="notas"
                                  rows={2}
                                  placeholder="Notas del pago"
                                  className={tableTextareaClass}
                                />
                              </InlineField>
                            </div>
                            <div className="table-action-group">
                              <SubmitButton variant="chip-dark" pendingText="Guardando...">
                                Registrar cobro detallado
                              </SubmitButton>
                              <button
                                type="button"
                                onClick={() => setPaymentId(null)}
                                className="button-secondary"
                              >
                                Cancelar
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-4 space-y-3">
                            <div className="rounded-2xl border border-black/8 bg-white/92 px-4 py-3 text-sm text-[color:var(--muted)]">
                              {canRegisterPayment
                                ? "Usa Cobrar factura para liquidar todo el pendiente al instante, o abre el detalle si necesitas un cobro parcial."
                                : "La factura ya esta totalmente pagada."}
                            </div>
                            {canRegisterPayment ? (
                              <button
                                type="button"
                                onClick={() => setPaymentId(invoice.id)}
                                className="button-secondary"
                              >
                                Abrir cobro detallado
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null,
            ];
        })}
      </tbody>
    </table>
  );
}

export function FinishedInventoryInlineTable({
  finishedInventory,
}: {
  finishedInventory: FinishedInventory[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Producto</th><th>Stock</th><th>Ubicacion</th><th>Coste/PVP</th></tr>
      </thead>
      <tbody>
        {finishedInventory.map((item) => {
          const editing = editingId === item.id;
          const formId = `finished-inventory-form-${item.id}`;
          return (
            <tr
              key={item.id}
              className={rowHighlight(
                item.cantidad_disponible === 0 ? "warn" : item.cantidad_disponible <= 2 ? "attention" : null,
              )}
            >
              <td>
                <form id={formId} action={updateFinishedInventoryAction}>
                  <input type="hidden" name="id" value={item.id} />
                </form>
                <ActionButtons
                  editing={editing}
                  onEdit={() => setEditingId(item.id)}
                  onCancel={() => setEditingId(null)}
                  formId={formId}
                />
              </td>
              <td>{item.codigo}</td>
              <td>
                <div>{item.producto_codigo} - {item.producto_nombre}</div>
                <div className="text-xs text-[color:var(--muted)]">Actualizado: {item.fecha_actualizacion.slice(0, 10)}</div>
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-card">
                    <InlineField label="Cantidad disponible">
                      <input form={formId} name="cantidadDisponible" type="number" min="0" defaultValue={item.cantidad_disponible} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  <div>
                    <div className={item.cantidad_disponible === 0 ? "text-[color:var(--danger)]" : ""}>
                      Disp: {item.unidades_disponibles} uds
                    </div>
                    <div className="text-xs text-[color:var(--muted)]">
                      Total: {item.unidades_stock} · Reservadas: {item.unidades_reservadas}
                    </div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-card">
                    <InlineField label="Ubicacion">
                      <input form={formId} name="ubicacion" defaultValue={item.ubicacion ?? ""} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  item.ubicacion || "-"
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit table-edit-card">
                    <InlineField label="Coste unitario">
                      <input form={formId} name="costeUnitario" type="number" min="0" step="0.01" defaultValue={item.coste_unitario} className={tableInputClass} />
                    </InlineField>
                    <InlineField label="Precio de venta">
                      <input form={formId} name="precioVenta" type="number" min="0" step="0.01" defaultValue={item.precio_venta} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  <div>
                    <div>Coste: {formatCurrency(item.coste_unitario)}</div>
                    <div className="text-xs text-[color:var(--muted)]">PVP: {formatCurrency(item.precio_venta)}</div>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PrintersInlineTable({
  printers,
  focusedPrinterCode,
}: {
  printers: Printer[];
  focusedPrinterCode?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Impresora</th><th>Estado</th><th>Horas</th><th>Coste/h</th></tr>
      </thead>
      <tbody>
        {printers.map((printer) => {
          const editing = editingId === printer.id;
          const focused = focusedPrinterCode === printer.codigo;
          const formId = `printer-form-${printer.id}`;
          return (
            <tr
              key={printer.id}
              className={`${
                focused
                  ? "bg-sky-50/90 ring-2 ring-inset ring-sky-300"
                  : rowHighlight(
                      !printer.activo
                        ? "attention"
                        : printer.estado === "MANTENIMIENTO"
                          ? "danger"
                          : printer.estado === "IMPRIMIENDO"
                            ? "attention"
                            : null,
                    )
              } ${!printer.activo ? "opacity-75" : ""}`.trim()}
            >
              <td>
                <form id={formId} action={updatePrinterAction}>
                  <input type="hidden" name="id" value={printer.id} />
                </form>
                <div className="table-action-group">
                  <ActionButtons
                    editing={editing}
                    onEdit={() => setEditingId(printer.id)}
                    onCancel={() => setEditingId(null)}
                    formId={formId}
                  />
                  {!editing ? (
                    <form action={togglePrinterActiveAction} onSubmit={confirmArchiveOnSubmit(printer.activo)}>
                      <input type="hidden" name="id" value={printer.id} />
                      <input type="hidden" name="active" value={printer.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={printer.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={archiveActionLabel(printer.activo)}
                        aria-label={archiveActionLabel(printer.activo)}
                      >
                        {printer.activo ? <ArchiveIcon /> : <RestoreIcon />}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </td>
              <td>{printer.codigo}</td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit table-edit-card">
                    <InlineField label="Nombre">
                      <input form={formId} name="nombre" defaultValue={printer.nombre} className={tableInputClass} />
                    </InlineField>
                    <InlineField label="Ubicacion">
                      <input form={formId} name="ubicacion" defaultValue={printer.ubicacion ?? ""} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  <div>
                    <a href={`/?section=impresoras&impresoraId=${encodeURIComponent(printer.codigo)}`} className="odoo-link">{printer.nombre}</a>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          badgeClasses(printer.activo ? "success" : "neutral")
                        }`}
                      >
                        {archiveStatusLabel(printer.activo)}
                      </span>
                    </div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {printer.ubicacion || "-"}
                      {printer.orden_activa_codigo ? ` · Orden ${printer.orden_activa_codigo}` : ""}
                    </div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-card">
                    <InlineField label="Estado">
                      <select form={formId} name="estado" defaultValue={printer.estado} className={tableInputClass}>
                        <option value="LIBRE">libre</option>
                        <option value="IMPRIMIENDO">imprimiendo</option>
                        <option value="MANTENIMIENTO">mantenimiento</option>
                      </select>
                    </InlineField>
                  </div>
                ) : (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(orderTone(printer.estado))}`}>
                    {printer.estado.toLowerCase()}
                  </span>
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-card">
                    <InlineField label="Horas de uso">
                      <input form={formId} name="horasUsoAcumuladas" type="number" min="0" step="0.1" defaultValue={printer.horas_uso_acumuladas} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  `${printer.horas_uso_acumuladas} h`
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-card">
                    <InlineField label="Coste por hora">
                      <input form={formId} name="costeHora" type="number" min="0" step="0.01" defaultValue={printer.coste_hora} className={tableInputClass} />
                    </InlineField>
                  </div>
                ) : (
                  `${printer.coste_hora.toFixed(2)} EUR`
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
