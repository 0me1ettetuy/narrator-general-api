"""OpenAI-compatible /v1/audio/speech wrapper around Silero TTS (ru v5, en v3)."""

import re
import subprocess
import threading

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

SAMPLE_RATE = 48000
# Silero degrades on long inputs, so oversized text is synthesized sentence by sentence.
MAX_CHARS = 800
LANGUAGES = {
    "ru": {"path": "/models/ru.pt", "default_voice": "xenia"},
    "en": {"path": "/models/en.pt", "default_voice": "en_0"},
}
LANGUAGE_NAMES = {"russian": "ru", "english": "en", "ru": "ru", "en": "en"}

app = FastAPI()
_models = {}
_lock = threading.Lock()  # one synthesis at a time; torch already uses all cores


def _model(code: str):
    if code not in _models:
        importer = torch.package.PackageImporter(LANGUAGES[code]["path"])
        _models[code] = importer.load_pickle("tts_models", "model")
        _models[code].to("cpu")
    return _models[code]


class SpeechRequest(BaseModel):
    input: str
    voice: str = "auto"
    language: str = "Russian"
    response_format: str = "mp3"
    model: str | None = None


def _split(text: str) -> list[str]:
    parts, current = [], ""
    for sentence in re.split(r"(?<=[.!?…])\s+", text):
        while len(sentence) > MAX_CHARS:
            cut = sentence.rfind(" ", 0, MAX_CHARS) or MAX_CHARS
            parts.append((current + " " + sentence[:cut]).strip() if current else sentence[:cut])
            current, sentence = "", sentence[cut:].strip()
        if current and len(current) + 1 + len(sentence) > MAX_CHARS:
            parts.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        parts.append(current)
    return parts


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest):
    code = LANGUAGE_NAMES.get(request.language.strip().lower())
    if code is None:
        raise HTTPException(400, f"Unsupported language {request.language}")
    if request.response_format != "mp3":
        raise HTTPException(400, "Only mp3 is supported")

    config = LANGUAGES[code]
    text = request.input.strip()
    if not text:
        raise HTTPException(400, "input must not be empty")

    chunks = []
    with _lock:
        model = _model(code)
        # "auto" means the language default; any other name must be a real speaker of this model.
        voice = config["default_voice"] if request.voice == "auto" else request.voice
        if voice not in model.speakers:
            raise HTTPException(400, f"Unknown voice {voice} for {request.language}")
        for part in _split(text):
            kwargs = {"put_accent": True, "put_yo": True} if code == "ru" else {}
            try:
                audio = model.apply_tts(text=part, speaker=voice, sample_rate=SAMPLE_RATE, **kwargs)
            except Exception as error:  # Silero raises plain ValueError/KeyError on bad characters
                raise HTTPException(422, f"Silero could not synthesize the text: {error}") from error
            chunks.append(audio.numpy())

    pcm = (np.concatenate(chunks) * 32767).clip(-32768, 32767).astype("<i2").tobytes()
    mp3 = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", "-f", "mp3", "-b:a", "96k", "pipe:1"],
        input=pcm, capture_output=True, check=True,
    ).stdout
    from fastapi.responses import Response

    return Response(content=mp3, media_type="audio/mpeg")
