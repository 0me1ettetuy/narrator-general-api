# Text-to-speech documentation

## Current implementation and operation

- [TTS model catalogue maintenance](tts-model-catalogue.md) — code-owned model
  definitions, env toggles, availability, adapters, and required checks.
- [Local TTS Docker toggles](local-tts-docker.md) — enabling Silero TTS, its
  env keys, voices, and the 600-character local segment size.
- [Local TTS models: removed, to be restored later](local-tts-models-removed.md)
  — only Silero TTS is enabled; Qwen3-TTS, Piper, Kokoro-82M and Chatterbox Turbo are
  removed or disabled. This is the full restoration record. [Why](../issues/local-tts-models-disabled.md).
- [Fish Audio notes](fish-audio.md) — current direct Fish model research and
  request notes.
- [Fish Audio to R2 streaming plan](fish-audio-r2-streaming-plan.md) — the
  implemented streamed-provider-output design and its rationale.

## Historical design record

- [TTS models and user-owned Fish Audio keys plan](tts-models-and-user-keys-plan.md)
  — original decision record and implementation status. Use the catalogue guide
  above for current maintenance instructions.

See the [feature catalogue](../features/README.md) for the user flow from model
selection through durable chapter audio generation.
