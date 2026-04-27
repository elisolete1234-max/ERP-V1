"use client";

import { useState } from "react";
import {
  completeManufacturingAction,
  confirmOrderAction,
  deleteMaterialAction,
  deliverOrderAction,
  generateInvoiceAction,
  registerInvoicePaymentAction,
  startManufacturingAction,
  retryOrderAction,
  toggleCustomerActiveAction,
  toggleMaterialActiveAction,
  togglePrinterActiveAction,
  toggleProductActiveAction,
  updateFinishedInventoryAction,
  updateCustomerAction,
  updateManufacturingAction,
  updateMaterialAction,
  updateOrderAction,
  updatePrinterAction,
  updateProductAction,
} from "@/app/actions";
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
  material_id: string;
  activo: boolean;
  material_nombre: string;
  precio_kg: number;
};

type ManufacturingOrder = {
  id: string;
  codigo: string;
  pedido_id: string;
  linea_pedido_id: string;
  producto_id: string;
  cantidad: number;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  gramos_consumidos: number | null;
  tiempo_real_horas: number | null;
  coste_impresora_total: number | null;
  incidencia: string | null;
  pedido_codigo: string;
  producto_nombre: string;
  impresora_codigo: string | null;
  impresora_nombre: string | null;
};

type Invoice = {
  id: string;
  codigo: string;
  pedido_id: string;
  cliente_id: string;
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  total_pagado: number;
  importe_pendiente: number;
  estado_pago: string;
  pedido_codigo: string;
  cliente_nombre: string;
  pagos: Array<{
    id: string;
    codigo: string;
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
  cliente_nombre: string;
  fecha_pedido: string;
  estado: string;
  estado_pago: string;
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

function badgeClasses(tone: "neutral" | "success" | "warn" | "danger" | "info") {
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
  if (status === "PAGADA") return "success";
  if (status === "PARCIAL") return "info";
  return "warn";
}

function paymentMethodLabel(method: string) {
  return method.toLowerCase().replaceAll("_", " ");
}

function rowHighlight(level?: "danger" | "warn" | "attention" | null) {
  if (level === "danger") return "row-danger";
  if (level === "warn") return "row-warn";
  if (level === "attention") return "row-attention";
  return "";
}

function orderStatusTone(status: string) {
  if (status === "FACTURADO") return "success";
  if (status === "LISTO" || status === "ENTREGADO") return "info";
  if (status === "INCIDENCIA_STOCK") return "danger";
  if (status === "BORRADOR" || status === "CONFIRMADO" || status === "EN_PRODUCCION") return "warn";
  return "neutral";
}

function orderStatusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7 5.7v8.6l6.8-4.3L7 5.7Z" fill="currentColor" />
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5.8 6.4h8.4l-.7 8.5H6.5l-.7-8.5ZM7.5 4.7h5M4.8 4.7h10.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 8.6v3.6M11.5 8.6v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

export function CustomersInlineTable({ customers }: { customers: Customer[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Nombre</th><th>Contacto</th><th>Alta</th></tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const editing = editingId === customer.id;
          const formId = `customer-form-${customer.id}`;
          return (
            <tr
              key={customer.id}
              className={`${!customer.activo ? `${rowHighlight("attention")} opacity-75` : ""}`.trim()}
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
                    <form action={toggleCustomerActiveAction}>
                      <input type="hidden" name="id" value={customer.id} />
                      <input type="hidden" name="active" value={customer.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={customer.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={customer.activo ? "Dar de baja" : "Reactivar"}
                        aria-label={customer.activo ? "Dar de baja" : "Reactivar"}
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
                    <div className="font-medium">{customer.nombre}</div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          badgeClasses(customer.activo ? "success" : "neutral")
                        }`}
                      >
                        {customer.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>
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
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OrdersInlineBoard({
  orders,
  customers,
  products,
}: {
  orders: OrderCard[];
  customers: CustomerOption[];
  products: ProductOption[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const editing = editingId === order.id;
        const latestHistory = order.historial[0] ?? null;
        const editable = ["BORRADOR", "INCIDENCIA_STOCK"].includes(order.estado);
        const lineDraft = [...order.lineas.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - order.lineas.length) }, () => null)];

        return (
          <article
            key={order.id}
            className={`panel-muted p-4 ${
              order.estado === "INCIDENCIA_STOCK"
                ? rowHighlight("danger")
                : order.estado === "LISTO" || order.estado === "ENTREGADO"
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">{order.codigo}</p>
                    <h4 className="mt-2 text-lg font-semibold">{order.cliente_nombre}</h4>
                    <p className="mt-2 text-sm text-[color:var(--muted)]">{formatDate(order.fecha_pedido)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(orderStatusTone(order.estado))}`}>
                      {orderStatusLabel(order.estado)}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(order.estado_pago === "PAGADA" ? "success" : "neutral")}`}>
                      pago: {order.estado_pago.toLowerCase()}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Total pedido</p>
                    <p className="mt-2 text-lg font-semibold">{formatCurrency(order.total)}</p>
                  </div>
                  <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Coste</p>
                    <p className="mt-2 text-sm font-semibold">{formatCurrency(order.coste_total_pedido)}</p>
                  </div>
                  <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Beneficio</p>
                    <p className="mt-2 text-sm font-semibold">{formatCurrency(order.beneficio_total)}</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2.5">
                  {order.lineas.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-black/8 px-3.5 py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {line.producto_nombre} x{line.cantidad}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--muted)]">
                            Desde stock: {line.cantidad_desde_stock} uds - A fabricar: {line.cantidad_a_fabricar} uds
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p>Venta linea: {formatCurrency(line.precio_total_linea)}</p>
                          <p>Coste linea: {formatCurrency(line.coste_total)}</p>
                          <p className="text-[color:var(--muted)]">Beneficio: {formatCurrency(line.beneficio)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
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
                  {order.estado === "BORRADOR" ? (
                    <form action={confirmOrderAction}>
                      <input type="hidden" name="pedidoId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Confirmar pedido"
                        aria-label="Confirmar pedido"
                      >
                        <CheckIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {order.estado === "INCIDENCIA_STOCK" ? (
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
                  {order.estado === "LISTO" ? (
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
                  {order.estado === "ENTREGADO" ? (
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
                  {(order.estado === "CONFIRMADO" || order.estado === "EN_PRODUCCION") && order.ordenesFabricacion.length > 0 ? (
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

  return (
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
                    <form action={toggleMaterialActiveAction}>
                      <input type="hidden" name="id" value={material.id} />
                      <input type="hidden" name="active" value={material.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={material.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={material.activo ? "Dar de baja" : "Reactivar"}
                        aria-label={material.activo ? "Dar de baja" : "Reactivar"}
                      >
                        {material.activo ? <ArchiveIcon /> : <RestoreIcon />}
                      </SubmitButton>
                    </form>
                  ) : null}
                  {!editing && !material.activo ? (
                    <form action={deleteMaterialAction}>
                      <input type="hidden" name="id" value={material.id} />
                      <SubmitButton
                        variant="icon-danger"
                        pendingText={<SpinnerIcon />}
                        title="Eliminar definitivamente"
                        aria-label="Eliminar definitivamente"
                      >
                        <TrashIcon />
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
                        {material.activo ? "Activo" : "Inactivo"}
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
                      Baja aplicada
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ProductsInlineTable({
  products,
  materials,
}: {
  products: Product[];
  materials: MaterialOption[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Acciones</th>
          <th>ID</th>
          <th>Producto</th>
          <th>Material</th>
          <th>Costes</th>
          <th>PVP</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const editing = editingId === product.id;
          const formId = `product-form-${product.id}`;
          const availableMaterials = materials.filter(
            (material) => material.activo || material.id === product.material_id,
          );

          return (
            <tr
              key={product.id}
              className={`${!product.activo ? `${rowHighlight("attention")} opacity-75` : ""}`.trim()}
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
                    <form action={toggleProductActiveAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <input type="hidden" name="active" value={product.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={product.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={product.activo ? "Dar de baja" : "Reactivar"}
                        aria-label={product.activo ? "Dar de baja" : "Reactivar"}
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
                    <div className="font-medium">{product.nombre}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {product.gramos_estimados} g · {product.tiempo_impresion_horas} h
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          badgeClasses(product.activo ? "success" : "neutral")
                        }`}
                      >
                        {product.activo ? "Activo" : "Inactivo"}
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
                  formatCurrency(product.pvp)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
        <tr><th>Acciones</th><th>ID</th><th>Pedido</th><th>Producto</th><th>Estado</th><th>Impresora</th><th>Consumo</th></tr>
      </thead>
      <tbody>
        {manufacturingOrders.map((order) => {
          const editing = editingId === order.id;
          const formId = `manufacturing-form-${order.id}`;
          return (
            <tr
              key={order.id}
              className={rowHighlight(
                order.estado === "BLOQUEADA_POR_STOCK" || order.incidencia
                  ? "danger"
                  : order.estado === "INICIADA"
                    ? "attention"
                    : null,
              )}
            >
              <td>
                <form id={formId} action={updateManufacturingAction}>
                  <input type="hidden" name="id" value={order.id} />
                </form>
                <div className="table-action-group">
                  {!editing && order.estado === "PENDIENTE" ? (
                    <form action={startManufacturingAction}>
                      <input type="hidden" name="fabricacionId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Iniciar"
                        aria-label="Iniciar"
                      >
                        <PlayIcon />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {!editing && order.estado === "INICIADA" ? (
                    <form action={completeManufacturingAction}>
                      <input type="hidden" name="fabricacionId" value={order.id} />
                      <SubmitButton
                        variant="icon-dark"
                        pendingText={<SpinnerIcon />}
                        title="Completar"
                        aria-label="Completar"
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
              <td>{order.pedido_codigo}</td>
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
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(orderTone(order.estado))}`}>
                    {order.estado.toLowerCase()}
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
}: {
  invoices: Invoice[];
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Acciones</th>
          <th>Factura</th>
          <th>Pedido</th>
          <th>Cliente</th>
          <th>Subtotal</th>
          <th>IVA</th>
          <th>Total</th>
          <th>Pagado</th>
          <th>Pendiente</th>
          <th>Pago</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => {
          const expanded = detailId === invoice.id;
          const registeringPayment = paymentId === invoice.id;
          const pendingAmount = Math.max(invoice.importe_pendiente, 0);
          const canRegisterPayment = pendingAmount > 0;
          const paymentCount = invoice.pagos.length;
          const highlight =
            invoice.estado_pago === "PENDIENTE"
              ? "warn"
              : invoice.estado_pago === "PARCIAL"
                ? "attention"
                : null;

          return [
              <tr key={`invoice-${invoice.id}`} className={rowHighlight(highlight)}>
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
                    <button
                      type="button"
                      title={canRegisterPayment ? "Registrar pago" : "Factura pagada"}
                      aria-label={canRegisterPayment ? "Registrar pago" : "Factura pagada"}
                      disabled={!canRegisterPayment}
                      className={`icon-action-button ${
                        canRegisterPayment ? "icon-action-button--dark" : "icon-action-button"
                      }`}
                      onClick={() => {
                        if (!canRegisterPayment) return;
                        const nextOpen = paymentId === invoice.id ? null : invoice.id;
                        setDetailId(invoice.id);
                        setPaymentId(nextOpen);
                      }}
                    >
                      <PaymentIcon />
                    </button>
                  </div>
                </td>
                <td>{invoice.codigo}</td>
                <td>{invoice.pedido_codigo}</td>
                <td>{invoice.cliente_nombre}</td>
                <td>{formatCurrency(invoice.subtotal)}</td>
                <td>{formatCurrency(invoice.iva)}</td>
                <td>{formatCurrency(invoice.total)}</td>
                <td>{formatCurrency(invoice.total_pagado)}</td>
                <td>{formatCurrency(invoice.importe_pendiente)}</td>
                <td>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(paymentTone(invoice.estado_pago))}`}>
                    {invoice.estado_pago.toLowerCase()}
                  </span>
                </td>
              </tr>,
              expanded ? (
                <tr key={`invoice-detail-${invoice.id}`} className={rowHighlight(highlight)}>
                  <td colSpan={10} className="bg-[color:var(--surface-strong)]">
                    <div className="grid gap-4 px-2 py-4 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="panel-muted p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="eyebrow">Trazabilidad de cobro</p>
                            <h4 className="mt-2 text-base font-semibold text-slate-900">Historial de pagos</h4>
                          </div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(paymentTone(invoice.estado_pago))}`}>
                            {invoice.estado_pago.toLowerCase()}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-4">
                          <div className="rounded-2xl border border-black/8 bg-white/92 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Total</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(invoice.total)}</p>
                          </div>
                          <div className="rounded-2xl border border-black/8 bg-white/92 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Cobrado</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(invoice.total_pagado)}</p>
                          </div>
                          <div className="rounded-2xl border border-black/8 bg-white/92 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Pendiente</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(invoice.importe_pendiente)}</p>
                          </div>
                          <div className="rounded-2xl border border-black/8 bg-white/92 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Pagos</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{paymentCount}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {invoice.pagos.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-black/10 bg-white/75 px-4 py-4 text-sm text-[color:var(--muted)]">
                              Esta factura aun no tiene pagos registrados.
                            </div>
                          ) : (
                            invoice.pagos.map((payment) => (
                              <article key={payment.id} className="rounded-2xl border border-black/8 bg-white/92 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      {payment.codigo} · {payment.metodo_pago.toLowerCase()}
                                    </p>
                                    <p className="mt-1 text-xs text-[color:var(--muted)]">{formatDate(payment.fecha_pago)}</p>
                                  </div>
                                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(payment.importe)}</p>
                                </div>
                                {payment.notas ? (
                                  <p className="mt-2 text-sm text-[color:var(--muted)]">{payment.notas}</p>
                                ) : null}
                              </article>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="panel-muted p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="eyebrow">Registrar pago</p>
                            <h4 className="mt-2 text-base font-semibold text-slate-900">Cobro sobre {invoice.codigo}</h4>
                          </div>
                          <div className="text-right text-xs text-[color:var(--muted)]">
                            <div>Total: {formatCurrency(invoice.total)}</div>
                            <div>Cobrado: {formatCurrency(invoice.total_pagado)}</div>
                            <div>Pendiente: {formatCurrency(invoice.importe_pendiente)}</div>
                          </div>
                        </div>

                        {registeringPayment && canRegisterPayment ? (
                          <form action={registerInvoicePaymentAction} className="mt-4 space-y-3">
                            <input type="hidden" name="facturaId" value={invoice.id} />
                            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-800">
                              Introduce un importe entre 0,01 EUR y {formatCurrency(pendingAmount)}. Si completas el pendiente, la factura pasara a pagada automaticamente.
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
                                Registrar pago
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
                                ? "Abre el formulario para registrar un pago parcial o completar el cobro."
                                : "La factura ya esta totalmente pagada."}
                            </div>
                            {canRegisterPayment ? (
                              <button
                                type="button"
                                onClick={() => setPaymentId(invoice.id)}
                                className="button-secondary"
                              >
                                Registrar pago
                              </button>
                            ) : null}
                          </div>
                        )}
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

export function PrintersInlineTable({ printers }: { printers: Printer[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr><th>Acciones</th><th>ID</th><th>Impresora</th><th>Estado</th><th>Horas</th><th>Coste/h</th></tr>
      </thead>
      <tbody>
        {printers.map((printer) => {
          const editing = editingId === printer.id;
          const formId = `printer-form-${printer.id}`;
          return (
            <tr
              key={printer.id}
              className={`${rowHighlight(
                !printer.activo
                  ? "attention"
                  : printer.estado === "MANTENIMIENTO"
                    ? "danger"
                    : printer.estado === "IMPRIMIENDO"
                      ? "attention"
                      : null,
              )} ${!printer.activo ? "opacity-75" : ""}`.trim()}
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
                    <form action={togglePrinterActiveAction}>
                      <input type="hidden" name="id" value={printer.id} />
                      <input type="hidden" name="active" value={printer.activo ? "false" : "true"} />
                      <SubmitButton
                        variant={printer.activo ? "icon-soft" : "icon-dark"}
                        pendingText={<SpinnerIcon />}
                        title={printer.activo ? "Dar de baja" : "Reactivar"}
                        aria-label={printer.activo ? "Dar de baja" : "Reactivar"}
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
                    <div>{printer.nombre}</div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          badgeClasses(printer.activo ? "success" : "neutral")
                        }`}
                      >
                        {printer.activo ? "Activo" : "Inactivo"}
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
