import { useCallback, useEffect, useRef, useState } from "react";
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
  const liveIntervalRef = useRef(null);

  const [preset, setPreset] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectionResult, setDetectionResult] = useState(null);
  const [capturedFrame, setCapturedFrame] = useState("");
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [rawOpenMap, setRawOpenMap] = useState({});
  const [motionStatus, setMotionStatus] = useState("Waiting for camera");
  const [countdownMs, setCountdownMs] = useState(null);
  const [reviewMode, setReviewMode] = useState("ACKNOWLEDGE");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewFinalDecision, setReviewFinalDecision] = useState("PASS");
  const [reviewRejectionReason, setReviewRejectionReason] =
    useState("MISSED_DEFECT");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [activePanel, setActivePanel] = useState("camera");

  const normalizeList = useCallback(
    (payload) => payload?.results || payload || [],
    [],
  );

  const fetchOptions = useCallback(async () => {
    const response = await getOperatorPreset();
    setPreset(response.data);
  }, []);

  const fetchLogs = useCallback(async () => {
    const response = await getDetectionLogs();
    setLogs(normalizeList(response.data));
  }, [normalizeList]);

  const stopSession = useCallback(() => {
    if (liveIntervalRef.current) {
      window.clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    setSessionStarted(false);
    setSessionId("");
  }, []);

  const toggleSession = useCallback(() => {
    if (sessionStarted) {
      stopSession();
      return;
    }

    const nextSessionId = `SESSION-${Date.now()}`;
    setSessionStarted(true);
    setSessionId(nextSessionId);
    liveIntervalRef.current = window.setInterval(() => {
      setSessionId(nextSessionId);
    }, 60000);
  }, [sessionStarted, stopSession]);

  useEffect(() => {
    return () => {
      if (liveIntervalRef.current) {
        window.clearInterval(liveIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const load = async () => {
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

    void load();
  }, [fetchLogs, fetchOptions]);

  const drawOverlay = useCallback((result) => {
    const canvas = overlayRef.current;
    const media = frameRef.current || webcamRef.current?.video;
    if (!canvas || !media) return;

    const displayWidth =
      media.clientWidth || media.videoWidth || media.naturalWidth || 1;
    const displayHeight =
      media.clientHeight || media.videoHeight || media.naturalHeight || 1;
    const sourceWidth = media.videoWidth || media.naturalWidth || displayWidth;
    const sourceHeight =
      media.videoHeight || media.naturalHeight || displayHeight;

    canvas.width = displayWidth;
    canvas.height = displayHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
      const stroke = detection.label === "SCRATCH" ? "#ef4444" : "#22c55e";
      const fill =
        detection.label === "SCRATCH"
          ? "rgba(239, 68, 68, 0.42)"
          : "rgba(34, 197, 94, 0.18)";
      const polygon = detection.mask?.polygon || [];

      if (polygon.length > 2) {
        ctx.beginPath();
        polygon.forEach(([x, y], index) => {
          const px = offsetX + x * scaleX;
          const py = offsetY + y * scaleY;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
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
        ctx.fillStyle = stroke;
        ctx.fillText(
          `${detection.label || detection.class_name || "DETECTION"} ${(Number(detection.confidence || 0) * 100).toFixed(1)}%`,
          left,
          Math.max(top - 8, 18),
        );
      }
    });
  }, []);

  const drawLogOverlay = useCallback((logId, detections = []) => {
    const image = document.getElementById(`log-image-${logId}`);
    const canvas = document.getElementById(`log-overlay-${logId}`);
    if (!image || !canvas) return;

    const containerWidth = image.clientWidth || 1;
    const containerHeight = image.clientHeight || 1;
    const sourceWidth = image.naturalWidth || containerWidth;
    const sourceHeight = image.naturalHeight || containerHeight;
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const sourceRatio = sourceWidth / sourceHeight;
    const displayRatio = containerWidth / containerHeight;
    const renderedWidth =
      displayRatio > sourceRatio
        ? containerHeight * sourceRatio
        : containerWidth;
    const renderedHeight =
      displayRatio > sourceRatio
        ? containerHeight
        : containerWidth / sourceRatio;
    const offsetX = (containerWidth - renderedWidth) / 2;
    const offsetY = (containerHeight - renderedHeight) / 2;
    const scaleX = renderedWidth / sourceWidth;
    const scaleY = renderedHeight / sourceHeight;

    (detections || []).forEach((detection) => {
      const [x1, y1, x2, y2] = detection.bbox || [];
      const stroke =
        detection.label === "SCRATCH" || detection.label === "DEFECT"
          ? "#ef4444"
          : "#22c55e";
      const fill =
        detection.label === "SCRATCH" || detection.label === "DEFECT"
          ? "rgba(239, 68, 68, 0.35)"
          : "rgba(34, 197, 94, 0.16)";
      const polygon = detection.mask?.polygon || [];

      if (polygon.length > 2) {
        ctx.beginPath();
        polygon.forEach(([x, y], index) => {
          const px = offsetX + x * scaleX;
          const py = offsetY + y * scaleY;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
        const left = offsetX + x1 * scaleX;
        const top = offsetY + y1 * scaleY;
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(left, top, width, height);
      }
    });
  }, []);

  useEffect(() => {
    if (!expandedLogId) return;
    const current = logs.find((entry) => entry.id === expandedLogId);
    if (!current) return;
    window.setTimeout(
      () =>
        drawLogOverlay(current.id, current.detection_results?.detections || []),
      0,
    );
  }, [expandedLogId, logs, drawLogOverlay]);

  useEffect(() => {
    drawOverlay(detectionResult);
  }, [drawOverlay, capturedFrame, detectionResult]);

  const autoAnnotateDetection = useCallback((result) => {
    if (!result || !result.detections || result.detections.length === 0) {
      return "No defects detected. Product appears intact.";
    }

    const scratches = result.detections.filter(
      (d) => d.label === "SCRATCH" || d.label === "DEFECT",
    );
    const intact = result.detections.filter(
      (d) => d.label === "INTACT" || d.label === "GOOD",
    );
    const summary = [];

    if (scratches.length > 0) {
      const avgConfidence = (
        scratches.reduce((sum, d) => sum + (d.confidence || 0), 0) /
        scratches.length
      ).toFixed(2);
      summary.push(
        `Found ${scratches.length} defect(s) with avg confidence ${avgConfidence}`,
      );
    }

    if (intact.length > 0) {
      summary.push(`${intact.length} intact area(s) detected`);
    }

    summary.push(
      `Latency: ${result.latency_ms || 0}ms | Cache: ${result.cache_hit ? "HIT" : "MISS"}`,
    );
    return summary.join(". ");
  }, []);

  const handleDetect = useCallback(
    async (trigger = "manual") => {
      const imageSrc = webcamRef.current?.getScreenshot();
      if (
        !imageSrc ||
        !preset?.product ||
        !preset?.model ||
        !preset?.config_hash
      ) {
        setError("No active inspection preset is assigned to this operator.");
        return;
      }

      setLoading(true);
      setError("");
      captureInFlightRef.current = true;

      try {
        setCapturedFrame(imageSrc);
        const imageBlob = await fetch(imageSrc).then((response) =>
          response.blob(),
        );
        const formData = new FormData();
        formData.append("image", imageBlob, `frame-${Date.now()}.png`);
        formData.append("component", preset.product);
        formData.append("product_id", preset.product);
        formData.append("model", preset.model);
        formData.append("config_id", preset.id);
        formData.append("config_version", preset.config_version || 1);
        formData.append("config_hash", preset.config_hash);
        formData.append("trigger", trigger);
        formData.append("session_id", sessionId || "");
        formData.append("session_active", sessionStarted ? "true" : "false");

        const detectResponse = await detectImage(formData);
        const result = detectResponse.data;
        setDetectionResult(result);
        setReviewMode("ACKNOWLEDGE");
        setReviewDescription(autoAnnotateDetection(result));
        setReviewFinalDecision(result.system_decision || "PASS");
        setReviewRejectionReason("MISSED_DEFECT");
        reviewPendingRef.current = true;
        setReviewPending(true);
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
    },
    [autoAnnotateDetection, fetchLogs, preset, sessionId, sessionStarted],
  );

  useEffect(() => {
    const sampleMotion = () => {
      const video = webcamRef.current?.video;
      if (
        !video ||
        video.readyState < 2 ||
        loading ||
        captureInFlightRef.current ||
        reviewPending ||
        !autoDetectEnabled ||
        !preset
      ) {
        return;
      }

      const width = 96;
      const height = 72;
      const canvas =
        motionCanvasRef.current ||
        (motionCanvasRef.current = document.createElement("canvas"));
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
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
          frame[index] * 0.299 +
          frame[index + 1] * 0.587 +
          frame[index + 2] * 0.114;
        const previousGray =
          previous[index] * 0.299 +
          previous[index + 1] * 0.587 +
          previous[index + 2] * 0.114;
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
      setMotionStatus(
        remaining > 0 ? "Stable frame countdown" : "Capturing stable frame",
      );

      if (remaining <= 0) {
        stableSinceRef.current = null;
        void handleDetect("auto_stable");
      }
    };

    const interval = window.setInterval(
      sampleMotion,
      MOTION_SAMPLE_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [autoDetectEnabled, handleDetect, loading, preset, reviewPending]);

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
      setReviewPending(false);
      previousFrameRef.current = null;
      stableSinceRef.current = null;
      setDetectionResult(null);
      setCapturedFrame("");
      setReviewDescription("");
      setCountdownMs(null);
      setMotionStatus(
        autoDetectEnabled ? "Waiting for stable frame" : "Auto-detect paused",
      );
      await fetchLogs();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Unable to submit review.",
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const countdownSeconds =
    countdownMs === null ? "--" : Math.ceil(countdownMs / 1000).toString();
  const displayedLogs = sessionFilter
    ? logs.filter((log) => log.session_id === sessionFilter)
    : logs;

  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header panel-header--operator">
          <div className="panel-header__intro">
            <h1>Live inspection workflow</h1>
          </div>
          <div className="panel-header__right">
            <div
              className="panel-switcher"
              role="tablist"
              aria-label="Operator pages"
            >
              <button
                className={
                  activePanel === "camera"
                    ? "choice-button choice-button--active"
                    : "choice-button"
                }
                onClick={() => setActivePanel("camera")}
                type="button"
              >
                Camera Feed
              </button>
              <button
                className={
                  activePanel === "logs"
                    ? "choice-button choice-button--active"
                    : "choice-button"
                }
                onClick={() => setActivePanel("logs")}
                type="button"
              >
                Detection Logs
              </button>
            </div>
            <button className="ghost-button" onClick={onLogout} type="button">
              Logout
            </button>
          </div>
        </header>

        {activePanel === "camera" ? (
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
                  autoPlay
                  playsInline
                  muted
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
                  <span>Product</span>
                  <strong>
                    {preset?.product_name ||
                      preset?.component_name ||
                      "Unassigned"}
                  </strong>
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

              {error ? (
                <div className="notice notice--error">{error}</div>
              ) : null}

              <div
                className="auto-detect-panel"
                style={{ display: "flex", gap: 12, alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>
                  <span>Auto-detect</span>
                  <strong>{motionStatus}</strong>
                </div>
                <div className="countdown-badge">{countdownSeconds}s</div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ fontSize: 12 }}>Session</div>
                  <strong style={{ fontSize: 12 }}>
                    {sessionStarted ? sessionId : "Stopped"}
                  </strong>
                </div>
                <button
                  className="ghost-button"
                  onClick={toggleSession}
                  type="button"
                >
                  {sessionStarted ? "Stop Session" : "Start Session"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    const next = !autoDetectEnabled;
                    setAutoDetectEnabled(next);
                    stableSinceRef.current = null;
                    setCountdownMs(null);
                    setMotionStatus(
                      next ? "Waiting for stable frame" : "Auto-detect paused",
                    );
                  }}
                  type="button"
                >
                  {autoDetectEnabled ? "Pause" : "Resume"}
                </button>
                <button
                  className="primary-button"
                  onClick={() => void handleDetect("manual")}
                  disabled={loading || reviewPending}
                  type="button"
                >
                  {loading ? "Capturing..." : "Capture & Detect"}
                </button>
              </div>
            </div>

            <div className="section-card section-card--result">
              <div className="section-heading">
                <p className="eyebrow">Detection result</p>
                <h2>Latest AI output</h2>
              </div>

              {detectionResult ? (
                <div className="result-card result-card--operator">
                  <div className="result-card__status">
                    {detectionResult.system_decision ||
                      detectionResult.error ||
                      "Ready"}
                  </div>
                  <dl>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{`${((detectionResult.confidence || 0) * 100).toFixed(1)}%`}</dd>
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
                    {(detectionResult.detections || []).map(
                      (detection, index) => (
                        <div
                          className={`detection-row detection-row--${(detection.label || "unknown").toLowerCase()}`}
                          key={`${detection.class_id}-${index}`}
                        >
                          <strong>
                            {detection.label || detection.class_name}
                          </strong>
                          <span>{`${((detection.confidence || 0) * 100).toFixed(1)}%`}</span>
                          <span>
                            {detection.mask?.polygon?.length ? "Mask" : "Box"}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  Capture a frame to view the result here.
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="section-card section-card--logs section-card--logs-page">
            <div className="section-heading">
              <p className="eyebrow">Detection logs</p>
              <h2>Recent inspections</h2>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <label style={{ fontSize: 12 }}>Filter by session</label>
              <select
                value={sessionFilter}
                onChange={(event) => setSessionFilter(event.target.value)}
              >
                <option value="">All sessions</option>
                {Array.from(
                  new Set(logs.map((log) => log.session_id).filter(Boolean)),
                ).map((session) => (
                  <option key={session} value={session}>
                    {session}
                  </option>
                ))}
              </select>
              <button
                className="ghost-button"
                onClick={() => {
                  void fetchLogs();
                }}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="log-list">
              {displayedLogs.length > 0 ? (
                displayedLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`log-item log-item--${(log.final_decision || log.system_decision || "").toLowerCase()}`}
                  >
                    <div
                      className="log-row"
                      onClick={() =>
                        setExpandedLogId(
                          expandedLogId === log.id ? null : log.id,
                        )
                      }
                    >
                      <div style={{ flex: 1 }}>
                        <strong>{log.id}</strong> &nbsp;{" "}
                        {log.component_name ||
                          log.product_name ||
                          log.component}
                        <div style={{ fontSize: 12, color: "#777" }}>
                          {new Date(
                            log.timestamp || log.created_at,
                          ).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div>
                          {log.final_decision ||
                            log.system_decision ||
                            log.status}
                        </div>
                        <div style={{ fontSize: 12 }}>
                          {log.confidence_score || log.confidence || 0
                            ? `${(Number(log.confidence_score || log.confidence || 0) * 100).toFixed(1)}%`
                            : ""}
                        </div>
                      </div>
                    </div>

                    {expandedLogId === log.id ? (
                      <div className="log-expanded">
                        <div style={{ display: "flex", gap: 12 }}>
                          <div
                            style={{
                              flex: "0 0 320px",
                              border: "1px solid #ddd",
                              padding: 8,
                              background: "#fff",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <strong>Inference Image</strong>
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  drawLogOverlay(
                                    log.id,
                                    log.detection_results?.detections || [],
                                  )
                                }
                                type="button"
                              >
                                Redraw
                              </button>
                            </div>
                            <div
                              style={{
                                position: "relative",
                                overflow: "hidden",
                                height: 260,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                id={`log-image-${log.id}`}
                                src={
                                  log.image_snapshot ||
                                  log.image_snapshot_url ||
                                  log.image_url
                                }
                                alt="snapshot"
                                onLoad={() =>
                                  drawLogOverlay(
                                    log.id,
                                    log.detection_results?.detections || [],
                                  )
                                }
                                style={{ maxWidth: "100%", maxHeight: "100%" }}
                              />
                              <canvas
                                id={`log-overlay-${log.id}`}
                                className="webcam-overlay"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <h4>Detections</h4>
                            {(log.detection_results?.detections || []).map(
                              (detection, index) => (
                                <div
                                  key={index}
                                  style={{
                                    padding: 6,
                                    borderBottom: "1px solid #eee",
                                  }}
                                >
                                  <strong>
                                    {detection.label || detection.class_name}
                                  </strong>
                                  <div>
                                    Confidence:{" "}
                                    {`${((detection.confidence || 0) * 100).toFixed(1)}%`}
                                  </div>
                                  <div>
                                    Box:{" "}
                                    {detection.bbox
                                      ? detection.bbox.join(", ")
                                      : "n/a"}
                                  </div>
                                  {detection.mask?.polygon ? (
                                    <div>
                                      Mask points:{" "}
                                      {detection.mask.polygon.length}
                                    </div>
                                  ) : null}
                                </div>
                              ),
                            )}
                            <h4>Details</h4>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 12,
                                marginBottom: 8,
                              }}
                            >
                              <div>
                                <div>
                                  <strong>System decision:</strong>{" "}
                                  {log.system_decision ||
                                    log.detection_results?.system_decision ||
                                    "-"}
                                </div>
                                <div>
                                  <strong>Final decision:</strong>{" "}
                                  {log.final_decision || "-"}
                                </div>
                                <div>
                                  <strong>Status:</strong> {log.status || "-"}
                                </div>
                                <div>
                                  <strong>Confidence:</strong>{" "}
                                  {log.confidence_score
                                    ? `${(Number(log.confidence_score) * 100).toFixed(1)}%`
                                    : log.detection_results?.confidence
                                      ? `${(Number(log.detection_results.confidence) * 100).toFixed(1)}%`
                                      : "-"}
                                </div>
                                <div>
                                  <strong>Latency:</strong>{" "}
                                  {log.latency_ms
                                    ? `${log.latency_ms} ms`
                                    : log.detection_results?.latency_ms
                                      ? `${log.detection_results.latency_ms} ms`
                                      : "-"}
                                </div>
                              </div>
                              <div>
                                <div>
                                  <strong>Cache hit:</strong>{" "}
                                  {String(
                                    log.detection_results?.cache_hit ??
                                      log.cache_hit ??
                                      false,
                                  )}
                                </div>
                                <div>
                                  <strong>Image hash:</strong>{" "}
                                  {log.detection_results?.image_hash ||
                                    log.image_hash ||
                                    "-"}
                                </div>
                                <div>
                                  <strong>Defect area %:</strong>{" "}
                                  {log.defect_area_percent !== undefined
                                    ? `${log.defect_area_percent}%`
                                    : log.detection_results?.defect_area_percent
                                      ? `${log.detection_results.defect_area_percent}%`
                                      : "-"}
                                </div>
                                <div>
                                  <strong>Segmentation polygons:</strong>{" "}
                                  {log.segmentation_data?.mask_polygons
                                    ?.length ??
                                    (log.detection_results?.mask_polygons
                                      ? log.detection_results.mask_polygons
                                          .length
                                      : 0)}
                                </div>
                              </div>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  setRawOpenMap((map) => ({
                                    ...map,
                                    [log.id]: !map[log.id],
                                  }))
                                }
                                type="button"
                              >
                                {rawOpenMap[log.id]
                                  ? "Hide raw JSON"
                                  : "Show raw JSON"}
                              </button>
                            </div>
                            {rawOpenMap[log.id] ? (
                              <pre
                                style={{
                                  whiteSpace: "pre-wrap",
                                  fontSize: 12,
                                  background: "#fbfbfb",
                                  padding: 8,
                                  borderRadius: 4,
                                }}
                              >
                                {JSON.stringify(
                                  log.detection_results || log,
                                  null,
                                  2,
                                )}
                              </pre>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="empty-state">No logs yet.</div>
              )}
            </div>
          </section>
        )}

        {activePanel === "camera" && detectionResult ? (
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
                      detectionResult.system_decision || "PASS",
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
      </div>
    </div>
  );
}

export default OperatorPanel;
