import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  detectImage,
  getDetectionLogs,
  getOperatorPreset,
  reviewInferenceLog,
} from "../api/backend";

const STABLE_CAPTURE_DELAY_MS = 2000;
const MOTION_SAMPLE_INTERVAL_MS = 250;
const MOTION_THRESHOLD = 9;
const REJECTION_REASONS = [
  ["MISSED_DEFECT", "Missed a defect"],
  ["FALSE_POSITIVE", "False positive"],
  ["BLURRY_CAPTURE", "Blurry capture"],
  ["BAD_ANNOTATION", "Bad annotation"],
  ["WRONG_CLASS", "Wrong class"],
  ["OTHER", "Other"],
];

function OperatorPanel({ onLogout }) {
  const webcamRef = useRef(null);
  const frameRef = useRef(null);
  const overlayRef = useRef(null);
  const motionCanvasRef = useRef(null);
  const previousFrameRef = useRef(null);
  const stableSinceRef = useRef(null);
  const captureInFlightRef = useRef(false);
  const reviewPendingRef = useRef(false);
  const [preset, setPreset] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectionResult, setDetectionResult] = useState(null);
  const [capturedFrame, setCapturedFrame] = useState("");
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [motionStatus, setMotionStatus] = useState("Waiting for camera");
  const [countdownMs, setCountdownMs] = useState(null);
  const [reviewMode, setReviewMode] = useState("ACKNOWLEDGE");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewFinalDecision, setReviewFinalDecision] = useState("PASS");
  const [reviewRejectionReason, setReviewRejectionReason] = useState("MISSED_DEFECT");
  const [submittingReview, setSubmittingReview] = useState(false);

  const normalizeList = (payload) => payload?.results || payload || [];

  const fetchOptions = async () => {
    const presetResponse = await getOperatorPreset();
    setPreset(presetResponse.data);
  };

  const fetchLogs = async () => {
    const response = await getDetectionLogs();
    setLogs(normalizeList(response.data));
  };

  useEffect(() => {
    const loadPanelData = async () => {
      try {
        await fetchOptions();
        await fetchLogs();
      } catch (requestError) {
        setError(
          requestError.response?.data?.error ||
            requestError.response?.data?.detail ||
            "No active inspection preset is assigned to this operator.",
        );
      }
    };

    void loadPanelData();
  }, []);

  const drawOverlay = (result) => {
    const canvas = overlayRef.current;
    const media = frameRef.current || webcamRef.current?.video;

    if (!canvas || !media) {
      return;
    }

    const displayWidth = media.clientWidth || media.videoWidth || media.naturalWidth || 1;
    const displayHeight = media.clientHeight || media.videoHeight || media.naturalHeight || 1;
    const sourceWidth = media.videoWidth || media.naturalWidth || displayWidth;
    const sourceHeight = media.videoHeight || media.naturalHeight || displayHeight;

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const sourceRatio = sourceWidth / sourceHeight;
    const displayRatio = displayWidth / displayHeight;
    const renderedWidth =
      displayRatio > sourceRatio ? displayHeight * sourceRatio : displayWidth;
    const renderedHeight =
      displayRatio > sourceRatio ? displayHeight : displayWidth / sourceRatio;
    const offsetX = (displayWidth - renderedWidth) / 2;
    const offsetY = (displayHeight - renderedHeight) / 2;
    const scaleX = renderedWidth / sourceWidth;
    const scaleY = renderedHeight / sourceHeight;

    (result?.detections || []).forEach((detection) => {
      const [x1, y1, x2, y2] = detection.bbox || [];
      const isScratch = detection.label === "SCRATCH";
      const stroke = isScratch ? "#ef4444" : "#22c55e";
      const fill = isScratch
        ? "rgba(239, 68, 68, 0.42)"
        : "rgba(34, 197, 94, 0.18)";

      const polygon = detection.mask?.polygon || [];
      if (polygon.length > 2) {
        ctx.beginPath();
        polygon.forEach(([x, y], index) => {
          const px = offsetX + x * scaleX;
          const py = offsetY + y * scaleY;
          if (index === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
        const left = offsetX + x1 * scaleX;
        const top = offsetY + y1 * scaleY;
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;

        ctx.lineWidth = 3;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(left, top, width, height);
        ctx.font = "700 16px Aptos, sans-serif";
        const label = `${detection.label || detection.class_name || "DETECTION"} ${(Number(detection.confidence || 0) * 100).toFixed(1)}%`;
        const labelTop = Math.max(top - 8, 18);
        ctx.fillStyle = stroke;
        ctx.fillText(label, left, labelTop);
      }
    });
  };

  useEffect(() => {
    drawOverlay(detectionResult);
  }, [detectionResult, capturedFrame]);

  const handleDetect = async (trigger = "manual") => {
    const imageSrc = webcamRef.current?.getScreenshot();

    if (!imageSrc || !preset?.component || !preset?.model) {
      setError("No active inspection preset is assigned to this operator.");
      return;
    }

    setLoading(true);
    setError("");
    captureInFlightRef.current = true;

    try {
      setCapturedFrame(imageSrc);
      const imageBlob = await fetch(imageSrc).then((response) => response.blob());
      const formData = new FormData();
      formData.append("image", imageBlob, `frame-${Date.now()}.png`);
      formData.append("component", preset.component);
      formData.append("model", preset.model);
      formData.append("trigger", trigger);

      const detectResponse = await detectImage(formData);
      const result = detectResponse.data;

      setDetectionResult(result);
      setReviewMode("ACKNOWLEDGE");
      setReviewDescription("");
      setReviewFinalDecision(result.system_decision || "PASS");
      setReviewRejectionReason("MISSED_DEFECT");
      reviewPendingRef.current = true;
      setMotionStatus("Review required");
      setCountdownMs(null);

      await fetchLogs();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Detection request failed.",
      );
    } finally {
      setLoading(false);
      captureInFlightRef.current = false;
    }
  };

  const sampleMotion = () => {
    const video = webcamRef.current?.video;

    if (
      !video ||
      video.readyState < 2 ||
      loading ||
      captureInFlightRef.current ||
      reviewPendingRef.current ||
      !autoDetectEnabled ||
      !preset
    ) {
      return;
    }

    const width = 96;
    const height = 72;
    const canvas =
      motionCanvasRef.current || (motionCanvasRef.current = document.createElement("canvas"));
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height).data;
    const previous = previousFrameRef.current;
    previousFrameRef.current = new Uint8ClampedArray(frame);

    if (!previous) {
      stableSinceRef.current = null;
      setMotionStatus("Calibrating camera");
      return;
    }

    let diff = 0;
    const pixels = width * height;
    for (let index = 0; index < frame.length; index += 4) {
      const currentGray =
        frame[index] * 0.299 + frame[index + 1] * 0.587 + frame[index + 2] * 0.114;
      const previousGray =
        previous[index] * 0.299 + previous[index + 1] * 0.587 + previous[index + 2] * 0.114;
      diff += Math.abs(currentGray - previousGray);
    }

    const motionScore = diff / pixels;
    const now = performance.now();

    if (motionScore > MOTION_THRESHOLD) {
      stableSinceRef.current = null;
      setCountdownMs(null);
      setMotionStatus("Motion detected");
      return;
    }

    if (!stableSinceRef.current) {
      stableSinceRef.current = now;
    }

    const elapsed = now - stableSinceRef.current;
    const remaining = Math.max(0, STABLE_CAPTURE_DELAY_MS - elapsed);
    setCountdownMs(remaining);
    setMotionStatus(remaining > 0 ? "Stable frame countdown" : "Capturing stable frame");

    if (remaining <= 0) {
      stableSinceRef.current = null;
      void handleDetect("auto_stable");
    }
  };

  useEffect(() => {
    const interval = window.setInterval(sampleMotion, MOTION_SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  });

  const submitReview = async () => {
    const logId = detectionResult?.log_id || detectionResult?.id;

    if (!logId) {
      setError("No inference log is available for review.");
      return;
    }
    if (!reviewDescription.trim()) {
      setError("Review description is required.");
      return;
    }
    if (reviewMode === "REJECT" && !reviewRejectionReason) {
      setError("Rejection reason is required.");
      return;
    }

    setSubmittingReview(true);
    setError("");

    try {
      await reviewInferenceLog(logId, {
        action: reviewMode,
        description: reviewDescription.trim(),
        final_decision: reviewFinalDecision,
        rejection_reason: reviewMode === "REJECT" ? reviewRejectionReason : "",
      });

      reviewPendingRef.current = false;
      previousFrameRef.current = null;
      stableSinceRef.current = null;
      setDetectionResult(null);
      setCapturedFrame("");
      setReviewDescription("");
      setCountdownMs(null);
      setMotionStatus(autoDetectEnabled ? "Waiting for stable frame" : "Auto-detect paused");
      await fetchLogs();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const countdownSeconds =
    countdownMs === null ? "--" : Math.ceil(countdownMs / 1000).toString();

  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Operator console</p>
            <h1>Live inspection workflow</h1>
            <p>
              Capture a frame, run detection, and save the result against the
              selected configuration.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout} type="button">
            Logout
          </button>
        </header>

        <section className="content-grid content-grid--operator">
          <div className="section-card section-card--camera">
            <div className="section-heading">
              <p className="eyebrow">Camera feed</p>
              <h2>Prepare the frame</h2>
            </div>

            <div className="webcam-frame-wrap">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/png"
                audio={false}
                className={
                  capturedFrame
                    ? "webcam-frame webcam-frame--capture-source"
                    : "webcam-frame"
                }
              />
              {capturedFrame ? (
                <img
                  ref={frameRef}
                  src={capturedFrame}
                  className="webcam-frame"
                  alt=""
                  onLoad={() => drawOverlay(detectionResult)}
                />
              ) : null}
              <canvas
                ref={overlayRef}
                className="webcam-overlay"
                aria-hidden="true"
              />
            </div>

            <div className="preset-summary">
              <div>
                <span>Component</span>
                <strong>{preset?.component_name || "Unassigned"}</strong>
              </div>
              <div>
                <span>Model</span>
                <strong>{preset?.model_name || "Unassigned"}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>
                  {preset?.confidence_threshold !== undefined
                    ? Number(preset.confidence_threshold).toFixed(2)
                    : "--"}
                </strong>
              </div>
            </div>

            {error ? <div className="notice notice--error">{error}</div> : null}

            <div className="auto-detect-panel">
              <div>
                <span>Auto-detect</span>
                <strong>{motionStatus}</strong>
              </div>
              <div className="countdown-badge">{countdownSeconds}s</div>
              <button
                className="ghost-button"
                onClick={() => {
                  const next = !autoDetectEnabled;
                  setAutoDetectEnabled(next);
                  stableSinceRef.current = null;
                  setCountdownMs(null);
                  setMotionStatus(next ? "Waiting for stable frame" : "Auto-detect paused");
                }}
                type="button"
              >
                {autoDetectEnabled ? "Pause" : "Resume"}
              </button>
            </div>

            <div className="inline-result">
              <div className="section-heading">
                <p className="eyebrow">Detection result</p>
                <h2>Latest AI output</h2>
              </div>

              {detectionResult ? (
                <div className="result-card">
                  <div className="result-card__status">
                    {detectionResult.system_decision ||
                      detectionResult.error ||
                      "Ready"}
                  </div>
                  <dl>
                    <div>
                      <dt>Confidence</dt>
                      <dd>
                        {`${((detectionResult.confidence || 0) * 100).toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>{`${detectionResult.latency_ms || 0} ms`}</dd>
                    </div>
                    <div>
                      <dt>Detections</dt>
                      <dd>{detectionResult.num_detections || 0}</dd>
                    </div>
                    <div>
                      <dt>Cache</dt>
                      <dd>{detectionResult.cache_hit ? "Hit" : "Miss"}</dd>
                    </div>
                  </dl>
                  <div className="detection-list">
                    {(detectionResult.detections || []).map((detection, index) => (
                      <div
                        className={`detection-row detection-row--${(detection.label || "unknown").toLowerCase()}`}
                        key={`${detection.class_id}-${index}`}
                      >
                        <strong>{detection.label || detection.class_name}</strong>
                        <span>{`${((detection.confidence || 0) * 100).toFixed(1)}%`}</span>
                        <span>{detection.mask?.polygon?.length ? "Mask" : "Box"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  Capture a frame to view the result here.
                </div>
              )}
            </div>
          </div>
        </section>

        {detectionResult ? (
          <div className="review-modal" role="dialog" aria-modal="true">
            <div className="review-modal__panel">
              <div className="section-heading">
                <p className="eyebrow">Operator review</p>
                <h2>Decision required</h2>
              </div>

              <div className="review-choice">
                <button
                  className={reviewMode === "ACKNOWLEDGE" ? "choice-button choice-button--active" : "choice-button"}
                  onClick={() => {
                    setReviewMode("ACKNOWLEDGE");
                    setReviewFinalDecision(detectionResult.system_decision || "PASS");
                  }}
                  type="button"
                >
                  Acknowledge inference
                </button>
                <button
                  className={reviewMode === "REJECT" ? "choice-button choice-button--active" : "choice-button"}
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
                      onChange={(event) => setReviewRejectionReason(event.target.value)}
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
                      onChange={(event) => setReviewFinalDecision(event.target.value)}
                    >
                      <option value="PASS">PASS</option>
                      <option value="FAIL">FAIL</option>
                    </select>
                  </label>
                </>
              ) : null}

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
        ) : null}

        <section className="section-card section-card--wide">
          <div className="section-heading">
            <p className="eyebrow">Detection logs</p>
            <h2>Recent inspections</h2>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Component</th>
                  <th>Model</th>
                  <th>Result</th>
                  <th>Status</th>
                  <th>Review</th>
                  <th>Reason</th>
                  <th>Detected at</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>{log.component_name || log.component || "-"}</td>
                    <td>{log.model_name || log.model_used || "-"}</td>
                    <td>{log.final_decision || log.system_decision}</td>
                    <td>{log.status}</td>
                    <td>{log.operator_review_description || "-"}</td>
                    <td>{log.rejection_reason || "-"}</td>
                    <td>
                      {new Date(
                        log.timestamp || log.created_at,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logs.length === 0 ? (
              <div className="empty-state">No logs yet.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export default OperatorPanel;
