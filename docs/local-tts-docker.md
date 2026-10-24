# Local TTS Docker profiles

Narrator provides opt-in Docker Compose profiles for four local TTS engines.
They are disabled by default: no image or model weights download until the
deployment owner enables a profile.

> Current scope: these profiles power the Models API's local availability list.
> The local synthesis adapters are the next implementation step, so a model
> cannot generate chapter audio through Narrator yet.

## Available profiles

| Narrator model ID | Compose profile | Published local URL | Hardware | Notes |
| --- | --- | --- | --- | --- |
| `local.piper.en-us-amy` | `tts-piper` | `http://localhost:9500` | CPU | Piper voice weights download on first use. |
| `local.kokoro-82m` | `tts-kokoro` | `http://localhost:7860` | CPU by default | Kokoro cache persists across restarts. |
| `local.qwen3-tts-0.6b` | `tts-qwen3-gpu` | `http://localhost:8001` | NVIDIA GPU | Uses the Qwen 0.6B Base checkpoint. |
| `local.chatterbox-turbo` | `tts-chatterbox-gpu` | `http://localhost:8000` | NVIDIA GPU | Uses the 350M English Turbo variant. |

The services bind to `127.0.0.1`, not every network interface. They are meant
to be called by the Narrator backend on the same host, never directly by a
browser or public internet client.

## Enable one model

In `.env`, add its profile to `COMPOSE_PROFILES` and set its matching backend
catalogue flag to `true`.

Example for Piper:

```dotenv
COMPOSE_PROFILES="tts-piper"
TTS_LOCAL_PIPER_EN_US_AMY_ENABLED="true"
```

Example for a GPU host with Qwen:

```dotenv
COMPOSE_PROFILES="tts-qwen3-gpu"
TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED="true"
```

Then start Docker as usual:

```bash
docker compose up -d
```

The backend calls each configured health URL. A service returns:

- `READY` when it answers its documented readiness endpoint;
- `UNAVAILABLE` when it is enabled but not reachable or still loading;
- `DISABLED` when its `*_ENABLED` value is false.

Run only the model(s) you need. Starting both GPU profiles on a small GPU can
exhaust VRAM.

## First-run behaviour

Each profile uses persistent Docker volumes. The first boot may download model
weights; later restarts reuse the cache.

- Piper downloads a voice when that voice is first requested.
- Kokoro downloads/cache its model data in `narrator_kokoro_tts_data`.
- Qwen caches Hugging Face weights in `narrator_qwen3_tts_huggingface_cache`.
- Chatterbox caches model data in `narrator_chatterbox_tts_cache`.

The Qwen and Chatterbox profiles require an NVIDIA driver and NVIDIA Container
Toolkit configured for Docker. They are intentionally separate profiles so a
CPU-only host does not try to start them.

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

## Backend in a container

The sample health URLs use `localhost` because development currently runs the
Nest backend on the host. If the Nest API is later added to Compose, replace
them with Docker service URLs, such as `http://piper-tts:5000/v1/audio/models`.
Do not rely on Docker to guess the correct address.
