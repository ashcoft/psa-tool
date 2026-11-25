import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef } from 'react';
import HomePage from './page';

vi.mock('@/components/Canvas', () => ({
  default: forwardRef(function MockCanvas(_props: unknown, _ref: unknown) {
    return <div data-testid="canvas">Canvas</div>;
  }),
}));

describe('Power System Analysis Tool application shell', () => {
  it('renders the ETAP-style workbench', () => {
    render(<HomePage />);
    expect(screen.getByTestId('titlebar')).toBeInTheDocument();
    expect(screen.getByTestId('ribbon')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
    expect(screen.getByTestId('output-window')).toBeInTheDocument();
    expect(screen.getByTestId('statusbar')).toBeInTheDocument();
  });

  it('shows the project name and ribbon tabs', () => {
    render(<HomePage />);
    expect(screen.getByText('Power System Analysis Tool')).toBeInTheDocument();
    expect(screen.getByText('Demo 4-Bus System')).toBeInTheDocument();
    ['Home', 'Components', 'Analysis', 'Results', 'Tools'].forEach(tab => {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    });
  });

  it('shows system summary in the status bar', () => {
    render(<HomePage />);
    expect(screen.getByText('Buses: 4')).toBeInTheDocument();
    expect(screen.getByText('Lines: 3')).toBeInTheDocument();
    expect(screen.getByText('Transformers: 0')).toBeInTheDocument();
    expect(screen.getByText('Loads: 2')).toBeInTheDocument();
    expect(screen.getByText('Generators: 2')).toBeInTheDocument();
    expect(screen.getByText('Base: 100 MVA')).toBeInTheDocument();
    expect(screen.getByText('Frequency: 50 Hz')).toBeInTheDocument();
  });

  it('adds a bus from the component palette', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Bus' }));
    expect(screen.getByText('Buses: 5')).toBeInTheDocument();
  });

  it('adds a specialty component from the catalog', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'DC' }));
    await user.click(screen.getByRole('button', { name: 'DC Bus' }));
    expect(screen.getByText('Components: 1')).toBeInTheDocument();
  });

  it('runs a load flow and opens the results dialog', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    const runButtons = screen.getAllByRole('button', { name: /Run Load Flow/i });
    await user.click(runButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Study Results')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bus Results' })).toBeInTheDocument();
  });

  it('opens the options dialog', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: /^Options$/i }));
    expect(screen.getByText('Study & Application Options')).toBeInTheDocument();
  });
});
