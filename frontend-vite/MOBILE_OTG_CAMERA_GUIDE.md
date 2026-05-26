# Mobile Camera Guide

This guide explains how to use a mobile or tablet camera with the inspection app without third-party apps.

## Supported setup

Without third-party apps, the supported way to use a mobile or tablet as the camera is to open the inspection app directly on that device in a browser.

That means:

- The app runs on the same phone or tablet that provides the camera.
- The browser requests the built-in camera with `getUserMedia`.
- The app prefers the rear camera on handheld devices.

For the installable camera mode, open the app with `/?mode=camera` and then use the browser's Add to Home Screen or Install App action.

## What OTG does not change

USB OTG by itself does not turn a phone into a desktop webcam in the browser.

If the app is running on a computer, the browser will not treat a phone that is merely plugged in over OTG as a camera source unless extra software or drivers are installed. Since this guide excludes third-party apps, that desktop webcam path is out of scope.

## Recommended setup

### Use the phone or tablet directly

This is the simplest option.

1. Open the app in a modern browser on the mobile or tablet device.
2. Use HTTPS or localhost so camera access is allowed by the browser.
3. Open the Operator panel and allow camera permissions.
4. The app will prefer the rear camera on handheld devices.

This is best when the camera and the inspection UI should stay on the same device.

## Browser requirements

Camera access requires a secure context.

- Use `https://` or `localhost`.
- Do not use plain `http://` on a LAN address.
- For local development, keep the Vite HTTPS setup enabled so the browser allows camera access.

## How to use it in the app

1. Log in and open the Operator panel.
2. If you are using the phone as the camera device, open `/?mode=camera`.
3. Allow camera permission when prompted.
4. Position the device so the subject is centered and well lit.
5. Trigger capture or let motion detection run.

If the device is a phone or tablet, the app will try to use the rear camera first.

## Troubleshooting

### The browser does not show the camera

- Make sure the app is open directly on the mobile or tablet device.
- Confirm the browser has camera permission.
- Close any other app that may already be using the camera.
- Refresh the page after granting permission.

### Camera permission is blocked

- Use HTTPS or localhost.
- Grant camera permission in the browser.
- On mobile, check the browser site permissions if you denied access earlier.

### The wrong lens opens on mobile

- The app prefers the rear camera on handheld devices.
- If the browser still opens the front camera, use the browser's camera picker if available.
- Some devices and browsers ignore the preferred lens; reconnecting or refreshing can help.

### The image is unstable or blurry

- Use a stand or fixture to hold the phone steady.
- Increase lighting.
- Clean the lens.
- Avoid auto-focus hunting by keeping the subject at a consistent distance.

## Practical recommendation

For inspection work, the most reliable setup is usually:

- Mobile or tablet used directly in the browser with the app running on the same device

That keeps the camera source simple and avoids extra software, drivers, or streaming layers.

## Using a phone as a camera for a desktop (browser relay)

If you need the phone camera to appear inside a desktop browser tab of the inspection app, you can use the built-in WebRTC relay (no third-party mobile apps required). This works by running a small signaling WebSocket on the server and opening two web pages:

- Phone (sender): opens the app in sender mode and shares its camera via WebRTC.
- Desktop (receiver): opens the app in receiver mode and displays the phone camera stream in a video element.

How to use:

1. On the desktop, open the receiver page using `/?mode=relay-receiver&session=<id>` (pick any short id or let the UI generate one). You can display a QR code of the full URL.
2. On the phone, open the sender page using `/?mode=relay-sender&session=<id>` (scan the QR code).
3. The phone will ask for camera permission and create an SDP offer; the desktop will answer and the remote video will play.

Notes:

- Both pages must be able to reach the server WebSocket endpoint (`/ws/webrtc/<session>/`). Use `wss://` in production.
- For cross-network connections you may need a TURN server; add it to the app's ICE servers if connectivity fails.
- The relay only handles signaling; media flows peer-to-peer between devices.

If you'd like, I can add a QR generator and a small UI to make session pairing easier.
