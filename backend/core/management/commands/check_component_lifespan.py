from datetime import timedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import AssetComponent, Notification, User
from fuzzy_engine import fuzzy_config as cfg


class Command(BaseCommand):
    help = (
        'Notify managers & technicians of components approaching their design end-of-life. '
        'Two tiers: warning (>= COMPONENT_EOL_WARNING_FRACTION of lifespan consumed) and '
        'urgent (>= COMPONENT_EOL_URGENT_FRACTION, or < COMPONENT_EOL_URGENT_MONTHS remaining). '
        'A per-component cooldown caps re-notification; tier escalation (warning -> urgent) '
        'bypasses the cooldown.'
    )

    def handle(self, *args, **options):
        warning_frac  = settings.COMPONENT_EOL_WARNING_FRACTION
        urgent_frac   = settings.COMPONENT_EOL_URGENT_FRACTION
        urgent_months = settings.COMPONENT_EOL_URGENT_MONTHS
        cooldown_days = settings.COMPONENT_EOL_NOTIFY_COOLDOWN_DAYS

        now = timezone.now()
        today = timezone.localdate()
        cooldown_cutoff = now - timedelta(days=cooldown_days)

        components = (
            AssetComponent.objects
            .filter(end_date__isnull=True, deleted_at__isnull=True,
                    asset__deleted_at__isnull=True)
            .select_related('asset', 'asset__organization')
        )

        total = 0
        with transaction.atomic():
            for comp in components:
                lifespan_years = cfg.DESIGN_LIFESPAN_BY_COMPONENT.get(comp.component_type)
                if not lifespan_years or comp.install_date is None:
                    continue

                age_years = (today - comp.install_date).days / 365.25
                usage = age_years / lifespan_years
                remaining_months = (lifespan_years - age_years) * 12

                # SPD (Type-1 arrester) has an extra proactive-inspection trigger: re-inspect
                # every SPD_INSPECTION_INTERVAL_YEARS OR after SPD_INSPECTION_STRIKE_COUNT strikes
                # recorded on the asset since this SPD was installed (electronic damage propagates
                # through the shared-earth path first). Either crossing escalates to 'warning'.
                spd_trigger = False
                if comp.component_type == 'SPD':
                    strikes_since_install = comp.asset.events.filter(
                        timestamp__date__gte=comp.install_date,
                    ).count()
                    spd_trigger = (
                        age_years >= cfg.SPD_INSPECTION_INTERVAL_YEARS
                        or strikes_since_install >= cfg.SPD_INSPECTION_STRIKE_COUNT
                    )

                if usage >= urgent_frac or remaining_months < urgent_months:
                    tier = 'urgent'
                elif usage >= warning_frac or spd_trigger:
                    tier = 'warning'
                else:
                    continue

                # Skip only if we already notified THIS tier within the cooldown window.
                # A different (escalated) tier always proceeds; an expired cooldown re-reminds.
                within_cooldown = (
                    comp.last_eol_notified_at is not None
                    and comp.last_eol_notified_at > cooldown_cutoff
                )
                if comp.last_eol_tier == tier and within_cooldown:
                    continue

                recipients = User.objects.filter(
                    is_active=True,
                    role__in=['Manajer', 'Teknisi'],
                    organization=comp.asset.organization,
                )
                verb = f'component_eol_{tier}'
                rows = [
                    Notification(recipient=u, actor=None, verb=verb,
                                 asset=comp.asset, component=comp)
                    for u in recipients
                ]
                if rows:
                    Notification.objects.bulk_create(rows)
                    total += len(rows)

                # Update state without triggering AssetComponent.save() (avoids a
                # health recompute per component on the scheduled run).
                AssetComponent.objects.filter(pk=comp.pk).update(
                    last_eol_notified_at=now, last_eol_tier=tier,
                )

        self.stdout.write(self.style.SUCCESS(
            f'Component EOL check done. Emitted {total} notification(s) '
            f'(warning>={warning_frac}, urgent>={urgent_frac} or <{urgent_months}mo, '
            f'cooldown={cooldown_days}d).'
        ))
