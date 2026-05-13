// Utility helpers for camera permission and access

// Requests camera permission and returns an object with result.
// Returns: { granted: boolean, stream?: MediaStream, error?: Error }
export async function requestCameraPermission(constraints = { video: true }) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return { granted: false, error: new Error('Media devices not supported') };
  }

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      granted: false,
      error: new Error(
        'Camera access requires a secure context. Use HTTPS or localhost; LAN HTTP is blocked by the browser.',
      ),
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { granted: true, stream };
  } catch (err) {
    return { granted: false, error: err };
  }
}

// Checks camera permission state when Permissions API is available.
// Returns one of: 'granted', 'denied', 'prompt', or 'unknown'.
export async function checkCameraPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';

  try {
    // Some browsers expose 'camera' name, others use 'camera' via 'camera' or 'video' may not be standard.
    // The most supported permission name for cameras is 'camera' in modern browsers; fallback to 'microphone' is not suitable.
    const status = await navigator.permissions.query({ name: 'camera' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    // Fallback: try feature detection - no reliable state
    return 'unknown';
  }
}

// Convenience function: prompt the user and automatically stop tracks if denied
export async function ensureCameraPermission(options = { constraints: { video: true } }) {
  const { constraints } = options;
  const check = await checkCameraPermission();
  if (check === 'granted') return { granted: true };

  const result = await requestCameraPermission(constraints);
  if (result.granted && result.stream) {
    // Immediately stop tracks if caller didn't want the stream persisted.
    // Caller can keep the stream by taking result.stream and not stopping it.
    // Here we return the stream and let caller decide.
    return { granted: true, stream: result.stream };
  }

  return { granted: false, error: result.error };
}
