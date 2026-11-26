# Power System Analysis Tool (PSA) user guide

Power System Analysis Tool (PSA) is a browser-based power system analysis workbench. It keeps the whole project in the
browser: no account, no server-side database, no upload.

## 1. Start a project

- The app opens with the **Demo 4-Bus System**.
- Use **Tools → Samples** to load the IEEE 9-bus, IEEE 14-bus or distribution feeder cases.
- **Home → New** starts an empty project.
- **Home → Open** loads a `.psa` project saved by Power System Analysis Tool. Legacy `.json` projects still open.
- **Home → Close** clears the workspace. New, open and close ask before discarding unsaved changes.

The status bar shows the element counts, base MVA, frequency and the last study result.

### Show or hide workspace panes

The left component pane, the right property pane and the toolbar can each be hidden to give the
diagram more room. Use the collapse button in a pane header, the **View** group of the **Home**
ribbon tab, or `Ctrl + B`, `Ctrl + Shift + B` and `Ctrl + Shift + T`. The toolbar collapses to a thin strip, like the output
bar, and the choice is remembered in settings.

The palette shows compact, colour-coded symbols without text labels. Hover a symbol to see its
name and description. On touch screens, where hover is unavailable, the names are shown under the
symbols.

On narrow screens the left pane opens as a drawer from the **Components** button, and the right
pane opens as an overlay when toggled. Both start closed so the diagram keeps the full width.

## 2. Build a one-line diagram

### Add a bus

- Drag a bus from the **Components** palette onto the diagram, or
- click a bus entry in the palette to place it at the next free position, or
- use **Components → Slack Bus / PV Bus / PQ Bus**.

### Add a branch

1. Select **Components → Line** or **Transformer** (or the matching palette entry).
2. Click the first bus, then the second bus.
3. Press **Esc** to cancel the connection.

Lines and transformers can also be added by dragging the palette entry onto the diagram, which
starts the two-click connection tool.

### Add a device

- Generators, loads and shunts attach to a bus. Select a bus first and use the ribbon, or drag the
  device from the palette near the target bus.
- Dropping a device more than 1.5 grid units away from every bus creates a new bus at the drop
  point and attaches the device there.
- Specialty components (meters, relays, AVR, DC elements and so on) are stored as generic
  components. If a component needs a bus, drop it near one; otherwise it stays free-standing.

### Reposition anything

- Drag any bus or non-branch generic component to move it.
- **Hold Alt while dragging** to bypass grid snap for fine placement.
- The property panel **X** and **Y** fields accept exact grid coordinates.
- **Components → Auto Arrange** lays buses out by network depth from the slack bus and moves
  bus-attached components beside their bus.
- Pan with the middle mouse button or the **Pan** tool; zoom with the wheel, **Ctrl + +** and
  **Ctrl + -**; fit with **Ctrl + 0**.

### Select, edit and delete

- Click an element on the diagram or in the **Project** tree.
- Selecting an element on the diagram opens the right-hand **Properties** panel when it is hidden.
- **Ctrl + click** or **Shift + click** adds or removes an element from the selection.
- **Ctrl + A** selects every bus, branch, device and specialty component in the workspace.
- Drag on empty canvas to draw a selection marquee: left-to-right selects fully enclosed elements,
  right-to-left selects crossing elements.
- Selected buses and non-branch specialty components move together when you drag one of them;
  branches stay anchored to their bus endpoints.
- The right-hand **Properties** panel edits the primary (last selected) element.
- **Ctrl + C / Ctrl + V / Ctrl + X / Ctrl + D** copy, paste, cut and duplicate the primary element.
- **Delete** removes the whole workspace selection. The Properties panel **Delete** button removes only
  the displayed primary element. **Ctrl + Z / Ctrl + Y** undo and redo, including moves.
- **Esc** clears the selection and cancels the current tool.

## 3. Run a study

| Study | Where | Shortcut |
|-------|-------|----------|
| Load flow | Home or Analysis | F5 |
| Continuation power flow | Analysis | F6 |
| Short circuit | Home or Analysis | F7 |
| Optimal power flow | Analysis | F8 |
| Time-domain simulation | Home or Analysis | F9 |
| Small-signal stability | Analysis | — |
| Arc flash, motor start, harmonics, protection, ground grid | Tools | — |

The study options dialog controls the power-flow method, tolerance, iteration limit, CPF range,
OPF mode, fault options and simulation window.

If the model check finds an error, the study is blocked and the validation dialog opens. Warnings
do not block a study.

## 4. Read the results

When a study finishes, its key values are drawn on the one-line diagram:

- **Load flow** – bus voltage in pu at each busbar and the branch flow in MW with an arrow that
  points in the direction of the power flow. Branch colour shows the loading level.
- **Short circuit** – three-phase fault current in kA at each busbar.
- Other studies have no diagram overlay. Completing one clears the annotations from the previous
  study and reports through the status bar and output window.

Annotations belong to the model that produced them: editing the system, or undoing an edit, hides
them until you run the study again.

The results dialog does not open on its own. Use **Results** (`F10`) for the tables and charts, or
**Report** for a report of the active study.

The results dialog keeps a study-case history for the session. Each case has:

- **Summary** – study log, status and the first result tables.
- **Tables** – buses, branches, generators, modes, fault currents, protective devices and so on.
- **Charts** – voltage profile, PV curve, dispatch, fault-current bars, eigenvalue scatter and
  time-domain traces.
- **Violations** – voltage-limit and branch-loading warnings for load flow.

Use **Export CSV** for the active study, **Report** for an HTML/CSV/JSON report, and **Print** for
the browser print dialog. **Clear All** removes the session history.

## 5. Specialty studies

Open **Tools** and choose a calculator:

- **Arc Flash** – Lee screening model with incident energy, boundary and PPE category.
- **Motor Start** – locked-rotor current, terminal voltage and voltage dip at a selected bus.
- **Harmonics** – harmonic voltage distortion and IEEE 519 screening for a current spectrum.
- **Protection** – IEC/IEEE inverse-time curves, trip times and coordination margin.
- **Ground Grid** – IEEE 80 conductor sizing, GPR, touch and step voltages.

These are screening calculations. Check the notes in each result before using the numbers for
design.

## 6. Save and share

- **Ctrl + S** downloads the project as a `.psa` file.
- **Save As** chooses a new project name.
- **Export** in the Home tab downloads the same `.psa` project.
- The `.psa` file contains the system model, generic components and project name as JSON. Study
  results are not saved.

## 7. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` / `Ctrl + O` / `Ctrl + S` | New / open / save |
| `Ctrl + Z` / `Ctrl + Y` | Undo / redo |
| `Ctrl + A` | Select all workspace elements |
| `Ctrl + C` / `Ctrl + V` / `Ctrl + X` / `Ctrl + D` | Copy / paste / cut / duplicate |
| `Delete` | Delete selection |
| `F5` / `F6` / `F7` / `F8` / `F9` / `F10` | Load flow / CPF / short circuit / OPF / time domain / results |
| `Ctrl + 0` | Fit diagram |
| `Ctrl + +` / `Ctrl + -` | Zoom in / out |
| `Ctrl + B` | Show or hide the left pane |
| `Ctrl + Shift + B` | Show or hide the right pane |
| `Ctrl + Shift + T` | Show or hide the toolbar |
| `Ctrl + Shift + M` | Show or hide the menu bar |
| `Esc` | Cancel tool or connection, clear selection or close a dialog |

## 8. Troubleshooting

- **Load flow does not converge** – check that one bus is slack, the network is connected, and
  generation is not far below load. Use **Check Model**.
- **A device is not where I dropped it** – the device attached to a nearby bus. Drop it farther
  away to create a new bus, or change its **Bus** field in the property panel.
- **A component has no effect on results** – generic DC, instrument and control components are
  diagram metadata. Only buses, lines, transformers, generators, loads and shunts enter the
  electrical solvers.
- **Results disappeared** – study history is session-only. Export or report the cases you need
  before reloading.
