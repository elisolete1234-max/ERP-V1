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
        className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold shadow-[0_8px_16px_rgba(15,23,42,0.05)] ${
          hasFilters
            ? "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.92))] text-sky-700"
            : "border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] text-[color:var(--muted)]"
        }`}
      >
        {summaryText}
      </span>
    </div>
  );
}
