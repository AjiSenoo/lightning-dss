FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Jakarta

WORKDIR /app

# psycopg2-binary, numpy, scipy and Pillow all ship manylinux wheels, so no
# compiler/toolchain is needed. curl is handy for debugging/healthchecks.
# tzdata + the /etc/localtime symlink make the process run in WIB so log
# timestamps (Django's {asctime} and gunicorn) render in Asia/Jakarta, not UTC.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
