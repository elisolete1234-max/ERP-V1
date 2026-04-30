export const DEFAULT_ELECTRICITY_COST_PER_HOUR = 0.1;
export const DEFAULT_MACHINE_COST_PER_HOUR = 0.5;

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

function deriveHourlyRate(unitCost: number | null | undefined, hoursPerUnit: number, fallbackRate: number) {
  if (Number.isFinite(unitCost) && (unitCost ?? 0) > 0 && hoursPerUnit > 0) {
    return roundMoney((unitCost ?? 0) / hoursPerUnit);
  }

  return fallbackRate;
}

export function calculateMaterialCost(input: {
  gramsPerUnit: number;
  quantity: number;
  materialPricePerKg: number;
}) {
  const quantity = Math.max(0, Math.round(input.quantity));
  const gramsPerUnit = Math.max(0, input.gramsPerUnit);
  const materialPricePerKg = Math.max(0, input.materialPricePerKg);
  const gramsUsed = roundQuantity(gramsPerUnit * quantity);
  const pricePerGram = roundMoney(materialPricePerKg / 1000);
  const filamentCost = roundMoney(gramsUsed * pricePerGram);

  return {
    gramsUsed,
    pricePerGram,
    filamentCost,
  };
}

export function calculateProfitability(input: {
  quantity: number;
  salePricePerUnit: number;
  totalCost: number;
}) {
  const quantity = Math.max(0, Math.round(input.quantity));
  const salePricePerUnit = Math.max(0, input.salePricePerUnit);
  const totalCost = roundMoney(Math.max(0, input.totalCost));
  const unitCost = quantity > 0 ? roundMoney(totalCost / quantity) : 0;
  const beneficioUnitario = roundMoney(salePricePerUnit - unitCost);
  const beneficioTotal = roundMoney(beneficioUnitario * quantity);
  const margenPorcentaje = salePricePerUnit > 0 ? roundMoney((beneficioUnitario / salePricePerUnit) * 100) : 0;

  return {
    unitCost,
    beneficioUnitario,
    beneficioTotal,
    margenPorcentaje,
  };
}

export function calculateProductionCost(input: {
  quantity: number;
  gramsPerUnit: number;
  materialPricePerKg: number;
  printHoursPerUnit: number;
  salePricePerUnit?: number;
  electricityCostPerUnit?: number | null;
  machineCostPerUnit?: number | null;
  laborCostPerUnit?: number | null;
  postProcessingCostPerUnit?: number | null;
  electricityCostPerHour?: number | null;
  machineCostPerHour?: number | null;
  machineCostTotalOverride?: number | null;
}) {
  const quantity = Math.max(0, Math.round(input.quantity));
  const printHoursPerUnit = Math.max(0, input.printHoursPerUnit);
  const totalHours = roundMoney(printHoursPerUnit * quantity);
  const material = calculateMaterialCost({
    gramsPerUnit: input.gramsPerUnit,
    quantity,
    materialPricePerKg: input.materialPricePerKg,
  });
  const electricityRate = Number.isFinite(input.electricityCostPerHour)
    ? Math.max(0, input.electricityCostPerHour ?? 0)
    : deriveHourlyRate(input.electricityCostPerUnit, printHoursPerUnit, DEFAULT_ELECTRICITY_COST_PER_HOUR);
  const machineRate = Number.isFinite(input.machineCostPerHour)
    ? Math.max(0, input.machineCostPerHour ?? 0)
    : deriveHourlyRate(input.machineCostPerUnit, printHoursPerUnit, DEFAULT_MACHINE_COST_PER_HOUR);
  const usesFallbackElectricityRate =
    !(Number.isFinite(input.electricityCostPerHour) && (input.electricityCostPerHour ?? 0) >= 0) &&
    (!Number.isFinite(input.electricityCostPerUnit) || (input.electricityCostPerUnit ?? 0) <= 0);
  const usesFallbackMachineRate =
    !(Number.isFinite(input.machineCostPerHour) && (input.machineCostPerHour ?? 0) >= 0) &&
    (!Number.isFinite(input.machineCostPerUnit) || (input.machineCostPerUnit ?? 0) <= 0) &&
    !Number.isFinite(input.machineCostTotalOverride);
  const costeElectricidad = roundMoney(totalHours * electricityRate);
  const costeMaquina = Number.isFinite(input.machineCostTotalOverride)
    ? roundMoney(Math.max(0, input.machineCostTotalOverride ?? 0))
    : roundMoney(totalHours * machineRate);
  const costeManoObra = roundMoney(Math.max(0, input.laborCostPerUnit ?? 0) * quantity);
  const costePostprocesado = roundMoney(Math.max(0, input.postProcessingCostPerUnit ?? 0) * quantity);
  const costeTotal = roundMoney(
    material.filamentCost + costeElectricidad + costeMaquina + costeManoObra + costePostprocesado,
  );
  const profitability = calculateProfitability({
    quantity,
    salePricePerUnit: Math.max(0, input.salePricePerUnit ?? 0),
    totalCost: costeTotal,
  });
  const warnings: string[] = [];

  if (usesFallbackElectricityRate) {
    warnings.push(`Coste de electricidad usando valor por defecto ${DEFAULT_ELECTRICITY_COST_PER_HOUR.toFixed(2)} EUR/h.`);
  }
  if (usesFallbackMachineRate) {
    warnings.push(`Coste de maquina usando valor por defecto ${DEFAULT_MACHINE_COST_PER_HOUR.toFixed(2)} EUR/h.`);
  }
  if ((input.salePricePerUnit ?? 0) <= 0) {
    warnings.push("El PVP del producto es 0, asi que el margen estimado se muestra sin rentabilidad.");
  }

  return {
    quantity,
    gramsUsed: material.gramsUsed,
    pricePerGram: material.pricePerGram,
    totalHours,
    electricityRate: roundMoney(electricityRate),
    machineRate: roundMoney(machineRate),
    costeFilamento: material.filamentCost,
    costeElectricidad,
    costeMaquina,
    costeManoObra,
    costePostprocesado,
    costeTotal,
    costeUnitario: profitability.unitCost,
    beneficioUnitario: profitability.beneficioUnitario,
    beneficioTotal: profitability.beneficioTotal,
    margenPorcentaje: profitability.margenPorcentaje,
    warnings,
  };
}
