from django.core.management.base import BaseCommand
from core.models import AssetRegistry


class Command(BaseCommand):
    help = "Recompute skor_kesehatan_aset for every non-deleted asset (picks up age decay)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--force', action='store_true',
            help='Recompute all assets regardless of staleness TTL.',
        )

    def handle(self, *args, force=False, **opts):
        qs = AssetRegistry.objects.filter(deleted_at__isnull=True)
        n = 0
        for asset in qs.iterator():
            if force:
                asset.recompute_health()
            else:
                asset.recompute_if_stale()
            n += 1
        self.stdout.write(self.style.SUCCESS(f'Processed {n} assets.'))
