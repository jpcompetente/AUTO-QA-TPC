# Manual Review Drawing - Visual Workflow Guide

## User Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPERATOR INSPECTION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. CAPTURE PHASE
   ┌─────────────────────────────┐
   │  Operator starts session    │
   │  Camera feed displays       │
   └──────────────┬──────────────┘
                  │
                  ▼
   ┌─────────────────────────────┐
   │ AI analyzes frame (live)    │
   │ No defects found (MISS!)    │
   └──────────────┬──────────────┘
                  │
                  ▼

2. DETECTION PHASE
   ┌────────────────────────────────────────┐
   │  Manual Capture triggered              │
   │  Image frozen on screen                │
   │  Review Modal appears                  │
   └────────────────┬───────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────────┐
   │  System Decision: PASS (AI thought)    │
   │  Confidence: 72%                       │
   │  Status: Requires Operator Review      │
   └────────────────┬───────────────────────┘
                    │
                    ▼

3. REVIEW DECISION
   ┌────────────────────────────────────────┐
   │  [Acknowledge]  [Reject]               │  <- Choose action
   └────────────────┬───────────────────────┘
                    │
                    ├─ ACKNOWLEDGE ──────→ Accept AI decision
                    │                       (Submit review)
                    │
                    └─ REJECT ────────────→ Disagree with AI
                                           (More options shown)
                                           │
                                           ▼
                    ┌────────────────────────────────────────┐
                    │  Description: [operator input box]     │
                    │  Rejection Reason: [Missed Defect v]   │
                    │  Final Decision: [FAIL v]              │
                    │                                        │
                    │  ┌──────────────────────────────────┐  │
                    │  │ Mark missed defects?             │  │
                    │  │ Use drawing to annotate areas    │  │
                    │  │  ┌─────────────┐                │  │
                    │  │  │✏️ Draw      │ ← NEW FEATURE!│  │
                    │  │  │   Defects   │                │  │
                    │  │  └─────────────┘                │  │
                    │  └──────────────────────────────────┘  │
                    │                                        │
                    │  [Submit Review]  OR  [✏️ Draw...]     │
                    └────────────────────────────────────────┘
                                           │
                                           ▼

4. MANUAL ANNOTATION PHASE ✨ NEW
   ┌──────────────────────────────────────────────────────────┐
   │              MANUAL REVIEW DRAWING INTERFACE              │
   ├──────────────────────────────────────────────────────────┤
   │                                                           │
   │  ┌─────────────────────────────────────────────────────┐ │
   │  │                                                     │ │
   │  │            [Captured Image with Canvas]            │ │
   │  │         (User draws boxes/polygons here)            │ │
   │  │                                                     │ │
   │  │  ┌───────┐     ┌─────────┐                        │ │
   │  │  │ Defect│     │ Defect  │  ← Operator draws      │ │
   │  │  │ Area 1│     │ Area 2  │                        │ │
   │  │  └───────┘     └─────────┘                        │ │
   │  │                                                     │ │
   │  └─────────────────────────────────────────────────────┘ │
   │                                                           │
   │  Controls:                                                │
   │  [□ Box]  [◆ Polygon]  [Color: ▮]  [Width: ▬]           │
   │  [↶ Undo]  [🗑 Clear]  2 annotations                     │
   │                                                           │
   │  [🚩 Flag for Retraining]  [Cancel]                      │
   │                                                           │
   └──────────────────────────────────────────────────────────┘
                                           │
                                           ▼

5. SUBMISSION PHASE
   ┌──────────────────────────────────────────────────────────┐
   │  Annotations Serialized:                                 │
   │  {                                                       │
   │    "annotated_defects": [                               │
   │      {                                                   │
   │        "type": "box",                                   │
   │        "coordinates": [[100, 150], [300, 250]],        │
   │        "color": "#FF0000",                             │
   │        "strokeWidth": 2                                │
   │      },                                                │
   │      {                                                  │
   │        "type": "polygon",                              │
   │        "coordinates": [[x, y], ...],                   │
   │        "color": "#FFFF00",                             │
   │        "strokeWidth": 2                                │
   │      }                                                  │
   │    ],                                                   │
   │    "annotation_count": 2,                              │
   │    "created_at": "2024-05-27T12:34:58Z"               │
   │  }                                                       │
   │                                                          │
   │  POST /api/logs/{id}/review                            │
   │       with manual_annotations payload                   │
   │                                                          │
   └──────────────────┬───────────────────────────────────────┘
                      │
                      ▼

6. BACKEND PROCESSING
   ┌────────────────────────────────────────────────────────┐
   │  Backend receives review:                              │
   │  ✓ Store ManualAnnotation records                      │
   │  ✓ Create RetrainingQueue entry                        │
   │  ✓ Update InferenceLog status                          │
   │  ✓ Mark operator_override = True                       │
   │  ✓ Flag for model retraining                           │
   └────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────────────────────────┐
   │  ✅ SUCCESS!                                           │
   │  Review submitted with 2 annotations                   │
   │  Flagged for retraining pipeline                       │
   └────────────────┬─────────────────────────────────────────┘
                    │
                    ▼

7. RETURN TO INSPECTION
   ┌────────────────────────────────────────────────────────┐
   │  UI Resets:                                            │
   │  ✓ Modal closes                                        │
   │  ✓ Canvas clears                                       │
   │  ✓ State resets                                        │
   │  ✓ Returns to live camera feed                         │
   │                                                        │
   │  Operator continues inspection...                      │
   └────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      OPERATOR PANEL                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Camera Feed Section                                    │ │
│  │  ├─ Webcam component                                   │ │
│  │  ├─ Overlay canvas (for AI annotations)               │ │
│  │  └─ Capture & Detect button                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           │                                    │
│                           ├─→ [Detection triggered]             │
│                           │                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Review Modal (NEW)                                    │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  [Acknowledge]  [Reject]                          │ │ │
│  │  ├────────────────────────────────────────────────────┤ │ │
│  │  │  Description: [textarea]                          │ │ │
│  │  │  Reason: [dropdown]                               │ │ │
│  │  │                                                    │ │ │
│  │  │  ┌──────────────────────────────────────────────┐│ │ │
│  │  │  │  Mark missed defects?                        ││ │ │
│  │  │  │  [✏️ Draw Defects] ←─ NEW BUTTON            ││ │ │
│  │  │  └──────────────────────────────────────────────┘│ │ │
│  │  │                                                    │ │ │
│  │  │  [Submit Review]                                 │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │                     │                                   │ │
│  │                     └─→ [Click "Draw Defects"]          │ │
│  │                                                         │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  MANUAL REVIEW DRAWING COMPONENT ✨              │ │ │
│  │  │  ┌──────────────────────────────────────────────┐ │ │ │
│  │  │  │                                              │ │ │ │
│  │  │  │  <canvas ref={canvasRef}                    │ │ │ │
│  │  │  │    onMouseDown={handleMouseDown}            │ │ │ │
│  │  │  │    onMouseMove={handleMouseMove}            │ │ │ │
│  │  │  │    onMouseUp={handleMouseUp}>               │ │ │ │
│  │  │  │  </canvas>                                  │ │ │ │
│  │  │  │                                              │ │ │ │
│  │  │  │  ┌──────────────────────────────────────┐  │ │ │ │
│  │  │  │  │ State:                               │  │ │ │ │
│  │  │  │  │ - isDrawing: boolean                │  │ │ │ │
│  │  │  │  │ - currentPath: [[x,y], ...]        │  │ │ │ │
│  │  │  │  │ - annotations: [paths]             │  │ │ │ │
│  │  │  │  │ - strokeColor: hex                 │  │ │ │ │
│  │  │  │  │ - strokeWidth: number              │  │ │ │ │
│  │  │  │  └──────────────────────────────────────┘  │ │ │ │
│  │  │  │                                              │ │ │ │
│  │  │  └──────────────────────────────────────────────┘ │ │ │
│  │  │                                                    │ │ │
│  │  │  Controls:                                        │ │ │
│  │  │  [□ Box] [◆ Polygon] [Color] [Width]            │ │ │
│  │  │  [↶ Undo] [🗑 Clear]  Annotations: 2             │ │ │
│  │  │                                                    │ │ │
│  │  │  [🚩 Flag for Retraining]  [Cancel]             │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │                     │                                   │ │
│  │                     └─→ [Submit]                         │ │
│  │                                                         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           │                                    │
│                           └─→ API: reviewInferenceLog()       │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────┐
│ OperatorPanel│
│   State      │
└──────┬───────┘
       │
       ├─ detectionResult
       ├─ capturedFrame
       ├─ reviewMode
       ├─ showManualReview ← NEW
       └─ submittingAnnotations ← NEW
                  │
                  ▼
       ┌────────────────────────┐
       │ ManualReviewDrawing    │
       │     Component          │
       └────────────┬───────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │ Canvas │ │ State  │ │Handlers│
    │ Ref    │ │        │ │        │
    └────────┘ └────────┘ └────────┘
        │           │           │
        └───────────┼───────────┘
                    │
                    ├─ isDrawing
                    ├─ currentPath
                    ├─ annotations
                    ├─ completedPaths
                    ├─ strokeColor
                    └─ strokeWidth
                         │
                         ▼
        ┌─────────────────────────┐
        │  onSubmit(payload)      │
        │  Called when operator   │
        │  clicks submit          │
        └────────────┬────────────┘
                     │
        ┌────────────▼─────────────┐
        │ handleManualAnnotations  │
        │ Submit (OperatorPanel)   │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │  reviewInferenceLog()    │
        │  API Call with:          │
        │  - annotations payload   │
        │  - review decision       │
        │  - description           │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │  Django Backend API      │
        │  /logs/{id}/review       │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │  Database:              │
        │  ✓ ManualAnnotation    │
        │  ✓ RetrainingQueue     │
        │  ✓ InferenceLog update │
        └────────────────────────┘
```

## Drawing Modes Visualization

### Box Mode (Click and Drag)
```
START              DRAG              RELEASE
┌────────────┐    ┌────────────┐    ┌────────────┐
│            │    │      ┌─────│────│────┐       │
│     🖱️     │ → │      │ DRAG │────│────│       │ → Box saved
│            │    │      └─────│────│────┘       │
└────────────┘    └────────────┘    └────────────┘
  Mouse Down       Mouse Move        Mouse Up
```

### Polygon Mode (Click to Place Points)
```
CLICK 1           CLICK 2           CLICK 3        DOUBLE CLICK
┌────────────┐   ┌────────────┐   ┌────────────┐  ┌────────────┐
│      ●     │   │      ●     │   │      ●     │  │    ●───┐  │
│            │   │     / \    │   │    / \     │  │   │   │  │
│            │ → │    /   \   │ → │   /   \    │ → │   └───┘  │
│            │   │           │   │   \     \  │  │           │
└────────────┘   └────────────┘   └────────────┘  └────────────┘
  Start point      Line to P2        Line to P3     Polygon closed
```

## State Machine

```
                     ┌─────────────────────┐
                     │   INITIAL STATE     │
                     │ showManualReview=F  │
                     │ currentPath=[]      │
                     │ annotations=[]      │
                     └────────┬────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Open Drawing UI   │
                    │ showManualReview=T│
                    └────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
        │ Drawing     │ │ Modifying   │ │ Ready to     │
        │ Box/Polygon │ │ Style       │ │ Submit       │
        │             │ │ (Color/     │ │ annotations>0│
        │ isDrawing=T │ │  Width)     │ │              │
        └────┬─────────┘ │             │ └──────┬───────┘
             │           └─────────────┘        │
             │                                  │
    ┌────────▼──────────┐              ┌────────▼──────────┐
    │ Mouse Up          │              │ Click Submit      │
    │ Save annotation   │              │ isSubmitting=T    │
    │ currentPath=[]    │              │                   │
    └────────┬──────────┘              └────────┬──────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            │
                   ┌────────▼─────────┐
                   │ API Response OK  │
                   │ isSubmitting=F   │
                   │ Close UI         │
                   │ Reset state      │
                   └────────┬─────────┘
                            │
                   ┌────────▼────────────┐
                   │ INITIAL STATE       │
                   │ (Ready for next)    │
                   └─────────────────────┘
```

## Canvas Event Loop

```
┌─────────────────────────────────────────────┐
│          CANVAS EVENT HANDLER LOOP          │
└─────────────────────────────────────────────┘
        │
        ├─ onMouseDown(e)
        │  ├─ getCanvasCoordinates(e)
        │  ├─ setIsDrawing(true)
        │  └─ setCurrentPath([coords])
        │
        ├─ onMouseMove(e) [while isDrawing]
        │  ├─ getCanvasCoordinates(e)
        │  └─ updatePath (Box: replace, Polygon: append)
        │     └─ triggers redrawCanvas()
        │
        ├─ onMouseUp(e)
        │  ├─ setIsDrawing(false)
        │  ├─ validatePath()
        │  ├─ addToAnnotations()
        │  ├─ setCurrentPath([])
        │  └─ triggers redrawCanvas()
        │
        └─ redrawCanvas() [runs on every state change]
           ├─ ctx.clearRect()
           ├─ drawImage()
           ├─ completedPaths.forEach(drawPathOnCanvas)
           └─ drawPathOnCanvas(currentPath) [if any]
```

## Timeline Example

```
Time: 0s    Operator clicks "Draw Defects"
            └─ showManualReview = true
            └─ UI displays ManualReviewDrawing

Time: 5s    Operator switches to Box mode
            └─ drawMode = "box"

Time: 7s    Operator clicks and drags on canvas
            └─ onMouseDown (isDrawing=true, currentPath=[P1])
            └─ onMouseMove x10 (currentPath=P1→P2 updated)
            └─ redrawCanvas() called repeatedly
            └─ Canvas shows live preview

Time: 10s   Operator releases mouse
            └─ onMouseUp (isDrawing=false)
            └─ Annotation saved to completedPaths
            └─ currentPath reset

Time: 12s   Operator switches to Polygon mode
            └─ drawMode = "polygon"

Time: 14s   Operator clicks 4 points then double-clicks
            └─ 4x onMouseDown → 4 points added
            └─ onDoubleClick → polygon closes
            └─ Annotation saved

Time: 16s   Operator clicks "Flag for Retraining"
            └─ isSubmitting = true
            └─ Annotations serialized to JSON
            └─ POST request sent to API

Time: 17s   API returns success
            └─ Modal closes
            └─ State resets
            └─ UI returns to camera feed
            └─ Operator ready for next inspection
```

---

This visual guide helps understand the complete flow, architecture, and interaction patterns of the Manual Review Drawing feature.
