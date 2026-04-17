import { buildCsvFilename, buildCsvResponse, formatCsvDateTime, formatCsvMoney, serializeCsv } from "@/lib/csv";
import { getInvoicePaymentsExportRows } from "@/lib/erp-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceStatus = searchParams.get("invoiceStatus") ?? undefined;
  const rows = await getInvoicePaymentsExportRows(invoiceStatus);
  const csv = serializeCsv(rows, {
    columns: [
      { header: "codigo_pago", value: (row) => row.codigoPago },
      { header: "codigo_factura", value: (row) => row.codigoFactura },
      { header: "codigo_pedido", value: (row) => row.codigoPedido },
      { header: "cliente", value: (row) => row.cliente },
      { header: "fecha_pago", value: (row) => formatCsvDateTime(row.fechaPago) },
      { header: "metodo_pago", value: (row) => row.metodoPago },
      { header: "importe", value: (row) => formatCsvMoney(row.importe) },
      { header: "notas", value: (row) => row.notas ?? "" },
    ],
  });

  return buildCsvResponse(csv, buildCsvFilename("pagos"));
}
