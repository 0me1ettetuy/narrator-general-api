# Local TTS Docker toggles

Silero TTS (Russian + English) is the only enabled local model. It runs on CPU,
so no GPU is needed. Qwen3-TTS, Piper, Kokoro-82M and Chatterbox Turbo are
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

- [Restoration record](local-tts-models-removed.md)
- [Why local models were disabled](../issues/local-tts-models-disabled.md)
