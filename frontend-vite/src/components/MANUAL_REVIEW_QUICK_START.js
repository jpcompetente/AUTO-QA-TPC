/**
 * QUICK START: Copy-Paste Integration Snippets
 * =============================================
 *
 * These are ready-to-use code snippets. Copy and paste directly into your
 * OperatorPanel.jsx component.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 1: Import statements (add at the top of OperatorPanel.jsx)
// ═══════════════════════════════════════════════════════════════════════════

import ManualReviewDrawing from "./ManualReviewDrawing";
import "./ManualReviewDrawing.css";

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 2: State variables (add in the useState declarations section)
// ═══════════════════════════════════════════════════════════════════════════

// Around line 76-85, after the other state variables:
const [showManualReview, setShowManualReview] = useState(false);
const [submittingAnnotations, setSubmittingAnnotations] = useState(false);

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 3: Submit handler (add after the submitReview function)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle submission of manual annotations from the drawing tool
 */
const handleManualAnnotationsSubmit = useCallback(
  async (annotationsPayload) => {
    const logId = detectionResult?.log_id || detectionResult?.id;

    if (!logId) {
      setError("No inference log available for annotation.");
      return;
    }

    setSubmittingAnnotations(true);
    setError("");

    try {
      // Build the complete review data with annotations
      const reviewData = {
        action: "REJECT", // Manual annotations = rejection
        description:
          reviewDescription.trim() ||
          "Operator manually flagged missed defects",
        final_decision: "FAIL", // Manual annotations indicate failure
        rejection_reason: reviewRejectionReason || "MISSED_DEFECT",
        manual_annotations: annotationsPayload.annotated_defects,
        annotation_count: annotationsPayload.annotation_count,
        operator_override: true, // Mark as manual override
      };

      // Submit to backend
      await reviewInferenceLog(logId, reviewData);

      // Clear all state
      setShowManualReview(false);
      reviewPendingRef.current = false;
      setReviewPending(false);
      previousFrameRef.current = null;
      stableSinceRef.current = null;
      setDetectionResult(null);
      setCapturedFrame("");
      setLiveAnnotatedOverlaySrc("");
      setReviewDescription("");
      setMotionStatus(
        autoDetectEnabled ? "Waiting for stable frame" : "Auto-detect paused"
      );

      // Refresh logs
      await fetchLogsRef.current();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Failed to submit manual annotations. Please try again."
      );
      console.error("Manual annotation submission error:", requestError);
    } finally {
      setSubmittingAnnotations(false);
    }
  },
  [
    detectionResult,
    reviewDescription,
    reviewRejectionReason,
    autoDetectEnabled,
  ]
);

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 4: Update Review Modal (REPLACE the entire review modal section)
// ═══════════════════════════════════════════════════════════════════════════

/*
  Find the review modal section around line 1770:
  {activePanel === "camera" && detectionResult && (
    <div className="review-modal" role="dialog" aria-modal="true">
      ...
    </div>
  )}

  REPLACE it with this entire section:
*/

{
  activePanel === "camera" &&
    detectionResult &&
    !showManualReview && (
      <div className="review-modal" role="dialog" aria-modal="true">
        <div className="review-modal__panel">
          <div className="section-heading">
            <p className="eyebrow">Operator review</p>
            <h2>Decision required</h2>
          </div>

          <div className="review-choice">
            <button
              className={
                reviewMode === "ACKNOWLEDGE"
                  ? "choice-button choice-button--active"
                  : "choice-button"
              }
              onClick={() => {
                setReviewMode("ACKNOWLEDGE");
                setReviewFinalDecision(
                  detectionResult.system_decision || "PASS"
                );
              }}
              type="button"
            >
              Acknowledge inference
            </button>
            <button
              className={
                reviewMode === "REJECT"
                  ? "choice-button choice-button--active"
                  : "choice-button"
              }
              onClick={() => setReviewMode("REJECT")}
              type="button"
            >
              Reject inference
            </button>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea
              value={reviewDescription}
              onChange={(event) => setReviewDescription(event.target.value)}
              rows={4}
              placeholder="Describe what the operator observed."
            />
          </label>

          {reviewMode === "REJECT" ? (
            <>
              <label className="field">
                <span>Reason for rejection</span>
                <select
                  value={reviewRejectionReason}
                  onChange={(event) =>
                    setReviewRejectionReason(event.target.value)
                  }
                >
                  {REJECTION_REASONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Correct final decision</span>
                <select
                  value={reviewFinalDecision}
                  onChange={(event) =>
                    setReviewFinalDecision(event.target.value)
                  }
                >
                  <option value="PASS">PASS</option>
                  <option value="FAIL">FAIL</option>
                </select>
              </label>

              {/* ✨ NEW: Manual Review Option */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginTop: "16px",
                  padding: "12px",
                  backgroundColor: "#fff3cd",
                  borderRadius: "6px",
                  border: "1px solid #ffeaa7",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong
                    style={{
                      fontSize: "14px",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Mark missed defects?
                  </strong>
                  <p
                    style={{
                      fontSize: "12px",
                      margin: "0",
                      color: "#666",
                    }}
                  >
                    Use the drawing tool to annotate areas the AI missed.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setShowManualReview(true)}
                  type="button"
                  style={{
                    whiteSpace: "nowrap",
                    alignSelf: "center",
                    padding: "8px 12px",
                  }}
                >
                  ✏️ Draw Defects
                </button>
              </div>
            </>
          ) : null}

          {error && <div className="notice notice--error">{error}</div>}

          <button
            className="primary-button"
            onClick={submitReview}
            disabled={submittingReview}
            type="button"
          >
            {submittingReview ? "Saving review..." : "Submit review"}
          </button>
        </div>
      </div>
    )
}

{
  activePanel === "camera" &&
    detectionResult &&
    showManualReview && (
      <div className="review-modal" role="dialog" aria-modal="true">
        <div className="review-modal__panel" style={{ maxHeight: "90vh", overflowY: "auto" }}>
          <div className="section-heading">
            <p className="eyebrow">Manual review</p>
            <h2>Annotate missed defects</h2>
          </div>

          <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
            Draw bounding boxes or polygons around areas where the AI missed defects.
            These annotations will be submitted for model retraining.
          </p>

          <ManualReviewDrawing
            imageUrl={capturedFrame}
            onSubmit={handleManualAnnotationsSubmit}
            onCancel={() => setShowManualReview(false)}
            isSubmitting={submittingAnnotations}
          />

          {error && <div className="notice notice--error">{error}</div>}
        </div>
      </div>
    )
}

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 5: Backend API endpoint example (Django)
// ═══════════════════════════════════════════════════════════════════════════

/*
  Add this to your core/models.py:
*/

from django.db import models
from django.contrib.auth.models import User

class ManualAnnotation(models.Model):
    """Stores manual annotations from operator reviews"""

    ANNOTATION_TYPES = [
        ("box", "Bounding Box"),
        ("polygon", "Polygon"),
    ]

    inference_log = models.ForeignKey(
        "InferenceLog", on_delete=models.CASCADE, related_name="manual_annotations"
    )
    annotation_type = models.CharField(max_length=20, choices=ANNOTATION_TYPES)
    coordinates = models.JSONField()  # List of [x, y] coordinate pairs
    color = models.CharField(max_length=7, default="#FF0000")  # Hex color
    stroke_width = models.IntegerField(default=2)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Manual Annotations"

    def __str__(self):
        return f"{self.annotation_type} on {self.inference_log_id}"


class RetrainingQueue(models.Model):
    """Queue for items flagged for model retraining"""

    REASONS = [
        ("manual_annotation", "Manual Annotation"),
        ("false_negative", "False Negative"),
        ("false_positive", "False Positive"),
        ("low_confidence", "Low Confidence"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    inference_log = models.ForeignKey(
        "InferenceLog", on_delete=models.CASCADE, related_name="retrain_requests"
    )
    reason = models.CharField(max_length=50, choices=REASONS)
    annotation_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reason} - {self.status}"


/*
  Then update core/views.py reviewInferenceLog endpoint:
*/

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from core.models import InferenceLog, ManualAnnotation, RetrainingQueue

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def review_inference_log(request, log_id):
    """
    Accept operator review with optional manual annotations.
    """
    try:
        log = InferenceLog.objects.get(id=log_id)
    except InferenceLog.DoesNotExist:
        return Response({"error": "Log not found"}, status=404)

    data = request.data
    manual_annotations = data.get("manual_annotations", [])

    # Store manual annotations if provided
    if manual_annotations:
        for ann in manual_annotations:
            ManualAnnotation.objects.create(
                inference_log=log,
                annotation_type=ann.get("type", "box"),
                coordinates=ann.get("coordinates", []),
                color=ann.get("color", "#FF0000"),
                stroke_width=ann.get("strokeWidth", 2),
                created_by=request.user,
            )

        # Queue for retraining
        RetrainingQueue.objects.create(
            inference_log=log,
            reason="manual_annotation",
            annotation_count=len(manual_annotations),
            created_by=request.user,
        )

    # Update inference log
    log.operator_override = True
    log.final_decision = data.get("final_decision")
    log.operator_comment = data.get("description")
    log.save()

    return Response(
        {
            "status": "success",
            "log_id": log.id,
            "annotations_stored": len(manual_annotations),
        }
    )


// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 6: Testing the implementation
// ═══════════════════════════════════════════════════════════════════════════

/*
  Test with this sequence:
  
  1. Capture an image with defects
  2. If AI doesn't detect it:
     - Click "Reject inference"
     - Click "Draw Defects"
     - Draw boxes/polygons over missed areas
     - Click "Flag for Retraining"
  
  3. Check backend:
     - ManualAnnotation objects created
     - RetrainingQueue entries created
     - InferenceLog marked as operator_override=True
*/

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 7: Complete minimal example component
// ═══════════════════════════════════════════════════════════════════════════

/*
  If you want a minimal standalone component to test:
*/

import { useState } from "react";
import ManualReviewDrawing from "./ManualReviewDrawing";

function TestManualReview() {
  const [result, setResult] = useState(null);

  const testImage =
    "https://via.placeholder.com/800x600?text=Test+Image";

  const handleSubmit = async (payload) => {
    console.log("Annotations submitted:", payload);
    setResult({
      success: true,
      annotations: payload.annotated_defects.length,
    });
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>Manual Review Drawing Test</h1>

      {!result ? (
        <ManualReviewDrawing
          imageUrl={testImage}
          onSubmit={handleSubmit}
          onCancel={() => console.log("Cancelled")}
          isSubmitting={false}
        />
      ) : (
        <div style={{ textAlign: "center" }}>
          <h2>✓ Success!</h2>
          <p>Submitted {result.annotations} annotations</p>
          <button
            onClick={() => setResult(null)}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Draw Again
          </button>
        </div>
      )}
    </div>
  );
}

export default TestManualReview;

// ═══════════════════════════════════════════════════════════════════════════
// SNIPPET 8: useCallback dependencies checklist
// ═══════════════════════════════════════════════════════════════════════════

/*
  Make sure your useCallback dependencies are correct:
  
  handleManualAnnotationsSubmit depends on:
  ✓ detectionResult - changes when new inference
  ✓ reviewDescription - operator input
  ✓ reviewRejectionReason - dropdown selection
  ✓ autoDetectEnabled - needed for motion status
  ✓ fetchLogsRef.current - for refresh after submit
  
  If you're missing dependencies, add them to the array!
*/

// ═══════════════════════════════════════════════════════════════════════════
// Done! You now have a fully functional manual review drawing system.
// ═══════════════════════════════════════════════════════════════════════════
