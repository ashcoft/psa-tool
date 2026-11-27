# Equipment library

Cable and relay data behind the optional server tier. The catalogue is served by
`services/api` from PostgreSQL, with SQLite as the zero-configuration fallback.

## Data model

| Table | Contents |
|-------|----------|
| `dataset_version` | published version id, date, source and notes |
| `cable_family` | standard, voltage class, conductor, insulation, core count |
| `cable_size` | size, R at 20 °C, X, C, duct and direct-buried ampacity |
| `relay_curve` | IEC/IEEE inverse-time constants (`k`, `alpha`) |
| `relay_model` | manufacturer, model, standard, protection functions, supported curves |

Every row carries `dataset_version`. A project should pin the version it was
solved against so ampacity, impedance and curve values stay reproducible.

## Seed dataset `2026.11`

- Conductor resistances are IEC 60228 class 2 maxima at 20 °C.
- Cable construction follows IEC 60502-1 (0.6/1 kV) and IEC 60502-2 (6/10 kV).
- Curve constants are IEC 60255-151 and IEEE C37.112, and match
  `src/lib/protection.ts` so the client calculator and the catalogue agree.
- Ampacities are indicative for XLPE cable at 30 °C ambient without grouping.
  They are screening values, not a sizing basis.
- Relay records are generic reference records. Vendor libraries need permission
  or a documented import path before they can ship.

## Adding or replacing data

Edit `services/api/psa_api/seed.py`, publish a new dataset id, and update the
client fixture expectations in `services/api/tests/test_catalog.py`. Seeding is
idempotent and only runs when `dataset_version` is empty; for an existing
database, publish the new version and retire the old rows rather than editing
them in place.

## Licensing

IEC and IEEE curve formulas are standards constants and can be encoded. Cable
tables from manufacturers and vendor relay manuals are usually copyrighted
compilations; do not paste them into the repository without permission.
