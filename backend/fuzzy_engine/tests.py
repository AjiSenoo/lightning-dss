"""
Unit tests for the per-component fuzzy engine (Phase 2).

Fixtures are anchored to the IEC 62305-1:2010 Table 3 worked example:
  50 kA strike on LPL-I asset:
    d_AT = (50/200)^1 = 0.25
    d_DC = (50/200)^2 = 0.0625
    d_GR = (50/200)^1 = 0.25
"""
import datetime
from django.test import TestCase
from django.utils import timezone

from core.models import (
    Organization, AssetRegistry, AssetComponent,
    InspectionLog,
)
from fuzzy_engine.health_index import (
    per_event_damage, aggregate_asset_ahi, calculate_component_ahi,
    calculate_asset_health,
)
from fuzzy_engine.recommendations import recommend_for_component, recommend_for_asset


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_org():
    return Organization.objects.create(nama='Test Org')


def make_asset(org, lpl='I', tahun=2000, resistivitas=None):
    return AssetRegistry.objects.create(
        organization=org,
        nama_gedung='Test Tower',
        lokasi_gps='-6.2,106.8',
        lpl_grade=lpl,
        tahun_instalasi=tahun,
        resistivitas_tanah=resistivitas,
    )


def make_event(asset, i_peak_ka, year=2020):
    from core.models import LightningEvent
    return LightningEvent.objects.create(
        asset=asset,
        timestamp=timezone.make_aware(datetime.datetime(year, 6, 1)),
        estimasi_arus_puncak_ka=i_peak_ka,
    )


def active_component(asset, ct):
    return asset.components.get(component_type=ct, end_date__isnull=True)


# ---------------------------------------------------------------------------
# per_event_damage
# ---------------------------------------------------------------------------

class PerEventDamageTest(TestCase):
    """IEC 62305-1 Table 3 worked example: 50 kA on LPL-I."""

    def test_at_linear(self):
        self.assertAlmostEqual(per_event_damage('AT', 50, 'I'), 0.25)

    def test_dc_quadratic(self):
        self.assertAlmostEqual(per_event_damage('DC', 50, 'I'), 0.0625)

    def test_gr_linear(self):
        self.assertAlmostEqual(per_event_damage('GR', 50, 'I'), 0.25)

    def test_capped_at_one(self):
        # Strike equal to or exceeding design capacity caps at 1.0
        self.assertAlmostEqual(per_event_damage('AT', 200, 'I'), 1.0)
        self.assertAlmostEqual(per_event_damage('DC', 200, 'I'), 1.0)
        self.assertAlmostEqual(per_event_damage('AT', 999, 'I'), 1.0)

    def test_lpl_iii_iv_identical(self):
        # LPL III and IV share the same design parameters per IEC 62305-1 Table 3
        self.assertEqual(per_event_damage('AT', 50, 'III'), per_event_damage('AT', 50, 'IV'))
        self.assertEqual(per_event_damage('DC', 50, 'III'), per_event_damage('DC', 50, 'IV'))

    def test_dc_disproportionate_wear(self):
        # Same current: DC wears less than AT/GR per event (quadratic scaling means
        # moderate strikes do relatively less damage to DC; big strikes dominate)
        d_at = per_event_damage('AT', 50, 'I')
        d_dc = per_event_damage('DC', 50, 'I')
        self.assertGreater(d_at, d_dc)


# ---------------------------------------------------------------------------
# aggregate_asset_ahi
# ---------------------------------------------------------------------------

class AggregateAHITest(TestCase):

    def _make_result(self, ahi, sub_scores=None):
        return {
            'ahi': ahi,
            'sub_scores': sub_scores or {'stress': 1.0, 'physical': 1.0, 'age': 1.0},
            'corrosion_applied': False,
        }

    def test_safety_is_min(self):
        component_results = {
            'AT': self._make_result(0.90),
            'DC': self._make_result(0.85),
            'GR': self._make_result(0.55),
        }
        result = aggregate_asset_ahi(component_results)
        self.assertAlmostEqual(result['ahi_safety'], 0.55)
        self.assertEqual(result['worst_component'], 'GR')

    def test_overall_weighted_mean(self):
        # Raw weighted sum (no renormalisation) with current COMPONENT_WEIGHTS
        # (AT 0.28, DC 0.26, GR 0.20): 0.28*0.90 + 0.26*0.85 + 0.20*0.55
        #   = 0.252 + 0.221 + 0.110 = 0.583
        component_results = {
            'AT': self._make_result(0.90),
            'DC': self._make_result(0.85),
            'GR': self._make_result(0.55),
        }
        result = aggregate_asset_ahi(component_results)
        self.assertAlmostEqual(result['ahi_overall'], 0.583, places=3)

    def test_all_healthy(self):
        # All five degrading components healthy → weights sum to 1.0 → overall 1.0.
        component_results = {
            'AT':  self._make_result(1.0),
            'DC':  self._make_result(1.0),
            'GR':  self._make_result(1.0),
            'BND': self._make_result(1.0),
            'SPD': self._make_result(1.0),
        }
        result = aggregate_asset_ahi(component_results)
        self.assertAlmostEqual(result['ahi_safety'], 1.0)
        self.assertAlmostEqual(result['ahi_overall'], 1.0)


# ---------------------------------------------------------------------------
# Replacement resets stress
# ---------------------------------------------------------------------------

class ReplacementResetsStressTest(TestCase):

    def setUp(self):
        self.org = make_org()
        self.asset = make_asset(self.org, lpl='I', tahun=2000)

    def test_replacement_resets_gr_stress(self):
        # 5 strikes before replacement
        for _ in range(5):
            make_event(self.asset, i_peak_ka=50, year=2010)

        gr_old = active_component(self.asset, 'GR')
        result_before = calculate_component_ahi(gr_old, self.asset)
        stress_before = result_before['sub_scores']['stress']

        # Simulate replacement: end-date old component, create new one
        gr_old.end_date = datetime.date(2023, 1, 1)
        gr_old.save()
        gr_new = AssetComponent.objects.create(
            asset=self.asset,
            component_type='GR',
            install_date=datetime.date(2023, 1, 1),
            replaced_by=None,
        )
        gr_old.replaced_by = gr_new
        gr_old.save()

        # Strike after replacement
        make_event(self.asset, i_peak_ka=50, year=2024)

        result_after = calculate_component_ahi(gr_new, self.asset)
        stress_after = result_after['sub_scores']['stress']

        # New GR only sees 1 strike; old GR saw 5 — new should have less damage
        self.assertGreater(stress_after, stress_before)

    def test_at_dc_unaffected_by_gr_replacement(self):
        for _ in range(5):
            make_event(self.asset, i_peak_ka=50, year=2010)

        at_before = calculate_component_ahi(active_component(self.asset, 'AT'), self.asset)
        dc_before = calculate_component_ahi(active_component(self.asset, 'DC'), self.asset)

        # Replace GR
        gr = active_component(self.asset, 'GR')
        gr.end_date = datetime.date(2023, 1, 1)
        gr.save()
        AssetComponent.objects.create(
            asset=self.asset, component_type='GR',
            install_date=datetime.date(2023, 1, 1),
        )

        at_after = calculate_component_ahi(active_component(self.asset, 'AT'), self.asset)
        dc_after = calculate_component_ahi(active_component(self.asset, 'DC'), self.asset)

        # AT and DC stress scores should be unchanged
        self.assertAlmostEqual(
            at_before['sub_scores']['stress'], at_after['sub_scores']['stress'], places=4,
        )
        self.assertAlmostEqual(
            dc_before['sub_scores']['stress'], dc_after['sub_scores']['stress'], places=4,
        )


# ---------------------------------------------------------------------------
# Physical condition factor & hard-fail weakest-link override
# ---------------------------------------------------------------------------

def add_inspection_status(asset, component, status, when):
    """
    Create an InspectionLog whose flat status field for `component`'s type is `status`.
    InspectionLog.save() mirrors the flat fields into InspectionComponentStatus rows, so
    we set the flat field rather than creating the per-component row directly (avoids the
    unique (inspection, component) collision).
    """
    field = {
        'AT': 'status_air_terminal',
        'DC': 'status_down_conductor',
        'GR': 'status_grounding',
    }[component.component_type]
    flat = {'status_air_terminal': 'OK', 'status_down_conductor': 'OK', 'status_grounding': 'OK'}
    flat[field] = status
    return InspectionLog.objects.create(
        asset=asset,
        tgl_inspeksi=timezone.make_aware(datetime.datetime(when.year, when.month, when.day)),
        **flat,
    )


class PhysicalConditionFactorTest(TestCase):

    def setUp(self):
        self.org = make_org()
        # Recent install so age/stress are favourable — isolates the physical channel.
        self.asset = make_asset(self.org, lpl='I', tahun=2024)

    def test_condition_factors_match_literature_ladder(self):
        # Jahromi 2009 normalised condition ladder: OK 1.0, Terkorosi 0.75, Klem_Lepas 0.50.
        # One inspection sets all three flat fields so each component's latest status is
        # unambiguous (separate same-dated inspections would overwrite each other's rows).
        InspectionLog.objects.create(
            asset=self.asset,
            tgl_inspeksi=timezone.make_aware(datetime.datetime(2025, 1, 1)),
            status_air_terminal='Terkorosi',
            status_down_conductor='Klem_Lepas',
            status_grounding='OK',
        )
        at = active_component(self.asset, 'AT')
        dc = active_component(self.asset, 'DC')
        gr = active_component(self.asset, 'GR')
        self.assertAlmostEqual(
            calculate_component_ahi(at, self.asset)['sub_scores']['physical'], 0.75, places=4)
        self.assertAlmostEqual(
            calculate_component_ahi(dc, self.asset)['sub_scores']['physical'], 0.50, places=4)
        self.assertAlmostEqual(
            calculate_component_ahi(gr, self.asset)['sub_scores']['physical'], 1.00, places=4)

    def test_ok_status_is_full_health(self):
        at = active_component(self.asset, 'AT')
        add_inspection_status(self.asset, at, 'OK', datetime.date(2025, 1, 1))
        res = calculate_component_ahi(at, self.asset)
        self.assertAlmostEqual(res['sub_scores']['physical'], 1.0, places=4)
        self.assertFalse(res['hard_failed'])

    def test_hard_fail_zeroes_component_ahi(self):
        # A severed DC collapses the component AHI to 0 even with pristine stress & age.
        dc = active_component(self.asset, 'DC')
        add_inspection_status(self.asset, dc, 'Putus', datetime.date(2025, 1, 1))
        res = calculate_component_ahi(dc, self.asset)
        self.assertEqual(res['ahi'], 0.0)
        self.assertTrue(res['hard_failed'])

    def test_hard_fail_drives_asset_safety_to_zero(self):
        dc = active_component(self.asset, 'DC')
        add_inspection_status(self.asset, dc, 'Putus', datetime.date(2025, 1, 1))
        health = calculate_asset_health(self.asset)
        self.assertEqual(health['ahi_safety'], 0.0)
        self.assertEqual(health['worst_component'], 'DC')

    def test_repair_clears_hard_fail(self):
        from core.models import ComponentMaintenanceAction
        dc = active_component(self.asset, 'DC')
        add_inspection_status(self.asset, dc, 'Putus', datetime.date(2025, 1, 1))
        ComponentMaintenanceAction.objects.create(
            asset=self.asset, component=dc, action='repair',
            performed_at=timezone.make_aware(datetime.datetime(2025, 2, 1)),
        )
        res = calculate_component_ahi(dc, self.asset)
        self.assertFalse(res['hard_failed'])
        self.assertGreater(res['ahi'], 0.0)


# ---------------------------------------------------------------------------
# Recommendation engine
# ---------------------------------------------------------------------------

class RecommendationTest(TestCase):

    def _fuzzy(self, label):
        return {'label': label, 'score': 50.0, 'r_stress_input': 0.5, 'd_asset_input': 0.5}

    def _ahi(self, sub_scores, corrosion=False, latest_status=None):
        ahi = 0.5 * sub_scores.get('stress', 1) + 0.3 * sub_scores.get('physical', 1) + 0.2 * sub_scores.get('age', 1)
        return {
            'ahi': ahi, 'sub_scores': sub_scores,
            'corrosion_applied': corrosion, 'latest_status': latest_status,
        }

    def test_hard_fail_at_meleleh(self):
        # A hard-fail status on AT yields immediate replace regardless of fuzzy urgency.
        ahi = self._ahi({'stress': 0.8, 'physical': 0.0, 'age': 0.9}, latest_status='Meleleh')
        rec = recommend_for_component('AT', ahi, self._fuzzy('Inspeksi Rutin'))
        self.assertEqual(rec['action'], 'replace')
        self.assertEqual(rec['time_horizon'], 'immediate')
        self.assertEqual(rec['primary_driver'], 'physical')

    def test_hard_fail_dc_putus(self):
        ahi = self._ahi({'stress': 1.0, 'physical': 0.0, 'age': 1.0}, latest_status='Putus')
        rec = recommend_for_component('DC', ahi, self._fuzzy('Inspeksi Rutin'))
        self.assertEqual(rec['action'], 'replace')
        self.assertEqual(rec['time_horizon'], 'immediate')

    def test_hard_fail_gr_high_resistance_status(self):
        # Qualitative GR status (no numeric measurement) still hard-fails.
        ahi = self._ahi({'stress': 0.9, 'physical': 0.0, 'age': 0.9}, latest_status='High_Resistance')
        rec = recommend_for_component('GR', ahi, self._fuzzy('Inspeksi Rutin'))
        self.assertEqual(rec['action'], 'replace')
        self.assertEqual(rec['time_horizon'], 'immediate')

    def test_gr_high_resistance_immediate_replace(self):
        ahi = self._ahi({'stress': 0.9, 'physical': 0.9, 'age': 0.9})
        fuzzy = self._fuzzy('Inspeksi Rutin')
        rec = recommend_for_component('GR', ahi, fuzzy, latest_measurement=15.0)
        self.assertEqual(rec['action'], 'replace')
        self.assertEqual(rec['time_horizon'], 'immediate')

    def test_gr_below_threshold_not_replaced(self):
        ahi = self._ahi({'stress': 0.9, 'physical': 0.9, 'age': 0.9})
        fuzzy = self._fuzzy('Inspeksi Rutin')
        rec = recommend_for_component('GR', ahi, fuzzy, latest_measurement=5.0)
        self.assertEqual(rec['action'], 'monitor')

    def test_darurat_age_near_eol_replace(self):
        ahi = self._ahi({'stress': 0.7, 'physical': 0.9, 'age': 0.05})  # age dominates
        fuzzy = self._fuzzy('Inspeksi Darurat')
        rec = recommend_for_component('DC', ahi, fuzzy)
        self.assertEqual(rec['action'], 'replace')
        self.assertEqual(rec['primary_driver'], 'age')

    def test_prioritas_yields_inspect(self):
        ahi = self._ahi({'stress': 0.7, 'physical': 0.8, 'age': 0.7})
        fuzzy = self._fuzzy('Inspeksi Prioritas')
        rec = recommend_for_component('AT', ahi, fuzzy)
        self.assertEqual(rec['action'], 'inspect')
        self.assertEqual(rec['time_horizon'], 'within_6_months')

    def test_rutin_yields_monitor(self):
        ahi = self._ahi({'stress': 0.95, 'physical': 1.0, 'age': 0.9})
        fuzzy = self._fuzzy('Inspeksi Rutin')
        rec = recommend_for_component('GR', ahi, fuzzy)
        self.assertEqual(rec['action'], 'monitor')
        self.assertEqual(rec['time_horizon'], 'next_cycle')

    def test_asset_rollup_headline_is_most_urgent(self):
        per_ahi = {
            'AT': self._ahi({'stress': 0.95, 'physical': 1.0, 'age': 0.9}),
            'DC': self._ahi({'stress': 0.95, 'physical': 1.0, 'age': 0.9}),
            'GR': self._ahi({'stress': 0.4, 'physical': 0.5, 'age': 0.3}),
        }
        per_fuzzy = {
            'AT': self._fuzzy('Inspeksi Rutin'),
            'DC': self._fuzzy('Inspeksi Rutin'),
            'GR': self._fuzzy('Inspeksi Darurat'),
        }
        result = recommend_for_asset(per_ahi, per_fuzzy)
        self.assertEqual(result['headline']['component_type'], 'GR')
        self.assertEqual(result['headline']['urgency_label'], 'Inspeksi Darurat')

    def test_corrosion_driver(self):
        ahi = self._ahi({'stress': 0.7, 'physical': 0.9, 'age': 0.2}, corrosion=True)
        fuzzy = self._fuzzy('Inspeksi Darurat')
        rec = recommend_for_component('GR', ahi, fuzzy)
        self.assertEqual(rec['primary_driver'], 'corrosion')
