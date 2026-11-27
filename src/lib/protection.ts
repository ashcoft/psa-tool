/**
 * Inverse-time overcurrent relay curves.
 *
 * t = TD * (k / (M^alpha - 1) + b), the IEC 60255-151 and IEEE C37.112 curve form:
 * k is A, alpha is p and b is the additive B term.
 */

export type RelayCurve = 'IEC-SI' | 'IEC-VI' | 'IEC-EI' | 'IEEE-MI' | 'IEEE-VI' | 'IEEE-EI';

export const relayCurves: Record<RelayCurve, { label: string; k: number; alpha: number; b: number }> = {
  'IEC-SI': { label: 'IEC Standard Inverse', k: 0.14, alpha: 0.02, b: 0 },
  'IEC-VI': { label: 'IEC Very Inverse', k: 13.5, alpha: 1, b: 0 },
  'IEC-EI': { label: 'IEC Extremely Inverse', k: 80, alpha: 2, b: 0 },
  'IEEE-MI': { label: 'IEEE Moderately Inverse', k: 0.0515, alpha: 0.02, b: 0.114 },
  'IEEE-VI': { label: 'IEEE Very Inverse', k: 19.61, alpha: 2, b: 0.491 },
  'IEEE-EI': { label: 'IEEE Extremely Inverse', k: 28.2, alpha: 2, b: 0.1217 },
};

export interface RelaySetting {
  id: string;
  bus: string;
  curve: RelayCurve;
  pickupA: number;
  timeDial: number;
}

export interface RelayCurveResult {
  id: string;
  bus: string;
  curve: RelayCurve;
  curveLabel: string;
  pickupA: number;
  timeDial: number;
  points: { current: number; time: number }[];
  tripTimes: { multiple: number; current: number; time: number }[];
}

export function relayTripTime(curve: RelayCurve, pickupA: number, timeDial: number, currentA: number): number {
  if (pickupA <= 0 || currentA <= pickupA) return Number.POSITIVE_INFINITY;
  const { k, alpha, b } = relayCurves[curve];
  const multiple = currentA / pickupA;
  return timeDial * (k / (Math.pow(multiple, alpha) - 1) + b);
}

export function buildRelayCurve(setting: RelaySetting): RelayCurveResult {
  const points: { current: number; time: number }[] = [];
  const start = setting.pickupA * 1.05;
  const end = setting.pickupA * 20;
  const steps = 80;
  for (let index = 0; index <= steps; index++) {
    const ratio = index / steps;
    const current = start * Math.pow(end / start, ratio);
    const time = relayTripTime(setting.curve, setting.pickupA, setting.timeDial, current);
    if (Number.isFinite(time) && time < 1000) points.push({ current, time });
  }

  const tripTimes = [1.5, 2, 3, 5, 10, 20].map(multiple => ({
    multiple,
    current: setting.pickupA * multiple,
    time: relayTripTime(setting.curve, setting.pickupA, setting.timeDial, setting.pickupA * multiple),
  }));

  return {
    ...setting,
    curveLabel: relayCurves[setting.curve].label,
    points,
    tripTimes,
  };
}

export function buildRelayCurves(settings: RelaySetting[]): RelayCurveResult[] {
  return settings.map(buildRelayCurve);
}

/** Coordination time between two relays at a given fault current (seconds). */
export function coordinationMargin(
  upstream: RelaySetting,
  downstream: RelaySetting,
  faultCurrentA: number
): number {
  const upstreamTime = relayTripTime(upstream.curve, upstream.pickupA, upstream.timeDial, faultCurrentA);
  const downstreamTime = relayTripTime(downstream.curve, downstream.pickupA, downstream.timeDial, faultCurrentA);
  if (!Number.isFinite(upstreamTime) || !Number.isFinite(downstreamTime)) return Number.POSITIVE_INFINITY;
  return upstreamTime - downstreamTime;
}
