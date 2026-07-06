"""
Regression tests for:
  - precise install-date dating on asset replace (Bagian A)
  - maintenance-action replace no longer raising IntegrityError (Bagian A2)
  - component end-of-life two-tier notification command (Bagian B)
"""
import datetime
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from core.models import (
    Organization, AssetRegistry, AssetComponent, User, Notification,
)
from core.views import AssetViewSet, ComponentMaintenanceActionViewSet
from fuzzy_engine import fuzzy_config as cfg


class _Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(nama='Org A')
        self.manager = User.objects.create_user(
            username='mgr', password='pw', role='Manajer',
            nama_lengkap='Manager', organization=self.org,
        )
        self.teknisi = User.objects.create_user(
            username='tek', password='pw', role='Teknisi',
            nama_lengkap='Teknisi', organization=self.org,
        )
        self.asset = AssetRegistry.objects.create(
            organization=self.org, nama_gedung='Gedung A', lokasi_gps='-6.2,106.8',
            lpl_grade='II', tahun_instalasi=2015,
        )


class AssetReplaceDatingTests(_Base):
    def test_replace_dates_components_to_replacement_day(self):
        factory = APIRequestFactory()
        today = timezone.localdate()
        request = factory.post(f'/api/assets/{self.asset.asset_id}/replace/', {
            'catatan_penggantian': 'renovasi total',
            'tanggal_instalasi': today.isoformat(),
        }, format='json')
        force_authenticate(request, user=self.manager)
        resp = AssetViewSet.as_view({'post': 'replace'})(request, pk=str(self.asset.asset_id))
        self.assertEqual(resp.status_code, 201, resp.data)

        new_asset = AssetRegistry.objects.get(asset_id=resp.data['asset_id'])
        comps = new_asset.components.filter(end_date__isnull=True)
        # Full functional chain AT/DC/GR/BND/SPD/SHD/EQP is auto-created on the new asset.
        self.assertEqual(comps.count(), 7)
        for c in comps:
            self.assertEqual(c.install_date, today)  # age starts at 0 days, not Jan 1
        self.assertEqual(new_asset.tahun_instalasi, today.year)

    def test_create_asset_with_tanggal_instalasi(self):
        a = AssetRegistry.objects.create(
            organization=self.org, nama_gedung='B', lokasi_gps='-6.2,106.8',
            lpl_grade='III', tanggal_instalasi=datetime.date(2020, 7, 15),
        )
        self.assertEqual(a.tahun_instalasi, 2020)  # derived in save()
        for c in a.components.all():
            self.assertEqual(c.install_date, datetime.date(2020, 7, 15))


class MaintenanceReplaceTests(_Base):
    def _replace(self, component, when):
        factory = APIRequestFactory()
        request = factory.post('/api/maintenance-actions/', {
            'asset': str(self.asset.asset_id),
            'component': str(component.component_id),
            'action': 'replace',
            'performed_at': when.isoformat(),
            'notes': 'korosi parah',
        }, format='json')
        force_authenticate(request, user=self.manager)
        return ComponentMaintenanceActionViewSet.as_view({'post': 'create'})(request)

    def test_maintenance_replace_succeeds_without_integrity_error(self):
        at = self.asset.components.get(component_type='AT', end_date__isnull=True)
        when = timezone.now()
        resp = self._replace(at, when)
        self.assertEqual(resp.status_code, 201, resp.data)

        at.refresh_from_db()
        self.assertEqual(at.end_date, when.date())
        self.assertIsNotNone(at.replaced_by_id)

        active = self.asset.components.filter(component_type='AT', end_date__isnull=True)
        self.assertEqual(active.count(), 1)                       # exactly one active
        self.assertEqual(active.first().install_date, when.date())

    def test_replacing_inactive_component_is_rejected(self):
        at = self.asset.components.get(component_type='AT', end_date__isnull=True)
        self._replace(at, timezone.now())          # first replace ends-dates `at`
        at.refresh_from_db()
        resp = self._replace(at, timezone.now())   # try to replace the now-inactive row
        self.assertEqual(resp.status_code, 409, resp.data)


class ComponentEolNotificationTests(_Base):
    def _set_age(self, component_type, fraction):
        lifespan = cfg.DESIGN_LIFESPAN_BY_COMPONENT[component_type]
        days = int(lifespan * fraction * 365.25)
        comp = self.asset.components.get(component_type=component_type, end_date__isnull=True)
        AssetComponent.objects.filter(pk=comp.pk).update(
            install_date=timezone.localdate() - datetime.timedelta(days=days)
        )
        return comp

    def _run(self):
        out = StringIO()
        call_command('check_component_lifespan', stdout=out)
        return out.getvalue()

    def test_warning_then_cooldown_then_escalation(self):
        comp = self._set_age('AT', 0.85)   # 85% consumed -> warning tier

        self._run()
        warn = Notification.objects.filter(verb='component_eol_warning', component=comp)
        # Manager + technician both notified
        self.assertEqual(warn.count(), 2)

        # Re-run immediately -> cooldown suppresses duplicates
        self._run()
        self.assertEqual(
            Notification.objects.filter(verb='component_eol_warning', component=comp).count(), 2
        )

        # Push to urgent -> escalation bypasses cooldown
        AssetComponent.objects.filter(pk=comp.pk).update(
            install_date=timezone.localdate() - datetime.timedelta(
                days=int(cfg.DESIGN_LIFESPAN_BY_COMPONENT['AT'] * 0.97 * 365.25)
            )
        )
        self._run()
        self.assertEqual(
            Notification.objects.filter(verb='component_eol_urgent', component=comp).count(), 2
        )

    def test_healthy_component_no_notification(self):
        # Freshly-install every component (well below any warning threshold, and below the
        # SPD 5-year / 25-strike inspection trigger) so a healthy fleet emits no EOL notice.
        recent = timezone.localdate() - datetime.timedelta(days=200)
        AssetComponent.objects.filter(
            asset=self.asset, end_date__isnull=True,
        ).update(install_date=recent)
        self._run()
        self.assertEqual(Notification.objects.filter(verb__startswith='component_eol').count(), 0)


class HardFailNotificationTests(_Base):
    def _inspection(self, **status):
        from core.models import InspectionLog
        base = {'status_air_terminal': 'OK', 'status_down_conductor': 'OK',
                'status_grounding': 'OK'}
        base.update(status)
        return InspectionLog.objects.create(
            asset=self.asset, tgl_inspeksi=timezone.now(), **base,
        )

    def test_hard_fail_notifies_manager_excludes_actor(self):
        from core.views import _emit_hard_fail_notification
        insp = self._inspection(status_down_conductor='Putus')
        _emit_hard_fail_notification(insp, actor=self.teknisi)

        notifs = Notification.objects.filter(verb='component_hard_fail')
        # Manager notified; actor (teknisi) excluded.
        self.assertEqual(notifs.count(), 1)
        self.assertEqual(notifs.first().recipient, self.manager)
        self.assertEqual(notifs.first().asset, self.asset)

    def test_all_ok_emits_nothing(self):
        from core.views import _emit_hard_fail_notification
        insp = self._inspection()
        _emit_hard_fail_notification(insp, actor=self.teknisi)
        self.assertEqual(Notification.objects.filter(verb='component_hard_fail').count(), 0)

    def test_non_hardfail_status_emits_nothing(self):
        from core.views import _emit_hard_fail_notification
        insp = self._inspection(status_grounding='Terkorosi')
        _emit_hard_fail_notification(insp, actor=self.teknisi)
        self.assertEqual(Notification.objects.filter(verb='component_hard_fail').count(), 0)
