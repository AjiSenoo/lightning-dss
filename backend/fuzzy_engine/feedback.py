"""
Feedback Loop: Closed-Loop Learning Mechanism.

After a technician submits an inspection logbook, this module:
1. Calculates the actual damage severity from component statuses
2. Compares it against what the fuzzy engine predicted
3. Updates the asset health score asymmetrically:
   - Penalty (0.5) is 5x faster than recovery (0.1)
   - Recovery requires ALL components OK
"""
from . import fuzzy_config as cfg


def calculate_actual_damage_score(inspection_log):
    """
    Convert logbook findings into a numeric severity score (0–1).
    """
    severity = 0.0
    severity += cfg.SEVERITY_MAP.get(inspection_log.status_air_terminal, 0.0)
    severity += cfg.SEVERITY_MAP.get(inspection_log.status_down_conductor, 0.0)
    severity += cfg.SEVERITY_MAP.get(inspection_log.status_grounding, 0.0)
    return min(severity, 1.0)


def calculate_expected_damage_level(fuzzy_label):
    """
    Map fuzzy output label to expected damage threshold.
    """
    return cfg.EXPECTED_DAMAGE.get(fuzzy_label, 0.1)


def _all_components_ok(inspection_log):
    """Check if every required component status is OK."""
    return (
        inspection_log.status_air_terminal == 'OK'
        and inspection_log.status_down_conductor == 'OK'
        and inspection_log.status_grounding == 'OK'
    )


def update_asset_health(asset, inspection_log, linked_event=None):
    """
    Update asset health score based on inspection findings vs predictions.

    Asymmetric by design: penalty 5x faster than recovery.

    Returns dict: health_before, health_after, actual_damage, expected_damage,
                  discrepancy, action
    """
    health_before = asset.skor_kesehatan_aset
    actual = calculate_actual_damage_score(inspection_log)

    if linked_event and linked_event.fuzzy_output_label:
        expected = calculate_expected_damage_level(linked_event.fuzzy_output_label)
        discrepancy = actual - expected
    else:
        discrepancy = actual
        expected = 0.0

    action = 'unchanged'

    if discrepancy > 0:
        penalty = discrepancy * cfg.LEARNING_RATE
        asset.skor_kesehatan_aset = max(asset.skor_kesehatan_aset - penalty, 0.0)
        action = 'penalty'
    elif discrepancy < 0 and _all_components_ok(inspection_log):
        recovery = abs(discrepancy) * cfg.RECOVERY_RATE
        asset.skor_kesehatan_aset = min(asset.skor_kesehatan_aset + recovery, 1.0)
        action = 'recovery'

    asset.save()

    return {
        'health_before': round(health_before, 4),
        'health_after': round(asset.skor_kesehatan_aset, 4),
        'actual_damage': round(actual, 4),
        'expected_damage': round(expected, 4),
        'discrepancy': round(discrepancy, 4),
        'action': action,
    }
