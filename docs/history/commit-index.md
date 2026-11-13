# Backend complete commit index

| Date       | Commit    | Recorded change                                                                                                                                            |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-26 | `c12a678` | Created the Nest application baseline.                                                                                                                     |
| 2026-08-26 | `e0871a2` | Added the TypeScript `@` import alias.                                                                                                                     |
| 2026-08-26 | `6814011` | Added formatting, linting, and editor configuration.                                                                                                       |
| 2026-08-29 | `f8e8c88` | Added configuration-module setup.                                                                                                                          |
| 2026-08-29 | `29a236c` | Added the initial Prisma configuration and schema files.                                                                                                   |
| 2026-08-29 | `58ec241` | Added the Postgres Compose service.                                                                                                                        |
| 2026-08-29 | `4f69942` | Added global request validation.                                                                                                                           |
| 2026-08-30 | `6a2a78a` | Added global exception filters.                                                                                                                            |
| 2026-08-30 | `7a50ea6` | Added application logging configuration.                                                                                                                   |
| 2026-08-30 | `75c25d9` | Added request-logging middleware.                                                                                                                          |
| 2026-08-30 | `319e605` | Added CORS configuration.                                                                                                                                  |
| 2026-08-30 | `d615c6f` | Corrected logging setup and removed the first Prisma attempt.                                                                                              |
| 2026-08-30 | `1aa02f3` | Wired the Prisma 8 contract/runtime integration.                                                                                                           |
| 2026-08-31 | `1d110ae` | Adjusted test/build setup around Prisma generation.                                                                                                        |
| 2026-09-07 | `ae1c3ff` | Added authentication dependencies.                                                                                                                         |
| 2026-09-07 | `4cd97e9` | Added auth/user schema, DTOs, and response contracts.                                                                                                      |
| 2026-09-12 | `2b5e3a1` | Added Auth/Users modules and base services/controllers.                                                                                                    |
| 2026-09-22 | `053cc50` | Implemented JWT/CSRF/cookie authentication flow.                                                                                                           |
| 2026-09-22 | `b80fa30` | Refined the authentication implementation and persistence wiring.                                                                                          |
| 2026-10-06 | `832e7e5` | Added auth OpenAPI metadata and base contract refinements.                                                                                                 |
| 2026-10-12 | `e5c8227` | Preserved invalid-CSRF responses as `403`.                                                                                                                 |
| 2026-10-13 | `2d72f29` | Added stable API error codes and invalid-credential handling.                                                                                              |
| 2026-10-13 | `0e845d1` | Added backend agent guidance and initial architecture/API docs.                                                                                            |
| 2026-10-13 | `80236bf` | Added initial book/chapter/audio/job schema shapes.                                                                                                        |
| 2026-10-13 | `c03c3a4` | Ignored generated Prisma contract artifacts.                                                                                                               |
| 2026-10-16 | `aafe455` | Added Books and S3-compatible Storage modules.                                                                                                             |
| 2026-10-16 | `a6d8ea6` | Added signed EPUB-upload and upload-confirmation endpoints.                                                                                                |
| 2026-10-19 | `2d766a9` | Added Redis infrastructure configuration.                                                                                                                  |
| 2026-10-19 | `89a30f9` | Added BullMQ jobs foundation and standalone worker bootstrap.                                                                                              |
| 2026-10-19 | `5734d2e` | Added EPUB parser service and parser tests.                                                                                                                |
| 2026-10-19 | `4400fbe` | Added background EPUB parsing worker flow.                                                                                                                 |
| 2026-10-19 | `a356aae` | Documented direct-upload lifecycle and updated cookie behavior.                                                                                            |
| 2026-10-19 | `8e17390` | Added chapter segmentation and initial TTS module/services.                                                                                                |
| 2026-10-19 | `bea8e13` | Added audio chunks, merge service, and synthesis processor.                                                                                                |
| 2026-10-19 | `1556e17` | Completed final chapter-audio merge processing.                                                                                                            |
| 2026-10-20 | `b7f197c` | Expanded persistent TTS pipeline schema/contracts/workflow.                                                                                                |
| 2026-10-20 | `4b90f39` | Streamed Fish audio responses into object storage.                                                                                                         |
| 2026-10-20 | `dc3b0e1` | Renamed storage environment configuration for S3 compatibility.                                                                                            |
| 2026-10-21 | `23e00a5` | Added optional MinIO local-storage deployment.                                                                                                             |
| 2026-10-25 | `260d9ae` | Added local TTS container/model availability foundation.                                                                                                   |
| 2026-10-25 | `2749fe2` | Added local TTS adapters and model-aware audio queueing.                                                                                                   |
| 2026-10-25 | `941dcc5` | Added encrypted per-user Fish Audio credentials.                                                                                                           |
| 2026-10-25 | `d2b796f` | Added saved user TTS-model selection and catalogue docs.                                                                                                   |
| 2026-10-26 | `05cf283` | Added EPUB cover extraction and object-storage metadata.                                                                                                   |
| 2026-10-26 | `7f37b3a` | Added batch selected/all chapter audio generation.                                                                                                         |
| 2026-10-27 | `c1efad6` | Added chapter curation API groundwork and design documentation.                                                                                            |
| 2026-10-28 | `d50f899` | Implemented persisted chapter classification and curation actions.                                                                                         |
| 2026-10-28 | `eecea24` | Added per-model local-TTS toggles and reorganized docs.                                                                                                    |
| 2026-10-30 | `affc5bc` | Added the backend change-history document and linked it from project guidance.                                                                             |
| 2026-10-30 | `5904932` | Added a multi-voice Fish library, selection API, and per-chapter voice snapshot.                                                                           |
| 2026-10-30 | `a818529` | Replaced the user-only voice list with a safely synchronized default/custom Fish voice catalogue and `FISH_DEFAULT_VOICES` configuration.                  |
| 2026-10-31 | `fb36b48` | Persisted EPUB language metadata and made Qwen/Piper/Kokoro narration language-aware.                                                                      |
| 2026-10-31 | `041ced4` | Added metadata-missing EPUB language detection from parsed chapter text.                                                                                   |
| 2026-10-31 | `e6602e0` | Added direct replacement uploads for private book covers using the existing object key.                                                                    |
| 2026-10-31 | `d0d31f8` | Added ordered author metadata to paginated book-list results with one bounded secondary query.                                                             |
| 2026-10-31 | `149deee` | Added the production-style backend image/Compose runtime, automatic schema update, and deployment documentation.                                           |
| 2026-10-31 | `2c453fb` | Added a standalone Docker watcher setup for the API and worker.                                                                                            |
| 2026-11-01 | `19efe19` | Made local API/MinIO images build locally instead of attempting a registry pull.                                                                           |
| 2026-11-02 | `5eb79ff` | Added `MINIO_ENABLED`; `COMPOSE_PROFILES` is now a fixed `"true"`.                                                                                         |
| 2026-11-03 | `3a0e0bc` | Rejected chapter audio without an explicitly selected TTS model or Fish voice instead of falling back.                                                     |
| 2026-11-03 | `b7c3939` | Added safe book deletion: `Book.deletedAt`, prefix storage cleanup, and deleted-book guards.                                                               |
| 2026-11-03 | `363e89b` | Split chapter TTS into Fish (parallel) and local queues and retried Fish 429/5xx with backoff.                                                             |
| 2026-11-05 | `b3fae68` | Added the book collections spec and backend plan.                                                                                                          |
| 2026-11-05 | `3256595` | Added collection tables, the migration, and the collection error codes.                                                                                    |
| 2026-11-05 | `a613aea` | Kept saved book references as ghosts when a book goes private; moved book summary mapping into a shared mapper.                                            |
| 2026-11-05 | `72676b4` | Added collection reads, creation, and deletion.                                                                                                            |
| 2026-11-05 | `536b5ed` | Added adding, removing, and reordering collection books.                                                                                                   |
| 2026-11-05 | `4e5e5fb` | Added collection publishing and saved collections in the library.                                                                                          |
| 2026-11-05 | `3d65e8f` | Exposed the collections API through the controller and module.                                                                                             |
| 2026-11-05 | `64ffa72` | Recorded book collections and ghosts in the project guidance.                                                                                              |
| 2026-11-05 | `afe428a` | Restored the Qwen3-TTS 0.6B adapter and registry entry; unsupported book languages now fail instead of using Auto.                                         |
| 2026-11-05 | `347a4e3` | Added the `qwen3-tts` GPU Compose service and its env keys, off by default.                                                                                |
| 2026-11-05 | `be884a8` | Recorded the Qwen3-TTS restoration and added its implementation plan.                                                                                      |
| 2026-11-08 | `ab2c76f` | Replaced Qwen3-TTS with CPU Silero TTS (ru/en), added selectable local voices (`voices`, `voiceId`), 600-character local segments, and the docs-sync rule. |
