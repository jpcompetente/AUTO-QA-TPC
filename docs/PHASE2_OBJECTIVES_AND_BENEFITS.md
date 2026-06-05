# System Flow Optimization: Phase 2–4 Strategy

**Date**: June 4, 2026  
**Status**: Planning & Requirements  
**Target**: Automated Labeling, Retraining & Deployment for AUTO-QA TPC

---

## Why We Need to Fix the System Flow

### Current Problems

1. **Manual bottleneck** — Every labeled sample requires admin intervention; doesn't scale
2. **Slow feedback loop** — Defects → queue → manual label → manual trigger → training = days
3. **No organization** — Samples are loose; no batch grouping or tracking what was trained together
4. **No automation** — Can't auto-retrain when confidence drops or defects spike
5. **Risky deployment** — No guard rails; new models go live without validation workflow
6. **Lost context** — No link between "defect batch", "Label Studio project", and "trained model version"

**Impact**: System does not scale; QA team becomes bottleneck; defect detection improvements are slow and unpredictable.

---

## Objectives: What We Build

### Phase 2 — Labeling and Model Lifecycle Improvement

**Core Goal**: Connect defect labeling workflow with automated retraining and safe model deployment.

**Deliverables:**
- **Label Studio export/import connector**
  - Export queued defects → Label Studio project
  - Import labeled annotations → system labels
  - Bidirectional sync with version tracking

- **Defect batches → Label Studio → training dataset (automatic)**
  - Collect defects by type/component/time window
  - Export batch to Label Studio for QA labeling
  - Automatically convert labeled results into training dataset
  - Trigger retraining without manual admin step

- **Inference service loads new models without restart**
  - Add hot-reload mechanism to inference server
  - Signal inference service when new model is active
  - Ensure zero-downtime model switchover

**Timeline**: 2–3 weeks  
**Team**: Backend (connector + dataset assembly) + Inference (model hot-swap)

---

### Phase 3 — Batch-Aware Pipeline and Automation

**Core Goal**: Enable automatic retraining based on batch readiness and quality thresholds.

**Deliverables:**
- **Batch grouping**
  - Organize defects by type, component, time window, or confidence level
  - Store batch metadata (created_at, labeled_count, export_state, model_version)
  - Track lineage: batch → Label Studio project → training job → model version

- **Auto-trigger logic**
  - Examples:
    - "When 50 labeled defects collected → auto-retrain"
    - "When new defect type appears → create batch + notify QA"
    - "When defect rate spikes → prioritize batch for labeling"

- **Quality thresholds**
  - Monitor model accuracy in production
  - Alert when accuracy drops below threshold (e.g., 92%)
  - Auto-trigger retraining if threshold breached
  - Compare new model accuracy before/after deployment

- **Batch-level training metadata**
  - Link training job to batch (not individual samples)
  - Track training parameters, dataset size, accuracy metrics
  - Enable audit trail: "Model v3 trained on Batch 12 (50 samples)"

**Timeline**: 3–4 weeks  
**Team**: Backend (batch model + trigger logic) + Frontend (batch dashboard)

---

### Phase 4 — Production Readiness & Stabilization

**Core Goal**: Safe, auditable, reversible model deployments.

**Deliverables:**
- **Deployment guardrails**
  - "Ready to deploy" state with validation checks:
    - Accuracy must exceed baseline
    - Must not regress on historical test set
    - Must show improvement on recent defects
  - Block deployment if checks fail

- **Admin review workflow**
  - Admin sees: new model accuracy, improvements, comparison to active model
  - Admin approves/rejects before production
  - Audit log: who approved, when, accuracy metrics

- **Deployment states**
  - "Ready to deploy" — passed validation, awaiting review
  - "Deployed" — active in production
  - "Archived" — old model, kept for rollback
  - "Rolled back" — reverted due to performance issues

- **Rollback path**
  - One-click revert to previous model version
  - Automatic rollback if production accuracy degrades
  - Full history of deployed models + performance metrics

- **Monitoring metrics**
  - Retraining queue size (alert if backlog grows)
  - Model accuracy over time (track improvements)
  - Label throughput (samples labeled per day)
  - Deployment frequency & rollback rate

**Timeline**: 3–4 weeks  
**Team**: Backend (metrics + rollback) + Frontend (admin dashboard) + DevOps (monitoring)

---

## Benefits for QA Teams

| Benefit | Impact | Timeline |
|---------|--------|----------|
| **3–5x faster feedback** | Defects labeled → retrained → deployed in hours, not days | Phase 2 |
| **Continuous improvement** | Model gets better automatically as more defects are labeled | Phase 3 |
| **Less manual work** | QA focuses on labeling; system handles retraining/deployment | Phase 2 |
| **Better data organization** | Batches = clear lineage of what was labeled & trained together | Phase 3 |
| **Safety guardrails** | Models don't deploy without validation; easy rollback | Phase 4 |
| **Scalability** | Can handle 10x more defects without adding overhead | Phase 2–3 |
| **Measurable quality** | Track accuracy/confidence trends; identify edge cases early | Phase 3–4 |
| **Audit trail** | Full history: defect → batch → labeled → model version → deployment | Phase 2–4 |

---

## Current State vs. Future State

### Today (Current System)
```
QA captures defect image
  ↓
System logs inference (low confidence or manual review)
  ↓
Admin manually reviews queue
  ↓
Admin labels each sample
  ↓
Admin must remember to trigger retraining
  ↓
Backend trains model in background
  ↓
New model version sits idle (no activation)
  ↓
Admin manually copies model to inference server
  ↓
No validation; risky deployment
  ↓
No monitoring; can't tell if new model is better
```

**Result**: Days or weeks per cycle; QA is bottleneck; risky deployments; no feedback.

---

### After Phase 2–4 (Optimized System)
```
QA captures defect images
  ↓
System logs inference + groups into batch
  ↓
Batch reaches 50 labeled samples → auto-export to Label Studio
  ↓
QA labels defects in Label Studio (their native tool)
  ↓
System auto-imports labels → creates training dataset
  ↓
Auto-triggers retraining → new model version
  ↓
Validation gates check accuracy vs. baseline
  ↓
Admin reviews metrics, approves deployment
  ↓
System hot-swaps model to inference server (zero downtime)
  ↓
Production accuracy monitored continuously
  ↓
If accuracy drops → auto-alert + auto-rollback option
```

**Result**: Hours per cycle; QA's bottleneck eliminated; safe deployments; continuous improvement.

---

## Bottom Line

### Before Optimization
- QA labels defects manually
- Admin must remember to trigger training
- New model sits idle until manual deployment
- No validation; risky go-live
- No feedback if new model is better

### After Optimization
- QA labels defects in Label Studio (standard tool)
- System auto-batches and auto-trains
- New model auto-validated and auto-deployed
- Safe gates prevent bad models going live
- Continuous monitoring shows improvements

**Result**: Defect detection improves continuously without QA team becoming a bottleneck.

---

## Implementation Roadmap

| Phase | Duration | Key Work | Deliverable |
|-------|----------|----------|-------------|
| **Phase 2** | 2–3 weeks | Label Studio connector + dataset assembly + model hot-swap | Automated labeling → training → deployment |
| **Phase 3** | 3–4 weeks | Batch grouping + auto-trigger logic + quality thresholds | Autonomous retraining based on rules |
| **Phase 4** | 3–4 weeks | Deployment validation + admin review + rollback + monitoring | Safe, auditable, reversible deployments |

**Total Effort**: 8–11 weeks for full automation stack  
**Quick Win**: Phase 2 alone (2–3 weeks) eliminates 70% of manual overhead

---

## Next Steps

1. **Confirm priority**: Start with Phase 2 (labeling automation)?
2. **Assign resources**: Backend, Frontend, Inference engineering
3. **Create detailed specs**: Label Studio API integration, dataset assembly algorithm, model hot-reload mechanism
4. **Begin Phase 2**: Label Studio connector + export/import endpoints

---

## References

- [SIMPLIFIED_SYSTEM_FLOW.md](SIMPLIFIED_SYSTEM_FLOW.md) — Current system flow and gap analysis
- [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md) — Technical system overview
- `core/models.py` — Where to add batch metadata
- `core/views.py` — Where to add export/import endpoints
- `frontend-vite/src/components/AdminDashboard.jsx` — Where to add batch workflow UI

