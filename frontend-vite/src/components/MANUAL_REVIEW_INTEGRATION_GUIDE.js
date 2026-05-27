/**
 * INTEGRATION GUIDE: ManualReviewDrawing in OperatorPanel
 * ========================================================
 *
 * This file shows how to integrate the ManualReviewDrawing component
 * into your existing OperatorPanel.jsx
 */

// ─────────────────────────────────────────────────────────────────────
// STEP 1: Add import at the top of OperatorPanel.jsx
// ─────────────────────────────────────────────────────────────────────

import ManualReviewDrawing from "./ManualReviewDrawing";

// ─────────────────────────────────────────────────────────────────────
// STEP 2: Add state variables for drawing feature
// ─────────────────────────────────────────────────────────────────────

// In the state section of OperatorPanel, add these new state variables:

const [showManualReview, setShowManualReview] = useState(false);
const [manualAnnotations, setManualAnnotations] = useState(null);
const [submittingAnnotations, setSubmittingAnnotations] = useState(false);

// ─────────────────────────────────────────────────────────────────────
// STEP 3: Add a handler for submitting manual annotations
// ─────────────────────────────────────────────────────────────────────

/**
 * Handler for when operator submits manual annotations.
 * This sends the drawing data to your backend for retraining.
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
      // Build the complete review data
      const reviewData = {
        action: "REJECT", // Manual review is always a rejection of AI
        description: reviewDescription.trim() || "Operator manually flagged missed defects",
        final_decision: "FAIL", // Manual annotations indicate a failure
        rejection_reason: "MISSED_DEFECT",
        manual_annotations: annotationsPayload.annotated_defects,
        annotation_count: annotationsPayload.annotation_count,
        operator_override: true, // Mark as manual override
      };

      // Submit the review with annotations
      await reviewInferenceLog(logId, reviewData);

      // Clear state
      setShowManualReview(false);
      setManualAnnotations(null);
      reviewPendingRef.current = false;
      setReviewPending(false);
      previousFrameRef.current = null;
      stableSinceRef.current = null;
      setDetectionResult(null);
      setCapturedFrame("");
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
    } finally {
      setSubmittingAnnotations(false);
    }
  },
  [detectionResult, reviewDescription, autoDetectEnabled, fetchLogsRef]
);

// ─────────────────────────────────────────────────────────────────────
// STEP 4: Update the review modal to include drawing feature
// ─────────────────────────────────────────────────────────────────────

/*
  Replace the existing review modal section with this enhanced version.
  This can be found around line 1770 in OperatorPanel.jsx
*/

{activePanel === "camera" && detectionResult && (
  <div className="review-modal" role="dialog" aria-modal="true">
    <div className="review-modal__panel">
      {!showManualReview ? (
        <>
          {/* Original review interface */}
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

              {/* NEW: Manual Review Button */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginTop: "16px",
                  padding: "12px",
                  backgroundColor: "#fff3cd",
                  borderRadius: "6px",
                  border: "1px solid #ffeaa7",
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "14px", display: "block" }}>
                    Mark missed defects?
                  </strong>
                  <p style={{ fontSize: "12px", margin: "4px 0 0 0", color: "#666" }}>
                    Use the drawing tool to annotate areas the AI missed for retraining.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setShowManualReview(true)}
                  type="button"
                  style={{ whiteSpace: "nowrap", alignSelf: "center" }}
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
        </>
      ) : (
        <>
          {/* Manual Review Drawing Interface */}
          <div className="section-heading">
            <p className="eyebrow">Manual review</p>
            <h2>Annotate missed defects</h2>
          </div>

          <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
            Draw bounding boxes or polygons around areas where the AI missed defects.
            These annotations will be used to improve the model.
          </p>

          <ManualReviewDrawing
            imageUrl={capturedFrame}
            onSubmit={handleManualAnnotationsSubmit}
            onCancel={() => setShowManualReview(false)}
            isSubmitting={submittingAnnotations}
          />

          {error && <div className="notice notice--error">{error}</div>}
        </>
      )}
    </div>
  </div>
)}

// ─────────────────────────────────────────────────────────────────────
// STEP 5: Optional - Add a separate standalone retraining workflow
// ─────────────────────────────────────────────────────────────────────

/*
  If you want to offer a standalone "Flag for Retraining" mode that
  doesn't require rejecting an inference, you can create an additional
  interface. Here's a minimal example:
*/

const handleStandaloneRetraining = useCallback(async () => {
  // This could be triggered from a menu or hotkey
  setShowManualReview(true);
}, []);

// ─────────────────────────────────────────────────────────────────────
// API BACKEND INTEGRATION EXAMPLE
// ─────────────────────────────────────────────────────────────────────

/*
  Your backend reviewInferenceLog() should now accept manual_annotations.
  Here's what a typical backend endpoint would look like (Django):

  @api_view(['POST'])
  @permission_classes([IsAuthenticated])
  def review_inference_log(request, log_id):
    '''
    Accept operator review with optional manual annotations.
    '''
    log = InferenceLog.objects.get(id=log_id)

    data = request.data
    action = data.get('action')  # ACKNOWLEDGE or REJECT
    manual_annotations = data.get('manual_annotations', [])

    if manual_annotations:
      # Store annotations for retraining dataset
      for ann in manual_annotations:
        ManualAnnotation.objects.create(
          inference_log=log,
          annotation_type=ann['type'],  # 'box' or 'polygon'
          coordinates=ann['coordinates'],
          color=ann['color'],
          stroke_width=ann['strokeWidth'],
          created_by=request.user
        )

      # Flag for retraining pipeline
      RetrainingQueue.objects.create(
        inference_log=log,
        reason='manual_annotation',
        annotation_count=data.get('annotation_count', 0),
        created_by=request.user
      )

    # Update inference log status
    log.operator_override = True
    log.final_decision = data.get('final_decision')
    log.operator_comment = data.get('description')
    log.save()

    return Response({'status': 'success'})
*/

export default OperatorPanel;
