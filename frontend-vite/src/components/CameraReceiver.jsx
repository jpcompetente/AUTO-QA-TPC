import { useEffect, useRef, useState } from "react";

function buildWebSocketUrl(sessionId) {
  const origin = window.location.origin.replace(/^http/, "ws");
  return `${origin.replace(/^http/, "ws")}/ws/webrtc/${sessionId}/`;
}

export default function CameraReceiver({ sessionId: propSessionId }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [sessionId] = useState(
    () =>
      propSessionId ||
      new URLSearchParams(window.location.search).get("session") ||
      Math.random().toString(36).slice(2, 10),
  );

  useEffect(() => {
    let mounted = true;

    async function start() {
      setStatus("starting");
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (!mounted) return;
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
            videoRef.current.play().catch(() => {});
          }
        };

        pc.onicecandidate = (ev) => {
          if (
            ev.candidate &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            wsRef.current.send(
              JSON.stringify({
                type: "ice",
                from: "receiver",
                data: ev.candidate,
              }),
            );
          }
        };

        const ws = new WebSocket(buildWebSocketUrl(sessionId));
        wsRef.current = ws;

        ws.onopen = () => setStatus("waiting_offer");
        ws.onmessage = async (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "offer") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(msg.data),
              );
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(
                JSON.stringify({
                  type: "answer",
                  from: "receiver",
                  data: answer,
                }),
              );
              setStatus("connected");
            } else if (msg.type === "ice") {
              await pc.addIceCandidate(msg.data).catch(() => {});
            }
          } catch (err) {
            console.warn("ws message error", err);
          }
        };
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    }

    start();

    return () => {
      mounted = false;
      try {
        pcRef.current?.close();
        wsRef.current?.close();
      } catch (err) {
        console.warn("cleanup error", err);
      }
    };
  }, [sessionId]);

  return (
    <div className="camera-receiver">
      <h3>Camera Receiver</h3>
      <p>
        Session: <strong>{sessionId}</strong>
      </p>
      <video
        id="remote"
        ref={videoRef}
        autoPlay
        playsInline
        controls
        style={{ width: "100%", maxWidth: 800 }}
      />
      <p>Status: {status}</p>
    </div>
  );
}
