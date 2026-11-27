# Third-party notices

The MIT license in [LICENSE](LICENSE) applies to the original code of
**Power System Analysis Tool (PSA)** authored for this repository.

## PSAT

This project is derived from **PSAT - Power System Analysis Toolbox** by Federico Milano, which is
free software under the GNU General Public License.

- The reference conversion in `psat-converted/` retains its upstream notices. Those files are marked
  `GPL-2.0+` in their headers.
- Code ported from PSAT remains under the upstream GPL terms. It is not relicensed by the MIT
  license.
- The application is a port of PSAT. To the extent a distributed build contains PSAT-derived code,
  the build as a whole must be distributed under the applicable GPL terms. The MIT license applies
  only to original code that can be separated from PSAT-derived code.

See the original PSAT project for the complete upstream license and attribution:
<https://faraday1.ucd.ie/psat.html>.

## Server tier dependencies

`services/api` is an optional deployment target and is not part of the static site. Its runtime
dependencies keep their own licenses, all compatible with distribution as long as their notices
travel with the container image:

| Package | License | Used for |
|---------|---------|----------|
| FastAPI | MIT | HTTP API and OpenAPI generation |
| Pydantic | MIT | Request and response models |
| Uvicorn | BSD-3-Clause | ASGI server |
| numpy | BSD-3-Clause | Numerical arrays |
| scipy | BSD-3-Clause | Sparse linear algebra and root finding |
| pandapower | BSD-3-Clause | AC/DC power flow and network model |
| SQLAlchemy | MIT | Catalogue schema and queries |
| psycopg | LGPL-3.0-or-later | PostgreSQL driver; dynamically linked, unmodified |
| PostgreSQL | PostgreSQL License | Equipment library database |

The container image built from `services/api/Dockerfile` includes these packages. If the image is
distributed, include their license texts; `pip install` places them in the image's
`site-packages/*.dist-info` directories.

## Equipment library data

Dataset `2026.11` in `services/api/psa_api/seed.py` encodes IEC 60228 conductor resistances,
IEC 60502 cable construction data, IEC 60255-151 and IEEE C37.112 curve constants, and indicative
ampacities. Standard constants are factual values from published standards; vendor cable tables and
relay manuals are usually copyrighted compilations and must not be added without permission. See
`services/catalog/README.md` for the provenance rules.
