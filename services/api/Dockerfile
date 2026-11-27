# Production container for the PSA server tier (FastAPI + pandapower).
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY psa_api ./psa_api

RUN useradd --system --uid 10001 psa
USER psa

EXPOSE 8000
CMD ["uvicorn", "psa_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
