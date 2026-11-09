# qwentts.cpp (CUDA 12.9 build, includes Pascal sm_61), pinned by digest.
FROM ghcr.io/serveurpersocom/qwentts.cpp@sha256:8cae45f40bd60dba971230d3ea02386bba1c2d76dd208822a5e7ef069eb93006

# ffmpeg turns the server's WAV into the MP3 the API expects.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ffmpeg python3 \
 && rm -rf /var/lib/apt/lists/*

# Quantized 0.6B CustomVoice talker (Q8_0) plus codec, baked in so the container starts offline.
# shortcut: no checksum on the downloads, pin sha256 before relying on this in production.
RUN mkdir -p /models \
 && curl -fsSL -o /models/talker.gguf https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main/qwen-talker-0.6b-customvoice-Q8_0.gguf \
 && curl -fsSL -o /models/codec.gguf https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main/qwen-tokenizer-12hz-Q8_0.gguf

# An 8 s codec chunk keeps the decoder inside 4 GB of VRAM on long segments.
ENV MODEL_PATH=/models/talker.gguf \
    CODEC_PATH=/models/codec.gguf \
    CODEC_CHUNK_DUR=8 \
    PORT=8080

COPY proxy.py /app/proxy.py
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8002
ENTRYPOINT ["/app/start.sh"]
