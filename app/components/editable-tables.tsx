"use client";

import { useState } from "react";
import {
  completeManufacturingAction,
  startManufacturingAction,
  updateFinishedInventoryAction,
  updateCustomerAction,
  updateInvoiceAction,
  updateManufacturingAction,
  updateMaterialAction,
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
  precio_kg: number;
  stock_actual_g: number;
  stock_minimo_g: number;
  proveedor: string | null;
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
};

type MaterialOption = {
  id: string;
  codigo: string;
  nombre: string;
  color: string;
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
        className="rounded-full border border-[rgba(37,99,235,0.12)] bg-[color:var(--accent-soft)] px-3.5 py-2 text-xs font-semibold text-[color:var(--accent-strong)] shadow-[0_8px_16px_rgba(37,99,235,0.08)]"
      >
        Editar
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="submit"
        form={formId}
        className="rounded-full bg-[linear-gradient(135deg,#111827,#1d4ed8)] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(29,78,216,0.16)]"
      >
        Guardar
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-black/10 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[color:var(--muted-strong)] shadow-[0_6px_14px_rgba(15,23,42,0.04)]"
      >
        Cancelar
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
                  <input form={formId} name="nombre" defaultValue={customer.nombre} className="input" />
                ) : (
                  customer.nombre
                )}
              </td>
              <td>
                {editing ? (
                  <div className="space-y-2">
                    <input form={formId} name="telefono" defaultValue={customer.telefono ?? ""} placeholder="Telefono" className="input" />
                    <input form={formId} name="email" type="email" defaultValue={customer.email ?? ""} placeholder="Email" className="input" />
                    <textarea form={formId} name="direccion" defaultValue={customer.direccion ?? ""} rows={2} placeholder="Direccion" className="input" />
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
                  <div className="space-y-2">
                    <input form={formId} name="nombre" defaultValue={material.nombre} className="input" />
                    <input form={formId} name="marca" defaultValue={material.marca} className="input" />
                    <input form={formId} name="tipo" defaultValue={material.tipo} className="input" />
                    <input form={formId} name="color" defaultValue={material.color} className="input" />
                    <input form={formId} name="proveedor" defaultValue={material.proveedor ?? ""} className="input" />
                  </div>
                ) : (
                  <div>
                    <div>{material.nombre} - {material.color}</div>
                    <div className="text-xs text-[color:var(--muted)]">{material.marca} - {material.tipo}</div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="precioKg" type="number" min="0" step="0.01" defaultValue={material.precio_kg} className="input" />
                ) : (
                  `${material.precio_kg.toFixed(2)} EUR`
                )}
              </td>
              <td>
                {editing ? (
                  <div className="space-y-2">
                    <input form={formId} name="stockActualG" type="hidden" value={material.stock_actual_g} />
                    <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-3 py-2 text-sm">
                      Stock actual: {material.stock_actual_g} g
                    </div>
                    <input form={formId} name="stockMinimoG" type="number" min="0" defaultValue={material.stock_minimo_g} className="input" />
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
                  <div className="space-y-2">
                    <input form={formId} name="nombre" defaultValue={product.nombre} className="input" />
                    <textarea form={formId} name="descripcion" defaultValue={product.descripcion ?? ""} rows={2} className="input" />
                    <input form={formId} name="enlaceModelo" defaultValue={product.enlace_modelo ?? ""} className="input" />
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
                  <select form={formId} name="materialId" defaultValue={product.material_id} className="input">
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
                  <div className="space-y-2">
                    <input form={formId} name="gramosEstimados" type="number" min="1" defaultValue={product.gramos_estimados} className="input" />
                    <input form={formId} name="tiempoImpresionHoras" type="number" min="0.1" step="0.1" defaultValue={product.tiempo_impresion_horas} className="input" />
                    <input form={formId} name="costeElectricidad" type="number" min="0" step="0.01" defaultValue={product.coste_electricidad} className="input" />
                    <input form={formId} name="margen" type="number" step="0.01" defaultValue={product.margen} className="input" />
                  </div>
                ) : (
                  formatCurrency((product.precio_kg / 1000) * product.gramos_estimados + product.coste_electricidad)
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="pvp" type="number" min="0.01" step="0.01" defaultValue={product.pvp} className="input" />
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
                <div className="flex flex-wrap gap-2">
                  {!editing && order.estado === "PENDIENTE" ? (
                    <form action={startManufacturingAction}>
                      <input type="hidden" name="fabricacionId" value={order.id} />
                      <SubmitButton variant="chip-dark" pendingText="Iniciando...">
                        Iniciar
                      </SubmitButton>
                    </form>
                  ) : null}
                  {!editing && order.estado === "INICIADA" ? (
                    <form action={completeManufacturingAction}>
                      <input type="hidden" name="fabricacionId" value={order.id} />
                      <SubmitButton variant="chip-dark" pendingText="Completando...">
                        Completar
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
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{order.producto_nombre}</div>
                    <input form={formId} name="cantidad" type="number" min="1" defaultValue={order.cantidad} className="input" />
                    <textarea form={formId} name="incidencia" defaultValue={order.incidencia ?? ""} rows={2} className="input" />
                  </div>
                ) : (
                  order.producto_nombre
                )}
              </td>
              <td>
                {editing ? (
                  <select form={formId} name="estado" defaultValue={order.estado} className="input">
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
                  <input form={formId} name="tiempoRealHoras" type="number" min="0" step="0.1" defaultValue={order.tiempo_real_horas ?? ""} className="input" />
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
                  <select form={formId} name="estadoPago" defaultValue={invoice.estado_pago} className="input">
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
        <tr><th>Acciones</th><th>ID</th><th>Producto</th><th>Disponible</th><th>Ubicacion</th><th>Coste/PVP</th></tr>
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
                  <input form={formId} name="cantidadDisponible" type="number" min="0" defaultValue={item.cantidad_disponible} className="input" />
                ) : (
                  <span className={item.cantidad_disponible === 0 ? "text-[color:var(--danger)]" : ""}>
                    {item.cantidad_disponible} uds
                  </span>
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="ubicacion" defaultValue={item.ubicacion ?? ""} className="input" />
                ) : (
                  item.ubicacion || "-"
                )}
              </td>
              <td>
                {editing ? (
                  <div className="space-y-2">
                    <input form={formId} name="costeUnitario" type="number" min="0" step="0.01" defaultValue={item.coste_unitario} className="input" />
                    <input form={formId} name="precioVenta" type="number" min="0" step="0.01" defaultValue={item.precio_venta} className="input" />
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
                  <div className="space-y-2">
                    <input form={formId} name="nombre" defaultValue={printer.nombre} className="input" />
                    <input form={formId} name="ubicacion" defaultValue={printer.ubicacion ?? ""} className="input" />
                  </div>
                ) : (
                  <div>
                    <div>{printer.nombre}</div>
                    <div className="text-xs text-[color:var(--muted)]">{printer.ubicacion || "-"}</div>
                  </div>
                )}
              </td>
              <td>
                {editing ? (
                  <select form={formId} name="estado" defaultValue={printer.estado} className="input">
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
                  <input form={formId} name="horasUsoAcumuladas" type="number" min="0" step="0.1" defaultValue={printer.horas_uso_acumuladas} className="input" />
                ) : (
                  `${printer.horas_uso_acumuladas} h`
                )}
              </td>
              <td>
                {editing ? (
                  <input form={formId} name="costeHora" type="number" min="0" step="0.01" defaultValue={printer.coste_hora} className="input" />
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
