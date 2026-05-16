from datetime import timedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import InspectionLog


class Command(BaseCommand):
    help = 'Hard-delete inspection logs soft-deleted longer than INSPECTION_DELETE_GRACE_DAYS.'

    def handle(self, *args, **options):
        grace_days = settings.INSPECTION_DELETE_GRACE_DAYS
        cutoff = timezone.now() - timedelta(days=grace_days)
        expired = InspectionLog.objects.filter(deleted_at__lt=cutoff)
        count = expired.count()
        expired.delete()
        self.stdout.write(self.style.SUCCESS(
            f'Purged {count} expired inspection log(s) (grace = {grace_days} days).'
        ))
