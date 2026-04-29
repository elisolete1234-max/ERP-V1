import type { ReactNode } from "react";
import Link from "next/link";
import {
  confirmOrderAction,
  createCustomerAction,
  createMaterialAction,
  createOrderAction,
  createPrinterAction,
  createProductAction,
  deliverOrderAction,
  generateInvoiceAction,
  restockFinishedProductAction,
  restockMaterialAction,
  retryOrderAction,
  updateOrderAction,
} from "./actions";
import {
  CustomersInlineTable,
  FinishedInventoryInlineTable,
  InvoicesInlineTable,
  ManufacturingInlineTable,
  MaterialsInlineTable,
  OrdersInlineBoard,
  PrintersInlineTable,
  ProductsInlineTable,
} from "./components/editable-tables";
import { SubmitButton } from "./components/form-ui";
import { FilterSummary } from "./components/filter-summary";
import { getAppSnapshot } from "@/lib/erp-service";

const sectionKeys = [
  "dashboard",
  "pedidos",
  "fabricacion",
  "stock",
  "productos-terminados",
  "facturas",
  "impresoras",
  "productos",
  "materiales",
  "clientes",
  "movimientos",
] as const;

const sectionLabels: Record<(typeof sectionKeys)[number], string> = {
  dashboard: "Resumen",
  pedidos: "Pedidos",
  fabricacion: "Fabricacion",
  stock: "Stock materiales",
  "productos-terminados": "Productos terminados",
  facturas: "Facturas",
  impresoras: "Impresoras",
  productos: "Productos",
  materiales: "Materiales",
  clientes: "Clientes",
  movimientos: "Movimientos",
};

const orderStatusLabels: Record<string, string> = {
  BORRADOR: "borrador",
  CONFIRMADO: "confirmado",
  EN_PRODUCCION: "en produccion",
  LISTO: "listo",
  ENTREGADO: "entregado",
  FACTURADO: "facturado",
  INCIDENCIA_STOCK: "incidencia stock",
};

const manufacturingStatusLabels: Record<string, string> = {
  PENDIENTE: "pendiente",
  INICIADA: "iniciada",
  COMPLETADA: "completada",
  BLOQUEADA_POR_STOCK: "bloqueada por stock",
};

const printerStatusLabels: Record<string, string> = {
  LIBRE: "libre",
  IMPRIMIENDO: "imprimiendo",
  MANTENIMIENTO: "mantenimiento",
};

const movementInventoryLabels: Record<string, string> = {
  ALL: "todos",
  MATERIAL: "materiales",
  PRODUCTO_TERMINADO: "productos terminados",
};

const invoicePaymentLabels: Record<string, string> = {
  ALL: "todas",
  PENDIENTE: "pendientes",
  PARCIAL: "parciales",
  PAGADA: "pagadas",
};

function currency(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toDateInputValue(value?: string) {
  return value?.trim() ?? "";
}

function buildDateRangeStart(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateRangeEnd(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function invoiceStatusFilterLabel(status: string) {
  if (status === "PENDIENTE") return "pendientes";
  if (status === "PARCIAL") return "parciales";
  if (status === "PAGADA") return "pagadas";
  return "todas";
}

function toPlainData<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    const serialized = JSON.stringify(value);
    return (serialized ? JSON.parse(serialized) : value) as T;
  }
}

type Snapshot = Awaited<ReturnType<typeof getAppSnapshot>>;
type OrderView = Snapshot["orders"][number];

function badgeClass(tone: "success" | "warn" | "danger" | "info" | "neutral") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-black/10 bg-white text-[color:var(--muted)]";
}

function orderStatusTone(status: string) {
  if (status === "FACTURADO") return "success";
  if (status === "LISTO" || status === "ENTREGADO") return "info";
  if (status === "INCIDENCIA_STOCK") return "danger";
  if (status === "EN_PRODUCCION") return "warn";
  return "neutral";
}

function cardHighlightClass(level?: "danger" | "warn" | "attention" | null) {
  if (level === "danger") {
    return "border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.86),rgba(255,255,255,0.96))] shadow-[inset_4px_0_0_rgba(190,24,93,0.9)]";
  }
  if (level === "warn") {
    return "border-amber-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.82),rgba(255,255,255,0.96))] shadow-[inset_4px_0_0_rgba(194,65,12,0.78)]";
  }
  if (level === "attention") {
    return "border-sky-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.78),rgba(255,255,255,0.96))] shadow-[inset_4px_0_0_rgba(37,99,235,0.65)]";
  }
  return "border-black/6";
}

function orderNextStep(order: OrderView) {
  if (order.estado === "BORRADOR") return "Confirmar pedido para reservar stock y decidir si sale de almacen o va a fabricacion.";
  if (order.estado === "CONFIRMADO") return "Abrir fabricacion y arrancar las ordenes pendientes.";
  if (order.estado === "EN_PRODUCCION") return "Completar la produccion pendiente para dejar el pedido listo.";
  if (order.estado === "LISTO") return "Entregar el pedido al cliente.";
  if (order.estado === "ENTREGADO") return "Generar la factura del pedido.";
  if (order.estado === "INCIDENCIA_STOCK") return "Reponer material y reintentar la validacion.";
  return "Pedido cerrado y trazado.";
}

function movementQuantityLabel(movement: { inventario_tipo: string; cantidad: number }) {
  return movement.inventario_tipo === "MATERIAL" ? `${movement.cantidad} g` : `${movement.cantidad} uds`;
}

function FilterLink({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${
        active
          ? "border-sky-200 bg-[color:var(--accent-soft)] text-[color:var(--accent-hover)]"
          : "border-[color:var(--line)] bg-white text-[color:var(--muted-strong)] hover:border-[color:var(--line-strong)] hover:bg-[color:var(--surface-muted)]"
      }`}
    >
      {label}
      {count != null ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{count}</span> : null}
    </Link>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warn" | "danger" | "info" | "neutral";
}) {
  return (
    <span className={`erp-badge ${badgeClass(tone)}`}>
      {label}
    </span>
  );
}

function IntelligentAlertCard({
  tone,
  title,
  description,
  href,
  actionLabel,
}: {
  tone: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
}) {
  const toneClass =
    tone === "critical"
      ? "smart-alert-card smart-alert-card--critical"
      : tone === "warning"
        ? "smart-alert-card smart-alert-card--warning"
        : tone === "info"
          ? "smart-alert-card smart-alert-card--info"
          : "smart-alert-card smart-alert-card--success";
  const toneLabel =
    tone === "critical" ? "Critico" : tone === "warning" ? "Warning" : tone === "info" ? "Info" : "Todo en orden";

  return (
    <article className={toneClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="smart-alert-badge">{toneLabel}</span>
          <h4 className="mt-3 text-base font-semibold text-slate-950">{title}</h4>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-strong)]">{description}</p>
        </div>
        {href && actionLabel ? (
          <Link href={href} className="smart-alert-link">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function DashboardKpiCard({
  label,
  value,
  detail,
  href,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  tone?: "success" | "warn" | "danger" | "info" | "neutral";
}) {
  const cardClass = `erp-card px-4 py-4 ${tone === "danger" ? "border-rose-200" : tone === "warn" ? "border-amber-200" : tone === "info" ? "border-sky-200" : tone === "success" ? "border-emerald-200" : ""}`.trim();
  const content = (
    <>
      <p className="text-sm text-[color:var(--muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
      {detail ? <p className="mt-2 text-sm text-[color:var(--muted)]">{detail}</p> : null}
    </>
  );

  return href ? (
    <Link href={href} className={`${cardClass} block transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]`}>
      {content}
    </Link>
  ) : (
    <article className={cardClass}>{content}</article>
  );
}

function Section({
  active,
  title,
  subtitle,
  children,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className={active ? "space-y-5" : "hidden"}>
      <div className="section-header px-6 py-5">
        <p className="eyebrow">{subtitle}</p>
        <h2 className="mt-3 text-[clamp(1.55rem,2vw,1.95rem)] font-semibold tracking-[-0.04em] text-slate-900">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
  className = "",
  stacked = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  stacked?: boolean;
}) {
  return (
    <label className={`form-field ${stacked ? "form-field--stack" : ""} ${className}`.trim()}>
      <span className="form-label">{label}</span>
      {hint ? <span className="form-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{
    section?: string;
    orderStatus?: string;
    manufacturingStatus?: string;
    materialFilter?: string;
    productFilter?: string;
    customerFilter?: string;
    clienteId?: string;
    productoId?: string;
    impresoraId?: string;
    origen?: string;
    printerStatus?: string;
    printerActiveFilter?: string;
    movementInventory?: string;
    invoiceStatus?: string;
    pedidoId?: string;
    facturaId?: string;
    fecha_inicio?: string;
    fecha_fin?: string;
    message?: string;
    tone?: string;
  }>;
}) {
  const resolved = (await searchParams) ?? {};
  const section = sectionKeys.includes(resolved.section as (typeof sectionKeys)[number])
    ? (resolved.section as (typeof sectionKeys)[number])
    : "dashboard";
  const snapshot: Snapshot = toPlainData(await getAppSnapshot());
  const {
    customers,
    materials,
    products,
    orders,
    manufacturingOrders,
    stockMovements,
    finishedInventory,
    printers,
    inventoryMovements,
    invoices,
  } = snapshot;

  const orderFilter = resolved.orderStatus ?? "ALL";
  const manufacturingFilter = resolved.manufacturingStatus ?? "ALL";
  const materialFilter = resolved.materialFilter ?? "ACTIVE";
  const productFilter = resolved.productFilter ?? "ACTIVE";
  const customerFilter = resolved.customerFilter ?? "ACTIVE";
  const printerFilter = resolved.printerStatus ?? "ALL";
  const printerActiveFilter = resolved.printerActiveFilter ?? "ACTIVE";
  const movementFilter = resolved.movementInventory ?? "ALL";
  const invoiceFilter = resolved.invoiceStatus ?? "ALL";
  const focusedOrderCode = resolved.pedidoId?.trim() || null;
  const focusedCustomerCode = resolved.clienteId?.trim() || null;
  const focusedProductCode = resolved.productoId?.trim() || null;
  const focusedPrinterCode = resolved.impresoraId?.trim() || null;
  const focusedInvoiceCode = resolved.facturaId?.trim() || null;
  const customerFocusOrigin =
    resolved.origen === "pedido" || resolved.origen === "factura" || resolved.origen === "pago"
      ? resolved.origen
      : null;
  const productFocusOrigin =
    resolved.origen === "cliente" || resolved.origen === "pedido" || resolved.origen === "factura"
      ? resolved.origen
      : null;
  const printerFocusOrigin =
    resolved.origen === "producto" || resolved.origen === "pedido" || resolved.origen === "fabricacion"
      ? resolved.origen
      : null;
  const invoiceDateStart = toDateInputValue(resolved.fecha_inicio);
  const invoiceDateEnd = toDateInputValue(resolved.fecha_fin);
  const invoiceStartDate = buildDateRangeStart(invoiceDateStart);
  const invoiceEndDate = buildDateRangeEnd(invoiceDateEnd);
  const hasInvoiceStatusFilter = invoiceFilter !== "ALL";
  const hasInvoiceDateFilter = Boolean(invoiceDateStart || invoiceDateEnd);
  const hasActiveInvoiceFilters = hasInvoiceStatusFilter || hasInvoiceDateFilter;

  const filteredOrdersBase = orderFilter === "ALL" ? orders : orders.filter((order) => order.estado === orderFilter);
  const filteredOrders = focusedOrderCode
    ? [
        ...filteredOrdersBase.filter((order) => order.codigo === focusedOrderCode),
        ...filteredOrdersBase.filter((order) => order.codigo !== focusedOrderCode),
      ]
    : filteredOrdersBase;
  const filteredManufacturing =
    manufacturingFilter === "ALL"
      ? manufacturingOrders
      : manufacturingOrders.filter((order) => order.estado === manufacturingFilter);
  const filteredMaterials =
    materialFilter === "ACTIVE"
      ? materials.filter((material) => material.activo)
      : materialFilter === "INACTIVE"
        ? materials.filter((material) => !material.activo)
        : materials;
  const filteredProducts =
    (
      productFilter === "ACTIVE"
        ? products.filter((product) => product.activo || product.codigo === focusedProductCode)
        : productFilter === "INACTIVE"
          ? products.filter((product) => !product.activo || product.codigo === focusedProductCode)
          : products
    );
  const prioritizedProducts = focusedProductCode
    ? [
        ...filteredProducts.filter((product) => product.codigo === focusedProductCode),
        ...filteredProducts.filter((product) => product.codigo !== focusedProductCode),
      ]
    : filteredProducts;
  const filteredCustomersBase =
    customerFilter === "ACTIVE"
      ? customers.filter((customer) => customer.activo || customer.codigo === focusedCustomerCode)
      : customerFilter === "INACTIVE"
        ? customers.filter((customer) => !customer.activo || customer.codigo === focusedCustomerCode)
        : customers;
  const filteredCustomers = focusedCustomerCode
    ? [
        ...filteredCustomersBase.filter((customer) => customer.codigo === focusedCustomerCode),
        ...filteredCustomersBase.filter((customer) => customer.codigo !== focusedCustomerCode),
      ]
    : filteredCustomersBase;
  const filteredPrintersByState =
    printerFilter === "ALL" ? printers : printers.filter((printer) => printer.estado === printerFilter);
  const filteredPrinters =
    printerActiveFilter === "ACTIVE"
      ? filteredPrintersByState.filter((printer) => printer.activo || printer.codigo === focusedPrinterCode)
      : printerActiveFilter === "INACTIVE"
        ? filteredPrintersByState.filter((printer) => !printer.activo || printer.codigo === focusedPrinterCode)
        : filteredPrintersByState;
  const prioritizedPrinters = focusedPrinterCode
    ? [
        ...filteredPrinters.filter((printer) => printer.codigo === focusedPrinterCode),
        ...filteredPrinters.filter((printer) => printer.codigo !== focusedPrinterCode),
      ]
    : filteredPrinters;
  const filteredInventoryMovements =
    movementFilter === "ALL"
      ? inventoryMovements
      : inventoryMovements.filter((movement) => movement.inventario_tipo === movementFilter);
  const filteredInvoicesBase =
    invoiceFilter === "ALL"
      ? invoices
      : invoices.filter((invoice: Snapshot["invoices"][number]) => invoice.estado_pago === invoiceFilter);
  const filteredInvoices = focusedInvoiceCode
    ? [
        ...filteredInvoicesBase.filter((invoice) => invoice.codigo === focusedInvoiceCode),
        ...filteredInvoicesBase.filter((invoice) => invoice.codigo !== focusedInvoiceCode),
      ]
    : filteredInvoicesBase;
  const dateFilteredInvoices = filteredInvoices.filter((invoice: Snapshot["invoices"][number]) => {
    const invoiceDate = new Date(invoice.fecha);
    if (Number.isNaN(invoiceDate.getTime())) {
      return false;
    }
    if (invoiceStartDate && invoiceDate < invoiceStartDate) {
      return false;
    }
    if (invoiceEndDate && invoiceDate > invoiceEndDate) {
      return false;
    }
    return true;
  });

  const activeMaterials = materials.filter((material) => material.activo);
  const activeProducts = products.filter((product) => product.activo);
  const activeCustomers = customers.filter((customer) => customer.activo);
  const activePrinters = printers.filter((printer) => printer.activo);
  const lowStockMaterials = activeMaterials.filter((material) => material.stock_actual_g <= material.stock_minimo_g);
  const finishedUnits = finishedInventory.reduce((sum, item) => sum + item.cantidad_disponible, 0);
  const finishedStockValue = finishedInventory.reduce(
    (sum, item) => sum + item.cantidad_disponible * item.coste_unitario,
    0,
  );
  const openOrders = orders.filter((order) => order.estado !== "FACTURADO").length;
  const pendingManufacturing = manufacturingOrders.filter((order) => order.estado !== "COMPLETADA").length;
  const pendingInvoices = invoices.filter((invoice) => invoice.estado_pago !== "PAGADA").length;
  const filteredPaymentsCount = dateFilteredInvoices.reduce((sum, invoice) => {
    return (
      sum +
      invoice.pagos.filter((payment) => {
        const paymentDate = new Date(payment.fecha_pago);
        if (Number.isNaN(paymentDate.getTime())) {
          return false;
        }
        if (invoiceStartDate && paymentDate < invoiceStartDate) {
          return false;
        }
        if (invoiceEndDate && paymentDate > invoiceEndDate) {
          return false;
        }
        return true;
      }).length
    );
  }, 0);
  const rangedTotalInvoiced = dateFilteredInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const rangedTotalCollected = dateFilteredInvoices.reduce((sum, invoice) => sum + invoice.total_pagado, 0);
  const rangedTotalOutstanding = dateFilteredInvoices.reduce((sum, invoice) => sum + invoice.importe_pendiente, 0);
  const rangedInvoiceCount = dateFilteredInvoices.length;
  const rangedPendingInvoices = dateFilteredInvoices.filter((invoice) => invoice.estado_pago === "PENDIENTE").length;
  const rangedPartialInvoices = dateFilteredInvoices.filter((invoice) => invoice.estado_pago === "PARCIAL").length;
  const rangedPaidInvoices = dateFilteredInvoices.filter((invoice) => invoice.estado_pago === "PAGADA").length;
  const hasActiveOrderFilters = orderFilter !== "ALL";
  const activeOrderFilterSegments: string[] = [
    hasActiveOrderFilters ? `estado: ${orderStatusLabels[orderFilter]}` : null,
  ].filter((segment): segment is string => Boolean(segment));
  const hasActiveMaterialFilters = materialFilter !== "ALL";
  const activeMaterialFilterSegments: string[] = [
    materialFilter === "ACTIVE" ? "estado: activos" : materialFilter === "INACTIVE" ? "estado: archivados" : null,
  ].filter((segment): segment is string => Boolean(segment));
  const hasActiveProductFilters = productFilter !== "ALL";
  const activeProductFilterSegments: string[] = [
    productFilter === "ACTIVE" ? "estado: activos" : productFilter === "INACTIVE" ? "estado: archivados" : null,
  ].filter((segment): segment is string => Boolean(segment));
  const hasActiveCustomerFilters = customerFilter !== "ALL";
  const activeCustomerFilterSegments: string[] = [
    customerFilter === "ACTIVE" ? "estado: activos" : customerFilter === "INACTIVE" ? "estado: archivados" : null,
  ].filter((segment): segment is string => Boolean(segment));
  const hasActivePrinterFilters = printerFilter !== "ALL" || printerActiveFilter !== "ALL";
  const activePrinterFilterSegments: string[] = [
    hasActivePrinterFilters ? `estado: ${printerStatusLabels[printerFilter]}` : null,
    printerActiveFilter === "ACTIVE" ? "visibles: activas" : printerActiveFilter === "INACTIVE" ? "visibles: archivadas" : null,
  ].filter((segment): segment is string => Boolean(segment));
  const hasActiveMovementFilters = movementFilter !== "ALL";
  const activeMovementFilterSegments: string[] = [
    hasActiveMovementFilters ? `tipo: ${movementInventoryLabels[movementFilter]}` : null,
  ].filter((segment): segment is string => Boolean(segment));
  const activeInvoiceFilterSegments: string[] = [
    hasInvoiceStatusFilter ? `estado: ${invoiceStatusFilterLabel(invoiceFilter)}` : null,
    invoiceDateStart ? `desde: ${invoiceDateStart}` : null,
    invoiceDateEnd ? `hasta: ${invoiceDateEnd}` : null,
  ].filter((segment): segment is string => Boolean(segment));
  const readyToDeliver = orders.filter((order) => order.estado === "LISTO").length;
  const readyToInvoice = orders.filter((order) => order.estado === "ENTREGADO").length;
  const busyPrinters = printers.filter((printer) => printer.estado === "IMPRIMIENDO").length;
  const maintenancePrinters = activePrinters.filter((printer) => printer.estado === "MANTENIMIENTO");
  const blockedOrders = orders.filter((order) => order.estado === "INCIDENCIA_STOCK");
  const blockedManufacturing = manufacturingOrders.filter((order) => order.estado === "BLOQUEADA_POR_STOCK");
  const pendingManufacturingOrders = manufacturingOrders.filter((order) => order.estado !== "COMPLETADA");
  const partialInvoices = invoices.filter((invoice) => invoice.estado_pago === "PARCIAL");
  const pendingPaymentInvoices = invoices.filter((invoice) => invoice.estado_pago === "PENDIENTE");
  const lowStockPreview = lowStockMaterials
    .slice(0, 3)
    .map((material) => `${material.codigo} ${material.nombre} (${material.stock_actual_g}/${material.stock_minimo_g} g)`)
    .join(", ");
  const blockedOrdersPreview = blockedOrders
    .slice(0, 3)
    .map((order) => `${order.codigo} ${order.cliente_nombre}`)
    .join(", ");
  const blockedManufacturingPreview = blockedManufacturing
    .slice(0, 3)
    .map((order) => `${order.codigo} ${order.producto_nombre}`)
    .join(", ");
  const printerPreview = [
    busyPrinters > 0 ? `${busyPrinters} imprimiendo` : null,
    maintenancePrinters.length > 0 ? `${maintenancePrinters.length} en mantenimiento` : null,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join(" y ");
  const paymentPreview = [
    pendingPaymentInvoices.length > 0 ? `${pendingPaymentInvoices.length} pendientes` : null,
    partialInvoices.length > 0 ? `${partialInvoices.length} parciales` : null,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join(" y ");
  const totalInvoiced = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalCollected = invoices.reduce((sum, invoice) => sum + invoice.total_pagado, 0);
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.importe_pendiente, 0);
  const paidInvoicesCount = invoices.filter((invoice) => invoice.estado_pago === "PAGADA").length;
  const activeOrdersCount = orders.filter((order) => order.estado !== "FACTURADO").length;
  const ordersInProductionCount = orders.filter((order) => order.estado === "EN_PRODUCCION").length;
  const deliveredOrdersCount = orders.filter((order) => order.estado === "ENTREGADO").length;
  const activeManufacturingCount = manufacturingOrders.filter((order) => order.estado === "INICIADA").length;
  const availablePrintersCount = activePrinters.filter((printer) => printer.estado === "LIBRE").length;
  const unavailablePrinters = activePrinters.filter((printer) => printer.estado !== "LIBRE");
  const estimatedMaterialStockValue = activeMaterials.reduce(
    (sum, material) => sum + (material.stock_actual_g / 1000) * material.precio_kg,
    0,
  );
  const hasMaterialCostData = activeMaterials.some((material) => material.precio_kg > 0);
  const productsById = new Map(products.map((product) => [product.id, product] as const));
  const topProductsByUnits = Array.from(
    orders
      .filter((order) => order.estado !== "BORRADOR")
      .flatMap((order) => order.lineas)
      .reduce(
        (map, line) => {
          const current = map.get(line.producto_id) ?? { productId: line.producto_id, units: 0 };
          current.units += line.cantidad;
          map.set(line.producto_id, current);
          return map;
        },
        new Map<string, { productId: string; units: number }>(),
      )
      .values(),
  )
    .map((item) => {
      const product = productsById.get(item.productId);
      return {
        productId: item.productId,
        codigo: product?.codigo ?? "No disponible",
        nombre: product?.nombre ?? "Producto sin ficha",
        units: item.units,
      };
    })
    .sort((a, b) => b.units - a.units || a.codigo.localeCompare(b.codigo))
    .slice(0, 5);
  const topClientsByInvoiced = Array.from(
    invoices
      .reduce(
        (map, invoice) => {
          const current =
            map.get(invoice.cliente_id) ??
            { clienteId: invoice.cliente_id, codigo: invoice.cliente_codigo, nombre: invoice.cliente_nombre, total: 0 };
          current.total += invoice.total;
          map.set(invoice.cliente_id, current);
          return map;
        },
        new Map<string, { clienteId: string; codigo: string; nombre: string; total: number }>(),
      )
      .values(),
  )
    .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo))
    .slice(0, 5);
  const topClientsByOrders = Array.from(
    orders
      .reduce(
        (map, order) => {
          const current =
            map.get(order.cliente_id) ??
            { clienteId: order.cliente_id, codigo: order.cliente_codigo, nombre: order.cliente_nombre, orders: 0 };
          current.orders += 1;
          map.set(order.cliente_id, current);
          return map;
        },
        new Map<string, { clienteId: string; codigo: string; nombre: string; orders: number }>(),
      )
      .values(),
  )
    .sort((a, b) => b.orders - a.orders || a.codigo.localeCompare(b.codigo))
    .slice(0, 5);
  const pendingInvoiceRecords = [...invoices]
    .filter((invoice) => invoice.estado_pago !== "PAGADA")
    .sort((a, b) => b.importe_pendiente - a.importe_pendiente || a.fecha.localeCompare(b.fecha))
    .slice(0, 5);
  const nonAvailablePrintersPreview = unavailablePrinters.slice(0, 5);
  const lowStockMaterialsPreview = lowStockMaterials.slice(0, 5);
  const dashboardActionLinks = [
    { href: "/?section=facturas&invoiceStatus=ALL", label: "Ver cobros", count: pendingInvoices },
    { href: "/?section=pedidos&orderStatus=INCIDENCIA_STOCK", label: "Pedidos con incidencia", count: blockedOrders.length },
    { href: "/?section=fabricacion&manufacturingStatus=INICIADA", label: "Fabricacion activa", count: activeManufacturingCount },
    { href: "/?section=impresoras&printerStatus=ALL&printerActiveFilter=ACTIVE", label: "Capacidad de impresoras", count: unavailablePrinters.length },
  ];
  const smartAlerts = [
    ...(blockedOrders.length > 0
      ? [
          {
            tone: "critical" as const,
            title: "Pedidos con incidencia",
            description:
              blockedOrders.length === 1
                ? `Hay 1 pedido con incidencia de stock. ${blockedOrdersPreview}`
                : `Hay ${blockedOrders.length} pedidos con incidencia de stock. ${blockedOrdersPreview}`,
            href: "/?section=pedidos&orderStatus=INCIDENCIA_STOCK",
            actionLabel: "Ver pedidos",
          },
        ]
      : []),
    ...(lowStockMaterials.length > 0
      ? [
          {
            tone: "warning" as const,
            title: "Materiales con stock bajo",
            description:
              lowStockMaterials.length === 1
                ? `Hay 1 material por debajo o en su minimo. ${lowStockPreview}`
                : `Hay ${lowStockMaterials.length} materiales por debajo o en su minimo. ${lowStockPreview}`,
            href: "/?section=materiales&materialFilter=ACTIVE",
            actionLabel: "Ver materiales",
          },
        ]
      : []),
    ...(pendingPaymentInvoices.length > 0 || partialInvoices.length > 0
      ? [
          {
            tone: "warning" as const,
            title: "Facturas pendientes de cobro",
            description: `Hay ${pendingInvoices} facturas no liquidadas. ${paymentPreview}`,
            href: "/?section=facturas&invoiceStatus=ALL",
            actionLabel: "Ver facturas",
          },
        ]
      : []),
    ...(pendingManufacturingOrders.length > 0
      ? [
          {
            tone: blockedManufacturing.length > 0 ? ("warning" as const) : ("info" as const),
            title: "Fabricacion en curso o pendiente",
            description:
              blockedManufacturing.length > 0
                ? `Hay ${pendingManufacturingOrders.length} ordenes sin completar, con ${blockedManufacturing.length} bloqueadas por stock. ${blockedManufacturingPreview}`
                : `Hay ${pendingManufacturingOrders.length} ordenes sin completar, de las cuales ${manufacturingOrders.filter((order) => order.estado === "PENDIENTE").length} estan pendientes de iniciar.`,
            href: "/?section=fabricacion",
            actionLabel: "Ver fabricacion",
          },
        ]
      : []),
    ...(busyPrinters > 0 || maintenancePrinters.length > 0
      ? [
          {
            tone: maintenancePrinters.length > 0 ? ("warning" as const) : ("info" as const),
            title: "Estado de impresoras",
            description: `Capacidad activa monitorizada: ${printerPreview}.`,
            href: "/?section=impresoras",
            actionLabel: "Ver impresoras",
          },
        ]
      : []),
  ];
  const todayLabelText = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const sectionCounters: Partial<Record<(typeof sectionKeys)[number], number>> = {
    pedidos: openOrders,
    fabricacion: pendingManufacturing,
    stock: lowStockMaterials.length,
    "productos-terminados": finishedUnits,
    facturas: pendingInvoices,
    impresoras: printers.filter((printer) => printer.estado !== "LIBRE").length,
    productos: products.length,
    materiales: materials.length,
    clientes: customers.length,
    movimientos: inventoryMovements.length,
  };

  const shortcuts = [
    { href: "/?section=pedidos#create-order", label: "Nuevo pedido", count: undefined },
    {
      href: "/?section=pedidos&orderStatus=BORRADOR",
      label: "Pendientes de confirmar",
      count: orders.filter((order) => order.estado === "BORRADOR").length,
    },
    {
      href: "/?section=fabricacion&manufacturingStatus=PENDIENTE",
      label: "Pendientes de iniciar",
      count: manufacturingOrders.filter((order) => order.estado === "PENDIENTE").length,
    },
    { href: "/?section=pedidos&orderStatus=LISTO", label: "Listos para entregar", count: readyToDeliver },
    { href: "/?section=pedidos&orderStatus=ENTREGADO", label: "Listos para facturar", count: readyToInvoice },
    { href: "/?section=stock#restock-material", label: "Reponer material", count: lowStockMaterials.length },
  ];

  return (
    <main className="erp-shell">
      <div className="erp-layout">
        <aside className="erp-sidebar">
          <div className="erp-sidebar-brand">
            <p className="eyebrow">ERP</p>
            <h1 className="erp-sidebar-title">Eli Print 3D</h1>
            <p className="erp-sidebar-subtitle">Produccion 3D profesional</p>
          </div>
          <div className="erp-sidebar-meta">
            <div className="erp-sidebar-stat">
              <p className="erp-sidebar-stat-label">Pedidos abiertos</p>
              <p className="erp-sidebar-stat-value">{openOrders}</p>
            </div>
            <div className="erp-sidebar-stat">
              <p className="erp-sidebar-stat-label">Impresoras ocupadas</p>
              <p className="erp-sidebar-stat-value">{busyPrinters}</p>
            </div>
            <div className="erp-sidebar-stat">
              <p className="erp-sidebar-stat-label">Jornada</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{todayLabelText}</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">Operacion sincronizada y trazabilidad activa.</p>
            </div>
          </div>
          <nav className="erp-sidebar-nav">
            {sectionKeys.map((key) => (
              <Link
                key={key}
                href={`/?section=${key}`}
                className={`erp-sidebar-link ${section === key ? "is-active" : ""}`}
              >
                <span>{sectionLabels[key]}</span>
                {sectionCounters[key] != null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      section === key
                        ? "border border-sky-200 bg-white text-sky-700"
                        : "bg-slate-100 text-[color:var(--muted)]"
                    }`}
                  >
                    {sectionCounters[key]}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="erp-main">
          <div className="erp-header">
            <div>
              <p className="eyebrow">Eli Print 3D</p>
              <h2 className="erp-header-title">ERP administrativo para pedidos, stock y fabricacion</h2>
              <p className="erp-header-subtitle">
                Interfaz limpia, trazable y consistente para operar como en un ERP profesional, con navegacion lateral clara y registros amplios.
              </p>
            </div>
            <div className="erp-toolbar">
              <Link href="/?section=pedidos#create-order" className="erp-button-primary">
                Nuevo pedido
              </Link>
              <Link href="/?section=facturas" className="erp-button-secondary">
                Ver facturas
              </Link>
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-5 px-6 py-5">
              <div>
                <p className="eyebrow">Vista general</p>
                <h2 className="mt-3 text-[clamp(1.7rem,2.7vw,2.15rem)] font-semibold tracking-[-0.05em] text-slate-950">
                  Centro de control operativo
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                  Resumen diario, accesos rapidos y estado transversal de pedidos, fabricacion, stock y facturacion en una sola pantalla administrativa.
                </p>
              </div>
              <div className="grid min-w-[260px] flex-1 gap-3 sm:grid-cols-2 xl:max-w-md">
                <div className="erp-card px-4 py-4">
                  <p className="eyebrow">Valor stock</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{currency(finishedStockValue)}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">Producto terminado valorado a coste</p>
                </div>
                <div className="erp-card px-4 py-4">
                  <p className="eyebrow">Impresoras</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    {busyPrinters}/{printers.length}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">ocupadas ahora mismo</p>
                </div>
              </div>
            </div>
            <div className="soft-divider" />
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="eyebrow">Pedidos</p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">Borrradores, listos y entregados siempre a mano.</p>
              </div>
              <div>
                <p className="eyebrow">Fabricacion</p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">Ordenes con estados claros y accion inmediata.</p>
              </div>
              <div>
                <p className="eyebrow">Inventario</p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">Alertas visibles antes de que el stock bloquee pedidos.</p>
              </div>
              <div>
                <p className="eyebrow">Facturacion</p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">Cobro y trazabilidad alineados con la operativa.</p>
              </div>
            </div>
          </div>
          {resolved.message ? (
            <div
              role="status"
              aria-live="polite"
              className={`panel px-5 py-4 text-sm font-medium ${
                resolved.tone === "error"
                  ? "border-red-200 bg-[linear-gradient(180deg,#fff1f2,#fff7f7)] text-red-700"
                  : "border-emerald-200 bg-[linear-gradient(180deg,#ecfdf3,#f7fff9)] text-emerald-700"
              }`}
            >
              {resolved.message}
            </div>
          ) : null}

          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Acceso rapido</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-950">Las acciones mas frecuentes, a un clic</h2>
              </div>
              <p className="max-w-xl text-sm text-[color:var(--muted)]">
                Priorizamos confirmar pedidos, arrancar fabricacion, entregar y facturar sin pasos extra.
              </p>
            </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {shortcuts.map((shortcut) => (
              <FilterLink
                key={shortcut.href}
                href={shortcut.href}
                  label={shortcut.label}
                  active={false}
                  count={shortcut.count}
                />
              ))}
            </div>
          </div>
          <Section active={section === "dashboard"} title="Resumen operativo" subtitle="Panel principal">
            <div className="odoo-action-bar">
              {dashboardActionLinks.map((item) => (
                <FilterLink key={item.href} href={item.href} label={item.label} active={false} count={item.count} />
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Facturacion</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">Dinero y cobro</h3>
                  </div>
                  <StatusPill label={`${invoices.length} facturas`} tone={pendingInvoices > 0 ? "warn" : "success"} />
                </div>
                <div className="odoo-record-grid">
                  <DashboardKpiCard label="Total facturado" value={currency(totalInvoiced)} detail="Importe total emitido" href="/?section=facturas&invoiceStatus=ALL" tone="info" />
                  <DashboardKpiCard label="Total cobrado" value={currency(totalCollected)} detail="Cobros registrados" href="/?section=facturas&invoiceStatus=PAGADA" tone="success" />
                  <DashboardKpiCard label="Pendiente de cobro" value={currency(totalOutstanding)} detail="Saldo aun no liquidado" href="/?section=facturas&invoiceStatus=ALL" tone={totalOutstanding > 0 ? "warn" : "success"} />
                  <DashboardKpiCard label="Facturas pagadas" value={paidInvoicesCount} detail="Total totalmente liquidadas" href="/?section=facturas&invoiceStatus=PAGADA" />
                  <DashboardKpiCard label="Facturas parciales" value={partialInvoices.length} detail="Con cobro parcial" href="/?section=facturas&invoiceStatus=PARCIAL" tone={partialInvoices.length > 0 ? "warn" : "neutral"} />
                  <DashboardKpiCard label="Facturas pendientes" value={pendingPaymentInvoices.length} detail="Sin cobro registrado" href="/?section=facturas&invoiceStatus=PENDIENTE" tone={pendingPaymentInvoices.length > 0 ? "danger" : "neutral"} />
                </div>
              </article>

              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Pedidos</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">Estado comercial</h3>
                  </div>
                  <StatusPill label={`${orders.length} pedidos`} tone={activeOrdersCount > 0 ? "info" : "neutral"} />
                </div>
                <div className="odoo-record-grid">
                  <DashboardKpiCard label="Pedidos totales" value={orders.length} detail="Historico completo" href="/?section=pedidos" />
                  <DashboardKpiCard label="Pedidos activos" value={activeOrdersCount} detail="Aun no facturados" href="/?section=pedidos&orderStatus=ALL" tone={activeOrdersCount > 0 ? "info" : "neutral"} />
                  <DashboardKpiCard label="En fabricacion" value={ordersInProductionCount} detail="Pedidos ya lanzados" href="/?section=pedidos&orderStatus=EN_PRODUCCION" tone={ordersInProductionCount > 0 ? "warn" : "neutral"} />
                  <DashboardKpiCard label="Listos" value={readyToDeliver} detail="Preparados para entregar" href="/?section=pedidos&orderStatus=LISTO" tone={readyToDeliver > 0 ? "success" : "neutral"} />
                  <DashboardKpiCard label="Entregados" value={deliveredOrdersCount} detail="Pendientes de factura o cierre" href="/?section=pedidos&orderStatus=ENTREGADO" />
                  <DashboardKpiCard label="Con incidencia" value={blockedOrders.length} detail="Bloqueados por stock" href="/?section=pedidos&orderStatus=INCIDENCIA_STOCK" tone={blockedOrders.length > 0 ? "danger" : "neutral"} />
                </div>
              </article>

              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Produccion</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">Capacidad y carga</h3>
                  </div>
                  <StatusPill label={`${activePrinters.length} impresoras activas`} tone={busyPrinters > 0 ? "info" : "neutral"} />
                </div>
                <div className="odoo-record-grid">
                  <DashboardKpiCard label="Ordenes activas" value={activeManufacturingCount} detail="Fabricacion iniciada" href="/?section=fabricacion&manufacturingStatus=INICIADA" tone={activeManufacturingCount > 0 ? "info" : "neutral"} />
                  <DashboardKpiCard label="Ordenes pendientes" value={manufacturingOrders.filter((order) => order.estado === "PENDIENTE").length} detail="Aun sin arrancar" href="/?section=fabricacion&manufacturingStatus=PENDIENTE" tone={manufacturingOrders.some((order) => order.estado === "PENDIENTE") ? "warn" : "neutral"} />
                  <DashboardKpiCard label="Impresoras ocupadas" value={busyPrinters} detail="Ahora mismo imprimiendo" href="/?section=impresoras&printerStatus=IMPRIMIENDO&printerActiveFilter=ACTIVE" tone={busyPrinters > 0 ? "info" : "neutral"} />
                  <DashboardKpiCard label="Impresoras disponibles" value={availablePrintersCount} detail="Libres y activas" href="/?section=impresoras&printerStatus=LIBRE&printerActiveFilter=ACTIVE" tone={availablePrintersCount > 0 ? "success" : "warn"} />
                  <DashboardKpiCard label="Productos terminados" value={finishedInventory.length > 0 ? `${finishedUnits} uds` : "No disponible"} detail={finishedInventory.length > 0 ? "Stock disponible para venta" : "Sin inventario de producto terminado"} href="/?section=productos-terminados" />
                  <DashboardKpiCard label="Valor stock terminado" value={finishedInventory.length > 0 ? currency(finishedStockValue) : "No disponible"} detail="Valorado a coste unitario" href="/?section=productos-terminados" />
                </div>
              </article>

              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Materiales</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">Filamento y coste inmovilizado</h3>
                  </div>
                  <StatusPill label={`${activeMaterials.length} activos`} tone={lowStockMaterials.length > 0 ? "warn" : "success"} />
                </div>
                <div className="odoo-record-grid">
                  <DashboardKpiCard label="Materiales activos" value={activeMaterials.length} detail="Disponibles en operativa diaria" href="/?section=materiales&materialFilter=ACTIVE" />
                  <DashboardKpiCard label="Stock bajo" value={lowStockMaterials.length} detail="En minimo o por debajo" href="/?section=materiales&materialFilter=ACTIVE" tone={lowStockMaterials.length > 0 ? "danger" : "neutral"} />
                  <DashboardKpiCard label="Valor estimado de stock" value={hasMaterialCostData ? currency(estimatedMaterialStockValue) : "No disponible"} detail="Segun coste por kilo existente" href="/?section=materiales&materialFilter=ACTIVE" />
                  <DashboardKpiCard label="Reposiciones pendientes" value={lowStockMaterials.length} detail="Materiales a revisar hoy" href="/?section=stock#restock-material" tone={lowStockMaterials.length > 0 ? "warn" : "neutral"} />
                </div>
              </article>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Top negocio</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">Productos por unidades</h3>
                  </div>
                  <StatusPill label="Top 5" tone="info" />
                </div>
                <div className="table-wrap">
                  <table className="odoo-list-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Unidades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductsByUnits.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-sm text-[color:var(--muted)]">No disponible</td>
                        </tr>
                      ) : (
                        topProductsByUnits.map((product) => (
                          <tr key={product.productId}>
                            <td>
                              <Link href={`/?section=productos&productoId=${encodeURIComponent(product.codigo)}`} className="odoo-link">
                                {product.codigo} · {product.nombre}
                              </Link>
                            </td>
                            <td>{product.units} uds</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Top negocio</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">Clientes por importe facturado</h3>
                  </div>
                  <StatusPill label="Top 5" tone="info" />
                </div>
                <div className="table-wrap">
                  <table className="odoo-list-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Facturado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClientsByInvoiced.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-sm text-[color:var(--muted)]">No disponible</td>
                        </tr>
                      ) : (
                        topClientsByInvoiced.map((customer) => (
                          <tr key={customer.clienteId}>
                            <td>
                              <Link href={`/?section=clientes&clienteId=${encodeURIComponent(customer.codigo)}`} className="odoo-link">
                                {customer.codigo} · {customer.nombre}
                              </Link>
                            </td>
                            <td>{currency(customer.total)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="odoo-record">
                <div className="odoo-record-header">
                  <div>
                    <p className="eyebrow">Top negocio</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">Clientes por numero de pedidos</h3>
                  </div>
                  <StatusPill label="Top 5" tone="info" />
                </div>
                <div className="table-wrap">
                  <table className="odoo-list-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Pedidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClientsByOrders.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-sm text-[color:var(--muted)]">No disponible</td>
                        </tr>
                      ) : (
                        topClientsByOrders.map((customer) => (
                          <tr key={customer.clienteId}>
                            <td>
                              <Link href={`/?section=clientes&clienteId=${encodeURIComponent(customer.codigo)}`} className="odoo-link">
                                {customer.codigo} · {customer.nombre}
                              </Link>
                            </td>
                            <td>{customer.orders}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <article className="odoo-record">
              <div className="odoo-record-header">
                <div>
                  <p className="eyebrow">Alertas</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Alertas operativas</h3>
                </div>
                <StatusPill
                  label={smartAlerts.length === 0 ? "Todo en orden" : `${smartAlerts.length} activas`}
                  tone={smartAlerts.some((alert) => alert.tone === "critical") ? "danger" : smartAlerts.length > 0 ? "warn" : "success"}
                />
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="erp-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-950">Facturas pendientes de cobro</h4>
                    <span className={`erp-badge ${badgeClass(pendingInvoiceRecords.length > 0 ? "warn" : "success")}`}>{pendingInvoiceRecords.length}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Factura</th>
                          <th>Estado</th>
                          <th>Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingInvoiceRecords.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-sm text-[color:var(--muted)]">Sin alertas</td>
                          </tr>
                        ) : (
                          pendingInvoiceRecords.map((invoice) => (
                            <tr key={invoice.id}>
                              <td>
                                <Link href={`/?section=facturas&facturaId=${encodeURIComponent(invoice.codigo)}`} className="odoo-link">
                                  {invoice.codigo}
                                </Link>
                              </td>
                              <td><span className={`erp-badge ${badgeClass(invoice.estado_pago === "PENDIENTE" ? "danger" : "warn")}`}>{invoice.estado_pago.toLowerCase()}</span></td>
                              <td>{currency(invoice.importe_pendiente)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="erp-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-950">Pedidos con incidencia</h4>
                    <span className={`erp-badge ${badgeClass(blockedOrders.length > 0 ? "danger" : "success")}`}>{blockedOrders.length}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Pedido</th>
                          <th>Cliente</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockedOrders.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-sm text-[color:var(--muted)]">Sin alertas</td>
                          </tr>
                        ) : (
                          blockedOrders.slice(0, 5).map((order) => (
                            <tr key={order.id}>
                              <td>
                                <Link href={`/?section=pedidos&pedidoId=${encodeURIComponent(order.codigo)}`} className="odoo-link">
                                  {order.codigo}
                                </Link>
                              </td>
                              <td>
                                <Link href={`/?section=clientes&clienteId=${encodeURIComponent(order.cliente_codigo)}`} className="odoo-link">
                                  {order.cliente_codigo} · {order.cliente_nombre}
                                </Link>
                              </td>
                              <td><span className={`erp-badge ${badgeClass("danger")}`}>incidencia</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="erp-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-950">Materiales con stock bajo</h4>
                    <span className={`erp-badge ${badgeClass(lowStockMaterialsPreview.length > 0 ? "warn" : "success")}`}>{lowStockMaterialsPreview.length}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Stock</th>
                          <th>Minimo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStockMaterialsPreview.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-sm text-[color:var(--muted)]">Sin alertas</td>
                          </tr>
                        ) : (
                          lowStockMaterialsPreview.map((material) => (
                            <tr key={material.id}>
                              <td>
                                <Link href="/?section=materiales&materialFilter=ACTIVE" className="odoo-link">
                                  {material.codigo} · {material.nombre}
                                </Link>
                              </td>
                              <td>{material.stock_actual_g} g</td>
                              <td>{material.stock_minimo_g} g</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="erp-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-950">Impresoras no disponibles</h4>
                    <span className={`erp-badge ${badgeClass(nonAvailablePrintersPreview.length > 0 ? "info" : "success")}`}>{nonAvailablePrintersPreview.length}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="odoo-list-table">
                      <thead>
                        <tr>
                          <th>Impresora</th>
                          <th>Estado</th>
                          <th>Ubicacion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nonAvailablePrintersPreview.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-sm text-[color:var(--muted)]">Sin alertas</td>
                          </tr>
                        ) : (
                          nonAvailablePrintersPreview.map((printer) => (
                            <tr key={printer.id}>
                              <td>
                                <Link href={`/?section=impresoras&impresoraId=${encodeURIComponent(printer.codigo)}`} className="odoo-link">
                                  {printer.codigo} · {printer.nombre}
                                </Link>
                              </td>
                              <td><span className={`erp-badge ${badgeClass(printer.estado === "MANTENIMIENTO" ? "warn" : "info")}`}>{printer.estado.toLowerCase()}</span></td>
                              <td>{printer.ubicacion || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </article>
          </Section>
          {false ? (
          <Section active={section === "dashboard"} title="Resumen operativo" subtitle="Panel principal">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Pedidos abiertos", value: openOrders, detail: "por cerrar" },
                { label: "Pendientes de fabricar", value: pendingManufacturing, detail: "ordenes sin completar" },
                { label: "Listos para entregar", value: readyToDeliver, detail: "puedes despacharlos hoy" },
                { label: "Listos para facturar", value: readyToInvoice, detail: "entregados sin factura" },
                { label: "Stock terminado", value: `${finishedUnits} uds`, detail: "listo para vender" },
                {
                  label: "Impresoras libres",
                  value: printers.filter((printer) => printer.estado === "LIBRE").length,
                  detail: `${printers.filter((printer) => printer.estado === "IMPRIMIENDO").length} imprimiendo`,
                },
                { label: "Materiales criticos", value: lowStockMaterials.length, detail: "bajo minimo" },
                { label: "Facturas pendientes", value: pendingInvoices, detail: "cobro pendiente" },
              ].map((metric) => (
                <article key={String(metric.label)} className="metric-card p-5">
                  <p className="text-sm text-[color:var(--muted)]">{metric.label}</p>
                  <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">{metric.detail}</p>
                </article>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="panel p-6 xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow">Alertas inteligentes</p>
                    <h3 className="mt-3 text-xl font-semibold">Prioridades operativas de Eli Print 3D</h3>
                  </div>
                  <StatusPill
                    label={smartAlerts.length === 0 ? "Todo en orden" : `${smartAlerts.length} alertas activas`}
                    tone={smartAlerts.some((alert) => alert.tone === "critical") ? "danger" : smartAlerts.length > 0 ? "warn" : "success"}
                  />
                </div>
                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {smartAlerts.length === 0 ? (
                    <IntelligentAlertCard
                      tone="success"
                      title="Todo en orden"
                      description="No hay incidencias activas en stock, pedidos, fabricacion, impresoras ni cobros pendientes fuera de la operativa normal."
                    />
                  ) : (
                    smartAlerts.map((alert) => (
                      <IntelligentAlertCard
                        key={`${alert.tone}-${alert.title}`}
                        tone={alert.tone}
                        title={alert.title}
                        description={alert.description}
                        href={alert.href}
                        actionLabel={alert.actionLabel}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="panel p-6">
                <h3 className="text-xl font-semibold">Alertas de stock bajo</h3>
                <div className="mt-4 space-y-3">
                  {lowStockMaterials.length === 0 ? (
                    <p className="rounded-2xl bg-white/70 px-4 py-4 text-sm text-[color:var(--muted)]">
                      No hay alertas activas.
                    </p>
                  ) : (
                    lowStockMaterials.map((material) => (
                      <div key={material.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {material.codigo} · {material.nombre} · {material.color}
                            </p>
                            <p className="mt-1 text-sm text-amber-800">
                              Stock actual: {material.stock_actual_g} g · minimo: {material.stock_minimo_g} g
                            </p>
                          </div>
                          <Link
                            href="/?section=stock#restock-material"
                            className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800"
                          >
                            Reponer
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="panel p-6">
                <h3 className="text-xl font-semibold">Hoy toca</h3>
                <div className="mt-4 space-y-3">
                  <Link href="/?section=pedidos&orderStatus=BORRADOR" className="block rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                    <p className="text-sm font-semibold">Confirmar pedidos</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {orders.filter((order) => order.estado === "BORRADOR").length} pendientes de validacion.
                    </p>
                  </Link>
                  <Link href="/?section=fabricacion&manufacturingStatus=PENDIENTE" className="block rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                    <p className="text-sm font-semibold">Arrancar fabricacion</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {manufacturingOrders.filter((order) => order.estado === "PENDIENTE").length} ordenes pendientes.
                    </p>
                  </Link>
                  <Link href="/?section=pedidos&orderStatus=LISTO" className="block rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                    <p className="text-sm font-semibold">Preparar entregas</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{readyToDeliver} pedidos listos para salida.</p>
                  </Link>
                </div>
              </div>
            </div>

          </Section>
          ) : null}

          <Section active={section === "pedidos"} title="Pedidos" subtitle="Ventas y avance">
            <div className={`grid gap-4 ${focusedOrderCode ? "xl:grid-cols-1" : "xl:grid-cols-[0.95fr_1.05fr]"}`}>
              {!focusedOrderCode ? (
              <form id="create-order" action={createOrderAction} className="panel form-shell p-6 space-y-5">
                <div>
                  <h3 className="text-xl font-semibold">Crear pedido</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    El sistema intentara servir primero desde stock terminado y fabricara solo lo que falte.
                  </p>
                </div>
                <Field label="Cliente" hint="Selecciona la ficha del cliente antes de definir las lineas.">
                  <select name="clienteId" className="input" defaultValue="">
                  <option value="">Cliente</option>
                  {activeCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.codigo} · {customer.nombre}
                    </option>
                  ))}
                  </select>
                </Field>
                <p className="form-section-title">Lineas del pedido</p>
                {[1, 2, 3].map((index) => (
                  <div key={index} className="form-field--stack">
                    <p className="form-label">Linea {index}</p>
                    <div className="grid gap-3 sm:grid-cols-[1.45fr_0.55fr_0.8fr]">
                    <Field label="Producto">
                      <select name={`producto_${index}`} className="input" defaultValue="">
                      <option value="">Producto linea {index}</option>
                      {activeProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.codigo} · {product.nombre}
                        </option>
                      ))}
                      </select>
                    </Field>
                    <Field label="Cantidad">
                      <input name={`cantidad_${index}`} type="number" min="0" placeholder="Cantidad" className="input" />
                    </Field>
                    <Field label="Precio unitario">
                      <input name={`precio_${index}`} type="number" min="0" step="0.01" placeholder="Precio unitario" className="input" />
                    </Field>
                    </div>
                  </div>
                ))}
                <Field
                  label="Descuento (€)"
                  hint="Importe final a descontar, IVA incluido"
                >
                  <input
                    name="descuento"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                    placeholder="0,00"
                    className="input"
                  />
                </Field>
                <Field label="Observaciones" hint="Notas opcionales para el seguimiento del pedido.">
                  <textarea name="observaciones" rows={3} placeholder="Observaciones" className="input" />
                </Field>
                <SubmitButton pendingText="Creando pedido...">Crear pedido</SubmitButton>
              </form>
              ) : null}

              <div className="panel p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">{focusedOrderCode ? "Ficha de pedido" : "Lista de pedidos"}</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {focusedOrderCode
                        ? "Vista amplia del pedido seleccionado con cliente, lineas y trazabilidad comercial."
                        : "Filtra por estado y ejecuta solo la siguiente accion necesaria."}
                    </p>
                  </div>
                  {!focusedOrderCode ? <div className="flex flex-wrap gap-2">
                    {["ALL", ...Object.keys(orderStatusLabels)].map((status) => (
                      <FilterLink
                        key={status}
                        href={`/?section=pedidos&orderStatus=${status}`}
                        label={status === "ALL" ? "todos" : orderStatusLabels[status]}
                        active={orderFilter === status}
                        count={status === "ALL" ? orders.length : orders.filter((order) => order.estado === status).length}
                      />
                    ))}
                  </div> : null}
                </div>

                  <FilterSummary
                    totalItems={filteredOrders.length}
                    hasFilters={hasActiveOrderFilters}
                    filters={activeOrderFilterSegments}
                    itemLabel="pedidos"
                    allItemsText="Mostrando todos los pedidos"
                  />
                  {focusedOrderCode ? (
                    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/85 px-4 py-3 text-sm text-sky-900">
                      Mostrando la trazabilidad del pedido <span className="font-semibold">{focusedOrderCode}</span> abierto desde facturas o pagos.
                    </div>
                  ) : null}
                  <div className="list-scroll mt-5">
                  {filteredOrders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-6 text-sm text-[color:var(--muted)]">
                      No hay pedidos para este filtro.
                    </div>
                  ) : (
                    false ? filteredOrders.map((order) => {
                      const latestHistory = order.historial[0] ?? null;
                      return (
                        <article
                          key={order.id}
                          className={`panel-muted p-5 ${
                            order.estado === "INCIDENCIA_STOCK"
                              ? cardHighlightClass("danger")
                              : order.estado === "LISTO" || order.estado === "ENTREGADO"
                                ? cardHighlightClass("attention")
                                : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">{order.codigo}</p>
                              <h4 className="mt-2 text-lg font-semibold">{order.cliente_nombre}</h4>
                              <p className="mt-2 text-sm text-[color:var(--muted)]">{dateLabel(order.fecha_pedido)}</p>
                            </div>
                            <StatusPill label={orderStatusLabels[order.estado]} tone={orderStatusTone(order.estado)} />
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Total</p>
                              <p className="mt-2 text-lg font-semibold">{currency(order.total)}</p>
                            </div>
                            <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Siguiente paso</p>
                              <p className="mt-2 text-sm">{orderNextStep(order)}</p>
                            </div>
                            <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Ultimo cambio</p>
                              <p className="mt-2 text-sm">
                                {latestHistory ? `${dateLabel(latestHistory.fecha)} · ${latestHistory.nota}` : "Sin historial"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Estado pago</p>
                              <p className="mt-2 text-sm font-semibold">{order.estado_pago.toLowerCase()}</p>
                            </div>
                            <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Coste pedido</p>
                              <p className="mt-2 text-sm font-semibold">{currency(order.coste_total_pedido)}</p>
                            </div>
                            <div className="rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Beneficio</p>
                              <p className="mt-2 text-sm font-semibold">{currency(order.beneficio_total)}</p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            {order.lineas.map((line) => (
                              <div key={line.id} className="rounded-2xl border border-black/8 px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">
                                      {line.producto_nombre} x{line.cantidad}
                                    </p>
                                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                                      Desde stock terminado: {line.cantidad_desde_stock} uds · A fabricar: {line.cantidad_a_fabricar} uds
                                    </p>
                                  </div>
                                  <div className="text-right text-sm">
                                    <p>Venta linea: {currency(line.precio_total_linea)}</p>
                                    <p>Coste total: {currency(line.coste_total)}</p>
                                    <p className="text-[color:var(--muted)]">Beneficio: {currency(line.beneficio)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {order.estado === "BORRADOR" ? (
                              <form action={confirmOrderAction}>
                                <input type="hidden" name="pedidoId" value={order.id} />
                                <SubmitButton variant="chip-dark" pendingText="Confirmando...">
                                  Confirmar
                                </SubmitButton>
                              </form>
                            ) : null}
                            {order.estado === "INCIDENCIA_STOCK" ? (
                              <>
                                <form action={retryOrderAction}>
                                  <input type="hidden" name="pedidoId" value={order.id} />
                                  <SubmitButton variant="chip-dark" pendingText="Reintentando...">
                                    Reintentar
                                  </SubmitButton>
                                </form>
                                <Link
                                  href="/?section=stock#restock-material"
                                  className="inline-flex items-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--muted)]"
                                >
                                  Reponer material
                                </Link>
                              </>
                            ) : null}
                            {(order.estado === "CONFIRMADO" || order.estado === "EN_PRODUCCION") && order.ordenesFabricacion.length > 0 ? (
                              <Link
                                href={`/?section=fabricacion${order.estado === "CONFIRMADO" ? "&manufacturingStatus=PENDIENTE" : ""}`}
                                className="inline-flex items-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--muted)]"
                              >
                                Ver fabricacion
                              </Link>
                            ) : null}
                            {order.estado === "LISTO" ? (
                              <form action={deliverOrderAction}>
                                <input type="hidden" name="pedidoId" value={order.id} />
                                <SubmitButton variant="chip-dark" pendingText="Entregando...">
                                  Entregar
                                </SubmitButton>
                              </form>
                            ) : null}
                            {order.estado === "ENTREGADO" ? (
                              <form action={generateInvoiceAction}>
                                <input type="hidden" name="pedidoId" value={order.id} />
                                <SubmitButton variant="chip-dark" pendingText="Facturando...">
                                  Generar factura
                                </SubmitButton>
                              </form>
                            ) : null}
                            {order.factura ? (
                              <Link
                                href="/?section=facturas"
                                className="inline-flex items-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--muted)]"
                              >
                                Ver factura
                              </Link>
                            ) : null}
                          </div>

                          <details className="mt-4 rounded-2xl border border-black/8 bg-white/70 p-4">
                            <summary className="cursor-pointer text-sm font-semibold">Editar pedido</summary>
                            <form action={updateOrderAction} className="mt-4 space-y-3">
                              <input type="hidden" name="id" value={order.id} />
                              <select name="clienteId" className="input" defaultValue={order.cliente_id}>
                                {customers.map((customer) => (
                                  <option key={customer.id} value={customer.id}>
                                    {customer.codigo} · {customer.nombre}
                                  </option>
                                ))}
                              </select>
                              {[1, 2, 3].map((index) => {
                                const line = order.lineas[index - 1];
                                return (
                                  <div key={`${order.id}-line-${index}`} className="grid gap-3 sm:grid-cols-[1.45fr_0.55fr_0.8fr]">
                                    <select name={`producto_${index}`} className="input" defaultValue={line?.producto_id ?? ""}>
                                      <option value="">Producto linea {index}</option>
                                      {products.map((product) => (
                                        <option key={product.id} value={product.id}>
                                          {product.codigo} · {product.nombre}
                                        </option>
                                      ))}
                                    </select>
                                    <input name={`cantidad_${index}`} type="number" min="0" defaultValue={line?.cantidad ?? ""} className="input" />
                                    <input name={`precio_${index}`} type="number" min="0" step="0.01" defaultValue={line?.precio_unitario ?? ""} className="input" />
                                  </div>
                                );
                              })}
                              <textarea name="observaciones" rows={3} defaultValue={order.observaciones ?? ""} className="input" />
                              <SubmitButton pendingText="Guardando...">Guardar pedido</SubmitButton>
                            </form>
                          </details>
                        </article>
                      );
                    }) : (
                      <OrdersInlineBoard
                        orders={filteredOrders}
                        customers={activeCustomers.map((customer) => ({
                          id: customer.id,
                          codigo: customer.codigo,
                          nombre: customer.nombre,
                        }))}
                        products={activeProducts.map((product) => ({
                          id: product.id,
                          codigo: product.codigo,
                          nombre: product.nombre,
                        }))}
                        focusedOrderCode={focusedOrderCode}
                        focusedCustomerCode={focusedCustomerCode}
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section active={section === "fabricacion"} title="Ordenes de fabricacion" subtitle="Produccion">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Pendientes", value: manufacturingOrders.filter((order) => order.estado === "PENDIENTE").length },
                { label: "Iniciadas", value: manufacturingOrders.filter((order) => order.estado === "INICIADA").length },
                { label: "Bloqueadas", value: manufacturingOrders.filter((order) => order.estado === "BLOQUEADA_POR_STOCK").length },
                { label: "Completadas", value: manufacturingOrders.filter((order) => order.estado === "COMPLETADA").length },
              ].map((metric) => (
                <article key={metric.label} className="metric-card p-5">
                  <p className="text-sm text-[color:var(--muted)]">{metric.label}</p>
                  <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
                </article>
              ))}
            </div>
            <div className="panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Cola de fabricacion</h3>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Inicia o completa ordenes directamente desde cada fila. La impresora se asigna automaticamente.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["ALL", ...Object.keys(manufacturingStatusLabels)].map((status) => (
                    <FilterLink
                      key={status}
                      href={`/?section=fabricacion&manufacturingStatus=${status}`}
                      label={status === "ALL" ? "todas" : manufacturingStatusLabels[status]}
                      active={manufacturingFilter === status}
                      count={
                        status === "ALL"
                          ? manufacturingOrders.length
                          : manufacturingOrders.filter((order) => order.estado === status).length
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="table-wrap table-scroll mt-5">
                <ManufacturingInlineTable manufacturingOrders={filteredManufacturing} />
              </div>
            </div>
          </Section>

          <Section active={section === "stock"} title="Stock de materiales" subtitle="Inventario de materiales">
            <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-4">
                <form id="restock-material" action={restockMaterialAction} className="panel form-shell p-6 space-y-5">
                  <div>
                    <h3 className="text-xl font-semibold">Registrar reposicion</h3>
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      Toda entrada de material queda registrada con movimiento de inventario.
                    </p>
                  </div>
                  <Field label="Material">
                    <select name="materialId" className="input" defaultValue="">
                    <option value="">Material</option>
                    {activeMaterials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.codigo} · {material.nombre} · {material.color}
                      </option>
                    ))}
                    </select>
                  </Field>
                  <div className="form-grid-2">
                    <Field label="Cantidad en gramos">
                      <input name="cantidadG" type="number" min="1" placeholder="Cantidad en gramos" className="input" />
                    </Field>
                    <Field label="Motivo de la reposicion">
                      <input name="motivo" placeholder="Motivo de la reposicion" className="input" />
                    </Field>
                  </div>
                  <SubmitButton pendingText="Registrando...">Registrar reposicion</SubmitButton>
                </form>

                <div className="panel p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">Vision rapida</h3>
                    <div className="flex flex-wrap gap-2">
                      {["ALL", "LOW"].map((status) => (
                        <FilterLink
                          key={status}
                          href={`/?section=materiales&materialFilter=${status}`}
                          label={status === "ALL" ? "todos" : "stock bajo"}
                          active={false}
                          count={status === "ALL" ? materials.length : lowStockMaterials.length}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {lowStockMaterials.slice(0, 4).map((material) => (
                      <div key={material.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                        <p className="font-semibold">
                          {material.codigo} · {material.nombre}
                        </p>
                        <p className="mt-1 text-sm text-amber-800">
                          {material.stock_actual_g} g disponibles · minimo {material.stock_minimo_g} g
                        </p>
                      </div>
                    ))}
                    {lowStockMaterials.length === 0 ? (
                      <p className="rounded-2xl bg-white/70 px-4 py-4 text-sm text-[color:var(--muted)]">No hay alertas de material.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="panel p-6">
                <div className="table-wrap table-scroll">
                  <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Material</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Motivo</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockMovements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{movement.codigo}</td>
                        <td>{dateLabel(movement.fecha)}</td>
                        <td>{movement.material_nombre}</td>
                        <td>{movement.tipo.toLowerCase()}</td>
                        <td>{movement.cantidad_g} g</td>
                        <td>{movement.motivo}</td>
                        <td>{movement.referencia ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Section>
          <Section active={section === "productos-terminados"} title="Productos terminados" subtitle="Inventario de salida">
            <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <form
                id="add-finished-stock"
                action={restockFinishedProductAction}
                className="panel form-shell p-6 space-y-5"
              >
                <div>
                  <h3 className="text-xl font-semibold">Añadir stock</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Registra una entrada manual de producto terminado sin afectar fabricacion ni ventas ya existentes.
                  </p>
                </div>
                <Field label="Producto">
                  <select name="productId" className="input" defaultValue="">
                  <option value="">Producto</option>
                  {activeProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.codigo} · {product.nombre}
                    </option>
                  ))}
                  </select>
                </Field>
                <div className="form-grid-2">
                  <Field label="Cantidad">
                    <input name="cantidad" type="number" min="1" placeholder="Cantidad" className="input" />
                  </Field>
                  <Field label="Ubicacion">
                    <input name="ubicacion" placeholder="Ubicacion" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Coste unitario">
                    <input name="costeUnitario" type="number" min="0" step="0.01" placeholder="Coste unitario" className="input" />
                  </Field>
                  <Field label="Motivo (opcional)">
                    <input name="motivo" placeholder="Motivo" className="input" />
                  </Field>
                </div>
                <SubmitButton pendingText="Añadiendo...">Añadir stock</SubmitButton>
              </form>

              <div className="panel p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">Disponible para venta directa</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Si hay unidades aqui, el pedido las usara antes de lanzar fabricacion.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label={`${finishedUnits} uds`} tone={finishedUnits > 0 ? "success" : "neutral"} />
                    <a href="#add-finished-stock" className="button-secondary">
                      Añadir stock
                    </a>
                  </div>
                </div>
                <div className="table-wrap table-scroll">
                  <FinishedInventoryInlineTable finishedInventory={finishedInventory} />
                </div>
              </div>
            </div>
          </Section>

          <Section active={section === "facturas"} title="Facturas" subtitle="Cobro">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {[
                { label: "Facturado en rango", value: currency(rangedTotalInvoiced), detail: `${rangedInvoiceCount} facturas visibles` },
                { label: "Cobrado en rango", value: currency(rangedTotalCollected), detail: `${rangedPaidInvoices} pagadas visibles` },
                { label: "Pendiente en rango", value: currency(rangedTotalOutstanding), detail: `${rangedInvoiceCount} facturas filtradas` },
                { label: "Facturas en rango", value: rangedInvoiceCount, detail: "segun filtros activos" },
                { label: "Pendientes", value: rangedPendingInvoices, detail: "sin cobros en vista" },
                { label: "Parciales / pagadas", value: `${rangedPartialInvoices}/${rangedPaidInvoices}`, detail: "visibles ahora" },
              ].map((metric) => (
                <article key={String(metric.label)} className="metric-card p-5">
                  <p className="text-sm text-[color:var(--muted)]">{metric.label}</p>
                  <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">{metric.detail}</p>
                </article>
              ))}
            </div>

            <div className="panel p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Facturas emitidas</h3>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Solo se puede facturar cuando el pedido ya esta entregado.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/exports/invoices?invoiceStatus=${encodeURIComponent(invoiceFilter)}&fecha_inicio=${encodeURIComponent(invoiceDateStart)}&fecha_fin=${encodeURIComponent(invoiceDateEnd)}`}
                    className="button-secondary"
                  >
                    Exportar facturas CSV
                  </a>
                  <a
                    href={`/api/exports/payments?invoiceStatus=${encodeURIComponent(invoiceFilter)}&fecha_inicio=${encodeURIComponent(invoiceDateStart)}&fecha_fin=${encodeURIComponent(invoiceDateEnd)}`}
                    className="button-secondary"
                  >
                    Exportar pagos CSV
                  </a>
                  {Object.keys(invoicePaymentLabels).map((status) => (
                    <FilterLink
                      key={status}
                      href={`/?section=facturas&invoiceStatus=${status}&fecha_inicio=${encodeURIComponent(invoiceDateStart)}&fecha_fin=${encodeURIComponent(invoiceDateEnd)}`}
                      label={invoicePaymentLabels[status]}
                      active={invoiceFilter === status}
                      count={
                        status === "ALL"
                          ? invoices.length
                          : invoices.filter((invoice) => invoice.estado_pago === status).length
                      }
                    />
                  ))}
                  <StatusPill label={`${pendingInvoices} pendientes`} tone={pendingInvoices > 0 ? "warn" : "success"} />
                </div>
              </div>
              <form className="mb-4 grid gap-3 rounded-2xl border border-black/8 bg-[color:var(--surface-strong)] p-4 md:grid-cols-[1fr_1fr_auto_auto]" method="get">
                <input type="hidden" name="section" value="facturas" />
                <input type="hidden" name="invoiceStatus" value={invoiceFilter} />
                <label className="space-y-1 text-sm text-[color:var(--muted-strong)]">
                  <span>Fecha desde</span>
                  <input type="date" name="fecha_inicio" defaultValue={invoiceDateStart} className="input" />
                </label>
                <label className="space-y-1 text-sm text-[color:var(--muted-strong)]">
                  <span>Fecha hasta</span>
                  <input type="date" name="fecha_fin" defaultValue={invoiceDateEnd} className="input" />
                </label>
                <button type="submit" className="button-secondary self-end">
                  Aplicar fechas
                </button>
                <a href={`/?section=facturas&invoiceStatus=${encodeURIComponent(invoiceFilter)}`} className="button-secondary self-end">
                  Limpiar fechas
                </a>
              </form>
              <p className="mb-4 text-sm text-[color:var(--muted)]">
                Las exportaciones descargan CSV compatibles con Excel y Sheets usando los filtros visibles: estado, fecha de factura y fecha de pago asociada.
                {invoiceDateStart || invoiceDateEnd
                  ? ` En el rango actual hay ${dateFilteredInvoices.length} facturas y ${filteredPaymentsCount} pagos.`
                  : ` Ahora mismo ves ${dateFilteredInvoices.length} facturas y ${filteredPaymentsCount} pagos.`}
              </p>
              <FilterSummary
                totalItems={rangedInvoiceCount}
                hasFilters={hasActiveInvoiceFilters}
                filters={activeInvoiceFilterSegments}
              />
              {focusedInvoiceCode ? (
                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/85 px-4 py-3 text-sm text-sky-900">
                  Mostrando la trazabilidad de la factura <span className="font-semibold">{focusedInvoiceCode}</span>.
                </div>
              ) : null}
              <div className="table-wrap table-scroll">
                <InvoicesInlineTable invoices={dateFilteredInvoices} focusedInvoiceCode={focusedInvoiceCode} />
              </div>
            </div>
          </Section>

          <Section active={section === "impresoras"} title="Impresoras" subtitle="Capacidad de produccion">
            <div className={`grid gap-4 ${focusedPrinterCode ? "xl:grid-cols-1" : "xl:grid-cols-[0.85fr_1.15fr]"}`}>
              {!focusedPrinterCode ? (
              <form action={createPrinterAction} className="panel form-shell p-6 space-y-5">
                <div>
                  <h3 className="text-xl font-semibold">Nueva impresora</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Define capacidad, coste por hora y estado operativo para que la asignacion sea automatica.
                  </p>
                </div>
                <Field label="Nombre de impresora">
                  <input name="nombre" placeholder="Nombre de impresora" className="input" />
                </Field>
                <Field label="Estado inicial">
                  <select name="estado" className="input" defaultValue="LIBRE">
                  <option value="LIBRE">libre</option>
                  <option value="IMPRIMIENDO">imprimiendo</option>
                  <option value="MANTENIMIENTO">mantenimiento</option>
                  </select>
                </Field>
                <div className="form-grid-2">
                  <Field label="Horas acumuladas">
                    <input name="horasUsoAcumuladas" type="number" min="0" step="0.1" placeholder="Horas acumuladas" className="input" />
                  </Field>
                  <Field label="Coste por hora">
                    <input name="costeHora" type="number" min="0" step="0.01" placeholder="Coste por hora" className="input" />
                  </Field>
                </div>
                <Field label="Ubicacion">
                  <input name="ubicacion" placeholder="Ubicacion" className="input" />
                </Field>
                <SubmitButton pendingText="Creando...">Crear impresora</SubmitButton>
              </form>
              ) : null}

              <div className="panel p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">Estado de impresoras</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Solo puede haber una orden activa por impresora. Las inactivas quedan fuera de nuevas asignaciones.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["ALL", ...Object.keys(printerStatusLabels)].map((status) => (
                      <FilterLink
                        key={status}
                        href={`/?section=impresoras&printerStatus=${status}&printerActiveFilter=${printerActiveFilter}`}
                        label={status === "ALL" ? "todas" : printerStatusLabels[status]}
                        active={printerFilter === status}
                        count={status === "ALL" ? printers.length : printers.filter((printer) => printer.estado === status).length}
                      />
                    ))}
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {["ALL", "ACTIVE", "INACTIVE"].map((status) => (
                    <FilterLink
                      key={status}
                      href={`/?section=impresoras&printerStatus=${printerFilter}&printerActiveFilter=${status}`}
                      label={status === "ALL" ? "todas" : status === "ACTIVE" ? "activas" : "archivadas"}
                      active={printerActiveFilter === status}
                      count={
                        status === "ALL"
                          ? printers.length
                          : status === "ACTIVE"
                            ? activePrinters.length
                            : printers.filter((printer) => !printer.activo).length
                      }
                    />
                  ))}
                </div>
                <FilterSummary
                  totalItems={prioritizedPrinters.length}
                  hasFilters={hasActivePrinterFilters}
                  filters={activePrinterFilterSegments}
                  itemLabel="impresoras"
                  allItemsText="Mostrando todas las impresoras"
                />
                {focusedPrinterCode ? (
                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/85 px-4 py-3 text-sm text-sky-900">
                    Impresora abierta desde {printerFocusOrigin ?? "producto/pedido/fabricacion"}: <span className="font-semibold">{focusedPrinterCode}</span>.
                  </div>
                ) : null}
                <div className="table-wrap table-scroll">
                  <PrintersInlineTable printers={prioritizedPrinters} focusedPrinterCode={focusedPrinterCode} />
                </div>
              </div>
            </div>
          </Section>

          <Section active={section === "productos"} title="Productos" subtitle="Catalogo">
            <div className={`grid gap-4 ${focusedProductCode ? "xl:grid-cols-1" : "xl:grid-cols-[0.95fr_1.05fr]"}`}>
              {!focusedProductCode ? (
              <form action={createProductAction} className="panel form-shell p-6 space-y-5">
                <div>
                  <h3 className="text-xl font-semibold">Nuevo producto</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    El material principal es obligatorio y permite calcular consumo, coste y fabricacion.
                  </p>
                </div>
                <Field label="Nombre del producto">
                  <input name="nombre" placeholder="Nombre" className="input" />
                </Field>
                <Field label="Descripcion">
                  <textarea name="descripcion" placeholder="Descripcion" rows={3} className="input" />
                </Field>
                <Field label="Enlace del modelo">
                  <input name="enlaceModelo" placeholder="Enlace del modelo" className="input" />
                </Field>
                <Field label="Material principal">
                  <select name="materialId" className="input" defaultValue="">
                  <option value="">Material principal</option>
                  {activeMaterials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.codigo} · {material.nombre} · {material.color}
                    </option>
                  ))}
                  </select>
                </Field>
                <div className="form-grid-2">
                  <Field label="Gramos estimados">
                    <input name="gramosEstimados" type="number" min="1" placeholder="Gramos estimados" className="input" />
                  </Field>
                  <Field label="Horas de impresion">
                    <input name="tiempoImpresionHoras" type="number" min="0.1" step="0.1" placeholder="Horas impresion" className="input" />
                  </Field>
                </div>
                <div className="form-grid-3">
                  <Field label="Coste electricidad">
                    <input name="costeElectricidad" type="number" min="0" step="0.01" placeholder="Coste electricidad" className="input" />
                  </Field>
                  <Field label="Coste maquina">
                    <input name="costeMaquina" type="number" min="0" step="0.01" placeholder="Coste maquina" className="input" />
                  </Field>
                  <Field label="Coste mano de obra">
                    <input name="costeManoObra" type="number" min="0" step="0.01" placeholder="Coste mano de obra" className="input" />
                  </Field>
                </div>
                <div className="form-grid-3">
                  <Field label="Coste postprocesado">
                    <input name="costePostprocesado" type="number" min="0" step="0.01" placeholder="Coste postprocesado" className="input" />
                  </Field>
                  <Field label="Margen">
                    <input name="margen" type="number" step="0.01" placeholder="Margen" className="input" />
                  </Field>
                  <Field label="PVP">
                    <input name="pvp" type="number" min="0.01" step="0.01" placeholder="PVP" className="input" />
                  </Field>
                </div>
                <Field label="IVA producto (%)" hint="Se usa en el pedido/factura al crear la linea. Si queda vacio, se aplica 21.">
                  <input
                    name="ivaPorcentaje"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue="21"
                    placeholder="21"
                    className="input"
                  />
                </Field>
                <label className="form-checkbox">
                  <input type="checkbox" name="activo" defaultChecked /> Producto activo
                </label>
                <SubmitButton pendingText="Creando...">Crear producto</SubmitButton>
              </form>
              ) : null}

              <div className="panel p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">Catalogo de productos</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Los productos archivados conservan historico pero no aparecen en nuevas operaciones.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["ALL", "ACTIVE", "INACTIVE"].map((status) => (
                      <FilterLink
                        key={status}
                        href={`/?section=productos&productFilter=${status}`}
                        label={status === "ALL" ? "todos" : status === "ACTIVE" ? "activos" : "archivados"}
                        active={productFilter === status}
                        count={
                          status === "ALL"
                            ? products.length
                            : status === "ACTIVE"
                              ? activeProducts.length
                              : products.filter((product) => !product.activo).length
                        }
                      />
                    ))}
                  </div>
                </div>
                <FilterSummary
                  totalItems={prioritizedProducts.length}
                  hasFilters={hasActiveProductFilters}
                  filters={activeProductFilterSegments}
                  itemLabel="productos"
                  allItemsText="Mostrando todos los productos"
                />
                {focusedProductCode ? (
                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/85 px-4 py-3 text-sm text-sky-900">
                    Mostrando la trazabilidad del producto <span className="font-semibold">{focusedProductCode}</span> abierto desde {productFocusOrigin ?? "cliente/pedido/factura"}.
                  </div>
                ) : null}
                <div className="table-wrap table-scroll">
                  <ProductsInlineTable
                    products={prioritizedProducts}
                    materials={materials.map((material) => ({
                      id: material.id,
                      codigo: material.codigo,
                      nombre: material.nombre,
                      color: material.color,
                      activo: material.activo,
                    }))}
                    focusedProductCode={focusedProductCode}
                    focusOriginLabel={productFocusOrigin}
                    orders={orders}
                    invoices={invoices}
                    manufacturingOrders={manufacturingOrders}
                    finishedInventory={finishedInventory}
                  />
                </div>
              </div>
            </div>
          </Section>

          <Section active={section === "materiales"} title="Materiales" subtitle="Filamentos y resinas">
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <form action={createMaterialAction} className="panel form-shell p-6 space-y-5">
                <div>
                  <h3 className="text-xl font-semibold">Nuevo material</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Define precio, stock minimo y proveedor para activar alertas y calculos de coste.
                  </p>
                </div>
                <div className="form-grid-2">
                  <Field label="Nombre">
                    <input name="nombre" placeholder="Nombre" className="input" />
                  </Field>
                  <Field label="Marca">
                    <input name="marca" placeholder="Marca" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Tipo">
                    <input name="tipo" placeholder="Tipo" className="input" />
                  </Field>
                  <Field label="Color">
                    <input name="color" placeholder="Color" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Tipo color">
                    <input name="tipoColor" placeholder="Tipo color" className="input" />
                  </Field>
                  <Field label="Nombre comercial">
                    <input name="nombreComercial" placeholder="Nombre comercial" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Color base">
                    <input name="colorBase" placeholder="Color base" className="input" />
                  </Field>
                  <Field label="Efecto">
                    <input name="efecto" placeholder="Efecto" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Precio EUR/kg">
                    <input name="precioKg" type="number" step="0.01" min="0" placeholder="Precio EUR/kg" className="input" />
                  </Field>
                  <Field label="Proveedor">
                    <input name="proveedor" placeholder="Proveedor" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Stock actual (g)">
                    <input name="stockActualG" type="number" min="0" placeholder="Stock actual (g)" className="input" />
                  </Field>
                  <Field label="Stock minimo (g)">
                    <input name="stockMinimoG" type="number" min="0" placeholder="Stock minimo (g)" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Diametro mm">
                    <input name="diametroMm" type="number" min="0" step="0.01" placeholder="Diametro mm" className="input" />
                  </Field>
                  <Field label="Peso spool g">
                    <input name="pesoSpoolG" type="number" min="0" placeholder="Peso spool g" className="input" />
                  </Field>
                </div>
                <div className="form-grid-2">
                  <Field label="Temp extrusor">
                    <input name="tempExtrusor" type="number" min="0" placeholder="Temp extrusor" className="input" />
                  </Field>
                  <Field label="Temp cama">
                    <input name="tempCama" type="number" min="0" placeholder="Temp cama" className="input" />
                  </Field>
                </div>
                <Field label="Notas tecnicas">
                  <textarea name="notas" rows={3} placeholder="Notas tecnicas" className="input" />
                </Field>
                <SubmitButton pendingText="Creando...">Crear material</SubmitButton>
              </form>

              <div className="panel p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">Stock y alertas</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Gestiona archivado logico sin perder historico. Los materiales archivados dejan de aparecer en formularios normales.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["ALL", "ACTIVE", "INACTIVE"].map((status) => (
                      <FilterLink
                        key={status}
                        href={`/?section=materiales&materialFilter=${status}`}
                        label={status === "ALL" ? "todos" : status === "ACTIVE" ? "activos" : "archivados"}
                        active={materialFilter === status}
                        count={
                          status === "ALL"
                            ? materials.length
                            : status === "ACTIVE"
                              ? activeMaterials.length
                              : materials.filter((material) => !material.activo).length
                        }
                      />
                    ))}
                  </div>
                </div>
                <FilterSummary
                  totalItems={filteredMaterials.length}
                  hasFilters={hasActiveMaterialFilters}
                  filters={activeMaterialFilterSegments}
                  itemLabel="materiales"
                  allItemsText="Mostrando todos los materiales"
                />
                <div className="table-wrap table-scroll">
                  <MaterialsInlineTable materials={filteredMaterials} />
                </div>
              </div>
            </div>
          </Section>

          <Section active={section === "clientes"} title="Clientes" subtitle="Gestion">
            <div className={`grid gap-4 ${focusedCustomerCode ? "xl:grid-cols-1" : "xl:grid-cols-[0.9fr_1.1fr]"}`}>
              {!focusedCustomerCode ? (
              <form action={createCustomerAction} className="panel form-shell p-6 space-y-5">
                <div>
                  <h3 className="text-xl font-semibold">Nuevo cliente</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Mantener la ficha completa evita vueltas atras al crear pedidos, entregar o facturar.
                  </p>
                </div>
                <Field label="Nombre">
                  <input name="nombre" placeholder="Nombre" className="input" />
                </Field>
                <div className="form-grid-2">
                  <Field label="Telefono">
                    <input name="telefono" placeholder="Telefono" className="input" />
                  </Field>
                  <Field label="Email">
                    <input name="email" type="email" placeholder="Email" className="input" />
                  </Field>
                </div>
                <Field label="Direccion">
                  <textarea name="direccion" placeholder="Direccion" rows={3} className="input" />
                </Field>
                <SubmitButton pendingText="Creando...">Crear cliente</SubmitButton>
              </form>
              ) : null}
              <div className="panel p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">{focusedCustomerCode ? "Ficha de cliente" : "Base de clientes"}</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {focusedCustomerCode
                        ? "Vista de registro amplia con pedidos, facturas y productos comprados en un solo lugar."
                        : "Los clientes archivados se mantienen para historico, pero salen de los formularios de pedidos nuevos."}
                    </p>
                  </div>
                  {!focusedCustomerCode ? <div className="flex flex-wrap gap-2">
                    {["ALL", "ACTIVE", "INACTIVE"].map((status) => (
                      <FilterLink
                        key={status}
                        href={`/?section=clientes&customerFilter=${status}`}
                        label={status === "ALL" ? "todos" : status === "ACTIVE" ? "activos" : "archivados"}
                        active={customerFilter === status}
                        count={
                          status === "ALL"
                            ? customers.length
                            : status === "ACTIVE"
                              ? activeCustomers.length
                              : customers.filter((customer) => !customer.activo).length
                        }
                      />
                    ))}
                  </div> : null}
                </div>
                  <FilterSummary
                    totalItems={filteredCustomers.length}
                    hasFilters={hasActiveCustomerFilters}
                    filters={activeCustomerFilterSegments}
                    itemLabel="clientes"
                    allItemsText="Mostrando todos los clientes"
                  />
                    {focusedCustomerCode ? (
                      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/85 px-4 py-3 text-sm text-sky-900">
                        Mostrando la trazabilidad del cliente <span className="font-semibold">{focusedCustomerCode}</span> abierto desde {customerFocusOrigin ?? "pedido/factura/pago"}.
                      </div>
                    ) : null}
                  <div className="table-wrap table-scroll">
                    <CustomersInlineTable
                      customers={filteredCustomers}
                      focusedCustomerCode={focusedCustomerCode}
                      focusOriginLabel={customerFocusOrigin}
                      orders={orders.map((order) => ({
                        id: order.id,
                        codigo: order.codigo,
                        cliente_id: order.cliente_id,
                        fecha_pedido: order.fecha_pedido,
                        estado: order.estado,
                        lineas: order.lineas.map((line) => ({
                          id: line.id,
                          producto_codigo: line.codigo,
                          producto_nombre: line.producto_nombre,
                          cantidad: line.cantidad,
                        })),
                      }))}
                      invoices={invoices.map((invoice) => ({
                        id: invoice.id,
                        codigo: invoice.codigo,
                        cliente_id: invoice.cliente_id,
                        fecha: invoice.fecha,
                        estado_pago: invoice.estado_pago,
                        total: invoice.total,
                      }))}
                    />
                  </div>
                </div>
              </div>
            </Section>

          <Section active={section === "movimientos"} title="Movimientos de inventario" subtitle="Trazabilidad">
            <div className="panel p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Historial de entradas y salidas</h3>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Aqui se registra todo lo que afecta a materiales y productos terminados.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(movementInventoryLabels).map((status) => (
                    <FilterLink
                      key={status}
                      href={`/?section=movimientos&movementInventory=${status}`}
                      label={movementInventoryLabels[status]}
                      active={movementFilter === status}
                      count={
                        status === "ALL"
                          ? inventoryMovements.length
                          : inventoryMovements.filter((movement) => movement.inventario_tipo === status).length
                      }
                    />
                  ))}
                </div>
              </div>
              <FilterSummary
                totalItems={filteredInventoryMovements.length}
                hasFilters={hasActiveMovementFilters}
                filters={activeMovementFilterSegments}
                itemLabel="movimientos"
                allItemsText="Mostrando todos los movimientos"
              />
              <div className="table-wrap table-scroll">
                <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Inventario</th>
                    <th>Item</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Motivo</th>
                    <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventoryMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{movement.codigo}</td>
                      <td>{dateLabel(movement.fecha)}</td>
                      <td>{movement.inventario_tipo.toLowerCase()}</td>
                      <td>{movement.item_codigo || movement.item_id}</td>
                      <td>{movement.tipo.toLowerCase()}</td>
                      <td>{movementQuantityLabel(movement)}</td>
                      <td>{movement.motivo}</td>
                      <td>{movement.referencia}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
