"""
Asset Health Index (AHI) Calculator.

AHI = (W1 × Cumulative_Stress_Score) + (W2 × Physical_Condition_Score) + (W3 × Calendar_Age_Score)
D_asset = 1.0 - AHI  (+ optional corrosion penalty)
"""
import datetime
from . import fuzzy_config as cfg


def calculate_cumulative_stress_score(events):
    """
    Simplified Miner's Rule adaptation.
    Each strike contributes damage proportional to its stress ratio.
    """
    cumulative_damage = sum(e.rasio_stres for e in events)
    score = 1.0 - min(cumulative_damage / cfg.REFERENCE_DAMAGE_THRESHOLD, 1.0)
    return max(score, 0.0)


def calculate_physical_condition_score(latest_inspection):
    """
    Derive condition score from latest inspection log component statuses.
    """
    if latest_inspection is None:
        return 1.0  # No data → assume pristine

    total_penalty = 0.0
    total_penalty += cfg.COMPONENT_PENALTY.get(latest_inspection.status_air_terminal, 0.0)
    total_penalty += cfg.COMPONENT_PENALTY.get(latest_inspection.status_down_conductor, 0.0)
    total_penalty += cfg.COMPONENT_PENALTY.get(latest_inspection.status_grounding, 0.0)
    return max(1.0 - total_penalty, 0.0)


def calculate_calendar_age_score(tahun_instalasi):
    """
    Linear age degradation based on design lifespan.
    """
    current_year = datetime.datetime.now().year
    age_years = current_year - tahun_instalasi
    score = 1.0 - (age_years / cfg.DESIGN_LIFESPAN_YEARS)
    return max(score, 0.0)


def calculate_ahi(asset, events=None, latest_inspection=None):
    """
    Calculate the full Asset Health Index.

    Returns dict with keys: ahi, d_asset, sub_scores, corrosion_applied
    """
    if events is None:
        events = asset.events.all()

    if latest_inspection is None:
        latest_inspection = asset.inspections.order_by('-tgl_inspeksi').first()

    stress_score = calculate_cumulative_stress_score(events)
    physical_score = calculate_physical_condition_score(latest_inspection)
    age_score = calculate_calendar_age_score(asset.tahun_instalasi)

    ahi = (
        cfg.W_CUMULATIVE_STRESS * stress_score
        + cfg.W_PHYSICAL_CONDITION * physical_score
        + cfg.W_CALENDAR_AGE * age_score
    )

    d_asset = 1.0 - ahi

    corrosion_applied = False
    if (
        asset.resistivitas_tanah is not None
        and asset.resistivitas_tanah < cfg.SOIL_RESISTIVITY_THRESHOLD
    ):
        d_asset = min(d_asset + cfg.CORROSION_PENALTY, 1.0)
        corrosion_applied = True

    return {
        'ahi': round(ahi, 4),
        'd_asset': round(d_asset, 4),
        'sub_scores': {
            'cumulative_stress': round(stress_score, 4),
            'physical_condition': round(physical_score, 4),
            'calendar_age': round(age_score, 4),
        },
        'corrosion_applied': corrosion_applied,
    }
