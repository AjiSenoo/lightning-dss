from django.core.management.base import BaseCommand
from core.models import AssetRegistry


class Command(BaseCommand):
    help = (
        'Find soft-deleted assets whose (organization, nama_gedung) also has a live row. '
        'Ghosts with no related data are hard-deleted; ghosts with related data are reported '
        'for manual review. Dry-run by default; pass --commit to apply.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--commit',
            action='store_true',
            help='Actually delete clean ghost rows (default: dry-run only).',
        )

    def _has_related_data(self, asset):
        return (
            asset.events.exists()
            or asset.inspections.exists()
            or asset.components.exists()
        )

    def handle(self, *args, **options):
        soft_deleted = list(
            AssetRegistry.objects.filter(deleted_at__isnull=False)
            .select_related('organization')
        )

        clean_ghosts = []
        data_ghosts = []

        for asset in soft_deleted:
            has_live_sibling = AssetRegistry.objects.filter(
                organization=asset.organization,
                nama_gedung=asset.nama_gedung,
                deleted_at__isnull=True,
            ).exists()
            if not has_live_sibling:
                continue
            if self._has_related_data(asset):
                data_ghosts.append(asset)
            else:
                clean_ghosts.append(asset)

        if not clean_ghosts and not data_ghosts:
            self.stdout.write(self.style.SUCCESS('No ghost assets found.'))
            return

        if clean_ghosts:
            self.stdout.write(f'\nClean ghosts (no related data) — {len(clean_ghosts)} row(s):')
            for a in clean_ghosts:
                self.stdout.write(
                    f'  {a.nama_gedung!r} '
                    f'(org={a.organization}, asset_id={a.asset_id}, deleted_at={a.deleted_at})'
                )

        if data_ghosts:
            self.stdout.write(
                self.style.WARNING(
                    f'\nGhosts WITH related data (events/inspections/components) — '
                    f'{len(data_ghosts)} row(s). These are historical records from '
                    f'replaced assets and are NOT auto-deleted:'
                )
            )
            for a in data_ghosts:
                n_events = a.events.count()
                n_insp = a.inspections.count()
                n_comp = a.components.count()
                self.stdout.write(
                    f'  {a.nama_gedung!r} asset_id={a.asset_id} '
                    f'({n_events} events, {n_insp} inspections, {n_comp} components) '
                    f'deleted_at={a.deleted_at}'
                )
            self.stdout.write(
                '  → These rows are already hidden from all live views (filter fix applied). '
                'They can be permanently removed only after reassigning or archiving their data.'
            )

        if not clean_ghosts:
            self.stdout.write(self.style.SUCCESS('\nNo clean ghosts to delete.'))
            return

        if not options['commit']:
            self.stdout.write(self.style.WARNING(
                '\nDry run — no rows deleted. Pass --commit to hard-delete clean ghosts.'
            ))
            return

        pks = [a.asset_id for a in clean_ghosts]
        deleted_count, _ = AssetRegistry.objects.filter(pk__in=pks).delete()
        self.stdout.write(self.style.SUCCESS(
            f'\nHard-deleted {deleted_count} clean ghost asset row(s).'
        ))
