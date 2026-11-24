import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropertiesPanel from './PropertiesPanel';
import { buildDemoSystem } from '@/lib/samples';
import { validateSystem } from '@/lib/project';

const system = buildDemoSystem();
const issues = validateSystem(system);

function renderPanel(overrides: Partial<React.ComponentProps<typeof PropertiesPanel>> = {}) {
  const props = {
    system,
    selection: { type: 'bus' as const, id: '3' },
    results: null,
    issues,
    onChange: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onMetaChange: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<PropertiesPanel {...props} />);
  return props;
}

describe('PropertiesPanel', () => {
  it('shows the selected bus and its results section', () => {
    renderPanel({
      results: {
        converged: true,
        iterations: 4,
        maxMismatch: 1e-10,
        losses: { real: 1, imag: 2 },
        busResults: [
          { bus: '3', v: 1.0049, angle: -5.29, pg: 0, qg: 0, pl: 70, ql: 30, qshunt: 0 },
        ],
        lineResults: [],
        generatorResults: [],
        elapsedTime: 1,
        method: 'Newton-Raphson',
      },
    });
    expect(screen.getByDisplayValue('PQ1')).toBeInTheDocument();
    expect(screen.getByText('1.0049 pu')).toBeInTheDocument();
  });

  it('commits edited values after a short delay', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const nameInput = screen.getByDisplayValue('PQ1');
    await user.clear(nameInput);
    await user.type(nameInput, 'Main Load');
    await waitFor(() => expect(props.onChange).toHaveBeenCalled(), { timeout: 2000 });
    const onChange = props.onChange as unknown as Mock;
    const [kind, element] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(kind).toBe('bus');
    expect(element.name).toBe('Main Load');
  });

  it('triggers delete and duplicate actions', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.click(screen.getByRole('button', { name: /Duplicate/i }));
    expect(props.onDuplicate).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Delete/i }));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('shows the project summary when nothing is selected', () => {
    renderPanel({ selection: { type: null, id: null } });
    expect(screen.getByText('System Summary')).toBeInTheDocument();
    expect(screen.getByText('Total load')).toBeInTheDocument();
    expect(screen.getByText(/Model Check/)).toBeInTheDocument();
    expect(screen.getByText('No problems detected')).toBeInTheDocument();
  });
});
