/**
 * =============================================================================
 * wav.ts — PCM float samples -> 16-bit mono WAV (RIFF) encoder
 * =============================================================================
 *
 * The voice pipeline captures Float32 PCM from the mic and encodes it here
 * before shipping bytes over `voice:transcribe`. Output is deliberately
 * boring and universal:
 *
 *   - mono (channels mixed down), 16-bit signed little-endian PCM
 *   - 16 kHz sample rate (Whisper's native rate; avoids paying for 48 kHz)
 *   - standard 44-byte canonical RIFF/WAVE header
 *
 * Resampling is linear interpolation — perfectly adequate for speech and
 * dependency-free. The encoder is pure (no DOM APIs beyond `Blob`), so it can
 * be unit-checked headlessly with a small Node script.
 * =============================================================================
 */

/** Whisper's native input rate — we downsample to this before uploading. */
export const TARGET_SAMPLE_RATE = 16000;

/** Canonical PCM WAV header size in bytes. */
export const WAV_HEADER_BYTES = 44;

/**
 * Encode mono Float32 PCM (-1..1) as a 16-bit PCM WAV Blob.
 *
 * @param pcm       Mono samples, or an array of per-channel sample blocks.
 * @param sampleRate  Rate of `pcm`.
 * @param targetRate  Output rate (defaults to 16 kHz; `0` = keep source rate).
 */
export function encodeWav(
  pcm: Float32Array | Float32Array[],
  sampleRate: number,
  targetRate: number = TARGET_SAMPLE_RATE,
): Blob {
  const mono = Array.isArray(pcm) ? mixToMono(pcm) : pcm;
  const sourceRate = sampleRate > 0 ? sampleRate : targetRate;
  const outRate = targetRate > 0 ? targetRate : sourceRate;
  const samples = sourceRate === outRate ? mono : resampleLinear(mono, sourceRate, outRate);

  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true); // RIFF chunk size
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, outRate, true); // sample rate
  view.setUint32(28, outRate * 2, true); // byte rate (mono * 16-bit)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = samples[i] < -1 ? -1 : samples[i] > 1 ? 1 : samples[i];
    // Symmetric quantization; -32768 .. 32767.
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Average N channel blocks into a single mono Float32Array. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];

  const length = channels[0].length;
  const mono = new Float32Array(length);
  const weight = 1 / channels.length;
  for (let c = 0; c < channels.length; c += 1) {
    const channel = channels[c];
    for (let i = 0; i < length; i += 1) {
      mono[i] += (channel[i] ?? 0) * weight;
    }
  }
  return mono;
}

/** Linear-interpolation resample (fast, speech-grade quality). */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (input.length === 0 || fromRate <= 0 || toRate <= 0 || fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  const last = input.length - 1;

  for (let i = 0; i < outLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const index0 = index > last ? last : index;
    const index1 = index0 >= last ? last : index0 + 1;
    const fraction = position - index;
    out[i] = input[index0] + (input[index1] - input[index0]) * fraction;
  }
  return out;
}

/** Read a Blob/ArrayBuffer-backed Blob into uploadable bytes. */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
