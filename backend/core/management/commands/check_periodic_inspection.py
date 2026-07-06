from datetime import timedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import AssetRegistry, Notification, User
from fuzzy_engine import fuzzy_config as cfg


class Command(BaseCommand):
    help = (
        'Emit a periodic (biyearly = semiannual) baseline-inspection reminder for assets whose '
        'last inspection is older than PERIODIC_INSPECTION_MONTHS. Complements the purely '
        'condition-based engine with the field-practice calendar cycle for lightning-exposed '
        'assets. A per-asset cooldown (queried from prior periodic notifications) prevents spam.'
    )

    def handle(self, *args, **options):
        months = cfg.PERIODIC_INSPECTION_MONTHS
        cooldown_days = getattr(settings, 'PERIODIC_NOTIFY_COOLDOWN_DAYS', 30)
        now = timezone.now()
        # ~30.44 days/month keeps the 6-month cadence calendar-accurate enough.
        due_cutoff = now - timedelta(days=int(months * 30.44))
        cooldown_cutoff = now - timedelta(days=cooldown_days)

        total = 0
        with transaction.atomic():
            for asset in AssetRegistry.objects.filter(deleted_at__isnull=True).select_related('organization'):
                latest = (asset.inspections
                          .filter(deleted_at__isnull=True)
                          .order_by('-tgl_inspeksi')
                          .first())
                is_due = (latest is None) or (latest.tgl_inspeksi < due_cutoff)
                if not is_due:
                    continue
                # Cooldown: skip if we already sent a periodic reminder recently for this asset.
                recently_notified = Notification.objects.filter(
                    asset=asset, verb='periodic_inspection_due',
                    created_at__gt=cooldown_cutoff,
                ).exists()
                if recently_notified:
                    continue

                recipients = User.objects.filter(
                    is_active=True, role__in=['Manajer', 'Teknisi'],
                    organization=asset.organization,
                )
                rows = [Notification(recipient=u, actor=None, verb='periodic_inspection_due', asset=asset)
                        for u in recipients]
                if rows:
                    Notification.objects.bulk_create(rows)
                    total += len(rows)

        self.stdout.write(self.style.SUCCESS(
            f'Periodic-inspection check done. Emitted {total} notification(s) '
            f'(cadence={months}mo, cooldown={cooldown_days}d).'
        ))
