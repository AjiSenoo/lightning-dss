"""
Mamdani Fuzzy Inference System for Lightning Protection Inspection Urgency.

Pipeline: Fuzzification → Rule Evaluation (Max-Min) → Aggregation → Centroid Defuzzification

Inputs:
    R_stress (0.0–1.5): Current stress ratio = Ipeak / design capacity
    D_asset  (0.0–1.0): Asset degradation index = 1.0 - AHI

Output:
    IUI (0–100): Inspection Urgency Index
    Label: "Inspeksi Rutin" / "Inspeksi Prioritas" / "Inspeksi Darurat"
"""
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
from . import fuzzy_config as cfg


def _build_fuzzy_system():
    """
    Construct the fuzzy control system with membership functions and rules.
    Built once, reused for all inferences.
    """
    r_stress = ctrl.Antecedent(np.arange(0, 1.51, 0.01), 'r_stress')
    d_asset = ctrl.Antecedent(np.arange(0, 1.01, 0.01), 'd_asset')
    iui = ctrl.Consequent(np.arange(0, 101, 1), 'iui')

    # Membership functions for R_stress
    r_stress['rendah'] = fuzz.trapmf(r_stress.universe, cfg.STRESS_LOW)
    r_stress['sedang'] = fuzz.trimf(r_stress.universe, cfg.STRESS_MEDIUM)
    r_stress['tinggi'] = fuzz.trapmf(r_stress.universe, cfg.STRESS_HIGH)

    # Membership functions for D_asset
    d_asset['prima'] = fuzz.trapmf(d_asset.universe, cfg.DEGRAD_PRIMA)
    d_asset['degradasi'] = fuzz.trimf(d_asset.universe, cfg.DEGRAD_DEGRADASI)
    d_asset['kritis'] = fuzz.trapmf(d_asset.universe, cfg.DEGRAD_KRITIS)

    # Membership functions for IUI (output)
    iui['rutin'] = fuzz.trapmf(iui.universe, cfg.URGENCY_RUTIN)
    iui['prioritas'] = fuzz.trimf(iui.universe, cfg.URGENCY_PRIORITAS)
    iui['darurat'] = fuzz.trapmf(iui.universe, cfg.URGENCY_DARURAT)

    iui.defuzzify_method = 'centroid'

    # 9 Rules (3×3 matrix)
    rules = [
        # R_stress = Rendah
        ctrl.Rule(r_stress['rendah'] & d_asset['prima'],     iui['rutin']),
        ctrl.Rule(r_stress['rendah'] & d_asset['degradasi'], iui['rutin']),
        ctrl.Rule(r_stress['rendah'] & d_asset['kritis'],    iui['prioritas']),
        # R_stress = Sedang
        ctrl.Rule(r_stress['sedang'] & d_asset['prima'],     iui['rutin']),
        ctrl.Rule(r_stress['sedang'] & d_asset['degradasi'], iui['prioritas']),
        ctrl.Rule(r_stress['sedang'] & d_asset['kritis'],    iui['darurat']),
        # R_stress = Tinggi
        ctrl.Rule(r_stress['tinggi'] & d_asset['prima'],     iui['prioritas']),
        ctrl.Rule(r_stress['tinggi'] & d_asset['degradasi'], iui['darurat']),
        ctrl.Rule(r_stress['tinggi'] & d_asset['kritis'],    iui['darurat']),
    ]

    system = ctrl.ControlSystem(rules)
    return system


# Module-level singleton — built once on import
_fuzzy_system = _build_fuzzy_system()


def _score_to_label(score):
    """Map numeric IUI score to Indonesian urgency label."""
    for label, (low, high) in cfg.URGENCY_LABEL_THRESHOLDS.items():
        if low <= score < high:
            return label
    return 'Inspeksi Darurat'


def run_inference(r_stress_value, d_asset_value):
    """
    Execute the Mamdani fuzzy inference pipeline.

    Returns dict: score, label, r_stress_input, d_asset_input
    """
    r_stress_clamped = max(0.0, min(float(r_stress_value), 1.5))
    d_asset_clamped = max(0.0, min(float(d_asset_value), 1.0))

    sim = ctrl.ControlSystemSimulation(_fuzzy_system)
    sim.input['r_stress'] = r_stress_clamped
    sim.input['d_asset'] = d_asset_clamped

    try:
        sim.compute()
        score = float(sim.output['iui'])
    except Exception:
        # Conservative fallback if defuzzification fails
        score = (r_stress_clamped / 1.5 * 50) + (d_asset_clamped * 50)

    score = max(0.0, min(score, 100.0))
    label = _score_to_label(score)

    return {
        'score': round(score, 2),
        'label': label,
        'r_stress_input': r_stress_clamped,
        'd_asset_input': d_asset_clamped,
    }
