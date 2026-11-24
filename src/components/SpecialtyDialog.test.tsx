import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpecialtyDialog from './SpecialtyDialog';
import { buildDemoSystem } from '@/lib/samples';

const system = buildDemoSystem();

describe('SpecialtyDialog', () => {
  it('calculates an arc-flash screening result', async () => {
    const user = userEvent.setup();
    render(<SpecialtyDialog system={system} onClose={vi.fn()} />);
    expect(screen.getByText('Specialty Studies')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(screen.getAllByText(/cal\/cm²/).length).toBeGreaterThan(0);
    expect(screen.getByText(/PPE category/i)).toBeInTheDocument();
  });

  it('estimates motor starting voltage dip', async () => {
    const user = userEvent.setup();
    render(<SpecialtyDialog system={system} onClose={vi.fn()} initialTab="motor" />);
    await user.click(screen.getByRole('button', { name: 'Start Motor' }));
    expect(screen.getAllByText('Terminal voltage').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Voltage dip/).length).toBeGreaterThan(0);
  });

  it('computes harmonic distortion', async () => {
    const user = userEvent.setup();
    render(<SpecialtyDialog system={system} onClose={vi.fn()} initialTab="harmonics" />);
    await user.click(screen.getByRole('button', { name: 'Analyse' }));
    expect(screen.getByText('Worst THD')).toBeInTheDocument();
    expect(screen.getByText('IEEE 519 limit')).toBeInTheDocument();
  });

  it('builds relay time-current curves', async () => {
    const user = userEvent.setup();
    render(<SpecialtyDialog system={system} onClose={vi.fn()} initialTab="protection" />);
    await user.click(screen.getByRole('button', { name: 'Build TCC' }));
    expect(screen.getByText('t@2x')).toBeInTheDocument();
    expect(screen.getByText(/Coordination margin/)).toBeInTheDocument();
  });

  it('designs a ground grid', async () => {
    const user = userEvent.setup();
    render(<SpecialtyDialog system={system} onClose={vi.fn()} initialTab="groundgrid" />);
    await user.click(screen.getByRole('button', { name: 'Design Grid' }));
    expect(screen.getByText('Grid resistance')).toBeInTheDocument();
    expect(screen.getByText('Touch / mesh voltage')).toBeInTheDocument();
  });
});
