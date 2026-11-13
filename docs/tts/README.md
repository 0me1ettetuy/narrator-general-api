# Text-to-speech documentation

| Doc                                                                  | Holds                                                                                                                                             | Edit it when                                     | Status     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- |
| [tts-runtime-rules.md](tts-runtime-rules.md)                         | model selection, queues, Fish keys and voices, Silero and Qwen3-TTS rules                                                                         | any of those behaviors change                    | current    |
| [tts-model-catalogue.md](tts-model-catalogue.md)                     | code-owned model definitions, env toggles, availability, adding a model                                                                           | the model list, toggles or voices change         | current    |
| [local-tts-docker.md](local-tts-docker.md)                           | enabling Silero TTS and Qwen3-TTS, env keys, voices, GPU limits, 600-character segments                                                           | a local model's Docker setup changes             | current    |
| [fish-audio.md](fish-audio.md)                                       | direct Fish API request notes                                                                                                                     | the Fish request shape changes                   | current    |
| [fish-audio-r2-streaming-plan.md](fish-audio-r2-streaming-plan.md)   | streamed-provider-output design and rationale                                                                                                     | never; delete when no longer useful              | historical |
| [local-tts-models-removed.md](local-tts-models-removed.md)           | restoration record for the removed or disabled local models (Qwen3-TTS, Piper, Kokoro, Chatterbox); [why](../issues/local-tts-models-disabled.md) | a local model is removed or restored             | historical |
| [tts-models-and-user-keys-plan.md](tts-models-and-user-keys-plan.md) | original model and user-key decision record                                                                                                       | never; use the catalogue guide for current rules | historical |

The user flow from model selection to durable audio is in the
[feature catalogue](../features/voice-models.md).
