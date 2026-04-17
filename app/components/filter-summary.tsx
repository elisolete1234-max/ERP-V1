export function FilterSummary({
  totalItems,
  hasFilters,
  filters,
  itemLabel = "facturas",
  allItemsText = "Mostrando todas las facturas",
}: {
  totalItems: number;
  hasFilters: boolean;
  filters: string[];
  itemLabel?: string;
  allItemsText?: string;
}) {
  const summaryText = hasFilters
    ? `Mostrando: ${totalItems} ${itemLabel} · ${filters.join(" · ")}`
    : allItemsText;

  return (
    <div className="mb-4">
      <span
        className={`inline-flex rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
          hasFilters
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "border-black/10 bg-white text-[color:var(--muted)]"
        }`}
      >
        {summaryText}
      </span>
    </div>
  );
}
