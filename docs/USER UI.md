# USER UI — Complete Specification
**Component:** `OperatorPanel.jsx`
**Role:** Operator / Frontline QA
**Date:** June 10, 2026

---

## Purpose

The User UI is the frontline interface for QA operators running live defect detection on products. The camera is always on and always detecting — the operator does not control detection, only the batch recording session. Everything the AI sees is shown on screen in real time.

---

## Current UI (Implemented in `OperatorPanel.jsx`)

Already implemented and correct:
- Live camera feed with segmentation + bounding box overlay
- Defect label + confidence score on each detection (e.g. `SCRATCH 67.6%`)
- Product display (e.g. `IC2`)
- Model display (e.g. `yolo26_emsd_v1`)
- Start / Stop Batch (single toggle) — button text shows `Start Batch` or `Stop`
- Pause / Resume semantics are provided by the `Auto-detect` checkbox (UI shows `Pause` / `Resume` in some places)
- Auto-detect checkbox (toggles live inference processing)
- Stream status badge (e.g. `CONNECTING`, `CONNECTED`, `DISCONNECTED`)
- Batch status (e.g. `Ready for batch 1`, `Active batch N: Running`)
- Low-confidence visual indicator on overlay: color-coded outline + "LOW" badge for detections below threshold
- Batch summary (session history) modal shown after stopping a session

---

## What Needs To Be Updated In The Spec

The implementation diverges slightly from the prior spec in these areas (the code implements a stable, opinionated behavior):

| Item | Current behavior in code | Notes / Spec update |
|---|---|---|
| Confidence field | Shows live confidence when a `detectionResult` is present; otherwise shows the configured `preset.confidence_threshold` (as a percentage) or `—` | Spec should state: display live confidence if available; fallback to preset threshold or `—`.
| Stop / Start control | Single toggle button (`Start Batch` ↔ `Stop`) managed by `toggleSession()`; stopping opens the session history modal | Spec should treat Start/Stop as one control that both starts and ends batch recording.
| Pause | Provided via `Auto-detect` checkbox (UI labels show `Pause`/`Resume`) — toggles inference processing while camera stays live | Update spec to map Pause/Resume to `Auto-detect` state rather than a separate Pause-only button.
| Low-confidence indicator | Implemented: color-coded outlines and a `LOW` badge on overlay when confidence < threshold | Keep as implemented.
| Batch summary / retraining action | A session history modal appears after stopping; uncertain / low-confidence logs are marked and the UI shows an "Auto-submitted for retraining" indicator when applicable. There is no explicit batch-level "Submit for Retraining" button in the summary. Individual detections use the review modal (`Submit review`) for operator decisions. Backend APIs / tasks handle adding low-confidence items to the retraining queue. | Update spec: change batch-level submission to automatic enqueueing; remove requirement for a manual summary-level "Submit for Retraining" button unless a future UX change is desired.

---

## Features (Complete / Implemented)

- Live camera feed — starts when session is active (and optionally pre-session live can be enabled) and remains managed by ReactWebcam
- Bounding box + segmentation overlay always visible when there is a frame to render — shows what the AI sees, clean or defective
- Defect label + confidence score shown on detections; overlay uses mask polygons when available
- Live confidence score reflected in the Inspection Info panel when a `detectionResult` is present; otherwise shows configured threshold or `—`
- Low-confidence detections visually flagged (yellow outline + `LOW` badge)
- Batch Start / Stop — single control toggles recording; stopping a session triggers a session history (batch summary) modal
- Pause/Resume behavior is exposed via the `Auto-detect` checkbox (labels in the UI surface the current `motionStatus` such as `Auto-detect paused`)
- Batch summary (Session History) modal — shown after Stop; shows totals and per-log entries
- Per-detection review modal available for manual operator review and submission (`Submit review`), which records operator decisions and comments
- Camera and detection continue after batch ends — operator can immediately start the next batch

---

## Two Clearly Separate States

| State | Detection Running | Recording | Overlay Visible |
|---|---|---|---|
| Before batch / between batches | ✅ When pre-session live or after session start; camera is available but inference may be paused via `Auto-detect` | ❌ Not recording | ✅ Overlay drawn when frames available |
| During batch (Start → Stop) | ✅ Always on (live inference loop runs while sessionStarted or pre-session is enabled) | ✅ Recording InferenceLogs | ✅ Overlay always visible |

---

## Complete Flow

1. Operator logs in and opens `OperatorPanel`
2. **Camera starts immediately — live detection is always on**
   - Every frame shows BB / segmentation overlay
   - Label + confidence score displayed on each detected object
   - Clean items show overlay too — AI shows what it sees even if no defect
   - Live confidence score updates in the Inspection Info panel
3. Operator enters or confirms batch / product run details
4. Operator clicks **Start Batch**
   - System begins recording `InferenceLogs` for this batch
   - Batch status updates (e.g. `Batch 1 in progress`)
5. **During the batch:**
   - Every frame is processed and displayed with overlay in real time
   - If confidence is below threshold → detection is auto-flagged as low confidence
   - Low-confidence detections are visually marked on the overlay (e.g. yellow, "LOW" badge)
   - Operator can confirm or dismiss individual low-confidence detections mid-batch
6. Operator clicks **Stop** (via the Start/Stop button)
   - Recording stops and the UI fetches the session's completed logs
   - Detection / live camera remains active
   - **Session History (batch summary) modal appears:**
     - Total detections in the session
     - Auto-approved count
     - Uncertain / low-confidence count (UI highlights these and indicates when items were auto-submitted)
   - **Batch-level retraining is handled automatically for uncertain/low-confidence items** — the UI shows an "Auto-submitted for retraining" indicator when applicable. There is no explicit batch-level "Submit for Retraining" button in the current implementation.
7. Operator may review individual detections using the operator review modal and click **Submit review** to record overrides/comments (these are attached to the inference logs and sent to the backend). The backend will persist low-confidence entries to the `RetrainingQueue` as appropriate.
8. Camera and live detection continue — operator is ready to start the next batch

---

## Inspection Info Panel (Right Side)

| Field | Description |
|---|---|
| Stream | Live connection status badge (e.g. `CONNECTING`, `CONNECTED`, `DISCONNECTED`) |
| Auto-detect | Checkbox to enable/disable live inference; UI surfaces `motionStatus` next to it (e.g. `Auto-detect paused`, `Waiting for stable frame`) |
| Batch | Current batch status (e.g. `Ready for batch 1`, `Active batch N: Running`) |
| Next Batch | Next batch number (auto-incremented when session stops) |
| Start / Stop | Session control (single toggle) |
| Pause / Resume | Provided by toggling `Auto-detect` (labels and buttons in some UIs show `Pause`/`Resume`) |
| Product | Product being inspected (e.g. `IC2`) |
| Model | Active model version (e.g. `yolo26_emsd_v1`) |
| Confidence | Live confidence of the most recent detection when available; otherwise the configured `preset.confidence_threshold` or `—` |

---

## Session History / Batch Summary (Shown After Stop)

| Field | Description |
|---|---|
| Total Detections | Count of inference logs in the completed session |
| Auto-approved | Count of logs auto-approved by backend logic |
| Uncertain / Low-confidence | Count of logs marked uncertain or low-confidence; the UI shows an indicator when these were auto-submitted for retraining |
| Per-log list | Scrollable list of logs with timestamp, confidence, operator overrides/comments and status badge |
| Close History | Button — closes the modal |

Note: The current UI does not include a manual batch-level "Submit for Retraining" button. Low-confidence / uncertain logs are enqueued to the backend `RetrainingQueue` according to server-side logic and background tasks; the UI surfaces that state in the session history modal.

---

## What Gets Sent to Admin

How retraining candidates are produced in the current implementation:

- Low-confidence / uncertain `InferenceLogs` are marked and (depending on backend rules) are added to the `RetrainingQueue` by the server or background tasks. The UI marks these in the session history and shows when items were auto-submitted.
- Operator overrides / dismissals and operator comments (from the review modal) are recorded on each `InferenceLog` and included with any retraining candidate metadata.
- Batch / session metadata (product, model, start/stop timestamps, counts) are attached to logs and available to the backend when building retraining datasets.

---

## Summary

- **USER UI = live detection + batch recording + defect flagging**
- Detection is always running — batch just marks what gets recorded and summarized
- The overlay always shows what the AI sees — clean or defective
- All dections details are go to admin logs 
- Low-confidence detections are uncertain tems that go to retrain section in admin
- Operator has one decision to make at the end: stop and close history

---

*Next: ADMIN UI specification — receives and processes retraining queue entries and review metadata.*