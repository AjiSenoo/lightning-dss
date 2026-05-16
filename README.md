# Lightning DSS — Sistem Pendukung Keputusan Pemeliharaan Sistem Proteksi Petir

A web-based Decision Support System (DSS) for Condition-Based Maintenance (CBM) of lightning protection systems on industrial assets, built as a final project (Tugas Akhir) by **Akmal Galih Aji Sugmo Seno (18222046)**.

---

## Overview

Lightning protection equipment degrades over time and gets stressed by actual strikes. This system uses **Condition-Based Maintenance (CBM)** — inspect and act based on actual asset condition, not a fixed calendar — backed by a **Mamdani Fuzzy Inference System** that produces a maintenance urgency score for each asset.

### Core Logic

Two inputs feed into the fuzzy engine:

| Input | Description |
|-------|-------------|
| **R_stress** (Rasio Stres) | Peak strike current ÷ asset design capacity |
| **D_asset** (Degradasi Aset) | Composite degradation: wear + age + physical condition |

The engine produces an **IUI (Indeks Urgensi Inspeksi) score (0–100)** mapped to one of three urgency levels:

| Score | Label | Action |
|-------|-------|--------|
| 0–40 | **Rutin** | Schedule in next routine cycle |
| 40–70 | **Prioritas** | Inspect within 30 days |
| 70–100 | **Darurat** | Immediate inspection required |

### Fuzzy Rule Matrix (3×3)

|  | R_stress = Rendah | R_stress = Sedang | R_stress = Tinggi |
|--|:-:|:-:|:-:|
| **D_asset = Prima** | Rutin | Rutin | Prioritas |
| **D_asset = Degradasi** | Rutin | Prioritas | Darurat |
| **D_asset = Kritis** | Prioritas | Darurat | Darurat |

### Feedback Loop

After each inspection, the technician logs the condition of 3 physical components. The asset health score updates **asymmetrically**:
- Bad finding → health drops fast (**penalty rate 0.5×**)
- Good finding → health recovers slowly (**recovery rate 0.1×**)

This 5:1 ratio reflects reality: damage accumulates faster than recovery.

---

## Architecture

```
lightning-dss/
├── backend/                  # Django 4.2 + Django REST Framework
│   ├── config/               # Settings, URLs, WSGI
│   ├── core/                 # Models, serializers, views, admin
│   │   └── management/commands/seed_demo.py
│   └── fuzzy_engine/         # Mamdani fuzzy inference system
│       ├── fuzzy_config.py   # All thresholds and membership function params
│       ├── health_index.py   # Asset Health Index (AHI) calculation
│       ├── inference.py      # scikit-fuzzy Mamdani engine (9 rules)
│       └── feedback.py       # Asymmetric health score update loop
└── frontend/                 # React 18 + Vite + Tailwind CSS
    └── src/
        ├── api/              # Axios client
        ├── components/       # Layout, AssetMap, FuzzyVisualizer, charts
        ├── hooks/            # useNetworkStatus, useOfflineSubmit
        ├── offline/          # IndexedDB store, sync queue, fuzzy lookup table
        ├── pages/            # Dashboard, AssetPortfolio, AssetDetail,
        │                     # EventInput, LogbookForm, Recommendation
        └── utils/            # Constants, formatters
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 4.2, Django REST Framework |
| Fuzzy Engine | scikit-fuzzy (Mamdani), NumPy |
| Database | SQLite (dev) / PostgreSQL (prod via `DATABASE_URL`) |
| Frontend | React 18, Vite, Tailwind CSS |
| Charts | Recharts |
| Map | React-Leaflet |
| Offline | IndexedDB (idb), 30s sync queue |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd lightning-dss
./start-backend.sh
```

This will:
1. Create a Python virtual environment
2. Install all dependencies
3. Run Django migrations
4. Seed 5 demo assets
5. Start the dev server at **http://localhost:8000**

### Frontend

```bash
./start-frontend.sh
```

This will:
1. Install npm dependencies (first run only)
2. Start the Vite dev server at **http://localhost:5173**

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | SQLite | PostgreSQL connection string for production |
| `VITE_API_URL` | `http://localhost:8000/api` | Backend API base URL |
| `W_CUMULATIVE_STRESS` | `0.50` | AHI weight for cumulative strike stress |
| `W_PHYSICAL_CONDITION` | `0.30` | AHI weight for physical component condition |
| `W_CALENDAR_AGE` | `0.20` | AHI weight for installation age |

> The three AHI weights must sum to `1.0`. The fuzzy engine asserts this on import and fails fast if misconfigured.

---

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assets/` | List all assets with health scores |
| `POST` | `/api/events/` | Log a lightning strike → triggers fuzzy inference |
| `POST` | `/api/inspections/` | Submit inspection log → triggers feedback loop |
| `GET` | `/api/fuzzy/simulate/?r_stress=X&d_asset=Y` | Interactive fuzzy simulation |
| `POST` | `/api/events/batch/` | Offline sync — bulk event upload |
| `POST` | `/api/inspections/batch/` | Offline sync — bulk inspection upload |
| `GET` | `/api/health/` | Ping for offline detection |

---

## Demo Assets

Five pre-seeded assets covering different LPL grades and soil conditions:

| Asset | LPL | Notes |
|-------|-----|-------|
| Kilang Balongan - Unit Distilasi | I | High-risk petrochemical |
| Menara BTS Cinere | IV | Soil 8.5 Ω·m → corrosion penalty |
| Gardu Induk PLN Suralaya | II | Power substation |
| Gedung Lab STEI ITB | III | Research facility |
| Tangki LPG Cilacap | I | Soil 6.0 Ω·m → corrosion penalty |

---

## Offline Support

The system is designed for use in remote industrial areas with unreliable connectivity:

- Events and inspections are queued in **IndexedDB** when offline
- A **30-second sync loop** uploads queued items when connectivity returns
- A **3×3 discrete lookup table** provides approximate urgency estimates while offline
- Network status is checked via a 15-second ping to `/api/health/`

---

## License

This project is part of a final undergraduate thesis at Institut Teknologi Bandung (ITB). All rights reserved.
