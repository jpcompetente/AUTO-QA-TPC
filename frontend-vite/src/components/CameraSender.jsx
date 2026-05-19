import React, { useEffect, useRef, useState } from "react";

function buildWebSocketUrl(sessionId) {
  const origin = window.location.origin.replace(/^http/, "ws");
  return `${origin.replace(/^http/, "ws")}/ws/webrtc/${sessionId}/`;
}

export default function CameraSender({ sessionId: propSessionId }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [sessionId] = useState(() => propSessionId || new URLSearchParams(window.location.search).get("session") || Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    let mounted = true;

    async function start() {
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!mounted) return;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcRef.current = pc;

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.onicecandidate = (ev) => {
          if (ev.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "ice", from: "sender", data: ev.candidate }));
          }
        };

        const ws = new WebSocket(buildWebSocketUrl(sessionId));
        wsRef.current = ws;

        ws.onopen = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "offer", from: "sender", data: offer }));
            setStatus("offer_sent");
          } catch (err) {
            console.error(err);
            setStatus("error");
          }
        };

        ws.onmessage = async (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "answer") {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
              setStatus("connected");
            } else if (msg.type === "ice") {
              await pc.addIceCandidate(msg.data).catch(() => {});
            }
          } catch (err) {
            console.warn("ws message error", err);
          }
        };

        ws.onclose = () => setStatus((s) => (s === "connected" ? "disconnected" : s));
      } catch (err) {
        console.error(err);
        setStatus("permission_denied");
      }
    }

    start();

    return () => {
      mounted = false;
      try {
        pcRef.current?.close();
        wsRef.current?.close();
      } catch (e) {}
    };
  }, [sessionId]);

  return (
    <div className="camera-sender">
      <h3>Camera Sender</h3>
      <p>Session: <strong>{sessionId}</strong></p>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxWidth: 640 }} />
      <p>Status: {status}</p>
      <p>Open the receiver page with the same session id to view this camera.</p>
    </div>
  );
}
