import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Webcam from "react-webcam";
import {
  buildInferenceStreamUrl,
  detectImage,
  getDetectionLogs,
  getOperatorPreset,
  reviewInferenceLog,
} from '../api/backend';
import { buildCameraConstraints, ensureCameraPermission } from '../utils/camera';

/* ── Constants ───────────────────────────────────────────────── */
const STABLE_CAPTURE_DELAY_MS = 2000;
const MOTION_SAMPLE_INTERVAL_MS = 250;
const MOTION_THRESHOLD = 9; // For auto-capture (stable frame detection)
const LIVE_INFERENCE_INTERVAL_MS = 1500;
const LIVE_MOTION_THRESHOLD = 20; // Higher threshold for live feed (less noise)

const REJECTION_REASONS = [
  ["MISSED_DEFECT", "Missed a defect"],
  ["FALSE_POSITIVE", "False positive"],
  ["BLURRY_CAPTURE", "Blurry capture"],
  ["BAD_ANNOTATION", "Bad annotation"],
  ["WRONG_CLASS", "Wrong class"],
  ["OTHER", "Other"],
];

/* ── Component ───────────────────────────────────────────────── */
function OperatorPanel({ onLogout, username = "Operator", cameraOnly = false }) {
  const cameraConstraints = buildCameraConstraints();
  /* refs */
  const webcamRef = useRef(null);
  const frameRef = useRef(null);
  const overlayRef = useRef(null);
  const motionCanvasRef = useRef(null);
  const previousFrameRef = useRef(null);
  const lastCapturedFrameRef = useRef(null);
  const stableSinceRef = useRef(null);
  const captureInFlightRef = useRef(false);
  const reviewPendingRef = useRef(false);
  const liveIntervalRef = useRef(null);
  const livePreviousFrameRef = useRef(null);
  const liveSocketRef = useRef(null);
  const liveRequestInFlightRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const streamEffectActiveRef = useRef(false);
  const sessionFilterRef = useRef("");
  const sessionStartedRef = useRef(false);
  const logsFetchInFlightRef = useRef(false);
  const logsFetchQueuedRef = useRef(false);
  const liveMediaStreamRef = useRef(null);
  const fetchLogsRef = useRef(async () => {});
  const waitForMotionAfterEmptyRef = useRef(false);

  /* state */
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
  const [zoomedImage, setZoomedImage] = useState(null);
  const [logsLimit, setLogsLimit] = useState(20);
  const [streamStatus, setStreamStatus] = useState("disconnected");
  const [liveAnnotatedOverlaySrc, setLiveAnnotatedOverlaySrc] = useState("");

  useEffect(() => {
    if (cameraOnly) {
      setActivePanel("camera");
    }
  }, [cameraOnly]);

  useEffect(() => {
    sessionFilterRef.current = sessionFilter;
    sessionStartedRef.current = sessionStarted;
  }, [sessionFilter, sessionStarted]);

  /* ── Helpers ─────────────────────────────────────────────────── */
  const normalizeList = useCallback(
    (payload) => payload?.results || payload || [],
    [],
  );

  const fetchOptions = useCallback(async () => {
    const response = await getOperatorPreset();
    setPreset(response.data);
  }, []);

  useEffect(() => {
    fetchLogsRef.current = async () => {
      if (logsFetchInFlightRef.current) {
        logsFetchQueuedRef.current = true;
        return;
      }

      logsFetchInFlightRef.current = true;

      const params = {};
      if (sessionFilterRef.current)
        params.session_id = sessionFilterRef.current;

      const runFetch = async () => {
        const response = await getDetectionLogs(params);
        const list = normalizeList(response.data);
        setLogs(list);
        if (
          !sessionFilterRef.current &&
          list.length > 0 &&
          !sessionStartedRef.current
        ) {
          const recentSession = list.find((l) => l.session_id);
          if (recentSession) setSessionId(recentSession.session_id || "");
        }
      };

      try {
        await runFetch();
      } catch (err) {
        const isTransientNetworkError = !err?.response && !!err?.message;
        if (isTransientNetworkError) {
          await new Promise((resolve) => window.setTimeout(resolve, 200));
          await runFetch();
        } else {
          throw err;
        }
      } finally {
        logsFetchInFlightRef.current = false;
        if (logsFetchQueuedRef.current) {
          logsFetchQueuedRef.current = false;
          void fetchLogsRef.current();
        }
      }
    };
  }, [normalizeList]);

  /* ── Session ─────────────────────────────────────────────────── */
  const stopSession = useCallback(() => {
    if (liveIntervalRef.current) {
      window.clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    waitForMotionAfterEmptyRef.current = false;
    setLiveAnnotatedOverlaySrc('');
    try {
      const stream = liveMediaStreamRef.current;
      if (stream?.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (error) {
      console.warn('Error stopping media stream', error);
    }
    liveMediaStreamRef.current = null;
    try {
      if (webcamRef.current?.video) webcamRef.current.video.srcObject = null;
    } catch {
      /* ignore */
    }
    setSessionStarted(false);
    setSessionId("");
  }, []);

  const toggleSession = useCallback(() => {
    if (sessionStarted) {
      stopSession();
      return;
    }
    const sid = `session_${Date.now()}`;
    setSessionId(sid);
    setSessionStarted(true);
  }, [sessionStarted, stopSession]);

  useEffect(
    () => () => {
      if (liveIntervalRef.current)
        window.clearInterval(liveIntervalRef.current);
    },
    [],
  );

  /* ── Boot ────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      try {
        await fetchOptions();
        await fetchLogsRef.current();
      } catch (err) {
        setError(
          err.response?.data?.error ||
            err.response?.data?.detail ||
            "No active inspection preset is assigned to this operator.",
        );
      }
    };
    void load();
  }, [fetchOptions]);

  // Refresh logs when session filter changes
  useEffect(() => {
    void (async () => {
      await fetchLogsRef.current();
    })();
  }, [sessionFilter, sessionStarted]);

  /* ── Canvas overlay ─────────────────────────────────────────── */
  const drawOverlay = useCallback(
    (result) => {
      const canvas = overlayRef.current;
      // For live feed: use video, for captured frame: use image
      const media = capturedFrame ? frameRef.current : webcamRef.current?.video;
      if (!canvas || !media) return;

      // Get display dimensions from canvas container
      const displayWidth = canvas.offsetWidth || media.clientWidth || 640;
      const displayHeight = canvas.offsetHeight || media.clientHeight || 480;

      // Get source dimensions - handle both video and img elements
      let sourceWidth, sourceHeight;
      if (media.tagName === "VIDEO") {
        sourceWidth = media.videoWidth || media.naturalWidth || displayWidth;
        sourceHeight =
          media.videoHeight || media.naturalHeight || displayHeight;
      } else {
        sourceWidth = media.naturalWidth || media.width || displayWidth;
        sourceHeight = media.naturalHeight || media.height || displayHeight;
      }

      // Only proceed if we have valid dimensions
      if (!sourceWidth || !sourceHeight) {
        return;
      }

      // Set canvas resolution to match display size
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas before drawing
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

      const drawDetections = (detections) => {
        if (!detections || detections.length === 0) {
          return;
        }

        (detections || []).forEach((detection) => {
          const [x1, y1, x2, y2] = detection.bbox || [];
          const label = detection.label || detection.class_name || "DETECTION";
          const confidence = Number(detection.confidence || 0);

          // Color scheme: Red for SCRATCH, Green for INTACT
          const isScratch = label === "SCRATCH";
          const boxColor = isScratch ? "#ef4444" : "#22c55e";
          // Draw filled polygon mask if available (with alpha blending)
          const polygon = detection.mask?.polygon || [];
          if (polygon.length > 2) {
            // Semi-transparent fill matching OpenCV approach
            ctx.fillStyle = isScratch
              ? "rgba(239, 68, 68, 0.35)" // Red with 35% alpha
              : "rgba(34, 197, 94, 0.20)"; // Green with 20% alpha

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
            ctx.fill();

            // Draw contour around mask
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Draw bounding box
          if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
            const left = offsetX + x1 * scaleX;
            const top = offsetY + y1 * scaleY;
            const width = (x2 - x1) * scaleX;
            const height = (y2 - y1) * scaleY;

            // Draw rectangle (2px stroke matching OpenCV)
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(left, top, width, height);

            // Draw label with background (matching OpenCV style)
            const text = `${label} ${(confidence * 100).toFixed(1)}%`;
            ctx.font = "600 14px Arial, sans-serif";
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width + 8;
            const textHeight = 18;
            const labelX = left;
            const labelY = Math.max(top - textHeight - 4, 16);

            // Label background
            ctx.fillStyle = boxColor;
            ctx.fillRect(labelX, labelY, textWidth, textHeight);

            // Label text
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, labelX + 4, labelY + 14);
          }
        });
      };

      drawDetections(result?.detections || []);
    },
    [capturedFrame],
  );

  const drawLogOverlay = useCallback((logId, detections = []) => {
    const image = document.getElementById(`log-image-${logId}`);
    const canvas = document.getElementById(`log-overlay-${logId}`);
    if (!image || !canvas) return;

    const cW = image.clientWidth || 1;
    const cH = image.clientHeight || 1;
    const sW = image.naturalWidth || cW;
    const sH = image.naturalHeight || cH;
    canvas.width = cW;
    canvas.height = cH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cW, cH);

    const sRatio = sW / sH;
    const dRatio = cW / cH;
    const rW = dRatio > sRatio ? cH * sRatio : cW;
    const rH = dRatio > sRatio ? cH : cW / sRatio;
    const ox = (cW - rW) / 2;
    const oy = (cH - rH) / 2;
    const sx = rW / sW;
    const sy = rH / sH;

    (detections || []).forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox || [];
      const isDefect = det.label === "SCRATCH" || det.label === "DEFECT";
      const stroke = isDefect ? "#ef4444" : "#22c55e";
      const fill = isDefect ? "rgba(239,68,68,.35)" : "rgba(34,197,94,.16)";
      const polygon = det.mask?.polygon || [];

      if (polygon.length > 2) {
        ctx.beginPath();
        polygon.forEach(([x, y], i) => {
          const px = ox + x * sx;
          const py = oy + y * sy;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(
          ox + x1 * sx,
          oy + y1 * sy,
          (x2 - x1) * sx,
          (y2 - y1) * sy,
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!expandedLogId) return;
    const entry = logs.find((l) => l.id === expandedLogId);
    if (!entry) return;
    window.setTimeout(
      () => drawLogOverlay(entry.id, entry.detection_results?.detections || []),
      0,
    );
  }, [expandedLogId, logs, drawLogOverlay]);

  useEffect(() => {
    drawOverlay(detectionResult);
  }, [drawOverlay, capturedFrame, detectionResult]);

  // Display server-rendered annotated image when available
  useEffect(() => {
    if (detectionResult?.annotated_image_b64) {
      const img = new Image();
      img.onload = () => {
        const canvas = overlayRef.current;
        if (!canvas) return;

        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          console.debug("[ServerAnnotation] Rendered annotated image:", {
            width: img.width,
            height: img.height,
          });
        }
      };
      img.onerror = (err) => {
        console.error("[ServerAnnotation] Image load error:", err);
      };
      img.src = `data:image/png;base64,${detectionResult.annotated_image_b64}`;
      console.debug("[ServerAnnotation] Loading base64 image:", {
        size: detectionResult.annotated_image_b64?.length || 0,
      });
    }
  }, [detectionResult?.annotated_image_b64]);

  // Live feed annotation loop - draw detections on live webcam
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    let animationFrameId;

    const drawFrame = () => {
      const video = webcamRef.current?.video;

      // Only draw on live feed (not when captured frame is showing)
      if (!capturedFrame && video && video.readyState === 4) {
        // Keep server-side rendered overlay on canvas when available.
        if (detectionResult?.annotated_image_b64) {
          animationFrameId = requestAnimationFrame(drawFrame);
          return;
        }

        // Draw detections if available
        if (
          detectionResult &&
          detectionResult.detections &&
          detectionResult.detections.length > 0
        ) {
          drawOverlay(detectionResult);
        } else {
          // Clear canvas if no detections
          const displayWidth = canvas.offsetWidth || video.clientWidth || 640;
          const displayHeight =
            canvas.offsetHeight || video.clientHeight || 480;
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, displayWidth, displayHeight);
        }
      } else if (capturedFrame) {
        // Clear canvas when showing captured frame (annotations handled separately)
        const ctx = canvas.getContext("2d");
        if (ctx && canvas.width > 0)
          ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [detectionResult, capturedFrame, drawOverlay]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && zoomedImage) {
        setZoomedImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomedImage]);

  useEffect(() => {
    streamEffectActiveRef.current = true;

    const closeStream = () => {
      const socket = liveSocketRef.current;
      if (socket) {
        socket.close();
        liveSocketRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      liveRequestInFlightRef.current = false;
      reconnectAttemptsRef.current = 0;
      setStreamStatus("disconnected");
      try {
        const stream = liveMediaStreamRef.current;
        if (stream?.getTracks) {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (error) {
        console.warn('Error stopping media stream', error);
      }
      liveMediaStreamRef.current = null;
      try {
        const videoEl = webcamRef.current?.video;
        if (videoEl) videoEl.srcObject = null;
      } catch {
        /* ignore */
      }
      setStreamStatus('disconnected');
    };

    if (!sessionStarted || !preset) {
      closeStream();
      return undefined;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      window.setTimeout(() => {
        setError("Missing access token for live stream. Please login again.");
        setStreamStatus("auth-error");
      }, 0);
      return undefined;
    }

    // Request camera permission and attach MediaStream to react-webcam
    (async () => {
      try {
        const res = await ensureCameraPermission({
          constraints: cameraConstraints,
        });
        if (res.granted && res.stream) {
          liveMediaStreamRef.current = res.stream;
          const videoEl = webcamRef.current?.video;
          if (videoEl) {
            try {
              videoEl.srcObject = res.stream;
            } catch (e) {
              console.warn('Could not attach MediaStream to video element', e);
            }
          }
        } else if (!res.granted) {
          window.setTimeout(() => {
            setError(res.error?.message || 'Camera permission denied');
          }, 0);
        }
      } catch (e) {
        console.warn('ensureCameraPermission error', e);
      }
    })();

    const connectStream = () => {
      if (!streamEffectActiveRef.current) return;

      setStreamStatus("connecting");
      const socket = new WebSocket(buildInferenceStreamUrl(token), [
        `jwt.${token}`,
      ]);
      liveSocketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStreamStatus("connected");
        setError("");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data || "{}");
          if (message.type === "inference_result" && message.data) {
            setDetectionResult(message.data);
            if (message.data.annotated_image_b64) {
              setLiveAnnotatedOverlaySrc(
                `data:image/png;base64,${message.data.annotated_image_b64}`,
              );
            } else {
              setLiveAnnotatedOverlaySrc("");
            }
            liveRequestInFlightRef.current = false;
            return;
          }
          if (message.type === "inference_error") {
            liveRequestInFlightRef.current = false;
            console.warn("[InferenceStream] stream error:", message.error);
            return;
          }
          if (message.type === "inference_throttled") {
            liveRequestInFlightRef.current = false;
            return;
          }
        } catch (parseError) {
          liveRequestInFlightRef.current = false;
          console.warn("[InferenceStream] message parse error:", parseError);
        }
      };

      socket.onerror = () => {
        setStreamStatus("error");
        liveRequestInFlightRef.current = false;
      };

      socket.onclose = () => {
        liveRequestInFlightRef.current = false;
        if (liveSocketRef.current === socket) {
          liveSocketRef.current = null;
        }

        if (!streamEffectActiveRef.current || !sessionStarted) {
          setStreamStatus("disconnected");
          return;
        }

        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
        setStreamStatus("reconnecting");
        reconnectTimerRef.current = window.setTimeout(() => {
          connectStream();
        }, delayMs);
      };
    };

    connectStream();

    return () => {
      streamEffectActiveRef.current = false;
      closeStream();
    };
  }, [preset, sessionStarted]);

  /* ── Auto-annotate ───────────────────────────────────────────── */
  const autoAnnotateDetection = useCallback((result) => {
    if (!result || !result.detections || result.detections.length === 0) {
      return "No defects detected. Product appears intact.";
    }

    const detections = result.detections || [];
    const scratches = detections.filter(
      (d) => d.label === "SCRATCH" || d.label === "DEFECT",
    );
    const intact = detections.filter(
      (d) => d.label === "INTACT" || d.label === "GOOD",
    );

    const detectionSummary = [];

    if (scratches.length > 0) {
      const avgConfidence = (
        scratches.reduce((sum, d) => sum + (d.confidence || 0), 0) /
        scratches.length
      ).toFixed(2);
      detectionSummary.push(
        `Found ${scratches.length} defect(s) with avg confidence ${avgConfidence}`,
      );
    }

    if (intact.length > 0) {
      detectionSummary.push(`${intact.length} intact area(s) detected`);
    }

    detectionSummary.push(
      `Latency: ${result.latency_ms || 0}ms | Cache: ${result.cache_hit ? "HIT" : "MISS"}`,
    );

    return detectionSummary.join(". ");
  }, []);

  /* ── Detect ──────────────────────────────────────────────────── */
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
        const detections = result?.detections || [];
        const isManualCapture = trigger === "manual";

        if (!isManualCapture && detections.length === 0) {
          setDetectionResult(null);
          setCapturedFrame("");
          setCountdownMs(null);
          setMotionStatus(
            "No change in image. Waiting for motion or manual capture.",
          );
          waitForMotionAfterEmptyRef.current = true;
          return;
        }

        waitForMotionAfterEmptyRef.current = false;
        setCapturedFrame(imageSrc);
        // Store captured frame for future change verification
        lastCapturedFrameRef.current = imageSrc;

        setDetectionResult(result);
        setReviewMode("ACKNOWLEDGE");
        const autoDescription = autoAnnotateDetection(result);
        setReviewDescription(autoDescription);
        setReviewFinalDecision(result.system_decision || "PASS");
        setReviewRejectionReason("MISSED_DEFECT");
        reviewPendingRef.current = true;
        setReviewPending(true);
        setMotionStatus("Review required");
        setCountdownMs(null);

        await fetchLogsRef.current();
      } catch (requestError) {
        const errorMsg =
          requestError.response?.data?.error ||
          requestError.message ||
          "Detection request failed.";
        console.error("[DetectError] Full error:", {
          msg: errorMsg,
          response: requestError.response?.data,
          err: requestError,
        });
        setError(errorMsg);
      } finally {
        setLoading(false);
        captureInFlightRef.current = false;
      }
    },
    [autoAnnotateDetection, preset, sessionId, sessionStarted],
  );

  /* ── Motion detection ────────────────────────────────────────── */
  // Monitor camera status and provide feedback
  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = webcamRef.current?.video;

      // If no session started, check camera readiness
      if (!sessionStarted) {
        if (!video) {
          setMotionStatus("Waiting for camera");
        } else if (video.readyState < 2) {
          setMotionStatus("Camera initializing...");
        } else if (!preset) {
          setMotionStatus("No active preset assigned");
        } else if (!autoDetectEnabled) {
          setMotionStatus("Auto-detect paused");
        } else {
          setMotionStatus("Ready to start session");
        }
      }
      // If session started, motion detection handles the status
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionStarted, preset, autoDetectEnabled]);

  const sampleMotion = useCallback(() => {
    const video = webcamRef.current?.video;

    if (
      !video ||
      video.readyState < 2 ||
      loading ||
      captureInFlightRef.current ||
      reviewPendingRef.current ||
      !autoDetectEnabled ||
      !preset ||
      !sessionStarted
    ) {
      return;
    }

    const width = 96;
    const height = 72;
    let canvas = motionCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      motionCanvasRef.current = canvas;
    }
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
      waitForMotionAfterEmptyRef.current = false;
      stableSinceRef.current = null;
      setCountdownMs(null);
      setMotionStatus("Motion detected");
      return;
    }

    if (waitForMotionAfterEmptyRef.current) {
      setCountdownMs(null);
      setMotionStatus(
        "No change in image. Move product/camera or capture manually.",
      );
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
  }, [autoDetectEnabled, handleDetect, loading, preset, sessionStarted]);

  useEffect(() => {
    const interval = window.setInterval(
      sampleMotion,
      MOTION_SAMPLE_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [sampleMotion]);

  /* ── Live inference motion detection ────────────────────────────── */
  const checkLiveInferenceMotion = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2) return false;

    const width = 64;
    const height = 48;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;

    ctx.drawImage(video, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height).data;
    const previous = livePreviousFrameRef.current;

    livePreviousFrameRef.current = new Uint8ClampedArray(frame);

    if (!previous) {
      return true; // First frame
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
    const hasMotion = motionScore > LIVE_MOTION_THRESHOLD;
    console.debug(
      `[LiveMotion] Score: ${motionScore.toFixed(1)} vs threshold ${LIVE_MOTION_THRESHOLD} → ${hasMotion ? "SEND" : "SKIP"}`,
    );
    return hasMotion;
  }, []);

  /* ── Live inference loop ─────────────────────────────────────── */
  useEffect(() => {
    const startLive = () => {
      if (liveIntervalRef.current) return;
      console.debug("[LiveInference] Starting live inference loop");
      liveIntervalRef.current = window.setInterval(() => {
        if (
          !sessionStarted ||
          captureInFlightRef.current ||
          reviewPendingRef.current ||
          !preset
        )
          return;
        if (waitForMotionAfterEmptyRef.current) return;
        if (liveRequestInFlightRef.current) return;

        const socket = liveSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        // Only send live inference when motion is detected
        if (!checkLiveInferenceMotion()) return;

        const imageSrc = webcamRef.current?.getScreenshot();
        if (!imageSrc) return;

        liveRequestInFlightRef.current = true;
        socket.send(
          JSON.stringify({
            type: "frame",
            image: imageSrc,
            filename: `frame-${Date.now()}.png`,
            component: preset.product,
            product_id: preset.product,
            model: preset.model,
            config_id: preset.id,
            config_version: preset.config_version || 1,
            config_hash: preset.config_hash,
            trigger: "live",
            session_id: sessionId || "",
            session_active: sessionStarted,
          }),
        );
      }, LIVE_INFERENCE_INTERVAL_MS);
    };

    const stopLive = () => {
      if (liveIntervalRef.current) {
        console.debug("[LiveInference] Stopping live inference loop");
        window.clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
      livePreviousFrameRef.current = null;
      liveRequestInFlightRef.current = false;
      waitForMotionAfterEmptyRef.current = false;
    };

    if (sessionStarted) startLive();
    else stopLive();

    return () => stopLive();
  }, [checkLiveInferenceMotion, preset, sessionId, sessionStarted]);

  /* ── Submit review ───────────────────────────────────────────── */
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
      setLiveAnnotatedOverlaySrc("");
      setReviewDescription("");
      setCountdownMs(null);
      setMotionStatus(
        autoDetectEnabled ? "Waiting for stable frame" : "Auto-detect paused",
      );
      await fetchLogsRef.current();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Unable to submit review.",
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  /* ── Derived ─────────────────────────────────────────────────── */
  const countdownSeconds =
    countdownMs === null ? "--" : String(Math.ceil(countdownMs / 1000));
  const filteredLogs = sessionFilter
    ? logs.filter((l) => l.session_id === sessionFilter)
    : logs;
  const displayedLogs = filteredLogs.slice(0, logsLimit);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <motion.div
      className="panel-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="panel-shell"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        {/* ── Header / nav ── */}
        <motion.header
          className="panel-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div>
            <p className="eyebrow">Operator console</p>
            <h1>Live inspection workflow</h1>
            <p>
              Capture a frame, run detection, and save the result against the
              selected configuration.
            </p>
          </div>
          <div className="panel-header__right">
            <div className="profile">{username}</div>
            <motion.button
              className="ghost-button"
              onClick={onLogout}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Logout
            </motion.button>
          </div>
        </motion.header>

        {/* ── Tab switcher ── */}
        <motion.div
          className="panel-switcher"
          role="tablist"
          aria-label="Operator pages"
          style={{ marginBottom: 16 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <motion.button
            className={`choice-button${activePanel === "camera" ? " choice-button--active" : ""}`}
            onClick={() => setActivePanel("camera")}
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            Camera Feed
          </motion.button>
          {!cameraOnly && (
            <motion.button
              className={`choice-button${activePanel === "logs" ? " choice-button--active" : ""}`}
              onClick={() => setActivePanel("logs")}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Detection Logs
            </motion.button>
          )}
        </motion.div>

        {/* ════════════════════════════════════════════════
            CAMERA PANEL
        ════════════════════════════════════════════════ */}
        {activePanel === "camera" && (
          <section className="content-grid content-grid--operator">
            {/* ── Left: camera card ── */}
            <div className="section-card section-card--camera">
              <div className="section-heading">
                <p className="eyebrow">Camera feed</p>
                <h2>Prepare the frame</h2>
              </div>

              {cameraOnly && (
                <p className="camera-mode-note">
                  Phone camera mode is active. Keep this device pointed at the
                  inspection area and capture from the browser.
                </p>
              )}

              {/* Webcam */}
              <div
                className="webcam-frame-wrap"
                style={{ position: "relative" }}
              >
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/png"
                  audio={false}
                  videoConstraints={cameraConstraints.video}
                  className={
                    capturedFrame
                      ? "webcam-frame webcam-frame--capture-source"
                      : "webcam-frame"
                  }
                />
                {capturedFrame && (
                  <img
                    ref={frameRef}
                    src={capturedFrame}
                    className="webcam-frame"
                    alt=""
                    onLoad={() => drawOverlay(detectionResult)}
                  />
                )}
                {!capturedFrame && liveAnnotatedOverlaySrc && (
                  <img
                    src={liveAnnotatedOverlaySrc}
                    className="webcam-overlay"
                    alt="Live server annotation"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      zIndex: 11,
                      pointerEvents: "none",
                    }}
                  />
                )}
                <canvas
                  ref={overlayRef}
                  className="webcam-overlay"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 10,
                  }}
                />
              </div>

              {/* Preset metadata chips */}
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

              {/* Error notice */}
              {error && <div className="notice notice--error">{error}</div>}

              {/* Auto-detect / controls bar */}
              <div
                className="auto-detect-panel"
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
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
                  <strong
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      color:
                        streamStatus === "connected" ? "#16a34a" : "#b45309",
                    }}
                  >
                    Stream: {streamStatus}
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

            {/* ── Right: result card ── */}
            <div className="section-card section-card--result">
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
        )}

        {/* ════════════════════════════════════════════════
            LOGS PANEL
        ════════════════════════════════════════════════ */}
        {activePanel === "logs" && (
          <section className="section-card section-card--logs">
            <div className="section-heading">
              <p className="eyebrow">Detection logs</p>
              <h2>Recent inspections</h2>
            </div>

            {/* Filter row */}
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <label style={{ fontSize: 12 }}>Filter by session</label>
              <select
                value={sessionFilter}
                onChange={(e) => {
                  setSessionFilter(e.target.value);
                }}
              >
                <option value="">All sessions</option>
                {Array.from(
                  new Set(logs.map((l) => l.session_id).filter(Boolean)),
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                className="ghost-button"
                onClick={() => {
                  void fetchLogsRef.current();
                }}
                type="button"
              >
                Refresh
              </button>

              <span style={{ fontSize: 12, marginLeft: "auto" }}>Show:</span>
              <select
                value={logsLimit}
                onChange={(e) => setLogsLimit(Number(e.target.value))}
                style={{ padding: "4px 8px", fontSize: 12 }}
              >
                <option value={20}>20 logs</option>
                <option value={50}>50 logs</option>
                <option value={filteredLogs.length}>All logs</option>
              </select>
              {filteredLogs.length > logsLimit && (
                <span style={{ fontSize: 11, color: "#999" }}>
                  Showing {displayedLogs.length} of {filteredLogs.length}
                </span>
              )}
            </div>

            {/* Log list */}
            <div className="log-list">
              {!logs || logs.length === 0 ? (
                <div
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No detection logs yet. Capture a frame and run detection to
                  create logs.
                </div>
              ) : displayedLogs && displayedLogs.length > 0 ? (
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
                        <strong>{log.id || "Untitled"}</strong> &nbsp;{" "}
                        {log.component_name ||
                          log.product_name ||
                          log.component ||
                          "N/A"}
                        <div
                          style={{ fontSize: 12, color: "#777", marginTop: 4 }}
                        >
                          {log.timestamp || log.created_at
                            ? new Date(
                                log.timestamp || log.created_at,
                              ).toLocaleString()
                            : "N/A"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 500 }}>
                          {log.final_decision ||
                            log.system_decision ||
                            log.status ||
                            "—"}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {log.confidence_score || log.confidence || 0
                            ? `${(Number(log.confidence_score || log.confidence || 0) * 100).toFixed(1)}%`
                            : "—"}
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
                            </div>
                            <div
                              style={{
                                overflow: "hidden",
                                height: 260,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                position: "relative",
                                cursor: "pointer",
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
                                style={{ maxWidth: "100%", maxHeight: "100%" }}
                                onClick={() =>
                                  setZoomedImage(
                                    log.image_snapshot ||
                                      log.image_snapshot_url ||
                                      log.image_url,
                                  )
                                }
                                onLoad={() =>
                                  drawLogOverlay(
                                    log.id,
                                    log.detection_results?.detections || [],
                                  )
                                }
                                title="Click to zoom"
                              />
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <h4>Detections</h4>
                            {(log.detection_results?.detections || []).map(
                              (d, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: 6,
                                    borderBottom: "1px solid #eee",
                                  }}
                                >
                                  <strong>{d.label || d.class_name}</strong>
                                  <div>
                                    Confidence:{" "}
                                    {((d.confidence || 0) * 100).toFixed(1)}%
                                  </div>
                                  <div>
                                    Box: {d.bbox ? d.bbox.join(", ") : "n/a"}
                                  </div>
                                  {d.mask?.polygon ? (
                                    <div>
                                      Mask points: {d.mask.polygon.length}
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
                                  setRawOpenMap((m) => ({
                                    ...m,
                                    [log.id]: !m[log.id],
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
                <div
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No logs to display for the selected session.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════
            REVIEW MODAL
        ════════════════════════════════════════════════ */}
        {activePanel === "camera" && detectionResult && (
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
        )}

        {/* Zoom Modal */}
        {zoomedImage && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
            onClick={() => setZoomedImage(null)}
          >
            <div
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={zoomedImage}
                alt="zoomed inspection"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
              <button
                onClick={() => setZoomedImage(null)}
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: "#fff",
                  border: "none",
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  fontSize: "16px",
                  fontWeight: "bold",
                }}
              >
                ✕
              </button>
              <div
                style={{
                  color: "#999",
                  textAlign: "center",
                  marginTop: "10px",
                  fontSize: "12px",
                }}
              >
                Click to close or press Esc
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default OperatorPanel;
