import { describe, it, expect } from 'vitest';
import { runStudy } from './studies';
import { defaultSettings } from './settings';
import { buildDemoSystem } from './samples';
import { studyReport, studyTables, studyToCSV, tableToCSV } from './results-export';

const system = buildDemoSystem();
const settings = { ...defaultSettings };
const powerFlow = runStudy('powerflow', system, settings);

describe('results export', () => {
  it('builds bus, branch and generator tables', () => {
    const tables = studyTables(powerFlow, system);
    expect(tables.map(table => table.title)).toEqual(['Bus Results', 'Branch Flows', 'Generator Results']);
    expect(tables[0].headers).toContain('V (pu)');
    expect(tables[0].rows).toHaveLength(4);
    expect(tables[1].rows).toHaveLength(3);
    expect(tables[0].rows[0][0]).toBe('1');
  });

  it('escapes CSV fields', () => {
    const csv = tableToCSV({ title: 'T', headers: ['A', 'B'], rows: [['x,y', 'say "hi"']] });
    expect(csv).toBe('A,B\n"x,y","say ""hi"""');
  });

  it('exports a full study CSV with metadata', () => {
    const csv = studyToCSV(powerFlow, system);
    expect(csv).toContain('# Load Flow');
    expect(csv).toContain('# Bus Results');
    expect(csv).toContain('Converged in');
    expect(csv.split('\n').length).toBeGreaterThan(10);
  });

  it('creates report sections for each study kind', () => {
    const kinds = ['powerflow', 'cpf', 'opf', 'fault', 'stability', 'timeseries'] as const;
    kinds.forEach(kind => {
      const run = runStudy(kind, system, settings);
      const sections = studyReport(run, system);
      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0].title).toBeTruthy();
    });
  });
});
