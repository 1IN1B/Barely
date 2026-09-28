/**
 * Public surface of the Voice feature.
 *
 * Other features should import from HERE (never from VoiceTab internals):
 *   - `<SpeakButton text={...} />` for 🔊 read-aloud on any bubble
 *   - `publishTranscript(text)` / `VOICE_TRANSCRIPT_EVENT` for voice -> chat
 *
 * VoiceTab itself stays the default route through App.tsx.
 */

export { default as SpeakButton } from "./SpeakButton";
export { default as VoiceTab } from "./VoiceTab";
export { default as MiniSelect, type MiniSelectOption } from "./MiniSelect";
export {
  publishTranscript,
  VOICE_TRANSCRIPT_EVENT,
  type VoiceTranscriptDetail,
} from "./publishTranscript";
export { encodeWav, blobToBytes, TARGET_SAMPLE_RATE } from "./wav";
