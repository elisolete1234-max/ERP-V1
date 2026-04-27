import path from "node:path";
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

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, x: number, y: number, width: number, fontPath: string, ink: string) {
  doc.font(fontPath).fontSize(12).fillColor(ink).text(title, x, y, {
    width,
    lineBreak: false,
  });
}

function drawKeyValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  fontPath: string,
  muted: string,
  ink: string,
) {
  doc.font(fontPath).fontSize(8).fillColor(muted).text(label, x, y, { width });
  doc.font(fontPath).fontSize(10).fillColor(ink).text(value || "-", x, y + 11, { width });
}

function ensureSpace(doc: PDFKit.PDFDocument, heightNeeded: number, footerReserve = 36) {
  if (doc.y + heightNeeded > doc.page.height - doc.page.margins.bottom - footerReserve) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  input: {
    x: number;
    y: number;
    width: number;
    height: number;
    line: string;
    fill: string;
    textColor: string;
    muted: string;
    fontPath: string;
    product: string;
    lineCode: string;
    quantity: string;
    vat: string;
    unitPrice: string;
    lineTotal: string;
  },
) {
  const columns = {
    product: input.x + 12,
    lineCode: input.x + 268,
    quantity: input.x + 334,
    vat: input.x + 384,
    unitPrice: input.x + 438,
    lineTotal: input.x + 512,
  };

  doc.roundedRect(input.x, input.y, input.width, input.height, 8).fillAndStroke(input.fill, input.line);
  doc.font(input.fontPath).fontSize(10).fillColor(input.textColor).text(input.product, columns.product, input.y + 10, {
    width: 244,
    lineBreak: false,
    ellipsis: true,
  });
  doc.font(input.fontPath).fontSize(9).fillColor(input.muted).text(input.lineCode, columns.lineCode, input.y + 10, {
    width: 56,
    lineBreak: false,
    ellipsis: true,
  });
  doc.font(input.fontPath).fontSize(10).fillColor(input.textColor).text(input.quantity, columns.quantity, input.y + 10, {
    width: 42,
    align: "right",
    lineBreak: false,
  });
  doc.font(input.fontPath).fontSize(10).fillColor(input.textColor).text(input.vat, columns.vat, input.y + 10, {
    width: 42,
    align: "right",
    lineBreak: false,
  });
  doc.font(input.fontPath).fontSize(10).fillColor(input.textColor).text(input.unitPrice, columns.unitPrice, input.y + 10, {
    width: 64,
    align: "right",
    lineBreak: false,
  });
  doc.font(input.fontPath).fontSize(10).fillColor(input.textColor).text(input.lineTotal, columns.lineTotal, input.y + 10, {
    width: 64,
    align: "right",
    lineBreak: false,
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await Promise.resolve(context.params);
    const invoice = await getInvoicePdfData(params.id);
    const fontPath = path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf");

    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      font: fontPath,
      info: {
        Title: `Factura ${invoice.codigo}`,
        Author: "Eli Print 3D",
        Subject: `Factura ${invoice.codigo}`,
      },
      compress: false,
    });
    const pdfBufferPromise = collectPdfBuffer(doc);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const accent = "#2563EB";
    const accentSoft = "#DBEAFE";
    const accentLine = "#93C5FD";
    const ink = "#0F172A";
    const muted = "#64748B";
    const line = "#DCE6F2";
    const soft = "#F8FAFC";
    const footerReserve = 34;

    const drawFooter = () => {
      const footerY = doc.page.height - doc.page.margins.bottom + 6;
      doc.moveTo(doc.page.margins.left, footerY - 8).lineTo(doc.page.width - doc.page.margins.right, footerY - 8).strokeColor(line).stroke();
      doc.font(fontPath).fontSize(8.5).fillColor(muted).text(
        "Documento generado desde Eli Print 3D con importes reales de la factura.",
        doc.page.margins.left,
        footerY,
        {
          width: pageWidth,
          align: "center",
          lineBreak: false,
        },
      );
    };

    const startNewPage = () => {
      doc.addPage();
      doc.y = doc.page.margins.top;
    };

    doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, 92, 18).fillAndStroke("#FFFFFF", line);
    doc.roundedRect(doc.page.margins.left, doc.y, 6, 92, 18).fill(accent);

    doc.font(fontPath).fontSize(24).fillColor(ink).text("Eli Print 3D", doc.page.margins.left + 18, doc.y + 16, {
      width: 240,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(11).fillColor(accent).text("Produccion 3D profesional", doc.page.margins.left + 18, doc.y + 46, {
      width: 250,
      lineBreak: false,
    });

    const headerRightX = doc.page.margins.left + pageWidth - 210;
    doc.font(fontPath).fontSize(10).fillColor(muted).text("FACTURA", headerRightX, doc.y + 16, {
      width: 210,
      align: "right",
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(18).fillColor(ink).text(invoice.codigo, headerRightX, doc.y + 32, {
      width: 210,
      align: "right",
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10).fillColor(accent).text(`Estado: ${invoice.resumen.estadoPago}`, headerRightX, doc.y + 58, {
      width: 210,
      align: "right",
      lineBreak: false,
    });

    doc.y += 110;

    ensureSpace(doc, 108, footerReserve);
    const cardY = doc.y;
    const cardGap = 18;
    const cardWidth = (pageWidth - cardGap) / 2;

    doc.roundedRect(doc.page.margins.left, cardY, cardWidth, 96, 14).fillAndStroke("#FFFFFF", line);
    doc.roundedRect(doc.page.margins.left + cardWidth + cardGap, cardY, cardWidth, 96, 14).fillAndStroke("#FFFFFF", line);

    drawSectionTitle(doc, "Cliente", doc.page.margins.left + 14, cardY + 12, cardWidth - 28, fontPath, ink);
    drawKeyValue(
      doc,
      "Nombre",
      `${invoice.cliente.codigo} - ${invoice.cliente.nombre}`,
      doc.page.margins.left + 14,
      cardY + 34,
      cardWidth - 28,
      fontPath,
      muted,
      ink,
    );
    drawKeyValue(
      doc,
      "Contacto",
      invoice.cliente.telefono || invoice.cliente.email || "-",
      doc.page.margins.left + 14,
      cardY + 58,
      cardWidth - 28,
      fontPath,
      muted,
      ink,
    );

    const rightCardX = doc.page.margins.left + cardWidth + cardGap;
    drawSectionTitle(doc, "Pedido y factura", rightCardX + 14, cardY + 12, cardWidth - 28, fontPath, ink);
    drawKeyValue(doc, "Pedido", invoice.pedido.codigo, rightCardX + 14, cardY + 34, cardWidth - 28, fontPath, muted, ink);
    drawKeyValue(doc, "Fecha factura", formatDate(invoice.fecha), rightCardX + 14, cardY + 58, cardWidth - 28, fontPath, muted, ink);

    doc.y = cardY + 116;

    ensureSpace(doc, 46, footerReserve);
    drawSectionTitle(doc, "Productos", doc.page.margins.left, doc.y, pageWidth, fontPath, ink);
    doc.y += 18;

    const tableHeaderY = doc.y;
    doc.roundedRect(doc.page.margins.left, tableHeaderY, pageWidth, 28, 10).fill(accent);
    doc.font(fontPath).fontSize(8.5).fillColor("#FFFFFF");
    doc.text("Producto", doc.page.margins.left + 12, tableHeaderY + 9, { width: 244, lineBreak: false });
    doc.text("Linea", doc.page.margins.left + 268, tableHeaderY + 9, { width: 56, lineBreak: false });
    doc.text("Cant.", doc.page.margins.left + 334, tableHeaderY + 9, { width: 42, align: "right", lineBreak: false });
    doc.text("IVA", doc.page.margins.left + 384, tableHeaderY + 9, { width: 42, align: "right", lineBreak: false });
    doc.text("PVP unit.", doc.page.margins.left + 438, tableHeaderY + 9, { width: 64, align: "right", lineBreak: false });
    doc.text("Total", doc.page.margins.left + 512, tableHeaderY + 9, { width: 64, align: "right", lineBreak: false });
    doc.y += 36;

    invoice.lineas.forEach((linea: (typeof invoice.lineas)[number], index) => {
      ensureSpace(doc, 40, footerReserve);
      if (doc.y === doc.page.margins.top) {
        drawSectionTitle(doc, "Productos", doc.page.margins.left, doc.y, pageWidth, fontPath, ink);
        doc.y += 18;
        doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, 28, 10).fill(accent);
        doc.font(fontPath).fontSize(8.5).fillColor("#FFFFFF");
        doc.text("Producto", doc.page.margins.left + 12, doc.y + 9, { width: 244, lineBreak: false });
        doc.text("Linea", doc.page.margins.left + 268, doc.y + 9, { width: 56, lineBreak: false });
        doc.text("Cant.", doc.page.margins.left + 334, doc.y + 9, { width: 42, align: "right", lineBreak: false });
        doc.text("IVA", doc.page.margins.left + 384, doc.y + 9, { width: 42, align: "right", lineBreak: false });
        doc.text("PVP unit.", doc.page.margins.left + 438, doc.y + 9, { width: 64, align: "right", lineBreak: false });
        doc.text("Total", doc.page.margins.left + 512, doc.y + 9, { width: 64, align: "right", lineBreak: false });
        doc.y += 36;
      }

      drawTableRow(doc, {
        x: doc.page.margins.left,
        y: doc.y,
        width: pageWidth,
        height: 34,
        line,
        fill: index % 2 === 0 ? "#FFFFFF" : soft,
        textColor: ink,
        muted,
        fontPath,
        product: `${linea.producto_codigo} - ${linea.producto_nombre}`,
        lineCode: linea.codigo,
        quantity: String(linea.cantidad),
        vat: `${linea.iva_porcentaje}%`,
        unitPrice: formatCurrency(linea.precio_unitario),
        lineTotal: formatCurrency(linea.precio_total_linea),
      });
      doc.y += 40;
    });

    const summaryHeight = 198;
    const paymentsRowHeight = invoice.pagos.length === 0 ? 34 : invoice.pagos.length * 26 + 34;
    const paymentsHeight = Math.max(74, paymentsRowHeight);
    const blockGap = 18;
    const leftWidth = 260;
    const rightWidth = pageWidth - leftWidth - blockGap;

    ensureSpace(doc, Math.max(summaryHeight, paymentsHeight) + 18, footerReserve);
    if (doc.y === doc.page.margins.top) {
      startNewPage();
    }

    const blocksY = doc.y;
    const paymentsX = doc.page.margins.left;
    const summaryX = doc.page.margins.left + leftWidth + blockGap;

    doc.roundedRect(paymentsX, blocksY, leftWidth, paymentsHeight, 14).fillAndStroke("#FFFFFF", line);
    drawSectionTitle(doc, "Pagos registrados", paymentsX + 14, blocksY + 12, leftWidth - 28, fontPath, ink);

    let paymentY = blocksY + 36;
    if (invoice.pagos.length === 0) {
      doc.font(fontPath).fontSize(9).fillColor(muted).text("No hay pagos registrados.", paymentsX + 14, paymentY, {
        width: leftWidth - 28,
      });
    } else {
      invoice.pagos.forEach((payment: (typeof invoice.pagos)[number], index) => {
        if (index > 0) {
          doc.moveTo(paymentsX + 14, paymentY - 6).lineTo(paymentsX + leftWidth - 14, paymentY - 6).strokeColor(line).stroke();
        }
        doc.font(fontPath).fontSize(9.5).fillColor(ink).text(payment.codigo, paymentsX + 14, paymentY, {
          width: 78,
          lineBreak: false,
        });
        doc.font(fontPath).fontSize(9).fillColor(muted).text(payment.metodo_pago.toLowerCase(), paymentsX + 94, paymentY, {
          width: 68,
          lineBreak: false,
        });
        doc.font(fontPath).fontSize(9).fillColor(muted).text(formatDateTime(payment.fecha_pago), paymentsX + 14, paymentY + 12, {
          width: 146,
          lineBreak: false,
        });
        doc.font(fontPath).fontSize(9.5).fillColor(ink).text(formatCurrency(payment.importe), paymentsX + 166, paymentY + 6, {
          width: leftWidth - 180,
          align: "right",
          lineBreak: false,
        });
        paymentY += 26;
      });
    }

    doc.roundedRect(summaryX, blocksY, rightWidth, summaryHeight, 14).fillAndStroke("#FFFFFF", line);
    drawSectionTitle(doc, "Resumen economico", summaryX + 14, blocksY + 12, rightWidth - 28, fontPath, ink);

    const summaryRows: Array<{ label: string; value: string; highlight?: boolean }> = [
      { label: "Subtotal IVA incluido", value: formatCurrency(invoice.resumen.subtotal) },
      { label: "Descuento IVA incluido", value: formatCurrency(invoice.resumen.descuento) },
      { label: "Base imponible", value: formatCurrency(invoice.resumen.baseImponible) },
      { label: "IVA incluido", value: formatCurrency(invoice.resumen.iva) },
      { label: "Total", value: formatCurrency(invoice.resumen.total), highlight: true },
      { label: "Pagado", value: formatCurrency(invoice.resumen.totalPagado) },
      { label: "Pendiente", value: formatCurrency(invoice.resumen.importePendiente) },
    ];

    let summaryY = blocksY + 38;
    summaryRows.forEach((row, index) => {
      if (row.highlight) {
        doc.roundedRect(summaryX + 10, summaryY - 6, rightWidth - 20, 28, 10).fillAndStroke(accentSoft, accentLine);
      } else if (index > 0) {
        doc.moveTo(summaryX + 14, summaryY - 6).lineTo(summaryX + rightWidth - 14, summaryY - 6).strokeColor(line).stroke();
      }

      doc.font(fontPath).fontSize(9).fillColor(muted).text(row.label, summaryX + 16, summaryY, {
        width: rightWidth - 140,
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(row.highlight ? 12 : 10).fillColor(ink).text(row.value, summaryX + 160, summaryY - (row.highlight ? 1 : 0), {
        width: rightWidth - 176,
        align: "right",
        lineBreak: false,
      });
      summaryY += row.highlight ? 34 : 22;
    });

    doc.font(fontPath).fontSize(9.5).fillColor(accent).text(`Estado de pago: ${invoice.resumen.estadoPago}`, summaryX + 16, blocksY + summaryHeight - 24, {
      width: rightWidth - 32,
      lineBreak: false,
    });

    drawFooter();

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
