import { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W } from '../../../shared/constants.js';
import { GestureMachine, canvasBox } from './gestures.js';

const WASM_PATH = '/mediapipe/wasm';
const LOCAL_MODEL = '/mediapipe/hand_landmarker.task';
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FINGERTIPS = [4, 8, 12, 16, 20];

const NO_HAND = { state: 'none', x: null, y: null, palm: null };

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

async function resolveModel() {
  try {
    const res = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && !type.includes('html')) return LOCAL_MODEL;
  } catch {
    // Fall through to the hosted copy.
  }
  return REMOTE_MODEL;
}

async function createLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  const [vision, modelAssetPath] = await Promise.all([FilesetResolver.forVisionTasks(WASM_PATH), resolveModel()]);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await HandLandmarker.createFromOptions(vision, options('GPU'));
  } catch {
    return HandLandmarker.createFromOptions(vision, options('CPU'));
  }
}

function describeCameraError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Camera access is blocked. Allow the camera in your browser\'s site settings, then try again.';
  }
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
    return 'No camera found. Plug one in, then try again.';
  }
  if (err?.name === 'NotReadableError') {
    return 'Another app is using the camera. Close it, then try again.';
  }
  return `Hand tracking could not start: ${err?.message ?? 'unknown error'}`;
}

function drawSkeleton(canvas, landmarks, state, box, markPalm) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!box) return;

  // The part of the frame that maps onto the canvas, so the edge of it is visible.
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.strokeRect(
    ((1 - box.w) / 2) * canvas.width,
    ((1 - box.h) / 2) * canvas.height,
    box.w * canvas.width,
    box.h * canvas.height,
  );
  ctx.setLineDash([]);
  if (!landmarks) return;

  const px = (p) => [p.x * canvas.width, p.y * canvas.height];
  const dot = (x, y, radius, fill) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(...px(landmarks[a]));
    ctx.lineTo(...px(landmarks[b]));
  }
  ctx.stroke();

  landmarks.forEach((point, i) => {
    if (i === 8) dot(...px(point), 12, state === 'draw' ? '#FF4FA3' : '#3DE8B0');
    else dot(...px(point), FINGERTIPS.includes(i) ? 8 : 5, '#fff');
  });
  if (markPalm) {
    const palm = [0, 5, 9, 17].map((i) => landmarks[i]);
    const x = palm.reduce((sum, p) => sum + p.x, 0) / palm.length;
    const y = palm.reduce((sum, p) => sum + p.y, 0) / palm.length;
    dot(x * canvas.width, y * canvas.height, 12, '#FF4FA3');
  }
}

/**
 * Owns the camera stream and the MediaPipe landmarker. `onFrame` fires once per
 * video frame through a ref, so tracking never causes a React render; only
 * gesture changes and the once-a-second fps figure touch state.
 *
 * status: 'off' | 'starting' | 'loading' | 'live' | 'error'
 */
export function useHandTracking(onFrame) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const sessionRef = useRef(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const machineRef = useRef(null);
  machineRef.current ??= new GestureMachine({ canvasAspect: CANVAS_W / CANVAS_H });

  const [status, setStatus] = useState('off');
  const [error, setError] = useState(null);
  const [gesture, setGesture] = useState('none');
  const [fps, setFps] = useState(0);
  const markPalm = useRef(false);

  const publish = useCallback((frame) => {
    onFrameRef.current?.(frame);
    setGesture(frame.state);
  }, []);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    session.alive = false;
    session.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    session.landmarker?.close();
    if (videoRef.current) videoRef.current.srcObject = null;
    if (overlayRef.current) drawSkeleton(overlayRef.current, null);
    machineRef.current.reset();
    publish(NO_HAND);
    setFps(0);
    setStatus('off');
  }, [publish]);

  const fail = useCallback((message) => {
    stop();
    setError(message);
    setStatus('error');
  }, [stop]);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    const session = { alive: true, stream: null, landmarker: null };
    sessionRef.current = session;
    setError(null);
    setStatus('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      fail('This page needs HTTPS or localhost before the browser will share a camera.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      session.stream = stream;
      if (!session.alive) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getVideoTracks()[0].onended = () => fail('The camera disconnected. Reconnect it, then try again.');

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setStatus('loading');

      const landmarker = await createLandmarker();
      if (!session.alive) {
        landmarker.close();
        return;
      }
      session.landmarker = landmarker;

      const machine = machineRef.current;
      machine.videoAspect = video.videoWidth / video.videoHeight || 4 / 3;
      const overlay = overlayRef.current;
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      const box = canvasBox(machine.videoAspect, CANVAS_W / CANVAS_H);
      setStatus('live');

      let lastVideoTime = -1;
      let frames = 0;
      let fpsSince = performance.now();
      // requestAnimationFrame rather than requestVideoFrameCallback: the latter can
      // stop firing while the preview is hidden, and the time check skips repeats anyway.
      const tick = () => {
        if (!session.alive) return;
        try {
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const now = performance.now();
            const result = landmarker.detectForVideo(video, now);
            const landmarks = result.landmarks[0];
            const frame = machine.update({ landmarks, world: result.worldLandmarks[0], t: now });
            publish(frame);
            drawSkeleton(overlay, landmarks, frame.state, box, markPalm.current);

            frames += 1;
            if (now - fpsSince >= 1000) {
              setFps(Math.round((frames * 1000) / (now - fpsSince)));
              frames = 0;
              fpsSince = now;
            }
          }
        } catch (err) {
          fail(describeCameraError(err));
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (err) {
      if (session.alive) fail(describeCameraError(err));
    }
  }, [fail, publish]);

  useEffect(() => stop, [stop]);

  // Video frames stop arriving in a hidden tab, which would leave the pen stuck down.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && sessionRef.current) {
        machineRef.current.reset();
        publish(NO_HAND);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [publish]);

  return { videoRef, overlayRef, markPalm, status, error, gesture, fps, start, stop };
}
