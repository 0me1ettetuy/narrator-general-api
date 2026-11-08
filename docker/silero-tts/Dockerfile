FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl \
 && rm -rf /var/lib/apt/lists/*

# CPU-only torch: Silero runs faster than real time on CPU, so no GPU is needed.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.7.1 \
 && pip install --no-cache-dir fastapi==0.115.12 "uvicorn[standard]==0.34.2" numpy

# Models are baked into the image so the container starts offline.
RUN mkdir -p /models \
 && curl -fsSL -o /models/ru.pt https://models.silero.ai/models/tts/ru/v5_ru.pt \
 && curl -fsSL -o /models/en.pt https://models.silero.ai/models/tts/en/v3_en.pt

# The ru v5 model imports scipy at load time.
RUN pip install --no-cache-dir scipy

COPY server.py /app/server.py
WORKDIR /app
EXPOSE 8001
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
