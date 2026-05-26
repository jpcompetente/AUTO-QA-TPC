# AUTO-QA-TPC Version Tracking

## Current Stable Release: v1.0.0

**Release Date:** May 26, 2026  
**Branch:** `stable-v1.0.0`  
**Tag:** `v1.0.0-stable`  
**Commit:** c6143dd

### Features in this Release
- ✅ Threshold-based decision approval (confidence threshold)
- ✅ Session history tracking and batch log display
- ✅ CSRF security (trusted origins configuration)
- ✅ FastAPI inference server with async/sync boundary management
- ✅ Model registry with LRU caching

### How to Use This Stable Version

#### Switch to stable branch:
```bash
git checkout stable-v1.0.0
```

#### Checkout from stable tag:
```bash
git checkout v1.0.0-stable
```

#### Create recovery branch if needed:
```bash
git checkout -b recovery-v1.0.0 v1.0.0-stable
```

### Known Issues
- None reported at time of release

### Rollback Instructions
If errors occur in newer versions, rollback using:
```bash
git checkout v1.0.0-stable
```

---

## Version History

| Version | Date | Branch | Commit | Status |
|---------|------|--------|--------|--------|
| v1.0.0 | 2026-05-26 | stable-v1.0.0 | c6143dd | ✅ Stable |
