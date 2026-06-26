# USER UI - Complete Specification
**Component:** OperatorPanel.jsx
**Role:** Operator / Frontline QA
**Last Updated:** June 26, 2026

---

## Purpose

The User UI is the frontline interface for QA operators running live defect
detection on IC components. The camera is always on and always detecting.
The operator does not control detection - only the batch recording session.
Everything the AI sees is shown on screen in real time.

---

## Implemented Features

- Live camera feed with segmentation + bounding box overlay
- Defect label + confidence score on each detection (e.g. INTACT 95.8%)
- Product display (e.g. IC2) and Model display (e.g. yolo26_emsd_v1_retrained)
- Stream status badge: CONNECTING / CONNECTED / DISCONNECTED
- Start Batch / Stop - single toggle button
- Pause / Resume via Auto-detect checkbox
- Batch status display (e.g. Ready for batch 1, Active batch 1: Running)
- Low-confidence visual indicator: color-coded outline + LOW badge
- Flag as defective button - available on PASS detections for manual override
- Operator review modal (Decision required) for UNCERTAIN / LOW_CONFIDENCE detections
- Session History modal shown after stopping a batch
- Inference logs saved to backend only when session is active and batch number is present
- Current batch info fetched from /api/operator/current-batch/ on load
- WebSocket-based live inference stream (InferenceStream)
- Celery background tasks handle retraining queue population automatically

---

## Two States

| State | Detection Running | Recording | Overlay Visible |
|---|---|---|---|
| Before / between batches | Yes (pre-session live) | No | Yes |
| During batch (Start to Stop) | Yes | Yes - InferenceLogs saved | Yes |

---

## Complete Operator Flow

1. Operator logs in - Live Inspection page opens
2. Camera starts immediately - live detection always on
3. Inspection Info panel shows: Stream status, Product, Model, Confidence, Batch
4. Operator clicks Start Batch - system begins recording InferenceLogs
5. Every frame processed and displayed with overlay in real time
6. AI decisions per frame:
   - PASS (confidence above threshold, INTACT detected) - auto-approved, logged
   - FAIL (SCRATCH/DEFECT detected) - logged, review modal appears
   - UNCERTAIN (no detections, empty frame) - logged, auto-queued for retraining
   - LOW_CONFIDENCE (confidence below threshold) - logged, flagged visually, auto-queued
7. Operator can manually Flag as defective on any PASS detection
8. Operator review modal (Decision required) allows:
   - Acknowledge inference - confirm AI decision
   - Reject inference - override with FAIL + reason + correct final decision
9. Operator clicks Stop - Session History modal appears
10. Low-confidence and UNCERTAIN items auto-queued to RetrainingQueue by backend
11. Camera and detection continue - operator starts next batch immediately

---

## AI Decision Values

| Decision | Meaning | Auto-action |
|---|---|---|
| PASS | Confidence above threshold, no defect | Auto-approved, logged |
| FAIL | Defect detected (SCRATCH, DEFECT class) | Logged, review modal |
| UNCERTAIN | No detections - empty frame | Logged, auto-queued retraining |
| LOW_CONFIDENCE | Confidence below threshold | Logged, flagged, auto-queued retraining |

---

## Operator Review Modal (Decision Required)

Appears when:
- Detection is UNCERTAIN or LOW_CONFIDENCE
- Operator manually clicks Flag as defective on a PASS detection

Fields:
- Mode toggle: Acknowledge inference / Reject inference
- Description (text - auto-populated from AI result, editable)
- Reason for rejection (dropdown - Reject mode only):
  - Missed a defect
  - Wrong defect type
  - False positive
  - Other
- Correct final decision (dropdown): PASS / FAIL
- Submit review button

On submit: operator decision saved to InferenceLog, sent to admin logs.

---

## Inspection Info Panel (Right Side)

| Field | Value |
|---|---|
| Stream | CONNECTING / CONNECTED / DISCONNECTED |
| Auto-detect | Checkbox - toggles inference; shows motion status |
| Batch | Ready for batch N / Active batch N: Running |
| Next Batch | Auto-incremented on stop |
| Start / Stop | Session toggle |
| Product | IC1 or IC2 |
| Model | yolo26_emsd_v1_retrained (current active) |
| Confidence | Live confidence of last detection or preset threshold |

---

## Session History Modal (After Stop)

| Field | Description |
|---|---|
| Total Detections | Count of InferenceLogs in session |
| Auto-approved | Count auto-approved (PASS above threshold) |
| Uncertain detections | Count of UNCERTAIN + LOW_CONFIDENCE logs |
| Per-log list | Timestamp, confidence, decision, operator override, status |
| Close History | Closes modal |

---

## What Gets Sent to Admin

- All InferenceLogs with operator decisions and override comments
- UNCERTAIN and LOW_CONFIDENCE logs auto-queued to RetrainingQueue
- Batch metadata: product, model, timestamps, counts
- Operator override decisions recorded per log (final_decision field)

---

## API Endpoints Used

| Endpoint | Purpose |
|---|---|
| POST /api/inference/detect/ | Submit frame for detection |
| GET /api/operator/preset/ | Get active preset for operator |
| GET /api/operator/current-batch/ | Get current batch number and date |
| POST /api/inference-logs/{id}/review/ | Submit operator review decision |
| GET /api/inference-logs/ | Fetch session logs for history modal |
| WS /ws/inference-stream/ | WebSocket live inference stream |

---

## Current System State (as of June 26, 2026)

- Active model: yolo26_emsd_v1_retrained
- Components: IC1, IC2
- Active operator config: tpc-user mapped to IC2
- Confidence threshold: 0.5 (50%)
- Total inference logs to date: 342
- Retraining queue items: 112 (mostly PENDING)

---

## Summary

- USER UI = live detection + batch recording + defect flagging + operator review
- Detection always running - batch marks what gets recorded
- Overlay always shows what the AI sees - clean or defective
- Operator review modal handles UNCERTAIN, LOW_CONFIDENCE, and manual overrides
- All decisions logged and available to admin
- Low-confidence and UNCERTAIN items auto-queued for retraining by backend

---

Companion document: ADMIN UI.md
