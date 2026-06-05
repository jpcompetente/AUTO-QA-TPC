# ADMIN UI — Complete Specification
**Component:** `AdminDashboard.jsx`
**Role:** QA Admin / Retraining Admin
**Date:** June 4, 2026

---

## Purpose

The Admin UI is the control room for everything the User UI produces. It receives
low-confidence detection batches submitted by operators, manages the labeling and
retraining pipeline, controls which model version is active in production, and
provides full traceability and reporting across every batch, product, and operator.

The admin never touches the camera — they only act on what the operators send them.

---

## Navigation Structure

```
Admin Portal — Control Room
├── Overview
├── Detection Logs
├── Retraining
├── Reports
└── Settings
```

Top bar (persistent across all pages):
- `• N components`  `• N models`  `• N operators` — live system counts

---

## Page 1 — Overview

### Purpose
At-a-glance view of system health, current batch activity, model performance,
and any active alerts. The first page the admin sees when they log in.

---

### What's Already Correct ✅
- Active Configs, Products, Models, Operators count cards
- Current Product, Current Model, Threshold cards
- Active Routing card
- Model Health section (confusion snapshot: Pass / Fail / Other)
- Alerts & Issues panel
- Low-confidence clusters indicator

---

### What Needs to Change ⚠️
- **Model Health confusion snapshot** — Pass/Fail/Other counts must reflect
  real batch data, not always show 0/0/0. Updates automatically after each
  batch is closed.
- **Alerts & Issues panel** — must auto-update when User UI submits a
  low-confidence batch. Should not stay at "0 observations" when items are
  pending in the retraining queue.
- **Confidence card** — currently static. Must show live threshold value and
  how many detections today are below it.

---

### What Needs to Be Added ❌

**Recent Batch Submissions panel**
Shows the latest batches submitted by operators in real time:
- Product, Operator, Time submitted
- Total scanned, Defects found, Low-confidence count
- Batch Recall status: Cleared / Under Review / Recalled / Resolved
- Status: Pending Review / Labeled / In Training / Done

**Retraining Queue count card**
Quick stat: how many samples are currently waiting in the retraining queue.
Turns orange when backlog exceeds set threshold.

**Active Model card**
- Currently deployed model version name
- Date it was deployed
- Accuracy at time of deployment

**Escape Rate KPI card**
- Formula: False Passes ÷ Total Passed × 100%
- Shown for today and this week
- Turns red if above set threshold
- Auto-alerts admin and auto-queues retraining if threshold is breached
- This is the core QA health metric — if this rises, the AI is missing defects

**Confidence Trend chart**
Line chart showing average confidence score per batch over time:
- Low-confidence rate trend — is the model improving or degrading?
- Vertical markers when a new model version was deployed
- Horizontal alert line drawn at threshold
- Updates automatically after every batch closes
- Tells admin at a glance whether retraining is actually helping

**Defect Type Confidence Breakdown**
Per defect type (e.g. SCRATCH, CRACK, DENT), shows:
- Average confidence score for each type
- How many detections per type today
- Which defect type has the lowest confidence — that is the priority for retraining
- Shown as a small table or bar chart inside the Model Health section

---

### Removed / No Longer Needed 🗑️
- Nothing removed from Overview — only additions and fixes needed

---

## Page 2 — Detection Logs

### Purpose
Full audit trail of every detection the AI has made. Admin can search, filter,
review individual items, report false passes, trigger batch recalls, and send
items to the retraining queue.

---

### What's Already Correct ✅
- Table structure: No., Batch, ID, Image, Operator, Component, Model,
  Decision, Status, Confidence, Time
- Filter by Date
- Filter by Batch
- Search logs (text search)
- Sort by column / Asc / Desc
- Pagination (20 logs per page, Prev / Next)
- Row count badge

---

### What Needs to Change ⚠️

**Decision column** — must have clear defined values only:
- `PASS` — confidence above threshold, no defect detected
- `FAIL` — defect detected, confidence above threshold
- `LOW CONFIDENCE` — confidence below threshold, auto-flagged

**Status column** — must have clear defined values only:
- `Pending Review` — submitted by operator, not yet reviewed by admin
- `Labeled` — admin has confirmed or corrected the label
- `In Training` — included in an active training job
- `Done` — training complete, sample has been used

**Image column** — must show a small thumbnail preview.
Clicking the thumbnail opens the full image with BB / segmentation overlay,
defect label, and confidence score.

---

### What Needs to Be Added ❌

**Filter by Status**
Dropdown: All / Pending Review / Labeled / In Training / Done

**Filter by Operator**
Dropdown: All / specific operator name

**Filter by Decision**
Dropdown: All / Pass / Fail / Low Confidence

**Filter by Batch Recall Status**
Dropdown: All / Cleared / Under Review / Recalled / Resolved

**Item ID column**
- Unique ID assigned to every detected frame, linked to the physical item's QR code
- Searchable across the entire system
- Admin can type or scan a QR code to instantly pull up the full detection
  record for that specific physical unit

**Batch Recall Status column**
Shows per-row batch health:
- `Cleared` — no issues reported for this batch
- `Under Review` — a false pass was reported from this batch
- `Recalled` — batch confirmed to have escaped defects; physical items
  flagged for re-inspection
- `Resolved` — investigation complete, retraining triggered

**Bulk select checkboxes**
Select multiple rows and send to retraining queue at once via a bulk
action button at the top of the table.

**Row detail view**
Clicking any row opens a detail panel or modal showing:
- Full image with BB / segmentation overlay
- Defect label and confidence score
- Model used, threshold at time of detection
- Operator name, product, batch ID, Item ID, timestamp
- Current status and decision
- Batch Recall status
- Annotation quality score (see Section: Annotation Quality)
- Action buttons:
  - `Confirm Label` — label is correct, mark as Labeled
  - `Correct Label` — change the defect type, mark as Labeled
  - `Send to Retraining` — add to retraining queue
  - `Dismiss` — not useful, remove from queue
  - `Report False Pass` — available only on PASS decisions (see below)

**Report False Pass**
Available on any row where Decision = `PASS`.
Used when a physically inspected item is found to be defective after the
AI passed it.

When triggered, admin or operator:
- Enters the Item ID of the physically found defective item (or scans QR)
- Optionally attaches a new photo of the actual defect
- Adds a note describing what was found

Three things happen automatically:
1. Alert fires on Overview — Alerts & Issues panel
2. The entire batch this item came from changes to `Under Review`
3. All PASS decisions from that batch are automatically queued in
   Retraining for admin review

---

### Removed / No Longer Needed 🗑️
- Nothing removed — only additions and fixes needed

---

## Page 3 — Retraining

### Purpose
The full pipeline from flagged sample to deployed model. One page with four
clearly separated sections that the admin works through in order:
Queue → Training Jobs → Model Versions → (deploy)

---

### Section 1 — Retraining Queue

**What's Already Correct ✅**
- Queue section with sample count
- Refresh queue button

**What Needs to Change ⚠️**
Currently shows "0 samples / No retraining samples queued" even when items
exist. Must populate automatically from:
- User UI batch submissions (Submit for Retraining button)
- Detection Log bulk sends
- False Pass batch recalls

Each queued sample must show:
- Thumbnail image
- Defect label and confidence score
- Item ID
- Batch it came from
- Operator who submitted it
- Product and component
- Current status: Pending Review
- Annotation quality score

**What Needs to Be Added ❌**

Review & Label action per sample — admin can:
- `Confirm Label` — defect type is correct
- `Correct Label` — change defect type to the right class
- `Dismiss` — remove from queue, not useful for training

Export to Label Studio button
- Exports all Pending Review samples to a Label Studio project for
  detailed polygon-level labeling
- Only active when at least one Pending Review sample exists

Import from Label Studio button
- Imports labeled results back into the system
- Updates sample status to Labeled automatically

Queue summary bar
- Total samples in queue broken down by:
  Pending Review / Labeled / Ready to Train

---

### Section 2 — Training Jobs

**What's Already Correct ✅**
- Training Jobs section with job count

**What Needs to Change ⚠️**
Currently shows "0 jobs / No training jobs yet."
Must show actual jobs with full status and details.

Each training job must show:
- Job ID
- Status: Queued / Running / Completed / Failed
- Product and component it was trained on
- Number of samples used
- Start time, end time, duration
- Output model version name (once complete)

**What Needs to Be Added ❌**

Trigger Retraining button
- Manually starts a training job from all Labeled samples in the queue
- Only active when at least one Labeled sample exists
- Disabled with reason shown if queue has no labeled samples

Auto-trigger indicator
- Shows whether auto-retraining is enabled
- Shows the current trigger rule (e.g. "Auto-retrain when 50 labeled
  samples are ready")
- Configurable from Settings

Job detail expand
- Clicking a job row expands to show:
  - List of samples used (with Item IDs)
  - Training parameters
  - Accuracy before training
  - Accuracy after training
  - Which defect types improved and by how much

---

### Section 3 — Model Versions

**What Needs to Be Added ❌** (does not exist yet)

List of all model versions, each showing:
- Version name / ID
- Status: Active / Ready to Deploy / Archived / Rolled Back
- Overall accuracy metrics
- Accuracy per defect type (SCRATCH, CRACK, DENT, etc.)
- Trained on: batch ID, sample count, date
- Deployed on: date (if Active)
- Model Changelog note (see below)

Validation metrics panel
Shown when a model is in Ready to Deploy state:
- New model accuracy vs. current active model
- Pass / Fail result on historical test set
- Improvement on recent low-confidence detections
- Per defect type accuracy comparison
- Block indicator: if model fails any check, Deploy button is disabled
  with the specific reason shown

Deploy / Activate button
- Only shown when model passes all validation checks
- Admin reviews metrics, writes a Model Changelog note, then clicks Deploy
- Model hot-swaps to inference server with zero downtime
- User UI continues running without interruption

Model Changelog (required field on deploy)
- One text field admin must fill before deploying: what changed, what was
  retrained on, why this model is being deployed
- Stored permanently with the model version record
- Prevents the audit trail from being numbers-only with no human context
- Example: "Retrained on Batch 14 (CRACK class, 52 samples). Previous
  model was missing hairline cracks on IC2 bottom edge."

Rollback button
- One-click revert to the previous model version
- Available on the currently Active model
- Automatic rollback also fires if production accuracy drops below
  threshold after deployment

---

### Retraining Flow (Complete)

```
User UI submits low-confidence batch
  ↓
Samples appear in Retraining Queue (Pending Review)
  ↓
Admin reviews each sample — confirm, correct label, or dismiss
  ↓
[Optional] Export to Label Studio → label → Import back
  ↓
Samples status updates to: Labeled
  ↓
Admin clicks Trigger Retraining (or auto-trigger fires)
  ↓
Training Job created — status: Queued → Running → Completed
  ↓
New model version created — status: Ready to Deploy
  ↓
Admin reviews validation metrics (new vs. current accuracy,
per defect type breakdown, historical test set result)
  ↓
If passes all checks:
  Admin writes Model Changelog note → clicks Deploy
  → Model hot-swaps to inference server (zero downtime)
  → User UI immediately uses new model version
If fails any check:
  → Deploy button blocked with reason shown
  → Model stays Archived
  ↓
Production accuracy monitored continuously
  ↓
If accuracy drops → auto-alert + admin clicks Rollback
→ Previous model restored instantly
```

---

## Page 4 — Reports

### Purpose
Exportable records and trend analysis at three levels: per batch, per product,
and per operator. The admin uses this to understand whether the system is
improving, where defects are concentrated, and whether specific operators or
shifts have different detection patterns.

---

### Section 1 — Batch Report

Auto-generated when a batch closes. Also accessible any time from Detection Logs.

Contents:
- Batch ID, product, operator, date/time started and stopped
- Shift (Morning / Afternoon / Night — if shift tracking is enabled)
- Total scanned, total passed, total failed, total low-confidence
- Defect breakdown by type (e.g. SCRATCH: 3, CRACK: 1, DENT: 0)
- Per defect type confidence scores
- Model version used, threshold setting at time of batch
- List of all flagged items with Item IDs and confidence scores
- Batch Recall status (Cleared / Under Review / Recalled / Resolved)
- Any False Pass reports filed against this batch
- Annotation quality scores for any labeled samples from this batch

Actions:
- Download as PDF or CSV
- Share link to batch report
- Flag batch for recall directly from report

---

### Section 2 — Product Report

Per product over a selected time range (today / this week / this month / custom).

Contents:
- Total batches run, total items scanned
- Pass rate and fail rate over time (trend chart)
- Defect type breakdown — most common defect types for this product
- **Defect Heatmap** — overlays all detections from multiple batches onto
  a single product reference image, showing where on the product defects
  cluster most frequently. Tells QA if the problem is in the physical
  process (e.g. scratches always appear on top-left corner = machine
  calibration issue) rather than random.
- Model accuracy trend across versions — did retraining improve detection?
- Escape Rate trended over time — false passes ÷ total passed × 100%
- Low-confidence rate over time per defect type
- Which operators ran which batches for this product
- Shift comparison (if shift tracking enabled) — defect rates by shift

Actions:
- Download as PDF or CSV
- Filter by operator, model version, date range, shift

---

### Section 3 — Operator Report

Per operator over a selected time range.

Contents:
- Total batches run, total items scanned
- Pass / fail rate of their batches
- How many low-confidence items they submitted for retraining
- How many False Pass reports were filed on their batches
- Average confidence score of their sessions
  (low average may indicate camera setup or lighting issues, not AI issues)
- Shift breakdown — which shifts they worked and defect rates per shift
- Comparison to other operators on the same product (anonymized)

Actions:
- Download as PDF or CSV
- Filter by product, date range, shift

---

### Reports Flow

```
Batch closes in User UI
  ↓
Batch Report auto-generated and saved
  ↓
Admin can view / download from Reports page at any time
  ↓
Product and Operator Reports aggregate all batch data automatically
  ↓
Defect heatmap updates per product as new batches come in
  ↓
Escape Rate and confidence trends update automatically
  ↓
If Escape Rate exceeds threshold → auto-alert on Overview
  ↓
Admin uses reports to decide which defect type to prioritize
for the next labeling and retraining cycle
```

---

## Page 5 — Settings

### Purpose
All system configuration in one place: routing rules, model management,
product management, operator management, and retraining automation rules.

---

### What's Already Correct ✅
- Assign models & thresholds form (Product → Model → Operator → Threshold)
- Existing configurations table (Operator / Product / Model / Threshold /
  Edit / Delete)
- Save config button
- 2 saved configurations shown

---

### What Needs to Change ⚠️

**Threshold field**
Add helper text below the input:
"Detections below this confidence score will be flagged as low confidence
and submitted to the retraining queue."

**Save config validation**
Warn admin before saving if:
- Selected model does not exist or is archived
- Operator username is not registered
- Duplicate config already exists for this operator + product combination

**Configuration table**
Add a column: Active / Inactive — showing whether this routing rule is
currently being used in live detection.

---

### What Needs to Be Added ❌

**Model Management section**
List of all model versions with:
- Name, version tag, date added
- Status: Active / Ready to Deploy / Archived / Rolled Back
- Model Changelog note (written at deploy time)

Actions per model:
- Set as Active (promotes to production, previous model auto-archived)
- Archive (removes from active pool, kept for rollback)
- Delete (permanent — only available on non-active, non-archived models)
- Upload / register a new model file

**Product Management section**
List of all products (e.g. IC2) with:
- Product name, description, component types

Actions:
- Add new product
- Edit product name, description, component types
- Delete product (only if no active configurations reference it)

**Operator Management section**
List of all operators with:
- Username, role, date created, assigned product, assigned model

Actions:
- Add new operator
- Edit operator (username, assigned product, assigned model)
- Deactivate operator (removes from active pool, keeps their history)
- Delete operator (permanent — only if no detection logs reference them)

**Retraining Automation Rules section**
Controls for the auto-trigger logic:
- Enable / disable auto-retraining
- Set trigger threshold: "Auto-retrain when N labeled samples are ready"
- Set confidence threshold for auto-flagging low-confidence detections
- Set Escape Rate alert threshold: "Alert when escape rate exceeds X%"
- Set accuracy drop threshold: "Auto-rollback if production accuracy
  drops below X%"

**Shift Tracking section**
- Enable / disable shift tracking
- Define shifts: name, start time, end time (e.g. Morning 6am–2pm)
- Shifts appear as a selectable field when operators start a batch in
  the User UI
- Used in Reports for shift-level comparisons

---

### Removed / No Longer Needed 🗑️
- Nothing removed from Settings — only additions and fixes needed

---

## Annotation Quality Score

Applies across Detection Logs and Retraining Queue.

### What it is
A score assigned to each labeled sample indicating how reliable the label is
for training purposes. Protects the model from learning noise due to
inconsistent or incorrect labels.

### How it works
A sample gets a lower quality score when:
- The label was changed more than once during review
- The defect type was corrected by admin (operator's original flag was wrong)
- After retraining on this sample, model confidence on that defect type
  did not improve (suggests the label may have been wrong)
- The same image was labeled differently by two admins

### Where it appears
- Detection Log row detail — shown per sample
- Retraining Queue — shown per sample, sortable
- Admin can filter queue by quality score to prioritize high-quality samples
  for the next training job
- Batch Report — average annotation quality score for the batch's labeled samples

### Why it matters
If bad labels go into training, the model learns the wrong thing. Accuracy
metrics may look fine but real-world detection gets worse. The annotation
quality score surfaces this before it damages the model.

---

## Item Traceability

Every frame captured during a batch is assigned a unique Item ID at the moment
of detection. This ID is linked to the physical item's QR code if scanned.

### Full Traceability Chain

```
Physical Item (QR scan or auto-generated)
  ↓
Item ID
  ↓
Batch ID → Operator → Product → Shift → Model Version
  ↓
Decision: PASS / FAIL / LOW CONFIDENCE
  ↓
Confidence Score
  ↓
Per defect type confidence breakdown
  ↓
Image with BB / Segmentation Overlay
  ↓
Timestamp
  ↓
Batch Recall Status
  ↓
Annotation Quality Score (if labeled)
```

### Where Item ID appears
- Detection Logs table — Item ID column, searchable
- Row detail view
- Retraining Queue — per sample
- Batch Report — listed per flagged item
- False Pass Report — admin enters Item ID to file a report
- User UI overlay — Item ID shown on each detected frame during a session

### How to use it
When a passed item is later found defective on the production floor:
1. Scan the QR on the physical item or note the Item ID
2. Search the Item ID in Detection Logs
3. See exactly: what the AI detected, confidence score, model version,
   operator, batch, time — the full picture of what happened
4. File a False Pass Report directly from that record

---

## Complete Admin UI Summary

| Page | Sections | Purpose |
|---|---|---|
| Overview | Stats, model health, confidence trend, escape rate, defect type breakdown, recent batches, alerts | At-a-glance system health and batch activity |
| Detection Logs | Full log table, Item ID search, filters, bulk actions, false pass reporting, batch recall | Audit trail of every detection; traceability; send to retraining |
| Retraining | Queue → Label → Training Jobs → Model Versions | Full pipeline: flagged sample → labeled → trained → deployed |
| Reports | Batch / Product (with heatmap) / Operator reports | Exportable records; trend analysis; escape rate; shift comparison |
| Settings | Config, model mgmt, product mgmt, operator mgmt, automation rules, shift tracking | All system configuration in one place |

---

## What the Admin UI Receives from User UI

**Every time an operator clicks Submit for Retraining:**

| Data | Where it appears in Admin UI |
|---|---|
| Low-confidence InferenceLogs with Item IDs | Detection Logs + Retraining Queue |
| Operator confirmations / dismissals on flagged items | Detection Log row detail |
| Batch metadata (product, model, operator, time, counts) | Overview recent batches + Detection Logs + Batch Report |

**Every time an operator files a False Pass Report:**

| Automatic action | Where |
|---|---|
| Alert fires | Overview — Alerts & Issues panel |
| Batch status → Under Review | Detection Logs — Batch Recall Status column |
| All PASS decisions from that batch queued | Retraining Queue |
| Escape Rate KPI updates | Overview + Reports |

---

## Final Summary

- **ADMIN UI = review + label + retrain + deploy + report + trace**
- Everything the admin acts on comes directly from the User UI
- No model goes live without admin review, validation gates, and a
  written Model Changelog note
- False Pass reporting triggers automatic batch recall and retraining queue
- Every physical item is traceable by Item ID back to its full detection record
- Annotation quality scoring protects the model from bad training data
- Reports give full visibility at batch, product, and operator level
- Defect heatmap shows where on the product defects cluster — actionable
  for the physical production process, not just the AI
- Escape Rate is the core QA health metric — tracked, alerted, and tied
  to retraining
- Shift tracking separates AI performance issues from environment issues
- Settings controls all automation rules, routing, and user management
  in one place

---

*Companion document: USER_UI_COMPLETE.md*