"""
Per-Component Asset Health Index (AHI) Calculator.

Each component (AT / DC / GR) has its own AHI:
    component_AHI = W_STRESS · stress_score
                  + W_PHYS   · physical_score
                  + W_AGE    · age_score

The asset-level aggregate returns two numbers (CIGRE TB 858 hybrid pattern):
    AHI_safety  = min(component_AHI)   — safety-critical; feeds fuzzy engine
    AHI_overall = Σ wᵢ · AHIᵢ         — trending; shown as secondary gauge

Per-event damage formulas (IEC 62305-1:2010 Annex D, Table 3):
    AT: d = (I_peak / I_max) ^ 1   — linear  (proxy for Q_long charge)
    DC: d = (I_peak / I_max) ^ 2   — quadratic (W/R ∝ I²)
    GR: d = (I_peak / I_max) ^ 1   — linear  (soil ionisation at peak I)
"""
import datetime
from . import fuzzy_config as cfg


# ---------------------------------------------------------------------------
# Per-event damage
# ---------------------------------------------------------------------------

def per_event_damage(component_type: str, i_peak_ka: float, lpl_class: str) -> float:
    """
    Fractional damage a single strike inflicts on one component.
    Capped at 1.0 (conductor either survives or is destroyed — no >100% damage).
    """
    i_max = cfg.LPL_DESIGN_CAPACITY[lpl_class]['I_kA']
    ratio = min(i_peak_ka / i_max, 1.0)
    return ratio ** cfg.DAMAGE_EXPONENT[component_type]


# ---------------------------------------------------------------------------
# Sub-score calculators (per component)
# ---------------------------------------------------------------------------

def _stress_score(component_type: str, lpl_class: str, events_since_install) -> float:
    """Miner's Rule cumulative damage, normalised against the reference threshold."""
    total = sum(
        per_event_damage(component_type, e.estimasi_arus_puncak_ka, lpl_class)
        for e in events_since_install
    )
    return max(1.0 - total / cfg.REFERENCE_DAMAGE_THRESHOLD, 0.0)


def _physical_score(latest_status) -> float:
    """
    Condition factor (CF) from the latest inspection status for this component.

    CF is the physical sub-score directly (normalised Jahromi et al. 2009 condition
    ladder; see cfg.CONDITION_FACTOR). An unknown/unset status defaults to as-new (1.0).
    """
    if latest_status is None:
        return 1.0
    return cfg.CONDITION_FACTOR.get(latest_status.status, 1.0)


def _age_score(install_date: datetime.date, component_type: str) -> float:
    """Linear degradation over component-specific design lifespan."""
    age_years = (datetime.date.today() - install_date).days / 365.25
    lifespan = cfg.DESIGN_LIFESPAN_BY_COMPONENT[component_type]
    return max(1.0 - age_years / lifespan, 0.0)


# ---------------------------------------------------------------------------
# Per-component AHI
# ---------------------------------------------------------------------------

def calculate_component_ahi(component, asset) -> dict:
    """
    Compute AHI for a single AssetComponent.

    Returns dict:
        ahi, sub_scores {stress, physical, age}, corrosion_applied
    """
    # EQP is the terminal sink node — no lightning-current damage model applies.
    # Fixed AHI 1.0, weight 0: it anchors the chain's "real end" without distorting
    # safety (min) or overall (weighted sum) aggregation.
    if component.component_type == 'EQP':
        return {
            'ahi': 1.0,
            'sub_scores': {'stress': 1.0, 'physical': 1.0, 'age': 1.0},
            'corrosion_applied': False,
            'hard_failed': False,
            'latest_status': None,
            'strikes_since_install': 0,
        }

    # Only count strikes after this component was installed (resets on replacement).
    # Materialize once: it's iterated by _stress_score below and counted for the return dict,
    # so a list avoids a second COUNT query.
    events_since_install = list(asset.events.filter(
        timestamp__date__gte=component.install_date
    ))

    # Latest inspection status for this specific component
    latest_status = (
        component.status_history
        .select_related('inspection')
        .order_by('-inspection__tgl_inspeksi')
        .first()
    )

    # A repair action after the latest inspection clears the physical penalty.
    # Stress and age are untouched — only `ganti` (replace) resets those clocks.
    if latest_status is not None:
        latest_repair = (
            component.maintenance_actions
            .filter(action='repair', performed_at__gt=latest_status.inspection.tgl_inspeksi)
            .order_by('-performed_at')
            .first()
        )
        if latest_repair is not None:
            latest_status = None

    stress  = _stress_score(component.component_type, asset.lpl_grade, events_since_install)
    physical = _physical_score(latest_status)
    age     = _age_score(component.install_date, component.component_type)

    corrosion_applied = False
    if (
        component.component_type == 'GR'
        and asset.resistivitas_tanah is not None
        and asset.resistivitas_tanah < cfg.SOIL_RESISTIVITY_THRESHOLD
    ):
        age = max(age - cfg.CORROSION_PENALTY, 0.0)
        corrosion_applied = True

    ahi = (
        cfg.W_CUMULATIVE_STRESS * stress
        + cfg.W_PHYSICAL_CONDITION * physical
        + cfg.W_CALENDAR_AGE * age
    )

    # Weakest-link override: a confirmed functional failure (hard-fail status) means the
    # component cannot perform its protective role, so its AHI collapses to 0 regardless of
    # how favourable the stress/age proxies look. The LPS is a functional series chain
    # AT -> DC -> GR -> BND -> SPD -> SHD -> EQP (external LPS IEC 62305-3:2010 Sec.5 + internal
    # LPS IEC 62305-4 Sec.5: BND = equipotential bonding, SPD = Type-1 surge arrester bonded
    # to the earthing system near GR at the LPZ0/1 boundary, SHD = spatial/magnetic shielding
    # per IEC 62305-4 Cl.5.2); a broken link destroys the protection function (reinforced by
    # Birnbaum reliability importance for series systems).
    status_str = latest_status.status if latest_status is not None else None
    hard_failed = status_str in cfg.HARD_FAIL_STATUSES.get(component.component_type, set())
    if hard_failed:
        ahi = 0.0

    return {
        'ahi': round(ahi, 4),
        'sub_scores': {
            'stress':   round(stress, 4),
            'physical': round(physical, 4),
            'age':      round(age, 4),
        },
        'corrosion_applied': corrosion_applied,
        'hard_failed':       hard_failed,
        'latest_status':     status_str,
        'strikes_since_install': len(events_since_install),
    }


# ---------------------------------------------------------------------------
# Asset-level aggregation
# ---------------------------------------------------------------------------

def aggregate_asset_ahi(component_results: dict) -> dict:
    """
    Combine per-component AHI values into the hybrid asset-level score.

    component_results: {component_type: calculate_component_ahi(...) result}

    Returns:
        safety        — min(component AHI); safety-critical; fed to fuzzy engine
        overall       — weighted mean; trending / fleet-ranking number
        worst_component — component_type with the lowest AHI
        per_component — full per-component detail
    """
    ahi_by_type = {ct: r['ahi'] for ct, r in component_results.items()}

    # An asset with no active components has no measurable degradation to report.
    # Return a neutral (healthy) aggregate instead of crashing on empty min()/sum().
    if not ahi_by_type:
        return {
            'ahi_safety':      1.0,
            'ahi_overall':     1.0,
            'worst_component': None,
            'per_component':   {},
        }

    safety  = min(ahi_by_type.values())
    overall = sum(cfg.COMPONENT_WEIGHTS[ct] * v for ct, v in ahi_by_type.items())
    worst   = min(ahi_by_type, key=ahi_by_type.get)

    return {
        'ahi_safety':       round(safety, 4),
        'ahi_overall':      round(overall, 4),
        'worst_component':  worst,
        'per_component':    component_results,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def calculate_asset_health(asset) -> dict:
    """
    Compute the full per-component AHI breakdown for an asset.

    Returns the aggregate_asset_ahi dict.
    """
    active_components = list(
        asset.components.filter(end_date__isnull=True, deleted_at__isnull=True)
        .order_by('component_type')
    )

    component_results = {
        c.component_type: calculate_component_ahi(c, asset)
        for c in active_components
    }

    return aggregate_asset_ahi(component_results)


# ---------------------------------------------------------------------------
# Legacy shim — keeps callers that used calculate_ahi() working until removed
# ---------------------------------------------------------------------------

def calculate_ahi(asset, _events=None, _latest_inspection=None):
    """
    Deprecated: monolithic asset-level AHI. Use calculate_asset_health() instead.
    Returns the legacy dict shape for backward compatibility.
    """
    result = calculate_asset_health(asset)
    worst_ct = result['worst_component']
    worst = result['per_component'].get(worst_ct, {})

    return {
        'ahi':             result['ahi_safety'],
        'd_asset':         round(1.0 - result['ahi_safety'], 4),
        'sub_scores':      worst.get('sub_scores', {}),
        'corrosion_applied': worst.get('corrosion_applied', False),
    }
