from datetime import timedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from core.models import AssetRegistry, Notification, User


class Command(BaseCommand):
    help = 'Notify managers of assets that have not been inspected within INSPECTION_STALE_THRESHOLD_DAYS.'

    def handle(self, *args, **options):
        threshold_days = settings.INSPECTION_STALE_THRESHOLD_DAYS
        cooldown_days  = settings.STALE_NOTIFY_COOLDOWN_DAYS
        now = timezone.now()
        stale_cutoff    = now - timedelta(days=threshold_days)
        cooldown_cutoff = now - timedelta(days=cooldown_days)

        total = 0
        with transaction.atomic():
            for asset in AssetRegistry.objects.filter(deleted_at__isnull=True).select_related('organization'):
                latest = (asset.inspections
                          .filter(deleted_at__isnull=True)
                          .order_by('-tgl_inspeksi')
                          .first())
                is_stale = (latest is None) or (latest.tgl_inspeksi < stale_cutoff)
                if not is_stale:
                    continue
                if asset.last_stale_notified_at and asset.last_stale_notified_at > cooldown_cutoff:
                    continue

                managers = User.objects.filter(role='Manajer', is_active=True,
                                               organization=asset.organization)
                rows = [Notification(recipient=m, actor=None, verb='stale_asset', asset=asset)
                        for m in managers]
                if rows:
                    Notification.objects.bulk_create(rows)
                    total += len(rows)
                asset.last_stale_notified_at = now
                asset.save(update_fields=['last_stale_notified_at'])

        self.stdout.write(self.style.SUCCESS(
            f'Stale-check done. Emitted {total} notification(s) '
            f'(threshold={threshold_days}d, cooldown={cooldown_days}d).'
        ))
