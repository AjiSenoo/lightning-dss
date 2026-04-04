"""
Lightning DSS Fuzzy Engine.

Exports the three main functions used by the Django views:
- run_inference(r_stress, d_asset) → {score, label}
- calculate_ahi(asset, events, latest_inspection) → {ahi, d_asset, sub_scores}
- update_asset_health(asset, inspection_log, linked_event) → {health_before, health_after, ...}
"""
from .inference import run_inference
from .health_index import calculate_ahi
from .feedback import update_asset_health

__all__ = ['run_inference', 'calculate_ahi', 'update_asset_health']
