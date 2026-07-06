"""
Centralized configuration for the Lightning DSS Fuzzy Engine.
All thresholds are research-driven initial values subject to supervisor review.
Adjust these constants to tune system sensitivity without modifying logic code.
"""

import os

# ---------------------------------------------------------------
# INPUT A: Current Stress Ratio (R_stress) Membership Bounds
# R_stress = I_event / I_max_design
# ---------------------------------------------------------------

# Rendah (Low): Trapezoidal [0, 0, 0.20, 0.40]
STRESS_LOW = [0, 0, 0.20, 0.40]

# Sedang (Medium): Triangular [0.30, 0.50, 0.70]
STRESS_MEDIUM = [0.30, 0.50, 0.70]

# Tinggi (High): Trapezoidal [0.60, 0.80, 1.5, 1.5]
STRESS_HIGH = [0.60, 0.80, 1.5, 1.5]

# ---------------------------------------------------------------
# INPUT B: Asset Degradation Index (D_asset) Membership Bounds
# D_asset = 1.0 - AHI
# ---------------------------------------------------------------

DEGRAD_PRIMA = [0, 0, 0.15, 0.30]
DEGRAD_DEGRADASI = [0.20, 0.40, 0.60]
DEGRAD_KRITIS = [0.50, 0.70, 1.0, 1.0]

# ---------------------------------------------------------------
# OUTPUT: Inspection Urgency Index (IUI) Membership Bounds
# Range: 0–100
# ---------------------------------------------------------------

URGENCY_RUTIN = [0, 0, 20, 40]
URGENCY_PRIORITAS = [30, 50, 70]
URGENCY_DARURAT = [60, 80, 100, 100]

# ---------------------------------------------------------------
# AHI (Asset Health Index) Weights — must sum to 1.0
# Overridable via env vars so weights can be tuned without redeployment.
# ---------------------------------------------------------------

W_CUMULATIVE_STRESS = float(os.getenv('W_CUMULATIVE_STRESS', '0.50'))
W_PHYSICAL_CONDITION = float(os.getenv('W_PHYSICAL_CONDITION', '0.30'))
W_CALENDAR_AGE = float(os.getenv('W_CALENDAR_AGE', '0.20'))

_ahi_weight_sum = W_CUMULATIVE_STRESS + W_PHYSICAL_CONDITION + W_CALENDAR_AGE
assert abs(_ahi_weight_sum - 1.0) < 1e-6, (
    f'AHI weights must sum to 1.0, got {_ahi_weight_sum:.6f} '
    f'(W_CUMULATIVE_STRESS={W_CUMULATIVE_STRESS}, '
    f'W_PHYSICAL_CONDITION={W_PHYSICAL_CONDITION}, '
    f'W_CALENDAR_AGE={W_CALENDAR_AGE})'
)

# ---------------------------------------------------------------
# AHI Sub-score Parameters
# ---------------------------------------------------------------

REFERENCE_DAMAGE_THRESHOLD = 10.0
DESIGN_LIFESPAN_YEARS = 25

# ---------------------------------------------------------------
# Absolute Peak-Current Magnitude Classification (kA)
# ---------------------------------------------------------------
# This is a HUMAN-INTERPRETATION LABEL LAYER, independent of the ratio-based
# damage/fuzzy engine (STRESS_* above). It categorises the raw stroke current in
# absolute kA for tropical Indonesia per field-expert validation (LPS practitioner):
#   Kecil <10 kA · Sedang Kecil 10–<30 · Sedang 30–<50 (onset kerusakan >30 kA) · Besar ≥50.
# The 10–15 kA gap the expert left implicit is placed in 'sedang_kecil' (its lower ramp).
# Reference: 3–150 kA spans ~98% of natural cloud-to-ground strokes (log-normal
# distribution, CIGRE TB 549 §3, median first-stroke ≈ 31 kA — consistent with the
# 30 kA damage-onset the expert reports). Used for display + incidental scheduling
# only; it does NOT feed per_event_damage() or the R_stress membership functions.
MAGNITUDE_KA_BANDS = [
    # (label_key, lower_kA_inclusive, upper_kA_exclusive)
    ('kecil',        0.0,  10.0),
    ('sedang_kecil', 10.0, 30.0),
    ('sedang',       30.0, 50.0),
    ('besar',        50.0, 1e9),
]
MAGNITUDE_LABELS = {
    'kecil':        'Kecil',
    'sedang_kecil': 'Sedang Kecil',
    'sedang':       'Sedang',
    'besar':        'Besar',
}
DAMAGE_ONSET_KA = 30.0             # kerusakan biasanya muncul di atas ~30 kA (validasi pakar)
MAGNITUDE_REF_RANGE_KA = (3.0, 150.0)   # rentang yang mencakup ~98% sambaran
MAGNITUDE_REF_PROBABILITY = 0.98
INCIDENTAL_TRIGGER_MAGNITUDE = 'besar'  # sambaran 'besar' memicu inspeksi insidental


def classify_magnitude_ka(ipeak_ka):
    """Return the absolute-magnitude band key ('kecil'|'sedang_kecil'|'sedang'|'besar')
    for a stroke peak current in kA. Returns '' for missing/non-positive input."""
    if ipeak_ka is None:
        return ''
    try:
        val = float(ipeak_ka)
    except (TypeError, ValueError):
        return ''
    if val <= 0:
        return ''
    for label, lo, hi in MAGNITUDE_KA_BANDS:
        if lo <= val < hi:
            return label
    return MAGNITUDE_KA_BANDS[-1][0]  # >= last lower bound → highest band

# ---------------------------------------------------------------
# LPL Design Capacity Map (kA)  [legacy — kept for backward compat]
# ---------------------------------------------------------------

LPL_CAPACITY = {
    'I': 200,
    'II': 150,
    'III': 100,
    'IV': 100,
}

# ---------------------------------------------------------------
# Per-Component LPL Design Capacities
# Source: IEC 62305-1:2010 Table 3 — first positive impulse (10/350 µs)
# All three external LPS components share the same peak-current class
# (IEC 62305-1 §8.2); what differs is the governing parameter per component.
# ---------------------------------------------------------------

LPL_DESIGN_CAPACITY = {
    # I_kA   : peak current (kA)         — governs AT and GR
    # Q_long_C: long-stroke charge (C)    — governs AT arc-root melting
    # W_R_MJohm: specific energy (MJ/Ω)  — governs DC ohmic heating (W/R ∝ I²)
    'I':   {'I_kA': 200, 'Q_long_C': 200, 'W_R_MJohm': 10.0},
    'II':  {'I_kA': 150, 'Q_long_C': 150, 'W_R_MJohm':  5.6},
    'III': {'I_kA': 100, 'Q_long_C': 100, 'W_R_MJohm':  2.5},
    'IV':  {'I_kA': 100, 'Q_long_C': 100, 'W_R_MJohm':  2.5},
}

# Damage exponent per component type (IEC 62305-1 Annex D):
#   AT : d ∝ I   (proxy for Q_long; linear)
#   DC : d ∝ I²  (W/R ∝ I²; quadratic — same current causes disproportionate DC wear)
#   GR : d ∝ I   (soil ionisation onset; linear)
#   BND: d ∝ I   (joint ohmic/mechanical wear; linear in impulse current per IEC 62305-3 Cl.5)
#   SPD: d ∝ I²  (MOV absorbed energy ∝ I²·t; IEC 61643-12 Cl.8 — quadratic)
#   EQP: excluded (sink node; no lightning-current damage modeled)
DAMAGE_EXPONENT = {
    'AT': 1.0,
    'DC': 2.0,
    'GR': 1.0,
    'BND': 1.0,
    'SPD': 2.0,
}

# Aggregation weights for "Overall Health" (AHI_overall) trending number.
# Weights must sum to 1.0 across the five degrading components (EQP excluded: weight 0).
# Re-weighted per field-expert validation (LPS practitioner, Indonesia): the Air Terminal
# and the termination kit (folded into DC as the DC 'TK_Rusak' hard-fail) are reported as
# the MOST FREQUENTLY DAMAGED components in the field, so AT (0.28) and DC (0.26) lead.
# GR lowered to 0.20: still safety-relevant (SNI 03-7015-2004 ≤5 Ω) but not the most
# frequent failure per practitioner experience. SPD (0.16) kept above BND (0.10): the
# sacrificial MOV (Type-1 arrester, internal LPS) ages fastest and is where electronic
# damage propagates ("jangkauan sampai internal LPS"). External LPS (AT+DC+GR = 0.74)
# stays dominant as the primary current-conduction path.
# Source: field-practitioner validation (interpretasi persentase dibuat sendiri), anchored
# on SNI 03-7015-2004 inspection priorities and CIGRE TB 858 "choose to suit the application".
# Flag for thesis: weights are practitioner-informed engineering estimates — AHP
# formalisation is recommended future work (Bab VII Saran). MUST match Bab IV justification.
COMPONENT_WEIGHTS = {
    'AT':  float(os.getenv('W_COMPONENT_AT',  '0.28')),
    'DC':  float(os.getenv('W_COMPONENT_DC',  '0.26')),
    'GR':  float(os.getenv('W_COMPONENT_GR',  '0.20')),
    'BND': float(os.getenv('W_COMPONENT_BND', '0.10')),
    'SPD': float(os.getenv('W_COMPONENT_SPD', '0.16')),
    'EQP': 0.0,  # sink node — excluded from overall health
}
# Guard: overall-health weights (excluding EQP sink) must sum to 1.0.
_component_weight_sum = sum(v for k, v in COMPONENT_WEIGHTS.items() if k != 'EQP')
assert abs(_component_weight_sum - 1.0) < 1e-6, (
    f'COMPONENT_WEIGHTS (excl. EQP) must sum to 1.0, got {_component_weight_sum:.6f}'
)

# Design lifespan per component type (years since install/last replacement),
# selected by SITE_CLIMATE_PROFILE. Temperate baseline:
#   GR 40 yr for copper-clad-steel with 10-13 mils Cu cladding
#       (National Bureau of Standards 45-yr study, cited in Rempe 2003);
#   AT 25 yr (comparable to asset-level lifespan assumption);
#   DC 30 yr (bare Cu/Al conductors are robust; failures are mainly mechanical).
#   BND 30 yr (copper bonding conductors per IEC 62305-3 Annex E; similar to DC).
#   SPD 10 yr (sacrificial MOV device; manufacturer guidance + IEC 61643-12 Cl.9.2;
#              tropical derating to 8 yr for higher flash density and humidity-accelerated
#              metal oxide degradation).
# Tropical Indonesia profile derates ~25% for higher flash density (Hidayat & Ishii 1998)
# and acidic-laterite corrosion (NBS Circular 579). Default stays 'temperate' for backward
# compatibility; per-component LIFESPAN_* env vars still override the selected profile.
# EQP excluded — no lifespan modeled (sink node).
SITE_CLIMATE_PROFILE = os.getenv('SITE_CLIMATE_PROFILE', 'temperate').lower()
_LIFESPAN_PROFILES = {
    'temperate': {'AT': 25, 'DC': 30, 'GR': 40, 'BND': 30, 'SPD': 10},
    'tropical':  {'AT': 20, 'DC': 25, 'GR': 33, 'BND': 25, 'SPD': 8},
}
_lifespan_base = _LIFESPAN_PROFILES.get(SITE_CLIMATE_PROFILE, _LIFESPAN_PROFILES['temperate'])
DESIGN_LIFESPAN_BY_COMPONENT = {
    'AT':  int(os.getenv('LIFESPAN_AT',  str(_lifespan_base['AT']))),
    'DC':  int(os.getenv('LIFESPAN_DC',  str(_lifespan_base['DC']))),
    'GR':  int(os.getenv('LIFESPAN_GR',  str(_lifespan_base['GR']))),
    'BND': int(os.getenv('LIFESPAN_BND', str(_lifespan_base['BND']))),
    'SPD': int(os.getenv('LIFESPAN_SPD', str(_lifespan_base['SPD']))),
}

# Hard-fail status values: a confirmed functional failure of the component.
# Single source of truth for three behaviours: (1) zero the component AHI
# (weakest-link override, see CONDITION_FACTOR below), (2) emit an immediate-replace
# recommendation, and (3) fire a `component_hard_fail` notification.
# Rationale: the full LPS is a functional series chain AT -> DC -> GR -> BND -> SPD -> EQP
# (IEC 62305-3:2010 Sec.5 external + IEC 62305-4 internal LPS); any broken link destroys
# the protection function, so the observed-failure statuses below are replacement triggers
# per IEC 62305-3 Clause 7 / IEC 62305-4 Cl.5.
# 'High_Resistance' is included for GR because >5 ohm violates SNI 03-7015:2004 Sec.6.5.7 /
# PUIL 2011 even when no numeric reading is supplied (numeric path:
# GR_RESISTANCE_REPLACE_THRESHOLD_OHM).
# 'Terputus' for BND: open bonding conductor per IEC 62305-3 Cl.5.4 failure criterion.
# 'Failed' for SPD: MOV device destroyed; no protective function (IEC 61643-11 Cl.7).
# 'TK_Rusak' for DC: the termination kit (bonding/clamp assembly joining the down
# conductor to the air-termination and to earth) is folded into DC per the Indonesian
# component taxonomy AT / (DC + termination kit) / GR. A damaged termination kit breaks
# the down-conductor current path — functionally equivalent to 'Putus' (open conductor),
# so it is a DC hard-fail. Practitioners report AT + termination kit as the most
# frequently damaged parts (reflected in COMPONENT_WEIGHTS).
HARD_FAIL_STATUSES = {
    'AT':  {'Meleleh', 'Rusak'},
    'DC':  {'Putus', 'TK_Rusak'},
    'GR':  {'High_Resistance'},
    'BND': {'Terputus'},
    'SPD': {'Failed'},
}

# SPD (Type-1 surge arrester) proactive-inspection triggers — see check_component_lifespan.
# The arrester is internal LPS at the LPZ0/LPZ1 boundary (service entrance), bonded to the
# Main Earthing Terminal / equipotential bonding bar together with the grounding electrode
# (IEC 62305-4 Cl.5.3 & 5.4; IEC 61643-11 Type 1; mandatory where an external LPS exists per
# IEC 60364-5-53). Field practice: re-inspect every 5 years OR after ~25 recorded strikes,
# because electronic damage propagates through this shared-earth path first.
SPD_INSPECTION_INTERVAL_YEARS = int(os.getenv('SPD_INSPECTION_INTERVAL_YEARS', '5'))
SPD_INSPECTION_STRIKE_COUNT   = int(os.getenv('SPD_INSPECTION_STRIKE_COUNT', '25'))

# Periodic (calendar) inspection cadence for 'besar'-strike-exposed assets: biyearly =
# twice a year (semiannual). Complements the condition-based engine with a baseline cycle.
PERIODIC_INSPECTION_MONTHS = int(os.getenv('PERIODIC_INSPECTION_MONTHS', '6'))

# SNI 03-7015-2004 §6.5.7 and PUIL 2011 require grounding resistance <= 5 ohm for
# lightning-protection installations in Indonesia; above this, replacement is required.
GR_RESISTANCE_REPLACE_THRESHOLD_OHM = float(os.getenv('GR_RESISTANCE_THRESHOLD', '5.0'))

# SPD leakage current threshold: rising resistive leakage current (I_L) is the standard
# MOV end-of-life indicator per IEC 61643-12 Cl.8.2 and manufacturer guidance.
# IEC 61643-11 Cl.7.7 marks a device for replacement when I_L exceeds the manufacturer
# reference; 1.0 mA is a widely-cited conservative field limit (engineering estimate —
# verify against installed device datasheet).
SPD_LEAKAGE_REPLACE_THRESHOLD_MA = float(os.getenv('SPD_LEAKAGE_THRESHOLD_MA', '1.0'))

# ---------------------------------------------------------------
# Tropical Soil Corrosion Penalty
# ---------------------------------------------------------------

SOIL_RESISTIVITY_THRESHOLD = 10   # Ω·m
CORROSION_PENALTY = 0.05

# ---------------------------------------------------------------
# Physical Condition Factor (CF) — the physical sub-score itself.
#
# CF is taken from the discrete condition-criteria scoring of the established Health
# Index methodology: A.N. Jahromi, R. Piercy, S. Cress, J.R.R. Service & W. Fan,
# "An Approach to Power Transformer Asset Management Using Health Index," IEEE
# Electrical Insulation Magazine 25(2):20-34, 2009 — each observed condition parameter
# is scored on a 0-4 ladder (4 = as-new ... 0 = failed) combined by weighted sum.
# Normalised to [0,1] this is the standard {1.00, 0.75, 0.50, 0.25, 0.00} ladder.
#
# The scoring *scale* is asset-agnostic (Jahromi 2009); the per-status grade
# *assignment* is anchored to the LPS maintenance/inspection criteria of
# IEC 62305-3:2010 Clause 7:
#   OK          -> 4 (1.00)  as-new
#   Terkorosi   -> 3 (0.75)  surface corrosion; cross-section still >= IEC 62305-3
#                            Table 6 minimum (ASTM G57 gradual corrosivity band)
#   Klem_Lepas  -> 2 (0.50)  IEC 62305-3 Cl.7 "loose connections" finding; repairable
#   Bengkok     -> 2 (0.50)  mechanical deformation, no cross-section loss yet
#   Rusak /     -> 0 (0.00)  IEC 62305-3 Cl.7 replacement triggers ("cross-section
#   Meleleh /                reduced below minimum" / "deformation by lightning");
#   Putus /                  Putus = open series chain; High_Resistance = >5 ohm
#   High_Resistance          (SNI 03-7015:2004 Cl.6.5.7 / PUIL 2011). These are also
#                            HARD_FAIL_STATUSES, so the component AHI is zeroed outright
#                            (weakest-link override) rather than merely down-weighted.
# ---------------------------------------------------------------

CONDITION_FACTOR = {
    'OK': 1.00,
    'Terkorosi': 0.75,
    'Klem_Lepas': 0.50,
    'Bengkok': 0.50,
    'Longgar': 0.50,    # BND loose joint — IEC 62305-3 Cl.5.4 "loose connection" finding
    'Degraded': 0.50,   # SPD partial MOV wear — IEC 61643-11 Cl.7 "degraded but functional"
    'Rusak': 0.00,
    'Meleleh': 0.00,
    'Putus': 0.00,
    'TK_Rusak': 0.00,   # DC termination kit damaged — open DC path, hard-fail like Putus
    'Terputus': 0.00,   # BND open circuit — hard-fail, same ladder position as Putus
    'Failed': 0.00,     # SPD destroyed — hard-fail per IEC 61643-11 Cl.7
    'High_Resistance': 0.00,
}

# ---------------------------------------------------------------
# Feedback Loop Parameters
# ---------------------------------------------------------------

LEARNING_RATE = 0.5
RECOVERY_RATE = 0.1

EXPECTED_DAMAGE = {
    'Inspeksi Rutin': 0.1,
    'Inspeksi Prioritas': 0.3,
    'Inspeksi Darurat': 0.6,
}

SEVERITY_MAP = {
    'OK': 0.0,
    'Terkorosi': 0.1,
    'Rusak': 0.2,
    'Meleleh': 0.3,
    'Klem_Lepas': 0.15,
    'Bengkok': 0.25,
    'Putus': 0.4,
    'TK_Rusak': 0.4,    # DC termination kit damaged — same tier as Putus (open DC path)
    'High_Resistance': 0.2,
    'Longgar': 0.15,    # BND loose — same severity tier as Klem_Lepas
    'Terputus': 0.4,    # BND open — same tier as Putus
    'Degraded': 0.2,    # SPD partial wear
    'Failed': 0.4,      # SPD destroyed
}

# ---------------------------------------------------------------
# Urgency Label Thresholds
# ---------------------------------------------------------------

URGENCY_LABEL_THRESHOLDS = {
    'Inspeksi Rutin': (0, 35),
    'Inspeksi Prioritas': (35, 65),
    'Inspeksi Darurat': (65, 100),
}
