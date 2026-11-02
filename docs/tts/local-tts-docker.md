# Local TTS Docker toggles (disabled)

Local TTS (Piper, Kokoro-82M, Qwen3-TTS, Chatterbox Turbo) is currently
disabled. Fish Audio is the only active provider.

- [Full restoration record](local-tts-models-removed.md) — exactly what was
  commented out, renamed, or deleted, and how to bring each piece back,
  including the Docker Compose service definitions and `.env.example` block
  this document used to describe.
- [Why it was disabled](../issues/local-tts-models-disabled.md)

The operating instructions this document previously held (enabling a model,
hardware requirements, image pinning, voice-selection behavior per engine)
are preserved in this file's git history and remain accurate once local
models are restored; they are not repeated here to avoid documenting
behavior that does not currently exist.
