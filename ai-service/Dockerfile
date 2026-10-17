FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip check

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY app.py pcm_stream.py pcm_vad.py ./
COPY models/ ./models/
RUN python -c "from pcm_vad import get_model; get_model()"

EXPOSE 8001
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--http", "h11", "--ws", "websockets", "--ws-max-size", "4096", "--ws-max-queue", "8"]
