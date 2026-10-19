# Fish Audio S2.1 Pro Free notes

Last verified: 2026-10-19.

## What we are using now

Narrator will call **Fish Audio through OpenRouter** with the server-owned
`OPENROUTER_API_KEY`. It will not call the Fish API directly in the first
version. See [OpenRouter TTS notes](./openrouter.md) for the actual adapter
contract we should implement.

This distinction matters because the two APIs look similar but are not the
same.

| Concern | OpenRouter route used by Narrator | Direct Fish API |
| --- | --- | --- |
| URL | `https://openrouter.ai/api/v1/audio/speech` | `https://api.fish.audio/v1/tts` |
| Credential | OpenRouter API key | Fish API key |
| Free model ID | `fish-audio/s2.1-pro-free:free` in JSON `model` | `s2.1-pro-free` in the `model` header |
| Text field | `input` | `text` |
| Output-format field | `response_format` | `format` |
| Saved-voice field | provider-specific `voice` | `reference_id` |

Never mix direct-Fish fields such as `reference_id` or `format` into the
OpenRouter payload. The differences above are the main reason this file
exists.

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

- **Narration/style:** Fish accepts natural delivery directions. Through
  OpenRouter, use `instructions`; Fish also recognizes square-bracketed text
  directions. Keep the initial audiobook output plain rather than modifying
  book text.
- **Multiple speakers:** direct Fish supports it for the S2 family, and
  OpenRouter documents multi-speaker support for Fish models other than S1.
  This is not needed for the first chapter-to-audio flow.
- **Voice cloning:** direct Fish can use either a saved `reference_id` or
  zero-shot `references`. Via OpenRouter, voice cloning uses
  `input_references` and capability-dependent routing. Treat it as a later
  feature requiring consent, audio-upload rules, retention/deletion behavior,
  and ownership controls.
- **Text normalization:** direct Fish can normalize numbers, dates, units, and
  symbols, and accepts a language tag for that normalization. The OpenRouter
  adapter abstracts direct Fish controls, so do not assume every direct option
  is exposed through OpenRouter.

## Direct Fish API reference only — do not implement yet

If we later intentionally choose direct Fish instead of OpenRouter, its basic
request has this shape:

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

The direct endpoint accepts JSON or MessagePack. Its documentation recommends
creating/uploading a voice model before synthesis for better quality and lower
latency; it can also receive zero-shot references. These direct-only controls
do not change the initial OpenRouter plan.

## What to decide before the real TTS adapter

1. Confirm the OpenRouter route's default/allowed voice behavior with a
   harmless short probe.
2. Pick a single application-default narration voice, or deliberately support
   no voice selection until the route supplies one.
3. Define a tested segment size, timeout, retry policy, and queue concurrency.
4. Define R2 object keys and the `Audio`/job state transition before a worker
   can mark a conversion complete.
5. Keep user-supplied OpenRouter keys out of this first adapter. Add them later
   using the credential-security plan, not frontend local storage.

## Official sources

- [Fish Audio S2.1 Pro Free announcement](https://fish.audio/blog/s2-1-pro-free-api/)
- [Fish Audio Text-to-Speech API reference](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Fish Audio developer page](https://fish.audio/developers/)
- [OpenRouter Text-to-Speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- [OpenRouter speech-model discovery API](https://openrouter.ai/api/v1/models?output_modalities=speech)
