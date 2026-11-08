# Voice models and per-user Fish Audio credentials

## What it is

The **Models** page offers a dynamic local-model group and a Fish Audio group.
Users choose one default model and, for Fish generation, one voice for future
generation. Fish is not a shared deployment key: every user supplies their own
key.

## How to use it in the UI

1. Open **Models** in the private sidebar.
2. Local cards show `READY`, `UNAVAILABLE`, or `DISABLED`. Only Silero TTS
   (Russian + English) is enabled; it is off by default and runs on CPU.
3. To use Fish Audio, enter a personal key in the Fish setup card. The form
   validates it before Fish model cards are displayed.
4. Choose a ready card. The selected card becomes the default for future
   audio generation.
5. When Fish is configured, choose a supplied **Default** voice or one of your
   own **Custom** voices. A custom voice can be added with its Fish reference
   ID and a personal label, then removed when no longer needed.

## What happens underneath

### Fish Audio

- A user's key is encrypted with AES-256-GCM before Postgres stores it. The
  ciphertext is bound to that user's ID as associated data; the API never
  returns all or part of the key.
- Saving a key calls Fish's authenticated package endpoint with a timeout. The
  stored public state is `MISSING`, `VALID`, `INVALID`, or `UNKNOWN`, so a
  provider/network problem is not falsely presented as an invalid key.
- Fish model definitions are code configuration, not database rows. Currently
  `fish.s2.1-pro-free` and `fish.s2.1-pro` can be toggled by deployment env.
  Fish cards appear only after a valid personal key exists.
- The worker decrypts the owner’s valid key only immediately before a Fish
  synthesis request. An invalid provider response marks the saved key invalid.
- Deployment defaults come from ordered `FISH_DEFAULT_VOICES` JSON in `.env`.
  On backend startup, this list safely creates or updates shared `DEFAULT`
  catalogue rows. Removing an entry from configuration disables its row rather
  than deleting it, which protects historic audio and existing selections.
- `FishVoice` is one catalogue table: global `DEFAULT` rows are shared by all
  users; `CUSTOM` rows have an owner. `User.selectedFishVoiceId` points to an
  enabled default or to that user's custom voice, so defaults are not copied
  once per user.
- `GET /tts/models` returns enabled/disabled voices as
  `providers[0].voices`, with source (`DEFAULT`/`CUSTOM`), name, reference ID,
  and selected state. Users can select a shared default but may only delete
  their own custom row. A deleted selected custom voice clears the preference,
  so the user must pick another voice before generating again.
- There is no fallback voice: Fish generation requires an explicitly selected,
  enabled voice and is rejected with `FISH_VOICE_NOT_SELECTED` otherwise.
- The queue resolves and snapshots the selected reference ID in `Audio.voice`
  at chapter-audio creation. Later selection/catalogue changes cannot mix
  voices in an in-progress chapter or its retries.

### Local models (Silero TTS)

Silero TTS (Russian + English) is selectable when `TTS_LOCAL_SILERO_TTS_ENABLED`
is true and its health check passes. Qwen3-TTS, Piper, Kokoro-82M and Chatterbox
Turbo are removed or disabled: `GET /tts/models` omits them, and the frontend
shows no card for them.

A local model lists its fixed voices in `GET /tts/models` (`voices`, per
language). The book page shows the voices for the book's language as a dropdown
and sends the pick as `voiceId`; it must belong to the book's language (400
otherwise) and is snapshotted on the audio row. Without a `voiceId` the engine
default is used.

Full restoration record (exact code locations, the removed Docker Compose and
`.env.example` content, and how to bring each model back):
[`docs/tts/local-tts-models-removed.md`](../tts/local-tts-models-removed.md).
Why: [`docs/issues/local-tts-models-disabled.md`](../issues/local-tts-models-disabled.md).

### Selection snapshot

- Selecting a model writes `User.defaultTtsModelKey`. It is validated against
  the live, user-specific catalogue before saving.
- When a chapter audio row is first created, it snapshots that model ID in
  `Audio.modelKey`. Later preference changes do not silently alter queued or
  completed audio. To regenerate an existing chapter with another model, the
  user must delete its old audio first.
- There is no fallback model either: without a saved selection or a
  per-request `modelId`, chapter audio is rejected with `TTS_MODEL_NOT_SELECTED`.
  New accounts start with nothing selected.

## Current UI/API boundary

The UI supports saving and replacing a Fish key, but does not yet render a
"remove Fish key" button. The backend endpoint already exists for it:
`DELETE /tts/models/providers/fish-audio/credential`.

The Models page renders supplied default voices alongside the user's custom
voices. Defaults are selectable but not removable; custom entries show their
label and may be removed by their owner.

The book page has a compact model/voice dropdown next to **Generate** (Fish
Audio with a nested model/voice submenu, a disabled "Local models — Coming
soon" section, or a link to the Models page when no Fish key is saved). It
uses the same selection endpoints, so both places stay in sync. **Generate**
stays disabled, with an inline explanation, until a model and (for Fish) a
voice are selected.

## Contributing commits, checked by actual change

- Backend: `260d9ae` added the registry, local health status, Compose services,
  and models endpoint; `2749fe2` added adapter resolution and four local
  adapters; `941dcc5` added encrypted per-user Fish credentials; `d2b796f`
  added persisted default selection and model snapshot validation; `5904932`
  added the initial per-user Fish voice library; `a818529` replaced it with
  the safely synchronized shared default/custom catalogue and env-driven
  fallback; `fb36b48` added book-language propagation and local voice choice.
- Frontend: `5e96fa2` added the Models route, local/Fish groups, credential
  form, disabled-card states, and model selection UI; `9a37991` added the
  Fish default/custom voice picker and the chapter-audio voice label;
  `ae3399e` added the temporary local-model rollout guard and refined voice
  presentation.
- No-fallback selection: backend `3a0e0bc` removed the implicit Fish model and
  default-voice fallbacks in favor of `TTS_MODEL_NOT_SELECTED` /
  `FISH_VOICE_NOT_SELECTED`; frontend `5362900` added the book-page model/voice
  dropdown and disabled **Generate** until the selection is complete.
