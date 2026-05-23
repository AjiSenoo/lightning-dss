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
    InspectionLog, InspectionComponentStatus,
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
        # 0.30*0.90 + 0.30*0.85 + 0.40*0.55 = 0.27 + 0.255 + 0.22 = 0.745
        component_results = {
            'AT': self._make_result(0.90),
            'DC': self._make_result(0.85),
            'GR': self._make_result(0.55),
        }
        result = aggregate_asset_ahi(component_results)
        self.assertAlmostEqual(result['ahi_overall'], 0.745, places=3)

    def test_all_healthy(self):
        component_results = {
            'AT': self._make_result(1.0),
            'DC': self._make_result(1.0),
            'GR': self._make_result(1.0),
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
# Recommendation engine
# ---------------------------------------------------------------------------

class RecommendationTest(TestCase):

    def _fuzzy(self, label):
        return {'label': label, 'score': 50.0, 'r_stress_input': 0.5, 'd_asset_input': 0.5}

    def _ahi(self, sub_scores, corrosion=False):
        ahi = 0.5 * sub_scores.get('stress', 1) + 0.3 * sub_scores.get('physical', 1) + 0.2 * sub_scores.get('age', 1)
        return {'ahi': ahi, 'sub_scores': sub_scores, 'corrosion_applied': corrosion}

    def test_hard_fail_at_meleleh(self):
        from fuzzy_engine import fuzzy_config as cfg
        ahi = self._ahi({'stress': 0.8, 'physical': 0.3, 'age': 0.9})
        # Simulate hard-fail via the urgency label (hard-fail is checked in calling code
        # but recommendations.py checks GR measurement; AT hard-fail tested via Darurat+physical)
        fuzzy = self._fuzzy('Inspeksi Darurat')
        ahi_hard = self._ahi({'stress': 0.8, 'physical': 0.1, 'age': 0.9})  # physical dominates
        rec = recommend_for_component('AT', ahi_hard, fuzzy)
        self.assertEqual(rec['action'], 'repair')
        self.assertEqual(rec['time_horizon'], 'within_1_month')
        self.assertEqual(rec['primary_driver'], 'physical')

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
