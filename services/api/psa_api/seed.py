"""Seed data for the equipment library.

Numbers are screening values, not a vendor library. Conductor resistances are
the IEC 60228 class 2 maxima at 20 °C; curve constants match
``src/lib/protection.ts`` so the client calculator and the catalog agree.
Ampacities are indicative for XLPE cable in air/duct at 30 °C ambient and must
be replaced by the installation-specific value before any sizing decision.
"""

from __future__ import annotations

DATASET = {
    "id": "2026.11",
    "published_at": "2026-11-26",
    "source": (
        "IEC 60228 class 2 conductor resistance; IEC 60502-1/-2 cable construction; "
        "IEC 60255-151 and IEEE C37.112 inverse-time constants; indicative XLPE ampacity"
    ),
    "notes": (
        "Screening dataset. Ampacity depends on installation, grouping, ambient "
        "temperature and soil; replace with the project value before sizing."
    ),
}

FAMILIES = [
    {
        "id": "xlpe-cu-lv",
        "standard": "IEC 60502-1",
        "voltage_class_kv": 1.0,
        "conductor": "Cu",
        "insulation": "XLPE",
        "cores": 4,
    },
    {
        "id": "xlpe-cu-mv",
        "standard": "IEC 60502-2",
        "voltage_class_kv": 10.0,
        "conductor": "Cu",
        "insulation": "XLPE",
        "cores": 3,
    },
]

# (size_mm2, r_ohm_per_km at 20 C, x_ohm_per_km, c_uf_per_km, ampacity duct A, ampacity direct A)
_SIZES_LV = [
    (16, 1.150, 0.080, 0.25, 68, 82),
    (35, 0.524, 0.080, 0.25, 125, 152),
    (70, 0.268, 0.080, 0.25, 190, 228),
    (120, 0.153, 0.080, 0.25, 260, 310),
    (185, 0.0991, 0.080, 0.25, 335, 395),
    (240, 0.0754, 0.080, 0.25, 390, 455),
    (300, 0.0601, 0.080, 0.25, 440, 510),
    (400, 0.0470, 0.080, 0.25, 505, 580),
]

_SIZES_MV = [
    (95, 0.193, 0.100, 0.40, 250, 285),
    (150, 0.124, 0.100, 0.40, 305, 345),
    (185, 0.0991, 0.100, 0.40, 345, 390),
    (240, 0.0754, 0.100, 0.40, 405, 455),
    (300, 0.0601, 0.100, 0.40, 460, 515),
    (400, 0.0470, 0.100, 0.40, 525, 585),
    (500, 0.0366, 0.100, 0.40, 590, 650),
]


def _cable_rows(
    family_id: str, rows: list[tuple[float, float, float, float, float, float]]
) -> list[dict[str, object]]:
    return [
        {
            "id": f"{family_id}-{size:g}",
            "family_id": family_id,
            "size_mm2": size,
            "resistance_ohm_per_km": resistance,
            "reactance_ohm_per_km": reactance,
            "capacitance_uf_per_km": capacitance,
            "ampacity_a_duct": duct,
            "ampacity_a_direct": direct,
            "notes": "R at 20 C per IEC 60228; ampacity indicative",
        }
        for size, resistance, reactance, capacitance, duct, direct in rows
    ]


CABLES = _cable_rows("xlpe-cu-lv", _SIZES_LV) + _cable_rows("xlpe-cu-mv", _SIZES_MV)

CURVES = [
    {
        "id": "iec-si",
        "standard": "IEC 60255-151",
        "curve": "SI",
        "label": "IEC Standard Inverse",
        "k": 0.14,
        "alpha": 0.02,
        "band": "IEC",
    },
    {
        "id": "iec-vi",
        "standard": "IEC 60255-151",
        "curve": "VI",
        "label": "IEC Very Inverse",
        "k": 13.5,
        "alpha": 1.0,
        "band": "IEC",
    },
    {
        "id": "iec-ei",
        "standard": "IEC 60255-151",
        "curve": "EI",
        "label": "IEC Extremely Inverse",
        "k": 80.0,
        "alpha": 2.0,
        "band": "IEC",
    },
    {
        "id": "ieee-mi",
        "standard": "IEEE C37.112",
        "curve": "MI",
        "label": "IEEE Moderately Inverse",
        "k": 0.0515,
        "alpha": 0.02,
        "band": "IEEE",
    },
    {
        "id": "ieee-vi",
        "standard": "IEEE C37.112",
        "curve": "VI",
        "label": "IEEE Very Inverse",
        "k": 19.61,
        "alpha": 1.0,
        "band": "IEEE",
    },
    {
        "id": "ieee-ei",
        "standard": "IEEE C37.112",
        "curve": "EI",
        "label": "IEEE Extremely Inverse",
        "k": 28.2,
        "alpha": 2.0,
        "band": "IEEE",
    },
]

RELAYS = [
    {
        "id": "feeder-ocr-iec",
        "manufacturer": "Generic",
        "model": "Feeder OCR (50/51)",
        "standard": "IEC 60255-151",
        "functions": ["50", "51", "50N", "51N"],
        "curves": ["iec-si", "iec-vi", "iec-ei"],
        "notes": "Reference record; replace with the vendor model before coordination",
    },
    {
        "id": "feeder-ocr-ieee",
        "manufacturer": "Generic",
        "model": "Feeder OCR (50/51) IEEE",
        "standard": "IEEE C37.112",
        "functions": ["50", "51", "50N", "51N"],
        "curves": ["ieee-mi", "ieee-vi", "ieee-ei"],
        "notes": "Reference record; IEEE curves use the k/alpha form of the client engine",
    },
    {
        "id": "recloser-79",
        "manufacturer": "Generic",
        "model": "Recloser (79)",
        "standard": "IEC 60255-151",
        "functions": ["79", "50", "51"],
        "curves": ["iec-si", "iec-vi"],
        "notes": "Reference record",
    },
    {
        "id": "distance-21",
        "manufacturer": "Generic",
        "model": "Distance relay (21)",
        "standard": "IEC 60255-121",
        "functions": ["21", "27", "59", "50BF"],
        "curves": [],
        "notes": "No inverse-time curve; mho/quad characteristics are not in the dataset",
    },
    {
        "id": "differential-87",
        "manufacturer": "Generic",
        "model": "Differential relay (87)",
        "standard": "IEC 60255-110",
        "functions": ["87T", "87B", "50/51"],
        "curves": [],
        "notes": "No inverse-time curve",
    },
]
