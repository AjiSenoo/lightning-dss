"""
Centralized configuration for the Lightning DSS Fuzzy Engine.
All thresholds are research-driven initial values subject to supervisor review.
Adjust these constants to tune system sensitivity without modifying logic code.
"""

# ═══════════════════════════════════════════════════════════════
# INPUT A: Current Stress Ratio (R_stress) Membership Bounds
# R_stress = I_event / I_max_design
# ═══════════════════════════════════════════════════════════════

# Rendah (Low): Trapezoidal [0, 0, 0.20, 0.40]
STRESS_LOW = [0, 0, 0.20, 0.40]

# Sedang (Medium): Triangular [0.30, 0.50, 0.70]
STRESS_MEDIUM = [0.30, 0.50, 0.70]

# Tinggi (High): Trapezoidal [0.60, 0.80, 1.5, 1.5]
STRESS_HIGH = [0.60, 0.80, 1.5, 1.5]

# ═══════════════════════════════════════════════════════════════
# INPUT B: Asset Degradation Index (D_asset) Membership Bounds
# D_asset = 1.0 - AHI
# ═══════════════════════════════════════════════════════════════

DEGRAD_PRIMA = [0, 0, 0.15, 0.30]
DEGRAD_DEGRADASI = [0.20, 0.40, 0.60]
DEGRAD_KRITIS = [0.50, 0.70, 1.0, 1.0]

# ═══════════════════════════════════════════════════════════════
# OUTPUT: Inspection Urgency Index (IUI) Membership Bounds
# Range: 0–100
# ═══════════════════════════════════════════════════════════════

URGENCY_RUTIN = [0, 0, 20, 40]
URGENCY_PRIORITAS = [30, 50, 70]
URGENCY_DARURAT = [60, 80, 100, 100]

# ═══════════════════════════════════════════════════════════════
# AHI (Asset Health Index) Weights — must sum to 1.0
# ═══════════════════════════════════════════════════════════════

W_CUMULATIVE_STRESS = 0.50
W_PHYSICAL_CONDITION = 0.30
W_CALENDAR_AGE = 0.20

# ═══════════════════════════════════════════════════════════════
# AHI Sub-score Parameters
# ═══════════════════════════════════════════════════════════════

REFERENCE_DAMAGE_THRESHOLD = 10.0
DESIGN_LIFESPAN_YEARS = 25

# ═══════════════════════════════════════════════════════════════
# LPL Design Capacity Map (kA)
# ═══════════════════════════════════════════════════════════════

LPL_CAPACITY = {
    'I': 200,
    'II': 150,
    'III': 100,
    'IV': 100,
}

# ═══════════════════════════════════════════════════════════════
# Tropical Soil Corrosion Penalty
# ═══════════════════════════════════════════════════════════════

SOIL_RESISTIVITY_THRESHOLD = 10   # Ω·m
CORROSION_PENALTY = 0.05

# ═══════════════════════════════════════════════════════════════
# Component Damage Penalties (for Physical Condition sub-score)
# ═══════════════════════════════════════════════════════════════

COMPONENT_PENALTY = {
    'OK': 0.0,
    'Rusak': 0.15,
    'Meleleh': 0.20,
    'Terkorosi': 0.10,
    'Klem_Lepas': 0.15,
    'Bengkok': 0.20,
    'Putus': 0.30,
    'High_Resistance': 0.20,
}

# ═══════════════════════════════════════════════════════════════
# Feedback Loop Parameters
# ═══════════════════════════════════════════════════════════════

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
    'High_Resistance': 0.2,
}

# ═══════════════════════════════════════════════════════════════
# Urgency Label Thresholds
# ═══════════════════════════════════════════════════════════════

URGENCY_LABEL_THRESHOLDS = {
    'Inspeksi Rutin': (0, 35),
    'Inspeksi Prioritas': (35, 65),
    'Inspeksi Darurat': (65, 100),
}
