# ADMIN UI - Complete Specification
**Component:** AdminDashboard.jsx
**Role:** QA Admin / Retraining Admin
**Last Updated:** June 26, 2026

---

## Purpose

The Admin UI is the control room for everything the User UI produces. It receives
detection logs and low-confidence samples from operators, manages the labeling and
retraining pipeline, controls which model version is active in production, and
provides full traceability and reporting across every batch, product, and operator.

The admin never touches the camera - they only act on what the operators send them.

---

## Navigation Structure

Admin Portal - Control Room
- Overview
- Detection Logs
- Retraining
- Reports
- Settings

Top bar (persistent): live counts of components, models, operators

---

## Page 1 - Overview

### Purpose
At-a-glance view of system health, current batch activity, model performance,
and active alerts. First page the admin sees on login.

### Implemented
- Active Configs, Products, Models, Operators count cards
- Current Product, Current Model, Threshold cards
- Active Routing card
- Model Health section (Pass / Fail / Other counts)
- Alerts and Issues panel
- Low-confidence clusters indicator
- Dashboard stats from /api/dashboard/stats/

### Current System Values
- Active model: yolo26_emsd_v1_retrained
- Components: IC1, IC2
- Active configs: 2 (tpc-user to IC2, inspector to IC2)
- Total inference logs: 342
- Retraining queue: 112 items

### Planned Additions
- Recent Batch Submissions panel (product, operator, time, totals, status)
- Retraining Queue count card (turns orange when backlog exceeds threshold)
- Escape Rate KPI card (False Passes / Total Passed x 100%)
- Confidence Trend chart (avg confidence per batch over time)
- Defect Type Confidence Breakdown (per defect type avg confidence)

---

## Page 2 - Detection Logs

### Purpose
Full audit trail of every detection. Admin can search, filter, review items,
report false passes, trigger batch recalls, and send items to retraining queue.

### Implemented
- Table: No., Batch, ID, Image, Operator, Component, Model, Decision, Status, Confidence, Time
- Filter by Date, Batch
- Text search
- Sort by column (Asc / Desc)
- Pagination (20 logs per page)
- Row count badge

### Decision Values (current system)
- PASS - confidence above threshold, INTACT detected
- FAIL - defect detected or operator override
- UNCERTAIN - no detections in frame (empty), auto-queued for retraining
- LOW_CONFIDENCE - confidence below threshold, auto-queued for retraining

### Status Values
- APPROVED - auto-approved PASS
- REJECTED - FAIL or operator override
- PENDING - awaiting review

### Planned Additions
- Filter by Status, Operator, Decision
- Thumbnail image preview in Image column
- Row detail modal (full image, BB overlay, model info, operator info, action buttons)
- Bulk select checkboxes for batch retraining queue sends
- Report False Pass action (available on PASS rows)
- Batch Recall Status column (Cleared / Under Review / Recalled / Resolved)
- Item ID column linked to physical QR code

---

## Page 3 - Retraining

### Purpose
Full pipeline from flagged sample to deployed model.
Queue -> Label -> Training Jobs -> Model Versions -> Deploy

### Section 1 - Retraining Queue

#### Implemented
- Queue section with sample count
- Refresh queue button
- Auto-population from:
  - UNCERTAIN detections (no IC in frame)
  - LOW_CONFIDENCE detections (confidence below threshold)
  - Operator override submissions via review modal
- Current queue: 112 items (PENDING / INVALID statuses)

#### Planned Additions
- Per-sample display: thumbnail, label, confidence, batch, operator, product, status
- Review and Label actions per sample:
  - Confirm Label
  - Correct Label
  - Dismiss
- Export to Label Studio button (Label Studio running at localhost:8080)
- Import from Label Studio button
- Queue summary bar: Pending Review / Labeled / Ready to Train counts

### Section 2 - Training Jobs

#### Implemented
- Training Jobs section with job count
- Celery worker handles background training tasks

#### Planned Additions
- Job list: ID, status, product, sample count, start/end time, output model
- Trigger Retraining button (active only when labeled samples exist)
- Auto-trigger indicator and configuration
- Job detail expand: samples used, training params, accuracy before/after

### Section 3 - Model Versions

#### Current Models in System
| ID | Name | Version | Status |
|---|---|---|---|
| 7 | yolo26_emsd_v1_retrained | v1 | Active |
| 6 | tpcmodel_retrained | v3 | Inactive |
| 3 | tpcmodel | t1 | Inactive |
| 2 | yolo26_emsd_v1 | v1 | Inactive |
| 1 | MO1 | v1 | Inactive |

#### Planned Additions
- Model version list with accuracy metrics and changelog
- Validation metrics panel (new vs current model comparison)
- Deploy / Activate button (with required Model Changelog note)
- Rollback button (one-click revert to previous model)
- Auto-rollback if production accuracy drops below threshold

### Retraining Flow

Operator detects UNCERTAIN or LOW_CONFIDENCE frame
  |
Backend auto-queues to RetrainingQueue (Celery task)
  |
Admin reviews queue - confirm, correct, or dismiss labels
  |
Optional: Export to Label Studio (localhost:8080) -> label -> import back
  |
Samples status: Labeled
  |
Admin triggers retraining (or auto-trigger fires)
  |
Training Job: Queued -> Running -> Completed
  |
New model version created: Ready to Deploy
  |
Admin reviews validation metrics -> writes changelog -> Deploy
  |
Model hot-swaps to inference server (zero downtime)
  |
User UI immediately uses new model version

---

## Page 4 - Reports

### Purpose
Exportable records and trend analysis at batch, product, and operator level.

### Planned Sections

#### Batch Report
- Auto-generated when batch closes
- Contents: batch ID, product, operator, totals, defect breakdown, model used
- Actions: Download PDF/CSV, flag for recall

#### Product Report
- Per product over selected time range
- Contents: pass/fail rate trend, defect type breakdown, defect heatmap,
  model accuracy trend, escape rate trend
- Actions: Download PDF/CSV, filter by operator/model/date

#### Operator Report
- Per operator over selected time range
- Contents: batches run, pass/fail rate, low-confidence submissions,
  false pass reports filed, avg confidence score
- Actions: Download PDF/CSV, filter by product/date

---

## Page 5 - Settings

### Implemented
- Assign models and thresholds (Product -> Model -> Operator -> Threshold)
- Existing configurations table (Operator / Product / Model / Threshold / Edit / Delete)
- Save config button

### Current Active Configurations
| Operator | Product | Model | Threshold |
|---|---|---|---|
| tpc-user | IC2 | yolo26_emsd_v1 | 0.5 |
| inspector | IC2 | tpcmodel | 0.5 |

### Planned Additions
- Model Management section (list, activate, archive, upload new model)
- Product Management section (add, edit, delete IC1/IC2 and future products)
- Operator Management section (add, edit, deactivate operators)
- Retraining Automation Rules (auto-trigger threshold, escape rate alert threshold)
- Shift Tracking (enable/disable, define shifts, appear in reports)

---

## Label Studio Integration

Label Studio is running at localhost:8080 (container: funny_spence).
Used for detailed polygon-level labeling of queued retraining samples.

Flow:
- Admin exports PENDING samples from Retraining Queue to Label Studio project
- Annotators label defect polygons in Label Studio
- Admin imports labeled results back - status updates to Labeled
- Labeled samples included in next training job

---

## What Admin Receives from User UI

| Source | Data | Where in Admin UI |
|---|---|---|
| Every InferenceLog | Detection result, confidence, operator, batch, model | Detection Logs |
| UNCERTAIN logs | Empty frame detections, confidence=0.0 | Detection Logs + Retraining Queue |
| LOW_CONFIDENCE logs | Below-threshold detections | Detection Logs + Retraining Queue |
| Operator review submit | Override decision, reason, final_decision | Detection Log row detail |
| Batch stop | Session totals, metadata | Overview + Detection Logs |

---

## Current System State (as of June 26, 2026)

- Active model: yolo26_emsd_v1_retrained (model ID 7)
- Components: IC1, IC2
- Active operator configs: 2
- Total inference logs: 342
- Retraining queue: 112 items
- Label Studio: running at localhost:8080
- Infrastructure: Docker (6 containers - backend, celery, inference, frontend, gateway, redis)

---

## Summary

- ADMIN UI = review + label + retrain + deploy + report + trace
- Everything admin acts on comes from User UI operator sessions
- UNCERTAIN and LOW_CONFIDENCE items auto-queued by Celery background tasks
- Label Studio integration for detailed polygon labeling
- No model goes live without admin review and written changelog note
- Reports give visibility at batch, product, and operator level

---

Companion document: USER UI.md
