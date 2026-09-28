FROM python:3.12-slim
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 YOLO_AUTOINSTALL=false YOLO_CONFIG_DIR=/tmp/Ultralytics
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements-optional.txt ./
RUN pip install --no-cache-dir torch==2.14.0 torchvision==0.29.0 --index-url ${TORCH_INDEX_URL} && pip install --no-cache-dir -r requirements.txt -r requirements-optional.txt
COPY backend/ ./
RUN useradd --uid 10001 --create-home vision && mkdir -p /app/data /app/models /app/backend/models && chown -R vision:vision /app
USER vision
EXPOSE 8000
ENTRYPOINT ["python", "/app/backend/docker-entrypoint.py"]
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=4)"
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--workers","1","--ws-max-size","2100000"]
