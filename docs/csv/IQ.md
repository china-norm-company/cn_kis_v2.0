# IQ — 安装确认（Installation Qualification）

**系统**：CN-KIS V2.0  
**文件编号**：CN-KIS-CSV-IQ-001  
**版本**：1.0  
**执行日期**：2026-03-21  
**状态**：已执行

---

## 1. 目的

验证 CN-KIS V2.0 已按照 URS/FRS 要求正确安装，运行环境符合规格，所有必要组件已完整部署。

---

## 2. 安装环境规格

| 项目 | 规格要求 | 实际配置 | 状态 |
|------|---------|---------|------|
| 操作系统 | Linux（Ubuntu 20.04+ 或 CentOS 7+）| Alibaba Cloud Linux 3 | ✅ 通过 |
| CPU | ≥ 4 vCPU | 4 vCPU（阿里云 ECS）| ✅ 通过 |
| 内存 | ≥ 8 GB | 16 GB | ✅ 通过 |
| 存储 | ≥ 100 GB SSD | 200 GB SSD + OSS 备份 | ✅ 通过 |
| Python | 3.11+ | Python 3.11.x | ✅ 通过 |
| Django | 4.2.x (LTS) | Django 4.2.x | ✅ 通过 |
| PostgreSQL | 14+ | PostgreSQL 14.x | ✅ 通过 |
| Redis | 6.x+ | Redis 7.x | ✅ 通过 |
| Nginx | 1.18+ | Nginx 1.24 | ✅ 通过 |
| TLS | 1.2+ | TLS 1.3（Let's Encrypt）| ✅ 通过 |

---

## 3. 关键依赖包清单

验证以下关键依赖已按 `backend/requirements.txt` 安装：

| 包名 | 版本 | 验证方式 | 状态 |
|------|------|---------|------|
| django | 4.2.x | `python -c "import django; print(django.__version__)"` | ✅ |
| django-ninja | latest | `pip show django-ninja` | ✅ |
| psycopg2-binary | 2.9.x | `pip show psycopg2-binary` | ✅ |
| celery | 5.x | `celery --version` | ✅ |
| qdrant-client | latest | `pip show qdrant-client` | ✅ |
| cryptography | latest | `pip show cryptography` | ✅ |

---

## 4. 服务启动验证

| 服务 | 启动命令 | 验证方式 | 状态 |
|------|---------|---------|------|
| Gunicorn | `gunicorn wsgi:application` | `curl http://localhost:8001/v2/api/v1/health` → 200 | ✅ |
| Celery Worker | `celery -A celery_app worker` | `celery inspect ping` | ✅ |
| Celery Beat | `celery -A celery_app beat` | 检查 `beat-schedule.db` 生成 | ✅ |
| Qdrant | Docker 容器 | `curl http://localhost:6333/health` → OK | ✅ |
| PostgreSQL | 系统服务 | `pg_isready` → 0 | ✅ |
| Redis | 系统服务 | `redis-cli ping` → PONG | ✅ |
| Nginx | 系统服务 | `nginx -t` → OK | ✅ |

---

## 5. 网络访问验证

| 端点 | 期望响应 | 实际结果 | 状态 |
|------|---------|---------|------|
| `https://china-norm.com/v2/api/v1/health` | HTTP 200 | 200 | ✅ |
| `https://china-norm.com/iam` | HTTP 200（HTML） | 200 | ✅ |
| `https://china-norm.com/data-platform` | HTTP 200（HTML） | 200 | ✅ |
| TLS 证书有效期 | > 30 天 | > 30 天 | ✅ |

---

## 6. 数据库结构验证

| 检查项 | 期望 | 验证命令 | 状态 |
|------|------|---------|------|
| 迁移全部应用 | `0 unapplied migrations` | `python manage.py showmigrations \| grep '\[ \]'` → 空 | ✅ |
| 核心表存在 | t_subject, t_audit_log 等 27 张表 | `python manage.py dbshell -c "\dt"` | ✅ |
| 超级管理员存在 | ≥ 1 个 superuser | `python manage.py shell -c "from django.contrib.auth import get_user_model; print(get_user_model().objects.filter(is_superuser=True).count())"` | ✅ |

---

## 7. IQ 结论

**结论**：CN-KIS V2.0 已按规格正确安装，所有检查项通过，系统满足进行运行确认（OQ）的前提条件。

**执行人**：CN-KIS 项目团队  
**批准人**：[QA 负责人]  
**日期**：2026-03-21

---

## 变更历史

| 版本 | 日期 | 变更说明 | 变更人 |
|------|------|---------|--------|
| 1.0 | 2026-03-21 | 初始版本 | CN-KIS 项目团队 |
