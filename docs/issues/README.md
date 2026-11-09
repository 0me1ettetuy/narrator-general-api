# Deferred backend issues

- [Direct EPUB upload lifecycle](direct-upload-lifecycle.md) — cleanup,
  cancellation, and lifecycle cases intentionally deferred after the direct
  browser-to-storage upload flow.
- [Local TTS models: temporarily disabled](local-tts-models-disabled.md) —
  Piper, Kokoro, Qwen3-TTS, and Chatterbox were commented out/removed; Silero TTS and Qwen3-TTS 0.6B (ru/en) are the enabled local models beside Fish Audio;
  full restoration record included.
- [Fish free model turning paid](fish-free-model-turns-paid.md) — the free
  Fish model has no credit check, so a switch to paid pricing is not detected
  ahead of time.
- [GPU TTS models: load only the model in use](gpu-model-on-demand-loading.md) —
  start a GPU model's container only while it is needed, so several GPU models
  can be enabled on one small card.
- [Chapter images: follow-ups](chapter-image-follow-ups.md) — small parsing,
  storage and test gaps left after the chapter-image feature, plus the pending
  migration ref.

Issues describe known follow-up work, not supported product behavior. Move an
issue to its owning domain documentation once it is fully implemented.
