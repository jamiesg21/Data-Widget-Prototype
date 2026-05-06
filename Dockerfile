FROM python:3.12-slim

WORKDIR /app

# Install Python deps first to leverage Docker layer cache.
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy the rest of the project — handlers, fixtures, widget, config tool, example page.
COPY server /app/server
COPY widget /app/widget
COPY config-tool /app/config-tool
COPY example /app/example
COPY docs /app/docs

EXPOSE 8080

CMD ["python", "-m", "server.app"]
