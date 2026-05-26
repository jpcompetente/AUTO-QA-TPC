# Release Notes - v1.0.0-stable

**Release Date:** May 26, 2026  
**Branch:** `stable-v1.0.0`  
**Status:** ✅ Stable & Ready for Production

## Overview
This is the first stable release of AUTO-QA-TPC with all critical features implemented and tested.

## New Features
- **Threshold-based Auto-Approval**: AI decisions are automatically approved when confidence meets the threshold set by Super Admin
- **Session History Tracking**: After batch stops, operators can view complete logs with summary statistics
- **Enhanced Security**: CSRF protection with trusted origins configuration

## Bug Fixes
- Fixed SynchronousOnlyOperation error in Django ORM calls from FastAPI
- Resolved Flask/FastAPI framework conflicts in inference server
- Removed unused state variables causing linting errors

## Technical Improvements
- FastAPI inference server refactored for async/sync boundary management
- Model registry with LRU caching (size=3)
- WebSocket real-time communication for detection streaming
- Proper Django ORM synchronization using @sync_to_async

## Components Updated
- **Frontend**: OperatorPanel.jsx (threshold logic, session history modal)
- **Backend**: ai_ins_sys/settings.py (CSRF_TRUSTED_ORIGINS restored)
- **Inference Server**: app.py (complete FastAPI refactor)

## Testing Status
- ✅ Frontend linting: All tests pass
- ✅ Backend inference: No errors reported
- ✅ CSRF protection: Enabled on all origins
- ✅ Session tracking: Verified working

## Rollback Instructions
If critical issues are discovered:

```bash
# Checkout stable release
git checkout v1.0.0-stable

# Or create recovery branch
git checkout -b recovery v1.0.0-stable

# Push recovery branch if needed
git push origin recovery
```

## Support & Documentation
- See [VERSION.md](VERSION.md) for version history
- See [README.md](README.md) for general documentation
- See [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md) for system architecture

## Next Steps for Development
To continue development after this stable release:
1. Create feature branches from this stable base
2. Test thoroughly before merging back
3. Update version number for next release (v1.1.0-dev)
4. Create new stable branch when features are ready

---
**Maintainer Notes**: This branch should remain protected and unchanged. All development should happen on feature branches that merge back to main.
