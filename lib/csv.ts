type CsvValue = string | number | boolean | null | undefined;

type CsvColumn<T> = {
  header: string;
  value: (row: T) => CsvValue;
};

type CsvOptions<T> = {
  columns: CsvColumn<T>[];
  delimiter?: string;
};

function escapeCsvCell(value: CsvValue, delimiter: string) {
  const raw = value == null ? "" : String(value);
  const normalized = raw.replace(/\r?\n/g, " ").replaceAll('"', '""');
  const mustQuote =
    normalized.includes(delimiter) ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r");

  return mustQuote ? `"${normalized}"` : normalized;
}

export function serializeCsv<T>(rows: T[], options: CsvOptions<T>) {
  const delimiter = options.delimiter ?? ";";
  const headerRow = options.columns.map((column) => escapeCsvCell(column.header, delimiter)).join(delimiter);
  const bodyRows = rows.map((row) =>
    options.columns
      .map((column) => escapeCsvCell(column.value(row), delimiter))
      .join(delimiter),
  );

  return [headerRow, ...bodyRows].join("\r\n");
}

export function formatCsvMoney(value: number) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCsvDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function buildCsvFilename(prefix: string, now = new Date()) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${prefix}-${year}${month}${day}-${hours}${minutes}.csv`;
}

export function buildCsvResponse(csvContent: string, filename: string) {
  const body = `\uFEFF${csvContent}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
