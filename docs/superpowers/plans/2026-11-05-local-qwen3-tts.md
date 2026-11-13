# Local Qwen3-TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back local TTS with Qwen3-TTS as the only local model, selectable next to Fish Audio.

**Architecture:** The adapters, queue split and health checks were built before and then commented out. Restore only the Qwen3 path (base class, adapter, registry entry, resolver wiring, Docker service) and leave Piper, Kokoro and Chatterbox commented. The frontend un-comments its local group, which then shows one card.

**Tech Stack:** NestJS, BullMQ, Prisma Next, Docker Compose with an NVIDIA GPU, an OpenAI-compatible Qwen3-TTS server, React/Vite frontend.

**Spec:** `docs/tts/local-tts-models-removed.md` (restoration record) and `docs/issues/local-tts-models-disabled.md`. Frontend side: `narrator-fe/docs/issues/local-tts-models-disabled.md`.

**Status (2026-11-05):** Merged to `main` (backend PR #2, frontend PR #2). Done: Tasks 2–7 except the items below. Not done: Task 1 GPU spike (needs `nvidia-container-toolkit` on the dev host); Task 5 step 4 and Task 6 browser check (need a GPU run); Task 4 step 2 chapter failure-path test; image digest pin.

## Global Constraints

- Only `local.qwen3-tts-0.6b` is restored. Do not un-comment Piper, Kokoro or Chatterbox.
- Config keys keep their old names: `TTS_LOCAL_QWEN3_TTS_0_6B_{ENABLED,HEALTH_URL,URL,VOICE,IMAGE,PUBLISHED_PORT}`, `TTS_LOCAL_TTS_IDLE_TIMEOUT_MS`, `TTS_MODEL_HEALTH_CHECK_TIMEOUT_MS`, `TTS_MODEL_HEALTH_CACHE_TTL_MS`.
- Disabled by default (`ENABLED=false`): no image or weights download unless the deployment owner opts in.
- No silent fallback: "select, don't guess" is a product rule (see the frontend doc).
- Never hand-edit `narrator-fe/src/shared/api/generated/`. Run `pnpm api:generate` if the OpenAPI contract changes.

## Review Focus

- Book language that Qwen3 does not support (for example `uk`): must fail with a clear error, not silently use `Auto`.
- Qwen container down or unhealthy while it is the saved selection: model shows as unavailable, and starting generation returns a clear error instead of hanging.
- Container dies mid-chapter: the chunk fails and the job can resume. Finished chunks are not regenerated.
- Two chapters generating at once on one small GPU: the local queue must run with concurrency 1.
- A segment whose MP3 exceeds `MAX_TTS_AUDIO_BYTES` (20 MiB): fails cleanly.

---

### Task 1: Spike — does Qwen3-TTS run on this GPU?

Gate for everything else. The dev machine has a **GTX 1050 Ti (4 GB)**. This is an older GPU without bf16, and the community benchmark measured RTF ~0.86–1.26 on faster consumer cards.

**Files:** none committed. Use the scratchpad for the script and notes.

- [ ] **Step 1:** Start the old image from the restoration record (`ghcr.io/malaiwah/qwen3-tts-server`, `QWEN3_TTS_MODEL_ID=Qwen/Qwen3-TTS-12Hz-0.6B-Base`) with `docker run --gpus all -p 127.0.0.1:8001:8001`. Pin the image by digest if it works.
- [ ] **Step 2:** `curl` `/v1/audio/speech` with `{"model":"tts-1","input":<one real ~1500-character chunk>,"voice":"ryan","response_format":"mp3","language":"English"}`. Record peak VRAM (`nvidia-smi`), wall time and audio duration.
- [ ] **Step 3:** Repeat with a Russian chunk, since a Russian book is the likeliest real use.
- [ ] **Step 4:** Decide and write it to the user.
  - **Go:** it fits in VRAM and RTF is ≤ ~2.
  - **No-go:** the image is dead, it needs bf16, or it is slower than ~3× real time. Fall back to a small own server around the official `qwen-tts` package (fp16), or use a different machine for the model.

### Task 2: Adapter and base class

**Files:**

- Modify: `src/tts/adapters/openai-compatible-local-tts.adapter.ts` (strip the `// ` header and prefixes)
- Modify: `src/tts/adapters/qwen3-tts.adapter.ts` (delete the header and `/* */` wrapper)
- Rename: `qwen3-tts.adapter.spec.ts.disabled-test` and `openai-compatible-local-tts.adapter.spec.ts.disabled-test` back to `.spec.ts` (`git mv`)

**Interfaces:**

- Produces: `class Qwen3TtsAdapter implements TtsAdapter` (injectable, constructor `(configService: ConfigService)`), `toQwenLanguage(language: string | null | undefined): string`.

- [ ] **Step 1:** Restore the files and run `pnpm test src/tts/adapters`. Expected: the old specs pass unchanged.
- [ ] **Step 2:** Add a failing test in `qwen3-tts.adapter.spec.ts`: `rejects a language Qwen3 does not support`. `synthesizeStream({ text: 'x', language: 'uk' })` rejects with `TtsSynthesisError` before any `fetch`. Also add: `uses Auto when language is null`, `maps ru-RU to Russian`.
- [ ] **Step 3:** Change `toQwenLanguage` to throw `TtsSynthesisError('Qwen3-TTS does not support language <code>')` for a non-empty unsupported code, and keep `'Auto'` for null or empty. (Product rule: no silent fallback. Drop this step if you would rather keep the old `Auto` behavior.)
- [ ] **Step 4:** Run `pnpm test src/tts/adapters`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: restore the Qwen3-TTS adapter`.

### Task 3: Registry, resolver and module

**Files:**

- Modify: `src/tts-models/tts-model-registry.service.ts`, `src/tts/tts-adapter-resolver.service.ts`, `src/tts/tts.module.ts`
- Test: `src/tts/tts-adapter-resolver.service.spec.ts`, `src/tts-models/tts-models.service.spec.ts`

**Interfaces:**

- Consumes: `Qwen3TtsAdapter` from Task 2.
- Produces: `LOCAL_TTS_MODEL_DEFINITIONS` containing only `local.qwen3-tts-0.6b` (`healthStrategy: 'JSON_STATUS_HEALTHY'`). The resolver returns `{ adapter: qwen3TtsAdapter, source: 'LOCAL', providerModel: null }` for that id.

- [ ] **Step 1:** Write the failing tests.
  - Resolver spec: `resolves local.qwen3-tts-0.6b to the Qwen3 adapter`; `still throws for a local id with no adapter`.
  - Models service spec: `lists the Qwen3 model as unavailable when its health check fails`; `rejects selecting it when disabled` (`TTS_MODEL_NOT_FOUND`).
- [ ] **Step 2:** Run them and confirm they fail.
- [ ] **Step 3:** Un-comment only the Qwen entry in the registry. In the resolver, inject `Qwen3TtsAdapter` and map the one id (a `Map` or a plain `if`). Keep the "no adapter" throw. Register the adapter in `TtsModule.providers`.
- [ ] **Step 4:** Run `pnpm test --runInBand && pnpm build && pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: offer Qwen3-TTS as a local model`.

### Task 4: Queue concurrency and mid-run failure

**Files:**

- Inspect: `src/worker/synthesize-chapter.processor.ts`, `src/jobs/jobs.service.ts` (the local queue already exists)
- Test: `src/worker/synthesize-chapter.processor.spec.ts`, `src/tts/chapter-tts.service.spec.ts`

- [ ] **Step 1:** Check that the local chapter queue's `@Processor` concurrency is 1. If not, set it to 1 with a comment: one small GPU, one request at a time.
- [ ] **Step 2:** Add a `chapter-tts.service.spec.ts` test that uses a `LOCAL` resolved adapter. The second chunk's `synthesizeStream` rejects with `TtsSynthesisError`. The job fails, chunk 1 stays stored, and a rerun synthesizes only chunk 2.
- [ ] **Step 3:** Run `pnpm test src/worker src/tts`. Expected: PASS.
- [ ] **Step 4:** Commit: `test: cover local TTS failure and concurrency`.

### Task 5: Docker service and env

**Files:**

- Modify: `compose.yaml`, `compose.dev.yaml`, `.env.example`

- [ ] **Step 1:** Add the `qwen3-tts` service and the volumes `narrator_qwen3_tts_data` and `narrator_qwen3_tts_huggingface_cache` from the restoration record. Use the image pinned in Task 1, bound to `127.0.0.1`. Add only the Qwen `TTS_LOCAL_QWEN3_TTS_0_6B_*` URL and health lines to the `application-environment` anchor. Add the matching `extends:` stanza in `compose.dev.yaml`.
- [ ] **Step 2:** Add the shared health/idle-timeout keys and the Qwen group to `.env.example`, with the model-id and image overridable (so 1.7B is a config change).
- [ ] **Step 3:** Run `docker compose config -q` for both files. Expected: no errors.
- [ ] **Step 4:** Set `ENABLED=true`, start the stack, and run `curl localhost:3000/tts/models` against the API. Expected: the local group lists Qwen3 as available. Generate one real short chapter end to end and check the audio record's `modelId`, provider and voice.
- [ ] **Step 5:** Commit: `feat: add the local Qwen3-TTS Docker service`.

### Task 6: Frontend

**Files (narrator-fe):**

- Modify: `src/pages/models/ui/ModelsPage.tsx`, `src/pages/book/ui/TtsSelector.tsx`, `src/pages/book/model/tts-selection.ts`, i18n strings (`en.ts`, `ru.ts`)

- [ ] **Step 1:** Run `pnpm api:generate` against the running backend. The contract should be unchanged.
- [ ] **Step 2:** Following `docs/issues/local-tts-models-disabled.md`, un-comment the dynamic local `ModelGroup` and the `ModelCard` local branch. Delete the static "Coming soon" card. Keep the work inside the existing `pages/models` and `pages/book` slices, with no new slices. Drop `TESTED_LOCAL_MODEL_ID` (Qwen is the only local model, and Task 5 verified it).
- [ ] **Step 3:** In `tts-selection.ts`, check that selection counts as complete for a local model **without** a Fish voice. In `TtsSelector`, show the local voice as fixed and non-interactive. Add the string if it is missing.
- [ ] **Step 4:** Run `pnpm lint && pnpm build && pnpm format:check`. In the browser: pick Qwen3 on `/models`, generate a chapter, and confirm Fish is untouched.
- [ ] **Step 5:** Commit: `feat: show the local Qwen3-TTS model`.

### Task 7: Docs

- [ ] **Step 1:** Update the backend docs: `docs/tts/local-tts-models-removed.md`, `docs/issues/local-tts-models-disabled.md`, `docs/tts/tts-model-catalogue.md`, `docs/features/README.md`, `docs/history.md`, and the "TTS adapters and models" section of `CLAUDE.md` (it says the `chapter-tts` queue has nothing routed to it and `GET /tts/models` returns an empty `local` group). Update the frontend's `docs/issues/local-tts-models-disabled.md` and `docs/history.md`. Qwen3 is restored. The other three remain disabled. Add the hardware notes and the image digest from Task 1. Also walk `docs/architecture/backend-delivery-checklist.md`.
- [ ] **Step 2:** Update `docs/tts/local-tts-docker.md` with the Qwen enable and run instructions and the GPU requirement.
- [ ] **Step 3:** Commit: `docs: record the Qwen3-TTS restoration`.

## Not in this plan

- **Voice cloning from reference audio.** Qwen3 Base can do it, but the current adapter only sends a preset voice name. That would need new voice storage and UI.
- **Language-bound voice picking** (the frontend TODO). Qwen3 uses one env-configured voice.
- **Qwen3-TTS 1.7B and the other local engines.**
