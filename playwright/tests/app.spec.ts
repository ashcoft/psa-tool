import { test, expect, Page } from '@playwright/test';

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('titlebar')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
}

async function runLoadFlow(page: Page): Promise<void> {
  await page.getByTestId('toolbar').getByRole('button', { name: 'Run Load Flow' }).click();
  await expect(page.getByTestId('statusbar')).toContainText('Converged', { timeout: 15000 });
}

async function recordCanvasText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.fillText;
    const texts = new Set<string>();
    (window as Window & { __canvasText?: Set<string> }).__canvasText = texts;
    proto.fillText = function (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth?: number
    ) {
      texts.add(String(text));
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
}

async function canvasText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from((window as Window & { __canvasText?: Set<string> }).__canvasText ?? [])
  );
}

async function openResults(page: Page): Promise<void> {
  await page.getByTestId('toolbar').getByRole('button', { name: 'Results' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function dragVoltmeterToCanvas(page: Page, target = { x: 420, y: 280 }) {
  const sidebar = page.getByTestId('sidebar');
  const canvas = page.getByTestId('canvas').locator('canvas');
  await sidebar.getByRole('button', { name: 'Ins', exact: true }).click();
  await sidebar.getByRole('button', { name: 'Voltmeter' }).dragTo(canvas, { targetPosition: target });
  await expect(page.getByTestId('statusbar')).toContainText('Components: 1');
  return canvas;
}

async function addBusFromPalette(page: Page): Promise<void> {
  await page.getByTestId('sidebar').getByRole('button', { name: 'Bus', exact: true }).click();
  await expect(page.getByTestId('statusbar')).toContainText('Buses: 5');
}

async function chooseProjectAction(
  page: Page,
  action: 'Close' | 'New',
  response: 'accept' | 'dismiss'
): Promise<void> {
  page.once('dialog', dialog => (response === 'accept' ? dialog.accept() : dialog.dismiss()));
  await page.getByTestId('ribbon').getByRole('button', { name: action, exact: true }).click();
}

async function waitForCanvasReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="canvas"] canvas') as HTMLCanvasElement | null;
    return Boolean(canvas && canvas.width > 500 && canvas.height > 200);
  });
}

async function beginMarquee(page: Page): Promise<void> {
  await waitForCanvasReady(page);
  const canvas = page.getByTestId('canvas').locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 8 });
}

test.describe('Power System Analysis Tool workbench', () => {
  test('loads the ETAP-style workbench', async ({ page }) => {
    await openApp(page);
    await expect(page).toHaveTitle(/Power System/i);
    await expect(page.getByText('Power System Analysis Tool', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 4');
    await expect(page.getByTestId('statusbar')).toContainText('Base: 100 MVA');
  });

  test('draws load flow results on the diagram and opens the results dialog on demand', async ({ page }) => {
    await recordCanvasText(page);
    await openApp(page);
    await runLoadFlow(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('statusbar')).toContainText('Converged in 4 iterations');
    await expect.poll(() => canvasText(page)).toEqual(
      expect.arrayContaining(['1.000 pu', '1.050 pu', '69.8 MW', '124.0 MW'])
    );

    await openResults(page);
    await page.getByRole('button', { name: 'Bus Results' }).click();
    await expect(page.getByText('V (pu)')).toBeVisible();

    await page.getByRole('button', { name: 'Voltage Profile' }).click();
    await expect(page.locator('svg[role="img"]').first()).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('statusbar')).toContainText('Converged in 4 iterations');
  });

  test('selects all workspace elements and deletes them', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+A');
    await expect(page.getByTestId('statusbar')).toContainText('Selected: 11');

    await page.keyboard.press('Delete');
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 0');
    await expect(page.getByTestId('statusbar')).toContainText('Selected: 0');
  });

  test('properties Delete removes only the primary element', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+A');
    const status = page.getByTestId('statusbar');
    await expect(status).toContainText('Selected: 11');

    await page.getByTestId('properties-panel').getByRole('button', { name: 'Delete' }).click();
    await expect(status).toContainText('Buses: 4');
    await expect(status).toContainText('Loads: 1');
    await expect(status).toContainText('Selected: 0');
  });

  test('window-selects elements with a marquee', async ({ page }) => {
    await openApp(page);
    await beginMarquee(page);
    await page.mouse.up();
    await expect(page.getByTestId('statusbar')).toContainText('Selected: 11');
  });

  test('cancels a marquee with Escape', async ({ page }) => {
    await openApp(page);
    await beginMarquee(page);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByTestId('statusbar')).toContainText('Selected: 0');
  });

  test('adds a bus, undoes and redoes the change', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('sidebar').getByRole('button', { name: 'Bus', exact: true }).click();
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 5');

    await page.getByTestId('ribbon').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 4');

    await page.getByTestId('ribbon').getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 5');
  });

  test('closes the project with an unsaved-changes reminder', async ({ page }) => {
    await openApp(page);
    const status = page.getByTestId('statusbar');
    await addBusFromPalette(page);

    await chooseProjectAction(page, 'Close', 'dismiss');
    await expect(status).toContainText('Buses: 5');

    await chooseProjectAction(page, 'Close', 'accept');
    await expect(status).toContainText('Buses: 0');
    await expect(page.getByRole('status')).toContainText('Project closed');
  });

  test('reminds before creating a new project over unsaved changes', async ({ page }) => {
    await openApp(page);
    const status = page.getByTestId('statusbar');
    await addBusFromPalette(page);

    await chooseProjectAction(page, 'New', 'dismiss');
    await expect(status).toContainText('Buses: 5');

    await chooseProjectAction(page, 'New', 'accept');
    await expect(status).toContainText('Buses: 0');
  });

  test('loads the IEEE 9-bus sample', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('ribbon').getByRole('button', { name: 'Samples' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Sample Systems')).toBeVisible();
    await dialog.getByRole('button', { name: 'Load' }).nth(1).click();
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 9');
    await expect(page.getByTestId('statusbar')).toContainText('Generators: 3');
  });

  test('opens and saves study options', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('ribbon').getByRole('button', { name: 'Options' }).click();
    await expect(page.getByText('Study & Application Options')).toBeVisible();
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.getByText('Study & Application Options')).toHaveCount(0);
  });

  test('exports the project as JSON and reopens it', async ({ page }) => {
    await openApp(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('titlebar').getByTitle('Save (Ctrl+S)').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.psa$/);

    const path = `/tmp/psat-e2e-${Date.now()}.psa`;
    await download.saveAs(path);

    await page.locator('input[type="file"]').setInputFiles(path);
    await expect(page.getByTestId('statusbar')).toContainText('Buses: 4');
    await expect(page.getByTestId('titlebar')).toContainText('Demo 4-Bus System');
  });

  test('shows short-circuit kA values on the diagram and opens results on demand', async ({ page }) => {
    await recordCanvasText(page);
    await openApp(page);
    await page.getByTestId('toolbar').getByRole('button', { name: 'Short Circuit' }).click();
    await expect(page.getByTestId('statusbar')).toContainText('Max fault current', { timeout: 15000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => canvasText(page)).toEqual(
      expect.arrayContaining(['7.70 kA', '8.09 kA'])
    );

    await openResults(page);
    await expect(page.getByRole('dialog').getByText('Short Circuit Study', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Fault Currents' }).click();
    await expect(page.getByText('I (kA)')).toBeVisible();
    await expect(page.getByText('Three-phase').first()).toBeVisible();
  });

  test('generates a report from the last study', async ({ page }) => {
    await openApp(page);
    await runLoadFlow(page);
    await page.getByRole('tab', { name: 'Results' }).click();
    await page.getByTestId('ribbon').getByRole('button', { name: 'Report' }).click();
    await expect(page.getByText('Study Report')).toBeVisible();
    await expect(page.getByRole('button', { name: 'HTML' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  });

  test('shows and hides the menu bar', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('menubar')).toBeVisible();

    await page.getByRole('button', { name: 'Hide menu bar' }).click();
    await expect(page.getByTestId('menubar')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('menubar')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show menu bar' }).click();
    await expect(page.getByTestId('menubar')).toBeVisible();

    await page.getByTestId('ribbon').getByRole('button', { name: 'Options' }).click();
    await page.keyboard.press('Control+Shift+M');
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.getByTestId('menubar')).toBeVisible();
  });

  test('menu bar opens the matching ribbon tab and stays in sync', async ({ page }) => {
    await openApp(page);
    const menubar = page.getByTestId('menubar');

    await menubar.getByRole('button', { name: 'Analysis' }).click();
    await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true');
    await expect(menubar.getByRole('button', { name: 'Analysis' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('tab', { name: 'Results' }).click();
    await expect(menubar.getByRole('button', { name: 'Results' })).toHaveAttribute('aria-current', 'page');
    await expect(menubar.getByRole('button', { name: 'Analysis' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('shows the keyboard shortcuts dialog', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByTestId('ribbon').getByRole('button', { name: 'Shortcuts' }).click();
    await expect(page.getByText('Ctrl + N')).toBeVisible();
  });

  test('links to the GitHub repository from the About dialog', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByTestId('ribbon').getByRole('button', { name: 'About' }).click();
    const link = page.getByRole('link', { name: 'github.com/ashcoft/psa-tool' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://github.com/ashcoft/psa-tool');
  });

  test('adds DC, instrument and control components from the catalog', async ({ page }) => {
    await openApp(page);
    const sidebar = page.getByTestId('sidebar');
    const status = page.getByTestId('statusbar');

    await sidebar.getByRole('button', { name: 'DC', exact: true }).click();
    await sidebar.getByRole('button', { name: 'DC Bus' }).click();
    await expect(status).toContainText('Components: 1');

    await sidebar.getByRole('button', { name: 'Ins', exact: true }).click();
    await sidebar.getByRole('button', { name: 'Voltmeter' }).click();
    await expect(status).toContainText('Components: 2');

    await sidebar.getByRole('button', { name: 'CS', exact: true }).click();
    await sidebar.getByRole('button', { name: /Automatic Voltage Regulator/ }).click();
    await expect(status).toContainText('Components: 3');

    await sidebar.getByRole('button', { name: 'Project' }).click();
    await expect(sidebar.getByText('DC Bus')).toBeVisible();
    await expect(sidebar.getByText('Voltmeter')).toBeVisible();
  });

  test('drags a component from the palette onto the diagram', async ({ page }) => {
    await openApp(page);
    await dragVoltmeterToCanvas(page);
    await expect(page.getByRole('status')).toContainText('Added Voltmeter');
  });

  test('opens the properties pane when a component is selected on the diagram', async ({ page }) => {
    await openApp(page);
    const panel = page.getByTestId('properties-panel');

    await page.keyboard.press('Control+Shift+B');
    await expect(panel).toBeHidden();

    const canvas = await dragVoltmeterToCanvas(page);
    await expect(panel).toBeHidden();

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas is not visible');
    await page.mouse.click(box.x + 420, box.y + 280);
    await expect(panel).toBeVisible();
  });

  test('repositions a placed component and undoes the move', async ({ page }) => {
    await openApp(page);
    const canvas = await dragVoltmeterToCanvas(page);

    const panel = page.getByTestId('properties-panel');
    const xInput = panel.locator('label').filter({ hasText: /^X$/ }).locator('input');
    const before = Number(await xInput.inputValue());

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas is not visible');
    const startX = box.x + 420;
    const startY = box.y + 280;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => Number(await xInput.inputValue())).not.toBe(before);

    await page.getByTestId('ribbon').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('statusbar')).toContainText('Components: 1');

    await page.mouse.click(startX, startY);
    await expect(xInput).toBeVisible();
    expect(Number(await xInput.inputValue())).toBe(before);
  });

  test('runs every analysis study', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Analysis' }).click();
    const dialog = page.getByRole('dialog');

    const studies: { button: string; title: string }[] = [
      { button: 'Continuation PF', title: 'Continuation Power Flow' },
      { button: 'Optimal PF', title: 'DC Optimal Power Flow' },
      { button: 'Stability', title: 'Small-Signal Stability' },
      { button: 'Time Domain', title: 'Time-Domain Simulation' },
    ];

    for (const study of studies) {
      await page.getByTestId('ribbon').getByRole('button', { name: study.button }).click();
      await expect(page.getByTestId('output-window')).toContainText(`${study.title}: `, { timeout: 20000 });
      await expect(dialog).toHaveCount(0);
      await openResults(page);
      await expect(dialog.getByText(study.title, { exact: true }).last()).toBeVisible();
      await expect(dialog.getByText('COMPLETED')).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  });

  test('selects and edits a bus from the project tree', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('sidebar').getByRole('button', { name: 'Project' }).click();
    await page.getByTestId('sidebar').getByRole('button', { name: /PQ1/ }).click();
    const panel = page.getByTestId('properties-panel');
    const nameInput = panel.locator('input').first();
    await expect(nameInput).toHaveValue('PQ1');
    await nameInput.fill('Main Load');
    await expect(nameInput).toHaveValue('Main Load');
  });

  test('adds a generator from the Components ribbon', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Components' }).click();
    await page.getByTestId('ribbon').getByRole('button', { name: 'Generator' }).click();
    await expect(page.getByTestId('statusbar')).toContainText('Generators: 3');
  });

  test('persists the load-flow method across reloads', async ({ page }) => {
    await openApp(page);
    const method = page.getByLabel('Power flow method');
    await method.selectOption('DC');
    await page.waitForFunction(() => (localStorage.getItem('psat-web.settings.v1') ?? '').includes('DC'));
    await page.reload();
    await expect(page.getByLabel('Power flow method')).toHaveValue('DC');
  });

  test('exports study results as CSV', async ({ page }) => {
    await openApp(page);
    await runLoadFlow(page);
    await openResults(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export CSV/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('runs specialty studies from the Tools tab', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByTestId('ribbon').getByRole('button', { name: 'Arc Flash' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Specialty Studies')).toBeVisible();
    await dialog.getByRole('button', { name: 'Calculate' }).click();
    await expect(dialog.getByText('Incident energy', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Ground Grid' }).click();
    await dialog.getByRole('button', { name: 'Design Grid' }).click();
    await expect(dialog.getByText('Grid resistance')).toBeVisible();
  });

  test('does not log console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openApp(page);
    await page.waitForTimeout(500);
    expect(errors.filter(error => !error.includes('favicon') && !error.includes('hydration'))).toEqual([]);
  });
});

test.describe('Responsive layout', () => {
  test('works on a tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openApp(page);
    await expect(page.getByTestId('statusbar')).toBeVisible();
  });

  test('works on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await expect(page.getByTestId('titlebar')).toBeVisible();
  });

  test('opens the component palette on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await page.getByTestId('mobile-components-toggle').click();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('sidebar').getByRole('button', { name: 'Bus', exact: true })).toBeVisible();
  });
});
