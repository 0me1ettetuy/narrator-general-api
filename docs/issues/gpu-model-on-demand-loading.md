# GPU TTS models: load only the model in use

## Status

Deferred. Not implemented; the design below was discussed, not built.

## Problem

Every enabled local model runs as a container that stays loaded. Qwen3-TTS holds
about 2.9 GB of GPU memory idle and 3.96 GB while generating, on a 4 GB card, so
a second GPU model cannot be enabled next to it. Today only one GPU model can be
enabled at a time (`TTS_LOCAL_*_ENABLED`).

## Idea

Keep every enabled model listed on the Models page, but run only the one in use.
The container for each enabled model is created but stopped, and started on
demand. `ENABLED=false` still means no container is created and the model is not
listed. Silero (CPU) can stay always on.

## Decisions still open

- **Trigger.** Start on job start in the worker (recommended: the local queue
  already runs one chapter at a time, so jobs for different models take turns,
  and two users picking different GPU models cannot conflict) versus start when a
  user selects the model on the Models page (breaks with two users, needs loading
  states and blocking a switch during generation).
- **Docker access.** A small manager sidecar that holds the Docker socket and can
  only start or stop an allow-listed set of container names (recommended)
  versus mounting `docker.sock` into the worker, which gives it root on the host.
- **Compose.** `docker compose up` starts every enabled service, so these
  services need `restart: "no"` plus a stop step, or must be created without
  starting.
- **Cold start.** Qwen takes about a minute to load; the worker must wait for the
  health check before the first segment, and the idle timeout must allow it.

## Out of scope

- Unloading models inside a running container; the engine does not support it.
- Sharing one GPU between models at the same time.

See [TTS model catalogue](../tts/tts-model-catalogue.md) and
[local TTS Docker setup](../tts/local-tts-docker.md).
