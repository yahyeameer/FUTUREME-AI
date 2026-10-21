"use client";

import * as React from "react";

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" };
/** Recordings are converted to 24 kHz mono WAV, which every voice engine accepts (Qwen and Fish Audio don't take WebM). */
const WAV_RATE = 24_000;

async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * WAV_RATE), WAV_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const pcm = (await offline.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
    text(0, "RIFF");
    out.setUint32(4, 36 + pcm.length * 2, true);
    text(8, "WAVEfmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 1, true);
    out.setUint32(24, WAV_RATE, true);
    out.setUint32(28, WAV_RATE * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    text(36, "data");
    out.setUint32(40, pcm.length * 2, true);
    pcm.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
    return new Blob([out.buffer], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}

export interface Recording {
  blob: Blob;
  url: string;
  seconds: number;
}

/** Records from the microphone with MediaRecorder. Each stop yields one recording. */
export function useRecorder() {
  const [state, setState] = React.useState<"idle" | "recording">("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const resolve = React.useRef<((r: Recording) => void) | null>(null);

  React.useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [state]);

  React.useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const start = React.useCallback(async (): Promise<Recording> => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const message = "This browser can't record audio.";
      setError(message);
      throw new Error(message);
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      const message = "Allow microphone access to record.";
      setError(message);
      throw new Error(message);
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<Recording>((res) => (resolve.current = res));
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.round((Date.now() - started) / 1000);
      // If the browser can't decode its own recording, it's sent as recorded.
      const blob = await toWav(new Blob(chunks, { type: rec.mimeType || "audio/webm" })).catch(() => new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      setState("idle");
      resolve.current?.({ blob, url: URL.createObjectURL(blob), seconds });
    };
    recorder.current = rec;
    setSeconds(0);
    rec.start();
    setState("recording");
    return done;
  }, []);

  const stop = React.useCallback(() => recorder.current?.state === "recording" && recorder.current.stop(), []);

  return { state, seconds, error, start, stop };
}

export function recordingFile(r: Recording, stem: string): File {
  const type = r.blob.type.split(";")[0] || "audio/webm";
  return new File([r.blob], `${stem}.${EXT[type] ?? "webm"}`, { type });
}
