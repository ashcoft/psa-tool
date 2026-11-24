import { describe, it, expect } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  loadSettings,
  mergeSettings,
  saveSettings,
} from './settings';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage())).toEqual(defaultSettings);
  });

  it('persists and restores settings', () => {
    const storage = memoryStorage();
    saveSettings({ ...defaultSettings, method: 'DC', cpfLambdaMax: 8 }, storage);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toContain('DC');
    const loaded = loadSettings(storage);
    expect(loaded.method).toBe('DC');
    expect(loaded.cpfLambdaMax).toBe(8);
  });

  it('merges partial settings and ignores wrong types', () => {
    const merged = mergeSettings({ method: 'DC', tolerance: 'bad' as unknown as number });
    expect(merged.method).toBe('DC');
    expect(merged.tolerance).toBe(defaultSettings.tolerance);
  });

  it('survives invalid stored JSON', () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, '{oops');
    expect(loadSettings(storage)).toEqual(defaultSettings);
  });
});
