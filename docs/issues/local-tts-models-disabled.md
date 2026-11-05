# Local TTS models: temporarily disabled

## Status

Update: Qwen3-TTS 0.6B has been restored (see [docs/tts/local-tts-docker.md](docs/tts/local-tts-docker.md)). Piper, Kokoro-82M and Chatterbox Turbo remain disabled, and the rest of this record still describes them.

Deferred. Local TTS (Piper, Kokoro-82M, Qwen3-TTS, Chatterbox Turbo) was fully
implemented and working — adapters, health checks, Docker services, and a
frontend model/voice picker — but is now disabled so the product can focus on
Fish Audio only.

## Why

Product decision to narrow TTS to one provider (Fish Audio) for now rather
than maintain four local-engine Docker images, their GPU requirements, and
their UI surface alongside it.

## What this means today

- `GET /tts/models` lists Qwen3-TTS only when `TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED` is true and its health check passes.
- Requesting a Piper, Kokoro-82M or Chatterbox `modelId` returns `404 TTS_MODEL_NOT_FOUND`.
- No Docker container starts for Piper, Kokoro-82M or Chatterbox, even if `.env` sets their `TTS_LOCAL_*_ENABLED`.
- The frontend shows Qwen3-TTS on the Models page; `TtsSelector` shows a local model as a disabled label.

## Full restoration record

[`docs/tts/local-tts-models-removed.md`](../tts/local-tts-models-removed.md)
has the complete list of what was commented, renamed, or deleted — including
the full previous `.env.example` block and both Compose files' local-TTS
service definitions — plus restore steps.

Frontend side: see `narrator-fe/docs/issues/local-tts-models-disabled.md`.

## Out of scope for this entry

- Changing which provider(s) the product supports long-term. This is a
  reversible, documented rollback, not a decision to drop local TTS forever.
