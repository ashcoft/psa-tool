import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef } from 'react';
import HomePage from './page';

vi.mock('@/components/Canvas', () => ({
  default: forwardRef(function MockCanvas(_props: unknown, _ref: unknown) {
    return <div data-testid="canvas">Canvas</div>;
  }),
}));

describe('Power System Analysis Tool application shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  });

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

  it('runs a load flow and opens the results dialog on demand', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    const runButtons = screen.getAllByRole('button', { name: /Run Load Flow/i });
    await user.click(runButtons[0]);
    await waitFor(() => {
      expect(screen.queryByText('Study Results')).not.toBeInTheDocument();
      expect(within(screen.getByTestId('statusbar')).getByText(/Converged in 4 iterations/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    await user.click(within(screen.getByTestId('toolbar')).getByRole('button', { name: 'Results' }));
    expect(screen.getByText('Study Results')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bus Results' })).toBeInTheDocument();
  });

  it('opens the options dialog', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: /^Options$/i }));
    expect(screen.getByText('Study & Application Options')).toBeInTheDocument();
  });

  // Tailwind media queries are not applied in jsdom, so these assertions check the
  // responsive class token that controls each pane instead of computed visibility.
  it('collapses and restores the panes and toolbar', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('md:flex');
    await user.click(within(sidebar).getByRole('button', { name: 'Hide left pane' }));
    expect(screen.getByTestId('sidebar').className).not.toContain('md:flex');

    const properties = screen.getByTestId('properties-panel');
    expect(properties.className).toContain('lg:flex');
    await user.click(within(properties).getByRole('button', { name: 'Hide right pane' }));
    expect(screen.getByTestId('properties-panel').className).not.toContain('lg:flex');

    await user.click(within(screen.getByTestId('toolbar')).getByRole('button', { name: 'Hide toolbar' }));
    const collapsed = screen.getByTestId('toolbar');
    expect(within(collapsed).getByRole('button', { name: 'Toolbar' })).toBeInTheDocument();
    await user.click(within(collapsed).getByRole('button', { name: 'Toolbar' }));
    expect(within(screen.getByTestId('toolbar')).getByRole('button', { name: 'Hide toolbar' })).toBeInTheDocument();
  });

  it('closes the mobile left drawer from its header', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    const user = userEvent.setup();
    render(<HomePage />);

    const classes = () => screen.getByTestId('sidebar').className.split(/\s+/);
    expect(classes()).not.toContain('max-md:flex');
    await user.click(screen.getByTestId('mobile-components-toggle'));
    expect(classes()).toContain('max-md:flex');
    await user.click(within(screen.getByTestId('sidebar')).getByRole('button', { name: 'Hide left pane' }));
    expect(classes()).not.toContain('max-md:flex');
  });

  it('opens the right pane as a drawer on narrow screens', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    const user = userEvent.setup();
    render(<HomePage />);

    const classes = () => screen.getByTestId('properties-panel').className.split(/\s+/);
    expect(classes()).not.toContain('max-lg:flex');
    await user.click(screen.getByRole('button', { name: 'Right Pane' }));
    expect(classes()).toContain('max-lg:flex');
    await user.click(within(screen.getByTestId('properties-panel')).getByRole('button', { name: 'Hide right pane' }));
    expect(classes()).not.toContain('max-lg:flex');
  });

  it('shows the right pane when Properties is requested', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    const sidebar = screen.getByTestId('sidebar');
    await user.click(within(screen.getByTestId('properties-panel')).getByRole('button', { name: 'Hide right pane' }));
    expect(screen.getByTestId('properties-panel').className).not.toContain('lg:flex');

    await user.click(within(sidebar).getByRole('button', { name: 'Project' }));
    await user.click(within(sidebar).getByRole('button', { name: /^Slack/ }));
    await user.click(screen.getByRole('tab', { name: 'Components' }));
    await user.click(screen.getByRole('button', { name: 'Properties' }));
    expect(screen.getByTestId('properties-panel').className).toContain('lg:flex');

    await user.click(screen.getByRole('button', { name: 'Properties' }));
    expect(screen.getByTestId('properties-panel').className).toContain('lg:flex');
  });
});
