FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DATA_DIR=/data
ENV DATABASE_URL=sqlite+aiosqlite:////data/branger.db

EXPOSE 8080

VOLUME /data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
