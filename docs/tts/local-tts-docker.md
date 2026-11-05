# Local TTS Docker toggles

Qwen3-TTS 0.6B is restored. Piper, Kokoro-82M and Chatterbox Turbo are still disabled.

## Enabling Qwen3-TTS

1. The Docker host needs an NVIDIA GPU, the NVIDIA driver, and `nvidia-container-toolkit` (`sudo nvidia-ctk runtime configure --runtime=docker`, then restart Docker). Check with `docker run --rm --gpus all ubuntu nvidia-smi`.
2. In `.env`, set `TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED="true"`. Other `TTS_LOCAL_QWEN3_*` keys are in `.env.example`.
3. Run `docker compose up -d --build`. Weights download on first start into the `narrator_qwen3_tts_huggingface_cache` volume.
4. `GET /tts/models` should list Qwen3-TTS as available.

Not yet done: the image is not digest-pinned, and 4 GB VRAM has not been tested. See the GPU spike in `docs/superpowers/plans/2026-11-05-local-qwen3-tts.md`.

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
