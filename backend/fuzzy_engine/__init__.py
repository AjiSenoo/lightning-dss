"""
Lightning DSS Fuzzy Engine.

Legacy exports (backward-compat):
- run_inference(r_stress, d_asset) → {score, label}
- calculate_ahi(asset, ...) → {ahi, d_asset, sub_scores}   # shim; use calculate_asset_health()
- update_asset_health(asset, inspection_log, linked_event) → {health_before, health_after, ...}

New per-component exports:
- calculate_asset_health(asset) → {ahi_safety, ahi_overall, worst_component, per_component}
- run_inference_per_component(r_stress, component_ahis) → {asset, per_component}
- recommend_for_asset(per_component_ahi, per_component_fuzzy, latest_measurements) → {...}
"""
from .inference import run_inference, run_inference_per_component
from .health_index import calculate_ahi, calculate_asset_health
from .feedback import update_asset_health
from .recommendations import recommend_for_asset

__all__ = [
    'run_inference', 'calculate_ahi', 'update_asset_health',
    'run_inference_per_component', 'calculate_asset_health', 'recommend_for_asset',
]
