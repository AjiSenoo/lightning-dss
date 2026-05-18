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

## Features

### Roles

Two roles are enforced throughout the system:

| Role | Capabilities |
|------|-------------|
| **Teknisi** | Submit inspections, log lightning events, view all data for their org |
| **Manajer** | All Teknisi capabilities + manage assets, manage users, verify inspections, soft-delete/restore, access trash |

### Asset Management (Manajer only — full CRUD with audit parity)

- **Create/Edit** assets via modal form: name, GPS, LPL grade (I–IV), installation year, conductor material, soil resistivity, notes
- **Soft-delete + Trash + Restore** — "Hapus" moves assets to Tempat Sampah (recoverable); hard-delete is blocked while any inspection or event still references the asset
- **Audit trail** — every create/edit/delete/restore writes an `AssetAudit` row with field-level diff; visible as "Riwayat Perubahan" timeline on the asset detail page
- **Notifications** — all org users receive in-app notifications on asset create/update/delete/restore

### Inspection Logs (Laporan)

- Teknisi submits inspections with required (air terminal, down conductor, grounding) and optional (SPD, bonding, cable) component statuses plus photos
- **5-minute grace window** for the submitter to freely edit their own log
- **Amendment chain** — after the grace window, correcting a log creates a new linked amendment log (preserving the original)
- **Full audit trail** via `InspectionLogAudit`: every create/edit/photo/amend/delete/restore/verify/request_revision action is recorded with field-level diffs
- **Soft-delete + Trash + Restore** — deleted logs are held for 7 days before auto-purge; restorable by Manajer

### Manager Verification (Verifikasi)

Post-hoc, irreversible verification system for inspection logs:

| State | Description |
|-------|-------------|
| **Belum Diverifikasi** | Default; submitter can amend after grace |
| **Revisi Diminta** | Manager requested changes (with note); teknisi can amend |
| **Terverifikasi** | **Terminal** — manager confirmed the log is correct; cannot be undone |

Key invariants:
- Verification is **permanent** — there is no "unverify" action
- Once verified, the teknisi (original submitter) is **locked out** of editing or amending the log
- Managers can still edit/amend verified logs (producing an "Edited after verification" warning chip in the UI)
- The `edited_after_verification` flag surfaces as a visible amber chip so reviewers know the stamp may not reflect the latest content
- `POST /api/inspections/:id/verify/` → 409 if already verified or in trash
- `POST /api/inspections/:id/request_revision/` → 409 if verified; requires a non-empty note

### Notification System

Real-time in-app notification bell (polled every 30 s):
- Inspection create/edit/amend/delete/restore → managers notified
- Manager verify/request_revision → log submitter notified
- Lightning event recorded → teknisi in the org notified
- Stale asset (overdue for inspection) → managers notified (with cooldown)
- Asset create/edit/delete/restore → all org users notified

### Offline Support

Designed for remote industrial sites with unreliable connectivity:
- Events and inspections are queued in **IndexedDB** when offline
- A **30-second sync loop** uploads queued items when connectivity returns
- A **3×3 discrete lookup table** provides approximate urgency estimates offline
- Network status is checked via a 15-second ping to `/api/health/`

---

## Architecture

```
lightning-dss/
├── backend/                  # Django 4.2 + Django REST Framework
│   ├── config/               # Settings, URLs, WSGI
│   ├── core/                 # Models, serializers, views, admin, permissions
│   │   ├── models.py         # AssetRegistry, AssetAudit, InspectionLog,
│   │   │                     # InspectionLogAudit, LightningEvent,
│   │   │                     # Notification, User, Organization
│   │   └── management/commands/
│   │       ├── seed_demo.py            # Demo data for 2 orgs, 5 assets, users, logs
│   │       └── check_stale_inspections.py  # Cron: notify on overdue assets
│   └── fuzzy_engine/         # Mamdani fuzzy inference system
│       ├── fuzzy_config.py   # All thresholds and membership function params
│       ├── health_index.py   # Asset Health Index (AHI) calculation
│       ├── inference.py      # scikit-fuzzy Mamdani engine (9 rules)
│       └── feedback.py       # Asymmetric health score update loop
└── frontend/                 # React 18 + Vite + Tailwind CSS
    └── src/
        ├── api/              # Axios client
        ├── auth/             # AuthContext, ProtectedRoute, ManagerOnly
        ├── components/       # Layout, AssetForm, AssetMap, VerificationChip,
        │                     # NotificationBell, FuzzyVisualizer, charts
        ├── hooks/            # useNetworkStatus, useOfflineSubmit
        ├── offline/          # IndexedDB store, sync queue, fuzzy lookup table
        ├── pages/            # Dashboard, AssetPortfolio, AssetDetail, AssetTrash,
        │                     # EventInput, LogbookForm, InspectionReport,
        │                     # LaporanDetail, LaporanTrash, UserManagement
        └── utils/            # Constants, formatters
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 4.2, Django REST Framework |
| Fuzzy Engine | scikit-fuzzy (Mamdani), NumPy |
| Database | SQLite (dev) / PostgreSQL (prod via `DATABASE_URL`) |
| Auth | JWT (djangorestframework-simplejwt) |
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
4. Seed demo data (2 orgs, 5 assets, 4 users, sample logs + notifications)
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
| `INSPECTION_EDIT_GRACE_MINUTES` | `5` | Minutes a teknisi can freely edit their own log |
| `INSPECTION_DELETE_GRACE_DAYS` | `7` | Days before a soft-deleted inspection is auto-purged |
| `INSPECTION_STALE_THRESHOLD_DAYS` | `90` | Days without inspection before asset is flagged stale |
| `STALE_NOTIFY_COOLDOWN_DAYS` | `7` | Minimum days between repeat stale notifications per asset |

> The three AHI weights must sum to `1.0`. The fuzzy engine asserts this on import and fails fast if misconfigured.

---

## Key API Endpoints

### Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assets/` | List active assets (excludes trashed) |
| `POST` | `/api/assets/` | Create asset (Manajer only) |
| `GET/PUT/PATCH` | `/api/assets/:id/` | Retrieve / update asset |
| `DELETE` | `/api/assets/:id/` | Soft-delete to trash (Manajer only) |
| `POST` | `/api/assets/:id/restore/` | Restore from trash (Manajer only) |
| `GET` | `/api/assets/trash/` | List trashed assets (Manajer only) |
| `GET` | `/api/assets/:id/audits/` | Asset change history |
| `GET` | `/api/assets/:id/history/` | Interleaved events + inspections timeline |

### Inspections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inspections/` | List active logs (supports filters: asset, from, to, issues_only, verification) |
| `POST` | `/api/inspections/` | Submit inspection log |
| `GET/PUT/PATCH` | `/api/inspections/:id/` | Retrieve / edit within grace |
| `DELETE` | `/api/inspections/:id/` | Soft-delete (Manajer only) |
| `POST` | `/api/inspections/:id/amend/` | Submit amendment log |
| `POST` | `/api/inspections/:id/restore/` | Restore from trash (Manajer only) |
| `GET` | `/api/inspections/trash/` | List trashed logs (Manajer only) |
| `GET` | `/api/inspections/:id/audit_trail/` | Full audit history |
| `POST` | `/api/inspections/:id/verify/` | Verify log — permanent (Manajer only) |
| `POST` | `/api/inspections/:id/request_revision/` | Request revision with note (Manajer only) |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/events/` | Log lightning strike → fuzzy inference |
| `POST` | `/api/events/batch/` | Offline sync — bulk event upload |
| `POST` | `/api/inspections/batch/` | Offline sync — bulk inspection upload |
| `GET` | `/api/fuzzy/simulate/` | Interactive fuzzy simulation |
| `GET` | `/api/dashboard/summary/` | Org-level KPI summary |
| `GET` | `/api/notifications/` | Paginated notifications |
| `POST` | `/api/notifications/:id/mark_read/` | Mark notification as read |
| `POST` | `/api/notifications/mark_all_read/` | Mark all notifications as read |
| `GET` | `/api/health/` | Ping for offline detection |

---

## Demo Credentials

Two organizations, four users:

| Org | Role | Username | Password |
|-----|------|----------|----------|
| Pertamina Group | Manajer | `manager` | `manager123` |
| Pertamina Group | Teknisi | `teknisi` | `teknisi123` |
| PLN & Institusi | Manajer | `manager2` | `manager456` |
| PLN & Institusi | Teknisi | `teknisi2` | `teknisi456` |

### Demo Assets (5 total)

| Asset | Org | LPL | Notes |
|-------|-----|-----|-------|
| Kilang Balongan - Unit Distilasi | Pertamina | I | High-risk petrochemical |
| Tangki LPG Cilacap | Pertamina | I | Soil 6.0 Ω·m → corrosion penalty |
| Menara BTS Cinere | Pertamina | IV | Soil 8.5 Ω·m → corrosion penalty |
| Gardu Induk PLN Suralaya | PLN | II | Power substation |
| Gedung Lab STEI ITB | PLN | III | Research facility |

### Demo Laporan State (Pertamina)

| Log | Status | Notes |
|-----|--------|-------|
| Log 1 (Kilang Balongan) | **Terverifikasi** | Verified by manager, 3 days ago |
| Log 2 (Kilang Balongan) | **Revisi Diminta** | Manager requested photo of grounding connection |
| Log 3 (Tangki LPG) | Original + amendment | Manager-submitted amendment correcting grounding resistance |
| Log 4 (Menara BTS) | **Di Tempat Sampah** | Soft-deleted, available for restore |

---

## License

This project is part of a final undergraduate thesis at Institut Teknologi Bandung (ITB). All rights reserved.
