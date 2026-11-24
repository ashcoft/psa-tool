/**
 * Arc-flash screening using the Lee method.
 *
 * Incident energy is estimated for an open-air arc with a spherical radiation
 * model. This is a conservative screening calculation, not a replacement for a
 * full IEEE 1584-2018 study.
 */

export interface ArcFlashInput {
  faultCurrentKA: number;
  voltageKV: number;
  clearingTime: number;
  workingDistanceMM: number;
}

export interface ArcFlashResult {
  incidentEnergy: number;
  arcFlashBoundaryMM: number;
  arcPowerMW: number;
  ppeCategory: number;
  ppeLabel: string;
  acceptable: boolean;
  notes: string[];
}

export const ARC_FLASH_BOUNDARY_ENERGY = 1.2;

export function calculateArcFlash(input: ArcFlashInput): ArcFlashResult {
  const current = Math.max(0, input.faultCurrentKA);
  const voltage = Math.max(0.1, input.voltageKV);
  const time = Math.max(0.001, input.clearingTime);
  const distance = Math.max(100, input.workingDistanceMM);

  const incidentEnergy = (2.142e6 * voltage * current * time) / (distance * distance);
  const boundary = Math.sqrt((2.142e6 * voltage * current * time) / ARC_FLASH_BOUNDARY_ENERGY);
  const arcPowerMW = Math.sqrt(3) * voltage * current;

  let ppeCategory = 0;
  let ppeLabel = 'No arc-rated PPE required';
  if (incidentEnergy > 40) {
    ppeCategory = 5;
    ppeLabel = 'Dangerous - de-energise before work';
  } else if (incidentEnergy > 25) {
    ppeCategory = 4;
    ppeLabel = 'PPE category 4 (40 cal/cm²)';
  } else if (incidentEnergy > 8) {
    ppeCategory = 3;
    ppeLabel = 'PPE category 3 (25 cal/cm²)';
  } else if (incidentEnergy > 4) {
    ppeCategory = 2;
    ppeLabel = 'PPE category 2 (8 cal/cm²)';
  } else if (incidentEnergy > ARC_FLASH_BOUNDARY_ENERGY) {
    ppeCategory = 1;
    ppeLabel = 'PPE category 1 (4 cal/cm²)';
  }

  const notes: string[] = [
    'Lee open-air screening model: E = 2.142e6 · V(kV) · I(kA) · t(s) / D(mm)².',
    'Use a full IEEE 1584-2018 study with equipment-specific gaps and enclosure data for final PPE selection.',
  ];
  if (input.workingDistanceMM < 455) {
    notes.push('Working distances below 455 mm are outside the usual screening range.');
  }
  if (voltage > 15) {
    notes.push('Voltages above 15 kV are outside the validated IEEE 1584 range; use transmission-level arc-flash methods.');
  }
  if (incidentEnergy > 40) {
    notes.push('Incident energy exceeds the highest standard PPE category.');
  }

  return {
    incidentEnergy,
    arcFlashBoundaryMM: boundary,
    arcPowerMW,
    ppeCategory,
    ppeLabel,
    acceptable: incidentEnergy <= 8,
    notes,
  };
}
