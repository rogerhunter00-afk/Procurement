# Laundry Cage Dispatch Tracker

A mobile-first browser MVP for tracking permanent laundry cages against printed customer order sheets. It is designed for shop-floor operators who need quick scan/manual entry flows and clear STOP warnings before the wrong cage leaves the laundry.

## What the app does

The app keeps a live local record of:

- Laundry cages and their current status/location.
- Customer orders, routes, expected cage counts, and dispatch status.
- Every scan-driven action in an audit history.

Core workflows include assigning a cage to an order, packing it, moving it to a dispatch lane, loading it onto a selected route, recording delivery, returning the empty cage, searching missing cages, and importing/exporting JSON backups.

## How cage QR codes work

Each physical laundry cage has a permanent metal QR code. The QR code should contain only the cage ID, for example:

```text
CAGE-EK-001
```

When scanned, the app looks up that cage ID in its stored live data and shows the current order link, location, status, and audit trail.

## How order sheet QR codes work

Each printed customer order sheet has a QR code containing only the order ID, for example:

```text
ORDER-1001
```

During assignment, the operator scans the cage QR and the order QR. The app links those two IDs in local app data.

## Why QR codes only store IDs

QR codes are intentionally simple and stable. They do **not** store route, customer, delivery date, cage status, or dispatch state because those values change during operations. Live data belongs in the application database/storage layer so operators always see the latest known state while permanent metal cage tags can remain unchanged.

## Reference workflow used

This build inspected `sandip3120-project/Inventory-Tracking-System` as workflow inspiration only. The useful ideas were:

- scan-first mobile operator screens,
- movement/transaction history,
- putaway, transfer, and dispatch transitions,
- dispatch validation before confirming movement.

The implementation here is a fresh, much simpler Vite + React + TypeScript mobile-browser MVP and does not clone the reference app.

## Seed data

The app starts with sample cages:

- `CAGE-EK-001`
- `CAGE-EK-002`
- `CAGE-EK-003`
- `CAGE-EK-004`
- `CAGE-EK-005`

And sample orders:

- `ORDER-1001` | ABC Hotel | EK Van 1 | expected cages 2
- `ORDER-1002` | Green Care Home | EK Van 1 | expected cages 1
- `ORDER-1003` | City Gym | EK Van 2 | expected cages 2

## Dispatch validation rules

When loading a van, the app checks that:

1. The cage exists.
2. The cage is linked to an order.
3. The linked order exists.
4. The order route matches the selected route.
5. The cage is not already loaded.
6. The cage is packed or ready for dispatch.

Failed checks show a large red STOP warning. Route summaries show expected cages, loaded cages, missing cages, and complete/incomplete status.

## Supervisor override

Complete dispatch is blocked when cages are missing unless a supervisor override reason is saved. Standard reasons are:

- Short order approved
- Cage held back
- Rewash required
- Customer cancelled item
- Other

The override action and reason are written to the audit history.

## Storage and backup

This MVP uses browser `localStorage`. There is no backend, login, or cross-device sync yet. Use **Import / Export Data** to download or restore a JSON backup of cages, orders, and audit events.

## Run locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local Vite URL on a desktop browser or phone on the same network. Camera QR scanning requires browser camera permission and may require HTTPS on some mobile browsers; manual entry remains available on every screen.

## Build

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Current limitations

- Data is stored only in the current browser profile's `localStorage`.
- No authentication, roles, or real supervisor PIN/password yet.
- No central backend, multi-device sync, or conflict handling.
- No server-side validation or immutable audit log.
- QR scanning depends on device/browser camera support via `html5-qrcode`.
- Seed data is demo-only and should be replaced with a real cage/order import later.
- Delivery dates and route planning are simple fields, not full scheduling tools.

## Suggested future backend upgrade path

1. Add a backend API with a real database, such as PostgreSQL.
2. Move cages, orders, routes, users, and scan events into server-side tables.
3. Add authenticated operator and supervisor roles.
4. Make scan events append-only for stronger audit integrity.
5. Add route manifests imported from the laundry order system.
6. Add admin screens for cage registration, route setup, and exception reporting.
7. Add offline-first sync if operators need warehouse areas with poor connectivity.
