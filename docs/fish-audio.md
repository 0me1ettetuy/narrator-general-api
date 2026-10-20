# Fish Audio S2.1 Pro Free notes

Last verified: 2026-10-20.

## What we are using now

Narrator calls **Fish Audio directly** from its background worker with the
server-owned `FISH_AUDIO_API_KEY`. The browser never receives this key.

The worker reads Fish's chunked MP3 response as it arrives and forwards it to
a multipart R2 upload. It permits a five-minute period with no response/audio
bytes, resetting that timer whenever Fish sends audio. This supports long
segments without the old fixed 60-second whole-request limit or a complete
segment MP3 held in worker memory.

Fish and OpenRouter have different contracts:

| Concern | OpenRouter route used by Narrator | Direct Fish API |
| --- | --- | --- |
| URL | `https://openrouter.ai/api/v1/audio/speech` | `https://api.fish.audio/v1/tts` |
| Credential | OpenRouter API key | Fish API key |
| Free model ID | `fish-audio/s2.1-pro-free:free` in JSON `model` | `s2.1-pro-free` in the `model` header |
| Text field | `input` | `text` |
| Output-format field | `response_format` | `format` |
| Saved-voice field | provider-specific `voice` | `reference_id` |

The direct Fish adapter uses the right-hand column. Do not mix the fields.

## S2.1 Pro Free, at the time of research

Fish describes `s2.1-pro-free` as its free developer model with 83-language
coverage and fair-use access. Its June 2026 announcement says the free window
extends through **November 30, 2026**, has no SLA or latency guarantee, and is
intended for experimentation/prototyping rather than a production commitment.
OpenRouter currently lists its matching free route at zero price and similarly
labels it testing/prototyping/low-volume.

So it is a good model to build and validate the Narrator pipeline with, but we
must keep queue concurrency low, handle 5xx/rate-limit-like failures through
retries, and support replacing the configured model later. “Free” must never
mean unlimited simultaneous work or guaranteed availability.

Provider terms, free availability, price, and model IDs can change. Reconfirm
them before launch and before presenting this as a user-facing promise.

## Fish capabilities relevant later

- **Narration/style:** Fish accepts natural delivery directions and
  square-bracketed text directions. Keep the initial audiobook output plain
  rather than modifying book text.
- **Multiple speakers:** direct Fish supports it for the S2 family. This is
  not needed for the first chapter-to-audio flow.
- **Voice cloning:** direct Fish can use either a saved `reference_id` or
  zero-shot `references`. Treat it as a later feature requiring consent,
  audio-upload rules, retention/deletion behavior, and ownership controls.
- **Text normalization:** Fish can normalize numbers, dates, units, and
  symbols, and accepts a language tag for that normalization.

## Direct Fish request shape

```http
POST https://api.fish.audio/v1/tts
Authorization: Bearer <FISH_API_KEY>
Content-Type: application/json
model: s2.1-pro-free

{
  "text": "A short chapter segment.",
  "reference_id": "a-saved-Fish-voice-id",
  "format": "mp3"
}
```

The endpoint accepts JSON or MessagePack. Its documentation recommends
creating/uploading a voice model before synthesis for better quality and lower
latency; it can also receive zero-shot references.

## Future decisions

1. Pick a single application-default narration voice, or deliberately support
   no voice selection until the route supplies one.
2. Define a tested segment size, timeout, retry policy, and queue concurrency.
3. Define R2 object keys and the `Audio`/job state transition before a worker
   can mark a conversion complete.
4. Add user-supplied provider keys later using the credential-security plan,
   not frontend local storage.

## Official sources

- [Fish Audio S2.1 Pro Free announcement](https://fish.audio/blog/s2-1-pro-free-api/)
- [Fish Audio Text-to-Speech API reference](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Fish Audio developer page](https://fish.audio/developers/)
- [OpenRouter Text-to-Speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- [OpenRouter speech-model discovery API](https://openrouter.ai/api/v1/models?output_modalities=speech)
