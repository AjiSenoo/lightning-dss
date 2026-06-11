"""
Pre-migration audit: surface any InspectionLog rows that would violate the
one_amendment_per_original UniqueConstraint before it is applied.

Run before generating/applying migration 0012.
Exits non-zero if violations exist so CI/shell scripts can gate on it.
"""
import sys

from django.core.management.base import BaseCommand
from django.db.models import Count

from core.models import InspectionLog


class Command(BaseCommand):
    help = 'Audit amendment cardinality; exit non-zero if 1:1 or chain violations exist.'

    def handle(self, *args, **options):
        violations = False

        # Originals with more than one amendment
        duplicates = (
            InspectionLog.objects
            .filter(amends__isnull=False)
            .values('amends')
            .annotate(n=Count('log_id'))
            .filter(n__gt=1)
        )
        if duplicates.exists():
            violations = True
            self.stderr.write(self.style.ERROR(
                f'\n[FAIL] {duplicates.count()} original(s) have multiple amendments:\n'
            ))
            for row in duplicates:
                original = InspectionLog.objects.select_related('asset').filter(pk=row['amends']).first()
                label = f'{original.asset.nama_gedung} / {original.tgl_inspeksi.date()}' if original else '?'
                self.stderr.write(f'  amends={row["amends"]}  count={row["n"]}  ({label})')
        else:
            self.stdout.write(self.style.SUCCESS('[OK] No originals with multiple amendments.'))

        # Amendment-of-amendment chains
        chains = InspectionLog.objects.filter(
            amends__isnull=False,
            amends__amends__isnull=False,
        ).values_list('log_id', 'amends_id', 'amends__amends_id')
        if chains.exists():
            violations = True
            self.stderr.write(self.style.ERROR(
                f'\n[FAIL] {chains.count()} amendment-of-amendment chain(s) detected:\n'
            ))
            for log_id, amends_id, grandparent_id in chains:
                self.stderr.write(
                    f'  log={str(log_id)[:8]}  amends={str(amends_id)[:8]}  grandparent={str(grandparent_id)[:8]}'
                )
        else:
            self.stdout.write(self.style.SUCCESS('[OK] No amendment-of-amendment chains.'))

        if violations:
            self.stderr.write(self.style.ERROR(
                '\nResolve the violations above before generating migration 0012.\n'
            ))
            sys.exit(1)
        else:
            self.stdout.write(self.style.SUCCESS(
                '\nAll clear — safe to generate migration 0012.\n'
            ))
