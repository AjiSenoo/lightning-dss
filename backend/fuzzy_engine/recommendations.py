"""
Per-component maintenance recommendation engine.

Given per-component AHI breakdown + fuzzy urgency labels, produces an actionable
instruction (action × time_horizon × primary_driver) for each component.
The asset-level rollup picks the most urgent item as the headline recommendation.
"""
from . import fuzzy_config as cfg

# Urgency rank for sorting: higher = more urgent
_URGENCY_RANK = {
    'Inspeksi Darurat':   2,
    'Inspeksi Prioritas': 1,
    'Inspeksi Rutin':     0,
}


def _primary_driver(sub_scores: dict, corrosion_applied: bool) -> str:
    """
    Which sub-score contributes the most to degradation (1 − AHI)?
    Returns 'stress' | 'physical' | 'age' | 'corrosion'.
    """
    contributions = {
        'stress':   cfg.W_CUMULATIVE_STRESS  * (1.0 - sub_scores.get('stress',   1.0)),
        'physical': cfg.W_PHYSICAL_CONDITION * (1.0 - sub_scores.get('physical', 1.0)),
        'age':      cfg.W_CALENDAR_AGE       * (1.0 - sub_scores.get('age',      1.0)),
    }
    driver = max(contributions, key=contributions.get)
    if driver == 'age' and corrosion_applied:
        return 'corrosion'
    return driver


def recommend_for_component(
    component_type: str,
    ahi_result: dict,
    fuzzy_result: dict,
    latest_measurement: float | None = None,
) -> dict:
    """
    Produce a single actionable recommendation for one component.

    Args:
        component_type  : 'AT' | 'DC' | 'GR'
        ahi_result      : output of calculate_component_ahi()
        fuzzy_result    : output of run_inference() for this component
        latest_measurement: most recent GR resistance reading (Ω); None for AT/DC

    Returns dict:
        component_type, action, time_horizon, urgency_label, primary_driver, rationale_id
    """
    urgency_label = fuzzy_result['label']
    sub_scores    = ahi_result.get('sub_scores', {})
    corrosion     = ahi_result.get('corrosion_applied', False)
    driver        = _primary_driver(sub_scores, corrosion)

    # --- Rule 1: hard-fail status overrides everything (immediate replace) ---
    # The latest inspection status rides along in ahi_result (set by
    # calculate_component_ahi). A confirmed functional failure is an immediate
    # replacement trigger (IEC 62305-3:2010 Clause 7), independent of fuzzy urgency.
    status = ahi_result.get('latest_status')
    if status in cfg.HARD_FAIL_STATUSES.get(component_type, set()):
        return _recommendation(
            component_type, 'replace', 'immediate', urgency_label,
            'physical', f'{component_type}_HARDFAIL_{status.upper()}',
        )

    # For GR, a numeric resistance reading above the SNI/PUIL 5 ohm limit is also a
    # hard fail even if the qualitative status was not recorded.
    if component_type == 'GR' and latest_measurement is not None:
        if latest_measurement > cfg.GR_RESISTANCE_REPLACE_THRESHOLD_OHM:
            return _recommendation(
                component_type, 'replace', 'immediate', urgency_label,
                'physical', f'{component_type}_HIGH_RESISTANCE',
            )

    # --- Rule 2: branch on fuzzy urgency ---
    if urgency_label == 'Inspeksi Darurat':
        if driver == 'physical':
            action       = 'repair'
            time_horizon = 'within_1_month'
        elif driver == 'age' or driver == 'corrosion':
            age_score = sub_scores.get('age', 1.0)
            action       = 'replace' if age_score < 0.2 else 'inspect'
            time_horizon = 'within_1_month'
        else:  # stress-driven
            action       = 'inspect'
            time_horizon = 'within_1_month'

    elif urgency_label == 'Inspeksi Prioritas':
        action       = 'inspect'
        time_horizon = 'within_6_months'

    else:  # Inspeksi Rutin
        action       = 'monitor'
        time_horizon = 'next_cycle'

    rationale_id = f'{component_type}_{driver.upper()}_{urgency_label.split()[-1].upper()}'
    return _recommendation(component_type, action, time_horizon, urgency_label, driver, rationale_id)


def _recommendation(component_type, action, time_horizon, urgency_label, driver, rationale_id):
    return {
        'component_type': component_type,
        'action':         action,
        'time_horizon':   time_horizon,
        'urgency_label':  urgency_label,
        'primary_driver': driver,
        'rationale_id':   rationale_id,
    }


def recommend_for_asset(per_component_ahi: dict, per_component_fuzzy: dict,
                        latest_measurements: dict | None = None) -> dict:
    """
    Produce per-component recommendations and pick the asset-level headline.

    per_component_ahi   : {ct: calculate_component_ahi() result}
    per_component_fuzzy : {ct: run_inference() result}
    latest_measurements : {ct: float | None}  — GR resistance reading etc.

    Returns:
        per_component     — list of recommendation dicts
        headline          — most urgent recommendation
        action_summary    — human-readable summary e.g. "1 ganti, 2 pantau"
    """
    if latest_measurements is None:
        latest_measurements = {}

    recs = []
    for ct, ahi_result in per_component_ahi.items():
        fuzzy_result = per_component_fuzzy.get(ct, {'label': 'Inspeksi Rutin'})
        measurement  = latest_measurements.get(ct)
        recs.append(recommend_for_component(ct, ahi_result, fuzzy_result, measurement))

    # No components → no recommendations; return an empty rollup instead of crashing.
    if not recs:
        return {
            'per_component':  [],
            'headline':       None,
            'action_summary': '',
        }

    headline = max(recs, key=lambda r: _URGENCY_RANK.get(r['urgency_label'], 0))

    action_counts = {}
    for r in recs:
        action_counts[r['action']] = action_counts.get(r['action'], 0) + 1
    summary_parts = [f"{v} {k}" for k, v in action_counts.items()]
    action_summary = ', '.join(summary_parts)

    return {
        'per_component':  recs,
        'headline':       headline,
        'action_summary': action_summary,
    }
