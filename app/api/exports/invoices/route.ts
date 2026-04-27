import { buildCsvFilename, buildCsvResponse, formatCsvDateTime, formatCsvMoney, serializeCsv } from "@/lib/csv";
import { getInvoicesExportRows } from "@/lib/erp-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceStatus = searchParams.get("invoiceStatus") ?? undefined;
  const fromDate = searchParams.get("fecha_inicio") ?? undefined;
  const toDate = searchParams.get("fecha_fin") ?? undefined;
  const rows = await getInvoicesExportRows(invoiceStatus, fromDate, toDate);
  const csv = serializeCsv(rows, {
    columns: [
      { header: "codigo_factura", value: (row) => row.codigoFactura },
      { header: "codigo_pedido", value: (row) => row.codigoPedido },
      { header: "cliente", value: (row) => row.cliente },
      { header: "fecha_factura", value: (row) => formatCsvDateTime(row.fechaFactura) },
      { header: "subtotal", value: (row) => formatCsvMoney(row.subtotal) },
      { header: "descuento", value: (row) => formatCsvMoney(row.descuento) },
      { header: "base_imponible", value: (row) => formatCsvMoney(row.baseImponible) },
      { header: "iva", value: (row) => formatCsvMoney(row.iva) },
      { header: "total", value: (row) => formatCsvMoney(row.total) },
      { header: "total_pagado", value: (row) => formatCsvMoney(row.totalPagado) },
      { header: "importe_pendiente", value: (row) => formatCsvMoney(row.importePendiente) },
      { header: "estado_pago", value: (row) => row.estadoPago },
    ],
  });

  return buildCsvResponse(csv, buildCsvFilename("facturas"));
}
