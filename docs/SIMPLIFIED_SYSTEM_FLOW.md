# AUTO-QA TPC: Simplified System Flow

**Date**: June 2, 2026
**Status**: Current state + roadmap

---

## Purpose
This document describes the actual retraining and inference flow implemented today in the repository, identifies the remaining gaps, and provides a thin phase roadmap the team can use to continue development.

## Current System Flow (Implemented Now)
The current repository supports a working sample-level retraining pipeline with an admin queue and background training jobs.

1. Operator presents the IC or batch live in front of the camera, and the frontend sends runtime detection frames to the system.
   - Frontend file: `frontend-vite/src/api/backend.js`
   - API call: `detectImage(payload)` against `/inference/detect/`
2. The Django backend receives the live detection request and records inference details in `InferenceLog`.
   - Backend: `core/models.py` (`InferenceLog`)
   - The log stores the image snapshot, model used, confidence score, batch metadata, and decision status.
3. Low-confidence or manually flagged detections are added to the retraining queue.
   - Backend: `core/models.py` (`RetrainingQueue`)
   - Queue entry is created from an `InferenceLog` item.
4. Admin users view the queue and training jobs in the frontend admin page.
   - Frontend: `frontend-vite/src/components/AdminDashboard.jsx`
   - API calls: `getRetrainingQueue()`, `getTrainingJobs()`
5. Admin labels queue entries and triggers retraining by selecting sample IDs.
   - API call: `labelRetrainingQueueItem(id, labelData)`
   - API call: `triggerTraining(sampleIds, options)`
6. The backend creates a `TrainingJob`, links selected queue items through `DatasetBuffer`, and starts Celery training.
   - Backend: `core/views.py` (`batch_trigger_training`)
   - Celery task: `core/tasks.py` (`train_model`)
7. Training runs in the background and writes new weights when complete.
   - Training uses YOLO command invocation from `core/tasks.py`
   - Progress may be streamed via Channels/WebSockets if configured.
8. Deployment is handled by creating a new `AIModel` version and optionally activating it.
   - Backend: `core/tasks.py` (`deploy_model_version`)
   - The active model selection is driven by `AIModel.is_active`.

## Live detection requirement
The intended system behavior is that defects should be visible immediately when the IC or batch appears in the camera view, with segmentation or bounding boxes overlaid in real time. This should work before the admin/operator explicitly starts a batch session, making the first visible batch immediately diagnosable.


## What is Already Implemented
- `InferenceLog` stores rich runtime and review metadata.
- `RetrainingQueue` exists as the current sample-level retraining candidate store.
- `TrainingJob` exists and is used to track background model training.
- `DatasetBuffer` connects retraining queue samples to a training job.
- The frontend admin dashboard loads queue items and training jobs.
- The backend exposes retraining APIs through `core/views.py` and `core/urls.py`.
- Celery tasks support training, queue threshold checks, and deployment.

## What is NOT Implemented Yet
This repository does not currently implement the full batch-aware retraining lifecycle described in earlier plans.

- No explicit `RetrainingBatch` model or batch export workflow exists.
- No Label Studio connector file is present in the repository.
- There is no automated export/import path for labeled data from Label Studio.
- Batch readiness, batch grouping, and batch-level training triggers are not implemented.
- The current retraining flow is sample-driven, not batch-driven.
- The active inference service refresh and model hot-swap are not fully documented or wired for production automation.

## Current Gaps to Close
These are the high-priority improvements needed to make the system complete and easier to develop against.

1. Batch-aware retraining support
   - Add a `RetrainingBatch` model or equivalent metadata grouping.
   - Store batch labels, export state, and label studio project/task associations.
2. Label Studio integration
   - Create `core/label_studio_connector.py` or similar connector.
   - Add endpoints to export queued samples and import labeled results.
3. Persisted queue lifecycle
   - Keep queue entries until they are labeled and consumed by training.
   - Avoid discarding entries simply because they have been reviewed.
4. Dataset assembly and threshold logic
   - Build deterministic logic that selects labeled queue items for training jobs.
   - Support both admin-triggered retraining and automatic retraining when thresholds are met.
5. Deployment / production handoff
   - Confirm active model switching behavior with the inference service.
   - Add explicit deploy controls so admins can promote a trained model safely.
6. Frontend UI clarity
   - Rename the admin page consistently to `Retraining` instead of `Batches`.
   - Surface queue status, labeled items, and deployment readiness clearly.

## Thin Phase Roadmap
This roadmap is designed around what is already in place and what remains.

### Phase 1 — Core operations and sample-level retraining (Completed)
- Inference request flow from frontend to backend.
- `InferenceLog` persistence.
- `RetrainingQueue` creation for low-confidence / manual review items.
- `TrainingJob` creation and Celery training execution.
- Admin retraining dashboard that lists queue items and jobs.

### Phase 2 — Labeling and model lifecycle improvement (Partially done)
- Admin item labeling and sample-level retraining trigger: implemented.
- Training background tasks and deployment-ready model version creation: implemented.
- Remaining work in this phase:
  - label import/export support
  - clearly defined dataset assembly for retraining
  - identify and wire the inference service to use the new active model version.

### Phase 3 — Batch-aware pipeline and automation (To do)
- Introduce batch grouping for retraining candidates.
- Add a batch export workflow for Label Studio.
- Add a batch label import workflow that converts annotations to queue item labels.
- Support batch-level training triggers and training job metadata.
- Implement auto-retraining trigger logic based on labeled batch sizes or quality thresholds.

### Phase 4 — Production readiness & stabilization (To do)
- Add deployment guardrails and review steps for new models.
- Add clear admin state for “ready to deploy”, “deployed”, and “archive old model”.
- Add monitoring metrics for retraining queue size, model accuracy, and label throughput.
- Document recovery procedures for stuck jobs, failed exports, and rollback paths.

## Critical “Need to Do” Items
These are the items the team should base development on until the pipeline is finished.

- Build the Label Studio export/import connector and endpoint layer.
- Define and implement a batch metadata model if the system is expected to support batch retraining.
- Keep retraining queue entries alive until labeling and training completion.
- Add a clear admin workflow for how labeled samples move into training datasets.
- Ensure the inference service can switch to a newly activated model without manual machine restarts.
- Clean up the frontend naming and UI so `Retraining` is the main admin page, not `Batches`.

## File References for Current Implementation
- `frontend-vite/src/components/AdminDashboard.jsx`
- `frontend-vite/src/api/backend.js`
- `core/models.py`
- `core/views.py`
- `core/tasks.py`
- `core/serializers.py`
- `core/urls.py`
- `ai_ins_sys/celery.py`

## Notes for the Team
- Today, the system is operational at the sample-level retraining stage.
- Use this document as the unambiguous source of truth for current flow and remaining work.
- Do not assume batch export or Label Studio integration exists yet: those are future phases.
- Prioritize the queue lifecycle, dataset assembly, and deployment handoff before building more UI layers.


