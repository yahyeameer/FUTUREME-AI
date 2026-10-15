"use client";

import * as React from "react";

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a" };

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
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      setState("idle");
      resolve.current?.({ blob, url: URL.createObjectURL(blob), seconds: Math.round((Date.now() - started) / 1000) });
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
