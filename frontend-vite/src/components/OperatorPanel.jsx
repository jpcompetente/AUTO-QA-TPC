import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Webcam from "react-webcam";
import {
  buildInferenceStreamUrl,
  autoApproveInferenceLog,
  detectImage,
  getDetectionLogs,
  getOperatorPreset,
  getOperatorCurrentBatch,
  reviewInferenceLog,
} from "../api/backend";
import {
  buildCameraConstraints,
  ensureCameraPermission,
} from "../utils/camera";

/* -- Constants ------------------------------------------------- */
const STABLE_CAPTURE_DELAY_MS = 2000;
const MOTION_SAMPLE_INTERVAL_MS = 250;
const MOTION_THRESHOLD = 9; // For auto-capture (stable frame detection)
const LIVE_INFERENCE_INTERVAL_MS = 1500;
const LIVE_MOTION_THRESHOLD = 0; // Always send frames for inference

const REJECTION_REASONS = [
  ["MISSED_DEFECT", "Missed a defect"],
  ["FALSE_POSITIVE", "False positive"],
  ["BLURRY_CAPTURE", "Blurry capture"],
  ["BAD_ANNOTATION", "Bad annotation"],
  ["WRONG_CLASS", "Wrong class"],
  ["OTHER", "Other"],
];

/* -- Component ------------------------------------------------- */
function OperatorPanel({
  onLogout,
  username = "Operator",
  cameraOnly = false,
}) {
  const enablePreSessionLive =
    String(import.meta.env.VITE_ENABLE_PRE_SESSION_LIVE || "false")
      .toLowerCase()
      .trim() === "true";

  const [selectedDeviceId, setSelectedDeviceId] = useState(
    () => window.localStorage.getItem("selectedDeviceId") || "",
  );
  const [videoDevices, setVideoDevices] = useState([]);
  const [cameraRetryToken, setCameraRetryToken] = useState(0);

  const [sessionStarted, setSessionStarted] = useState(
    () => window.localStorage.getItem("operatorSessionActive") === "true",
  );
  const [sessionId, setSessionId] = useState(
    () => window.localStorage.getItem("operatorSessionId") || "",
  );
  const [batchNumber, setBatchNumber] = useState(1);

  const cameraConstraints = useMemo(
    () => buildCameraConstraints({ deviceId: selectedDeviceId }),
    [selectedDeviceId],
  );
  /* refs */
  const cameraCardRef = useRef(null);
  const webcamRef = useRef(null);
  const frameRef = useRef(null);
  const overlayRef = useRef(null);
  const manualCanvasRef = useRef(null);
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
  const previousLogIdRef = useRef(null);
  const previousLogDecisionRef = useRef(null);
  const lastImageHashRef = useRef(null);
  const detectionActiveRef = useRef(false);
  const currentLogIdRef = useRef(null);
  const lastDetectionTimeRef = useRef(0);
  const countdownTimerRef = useRef(null);

  /* state */
  const [preset, setPreset] = useState(null);
  const [, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectionResult, setDetectionResult] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [capturedFrame, setCapturedFrame] = useState("");
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [sessionFilter] = useState("");
  const [motionStatus, setMotionStatus] = useState("Waiting for camera");
  const [reviewMode, setReviewMode] = useState("ACKNOWLEDGE");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewFinalDecision, setReviewFinalDecision] = useState("PASS");
  const [reviewRejectionReason, setReviewRejectionReason] =
    useState("MISSED_DEFECT");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  
  const [zoomedImage, setZoomedImage] = useState(null);
  const [streamStatus, setStreamStatus] = useState("disconnected");
  const annotatedImageRef = useRef(null);
  const [sessionCompletedLogs, setSessionCompletedLogs] = useState([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [isCameraFullscreen, setIsCameraFullscreen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [manualAnnotations, setManualAnnotations] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const normalizeErrorMessage = (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    const unquoted = trimmed.replace(/^['"]+|['"]+$/g, "").trim();
    return unquoted.toLowerCase() === "debug" ? "" : value;
  };

  const isVisibleError = (value) => {
    if (!value) return false;
    if (typeof value !== "string") return true;
    const trimmed = value.trim();
    const unquoted = trimmed.replace(/^['"]+|['"]+$/g, "").trim();
    return unquoted.toLowerCase() !== "debug";
  };
  const completedBatchNumber =
    !sessionStarted && batchNumber > 1 ? batchNumber - 1 : null;
  const nextBatchNumber = sessionStarted ? batchNumber + 1 : batchNumber;

  // Sync batch number from backend on mount (cross-browser sync)
  useEffect(() => {
    getOperatorCurrentBatch()
      .then((res) => {
        const serverBatch = res?.data?.batch_number;
        if (Number.isFinite(serverBatch) && serverBatch > 0) {
          setBatchNumber(serverBatch);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "operatorSessionActive",
        sessionStarted ? "true" : "false",
      );
    } catch {
      /* ignore */
    }
  }, [sessionStarted]);

  useEffect(() => {
    try {
      window.localStorage.setItem("operatorSessionId", sessionId || "");
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    try {
      window.localStorage.setItem("operatorBatchNumber", String(batchNumber));
    } catch {
      /* ignore */
    }
  }, [batchNumber]);

  // Reset batch number daily at local midnight (or once per day when app loads).
  useEffect(() => {
    const storageKey = "operatorBatchLastResetDate";

    const getLocalDateKey = (d = new Date()) => {
      const date = new Date(d);
      const offsetMs = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
    };

    const trySetLastReset = (dateKey) => {
      try {
        window.localStorage.setItem(storageKey, dateKey);
      } catch {
        /* ignore */
      }
    };

    const doReset = () => {
      try {
        setBatchNumber(1);
      } catch {
        /* ignore */
      }
    };

    // On mount: if last reset wasn't today, reset once now.
    const todayKey = getLocalDateKey();
    try {
      const last = window.localStorage.getItem(storageKey);
      if (last !== todayKey) {
        doReset();
        trySetLastReset(todayKey);
      }
    } catch {
      // ignore localStorage errors
    }

    // Schedule a timer to run at the next local midnight, then every 24h.
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const msUntilNext = next.getTime() - now.getTime();

    const midnightTimer = window.setTimeout(() => {
      const key = getLocalDateKey(new Date());
      doReset();
      trySetLastReset(key);

      // subsequent resets every 24 hours
      const intervalId = window.setInterval(() => {
        const k = getLocalDateKey(new Date());
        doReset();
        trySetLastReset(k);
      }, 24 * 60 * 60 * 1000);

      // store interval id on the timer so cleanup can clear it
      // (we attach to the timeout id as a property)
      // @ts-ignore
      midnightTimer._intervalId = intervalId;
    }, msUntilNext);

    return () => {
      try {
        window.clearTimeout(midnightTimer);
        // @ts-ignore
        if (midnightTimer._intervalId) window.clearInterval(midnightTimer._intervalId);
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    // Auto-dismiss notification after 4 seconds
    if (notification) {
      const timer = window.setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    sessionFilterRef.current = sessionFilter;
    sessionStartedRef.current = sessionStarted;
  }, [sessionFilter, sessionStarted]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsCameraFullscreen(
        document.fullscreenElement === cameraCardRef.current,
      );
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);

    syncFullscreenState();

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener(
        "webkitfullscreenchange",
        syncFullscreenState,
      );
    };
  }, []);

  // Ensure camera-only mode shows the camera panel without causing
  // a synchronous setState inside an effect (avoids cascading renders).
  /* -- Helpers --------------------------------------------------- */
  const normalizeList = useCallback(
    (payload) => payload?.results || payload || [],
    [],
  );

  const getLocalDateKey = useCallback(() => {
    const date = new Date();
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
  }, []);

  const isVirtualCameraLabel = useCallback((label) => {
    const normalized = String(label || "").toLowerCase();
    return /obs|virtual camera|snap camera|manycam|droidcam|epoccam|cam twist|webcam studio/.test(
      normalized,
    );
  }, []);

  const refreshVideoDevices = useCallback(async () => {
    if (!navigator?.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = (devices || []).filter(
        (device) => device.kind === "videoinput",
      );
      setVideoDevices(videoDevices);
      console.debug("[Camera] refreshed video devices", {
        count: videoDevices.length,
      });
    } catch (err) {
      console.warn("[Camera] failed to refresh video devices", err);
    }
  }, []);

  useEffect(() => {
    if (videoDevices.length === 0) return;

    if (selectedDeviceId) {
      const selectedStillPresent = videoDevices.some(
        (device) => device.deviceId === selectedDeviceId,
      );
      if (!selectedStillPresent) {
        try {
          window.localStorage.removeItem("selectedDeviceId");
        } catch {
          /* ignore */
        }
        window.setTimeout(() => setSelectedDeviceId(""), 0);
      }
      return;
    }

    const preferredVirtualCamera = videoDevices.find((device) =>
      isVirtualCameraLabel(device.label),
    );
    if (preferredVirtualCamera) {
      try {
        window.localStorage.setItem(
          "selectedDeviceId",
          preferredVirtualCamera.deviceId,
        );
      } catch {
        /* ignore */
      }
      window.setTimeout(
        () => setSelectedDeviceId(preferredVirtualCamera.deviceId),
        0,
      );
    }
  }, [videoDevices, selectedDeviceId, isVirtualCameraLabel]);

  const toggleCameraFullscreen = useCallback(async () => {
    const target = cameraCardRef.current;
    if (!target) return;

    try {
      if (document.fullscreenElement === target) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        return;
      }

      if (target.requestFullscreen) {
        await target.requestFullscreen();
        return;
      }

      if (target.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      }
    } catch {
      setError("Unable to open camera in fullscreen mode.");
    }
  }, []);

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

  /* -- Session --------------------------------------------------- */
  const stopSession = useCallback(() => {
    if (liveIntervalRef.current) {
      window.clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    waitForMotionAfterEmptyRef.current = true;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(0);
    annotatedImageRef.current = null;

    // Keep the camera preview active across session restarts.
    // The stream is managed by ReactWebcam and should not be torn down here.

    // Fetch logs for the completed session
    (async () => {
      try {
        const response = await getDetectionLogs({ session_id: sessionId });
        const list = normalizeList(response.data);
        setSessionCompletedLogs(list);
        setShowSessionHistory(true);
      } catch (err) {
        console.warn("Error fetching session logs:", err);
      }
    })();

    setSessionStarted(false);
    // Advance to next batch when a session stops so subsequent detections
    // are grouped under a new batch_number.
    setBatchNumber((current) => current + 1);
    setSessionId("");
  }, [sessionId, normalizeList]);

  const toggleSession = useCallback(() => {
    if (sessionStarted) {
      stopSession();
      return;
    }
    setError("");
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

  /* -- Boot ------------------------------------------------------ */
  useEffect(() => {
    const load = async () => {
      try {
        await fetchOptions();
        await fetchLogsRef.current();
        await refreshVideoDevices();
      } catch (err) {
        setError(
          normalizeErrorMessage(
            err.response?.data?.error ||
              err.response?.data?.detail ||
              "No active inspection preset is assigned to this operator.",
          ),
        );
      }
    };
    void load();
  }, [fetchOptions, refreshVideoDevices]);

  // Refresh logs when session filter changes
  useEffect(() => {
    void (async () => {
      await fetchLogsRef.current();
    })();
  }, [sessionFilter, sessionStarted]);

  /* -- Drawing handlers for manual annotations ---------------- */
  const startDrawing = useCallback((e) => {
    if (!reviewPendingRef.current) return;
    const canvas = manualCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setCurrentPath([{ x, y }]);
  }, []);

  const drawLine = useCallback(
    (e) => {
      if (!isDrawing || !reviewPendingRef.current) return;
      const canvas = manualCanvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setCurrentPath((prev) => [...prev, { x, y }]);
    },
    [isDrawing],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setManualAnnotations((prev) => [...prev, currentPath]);
    }
    setCurrentPath([]);
  }, [isDrawing, currentPath]);

  /* -- Canvas rendering: Manual annotations on top canvas ---- */
  useEffect(() => {
    const canvas = manualCanvasRef.current;
    if (!canvas) return;

    // Ensure the manual canvas size matches its CSS dimensions
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw completed paths
    manualAnnotations.forEach((path) => {
      if (path.length < 2) return;
      ctx.strokeStyle = "#FF3B30";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    });

    // Draw the path currently being drawn
    if (currentPath.length > 1) {
      ctx.strokeStyle = "#FF3B30";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }
  }, [manualAnnotations, currentPath]);

  /* -- Canvas overlay ------------------------------------------- */
  const drawOverlay = useCallback(
    (result) => {
      const canvas = overlayRef.current;
      const media = webcamRef.current?.video || frameRef.current;
      if (!canvas || !media) return;

      const wrapper = canvas.parentElement;
      let displayWidth =
        wrapper?.offsetWidth || canvas.offsetWidth || media.clientWidth || 640;
      let displayHeight =
        wrapper?.offsetHeight || canvas.offsetHeight || media.clientHeight || 480;

      if (media.tagName === "VIDEO") {
        if (!displayWidth || displayWidth < 100)
          displayWidth = media.clientWidth || 640;
        if (!displayHeight || displayHeight < 100)
          displayHeight = media.clientHeight || 480;
      }

      let sourceWidth, sourceHeight;
      if (media.tagName === "VIDEO") {
        sourceWidth = media.videoWidth || media.naturalWidth || displayWidth;
        sourceHeight = media.videoHeight || media.naturalHeight || displayHeight;
      } else {
        sourceWidth = media.naturalWidth || media.width || displayWidth;
        sourceHeight = media.naturalHeight || media.height || displayHeight;
      }

      if (!sourceWidth || !sourceHeight) {
        return;
      }

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

      const drawDetections = (detections) => {
        if (!detections || detections.length === 0) {
          return;
        }

        (detections || []).forEach((detection) => {
          const [x1, y1, x2, y2] = detection.bbox || [];
          const label = detection.label || detection.class_name || "DETECTION";
          const confidence = Number(detection.confidence || detection.confidence_score || 0);

          const isScratch = label === "SCRATCH";
          const threshold = preset?.confidence_threshold;
          const isLowConfidence = typeof threshold === 'number' && confidence < threshold;
          const boxColor = isLowConfidence ? "#f59e0b" : isScratch ? "#ef4444" : "#22c55e";
          const polygon = detection.mask?.polygon || [];
          
          // Use mask's own dimensions for scaling, not video source dimensions
          const maskWidth = detection.mask?.width || sourceWidth;
          const maskHeight = detection.mask?.height || sourceHeight;
          const maskScaleX = renderedWidth / maskWidth;
          const maskScaleY = renderedHeight / maskHeight;
          
          if (polygon.length > 2) {
            ctx.save();
            ctx.beginPath();
            polygon.forEach(([x, y], index) => {
              const px = offsetX + x * maskScaleX;
              const py = offsetY + y * maskScaleY;
              if (index === 0) {
                ctx.moveTo(px, py);
              } else {
                ctx.lineTo(px, py);
              }
            });
            ctx.closePath();

            ctx.fillStyle = isScratch
              ? "rgba(239, 68, 68, 0.35)"
              : "rgba(34, 197, 94, 0.25)";
            ctx.fill();

            ctx.lineWidth = 3;
            ctx.strokeStyle = boxColor;
            ctx.setLineDash([8, 4]);
            ctx.stroke();
            ctx.restore();
          }

          if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
            const left = offsetX + x1 * maskScaleX;
            const top = offsetY + y1 * maskScaleY;
            const width = (x2 - x1) * maskScaleX;
            const height = (y2 - y1) * maskScaleY;

            ctx.save();
            ctx.lineWidth = 4;
            ctx.strokeStyle = boxColor;
            ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
            ctx.shadowBlur = 10;
            ctx.strokeRect(left, top, width, height);
            ctx.restore();

            const text = `${label} ${(confidence * 100).toFixed(1)}%`;
            ctx.font = "700 14px Arial, sans-serif";
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width + 10;
            const textHeight = 20;
            const labelX = left;
            const labelY = Math.max(top - textHeight - 6, 10);

            ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
            ctx.fillRect(labelX - 2, labelY - 2, textWidth + 4, textHeight + 4);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, labelX + 4, labelY + 15);
            // Low-confidence badge
            if (isLowConfidence) {
              const badgeText = "LOW";
              const badgeWidth = 44;
              const badgeHeight = 18;
              const bx = left + width - badgeWidth - 6;
              const by = top + 6;
              ctx.fillStyle = "#f59e0b";
              ctx.fillRect(bx, by, badgeWidth, badgeHeight);
              ctx.fillStyle = "#000";
              ctx.font = "700 12px Arial, sans-serif";
              ctx.fillText(badgeText, bx + 8, by + 13);
            }
          }
        });
      };

      if (result?.annotated_image_b64 && annotatedImageRef.current) {
        ctx.drawImage(
          annotatedImageRef.current,
          offsetX,
          offsetY,
          renderedWidth,
          renderedHeight,
        );
      }

      drawDetections(result?.detections || []);
    }, [preset]);

  useEffect(() => {
    drawOverlay(detectionResult);
  }, [drawOverlay, capturedFrame, detectionResult]);

  // Display server-rendered annotated image when available
  useEffect(() => {
    if (!detectionResult?.annotated_image_b64) {
      annotatedImageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      annotatedImageRef.current = img;
      drawOverlay(detectionResult);
    };
    img.onerror = (err) => {
      annotatedImageRef.current = null;
      console.error("[ServerAnnotation] Image load error:", err);
    };
    img.src = `data:image/png;base64,${detectionResult.annotated_image_b64}`;
    console.debug("[ServerAnnotation] Loading base64 image:", {
      size: detectionResult.annotated_image_b64?.length || 0,
    });

    return () => {
      annotatedImageRef.current = null;
    };
  }, [detectionResult?.annotated_image_b64, detectionResult, drawOverlay]);

  // Live feed annotation loop - draw detections on live webcam
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    let animationFrameId;

    const drawFrame = () => {
      const video = webcamRef.current?.video;

      if (!capturedFrame && video && video.readyState === 4) {
        drawOverlay(detectionResult);
      } else if (capturedFrame) {
        drawOverlay(detectionResult);
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx && canvas.width > 0) ctx.clearRect(0, 0, canvas.width, canvas.height);
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

      const shouldStopCamera = !(sessionStarted || enablePreSessionLive) || !preset;
      if (shouldStopCamera) {
        setStreamStatus("disconnected");
        try {
          const stream = liveMediaStreamRef.current;
          if (stream?.getTracks) {
            stream.getTracks().forEach((track) => track.stop());
          }
        } catch (error) {
          console.warn("Error stopping media stream", error);
        }
        liveMediaStreamRef.current = null;
        try {
          const videoEl = webcamRef.current?.video;
          if (videoEl) videoEl.srcObject = null;
        } catch {
          /* ignore */
        }
      }
    };

    if (!(sessionStarted || enablePreSessionLive) || !preset) {
      closeStream();
      return undefined;
    }

    // Request camera permission before the component tries to open the webcam.
    // ReactWebcam will attach the actual stream itself via videoConstraints.
    (async () => {
      try {
        const res = await ensureCameraPermission({
          constraints: cameraConstraints,
        });
        if (res.granted && res.stream) {
          // Stop the probe stream, as ReactWebcam manages its own stream internally.
          try {
            res.stream.getTracks().forEach((track) => track.stop());
          } catch (stopErr) {
            console.warn("Error stopping permission probe stream", stopErr);
          }
        } else if (!res.granted) {
          window.setTimeout(() => {
            setError(res.error?.message || "Camera permission denied");
          }, 0);
        }
      } catch (e) {
        console.warn("ensureCameraPermission error", e);
      }
    })();

    const MAX_RECONNECT_ATTEMPTS = 999;

    const connectStream = () => {
      if (!streamEffectActiveRef.current) return;

      const token = localStorage.getItem("token");
      if (!token) {
        setError("Missing access token. Please login again.");
        setStreamStatus("auth-error");
        return;
      }

      // Don't attempt to reconnect beyond max attempts
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setStreamStatus("failed");
        console.warn(
          `[InferenceStream] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
        );
        return;
      }

      setStreamStatus("connecting");
      if (
        liveSocketRef.current &&
        liveSocketRef.current.readyState !== WebSocket.CLOSED &&
        liveSocketRef.current.readyState !== WebSocket.CLOSING
      ) {
        console.debug("[InferenceStream] existing socket still active, skipping reconnect");
        return;
      }

      const socket = new WebSocket(buildInferenceStreamUrl(token));
      liveSocketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStreamStatus("connected");
        setError("");
        console.debug("[InferenceStream] Connected");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data || "{}");
          if (message.type === "inference_result" && message.data) {
            setDetectionResult(message.data);
            console.log("?? RAW DATA:", JSON.stringify({
              detections: message.data.detections?.length,
              hasImage: !!message.data.annotated_image_b64,
              firstDetection: message.data.detections?.[0],
            }));
            console.debug("[InferenceStream] inference result", {
              detections: message.data.detections?.length || 0,
              hasAnnotatedImage: Boolean(message.data.annotated_image_b64),
              confidence: message.data.confidence,
              systemDecision: message.data.system_decision,
              debug: message.data.debug,
            });
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
              console.debug("[InferenceStream] throttled", message);
            return;
          }
        } catch (parseError) {
          liveRequestInFlightRef.current = false;
          console.warn("[InferenceStream] message parse error:", parseError);
        }
      };

      socket.onerror = (err) => {
        setStreamStatus("error");
        liveRequestInFlightRef.current = false;
        // Only log error on first attempt or after successful connection
        if (reconnectAttemptsRef.current === 0) {
          console.warn("[InferenceStream] Connection error (will retry):", err);
        }
      };

      socket.onclose = (event) => {
        console.debug(
          "[InferenceStream] socket closed",
          event.code,
          event.reason,
          event.wasClean,
        );
        liveRequestInFlightRef.current = false;
        if (liveSocketRef.current === socket) {
          liveSocketRef.current = null;
        }

        if (!streamEffectActiveRef.current || !(sessionStarted || enablePreSessionLive)) {
          setStreamStatus("disconnected");
          return;
        }

        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;

        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          setStreamStatus("failed");
          console.warn(
            `[InferenceStream] Connection closed. Max reconnection attempts reached.`,
          );
          return;
        }

        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
        setStreamStatus("reconnecting");
        console.debug(
          `[InferenceStream] Reconnecting in ${delayMs}ms (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})`,
        );
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
  }, [preset, sessionStarted, cameraConstraints, enablePreSessionLive]);

  /* -- Auto-annotate --------------------------------------------- */
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

  /* -- Detect ---------------------------------------------------- */
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
      // Auto-confirm previous PENDING log if operator did not flag it
      if (previousLogIdRef.current && !reviewPendingRef.current) {
        try {
          await reviewInferenceLog(previousLogIdRef.current, {
            action: "ACKNOWLEDGE",
            description: "Auto-confirmed by next detection",
            final_decision: previousLogDecisionRef.current === "PASS" ? "PASS" : "FAIL",
            rejection_reason: "",
          });
          previousLogIdRef.current = null;
          previousLogDecisionRef.current = null;
          reviewPendingRef.current = false;
        } catch (e) {
          console.warn("[Auto-Confirm] Failed to confirm previous log", e);
        }
      }
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
        formData.append("batch_number", String(batchNumber || 1));
        formData.append("batch_date", getLocalDateKey());

        const detectResponse = await detectImage(formData);
        const result = detectResponse.data;
        const detections = result?.detections || [];
        const isManualCapture = trigger === "manual";

        if (!isManualCapture && detections.length === 0) {
          setDetectionResult(null);
          setCapturedFrame("");
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

        // Always require operator review before confirming decision
        const newLogId = result?.log_id || result?.id;
        console.log("[Debug] result log_id:", result?.log_id, "id:", result?.id, "newLogId:", newLogId);
        if (newLogId) {
          previousLogIdRef.current = newLogId;
          previousLogDecisionRef.current = result?.system_decision || "PASS";
          currentLogIdRef.current = newLogId;
        }
        setDetectionResult(result);
        setReviewMode("ACKNOWLEDGE");
        const autoDescription = autoAnnotateDetection(result);
        setReviewDescription(autoDescription);
        setReviewFinalDecision(result.system_decision || "PASS");
        setReviewRejectionReason("MISSED_DEFECT");
        setMotionStatus("Ready for next scan");
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
        setError(normalizeErrorMessage(errorMsg));
      } finally {
        setLoading(false);
        captureInFlightRef.current = false;
      }
    },
    [autoAnnotateDetection, batchNumber, getLocalDateKey, preset, sessionId, sessionStarted],
  );

  /* -- Motion detection ------------------------------------------ */
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
      !sessionStarted ||
      streamStatus === "connected"
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
      setMotionStatus("Motion detected");
      return;
    }

    if (waitForMotionAfterEmptyRef.current) {
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

  /* -- Live inference motion detection ------------------------------ */
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
      `[LiveMotion] Score: ${motionScore.toFixed(1)} vs threshold ${LIVE_MOTION_THRESHOLD} ? ${hasMotion ? "SEND" : "SKIP"}`,
    );
    return hasMotion;
  }, []);

  /* -- Live inference loop --------------------------------------- */
  useEffect(() => {
    const startLive = () => {
      if (liveIntervalRef.current) return;
      console.debug("[LiveInference] Starting live inference loop");
      liveIntervalRef.current = window.setInterval(() => {
        if (
          !(sessionStarted || enablePreSessionLive) ||
          captureInFlightRef.current ||
          reviewPendingRef.current ||
          !preset
        )
          return;
        if (waitForMotionAfterEmptyRef.current) {
          // Cancel countdown if motion detected (operator placed new IC)
          if (sessionStarted && checkLiveInferenceMotion()) {
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            setCountdown(0);
            waitForMotionAfterEmptyRef.current = false;
            console.debug("[LiveGate] Motion detected - cancelling countdown for next IC");
          }
          return;
        }
        if (liveRequestInFlightRef.current) return;

        const socket = liveSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        // Skip motion gate in pre-session mode so inference runs continuously
        if (sessionStarted && !checkLiveInferenceMotion()) return;

        const imageSrc = webcamRef.current?.getScreenshot();
        if (!imageSrc) return;

        console.debug("[LiveInference] sending frame", {
          sessionStarted,
          enablePreSessionLive,
          sessionId,
          batchNumber,
          hasPreset: Boolean(preset),
        });

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
            session_active: sessionStarted ? true : false,
            batch_number: batchNumber || 1,
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

    if (sessionStarted || enablePreSessionLive) startLive();
    else stopLive();

    return () => stopLive();
  }, [
    batchNumber,
    checkLiveInferenceMotion,
    preset,
    sessionId,
    sessionStarted,
    enablePreSessionLive,
  ]);

  /* -- Submit review --------------------------------------------- */
  const submitReview = async () => {
    const logId = detectionResult?.log_id || detectionResult?.id || currentLogIdRef.current;

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
      detectionActiveRef.current = false;
      setDetectionResult(null);
      setCapturedFrame("");
      annotatedImageRef.current = null;
      setReviewDescription("");
      setMotionStatus(
        autoDetectEnabled ? "Waiting for stable frame" : "Auto-detect paused",
      );
      await fetchLogsRef.current();
    } catch (requestError) {
      setError(
        normalizeErrorMessage(
          requestError.response?.data?.error || "Unable to submit review.",
        ),
      );
    } finally {
      setSubmittingReview(false);
    }
  };



  const liveConfidenceValue = detectionResult
    ? Number(
        detectionResult.confidence ?? detectionResult?.detections?.[0]?.confidence ?? NaN,
      )
    : null;





  /* -- Render ---------------------------------------------------- */
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
        {/* -- Header / nav -- */}
        <motion.header
          className="panel-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div>
            <h1>Live inspection</h1>
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

        {/* -- Tab switcher -- */}

        {/* ------------------------------------------------
            CAMERA PANEL
        ------------------------------------------------ */}
        <section className="content-grid content-grid--operator">
          {/* -- Left: camera card -- */}
          <div
            className="section-card section-card--camera"
            ref={cameraCardRef}
          >
            {!isCameraFullscreen && (
              <div className="section-heading section-heading--camera">
                <div className="section-heading__copy">
                  <p className="eyebrow">Camera feed</p>
                  <h2>Prepare the frame</h2>
                </div>
                <button
                  className="ghost-button camera-fullscreen-button"
                  onClick={toggleCameraFullscreen}
                  type="button"
                  aria-pressed={isCameraFullscreen}
                >
                  {isCameraFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>
              </div>
            )}

            {/* Notification for auto-approval */}
            {!isCameraFullscreen && notification && (
              <div
                style={{
                  padding: "12px",
                  marginBottom: "12px",
                  borderRadius: "6px",
                  backgroundColor:
                    notification.type === "success" ? "#d4edda" : "#f8d7da",
                  color:
                    notification.type === "success" ? "#155724" : "#721c24",
                  border: `1px solid ${notification.type === "success" ? "#c3e6cb" : "#f5c6cb"}`,
                  fontSize: "13px",
                  fontWeight: "500",
                }}
              >
                {notification.message}
              </div>
            )}

            {/* -- Detection Status Indicator -- */}
            {sessionStarted && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: "10px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background-color 0.3s, color 0.3s",
                  backgroundColor:
                    !detectionResult
                      ? "#f3f4f6"
                      : detectionResult.system_decision === "PASS"
                      ? "#d4edda"
                      : detectionResult.system_decision === "FAIL"
                      ? "#f8d7da"
                      : "#fff3cd",
                  color:
                    !detectionResult
                      ? "#6b7280"
                      : detectionResult.system_decision === "PASS"
                      ? "#155724"
                      : detectionResult.system_decision === "FAIL"
                      ? "#721c24"
                      : "#856404",
                  border: `1px solid ${
                    !detectionResult
                      ? "#e5e7eb"
                      : detectionResult.system_decision === "PASS"
                      ? "#c3e6cb"
                      : detectionResult.system_decision === "FAIL"
                      ? "#f5c6cb"
                      : "#ffeeba"
                  }`,
                }}
              >
                <span style={{ fontSize: "16px" }}>
                  {!detectionResult
                    ? "?"
                    : detectionResult.system_decision === "PASS"
                    ? "?"
                    : detectionResult.system_decision === "FAIL"
                    ? "?"
                    : "?"}
                </span>
                <span>
                  {!detectionResult
                    ? "Waiting for IC..."
                    : detectionResult.system_decision === "PASS"
                    ? `PASS � ${detectionResult.detections?.[0]?.label || "INTACT"} ${((detectionResult.confidence || 0) * 100).toFixed(1)}%`
                    : detectionResult.system_decision === "FAIL"
                    ? `FAIL � ${detectionResult.detections?.[0]?.label || "DEFECT"} ${((detectionResult.confidence || 0) * 100).toFixed(1)}%`
                    : `UNCERTAIN � ${detectionResult.detections?.length ? detectionResult.detections[0].label : "No detection"} ${((detectionResult.confidence || 0) * 100).toFixed(1)}%`}
                </span>
                {detectionResult && detectionResult.system_decision === "PASS" && !reviewPending && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewMode("REJECT");
                      setReviewFinalDecision("FAIL");
                      setReviewRejectionReason("MISSED_DEFECT");
                      setReviewDescription("Operator flagged a missed defect not caught by the AI.");
                      reviewPendingRef.current = true;
                      setReviewPending(true);
                    }}
                    style={{
                      marginLeft: "auto",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      borderRadius: "4px",
                      border: "1px solid #c0392b",
                      background: "#fff",
                      color: "#c0392b",
                      cursor: "pointer",
                    }}
                  >
                    Flag as defective
                  </button>
                )}
              </div>
            )}

            {detectionResult && sessionStarted && (
              <button
                type="button"
                onClick={() => {
                  if (!reviewPendingRef.current) {
                    setDetectionResult(null);
                  }
                  waitForMotionAfterEmptyRef.current = false;
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  marginTop: "8px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#1a73e8",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                Next IC
              </button>
            )}

            {!isCameraFullscreen && cameraOnly && (
              <p className="camera-mode-note">
                Phone camera mode is active. Keep this device pointed at the
                inspection area and capture from the browser.
              </p>
            )}

            {/* Webcam */}
            <div className="webcam-frame-wrap" style={{ position: "relative" }}>
              <Webcam
                key={`webcam-${selectedDeviceId || "default"}-${cameraRetryToken}`}
                ref={webcamRef}
                screenshotFormat="image/png"
                audio={false}
                videoConstraints={cameraConstraints.video}
                onUserMedia={() => {
                  liveMediaStreamRef.current = webcamRef.current?.video?.srcObject;
                  console.debug("[Camera] user media attached", {
                    selectedDeviceId: selectedDeviceId || "default",
                    constraints: cameraConstraints.video,
                    streamAttached: Boolean(webcamRef.current?.video?.srcObject),
                  });
                }}
                onUserMediaError={(err) => {
                  console.error("[Camera] user media error", err);
                  const selectedDeviceFailure =
                    selectedDeviceId &&
                    (String(err?.name || "").includes("NotFound") ||
                      String(err?.name || "").includes("Overconstrained") ||
                      String(err?.message || "").toLowerCase().includes("device"));
                  if (selectedDeviceFailure) {
                    try {
                      window.localStorage.removeItem("selectedDeviceId");
                    } catch {
                      /* ignore */
                    }
                    setSelectedDeviceId("");
                
                    setCameraRetryToken((current) => current + 1);
                    console.warn(
                      "[Camera] selected device failed, retrying with default camera",
                    );
                    return;
                  }
                  setError(
                    err?.message ||
                      "Camera failed to start. Check the selected camera device.",
                  );
                }}
                onPlay={() => {
                  const video = webcamRef.current?.video;
                  console.debug("[Camera] play", {
                    readyState: video?.readyState,
                    videoWidth: video?.videoWidth,
                    videoHeight: video?.videoHeight,
                    selectedDeviceId: selectedDeviceId || "default",
                  });
                }}
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
                  pointerEvents: "none",
                }}
              />
              <canvas
                ref={manualCanvasRef}
                className="manual-canvas"
                onMouseDown={startDrawing}
                onMouseMove={drawLine}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 20,
                  cursor: reviewPending ? "crosshair" : "default",
                  pointerEvents: reviewPending ? "auto" : "none",
                }}
              />
            </div>

            {isCameraFullscreen && (
              <div className="camera-fullscreen-controls">
                <div className="batch-status">
                  {sessionStarted
                    ? `Active batch ${batchNumber}: ${autoDetectEnabled ? "Running" : "Paused"}`
                    : completedBatchNumber
                      ? `Completed batch ${completedBatchNumber}`
                      : `Ready for batch ${batchNumber}`}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text3)" }}>
                  {sessionStarted
                    ? `Next batch ${nextBatchNumber}`
                    : `Next batch ${nextBatchNumber}`}
                </div>
                <div className="batch-controls">
                  <button
                    className="batch-button"
                    onClick={toggleSession}
                    type="button"
                  >
                    {sessionStarted ? "Stop" : "Start Batch"}
                  </button>
                  <button
                    className="batch-button"
                    onClick={() => {
                      const next = !autoDetectEnabled;
                      setAutoDetectEnabled(next);
                      stableSinceRef.current = null;
                      setMotionStatus(
                        next
                          ? "Waiting for stable frame"
                          : "Auto-detect paused",
                      );
                    }}
                    type="button"
                  >
                    {autoDetectEnabled ? "Pause" : "Resume"}
                  </button>
                </div>
                <button
                  className="camera-exit-inline-button"
                  onClick={toggleCameraFullscreen}
                  aria-label="Exit fullscreen"
                  type="button"
                >
                  Exit
                </button>
              </div>
            )}

            {/* Preset metadata chips */}
            {!isCameraFullscreen && (
              <div className="preset-summary" style={{ display: "none" }}>
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
            )}

            {/* Error notice */}
            {!isCameraFullscreen && isVisibleError(error) && (
              <div className="notice notice--error">{error}</div>
            )}
          </div>

          {/* -- Right: inspection info -- */}
          <div className="section-card section-card--inspection">
            <div className="section-heading">
              <p className="eyebrow">Inspection info</p>
              <h2>Product & Model Details</h2>
            </div>

            <div className="inspection-info-panel">
              {/* Stream Status */}
              <div className="info-group">
                <div className="info-label">Stream</div>
                <div className="info-status">
                  <span className={`status-badge status-${streamStatus}`}>
                    {streamStatus.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Camera selection is intentionally hidden from the UI, but the selectedDeviceId state and refresh logic remain available */}

              {/* Auto-detect */}
              <div className="info-group">
                <div className="info-label">Auto-detect</div>
                <div className="info-value">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoDetectEnabled}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setAutoDetectEnabled(next);
                        stableSinceRef.current = null;
                        setMotionStatus(
                          next
                            ? "Waiting for stable frame"
                            : "Auto-detect paused",
                        );
                      }}
                    />
                    {motionStatus}
                  </label>
                </div>
              </div>

              {/* Batch Status */}
              {!isCameraFullscreen && (
                <div className="info-group">
                  <div className="info-label">Batch</div>
                  <div className="info-batch">
                    <div className="batch-status">
                      {sessionStarted
                        ? `Active batch ${batchNumber}: ${autoDetectEnabled ? "Running" : "Paused"}`
                        : completedBatchNumber
                          ? `Completed batch ${completedBatchNumber}`
                          : `Ready for batch ${batchNumber}`}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text3)" }}>
                      {sessionStarted
                        ? `Next batch ${nextBatchNumber}`
                        : `Next batch ${nextBatchNumber}`}
                    </div>
                    <div className="batch-controls">
                      <button
                        className="batch-button"
                        onClick={toggleSession}
                        type="button"
                      >
                        {sessionStarted ? "Stop" : "Start Batch"}
                      </button>
                      <button
                        className="batch-button"
                        onClick={() => {
                          const next = !autoDetectEnabled;
                          setAutoDetectEnabled(next);
                          stableSinceRef.current = null;
                          setMotionStatus(
                            next
                              ? "Waiting for stable frame"
                              : "Auto-detect paused",
                          );
                        }}
                        type="button"
                      >
                        {autoDetectEnabled ? "Pause" : "Resume"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Product */}
              <div className="info-group">
                <div className="info-label">Product</div>
                <div className="info-value">
                  {preset?.product_name || preset?.component_name || "�"}
                </div>
              </div>

              {/* Model */}
              <div className="info-group">
                <div className="info-label">Model</div>
                <div className="info-value">{preset?.model_name || "�"}</div>
              </div>

              {/* Confidence */}
              <div className="info-group">
                <div className="info-label">Confidence</div>
                <div className="info-value">
                  {Number.isFinite(liveConfidenceValue)
                    ? `${(liveConfidenceValue * 100).toFixed(1)}%`
                    : preset?.confidence_threshold !== undefined
                    ? `${Number(preset.confidence_threshold * 100).toFixed(0)}%`
                    : "�"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------
            REVIEW MODAL (LOW-CONFIDENCE FALLBACK)
        ------------------------------------------------ */}
        {reviewPending && detectionResult && (
          <div className="review-modal" role="dialog" aria-modal="true">
            <div className="review-modal__panel">
              <div className="section-heading" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p className="eyebrow">Operator review</p>
                  <h2>Decision required</h2>
                </div>
                <button onClick={() => { reviewPendingRef.current = false; setReviewPending(false); }} style={{background:"none",border:"none",fontSize:"20px",cursor:"pointer",color:"#666"}}>X</button>
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

              {isVisibleError(error) && <div className="notice notice--error">{error}</div>}

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

        {/* ------------------------------------------------
            SESSION HISTORY MODAL
        ------------------------------------------------ */}
        {showSessionHistory && sessionCompletedLogs.length > 0 && (
          <div className="review-modal" role="dialog" aria-modal="true">
            <div
              className="review-modal__panel"
              style={{ maxHeight: "80vh", overflowY: "auto" }}
            >
              <div className="section-heading">
                <p className="eyebrow">Batch completed</p>
                <h2>Session History</h2>
              </div>

              <div
                style={{
                  marginBottom: "16px",
                  fontSize: "0.9rem",
                  color: "#666",
                }}
              >
                <p>
                  Total detections:{" "}
                  <strong>{sessionCompletedLogs.length}</strong>
                </p>
                <p style={{ marginTop: "8px" }}>
                  Auto-approved:{" "}
                  <strong>
                    {
                      sessionCompletedLogs.filter(
                        (log) =>
                          !log.operator_override &&
                          (log.final_decision || log.system_decision),
                      ).length
                    }
                  </strong>
                </p>
                <p style={{ marginTop: "8px" }}>
                  Uncertain detections:{" "}
                  <strong>
                    {
                      sessionCompletedLogs.filter(
                        (log) => 
                          log.system_decision === 'UNCERTAIN' ||
                          log.system_decision === 'LOW_CONFIDENCE'
                      ).length
                    }
                  </strong>
                  {sessionCompletedLogs.filter(
                    (log) =>
                      log.system_decision === 'UNCERTAIN' ||
                      log.system_decision === 'LOW_CONFIDENCE'
                  ).length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#d97706' }}>
                      ? Auto-submitted for retraining
                    </span>
                  )}
                </p>
              </div>

              <div
                style={{
                  maxHeight: "500px",
                  overflowY: "auto",
                  marginBottom: "16px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "4px",
                }}
              >
                {sessionCompletedLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`log-item log-item--${(log.final_decision || log.system_decision || "").toLowerCase()}`}
                    style={{
                      padding: "12px",
                      borderBottom: "1px solid #f0f0f0",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ fontSize: "0.85rem", color: "#999" }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "3px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          backgroundColor:
                            (log.final_decision || log.system_decision) === "PASS"
                              ? "#d4edda"
                              : (log.system_decision === "UNCERTAIN" || log.system_decision === "LOW_CONFIDENCE")
                              ? "#fff3cd"
                              : "#f8d7da",
                          color:
                            (log.final_decision || log.system_decision) === "PASS"
                              ? "#155724"
                              : (log.system_decision === "UNCERTAIN" || log.system_decision === "LOW_CONFIDENCE")
                              ? "#856404"
                              : "#721c24",
                        }}
                      >
                        {log.final_decision || log.system_decision || "�"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.9rem", marginBottom: "6px" }}>
                      <strong>Confidence:</strong>{" "}
                      {(Number(log.confidence_score || 0) * 100).toFixed(1)}%
                    </div>
                    {log.operator_override && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "#d97706",
                          marginBottom: "6px",
                        }}
                      >
                        <strong>? Operator override</strong>
                      </div>
                    )}
                    {log.operator_comment && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "#666",
                          fontStyle: "italic",
                        }}
                      >
                        "{log.operator_comment}"
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                className="primary-button"
                onClick={() => setShowSessionHistory(false)}
                type="button"
              >
                Close History
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
                ?
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

