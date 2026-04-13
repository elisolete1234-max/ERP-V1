"use client";

import { useState } from "react";
import {
  completeManufacturingAction,
  confirmOrderAction,
  deliverOrderAction,
  generateInvoiceAction,
  startManufacturingAction,
  retryOrderAction,
  updateFinishedInventoryAction,
  updateCustomerAction,
  updateInvoiceAction,
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
  estado_pago: string;
  pedido_codigo: string;
  cliente_nombre: string;
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
  fecha_actualizacion: string;
  orden_activa_codigo: string | null;
};

type MaterialOption = {
  id: string;
  codigo: string;
  nombre: string;
  color: string;
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
            <tr key={customer.id}>
              <td>
                <form id={formId} action={updateCustomerAction}>
                  <input type="hidden" name="id" value={customer.id} />
                </form>
                <ActionButtons
                  editing={editing}
                  onEdit={() => setEditingId(customer.id)}
                  onCancel={() => setEditingId(null)}
                  formId={formId}
                />
              </td>
              <td>{customer.codigo}</td>
              <td>
                {editing ? (
                  <input form={formId} name="nombre" defaultValue={customer.nombre} className={tableInputClass} />
                ) : (
                  customer.nombre
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit">
                    <input form={formId} name="telefono" defaultValue={customer.telefono ?? ""} placeholder="Telefono" className={tableInputClass} />
                    <input form={formId} name="email" type="email" defaultValue={customer.email ?? ""} placeholder="Email" className={tableInputClass} />
                    <textarea form={formId} name="direccion" defaultValue={customer.direccion ?? ""} rows={2} placeholder="Direccion" className={tableTextareaClass} />
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
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                <select name="clienteId" className={tableInputClass} defaultValue={order.cliente_id}>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.codigo} - {customer.nombre}
                    </option>
                  ))}
                </select>
                {lineDraft.map((line, index) => (
                  <div key={`${order.id}-line-${index}`} className="table-edit-grid-3">
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
                    <input
                      name={`cantidad_${index + 1}`}
                      type="number"
                      min="0"
                      defaultValue={line?.cantidad ?? ""}
                      className={tableInputClass}
                    />
                    <input
                      name={`precio_${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={line?.precio_unitario ?? ""}
                      className={tableInputClass}
                    />
                  </div>
                ))}
                <textarea
                  name="observaciones"
                  rows={3}
                  defaultValue={order.observaciones ?? ""}
                  className={tableTextareaClass}
                  placeholder="Observaciones"
                />
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
          return (
            <tr
              key={material.id}
              className={rowHighlight(
                material.stock_actual_g === 0
                  ? "danger"
                  : material.stock_actual_g <= material.stock_minimo_g
                    ? "warn"
                    : null,
              )}
            >
              <td>
                <form id={formId} action={updateMaterialAction}>
                  <input type="hidden" name="id" value={material.id} />
                </form>
                <ActionButtons
                  editing={editing}
                  onEdit={() => setEditingId(material.id)}
                  onCancel={() => setEditingId(null)}
                  formId={formId}
                />
              </td>
              <td>{material.codigo}</td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit--wide">
                    <div className="table-edit-grid-2">
                      <input form={formId} name="nombre" defaultValue={material.nombre} className={tableInputClass} placeholder="Material" />
                      <input form={formId} name="nombreComercial" defaultValue={material.nombre_comercial ?? ""} className={tableInputClass} placeholder="Nombre comercial" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="marca" defaultValue={material.marca} className={tableInputClass} placeholder="Marca" />
                      <input form={formId} name="tipo" defaultValue={material.tipo} className={tableInputClass} placeholder="Tipo" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="color" defaultValue={material.color} className={tableInputClass} placeholder="Color visible" />
                      <input form={formId} name="tipoColor" defaultValue={material.tipo_color ?? ""} className={tableInputClass} placeholder="Tipo color" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="colorBase" defaultValue={material.color_base ?? ""} className={tableInputClass} placeholder="Color base" />
                      <input form={formId} name="efecto" defaultValue={material.efecto ?? ""} className={tableInputClass} placeholder="Efecto" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="diametroMm" type="number" min="0" step="0.01" defaultValue={material.diametro_mm ?? ""} className={tableInputClass} placeholder="Diametro mm" />
                      <input form={formId} name="pesoSpoolG" type="number" min="0" defaultValue={material.peso_spool_g ?? ""} className={tableInputClass} placeholder="Peso spool g" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="tempExtrusor" type="number" min="0" defaultValue={material.temp_extrusor ?? ""} className={tableInputClass} placeholder="Temp extrusor" />
                      <input form={formId} name="tempCama" type="number" min="0" defaultValue={material.temp_cama ?? ""} className={tableInputClass} placeholder="Temp cama" />
                    </div>
                    <input form={formId} name="proveedor" defaultValue={material.proveedor ?? ""} className={tableInputClass} placeholder="Proveedor" />
                    <textarea form={formId} name="notas" defaultValue={material.notas ?? ""} rows={2} className={tableTextareaClass} placeholder="Notas" />
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
                  <div className="table-edit-stack table-cell-edit">
                    <input form={formId} name="stockActualG" type="hidden" value={material.stock_actual_g} />
                    <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-2 text-sm">
                      Stock actual: {material.stock_actual_g} g
                    </div>
                    <input form={formId} name="stockMinimoG" type="number" min="0" defaultValue={material.stock_minimo_g} className={tableInputClass} />
                  </div>
                ) : (
                  <div>
                    <div>{material.stock_actual_g} g</div>
                    <div className="text-xs text-[color:var(--muted)]">Min: {material.stock_minimo_g} g</div>
                  </div>
                )}
              </td>
              <td>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    material.stock_actual_g <= material.stock_minimo_g
                      ? badgeClasses("warn")
                      : badgeClasses("success")
                  }`}
                >
                  {material.stock_actual_g <= material.stock_minimo_g ? "Bajo minimo" : "OK"}
                </span>
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
        <tr><th>Acciones</th><th>ID</th><th>Producto</th><th>Material</th><th>Costes</th><th>PVP</th></tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const editing = editingId === product.id;
          const formId = `product-form-${product.id}`;
          return (
            <tr key={product.id}>
              <td>
                <form id={formId} action={updateProductAction}>
                  <input type="hidden" name="id" value={product.id} />
                </form>
                <ActionButtons
                  editing={editing}
                  onEdit={() => setEditingId(product.id)}
                  onCancel={() => setEditingId(null)}
                  formId={formId}
                />
              </td>
              <td>{product.codigo}</td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit--wide">
                    <input form={formId} name="nombre" defaultValue={product.nombre} className={tableInputClass} />
                    <textarea form={formId} name="descripcion" defaultValue={product.descripcion ?? ""} rows={2} className={tableTextareaClass} />
                    <input form={formId} name="enlaceModelo" defaultValue={product.enlace_modelo ?? ""} className={tableInputClass} />
                    <label className="flex items-center gap-2 text-sm">
                      <input form={formId} type="checkbox" name="activo" defaultChecked={product.activo} />
                      Activo
                    </label>
                  </div>
                ) : (
                  <div>
                    <div>{product.nombre}</div>
                    <div className="text-xs text-[color:var(--muted)]">{product.gramos_estimados} g - {product.tiempo_impresion_horas} h</div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <select form={formId} name="materialId" defaultValue={product.material_id} className={tableInputClass}>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.codigo} - {material.nombre} - {material.color}
                      </option>
                    ))}
                  </select>
                ) : (
                  product.material_nombre
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit">
                    <div className="table-edit-grid-2">
                      <input form={formId} name="gramosEstimados" type="number" min="1" defaultValue={product.gramos_estimados} className={tableInputClass} placeholder="Gramos" />
                      <input form={formId} name="tiempoImpresionHoras" type="number" min="0.1" step="0.1" defaultValue={product.tiempo_impresion_horas} className={tableInputClass} placeholder="Tiempo impresion" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="costeElectricidad" type="number" min="0" step="0.01" defaultValue={product.coste_electricidad} className={tableInputClass} placeholder="Coste electricidad" />
                      <input form={formId} name="costeMaquina" type="number" min="0" step="0.01" defaultValue={product.coste_maquina} className={tableInputClass} placeholder="Coste maquina" />
                    </div>
                    <div className="table-edit-grid-2">
                      <input form={formId} name="costeManoObra" type="number" min="0" step="0.01" defaultValue={product.coste_mano_obra} className={tableInputClass} placeholder="Coste mano de obra" />
                      <input form={formId} name="costePostprocesado" type="number" min="0" step="0.01" defaultValue={product.coste_postprocesado} className={tableInputClass} placeholder="Coste postprocesado" />
                    </div>
                    <input form={formId} name="margen" type="number" step="0.01" defaultValue={product.margen} className={tableInputClass} placeholder="Margen" />
                  </div>
                ) : (
                  <div>
                    <div>Receta: {formatCurrency(product.coste_total_producto)}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      Material {formatCurrency(product.coste_material_estimado)} · Maquina {formatCurrency(product.coste_maquina)}
                    </div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="pvp" type="number" min="0.01" step="0.01" defaultValue={product.pvp} className={tableInputClass} />
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
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="table">
      <thead>
        <tr><th>Acciones</th><th>Factura</th><th>Pedido</th><th>Cliente</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>Pago</th></tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => {
          const editing = editingId === invoice.id;
          const formId = `invoice-form-${invoice.id}`;
          return (
            <tr key={invoice.id} className={rowHighlight(invoice.estado_pago === "PENDIENTE" ? "attention" : null)}>
              <td>
                <form id={formId} action={updateInvoiceAction}>
                  <input type="hidden" name="id" value={invoice.id} />
                </form>
                <ActionButtons
                  editing={editing}
                  onEdit={() => setEditingId(invoice.id)}
                  onCancel={() => setEditingId(null)}
                  formId={formId}
                />
              </td>
              <td>{invoice.codigo}</td>
              <td>{invoice.pedido_codigo}</td>
              <td>{invoice.cliente_nombre}</td>
              <td>{formatCurrency(invoice.subtotal)}</td>
              <td>{formatCurrency(invoice.iva)}</td>
              <td>{formatCurrency(invoice.total)}</td>
              <td>
                {editing ? (
                  <select form={formId} name="estadoPago" defaultValue={invoice.estado_pago} className={tableInputClass}>
                    <option value="PENDIENTE">pendiente</option>
                    <option value="PAGADA">pagada</option>
                  </select>
                ) : (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(invoice.estado_pago === "PAGADA" ? "success" : "warn")}`}>
                    {invoice.estado_pago.toLowerCase()}
                  </span>
                )}
              </td>
            </tr>
          );
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
                  <input form={formId} name="cantidadDisponible" type="number" min="0" defaultValue={item.cantidad_disponible} className={tableInputClass} />
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
                  <input form={formId} name="ubicacion" defaultValue={item.ubicacion ?? ""} className={tableInputClass} />
                ) : (
                  item.ubicacion || "-"
                )}
              </td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit">
                    <input form={formId} name="costeUnitario" type="number" min="0" step="0.01" defaultValue={item.coste_unitario} className={tableInputClass} />
                    <input form={formId} name="precioVenta" type="number" min="0" step="0.01" defaultValue={item.precio_venta} className={tableInputClass} />
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
              className={rowHighlight(
                printer.estado === "MANTENIMIENTO"
                  ? "danger"
                  : printer.estado === "IMPRIMIENDO"
                    ? "attention"
                    : null,
              )}
            >
              <td>
                <form id={formId} action={updatePrinterAction}>
                  <input type="hidden" name="id" value={printer.id} />
                </form>
                <ActionButtons
                  editing={editing}
                  onEdit={() => setEditingId(printer.id)}
                  onCancel={() => setEditingId(null)}
                  formId={formId}
                />
              </td>
              <td>{printer.codigo}</td>
              <td>
                {editing ? (
                  <div className="table-edit-stack table-cell-edit">
                    <input form={formId} name="nombre" defaultValue={printer.nombre} className={tableInputClass} />
                    <input form={formId} name="ubicacion" defaultValue={printer.ubicacion ?? ""} className={tableInputClass} />
                  </div>
                ) : (
                  <div>
                    <div>{printer.nombre}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {printer.ubicacion || "-"}
                      {printer.orden_activa_codigo ? ` · Orden ${printer.orden_activa_codigo}` : ""}
                    </div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <select form={formId} name="estado" defaultValue={printer.estado} className={tableInputClass}>
                    <option value="LIBRE">libre</option>
                    <option value="IMPRIMIENDO">imprimiendo</option>
                    <option value="MANTENIMIENTO">mantenimiento</option>
                  </select>
                ) : (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(orderTone(printer.estado))}`}>
                    {printer.estado.toLowerCase()}
                  </span>
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="horasUsoAcumuladas" type="number" min="0" step="0.1" defaultValue={printer.horas_uso_acumuladas} className={tableInputClass} />
                ) : (
                  `${printer.horas_uso_acumuladas} h`
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="costeHora" type="number" min="0" step="0.01" defaultValue={printer.coste_hora} className={tableInputClass} />
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
