FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    TOOL_PACKAGE_CONFIG_PATH=/app/config/tool_packages.yaml

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY config ./config
COPY src ./src

RUN pip install --no-cache-dir . \
    && python -m compileall -q /usr/local/lib/python3.11/site-packages/servicenow_mcp_gateway \
    && python -c "from servicenow_mcp_gateway.app import create_app; create_app()"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=5).read()"
CMD ["maiah-servicenow-mcp-gateway"]
