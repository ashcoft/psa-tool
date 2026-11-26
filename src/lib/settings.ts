/**
 * Persisted application and study settings.
 */

import { PowerFlowMethod } from '@/types';

export interface AppSettings {
  projectName: string;
  baseMVA: number;
  baseFreq: number;
  method: PowerFlowMethod;
  tolerance: number;
  maxIterations: number;
  showSidebar: boolean;
  showProperties: boolean;
  showToolbar: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  showBusNames: boolean;
  showVoltageOverlay: boolean;
  showFlowOverlay: boolean;
  autoLayoutOnOpen: boolean;
  cpfLambdaMax: number;
  cpfStepSize: number;
  opfUseAC: boolean;
  faultIncludeLineToGround: boolean;
  faultIncludeLineToLine: boolean;
  simEnd: number;
  simStep: number;
  simMethod: 'euler' | 'rk4' | 'trapezoidal';
  simFaultTime: number;
  simFaultDuration: number;
  theme: 'light' | 'dark';
}

export const SETTINGS_STORAGE_KEY = 'psat-web.settings.v1';

export const defaultSettings: AppSettings = {
  projectName: 'Untitled Project',
  baseMVA: 100,
  baseFreq: 50,
  method: 'Newton-Raphson',
  tolerance: 1e-6,
  maxIterations: 50,
  showSidebar: true,
  showProperties: true,
  showToolbar: true,
  showGrid: true,
  snapToGrid: true,
  showBusNames: true,
  showVoltageOverlay: true,
  showFlowOverlay: true,
  autoLayoutOnOpen: true,
  cpfLambdaMax: 5,
  cpfStepSize: 0.1,
  opfUseAC: false,
  faultIncludeLineToGround: true,
  faultIncludeLineToLine: false,
  simEnd: 5,
  simStep: 0.01,
  simMethod: 'rk4',
  simFaultTime: 1,
  simFaultDuration: 0.15,
  theme: 'light',
};

export function mergeSettings(partial: Partial<AppSettings> | null | undefined): AppSettings {
  if (!partial) return { ...defaultSettings };
  const merged = { ...defaultSettings };
  (Object.keys(defaultSettings) as (keyof AppSettings)[]).forEach(key => {
    const value = partial[key];
    if (value !== undefined && typeof value === typeof defaultSettings[key]) {
      (merged as Record<string, unknown>)[key] = value;
    }
  });
  return merged;
}

export function loadSettings(storage?: Pick<Storage, 'getItem'> | null): AppSettings {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return { ...defaultSettings };
  try {
    const raw = target.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    return mergeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings, storage?: Pick<Storage, 'setItem'> | null): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings simply do not persist.
  }
}
