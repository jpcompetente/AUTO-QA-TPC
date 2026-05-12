import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import {
  detectImage,
  getDetectionLogs,
  getOperatorPreset,
  reviewInferenceLog,
} from '../api/backend';
import '../styles/operator.css';

/* ── Constants ───────────────────────────────────────────────── */
const STABLE_CAPTURE_DELAY_MS  = 2000;
const MOTION_SAMPLE_INTERVAL_MS = 250;
const MOTION_THRESHOLD          = 9;

const REJECTION_REASONS = [
  ['MISSED_DEFECT',  'Missed a defect'],
  ['FALSE_POSITIVE', 'False positive'],
  ['BLURRY_CAPTURE', 'Blurry capture'],
  ['BAD_ANNOTATION', 'Bad annotation'],
  ['WRONG_CLASS',    'Wrong class'],
  ['OTHER',          'Other'],
];

/* ── Component ───────────────────────────────────────────────── */
function OperatorPanel({ onLogout }) {
  /* refs */
  const webcamRef         = useRef(null);
  const frameRef          = useRef(null);
  const overlayRef        = useRef(null);
  const motionCanvasRef   = useRef(null);
  const previousFrameRef  = useRef(null);
  const stableSinceRef    = useRef(null);
  const captureInFlightRef = useRef(false);
  const reviewPendingRef  = useRef(false);
  const liveIntervalRef   = useRef(null);

  /* state */
  const [preset,               setPreset]              = useState(null);
  const [logs,                 setLogs]                = useState([]);
  const [loading,              setLoading]             = useState(false);
  const [error,                setError]               = useState('');
  const [detectionResult,      setDetectionResult]     = useState(null);
  const [capturedFrame,        setCapturedFrame]       = useState('');
  const [autoDetectEnabled,    setAutoDetectEnabled]   = useState(true);
  const [sessionStarted,       setSessionStarted]      = useState(false);
  const [sessionId,            setSessionId]           = useState('');
  const [sessionFilter,        setSessionFilter]       = useState('');
  const [expandedLogId,        setExpandedLogId]       = useState(null);
  const [rawOpenMap,           setRawOpenMap]          = useState({});
  const [motionStatus,         setMotionStatus]        = useState('Waiting for camera');
  const [countdownMs,          setCountdownMs]         = useState(null);
  const [reviewMode,           setReviewMode]          = useState('ACKNOWLEDGE');
  const [reviewDescription,    setReviewDescription]   = useState('');
  const [reviewFinalDecision,  setReviewFinalDecision] = useState('PASS');
  const [reviewRejectionReason,setReviewRejectionReason] = useState('MISSED_DEFECT');
  const [submittingReview,     setSubmittingReview]    = useState(false);
  const [reviewPending,        setReviewPending]       = useState(false);
  const [activePanel,          setActivePanel]         = useState('camera');

  /* ── Helpers ─────────────────────────────────────────────────── */
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

  /* ── Session ─────────────────────────────────────────────────── */
  const stopSession = useCallback(() => {
    if (liveIntervalRef.current) {
      window.clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    setSessionStarted(false);
    setSessionId('');
  }, []);

  const toggleSession = useCallback(() => {
    if (sessionStarted) { stopSession(); return; }
    const nextId = `SESSION-${Date.now()}`;
    setSessionStarted(true);
    setSessionId(nextId);
    liveIntervalRef.current = window.setInterval(() => setSessionId(nextId), 60_000);
  }, [sessionStarted, stopSession]);

  useEffect(() => () => {
    if (liveIntervalRef.current) window.clearInterval(liveIntervalRef.current);
  }, []);

  /* ── Boot ────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      try {
        await fetchOptions();
        await fetchLogs();
      } catch (err) {
        setError(
          err.response?.data?.error ||
          err.response?.data?.detail ||
          'No active inspection preset is assigned to this operator.',
        );
      }
    };
    void load();
  }, [fetchLogs, fetchOptions]);

  /* ── Canvas overlay ─────────────────────────────────────────── */
  const drawOverlay = useCallback((result) => {
    const canvas = overlayRef.current;
    const media  = frameRef.current || webcamRef.current?.video;
    if (!canvas || !media) return;

    const dW = media.clientWidth  || media.videoWidth  || media.naturalWidth  || 1;
    const dH = media.clientHeight || media.videoHeight || media.naturalHeight || 1;
    const sW = media.videoWidth   || media.naturalWidth  || dW;
    const sH = media.videoHeight  || media.naturalHeight || dH;

    canvas.width  = dW;
    canvas.height = dH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, dW, dH);

    const sRatio = sW / sH;
    const dRatio = dW / dH;
    const rW = dRatio > sRatio ? dH * sRatio : dW;
    const rH = dRatio > sRatio ? dH : dW / sRatio;
    const ox = (dW - rW) / 2;
    const oy = (dH - rH) / 2;
    const sx = rW / sW;
    const sy = rH / sH;

    (result?.detections || []).forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox || [];
      const stroke = det.label === 'SCRATCH' ? '#ef4444' : '#22c55e';
      const fill   = det.label === 'SCRATCH'
        ? 'rgba(239,68,68,.42)' : 'rgba(34,197,94,.18)';
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
        ctx.lineWidth   = 2.5;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        const l = ox + x1 * sx;
        const t = oy + y1 * sy;
        const w = (x2 - x1) * sx;
        const h = (y2 - y1) * sy;
        ctx.lineWidth   = 3;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(l, t, w, h);
        ctx.font      = "700 14px 'DM Sans', sans-serif";
        ctx.fillStyle = stroke;
        ctx.fillText(
          `${det.label || det.class_name || 'DETECTION'} ${(Number(det.confidence || 0) * 100).toFixed(1)}%`,
          l,
          Math.max(t - 8, 18),
        );
      }
    });
  }, []);

  const drawLogOverlay = useCallback((logId, detections = []) => {
    const image  = document.getElementById(`log-image-${logId}`);
    const canvas = document.getElementById(`log-overlay-${logId}`);
    if (!image || !canvas) return;

    const cW = image.clientWidth  || 1;
    const cH = image.clientHeight || 1;
    const sW = image.naturalWidth  || cW;
    const sH = image.naturalHeight || cH;
    canvas.width  = cW;
    canvas.height = cH;

    const ctx = canvas.getContext('2d');
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
      const isDefect = det.label === 'SCRATCH' || det.label === 'DEFECT';
      const stroke   = isDefect ? '#ef4444' : '#22c55e';
      const fill     = isDefect ? 'rgba(239,68,68,.35)' : 'rgba(34,197,94,.16)';
      const polygon  = det.mask?.polygon || [];

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
        ctx.lineWidth   = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        ctx.lineWidth   = 2;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(ox + x1 * sx, oy + y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
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

  useEffect(() => { drawOverlay(detectionResult); }, [drawOverlay, capturedFrame, detectionResult]);

  /* ── Auto-annotate ───────────────────────────────────────────── */
  const autoAnnotateDetection = useCallback((result) => {
    if (!result?.detections?.length) return 'No defects detected. Product appears intact.';
    const scratches = result.detections.filter((d) => d.label === 'SCRATCH' || d.label === 'DEFECT');
    const intact    = result.detections.filter((d) => d.label === 'INTACT'  || d.label === 'GOOD');
    const summary   = [];
    if (scratches.length) {
      const avg = (scratches.reduce((s, d) => s + (d.confidence || 0), 0) / scratches.length).toFixed(2);
      summary.push(`Found ${scratches.length} defect(s) with avg confidence ${avg}`);
    }
    if (intact.length) summary.push(`${intact.length} intact area(s) detected`);
    summary.push(`Latency: ${result.latency_ms || 0}ms | Cache: ${result.cache_hit ? 'HIT' : 'MISS'}`);
    return summary.join('. ');
  }, []);

  /* ── Detect ──────────────────────────────────────────────────── */
  const handleDetect = useCallback(async (trigger = 'manual') => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc || !preset?.product || !preset?.model || !preset?.config_hash) {
      setError('No active inspection preset is assigned to this operator.');
      return;
    }

    setLoading(true);
    setError('');
    captureInFlightRef.current = true;

    try {
      setCapturedFrame(imageSrc);
      const blob     = await fetch(imageSrc).then((r) => r.blob());
      const formData = new FormData();
      formData.append('image',           blob, `frame-${Date.now()}.png`);
      formData.append('component',       preset.product);
      formData.append('product_id',      preset.product);
      formData.append('model',           preset.model);
      formData.append('config_id',       preset.id);
      formData.append('config_version',  preset.config_version || 1);
      formData.append('config_hash',     preset.config_hash);
      formData.append('trigger',         trigger);
      formData.append('session_id',      sessionId || '');
      formData.append('session_active',  sessionStarted ? 'true' : 'false');

      const { data: result } = await detectImage(formData);
      setDetectionResult(result);
      setReviewMode('ACKNOWLEDGE');
      setReviewDescription(autoAnnotateDetection(result));
      setReviewFinalDecision(result.system_decision || 'PASS');
      setReviewRejectionReason('MISSED_DEFECT');
      reviewPendingRef.current = true;
      setReviewPending(true);
      setMotionStatus('Review required');
      setCountdownMs(null);
      await fetchLogs();
    } catch (err) {
      setError(err.response?.data?.error || 'Detection request failed.');
    } finally {
      setLoading(false);
      captureInFlightRef.current = false;
    }
  }, [autoAnnotateDetection, fetchLogs, preset, sessionId, sessionStarted]);

  /* ── Motion detection ────────────────────────────────────────── */
  useEffect(() => {
    const sampleMotion = () => {
      const video = webcamRef.current?.video;
      if (
        !video || video.readyState < 2 ||
        loading || captureInFlightRef.current ||
        reviewPending || !autoDetectEnabled || !preset
      ) return;

      const W = 96, H = 72;
      const canvas = motionCanvasRef.current
        || (motionCanvasRef.current = document.createElement('canvas'));
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, W, H);
      const frame = ctx.getImageData(0, 0, W, H).data;
      const prev  = previousFrameRef.current;
      previousFrameRef.current = new Uint8ClampedArray(frame);

      if (!prev) {
        stableSinceRef.current = null;
        setMotionStatus('Calibrating camera');
        return;
      }

      let diff = 0;
      for (let i = 0; i < frame.length; i += 4) {
        const cg = frame[i] * 0.299 + frame[i+1] * 0.587 + frame[i+2] * 0.114;
        const pg = prev[i]  * 0.299 + prev[i+1]  * 0.587 + prev[i+2]  * 0.114;
        diff += Math.abs(cg - pg);
      }

      const score = diff / (W * H);
      const now   = performance.now();

      if (score > MOTION_THRESHOLD) {
        stableSinceRef.current = null;
        setCountdownMs(null);
        setMotionStatus('Motion detected');
        return;
      }

      if (!stableSinceRef.current) stableSinceRef.current = now;

      const elapsed   = now - stableSinceRef.current;
      const remaining = Math.max(0, STABLE_CAPTURE_DELAY_MS - elapsed);
      setCountdownMs(remaining);
      setMotionStatus(remaining > 0 ? 'Stable frame countdown' : 'Capturing stable frame');

      if (remaining <= 0) {
        stableSinceRef.current = null;
        void handleDetect('auto_stable');
      }
    };

    const id = window.setInterval(sampleMotion, MOTION_SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoDetectEnabled, handleDetect, loading, preset, reviewPending]);

  /* ── Submit review ───────────────────────────────────────────── */
  const submitReview = async () => {
    const logId = detectionResult?.log_id || detectionResult?.id;
    if (!logId)                                  { setError('No inference log available for review.');  return; }
    if (!reviewDescription.trim())               { setError('Review description is required.');         return; }
    if (reviewMode === 'REJECT' && !reviewRejectionReason) { setError('Rejection reason is required.'); return; }

    setSubmittingReview(true);
    setError('');

    try {
      await reviewInferenceLog(logId, {
        action:           reviewMode,
        description:      reviewDescription.trim(),
        final_decision:   reviewFinalDecision,
        rejection_reason: reviewMode === 'REJECT' ? reviewRejectionReason : '',
      });

      reviewPendingRef.current  = false;
      setReviewPending(false);
      previousFrameRef.current  = null;
      stableSinceRef.current    = null;
      setDetectionResult(null);
      setCapturedFrame('');
      setReviewDescription('');
      setCountdownMs(null);
      setMotionStatus(autoDetectEnabled ? 'Waiting for stable frame' : 'Auto-detect paused');
      await fetchLogs();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  /* ── Derived ─────────────────────────────────────────────────── */
  const countdownSeconds = countdownMs === null ? '--' : String(Math.ceil(countdownMs / 1000));
  const displayedLogs    = sessionFilter
    ? logs.filter((l) => l.session_id === sessionFilter)
    : logs;

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="panel-page">
      <div className="panel-shell">

        {/* ── Header / nav ── */}
        <header className="panel-header--operator">
          <div className="panel-header__left">
            <div className="panel-header__intro">
              <h1>Live inspection workflow</h1>
            </div>
          </div>

          <div className="panel-header__right">
            <div className="panel-switcher" role="tablist" aria-label="Operator pages">
              <button
                className={`choice-button${activePanel === 'camera' ? ' choice-button--active' : ''}`}
                onClick={() => setActivePanel('camera')}
                type="button"
              >
                Camera Feed
              </button>
              <button
                className={`choice-button${activePanel === 'logs' ? ' choice-button--active' : ''}`}
                onClick={() => setActivePanel('logs')}
                type="button"
              >
                Detection Logs
              </button>
            </div>
            <button className="ghost-button" onClick={onLogout} type="button">
              Log out
            </button>
          </div>
        </header>

        {/* ════════════════════════════════════════════════
            CAMERA PANEL
        ════════════════════════════════════════════════ */}
        {activePanel === 'camera' && (
          <section className="content-grid--operator">

            {/* ── Left: camera card ── */}
            <div className="section-card section-card--camera">
              <div className="section-heading">
                <p className="eyebrow">Camera feed</p>
                <h2>Prepare the frame</h2>
              </div>

              {/* Webcam */}
              <div className="webcam-frame-wrap">
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/png"
                  audio={false}
                  autoPlay
                  playsInline
                  muted
                  className={capturedFrame ? 'webcam-frame webcam-frame--capture-source' : 'webcam-frame'}
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
                <canvas ref={overlayRef} className="webcam-overlay" aria-hidden="true" />
              </div>

              {/* Preset metadata chips */}
              <div className="preset-summary">
                <div>
                  <span>Product</span>
                  <strong>{preset?.product_name || preset?.component_name || 'Unassigned'}</strong>
                </div>
                <div>
                  <span>Model</span>
                  <strong>{preset?.model_name || 'Unassigned'}</strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>
                    {preset?.confidence_threshold !== undefined
                      ? Number(preset.confidence_threshold).toFixed(2)
                      : '—'}
                  </strong>
                </div>
              </div>

              {/* Error notice */}
              {error && <div className="notice notice--error">{error}</div>}

              {/* Auto-detect / controls bar */}
              <div className="auto-detect-panel">
                <div>
                  <span>Auto-detect</span>
                  <strong>{motionStatus}</strong>
                </div>

                <div className="countdown-badge">{countdownSeconds}s</div>

                <div className="session-info-pill">
                  <span className="session-label">Session</span>
                  <span className="session-value" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className={`session-dot ${sessionStarted ? 'session-dot--active' : ''}`} />
                    {sessionStarted ? sessionId : 'Stopped'}
                  </span>
                </div>

                <button className="ghost-button" onClick={toggleSession} type="button">
                  {sessionStarted ? 'Stop Session' : 'Start Session'}
                </button>

                <button
                  className="ghost-button"
                  onClick={() => {
                    const next = !autoDetectEnabled;
                    setAutoDetectEnabled(next);
                    stableSinceRef.current = null;
                    setCountdownMs(null);
                    setMotionStatus(next ? 'Waiting for stable frame' : 'Auto-detect paused');
                  }}
                  type="button"
                >
                  {autoDetectEnabled ? 'Pause' : 'Resume'}
                </button>

                <button
                  className="primary-button"
                  onClick={() => void handleDetect('manual')}
                  disabled={loading || reviewPending}
                  type="button"
                >
                  {loading ? 'Capturing…' : 'Capture & Detect'}
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
                <div className="result-card result-card--operator">
                  <div className="result-card__status">
                    {detectionResult.system_decision || detectionResult.error || 'Ready'}
                  </div>

                  <dl>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{((detectionResult.confidence || 0) * 100).toFixed(1)}%</dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>{detectionResult.latency_ms || 0} ms</dd>
                    </div>
                    <div>
                      <dt>Detections</dt>
                      <dd>{detectionResult.num_detections || 0}</dd>
                    </div>
                    <div>
                      <dt>Cache</dt>
                      <dd>{detectionResult.cache_hit ? 'Hit' : 'Miss'}</dd>
                    </div>
                  </dl>

                  <div className="detection-list">
                    {(detectionResult.detections || []).map((det, idx) => (
                      <div
                        key={`${det.class_id}-${idx}`}
                        className={`detection-row detection-row--${(det.label || 'unknown').toLowerCase()}`}
                      >
                        <strong>{det.label || det.class_name}</strong>
                        <span>{((det.confidence || 0) * 100).toFixed(1)}%</span>
                        <span>{det.mask?.polygon?.length ? 'Mask' : 'Box'}</span>
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
          </section>
        )}

        {/* ════════════════════════════════════════════════
            LOGS PANEL
        ════════════════════════════════════════════════ */}
        {activePanel === 'logs' && (
          <section className="section-card section-card--logs section-card--logs-page" style={{ margin: 16 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <p className="eyebrow">Detection logs</p>
              <h2>Recent inspections</h2>
            </div>

            {/* Filter row */}
            <div className="log-filter-row">
              <label>Filter by session</label>
              <select
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
              >
                <option value="">All sessions</option>
                {Array.from(new Set(logs.map((l) => l.session_id).filter(Boolean))).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button className="ghost-button" onClick={() => void fetchLogs()} type="button">
                Refresh
              </button>
            </div>

            {/* Log list */}
            <div className="log-list">
              {displayedLogs.length === 0 && (
                <div className="empty-state">No logs yet.</div>
              )}

              {displayedLogs.map((log) => (
                <div
                  key={log.id}
                  className={`log-item log-item--${(log.final_decision || log.system_decision || '').toLowerCase()}`}
                >
                  {/* Row header */}
                  <div
                    className="log-row"
                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>{log.id}</strong>
                      {' '}
                      {log.component_name || log.product_name || log.component}
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {new Date(log.timestamp || log.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {log.final_decision || log.system_decision || log.status}
                      </div>
                      {(log.confidence_score || log.confidence) ? (
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
                          {(Number(log.confidence_score || log.confidence || 0) * 100).toFixed(1)}%
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedLogId === log.id && (
                    <div className="log-expanded">
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

                        {/* Image + canvas overlay */}
                        <div style={{
                          flex: '0 0 300px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          overflow: 'hidden',
                          background: '#0d1117',
                        }}>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', padding: '8px 10px',
                            background: 'var(--surface2)',
                            borderBottom: '1px solid var(--border)',
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                              Inference image
                            </span>
                            <button
                              className="ghost-button"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              onClick={() => drawLogOverlay(log.id, log.detection_results?.detections || [])}
                              type="button"
                            >
                              Redraw
                            </button>
                          </div>
                          <div style={{ position: 'relative', height: 240 }}>
                            <img
                              id={`log-image-${log.id}`}
                              src={log.image_snapshot || log.image_snapshot_url || log.image_url}
                              alt="snapshot"
                              onLoad={() => drawLogOverlay(log.id, log.detection_results?.detections || [])}
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                            <canvas
                              id={`log-overlay-${log.id}`}
                              className="webcam-overlay"
                              aria-hidden="true"
                            />
                          </div>
                        </div>

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <h4>Detections</h4>
                          {(log.detection_results?.detections || []).map((det, idx) => (
                            <div
                              key={idx}
                              className={`detection-row detection-row--${(det.label || '').toLowerCase()}`}
                              style={{ marginBottom: 6 }}
                            >
                              <strong>{det.label || det.class_name}</strong>
                              <span>{((det.confidence || 0) * 100).toFixed(1)}%</span>
                              {det.bbox && (
                                <span style={{ fontSize: 11 }}>
                                  [{det.bbox.map((v) => Math.round(v)).join(', ')}]
                                </span>
                              )}
                              {det.mask?.polygon && (
                                <span style={{ fontSize: 11 }}>Mask: {det.mask.polygon.length}pts</span>
                              )}
                            </div>
                          ))}

                          <h4>Details</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span><strong>System decision:</strong> {log.system_decision || log.detection_results?.system_decision || '—'}</span>
                              <span><strong>Final decision:</strong>  {log.final_decision || '—'}</span>
                              <span><strong>Status:</strong>          {log.status || '—'}</span>
                              <span><strong>Confidence:</strong>      {
                                (log.confidence_score || log.detection_results?.confidence)
                                  ? `${(Number(log.confidence_score || log.detection_results?.confidence || 0) * 100).toFixed(1)}%`
                                  : '—'
                              }</span>
                              <span><strong>Latency:</strong>         {log.latency_ms || log.detection_results?.latency_ms ? `${log.latency_ms || log.detection_results?.latency_ms} ms` : '—'}</span>
                            </div>
                            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span><strong>Cache hit:</strong>       {String(log.detection_results?.cache_hit ?? log.cache_hit ?? false)}</span>
                              <span><strong>Image hash:</strong>      {log.detection_results?.image_hash || log.image_hash || '—'}</span>
                              <span><strong>Defect area:</strong>     {
                                (log.defect_area_percent ?? log.detection_results?.defect_area_percent) !== undefined
                                  ? `${log.defect_area_percent ?? log.detection_results?.defect_area_percent}%`
                                  : '—'
                              }</span>
                              <span><strong>Mask polygons:</strong>   {
                                log.segmentation_data?.mask_polygons?.length ??
                                log.detection_results?.mask_polygons?.length ?? 0
                              }</span>
                            </div>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <button
                              className="ghost-button"
                              style={{ fontSize: 12 }}
                              onClick={() => setRawOpenMap((m) => ({ ...m, [log.id]: !m[log.id] }))}
                              type="button"
                            >
                              {rawOpenMap[log.id] ? 'Hide raw JSON' : 'Show raw JSON'}
                            </button>
                          </div>
                          {rawOpenMap[log.id] && (
                            <pre>{JSON.stringify(log.detection_results || log, null, 2)}</pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════
            REVIEW MODAL
        ════════════════════════════════════════════════ */}
        {activePanel === 'camera' && detectionResult && (
          <div className="review-modal" role="dialog" aria-modal="true">
            <div className="review-modal__panel">
              <div className="section-heading">
                <p className="eyebrow">Operator review</p>
                <h2>Decision required</h2>
              </div>

              {/* Acknowledge / Reject toggle */}
              <div className="review-choice">
                <button
                  className={`choice-button${reviewMode === 'ACKNOWLEDGE' ? ' choice-button--active' : ''}`}
                  onClick={() => {
                    setReviewMode('ACKNOWLEDGE');
                    setReviewFinalDecision(detectionResult.system_decision || 'PASS');
                  }}
                  type="button"
                >
                  Acknowledge inference
                </button>
                <button
                  className={`choice-button${reviewMode === 'REJECT' ? ' choice-button--active' : ''}`}
                  onClick={() => setReviewMode('REJECT')}
                  type="button"
                >
                  Reject inference
                </button>
              </div>

              {/* Description */}
              <label className="field">
                <span>Description</span>
                <textarea
                  value={reviewDescription}
                  onChange={(e) => setReviewDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe what the operator observed."
                />
              </label>

              {/* Reject-specific fields */}
              {reviewMode === 'REJECT' && (
                <>
                  <label className="field">
                    <span>Reason for rejection</span>
                    <select
                      value={reviewRejectionReason}
                      onChange={(e) => setReviewRejectionReason(e.target.value)}
                    >
                      {REJECTION_REASONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Correct final decision</span>
                    <select
                      value={reviewFinalDecision}
                      onChange={(e) => setReviewFinalDecision(e.target.value)}
                    >
                      <option value="PASS">PASS</option>
                      <option value="FAIL">FAIL</option>
                    </select>
                  </label>
                </>
              )}

              {/* Error */}
              {error && <div className="notice notice--error">{error}</div>}

              {/* Submit */}
              <button
                className="primary-button"
                onClick={submitReview}
                disabled={submittingReview}
                type="button"
              >
                {submittingReview ? 'Saving review…' : 'Submit review'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default OperatorPanel;