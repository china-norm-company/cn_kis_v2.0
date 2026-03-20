# Build from backend/ so context is small (avoids Podman xattr/memory issues):
#   cp ../deploy/.env.volcengine.plan-a .env   # optional: bake plan-a into image
#   podman build -t <image> .
# Use amd64 so build/run works on typical cloud VMs (e.g. Aliyun/Volcengine). For offline:
#   docker pull --platform=linux/amd64 python:3.14-slim
#   docker build --pull=false -t <image> .
FROM --platform=linux/amd64 python:3.14-slim

ARG http_proxy
ARG https_proxy
ARG all_proxy
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    http_proxy= \
    https_proxy= \
    all_proxy= \
    HTTP_PROXY= \
    HTTPS_PROXY= \
    ALL_PROXY=

# 禁用 apt 代理并切换为国内镜像（阿里云），避免构建时代理/源超时
RUN printf 'Acquire::http::Proxy "false";\nAcquire::https::Proxy "false";\n' > /etc/apt/apt.conf.d/99no-proxy \
  && if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources; \
      sed -i 's|http://security.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources; \
    fi \
  && if [ -f /etc/apt/sources.list ]; then \
      sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' /etc/apt/sources.list; \
      sed -i 's|http://security.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list; \
    fi

WORKDIR /app

# 系统依赖
RUN apt-get update \
  && apt-get install -y --no-install-recommends libpq-dev gcc \
  && rm -rf /var/lib/apt/lists/*

# Python 依赖（使用国内 PyPI 镜像加速，可选）
ENV PIP_INDEX_URL="https://mirrors.aliyun.com/pypi/simple"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用代码（若已复制 deploy/.env.volcengine.plan-a 为 backend/.env，会一并进镜像并由 entrypoint 加载）
COPY . .

# 收集静态文件
RUN python manage.py collectstatic --noinput 2>/dev/null || true

RUN chmod +x /app/entrypoint.sh

EXPOSE 8001

ENTRYPOINT ["/app/entrypoint.sh"]


