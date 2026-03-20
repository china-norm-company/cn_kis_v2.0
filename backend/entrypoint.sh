#!/bin/sh
# Load plan-a env into process so gunicorn sees all vars.
# File is baked into image at build (from deploy/.env.volcengine.plan-a).
set -e
if [ -f /app/.env ]; then
	set -a
	. /app/.env
	set +a
fi
exec gunicorn wsgi:application --bind 0.0.0.0:8001 --workers 2 --timeout 120
