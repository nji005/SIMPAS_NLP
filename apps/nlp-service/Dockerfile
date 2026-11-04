# Multi-stage / lightweight standalone container for SIPMAS NLP Microservice
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN useradd -m -u 1000 appuser

# Install pinned Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code and dataset
COPY app/ ./app/
COPY dataset/ ./dataset/
COPY app.py wsgi.py train.py ./

# Create artifacts directory, train model, and set permissions to appuser
RUN mkdir -p app/artifacts && python -m app.model.train && chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

# Health check using the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Run with production Gunicorn WSGI server
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "wsgi:app"]
