/**
 * Ground-grid screening based on IEEE Std 80 simplified equations.
 */

export interface GroundGridInput {
  faultCurrentKA: number;
  clearingTime: number;
  soilResistivity: number;
  areaM2: number;
  conductorLengthM: number;
  depthM: number;
  surfaceResistivity: number;
  surfaceThicknessM: number;
  bodyWeightKg: 50 | 70;
}

export interface GroundGridResult {
  conductorSizeMM2: number;
  gridResistance: number;
  gprV: number;
  meshVoltageV: number;
  stepVoltageV: number;
  tolerableTouchV: number;
  tolerableStepV: number;
  touchPass: boolean;
  stepPass: boolean;
  surfaceDerating: number;
  notes: string[];
}

export function designGroundGrid(input: GroundGridInput): GroundGridResult {
  const currentA = Math.max(0, input.faultCurrentKA) * 1000;
  const time = Math.max(0.01, input.clearingTime);
  const soil = Math.max(1, input.soilResistivity);
  const area = Math.max(1, input.areaM2);
  const length = Math.max(1, input.conductorLengthM);
  const surfaceResistivity = Math.max(1, input.surfaceResistivity);
  const surfaceThickness = Math.max(0.01, input.surfaceThicknessM);
  const depth = Math.max(0.1, input.depthM);

  // Copper annealed soft-drawn conductor, IEEE 80 material constant.
  const conductorSizeMM2 = (currentA * Math.sqrt(time)) / 7.06;

  const gridResistance = soil * (1 / length + 1 / Math.sqrt(20 * area));
  const gprV = currentA * gridResistance;

  const surfaceDerating =
    1 - (0.09 * (1 - soil / surfaceResistivity)) / (2 * surfaceThickness + 0.09);
  const cs = Math.max(0, Math.min(1, surfaceDerating));

  // Simplified mesh and step coefficients (Km ≈ 0.6, Ks ≈ 0.6, Ki ≈ 2).
  const meshVoltageV = (soil * 1.2 * currentA) / length;
  const stepVoltageV = (soil * 0.6 * currentA) / length;

  const weightFactor = input.bodyWeightKg === 70 ? 0.157 : 0.116;
  const tolerableTouchV = ((1000 + 1.5 * cs * surfaceResistivity) * weightFactor) / Math.sqrt(time);
  const tolerableStepV = ((1000 + 6 * cs * surfaceResistivity) * weightFactor) / Math.sqrt(time);

  const notes: string[] = [
    'Screening calculation based on IEEE Std 80 simplified mesh/step equations.',
    `Conductor sized for ${input.bodyWeightKg} kg body weight and ${time.toFixed(2)} s clearing time.`,
    `Burial depth ${depth.toFixed(2)} m; verify with a detailed grid study before construction.`,
  ];
  if (meshVoltageV > tolerableTouchV) {
    notes.push('Mesh (touch) voltage exceeds the tolerable limit: add conductors or improve the surface layer.');
  }
  if (stepVoltageV > tolerableStepV) {
    notes.push('Step voltage exceeds the tolerable limit: increase the grid area or surface layer thickness.');
  }

  return {
    conductorSizeMM2,
    gridResistance,
    gprV,
    meshVoltageV,
    stepVoltageV,
    tolerableTouchV,
    tolerableStepV,
    touchPass: meshVoltageV <= tolerableTouchV,
    stepPass: stepVoltageV <= tolerableStepV,
    surfaceDerating: cs,
    notes,
  };
}
