# Manual Review Drawing Feature - Documentation

## Overview

The **Manual Review Drawing** feature enables operators to manually annotate missed defects on captured inspection images using an interactive HTML5 Canvas. When the AI inspection system fails to detect defects, operators can draw bounding boxes or polygons over the missed areas, which are then flagged for model retraining.

## Files Created

1. **ManualReviewDrawing.jsx** - Main React component with all drawing logic
2. **ManualReviewDrawing.css** - Styling and responsive design
3. **MANUAL_REVIEW_INTEGRATION_GUIDE.js** - Integration instructions
4. **MANUAL_REVIEW_DRAWING_README.md** - This documentation

## Component Features

### 1. **Dual Drawing Modes**
   - **Box Mode**: Click and drag to draw rectangular bounding boxes
   - **Polygon Mode**: Click to place points; double-click to close the polygon

### 2. **Customizable Styling**
   - Color picker to select annotation color
   - Stroke width slider (1-8 pixels)
   - Real-time preview of styling

### 3. **Full Drawing Controls**
   - Undo: Revert the last annotation
   - Clear: Remove all annotations
   - Real-time canvas updates as you draw

### 4. **Annotation Management**
   - Track number of annotations
   - Store annotation coordinates and metadata
   - Export annotations as JSON for API submission

### 5. **Responsive Design**
   - Automatically scales to container size
   - Maintains image aspect ratio
   - Mobile-friendly controls

## API Props

```jsx
<ManualReviewDrawing
  imageUrl={string}           // URL of the image to annotate
  onSubmit={function}         // Async callback: (annotations) => Promise
  onCancel={function}         // Callback: () => void
  isSubmitting={boolean}      // Disable controls while submitting
/>
```

### Props Details

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `imageUrl` | string | ✓ | URL of the captured inspection image |
| `onSubmit` | function | ✓ | Async callback that receives annotation payload |
| `onCancel` | function | ✓ | Called when user cancels without submitting |
| `isSubmitting` | boolean | ✗ | Disables all controls during submission (default: false) |

## Integration Steps

### Step 1: Import the Component

```jsx
import ManualReviewDrawing from "./ManualReviewDrawing";
import "./ManualReviewDrawing.css"; // Don't forget the CSS!
```

### Step 2: Add State Variables

```jsx
const [showManualReview, setShowManualReview] = useState(false);
const [submittingAnnotations, setSubmittingAnnotations] = useState(false);
```

### Step 3: Create a Submit Handler

```jsx
const handleManualAnnotationsSubmit = useCallback(
  async (annotationsPayload) => {
    const logId = detectionResult?.log_id || detectionResult?.id;

    if (!logId) {
      setError("No inference log available for annotation.");
      return;
    }

    setSubmittingAnnotations(true);

    try {
      // Build review data
      const reviewData = {
        action: "REJECT",
        description: "Operator manually flagged missed defects",
        final_decision: "FAIL",
        rejection_reason: "MISSED_DEFECT",
        manual_annotations: annotationsPayload.annotated_defects,
        annotation_count: annotationsPayload.annotation_count,
        operator_override: true,
      };

      // Submit to API
      await reviewInferenceLog(logId, reviewData);

      // Clear state and refresh
      setShowManualReview(false);
      setDetectionResult(null);
      await fetchLogsRef.current();
    } catch (error) {
      setError("Failed to submit annotations");
    } finally {
      setSubmittingAnnotations(false);
    }
  },
  [detectionResult, /* ... other deps ... */]
);
```

### Step 4: Render the Component

```jsx
{activePanel === "camera" && detectionResult && (
  <div className="review-modal" role="dialog" aria-modal="true">
    <div className="review-modal__panel">
      {!showManualReview ? (
        // ... existing review interface ...
        
        {/* Add this button in REJECT mode */}
        <button
          className="primary-button"
          onClick={() => setShowManualReview(true)}
          type="button"
        >
          ✏️ Draw Defects
        </button>
      ) : (
        // ... manual review interface ...
        <>
          <div className="section-heading">
            <p className="eyebrow">Manual review</p>
            <h2>Annotate missed defects</h2>
          </div>

          <ManualReviewDrawing
            imageUrl={capturedFrame}
            onSubmit={handleManualAnnotationsSubmit}
            onCancel={() => setShowManualReview(false)}
            isSubmitting={submittingAnnotations}
          />
        </>
      )}
    </div>
  </div>
)}
```

## Annotation Payload Format

When the operator submits annotations, the component sends this JSON structure to your `onSubmit` handler:

```json
{
  "annotated_defects": [
    {
      "type": "box",
      "coordinates": [[100, 150], [300, 250]],
      "color": "#FF0000",
      "strokeWidth": 2,
      "timestamp": "2024-05-27T12:34:56.789Z"
    },
    {
      "type": "polygon",
      "coordinates": [[50, 75], [150, 75], [150, 175], [50, 175]],
      "color": "#FFFF00",
      "strokeWidth": 2,
      "timestamp": "2024-05-27T12:34:57.123Z"
    }
  ],
  "annotation_count": 2,
  "image_url": "data:image/png;base64,...",
  "created_at": "2024-05-27T12:34:58.456Z"
}
```

## Backend Integration

### Django REST API Example

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.db import models

class ManualAnnotation(models.Model):
    """Store manual annotations for retraining"""
    inference_log = models.ForeignKey('InferenceLog', on_delete=models.CASCADE)
    annotation_type = models.CharField(
        max_length=20,
        choices=[('box', 'Bounding Box'), ('polygon', 'Polygon')]
    )
    coordinates = models.JSONField()  # List of [x, y] points
    color = models.CharField(max_length=7)  # Hex color
    stroke_width = models.IntegerField(default=2)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class RetrainingQueue(models.Model):
    """Queue items for model retraining"""
    inference_log = models.ForeignKey('InferenceLog', on_delete=models.CASCADE)
    reason = models.CharField(max_length=50)  # e.g., 'manual_annotation'
    annotation_count = models.IntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        default='pending',
        choices=[('pending', 'Pending'), ('processed', 'Processed'), ('failed', 'Failed')]
    )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def review_inference_log(request, log_id):
    """Accept operator review with optional manual annotations"""
    
    log = InferenceLog.objects.get(id=log_id)
    data = request.data
    
    manual_annotations = data.get('manual_annotations', [])
    
    if manual_annotations:
        # Store each annotation
        for ann in manual_annotations:
            ManualAnnotation.objects.create(
                inference_log=log,
                annotation_type=ann['type'],
                coordinates=ann['coordinates'],
                color=ann['color'],
                stroke_width=ann['strokeWidth'],
                created_by=request.user
            )
        
        # Queue for retraining
        RetrainingQueue.objects.create(
            inference_log=log,
            reason='manual_annotation',
            annotation_count=len(manual_annotations),
            created_by=request.user
        )
    
    # Update log status
    log.operator_override = True
    log.final_decision = data.get('final_decision')
    log.operator_comment = data.get('description')
    log.save()
    
    return Response({'status': 'success', 'log_id': log.id})
```

## Usage Workflow

### Typical User Flow

1. **Detection Fails**: AI doesn't detect a defect on the image
2. **Operator Reviews**: Operator sees the "Reject inference" option
3. **Draw Defects**: Operator clicks "Draw Defects" button
4. **Annotate**: Uses canvas to draw boxes/polygons over missed areas
5. **Customize**: Adjusts color and stroke width as needed
6. **Submit**: Clicks "Flag for Retraining"
7. **Feedback**: System confirms submission and refreshes

### Example Drawing Sequences

#### Drawing a Bounding Box
```
1. Select "Box" mode
2. Click and drag diagonally to define rectangle corners
3. Release mouse
4. Box annotation is saved
5. Repeat or click "Flag for Retraining"
```

#### Drawing a Polygon
```
1. Select "Polygon" mode
2. Click to place first point
3. Click to place additional points
4. Double-click to close polygon (or double-click last point)
5. Polygon annotation is saved
6. Repeat or click "Flag for Retraining"
```

## Styling & Theming

### CSS Classes Available

- `.manual-review-drawing` - Container
- `.drawing-wrapper` - Canvas wrapper
- `.drawing-canvas` - Canvas element itself
- `.control-button` - Drawing mode buttons
- `.control-button--active` - Active mode button
- `.primary-button` - Submit button
- `.ghost-button` - Cancel button

### Customizing Colors

Edit `ManualReviewDrawing.css` to match your design:

```css
.control-button--active {
  border-color: #YOUR_COLOR;
  background-color: #YOUR_COLOR;
  color: white;
}

.primary-button {
  background-color: #YOUR_COLOR;
}

.primary-button:hover {
  background-color: #DARKER_SHADE;
}
```

## Accessibility

The component includes several accessibility features:

- Keyboard support via standard button focus
- ARIA labels on interactive elements
- Color contrast ratios meet WCAG AA standards
- Canvas is properly marked with `aria-hidden="true"` when needed

### Keyboard Shortcuts (Recommended Enhancements)

You could add:
- `Esc` - Cancel/Exit
- `Z` - Undo
- `C` - Clear All
- `B` - Switch to Box mode
- `P` - Switch to Polygon mode

## Performance Considerations

### Canvas Rendering
- Redraws only when necessary (state changes)
- Uses `requestAnimationFrame` for smooth updates
- Efficient pixel data handling for motion detection

### Image Handling
- Loads image asynchronously
- Calculates scale factors once on load
- No memory leaks with canvas cleanup

### Optimization Tips
1. Compress images before uploading
2. Use JPG for photos, PNG for graphics
3. Limit annotation count (recommend <50)
4. Clear annotations between images

## Browser Compatibility

| Browser | Support | Version |
|---------|---------|---------|
| Chrome  | ✓       | 90+     |
| Firefox | ✓       | 88+     |
| Safari  | ✓       | 14+     |
| Edge    | ✓       | 90+     |
| IE 11   | ✗       | N/A     |

## Troubleshooting

### Canvas Not Appearing
- Check that `imageUrl` is a valid, accessible URL
- Verify CORS headers if image is from different domain
- Check browser console for errors

### Drawing Not Working
- Ensure canvas has proper z-index
- Check mouse event handlers aren't being blocked
- Verify canvas dimensions with `canvas.width` and `canvas.height`

### Annotations Not Saving
- Check `onSubmit` function is properly async
- Verify API endpoint returns 200 status
- Check network tab for request/response details

### Performance Issues
- Reduce stroke width for faster rendering
- Clear old annotations frequently
- Compress images to < 2MB

## Security Considerations

1. **Image Validation**: Validate image URLs on backend
2. **CORS**: Ensure proper CORS headers
3. **Data Validation**: Validate coordinate arrays
4. **Rate Limiting**: Limit annotation submissions per user
5. **File Upload**: If allowing file uploads, scan for malware

## Future Enhancements

Potential features to add:

- [ ] Keyboard shortcuts for faster workflows
- [ ] Undo/Redo history with multiple levels
- [ ] Freehand drawing mode (pen tool)
- [ ] Eraser tool
- [ ] Annotation labels (e.g., "scratch", "dent")
- [ ] Annotation opacity slider
- [ ] Screenshot/export as annotated image
- [ ] Batch annotation mode
- [ ] Touch/stylus support for tablets
- [ ] Annotation templates/presets

## Questions & Support

For issues or questions:

1. Check browser console for error messages
2. Review the integration guide
3. Verify backend API is accepting the payload format
4. Test with hardcoded image URL first

## License

This component is part of the AUTO-QA-TPC system. Use according to project license terms.

---

**Last Updated**: May 27, 2026
**Component Version**: 1.0.0
**React Version**: 16.8+
