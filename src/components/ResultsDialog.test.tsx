import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsDialog from './ResultsDialog';
import { runStudy } from '@/lib/studies';
import { defaultSettings } from '@/lib/settings';
import { buildDemoSystem } from '@/lib/samples';

const system = buildDemoSystem();
const run = runStudy('powerflow', system, defaultSettings);

function renderDialog(overrides: Partial<React.ComponentProps<typeof ResultsDialog>> = {}) {
  const props = {
    runs: [run],
    activeRunId: run.id,
    system,
    onSelectRun: vi.fn(),
    onClose: vi.fn(),
    onExportCSV: vi.fn(),
    onReport: vi.fn(),
    onClearResults: vi.fn(),
    ...overrides,
  };
  render(<ResultsDialog {...props} />);
  return props;
}

describe('ResultsDialog', () => {
  it('renders the completed load flow summary and tables', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByText('Study Results')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getAllByText(/Converged in 4 iterations/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Branch Flows' }));
    expect(screen.getByText('P loss (MW)')).toBeInTheDocument();
  });

  it('shows the voltage profile chart', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Voltage Profile' }));
    expect(screen.getByRole('img', { name: /Voltage/ })).toBeInTheDocument();
  });

  it('reports violations for overloaded branches', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Violations' }));
    expect(screen.getByText(/L12 overloaded/)).toBeInTheDocument();
  });

  it('delegates export, report and close actions', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(props.onExportCSV).toHaveBeenCalledWith(run);
    await user.click(screen.getByRole('button', { name: /^Report$/ }));
    expect(props.onReport).toHaveBeenCalledWith(run);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('handles an empty result history', () => {
    renderDialog({ runs: [], activeRunId: null });
    expect(screen.getByText('No study results available')).toBeInTheDocument();
  });
});
