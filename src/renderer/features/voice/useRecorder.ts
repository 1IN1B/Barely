/**
 * =============================================================================
 * useRecorder — push-to-talk microphone capture (renderer)
 * =============================================================================
 *
 * Pipeline: getUserMedia -> AudioContext (requested at 16 kHz so the WAV
 * encoder usually skips resampling) -> MediaStreamSource -> ScriptProcessor
 * -> zero-gain sink (a processor only runs while connected downstream).
 *
 * Chunks are copied Float32 blocks; `stop()` concatenates them into one mono
 * Float32Array and tears the whole graph down (mic indicator goes off).
 *
 * ScriptProcessor is technically deprecated, but ships in every Chromium
 * build, needs no separate worklet module, and is plenty for push-to-talk.
 * (AudioWorklet is the drop-in upgrade path later.)
 *
 * Permission failures (macOS TCC denial) are mapped to friendly messages
 * with a concrete fix hint — see `friendlyMicError`.
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mixToMono } from "./wav";

export type RecorderPhase = "idle" | "recording";

/** Normalized capture output handed to the WAV encoder. */
export interface RecorderResult {
  /** Mono PCM samples at `sampleRate`. */
  pcm: Float32Array;
  /** Context sample rate the samples were captured at. */
  sampleRate: number;
  /** Actual captured audio duration. */
  durationMs: number;
}

export interface UseRecorder {
  phase: RecorderPhase;
  /** User-facing mic error (permission, device busy, ...), if any. */
  error: string | null;
  /** True between `start()` and the graph being fully live. */
  starting: boolean;
  start(): Promise<void>;
  /** Returns `null` when nothing was recording. Safe to call repeatedly. */
  stop(): Promise<RecorderResult | null>;
  clearError(): void;
}

/** Chunk size at 16 kHz ≈ 256 ms of audio. */
const PROCESSOR_BUFFER = 4096;

export function useRecorder(): UseRecorder {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(16000);
  const framesRef = useRef<number>(0);
  const activeRef = useRef<boolean>(false);

  const teardown = useCallback(async (): Promise<void> => {
    activeRef.current = false;
    try {
      processorRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      sourceRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      sinkRef.current?.disconnect();
    } catch { /* already disconnected */ }
    processorRef.current = null;
    sourceRef.current = null;
    sinkRef.current = null;

    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;

    const context = contextRef.current;
    contextRef.current = null;
    if (context) {
      try {
        await context.close();
      } catch { /* context already closed */ }
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (activeRef.current || contextRef.current) return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture isn't available in this environment.");
      return;
    }

    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;

      // Prefer 16 kHz (Whisper's rate); fall back to hardware rate if the
      // engine rejects the constraint.
      let context: AudioContext;
      try {
        context = new AudioContext({ sampleRate: 16000 });
      } catch {
        context = new AudioContext();
      }
      contextRef.current = context;
      sampleRateRef.current = context.sampleRate;
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
      const sink = context.createGain();
      sink.gain.value = 0; // silent passthrough — we only need the callbacks

      chunksRef.current = [];
      framesRef.current = 0;
      processor.onaudioprocess = (event: AudioProcessingEvent): void => {
        if (!activeRef.current) return;
        const input = event.inputBuffer;
        const channels: Float32Array[] = [];
        for (let c = 0; c < input.numberOfChannels; c += 1) {
          // Copy: input buffers are reused between callbacks.
          channels.push(new Float32Array(input.getChannelData(c)));
        }
        const mono = mixToMono(channels);
        chunksRef.current.push(mono);
        framesRef.current += mono.length;
      };

      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);

      sourceRef.current = source;
      processorRef.current = processor;
      sinkRef.current = sink;
      activeRef.current = true;
      setPhase("recording");
    } catch (err) {
      await teardown();
      setError(friendlyMicError(err));
      setPhase("idle");
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      setStarting(false);
    }
  }, [teardown]);

  const stop = useCallback(async (): Promise<RecorderResult | null> => {
    const wasActive = activeRef.current;
    const context = contextRef.current;
    const chunks = chunksRef.current;
    const frames = framesRef.current;
    const sampleRate = sampleRateRef.current;

    await teardown();
    chunksRef.current = [];
    framesRef.current = 0;
    setPhase("idle");

    if (!wasActive || !context || frames === 0) return null;

    const pcm = concat(chunks, frames);
    return { pcm, sampleRate, durationMs: (frames / sampleRate) * 1000 };
  }, [teardown]);

  const clearError = useCallback((): void => setError(null), []);

  // Safety net: never leave the mic hot when the component unmounts.
  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  return { phase, error, starting, start, stop, clearError };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function concat(chunks: Float32Array[], totalFrames: number): Float32Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Turn getUserMedia failures into actionable, user-presentable text. */
export function friendlyMicError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return (
        "Microphone access denied. On macOS open System Settings → Privacy & " +
        "Security → Microphone and allow the app (or your terminal/IDE when " +
        "running in dev), then retry."
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone found — plug one in (or pick one in Sound settings) and retry.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your microphone is in use by another app — close it there and retry.";
    case "OverconstrainedError":
      return "No microphone matches the requested settings — retry after connecting one.";
    default:
      break;
  }
  if (err instanceof Error) {
    // Drop the ipcRenderer.invoke prefix if this came over the bridge.
    const message = err.message
      .replace(/^Error invoking remote method '[^']*':\s*/, "")
      .replace(/^[A-Za-z]*Error:\s*/, "")
      .trim();
    if (message) return message;
  }
  return "Couldn't start the microphone — please retry.";
}
