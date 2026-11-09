# Local TTS Docker toggles

Silero TTS (CPU) and Qwen3-TTS 0.6B (NVIDIA GPU), both Russian + English, are
the enabled local models. Piper, Kokoro-82M and Chatterbox Turbo are
removed or disabled; see [local-tts-models-removed.md](local-tts-models-removed.md).

## Enabling Silero TTS

1. In `.env`, set `TTS_LOCAL_SILERO_TTS_ENABLED="true"`. The other
   `TTS_LOCAL_SILERO_TTS_*` keys are in `.env.example`.
2. Run `docker compose up -d --build`. The `silero-tts` service builds from
   `docker/silero-tts`; the models (`ru` v5, `en` v3) are baked into the image.
3. `GET /tts/models` should list Silero TTS as available.

Notes:

- Voices the user can pick live in `LOCAL_TTS_MODEL_DEFINITIONS` (5 Russian, 5 English).
  Without a pick the engine default is used (ru `xenia`, en `en_0`), or
  `TTS_LOCAL_SILERO_TTS_VOICE` if set. The Silero server rejects unknown speakers.
- Silero cannot detect a language: books without Russian or English metadata fail
  with a clear error instead of being narrated with the wrong voice.
- Local models split chapters into 600-character segments (Fish uses 4,000).
- Not yet done: the base image tags and pip versions are pinned but the model
  files are fetched from `models.silero.ai` without a checksum. Check the Silero
  license (CC BY-NC vs MIT is unclear) before commercial use.

## Enabling Qwen3-TTS 0.6B

Needs an NVIDIA GPU with 4 GB or more (tested on a GTX 1050 Ti) and the NVIDIA
container toolkit.

1. In `.env`, set `TTS_LOCAL_QWEN3_TTS_ENABLED="true"` (other keys in
   `.env.example`).
2. Run `docker compose up -d --build`. The `qwen3-tts` service builds
   `docker/qwen3-tts` on the pinned `qwentts.cpp:cuda12` image; the quantized
   talker (0.6B CustomVoice Q8_0) and codec are baked in. A small proxy returns
   MP3, since the engine itself returns WAV.
3. `GET /tts/models` should list Qwen3-TTS 0.6B as available.

Notes:

- Measured on a 4 GB GTX 1050 Ti: real-time factor 0.6–0.75, about 3.96 GB VRAM
  at a 584-character Russian segment, so the 600-character local segment size
  fits. Nothing else should use the GPU.
- The 1.7B Q4_K_M model failed (GPU out of memory) above about 230 characters,
  so the 0.6B model is used. A GPU out-of-memory error can crash the engine;
  Compose restarts it (`restart: unless-stopped`).
- Speakers: ryan, aiden, vivian, serena (multilingual, listed for ru and en).
  Without a pick, `TTS_LOCAL_QWEN3_TTS_VOICE` or ryan is used. Other languages
  are rejected.
- Not yet done: the model files are downloaded from Hugging Face without a
  checksum, and Russian quality was only judged by ear on short samples.

- [Restoration record](local-tts-models-removed.md)
- [Why local models were disabled](../issues/local-tts-models-disabled.md)
