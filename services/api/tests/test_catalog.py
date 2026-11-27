"""Catalog tests: seed integrity, filtering and parity with the client curves."""

from __future__ import annotations

import pytest

from psa_api.catalog import Catalog

# Copied from src/lib/protection.ts; the catalog must not drift from the calculator.
CLIENT_CURVES = {
    "IEC-SI": (0.14, 0.02, 0.0),
    "IEC-VI": (13.5, 1.0, 0.0),
    "IEC-EI": (80.0, 2.0, 0.0),
    "IEEE-MI": (0.0515, 0.02, 0.114),
    "IEEE-VI": (19.61, 2.0, 0.491),
    "IEEE-EI": (28.2, 2.0, 0.1217),
}


def test_dataset_is_published(catalog: Catalog) -> None:
    datasets = catalog.datasets()

    assert len(datasets) == 1
    assert datasets[0].id == "2026.11"
    assert "IEC 60228" in datasets[0].source


def test_curves_match_the_client_calculator(catalog: Catalog) -> None:
    curves = {f"{curve.band}-{curve.curve}": curve for curve in catalog.relay_curves()}

    assert set(curves) == set(CLIENT_CURVES)
    for key, (k, alpha, b) in CLIENT_CURVES.items():
        assert curves[key].k == pytest.approx(k)
        assert curves[key].alpha == pytest.approx(alpha)
        assert curves[key].b == pytest.approx(b)
        assert curves[key].datasetVersion == "2026.11"


def test_ieee_very_inverse_matches_the_standard(catalog: Catalog) -> None:
    """IEEE C37.112-1996: A = 19.61, B = 0.491, p = 2; at M = 10 and TD = 1, t = 0.689 s."""
    curve = next(item for item in catalog.relay_curves() if item.id == "ieee-vi")
    multiple = 10.0
    trip = 1.0 * (curve.k / (multiple**curve.alpha - 1) + curve.b)

    assert trip == pytest.approx(0.6891, abs=1e-4)


def test_curve_ids_are_unique_and_banded(catalog: Catalog) -> None:
    curves = catalog.relay_curves()
    assert len({curve.id for curve in curves}) == len(curves)
    assert {curve.band for curve in curves} == {"IEC", "IEEE"}


def test_cable_seed_covers_both_voltage_classes(catalog: Catalog) -> None:
    cables = catalog.cables()

    assert len(cables) == 15
    assert {cable.voltageClassKv for cable in cables} == {1.0, 10.0}
    assert all(cable.conductor == "Cu" for cable in cables)
    assert all(cable.resistanceOhmPerKm > 0 for cable in cables)
    assert all(cable.sizeMm2 > 0 for cable in cables)


def test_cable_resistance_falls_with_size(catalog: Catalog) -> None:
    low_voltage = sorted(
        catalog.cables(voltage_class_kv=1.0), key=lambda cable: cable.sizeMm2
    )
    resistances = [cable.resistanceOhmPerKm for cable in low_voltage]

    assert resistances == sorted(resistances, reverse=True)
    assert low_voltage[0].sizeMm2 == 16
    assert low_voltage[-1].sizeMm2 == 400


def test_cable_filters(catalog: Catalog) -> None:
    assert len(catalog.cables(voltage_class_kv=1.0)) == 8
    assert len(catalog.cables(voltage_class_kv=10.0)) == 7
    assert catalog.cables(conductor="Al") == []


def test_relay_models_reference_known_curves(catalog: Catalog) -> None:
    known = {curve.id for curve in catalog.relay_curves()}
    relays = catalog.relays()

    assert len(relays) == 5
    assert {relay.id for relay in relays} == {
        "feeder-ocr-iec",
        "feeder-ocr-ieee",
        "recloser-79",
        "distance-21",
        "differential-87",
    }
    for relay in relays:
        assert relay.functions
        assert set(relay.curves) <= known
    distance = next(relay for relay in relays if relay.id == "distance-21")
    assert distance.curves == []


def test_seeding_is_idempotent(catalog: Catalog) -> None:
    catalog.ensure_seeded()
    catalog.ensure_seeded()

    assert len(catalog.cables()) == 15
    assert len(catalog.relays()) == 5
    assert len(catalog.datasets()) == 1
