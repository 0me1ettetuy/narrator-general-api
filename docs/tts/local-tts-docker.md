# Local TTS Docker toggles

Narrator provides opt-in Docker Compose services for four local TTS engines.
Each model has one `TTS_LOCAL_*_ENABLED` flag. It is the single switch: when
`true`, Compose starts that container and the backend may offer that model;
when `false`, Compose skips it and the backend reports it as disabled. All are
off by default, so no image or model weights download until the deployment
owner explicitly enables a model.

Each local service has a synthesis adapter in the worker. Once it is `READY`, a user
can select it when queuing chapter audio. The worker keeps that selected model
on the audio record and checks its health again immediately before generation.

## Available profiles

| Narrator model ID | Toggle | Published local URL | Hardware | Notes |
| --- | --- | --- | --- | --- |
| `local.piper.en-us-amy` | `TTS_LOCAL_PIPER_EN_US_AMY_ENABLED` | `http://localhost:9500` | CPU | Piper voice weights download on first use. |
| `local.kokoro-82m` | `TTS_LOCAL_KOKORO_82M_ENABLED` | `http://localhost:7860` | CPU by default | Kokoro cache persists across restarts. |
| `local.qwen3-tts-0.6b` | `TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED` | `http://localhost:8001` | NVIDIA GPU | Uses the Qwen 0.6B Base checkpoint. |
| `local.chatterbox-turbo` | `TTS_LOCAL_CHATTERBOX_TURBO_ENABLED` | `http://localhost:8000` | NVIDIA GPU | Uses the 350M English Turbo variant. |

The services bind to `127.0.0.1`, not every network interface. They are meant
to be called by the Narrator backend on the same host, never directly by a
browser or public internet client.

## Enable one model

`COMPOSE_PROFILES` must include `true` once. It already does in the supplied
`.env` and `.env.example`; keep `minio,true` when using MinIO. Compose maps an
enabled model to its active `true` profile and a disabled model to an inactive
`false` profile. Therefore you only change the individual model flag.

Example for Piper:

```dotenv
TTS_LOCAL_PIPER_EN_US_AMY_ENABLED="true"
```

Example for a GPU host with Qwen:

```dotenv
TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED="true"
```

Then start Docker as usual:

```bash
docker compose up -d --remove-orphans
```

Use the same command after changing a toggle. `--remove-orphans` also stops a
container that was previously enabled and has now been disabled. Restart the
API and worker afterwards: they read the local-model catalogue from `.env` at
process startup.

The backend calls each configured health URL. A service returns:

- `READY` when it answers its documented readiness endpoint;
- `UNAVAILABLE` when it is enabled but not reachable or still loading;
- `DISABLED` when its `*_ENABLED` value is false.

## Queue audio with a local model

First call authenticated `GET /tts/models`. Only a model with
`status: "READY"` and `selectable: true` can be used.

Pass its `id` to the existing chapter-audio command:

```http
POST /books/:bookId/chapters/:chapterId/audio
Content-Type: application/json

{ "modelId": "local.kokoro-82m" }
```

The response and the book-detail chapter audio expose that choice as
`audio.modelId`. To prevent an accidental mixed-model file, reusing an
existing audio record with a different model returns `409`; delete that audio
first, then queue it again with the desired model.

Omit the body to keep the existing Fish Audio behavior. Fish configuration is
now read only when Fish is selected, so a local-only worker does not require a
Fish API key.

Run only the model(s) you need. Starting both GPU profiles on a small GPU can
exhaust VRAM.

## First-run behaviour

Each profile uses persistent Docker volumes. The first boot may download model
weights; later restarts reuse the cache.

- Piper downloads a voice when that voice is first requested.
- Kokoro downloads/cache its model data in `narrator_kokoro_tts_data`.
- Qwen caches Hugging Face weights in `narrator_qwen3_tts_huggingface_cache`.
- Chatterbox caches model data in `narrator_chatterbox_tts_cache`.

The Qwen and Chatterbox services require an NVIDIA driver and NVIDIA Container
Toolkit configured for Docker. Leave their flags `false` on a CPU-only host.

## Image versions

The image variables in `.env.example` have usable defaults, for example
`TTS_LOCAL_KOKORO_IMAGE`. Override each with a pinned image tag or digest before
a production deployment. The engines use maintained open-source HTTP wrappers
around the underlying models because the model projects do not all provide the
same container API.

Source projects/wrappers:

- [KokoroTTS](https://github.com/hangry-labs/kokoroTTS)
- [Qwen3-TTS server](https://github.com/malaiwah/qwen3-tts-server)
- [Chatterbox Open TTS](https://github.com/OpenTTSGroup/chatterbox-open-tts)
- [Piper OpenAI TTS server](https://github.com/Kamil-Krawiec/piper-tts-http-server)

All four wrappers accept the OpenAI-style `POST /v1/audio/speech` request used
by Narrator. They return a normal MP3 response; the backend streams that
response directly to temporary object storage rather than buffering it all in
memory. See their wrapper documentation for provider-specific voices and
language limitations.

For Qwen only, Narrator passes the book language to its `language` field. The
parser prefers declared EPUB BCP 47 metadata and falls back to chapter-text
detection when that metadata is empty. Values such as `ru-RU` and `en` are
translated to Qwen names such as `Russian` and `English`; unknown or absent
language uses Qwen's `Auto` mode. Piper, Kokoro, and Chatterbox do not receive
this Qwen-only field.

Piper selects a voice from the EPUB language: `en*` (or missing metadata) uses
the configured default (the supplied default is male `en_US-hfc_male-medium`);
`ru*` uses the default male
`ru_RU-denis-medium`. Piper downloads a requested voice into its persistent
Docker volume on first use. Kokoro's bundled model uses the default male
`am_michael` for English; it intentionally rejects Russian because Kokoro-82M
has no built-in Russian voice.

The Piper and Kokoro compatibility wrappers finish synthesis before they begin
their HTTP response. That keeps Narrator's worker memory bounded, but it is not
live inference streaming inside those model containers. Kokoro's native
`/tts/stream` endpoint is a future provider-specific optimisation if lower
time-to-first-audio becomes important.

## Backend in a container

The sample health URLs use `localhost` because development currently runs the
Nest backend on the host. If the Nest API is later added to Compose, replace
them with Docker service URLs, such as `http://piper-tts:5000/v1/audio/models`.
Do not rely on Docker to guess the correct address.
