/**
 * Motor-starting screening using the Thevenin impedance at the motor bus.
 */

import { PowerSystem } from '@/types';
import { buildZBus } from './fault';

export interface MotorStartInput {
  busId: string;
  ratedMW: number;
  lockedRotorCurrent: number;
  efficiency: number;
  startingPowerFactor: number;
}

export interface MotorStartResult {
  bus: string;
  baseKV: number;
  theveninZ: number;
  ratedCurrentKA: number;
  startingCurrentKA: number;
  startingMVA: number;
  voltageDipPercent: number;
  terminalVoltagePercent: number;
  acceptable: boolean;
  notes: string[];
}

export function analyzeMotorStarting(system: PowerSystem, input: MotorStartInput): MotorStartResult {
  const index = system.buses.findIndex(bus => bus.id === input.busId);
  if (index < 0) throw new Error(`Bus ${input.busId} not found`);

  const bus = system.buses[index];
  const baseMVA = system.baseMVA > 0 ? system.baseMVA : 100;
  const baseKV = bus.vbase && bus.vbase > 0 ? bus.vbase : 1;
  const zbus = buildZBus(system);
  const theveninZ = Math.hypot(zbus[index][index].re, zbus[index][index].im);

  const efficiency = Math.max(0.5, Math.min(1, input.efficiency));
  const powerFactor = Math.max(0.05, Math.min(1, input.startingPowerFactor));
  const ratedCurrentKA = input.ratedMW / (Math.sqrt(3) * baseKV * efficiency * Math.max(0.5, powerFactor));
  const startingCurrentKA = ratedCurrentKA * Math.max(1, input.lockedRotorCurrent);
  const startingMVA = Math.sqrt(3) * baseKV * startingCurrentKA;
  const startingPU = startingMVA / baseMVA;
  const voltageDipPercent = Math.min(100, startingPU * theveninZ * 100);
  const terminalVoltagePercent = 100 - voltageDipPercent;

  const notes: string[] = [
    'Voltage dip is approximated by I_start(pu) × |Zth| using the positive-sequence bus impedance matrix.',
    'A terminal voltage of at least 80 % is normally required for successful acceleration.',
  ];
  if (terminalVoltagePercent < 80) {
    notes.push('Terminal voltage is below 80 %: consider reduced-voltage starting, a larger feeder or a soft starter.');
  }

  return {
    bus: bus.id,
    baseKV,
    theveninZ,
    ratedCurrentKA,
    startingCurrentKA,
    startingMVA,
    voltageDipPercent,
    terminalVoltagePercent,
    acceptable: terminalVoltagePercent >= 80,
    notes,
  };
}
