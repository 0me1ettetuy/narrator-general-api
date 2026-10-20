# OpenRouter TTS notes

Last verified: 2026-10-20.

> Historical reference only. Narrator now uses Fish Audio directly for TTS;
> see [Fish Audio notes](./fish-audio.md). Keep `OPENROUTER_API_KEY` for
> planned non-TTS use only.

## Decision for the first Narrator TTS integration

The **worker**, not the browser and not an HTTP controller, calls OpenRouter.
It reads a chapter's text, asks OpenRouter for audio, uploads the returned
bytes to private R2 storage, then creates/updates the `Audio` record and the
job status in Postgres.

```text
TTS worker -> OpenRouter -> raw MP3 bytes -> R2 -> Audio row/job status
```

Keep `OPENROUTER_API_KEY` only in the API/worker environment. Never return,
log, put it in OpenAPI, or expose it to the frontend. The later user-owned key
plan is recorded in the repository-level `BOOK_PIPELINE_PLAN.md`.

The current adapter reads `VOICE_ID` for the selected Fish voice, plus optional
`OPENROUTER_TTS_MODEL` and `OPENROUTER_TTS_TIMEOUT_MS` overrides. These are
server/worker-only values too.

## Current model choice for evaluation

The current OpenRouter speech-model catalogue identifies the free model as:

```text
fish-audio/s2.1-pro-free:free
```

At the time checked, its catalogue price is `0` and it is described as suited
to testing, prototyping, and low-volume applications, without production
latency or availability guarantees. This is an evaluation default, **not** a
production promise. Re-check the model catalogue and pricing before each
deployment/release.

The OpenRouter model slug is deliberately different from Fish Audio's direct
API model header (`s2.1-pro-free`). Do not interchange them.

## Request contract

| Item | Value |
| --- | --- |
| Method and URL | `POST https://openrouter.ai/api/v1/audio/speech` |
| Authentication | `Authorization: Bearer $OPENROUTER_API_KEY` |
| Request encoding | JSON |
| Required body fields | `model`, `input` |
| Storage/playback format | `response_format: "mp3"` |
| Success body | Raw audio bytes, not JSON |
| Expected MP3 type | `audio/mpeg` |
| Trace header | `X-Generation-Id` |

Minimal intended payload shape:

```json
{
  "model": "fish-audio/s2.1-pro-free:free",
  "input": "A short chapter segment.",
  "response_format": "mp3"
}
```

`voice` is provider-specific. OpenRouter says an omitted voice works only when
the selected provider has a default; otherwise it returns a validation error.
The current catalogue entry has no listed `supported_voices`, so do a tiny
manual probe before implementing the worker and record the accepted voice
behavior. Do **not** send Fish's direct-API `reference_id` to OpenRouter.

Useful optional fields:

- `instructions` — Fish Audio supports delivery directions such as pacing or
  emotion. OpenRouter prepends them to the text it sends upstream.
- `input_references` — OpenRouter's route for stateless voice cloning. This is
  a later, consent-sensitive feature; do not add it to the first chapter TTS
  flow.
- `input` may be an array for multi-speaker synthesis. A normal book chapter
  should start as one string.

Fish also understands inline directions in square brackets, for example
`[whispering] Nobody answered.`. Do not inject style instructions into a
user's book text in the initial version.

## Worker implementation rules

1. Claim a queued TTS job and mark its chapter/audio state as processing.
2. Split very long chapter text into bounded, sentence-aware segments. The
   OpenRouter TTS guide recommends smaller segments for reliability and faster
   first audio; choose and test our own limit instead of assuming a hidden
   provider limit.
3. For each segment, use a timeout and a retry policy appropriate for the job
   queue. A retry must not create a second `Audio` row or overwrite a finished
   R2 object accidentally.
4. Check `response.ok` **before** reading/saving bytes. Error responses are
   JSON, not audio.
5. For a successful MP3 response, verify `Content-Type` is `audio/mpeg`, keep
   the `X-Generation-Id` only as safe provider trace metadata, and upload the
   bytes to a private R2 key.
6. Only after the final audio object exists, transactionally mark the audio/job
   completed. On final failure, persist a safe error code/message and mark it
   failed.

MP3 is the right initial choice because OpenRouter documents it as compressed
and suitable for storage/playback. PCM is for a future low-latency streaming
pipeline, not stored audiobook chapters.

## Pre-implementation probe

Before writing the adapter, make one short server-side test with a non-secret
test sentence and verify all of the following:

- the model slug is still returned by
  `GET /api/v1/models?output_modalities=speech`;
- the selected voice/default behavior succeeds;
- response status is 2xx, type is `audio/mpeg`, and bytes play as MP3;
- a deliberate invalid request returns a JSON error and is not uploaded;
- provider latency/failure behavior is acceptable for the queue's retry and
  concurrency settings.

Do not send book text, user keys, or user voice references in this probe.

## Official sources

- [OpenRouter Text-to-Speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- [OpenRouter speech-model discovery API](https://openrouter.ai/api/v1/models?output_modalities=speech)
- [OpenRouter model catalogue](https://openrouter.ai/models)

