# Live Feed Annotations Fix

## Problem
Live feed annotations (bounding boxes and labels) were not showing on the webcam stream in the OperatorPanel, even though the backend was sending detection data.

## Root Cause Analysis

### Discovery Process
1. Reviewed the architecture showing two rendering paths:
   - **Server-side**: `annotated_image_b64` rendered in `_render_annotated_png_b64()` 
   - **Client-side**: HTML5 Canvas with `drawOverlay()` function

2. Found the zIndex layering:
   - Server image: zIndex 11 (on top)
   - Canvas: zIndex 10 (underneath)

3. Discovered the critical bug in `core/consumers.py` (lines 413-416):
   ```python
   if not result.annotated_image_b64:
       result.annotated_image_b64 = _render_annotated_png_b64(
           image_bytes,
           result.detections,
       )
   ```
   This code **ALWAYS** generates a server-rendered image, even when there are NO detections!

### Why This Causes Annotations to Not Show
- Backend renders every frame (even empty ones) and sends `annotated_image_b64`
- Frontend receives this and displays it at zIndex 11
- Server image covers the canvas at zIndex 10
- Client-side canvas drawing is NEVER visible because it's always behind the server image

## Solution

### Change Made
Modified `core/consumers.py` to only generate `annotated_image_b64` when there are actual detections:

**Before:**
```python
if not result.annotated_image_b64:
    result.annotated_image_b64 = _render_annotated_png_b64(
        image_bytes,
        result.detections,
    )
```

**After:**
```python
# Only generate server-side annotation if there are actual detections
# For live stream, let frontend draw on canvas instead for better responsiveness
if not result.annotated_image_b64 and result.detections and len(result.detections) > 0:
    result.annotated_image_b64 = _render_annotated_png_b64(
        image_bytes,
        result.detections,
    )
```

### Result
- When there ARE detections: Server image is rendered and displayed (expected behavior)
- When there are NO detections: `annotated_image_b64` is NOT sent, so canvas is visible
- Frontend canvas can now draw the detections without being covered

## Frontend Debugging Additions

Added comprehensive debug logging to `OperatorPanel.jsx`:

1. **WebSocket message handler** (line 732):
   - Logs detection count and annotation structure
   - Helps verify data is being received correctly

2. **drawOverlay function** (line 373):
   - Logs when function is called and with how many detections
   - Logs canvas/media readiness status
   - Provides visibility into rendering pipeline

3. **drawFrame animation loop** (line 591-603):
   - Logs canvas state (when drawing vs clearing)
   - Logs detection count before drawing
   - Helps diagnose animation frame issues

4. **drawDetections helper** (line 428-430):
   - Logs each detection being drawn with its bbox and confidence
   - Helps verify drawing coordinates are valid

## How Live Annotations Now Work

1. **Live inference loop**: Sends frame via WebSocket at ~1.5s intervals or when motion detected
2. **Backend processing**: 
   - Runs inference model
   - **NEW**: Only generates `annotated_image_b64` if detections exist
   - Returns inference result with `detections` array
3. **Frontend reception**: 
   - WebSocket handler receives result and calls `setDetectionResult()`
   - If `annotated_image_b64` exists: Display server image at zIndex 11
   - If NO `annotated_image_b64`: Canvas renders detections at zIndex 10
4. **Canvas drawing**:
   - `drawFrame()` animation loop continuously renders
   - Draws bounding boxes (green for INTACT, red for SCRATCH)
   - Draws labels with confidence percentages
   - Respects original video aspect ratio with proper scaling

## Performance Benefits

- Server no longer wastes CPU rendering empty images
- Network bandwidth reduced (no sending base64 images with no annotations)
- Frontend canvas is more responsive than waiting for server rendering
- Better user experience with lower latency on annotations

## Testing Recommendations

1. **With detections**: Verify bounding boxes and labels appear on canvas
2. **Without detections**: Verify no overlay image appears (canvas shows clean video)
3. **Browser console**: Check debug logs confirm drawing is happening
4. **Multiple detections**: Verify all boxes are drawn with correct colors/labels
5. **Performance**: Monitor CPU/memory usage with and without detections

## Files Modified

- `core/consumers.py` (lines 411-418): Fixed annotation generation logic
- `frontend-vite/src/components/OperatorPanel.jsx`: Added debug logging (lines 373-383, 428-430, 591-603, 732-739)

## Rollback Plan

If issues arise, revert to original code:
```python
# Revert consumers.py to always generate annotation
if not result.annotated_image_b64:
    result.annotated_image_b64 = _render_annotated_png_b64(
        image_bytes,
        result.detections,
    )
```

Then comment out debug logging in OperatorPanel.jsx.
