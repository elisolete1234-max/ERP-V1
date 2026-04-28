import path from "node:path";
import PDFDocument from "pdfkit";
import { getInvoicePdfData } from "../../../../../../lib/erp-service";

export const runtime = "nodejs";

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

function truncate(value: string | null | undefined, maxChars: number) {
  const text = (value ?? "-").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function collectPdfBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const params = await context.params;
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

    const accent = "#2563EB";
    const ink = "#0F172A";
    const muted = "#64748B";
    const line = "#D8E2EF";
    const soft = "#F8FAFC";
    const margin = 42;
    const contentWidth = doc.page.width - margin * 2;
    const bottomLimit = doc.page.height - 80;
    const footerY = doc.page.height - 58;
    let y = margin;

    function addPageOnlyIfNeeded(requiredHeight: number) {
      if (y + requiredHeight > bottomLimit) {
        doc.addPage();
        y = margin;
      }
    }

    const paymentState = truncate(`Estado: ${invoice.resumen.estadoPago}`, 24);

    doc.font(fontPath).fontSize(22).fillColor(ink).text("Eli Print 3D", 42, 40, {
      width: 220,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10.5).fillColor(accent).text("Produccion 3D profesional", 42, 66, {
      width: 240,
      lineBreak: false,
    });

    doc.font(fontPath).fontSize(10).fillColor(muted).text("FACTURA", 360, 42, {
      width: 195,
      align: "right",
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(18).fillColor(ink).text(invoice.codigo, 360, 60, {
      width: 195,
      align: "right",
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10).fillColor(accent).text(paymentState, 360, 84, {
      width: 195,
      align: "right",
      lineBreak: false,
    });

    doc.roundedRect(42, 120, 245, 82, 10).fillAndStroke("#FFFFFF", line);
    doc.roundedRect(310, 120, 245, 82, 10).fillAndStroke("#FFFFFF", line);

    doc.font(fontPath).fontSize(12).fillColor(ink).text("Cliente", 56, 134, {
      width: 140,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(8.5).fillColor(muted).text("Nombre", 56, 158, {
      width: 80,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10).fillColor(ink).text(truncate(`${invoice.cliente.codigo} - ${invoice.cliente.nombre}`, 34), 56, 170, {
      width: 215,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(8.5).fillColor(muted).text("Contacto", 56, 186, {
      width: 80,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10).fillColor(ink).text(truncate(invoice.cliente.telefono || invoice.cliente.email || "-", 34), 56, 198, {
      width: 215,
      lineBreak: false,
    });

    doc.font(fontPath).fontSize(12).fillColor(ink).text("Pedido y factura", 324, 134, {
      width: 180,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(8.5).fillColor(muted).text("Pedido", 324, 158, {
      width: 80,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10).fillColor(ink).text(truncate(invoice.pedido.codigo, 20), 324, 170, {
      width: 215,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(8.5).fillColor(muted).text("Fecha factura", 324, 186, {
      width: 90,
      lineBreak: false,
    });
    doc.font(fontPath).fontSize(10).fillColor(ink).text(truncate(formatDate(invoice.fecha), 24), 324, 198, {
      width: 215,
      lineBreak: false,
    });

    y = 230;

    doc.font(fontPath).fontSize(12).fillColor(ink).text("Productos", 42, y, {
      width: 160,
      lineBreak: false,
    });
    y += 16;

    doc.roundedRect(42, y, contentWidth, 24, 8).fill(accent);
    doc.font(fontPath).fontSize(8.5).fillColor("#FFFFFF");
    doc.text("Producto", 42, y + 8, { width: 180, lineBreak: false });
    doc.text("Linea", 225, y + 8, { width: 75, lineBreak: false });
    doc.text("Cant.", 305, y + 8, { width: 45, align: "right", lineBreak: false });
    doc.text("IVA", 355, y + 8, { width: 45, align: "right", lineBreak: false });
    doc.text("PVP unit.", 405, y + 8, { width: 75, align: "right", lineBreak: false });
    doc.text("Total", 485, y + 8, { width: 70, align: "right", lineBreak: false });
    y += 30;

    invoice.lineas.forEach((linea: (typeof invoice.lineas)[number], index) => {
      addPageOnlyIfNeeded(26);
      doc.roundedRect(42, y, contentWidth, 26, 6).fillAndStroke(index % 2 === 0 ? "#FFFFFF" : soft, line);
      doc.font(fontPath).fontSize(9.5).fillColor(ink).text(truncate(`${linea.producto_codigo} - ${linea.producto_nombre}`, 30), 42, y + 8, {
        width: 180,
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(9).fillColor(muted).text(truncate(linea.codigo, 12), 225, y + 8, {
        width: 75,
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(9.5).fillColor(ink).text(String(linea.cantidad), 305, y + 8, {
        width: 45,
        align: "right",
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(9.5).fillColor(ink).text(`${linea.iva_porcentaje}%`, 355, y + 8, {
        width: 45,
        align: "right",
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(9.5).fillColor(ink).text(formatCurrency(linea.precio_unitario), 405, y + 8, {
        width: 75,
        align: "right",
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(9.5).fillColor(ink).text(formatCurrency(linea.precio_total_linea), 485, y + 8, {
        width: 70,
        align: "right",
        lineBreak: false,
      });
      y += 30;
    });

    y += 35;

    const paymentTableHeight = 24 + Math.max(invoice.pagos.length, 1) * 26;
    addPageOnlyIfNeeded(paymentTableHeight + 25 + 178);

    doc.font(fontPath).fontSize(12).fillColor(ink).text("Pagos registrados", 42, y, {
      width: 180,
      lineBreak: false,
    });
    y += 16;

    doc.roundedRect(42, y, 240, 24, 8).fill(accent);
    doc.font(fontPath).fontSize(8.5).fillColor("#FFFFFF");
    doc.text("Pago", 42, y + 8, { width: 80, lineBreak: false });
    doc.text("Fecha", 126, y + 8, { width: 95, lineBreak: false });
    doc.text("Importe", 225, y + 8, { width: 57, align: "right", lineBreak: false });
    y += 30;

    if (invoice.pagos.length === 0) {
      doc.roundedRect(42, y, 240, 26, 6).fillAndStroke("#FFFFFF", line);
      doc.font(fontPath).fontSize(9.5).fillColor(muted).text("Sin pagos registrados", 52, y + 8, {
        width: 180,
        lineBreak: false,
      });
      y += 30;
    } else {
      invoice.pagos.forEach((payment: (typeof invoice.pagos)[number], index) => {
        addPageOnlyIfNeeded(26);
        doc.roundedRect(42, y, 240, 26, 6).fillAndStroke(index % 2 === 0 ? "#FFFFFF" : soft, line);
        doc.font(fontPath).fontSize(9.5).fillColor(ink).text(truncate(payment.codigo, 14), 52, y + 8, {
          width: 70,
          lineBreak: false,
        });
        doc.font(fontPath).fontSize(9).fillColor(muted).text(truncate(formatDateTime(payment.fecha_pago), 19), 126, y + 8, {
          width: 95,
          lineBreak: false,
        });
        doc.font(fontPath).fontSize(9.5).fillColor(ink).text(formatCurrency(payment.importe), 225, y + 8, {
          width: 47,
          align: "right",
          lineBreak: false,
        });
        y += 30;
      });
    }

    y += 25;

    const summaryX = 330;
    const summaryWidth = 225;
    const labelWidth = 145;
    const valueWidth = 70;
    const summaryHeight = 174;

    addPageOnlyIfNeeded(summaryHeight);

    doc.roundedRect(summaryX, y, summaryWidth, summaryHeight, 10).fillAndStroke("#FFFFFF", line);
    doc.font(fontPath).fontSize(12).fillColor(ink).text("Resumen economico", summaryX + 14, y + 12, {
      width: 190,
      lineBreak: false,
    });

    const summaryRows = [
      ["Subtotal IVA incluido", formatCurrency(invoice.resumen.subtotal)],
      ["Descuento IVA incluido", formatCurrency(invoice.resumen.descuento)],
      ["Base imponible", formatCurrency(invoice.resumen.baseImponible)],
      ["IVA incluido", formatCurrency(invoice.resumen.iva)],
      ["Total", formatCurrency(invoice.resumen.total)],
      ["Pagado", formatCurrency(invoice.resumen.totalPagado)],
      ["Pendiente", formatCurrency(invoice.resumen.importePendiente)],
    ] as const;

    let rowY = y + 38;
    summaryRows.forEach(([label, value], index) => {
      if (index > 0) {
        doc.moveTo(summaryX + 14, rowY - 6).lineTo(summaryX + summaryWidth - 14, rowY - 6).strokeColor(line).stroke();
      }
      if (label === "Total") {
        doc.roundedRect(summaryX + 8, rowY - 5, summaryWidth - 16, 24, 6).fillAndStroke("#DBEAFE", "#93C5FD");
      }
      doc.font(fontPath).fontSize(9).fillColor(muted).text(label, summaryX + 14, rowY, {
        width: labelWidth,
        lineBreak: false,
      });
      doc.font(fontPath).fontSize(label === "Total" ? 11 : 10).fillColor(label === "Total" ? accent : ink).text(value, summaryX + 145, rowY - (label === "Total" ? 1 : 0), {
        width: valueWidth,
        align: "right",
        lineBreak: false,
      });
      rowY += 20;
    });

    doc.font(fontPath).fontSize(9.5).fillColor(accent).text(`Estado: ${invoice.resumen.estadoPago}`, summaryX + 14, y + summaryHeight - 20, {
      width: 180,
      lineBreak: false,
    });

    doc.moveTo(margin, footerY - 10).lineTo(margin + contentWidth, footerY - 10).strokeColor(line).stroke();
    doc.font(fontPath).fontSize(8.5).fillColor(muted).text(
      "Documento generado desde Eli Print 3D con importes reales de la factura.",
      margin,
      footerY,
      {
        width: contentWidth,
        align: "center",
        lineBreak: false,
      },
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
