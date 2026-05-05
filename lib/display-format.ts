type MaterialDisplayInput = {
  codigo?: string | null;
  marca?: string | null;
  tipo?: string | null;
  color?: string | null;
  efecto?: string | null;
  nombre?: string | null;
  nombreComercial?: string | null;
  tipoColor?: string | null;
  colorBase?: string | null;
};

function compactParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
}

export function formatMaterialDisplay(input: MaterialDisplayInput) {
  const code = input.codigo?.trim() || null;
  const titleParts = compactParts([input.marca, input.nombreComercial, input.nombre, input.tipo]);
  const variantParts = compactParts([
    input.tipoColor && input.tipoColor !== input.color ? input.tipoColor : null,
    input.color,
    input.colorBase && input.colorBase !== input.color ? input.colorBase : null,
    input.efecto,
  ]);

  return {
    code,
    title: titleParts.join(" · "),
    variant: variantParts.join(" · "),
  };
}
