import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ManualReviewDrawing Component
 *
 * A canvas-based drawing tool for operators to manually annotate missed defects
 * on captured inspection images. Allows drawing bounding boxes and polygons,
 * tracking annotations, and submitting them for retraining.
 *
 * Props:
 *   - imageUrl: string - URL of the captured image to draw on
 *   - onSubmit: (annotations) => Promise - Callback when submitting annotations
 *   - onCancel: () => void - Callback when canceling
 *   - isSubmitting: boolean - Disable controls while submitting
 */
function ManualReviewDrawing({ imageUrl, onSubmit, onCancel, isSubmitting = false }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const wrapperRef = useRef(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState("box"); // "box" or "polygon"
  const [currentPath, setCurrentPath] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [completedPaths, setCompletedPaths] = useState([]);
  const [strokeColor, setStrokeColor] = useState("#FF0000"); // Bright red by default
  const [strokeWidth, setStrokeWidth] = useState(2);

  // Scale tracking
  const [scale, setScale] = useState({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });

  /**
   * Initialize canvas size to match the image display size
   */
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !image || !wrapper) return;

    // Get display dimensions
    const displayWidth = wrapper.offsetWidth;
    const displayHeight = wrapper.offsetHeight;

    // Set canvas to match display size
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Get source image dimensions
    const sourceWidth = image.naturalWidth || image.width || displayWidth;
    const sourceHeight = image.naturalHeight || image.height || displayHeight;

    // Calculate scaling to fit image in display
    const sourceRatio = sourceWidth / sourceHeight;
    const displayRatio = displayWidth / displayHeight;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (displayRatio > sourceRatio) {
      // Image is taller; fit to height
      renderedHeight = displayHeight;
      renderedWidth = displayHeight * sourceRatio;
    } else {
      // Image is wider; fit to width
      renderedWidth = displayWidth;
      renderedHeight = displayWidth / sourceRatio;
    }

    offsetX = (displayWidth - renderedWidth) / 2;
    offsetY = (displayHeight - renderedHeight) / 2;

    const scaleX = renderedWidth / sourceWidth;
    const scaleY = renderedHeight / sourceHeight;

    setScale({ scaleX, scaleY, offsetX, offsetY });
  }, []);

  useEffect(() => {
    initializeCanvas();
    const handleResize = () => initializeCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initializeCanvas]);

  /**
   * Helper to draw a path on canvas
   */
  const drawPathOnCanvas = useCallback(
    (ctx, points, color, width, isClosed) => {
      if (points.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // For box mode: draw rectangle if exactly 2 points
      if (drawMode === "box" && points.length === 2 && isClosed) {
        const [x1, y1] = points[0];
        const [x2, y2] = points[1];
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        return;
      }

      // For polygon mode: draw continuous line
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point[0], point[1]);
        } else {
          ctx.lineTo(point[0], point[1]);
        }
      });

      if (isClosed && points.length > 2) {
        ctx.closePath();
      }

      ctx.stroke();
    },
    [drawMode],
  );

  /**
   * Redraw canvas with image and all annotations
   */
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;

    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    ctx.drawImage(
      image,
      scale.offsetX,
      scale.offsetY,
      image.naturalWidth * scale.scaleX,
      image.naturalHeight * scale.scaleY
    );

    // Draw completed annotations
    completedPaths.forEach((path) => {
      drawPathOnCanvas(ctx, path.points, path.color, path.width, path.isClosed);
    });

    // Draw current path being drawn
    if (currentPath.length > 0) {
      drawPathOnCanvas(ctx, currentPath, strokeColor, strokeWidth, false);
    }
  }, [scale, completedPaths, currentPath, strokeColor, strokeWidth, drawPathOnCanvas]);

  /**
   * Convert mouse coordinates to canvas-relative coordinates
   */
  const getCanvasCoordinates = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      return [x, y];
    },
    []
  );

  /**
   * Handle mouse down - start drawing
   */
  const handleMouseDown = useCallback(
    (e) => {
      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      setIsDrawing(true);
      setCurrentPath([coords]);
    },
    [getCanvasCoordinates]
  );

  /**
   * Handle mouse move - continue drawing
   */
  const handleMouseMove = useCallback(
    (e) => {
      if (!isDrawing) return;

      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      // For box mode: only track two points
      if (drawMode === "box") {
        setCurrentPath([currentPath[0], coords]);
      } else {
        // For polygon mode: accumulate points
        setCurrentPath((prev) => [...prev, coords]);
      }
    },
    [isDrawing, drawMode, currentPath, getCanvasCoordinates]
  );

  /**
   * Handle mouse up - finish current stroke
   */
  const handleMouseUp = useCallback(() => {
    if (!isDrawing || currentPath.length === 0) {
      setIsDrawing(false);
      return;
    }

    setIsDrawing(false);

    // For box mode: save rectangle with two points
    if (drawMode === "box" && currentPath.length === 2) {
      const newPath = {
        points: currentPath,
        color: strokeColor,
        width: strokeWidth,
        isClosed: true,
        type: "box",
        id: Date.now(),
      };
      setCompletedPaths((prev) => [...prev, newPath]);
      setAnnotations((prev) => [...prev, newPath]);
      setCurrentPath([]);
    }
    // For polygon mode: save polygon when user releases
    else if (drawMode === "polygon" && currentPath.length > 2) {
      const newPath = {
        points: currentPath,
        color: strokeColor,
        width: strokeWidth,
        isClosed: false,
        type: "polygon",
        id: Date.now(),
      };
      setCompletedPaths((prev) => [...prev, newPath]);
      setAnnotations((prev) => [...prev, newPath]);
      setCurrentPath([]);
    }
  }, [isDrawing, currentPath, drawMode, strokeColor, strokeWidth]);

  /**
   * Handle double-click to close polygon
   */
  const handleDoubleClick = useCallback(() => {
    if (drawMode === "polygon" && currentPath.length > 2) {
      const newPath = {
        points: currentPath,
        color: strokeColor,
        width: strokeWidth,
        isClosed: true,
        type: "polygon",
        id: Date.now(),
      };
      setCompletedPaths((prev) => [...prev, newPath]);
      setAnnotations((prev) => [...prev, newPath]);
      setCurrentPath([]);
      setIsDrawing(false);
    }
  }, [drawMode, currentPath, strokeColor, strokeWidth]);

  /**
   * Redraw whenever state changes
   */
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  /**
   * Clear all annotations
   */
  const handleClearAll = useCallback(() => {
    setAnnotations([]);
    setCompletedPaths([]);
    setCurrentPath([]);
    setIsDrawing(false);
  }, []);

  /**
   * Undo last annotation
   */
  const handleUndo = useCallback(() => {
    if (completedPaths.length > 0) {
      const newPaths = completedPaths.slice(0, -1);
      setCompletedPaths(newPaths);
      setAnnotations(newPaths);
    } else if (currentPath.length > 0) {
      setCurrentPath([]);
      setIsDrawing(false);
    }
  }, [completedPaths, currentPath]);

  /**
   * Submit annotations
   */
  const handleSubmit = useCallback(async () => {
    if (annotations.length === 0) {
      alert("Please draw at least one annotation before submitting.");
      return;
    }

    // Convert annotations to JSON format for API
    const payloadAnnotations = annotations.map((ann) => ({
      type: ann.type,
      coordinates: ann.points,
      color: ann.color,
      strokeWidth: ann.width,
      timestamp: new Date().toISOString(),
    }));

    const payload = {
      annotated_defects: payloadAnnotations,
      annotation_count: payloadAnnotations.length,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
    };

    try {
      await onSubmit(payload);
    } catch (error) {
      console.error("Error submitting annotations:", error);
      alert("Failed to submit annotations. Please try again.");
    }
  }, [annotations, imageUrl, onSubmit]);

  return (
    <div className="manual-review-drawing">
      {/* Drawing Canvas Container */}
      <div
        ref={wrapperRef}
        className="drawing-wrapper"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          backgroundColor: "#f5f5f5",
          borderRadius: "6px",
          overflow: "hidden",
          border: "2px solid #ddd",
          marginBottom: "16px",
        }}
      >
        {/* Hidden image for dimensions and background */}
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Annotation reference"
          style={{
            display: "none",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
          onLoad={() => {
            initializeCanvas();
            redrawCanvas();
          }}
        />

        {/* Canvas overlay for drawing */}
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            cursor: "crosshair",
          }}
        />
      </div>

      {/* Annotation Counter */}
      <div
        style={{
          fontSize: "12px",
          color: "#666",
          marginBottom: "12px",
          textAlign: "right",
        }}
      >
        {annotations.length > 0
          ? `${annotations.length} annotation${annotations.length !== 1 ? "s" : ""}`
          : "No annotations yet"}
      </div>

      {/* Drawing Controls */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Draw Mode Toggle */}
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className={`control-button ${drawMode === "box" ? "control-button--active" : ""}`}
            onClick={() => setDrawMode("box")}
            type="button"
            title="Draw bounding boxes"
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: "4px",
              border: `1px solid ${drawMode === "box" ? "#0066cc" : "#ccc"}`,
              backgroundColor: drawMode === "box" ? "#e6f2ff" : "transparent",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            □ Box
          </button>
          <button
            className={`control-button ${drawMode === "polygon" ? "control-button--active" : ""}`}
            onClick={() => setDrawMode("polygon")}
            type="button"
            title="Draw polygons (double-click to close)"
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: "4px",
              border: `1px solid ${drawMode === "polygon" ? "#0066cc" : "#ccc"}`,
              backgroundColor: drawMode === "polygon" ? "#e6f2ff" : "transparent",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            ◆ Polygon
          </button>
        </div>

        {/* Color Picker */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label htmlFor="stroke-color" style={{ fontSize: "12px" }}>
            Color:
          </label>
          <input
            id="stroke-color"
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            style={{
              width: "40px",
              height: "32px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Stroke Width */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label htmlFor="stroke-width" style={{ fontSize: "12px" }}>
            Width:
          </label>
          <input
            id="stroke-width"
            type="range"
            min="1"
            max="8"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            style={{ width: "60px" }}
          />
          <span style={{ fontSize: "12px", minWidth: "20px" }}>{strokeWidth}px</span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
          <button
            className="ghost-button"
            onClick={handleUndo}
            disabled={completedPaths.length === 0 && currentPath.length === 0}
            type="button"
            title="Undo last annotation"
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              cursor:
                completedPaths.length === 0 && currentPath.length === 0
                  ? "not-allowed"
                  : "pointer",
              opacity:
                completedPaths.length === 0 && currentPath.length === 0 ? 0.5 : 1,
            }}
          >
            ↶ Undo
          </button>
          <button
            className="ghost-button"
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            type="button"
            title="Clear all annotations"
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              cursor: annotations.length === 0 ? "not-allowed" : "pointer",
              opacity: annotations.length === 0 ? 0.5 : 1,
            }}
          >
            🗑 Clear
          </button>
        </div>
      </div>

      {/* Info Text */}
      <div
        style={{
          fontSize: "12px",
          color: "#999",
          marginBottom: "16px",
          fontStyle: "italic",
        }}
      >
        {drawMode === "box"
          ? "Click and drag to draw a bounding box. Release to finish."
          : "Click to draw polygon points. Double-click the last point or double-click to close."}
      </div>

      {/* Submit/Cancel Buttons */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          className="primary-button"
          onClick={handleSubmit}
          disabled={isSubmitting || annotations.length === 0}
          type="button"
          style={{ flex: 1 }}
        >
          {isSubmitting ? "Submitting..." : "Flag for Retraining"}
        </button>
        <button
          className="ghost-button"
          onClick={onCancel}
          disabled={isSubmitting}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ManualReviewDrawing;
