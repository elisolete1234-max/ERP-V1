import PDFDocument from "pdfkit";
import { getInvoicePdfData } from "../../../../../../lib/erp-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
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
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function collectPdfBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, heightNeeded: number) {
  if (doc.y + heightNeeded > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await Promise.resolve(context.params);
    const invoice = await getInvoicePdfData(params.id);

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Factura ${invoice.codigo}`,
        Author: "ERP V3",
        Subject: `Factura ${invoice.codigo}`,
      },
      compress: false,
    });
    const pdfBufferPromise = collectPdfBuffer(doc);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const accent = "#1d4ed8";
    const ink = "#0f172a";
    const muted = "#64748b";
    const line = "#dbe4f0";
    const soft = "#f8fafc";

    doc
      .roundedRect(doc.x, doc.y, pageWidth, 96, 16)
      .fillAndStroke("#eff6ff", "#bfdbfe");
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(24).text("Factura", 72, 70);
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(15).text(invoice.codigo, 72, 102);
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(`Fecha factura: ${formatDate(invoice.fecha)}`, 72, 128)
      .text(`Estado de pago: ${invoice.resumen.estadoPago.toLowerCase()}`, 260, 128);

    doc.y = 176;

    const drawBlock = (title: string, rows: Array<[string, string]>, x: number, width: number) => {
      const startY = doc.y;
      doc.roundedRect(x, startY, width, 118, 14).fillAndStroke("white", line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text(title, x + 16, startY + 14);
      let rowY = startY + 40;
      rows.forEach(([label, value]) => {
        doc.fillColor(muted).font("Helvetica").fontSize(9).text(label, x + 16, rowY);
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(value || "-", x + 16, rowY + 12, {
          width: width - 32,
        });
        rowY += 34;
      });
    };

    drawBlock(
      "Cliente",
      [
        ["Nombre", `${invoice.cliente.codigo} · ${invoice.cliente.nombre}`],
        ["Contacto", invoice.cliente.telefono || invoice.cliente.email || "-"],
        ["Direccion", invoice.cliente.direccion || "-"],
      ],
      doc.page.margins.left,
      (pageWidth - 18) / 2,
    );
    drawBlock(
      "Pedido",
      [
        ["Codigo pedido", invoice.pedido.codigo],
        ["Fecha pedido", formatDate(invoice.pedido.fecha)],
        ["Observaciones", invoice.pedido.observaciones || "-"],
      ],
      doc.page.margins.left + (pageWidth + 18) / 2,
      (pageWidth - 18) / 2,
    );

    doc.y += 138;
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text("Productos facturados");
    doc.y += 12;

    const columns = {
      producto: doc.page.margins.left,
      cantidad: doc.page.margins.left + 252,
      iva: doc.page.margins.left + 312,
      unitario: doc.page.margins.left + 370,
      total: doc.page.margins.left + 456,
    };

    doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, 28, 10).fill(accent);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(9);
    doc.text("Producto", columns.producto + 12, doc.y + 9);
    doc.text("Cantidad", columns.cantidad, doc.y + 9, { width: 50, align: "right" });
    doc.text("IVA", columns.iva, doc.y + 9, { width: 40, align: "right" });
    doc.text("PVP unit.", columns.unitario, doc.y + 9, { width: 72, align: "right" });
    doc.text("Total linea", columns.total, doc.y + 9, { width: 80, align: "right" });
    doc.y += 36;

    invoice.lineas.forEach((linea: (typeof invoice.lineas)[number]) => {
      ensureSpace(doc, 48);
      doc.roundedRect(doc.page.margins.left, doc.y - 2, pageWidth, 42, 10).fillAndStroke(soft, line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(
        `${linea.producto_codigo} · ${linea.producto_nombre}`,
        columns.producto + 12,
        doc.y + 8,
        { width: 230 },
      );
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(linea.codigo, columns.producto + 12, doc.y + 22);
      doc.fillColor(ink).font("Helvetica").fontSize(10);
      doc.text(String(linea.cantidad), columns.cantidad, doc.y + 14, { width: 50, align: "right" });
      doc.text(`${linea.iva_porcentaje}%`, columns.iva, doc.y + 14, { width: 40, align: "right" });
      doc.text(formatCurrency(linea.precio_unitario), columns.unitario, doc.y + 14, { width: 72, align: "right" });
      doc.text(formatCurrency(linea.precio_total_linea), columns.total, doc.y + 14, { width: 80, align: "right" });
      doc.y += 50;
    });

    ensureSpace(doc, 220);
    doc.y += 8;
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text("Resumen economico");
    doc.y += 10;

    const summaryX = doc.page.margins.left + 280;
    const summaryWidth = pageWidth - 280;
    doc.roundedRect(summaryX, doc.y, summaryWidth, 176, 14).fillAndStroke("white", line);
    const summaryRows: Array<[string, string]> = [
      ["Subtotal IVA incluido", formatCurrency(invoice.resumen.subtotal)],
      ["Descuento IVA incluido", formatCurrency(invoice.resumen.descuento)],
      ["Base imponible", formatCurrency(invoice.resumen.baseImponible)],
      ["IVA incluido", formatCurrency(invoice.resumen.iva)],
      ["Total", formatCurrency(invoice.resumen.total)],
      ["Pagado", formatCurrency(invoice.resumen.totalPagado)],
      ["Pendiente", formatCurrency(invoice.resumen.importePendiente)],
    ];

    let summaryY = doc.y + 16;
    summaryRows.forEach(([label, value], index) => {
      if (index > 0) {
        doc.moveTo(summaryX + 16, summaryY - 8).lineTo(summaryX + summaryWidth - 16, summaryY - 8).strokeColor(line).stroke();
      }
      doc.fillColor(muted).font("Helvetica").fontSize(9).text(label, summaryX + 16, summaryY);
      doc.fillColor(ink).font(index >= 4 ? "Helvetica-Bold" : "Helvetica").fontSize(index >= 4 ? 11 : 10).text(
        value,
        summaryX + 140,
        summaryY,
        { width: summaryWidth - 156, align: "right" },
      );
      summaryY += 22;
    });

    doc.fillColor(accent).font("Helvetica-Bold").fontSize(10).text(
      `Estado de pago: ${invoice.resumen.estadoPago}`,
      summaryX + 16,
      doc.y + 146,
    );

    doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text("Pagos registrados", doc.page.margins.left, doc.y);
    doc.y += 10;

    if (invoice.pagos.length === 0) {
      doc.roundedRect(doc.page.margins.left, doc.y, 250, 54, 12).fillAndStroke(soft, line);
      doc.fillColor(muted).font("Helvetica").fontSize(10).text(
        "No hay pagos registrados en esta factura.",
        doc.page.margins.left + 16,
        doc.y + 18,
      );
      doc.y += 66;
    } else {
      invoice.pagos.forEach((payment: (typeof invoice.pagos)[number]) => {
        ensureSpace(doc, 58);
        doc.roundedRect(doc.page.margins.left, doc.y, 250, 50, 12).fillAndStroke(soft, line);
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(
          `${payment.codigo} · ${payment.metodo_pago.toLowerCase()}`,
          doc.page.margins.left + 14,
          doc.y + 10,
        );
        doc.fillColor(muted).font("Helvetica").fontSize(9).text(
          formatDateTime(payment.fecha_pago),
          doc.page.margins.left + 14,
          doc.y + 26,
        );
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(
          formatCurrency(payment.importe),
          doc.page.margins.left + 150,
          doc.y + 18,
          { width: 84, align: "right" },
        );
        doc.y += 58;
      });
    }

    doc.font("Helvetica").fontSize(9).fillColor(muted).text(
      "Documento generado desde ERP V3 con importes reales de la factura.",
      doc.page.margins.left,
      doc.page.height - doc.page.margins.bottom + 8,
      { align: "center", width: pageWidth },
    );

    doc.end();
    const buffer = await pdfBufferPromise;
    const fileName = `factura-${normalizeFileName(invoice.codigo || invoice.id)}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el PDF.";
    const status = /no existe/i.test(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
