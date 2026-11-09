# Local TTS models: removed, to be restored later

## Status

Update 2026-11-09: Qwen3-TTS 0.6B came back as a quantized GGUF model on
`qwentts.cpp` (see [local-tts-docker.md](local-tts-docker.md)); the old
unquantized adapter and image described below are still removed.

Update 2026-11-08: Qwen3-TTS was removed again and replaced by Silero TTS
(Russian + English, CPU only; see [local-tts-docker.md](local-tts-docker.md)).
Why Qwen went: the stock image's torch (cu128) has no kernels for Pascal
(sm_61) GPUs; a rebuilt cu126 image ran on a GTX 1050 Ti, but the 1.7B model
(3.87 GiB) ran out of memory on 4 GB, the 0.6B model needs its own speaker
embeddings (the image's built-in voices are 1.7B-only), and on CPU a single
segment took longer than the 300 s idle timeout. Restoring it needs a GPU with
about 8 GB, Turing or newer. The adapter, spec, Compose service and env keys are
deleted; recover them from git history (`src/tts/adapters/qwen3-tts.adapter.ts`
before this change). Piper, Kokoro-82M and Chatterbox Turbo remain disabled,
and the rest of this record still describes them.

Deferred. Local TTS support (Piper, Kokoro-82M, Qwen3-TTS, Chatterbox Turbo)
was fully built and working, but is now disabled so the product can focus on
Fish Audio only. This document is the complete restoration record: everything
needed to bring local models back lives here or is commented in place in the
source files it names.

See also: [issue record](../issues/local-tts-models-disabled.md).

## What changed and where

### Commented in place (uncomment to restore)

- `src/tts-models/tts-model-registry.service.ts` — `LOCAL_TTS_MODEL_DEFINITIONS`
  is now `[]`; the four original entries (Piper, Kokoro, Qwen3-TTS,
  Chatterbox) are preserved in a comment directly above it.
- `src/tts/tts-adapter-resolver.service.ts` — the local-adapter map and its
  four constructor-injected adapters are commented out; `toResolvedAdapter`
  now throws for any non-Fish model. The original local-model branch is
  preserved in a comment.
- `src/tts/tts.module.ts` — the four adapter imports and their
  providers/exports are commented out.
- `src/tts/adapters/piper-tts.adapter.ts`
- `src/tts/adapters/kokoro-tts.adapter.ts`
- `src/tts/adapters/qwen3-tts.adapter.ts`
- `src/tts/adapters/chatterbox-tts.adapter.ts`
- `src/tts/adapters/openai-compatible-local-tts.adapter.ts` — shared base
  class for the four adapters above, used by nothing else.

  Each of these five adapter files has its entire body wrapped in a single
  `/* ... */` block comment (imports included) so the file still parses as
  valid, empty TypeScript. Nothing else imports them, so leaving them
  commented rather than deleted costs nothing at build time.

### Renamed so Jest skips them (restore by removing the `.disabled-test` suffix)

Jest only runs files matching `*.spec.ts` (`testRegex` in `package.json`).
These three had passing coverage for the now-commented adapters and were
renamed so `pnpm test` does not fail on "no tests found" in an emptied file:

- `src/tts/adapters/kokoro-tts.adapter.spec.ts` →
  `src/tts/adapters/kokoro-tts.adapter.spec.ts.disabled-test`
- `src/tts/adapters/qwen3-tts.adapter.spec.ts` →
  `src/tts/adapters/qwen3-tts.adapter.spec.ts.disabled-test`
- `src/tts/adapters/openai-compatible-local-tts.adapter.spec.ts` →
  `src/tts/adapters/openai-compatible-local-tts.adapter.spec.ts.disabled-test`

Restoring a file is: uncomment its `.ts` body, rename the matching spec back
to `.spec.ts`, uncomment its registration in `tts.module.ts` and
`tts-adapter-resolver.service.ts`, uncomment its registry entry, then run
`pnpm test` and `pnpm build`.

### Removed outright (full content preserved below)

- `compose.yaml` — the `piper-tts`, `kokoro-tts`, `qwen3-tts`, and
  `chatterbox-tts` services, their four named volumes, and the
  `TTS_LOCAL_*_HEALTH_URL` / `TTS_LOCAL_*_URL` lines in the shared
  `application-environment` anchor.
- `compose.dev.yaml` — the four `extends:`-based service stanzas and their
  four named volumes.
- `.env.example` — the entire "Local text-to-speech model catalogue" block
  (health-check timeout/cache TTL, idle timeout, and all four
  `TTS_LOCAL_*` groups).

If your own `.env` still has these `TTS_LOCAL_*` keys, they are now unused by
the application — the registry no longer reads them — but harmless to leave
or remove.

## Restoring: full previous `.env.example` block

```dotenv
# Local text-to-speech model catalogue
# A model only becomes available when enabled and its service health URL returns
# a successful response. Docker profiles start optional local model containers;
# these flags tell the API which model services it may offer to users.
#
# `COMPOSE_PROFILES` must include `true` (it already does in the cloud example
# above). Then each individual `*_ENABLED` flag controls both its Docker
# service and its backend catalogue entry. All are false by default, so no
# local model image or weights download unless the deployment owner enables it.
TTS_MODEL_HEALTH_CHECK_TIMEOUT_MS="2000"
TTS_MODEL_HEALTH_CACHE_TTL_MS="15000"
# How long a local provider may remain silent while its MP3 response streams.
TTS_LOCAL_TTS_IDLE_TIMEOUT_MS="300000"

# Piper — CPU-only, voice files download on first use and are cached in Docker.
TTS_LOCAL_PIPER_EN_US_AMY_ENABLED="false"
TTS_LOCAL_PIPER_EN_US_AMY_HEALTH_URL="http://localhost:9500/v1/audio/models"
TTS_LOCAL_PIPER_EN_US_AMY_URL="http://localhost:9500"
TTS_LOCAL_PIPER_EN_US_AMY_VOICE="en_US-hfc_male-medium"
TTS_LOCAL_PIPER_IMAGE="kamilkrawiec/piper-openai-tts:latest"
TTS_LOCAL_PIPER_PUBLISHED_PORT="9500"

# Kokoro-82M — runs on CPU by default; enable a GPU override later if needed.
TTS_LOCAL_KOKORO_82M_ENABLED="false"
TTS_LOCAL_KOKORO_82M_HEALTH_URL="http://localhost:7860/health/ready"
TTS_LOCAL_KOKORO_82M_URL="http://localhost:7860"
TTS_LOCAL_KOKORO_82M_VOICE="am_michael"
TTS_LOCAL_KOKORO_IMAGE="hangrylabs/kokorotts:latest"
TTS_LOCAL_KOKORO_PUBLISHED_PORT="7860"

# Qwen3-TTS 0.6B — GPU profile. A CUDA-capable Docker host is required.
TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED="false"
TTS_LOCAL_QWEN3_TTS_0_6B_HEALTH_URL="http://localhost:8001/health"
TTS_LOCAL_QWEN3_TTS_0_6B_URL="http://localhost:8001"
TTS_LOCAL_QWEN3_TTS_0_6B_VOICE="ryan"
TTS_LOCAL_QWEN3_TTS_0_6B_IMAGE="ghcr.io/malaiwah/qwen3-tts-server:latest"
TTS_LOCAL_QWEN3_TTS_0_6B_PUBLISHED_PORT="8001"

# Chatterbox Turbo — GPU profile. A CUDA-capable Docker host is required.
TTS_LOCAL_CHATTERBOX_TURBO_ENABLED="false"
TTS_LOCAL_CHATTERBOX_TURBO_HEALTH_URL="http://localhost:8000/healthz"
TTS_LOCAL_CHATTERBOX_TURBO_URL="http://localhost:8000"
TTS_LOCAL_CHATTERBOX_TURBO_VOICE="default"
TTS_LOCAL_CHATTERBOX_TURBO_IMAGE="ghcr.io/openttsgroup/chatterbox-open-tts:latest"
TTS_LOCAL_CHATTERBOX_TURBO_PUBLISHED_PORT="8000"
```

## Restoring: full previous `compose.yaml` content

Add back to the `application-environment` anchor (used by `migrate`, `api`,
and `worker`):

```yaml
TTS_LOCAL_PIPER_EN_US_AMY_HEALTH_URL: http://piper-tts:5000/v1/audio/models
TTS_LOCAL_PIPER_EN_US_AMY_URL: http://piper-tts:5000
TTS_LOCAL_KOKORO_82M_HEALTH_URL: http://kokoro-tts:7860/health/ready
TTS_LOCAL_KOKORO_82M_URL: http://kokoro-tts:7860
TTS_LOCAL_QWEN3_TTS_0_6B_HEALTH_URL: http://qwen3-tts:8001/health
TTS_LOCAL_QWEN3_TTS_0_6B_URL: http://qwen3-tts:8001
TTS_LOCAL_CHATTERBOX_TURBO_HEALTH_URL: http://chatterbox-tts:8000/healthz
TTS_LOCAL_CHATTERBOX_TURBO_URL: http://chatterbox-tts:8000
```

Add back as top-level services (after `worker`, before `volumes:`):

```yaml
piper-tts:
  image: ${TTS_LOCAL_PIPER_IMAGE:-kamilkrawiec/piper-openai-tts:latest}
  container_name: narrator-piper-tts
  profiles: ['${TTS_LOCAL_PIPER_EN_US_AMY_ENABLED:-false}']
  restart: unless-stopped
  environment:
    PORT: '5000'
    DATA_DIR: /data
  ports:
    - '127.0.0.1:${TTS_LOCAL_PIPER_PUBLISHED_PORT:-9500}:5000'
  volumes:
    - narrator_piper_tts_data:/data

kokoro-tts:
  image: ${TTS_LOCAL_KOKORO_IMAGE:-hangrylabs/kokorotts:latest}
  container_name: narrator-kokoro-tts
  profiles: ['${TTS_LOCAL_KOKORO_82M_ENABLED:-false}']
  restart: unless-stopped
  ports:
    - '127.0.0.1:${TTS_LOCAL_KOKORO_PUBLISHED_PORT:-7860}:7860'
  volumes:
    - narrator_kokoro_tts_data:/app/persistent

qwen3-tts:
  image: ${TTS_LOCAL_QWEN3_TTS_0_6B_IMAGE:-ghcr.io/malaiwah/qwen3-tts-server:latest}
  container_name: narrator-qwen3-tts
  profiles: ['${TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED:-false}']
  restart: unless-stopped
  environment:
    QWEN3_TTS_MODEL_ID: Qwen/Qwen3-TTS-12Hz-0.6B-Base
    QWEN3_TTS_VOICES_DIR: /data/voices
    HF_HOME: /root/.cache/huggingface
  ports:
    - '127.0.0.1:${TTS_LOCAL_QWEN3_TTS_0_6B_PUBLISHED_PORT:-8001}:8001'
  volumes:
    - narrator_qwen3_tts_data:/data
    - narrator_qwen3_tts_huggingface_cache:/root/.cache/huggingface
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]

chatterbox-tts:
  image: ${TTS_LOCAL_CHATTERBOX_TURBO_IMAGE:-ghcr.io/openttsgroup/chatterbox-open-tts:latest}
  container_name: narrator-chatterbox-tts
  profiles: ['${TTS_LOCAL_CHATTERBOX_TURBO_ENABLED:-false}']
  restart: unless-stopped
  environment:
    CHATTERBOX_VARIANT: turbo
    CHATTERBOX_DEVICE: cuda
    CHATTERBOX_DEFAULT_LANGUAGE: en
    MAX_CONCURRENCY: '1'
    VOICES_DIR: /voices
  ports:
    - '127.0.0.1:${TTS_LOCAL_CHATTERBOX_TURBO_PUBLISHED_PORT:-8000}:8000'
  volumes:
    - narrator_chatterbox_tts_cache:/root/.cache
    - narrator_chatterbox_tts_voices:/voices
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

Add back these named volumes:

```yaml
narrator_piper_tts_data:
narrator_kokoro_tts_data:
narrator_qwen3_tts_data:
narrator_qwen3_tts_huggingface_cache:
narrator_chatterbox_tts_cache:
narrator_chatterbox_tts_voices:
```

## Restoring: full previous `compose.dev.yaml` content

Add back as services (the pattern each already-present service like `db`
follows):

```yaml
piper-tts:
  extends:
    file: compose.yaml
    service: piper-tts

kokoro-tts:
  extends:
    file: compose.yaml
    service: kokoro-tts

qwen3-tts:
  extends:
    file: compose.yaml
    service: qwen3-tts

chatterbox-tts:
  extends:
    file: compose.yaml
    service: chatterbox-tts
```

Add back these named volumes:

```yaml
narrator_piper_tts_data:
narrator_kokoro_tts_data:
narrator_qwen3_tts_data:
narrator_qwen3_tts_huggingface_cache:
narrator_chatterbox_tts_cache:
narrator_chatterbox_tts_voices:
```

## Also still true after restoring

- `src/tts-models/tts-model-availability.service.ts` was never changed — it is
  generic local-model health-check logic with no per-model knowledge, so it
  needs no restoration step.
- `docs/tts/local-tts-docker.md` (the original operating guide: toggles,
  hardware requirements, voice-selection behavior, image pinning) was not
  deleted, only pointed here while disabled. Its content is still accurate
  once local models are restored.
- If your deployment has a local-TTS container still running (for example
  `narrator-piper-tts`), stop and remove it manually; the Compose file no
  longer manages it:

  ```bash
  docker stop narrator-piper-tts narrator-kokoro-tts narrator-qwen3-tts narrator-chatterbox-tts
  docker rm narrator-piper-tts narrator-kokoro-tts narrator-qwen3-tts narrator-chatterbox-tts
  ```
