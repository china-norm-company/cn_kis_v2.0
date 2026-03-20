#!/usr/bin/env bash
set -euo pipefail

# 微信小程序网络链路快速诊断脚本
# 用法:
#   bash scripts/check_wechat_network_chain.sh
#   DOMAIN=mini.utest.cc ORIGIN_IP=118.196.64.48 bash scripts/check_wechat_network_chain.sh

DOMAIN="${DOMAIN:-mini.utest.cc}"
ORIGIN_IP="${ORIGIN_IP:-118.196.64.48}"
API_HEALTH_PATH="${API_HEALTH_PATH:-/api/v1/health}"
TIMEOUT="${TIMEOUT:-12}"

RED="$(printf '\033[31m')"
GREEN="$(printf '\033[32m')"
YELLOW="$(printf '\033[33m')"
BLUE="$(printf '\033[34m')"
RESET="$(printf '\033[0m')"

ok() { printf "%b[PASS]%b %s\n" "${GREEN}" "${RESET}" "$*"; }
warn() { printf "%b[WARN]%b %s\n" "${YELLOW}" "${RESET}" "$*"; }
fail() { printf "%b[FAIL]%b %s\n" "${RED}" "${RESET}" "$*"; }
info() { printf "%b[INFO]%b %s\n" "${BLUE}" "${RESET}" "$*"; }

section() {
  printf "\n%s\n" "============================================================"
  printf "%s\n" "$*"
  printf "%s\n" "============================================================"
}

extract_ip() {
  awk 'NF{print $1; exit}'
}

section "1) 基础参数"
info "DOMAIN=${DOMAIN}"
info "ORIGIN_IP=${ORIGIN_IP}"
info "API_HEALTH_PATH=${API_HEALTH_PATH}"
info "TIMEOUT=${TIMEOUT}s"

section "2) 本机代理状态"
scutil --proxy || true
networksetup -getwebproxy Wi-Fi || true
networksetup -getsecurewebproxy Wi-Fi || true
networksetup -getsocksfirewallproxy Wi-Fi || true

if ps aux | awk 'BEGIN{IGNORECASE=1} /clash-core-service|clash|mihomo|v2ray|xray|sing-box|tun2socks/ && !/awk/' | awk 'NR==1{exit 0} END{exit 1}'; then
  warn "检测到本机存在代理/TUN 相关进程，可能触发 fake-ip 或 DNS 劫持。"
else
  ok "未检测到常见代理/TUN 进程。"
fi

section "3) DNS 解析对比"
SYS_IP="$(dig "${DOMAIN}" A +short | extract_ip || true)"
G8_IP="$(dig @8.8.8.8 "${DOMAIN}" A +short | extract_ip || true)"
CF_IP="$(dig @1.1.1.1 "${DOMAIN}" A +short | extract_ip || true)"
DOH_G_IP="$(curl --noproxy '*' --max-time "${TIMEOUT}" -s "https://dns.google/resolve?name=${DOMAIN}&type=A" | sed -n 's/.*"data":"\([0-9.]*\)".*/\1/p' | head -n1 || true)"
DOH_CF_IP="$(curl --noproxy '*' --max-time "${TIMEOUT}" -s "https://cloudflare-dns.com/dns-query?name=${DOMAIN}&type=A" -H "accept: application/dns-json" | sed -n 's/.*"data":"\([0-9.]*\)".*/\1/p' | head -n1 || true)"

info "dig(system)       -> ${SYS_IP:-<empty>}"
info "dig(8.8.8.8)      -> ${G8_IP:-<empty>}"
info "dig(1.1.1.1)      -> ${CF_IP:-<empty>}"
info "DoH(dns.google)   -> ${DOH_G_IP:-<empty>}"
info "DoH(cloudflare)   -> ${DOH_CF_IP:-<empty>}"

if [[ -n "${SYS_IP}" && "${SYS_IP}" =~ ^198\.18\. ]]; then
  fail "系统 DNS 返回 ${SYS_IP}（疑似 fake-ip 劫持段）。"
fi

if [[ -n "${DOH_G_IP}" && -n "${SYS_IP}" && "${DOH_G_IP}" != "${SYS_IP}" ]]; then
  warn "系统 DNS 与 DoH 结果不一致，存在 DNS 劫持/污染可能。"
else
  ok "系统 DNS 与 DoH 基本一致。"
fi

section "4) HTTPS/TLS 链路检查"
info "检查 https://${DOMAIN}${API_HEALTH_PATH}"
if curl --noproxy '*' -I --max-time "${TIMEOUT}" "https://${DOMAIN}${API_HEALTH_PATH}" >/tmp/wechat_https_head.out 2>/tmp/wechat_https_head.err; then
  ok "域名 HTTPS 可连通。"
  sed -n '1,10p' /tmp/wechat_https_head.out || true
else
  fail "域名 HTTPS 连通失败。"
  sed -n '1,20p' /tmp/wechat_https_head.err || true
fi

info "检查 origin 443: ${ORIGIN_IP}"
if echo | openssl s_client -connect "${ORIGIN_IP}:443" -servername "${DOMAIN}" -tls1_2 >/tmp/wechat_tls.out 2>/tmp/wechat_tls.err; then
  if grep -qE "BEGIN CERTIFICATE|subject=|issuer=" /tmp/wechat_tls.out; then
    ok "origin:443 返回了证书链。"
  else
    warn "origin:443 可连接但未读到证书信息，需检查 Nginx/证书配置。"
  fi
else
  fail "origin:443 TLS 握手失败。"
  sed -n '1,30p' /tmp/wechat_tls.err || true
fi

section "5) API 健康与 HTTP 回源检查"
if curl --noproxy '*' --max-time "${TIMEOUT}" -s "http://${ORIGIN_IP}${API_HEALTH_PATH}" >/tmp/wechat_http_origin.json; then
  ok "origin HTTP 可达（仅用于后端活性确认）。"
  sed -n '1,3p' /tmp/wechat_http_origin.json || true
else
  warn "origin HTTP 不可达。"
fi

section "6) 结论建议"
if [[ -n "${SYS_IP}" && "${SYS_IP}" =~ ^198\.18\. ]]; then
  warn "优先处理本机/网络 DNS 劫持：关闭 Clash fake-ip 或切换 redir-host。"
fi
if ! curl --noproxy '*' -I --max-time "${TIMEOUT}" "https://${DOMAIN}${API_HEALTH_PATH}" >/dev/null 2>&1; then
  warn "HTTPS 仍不通：请先修复域名证书与 443 监听，再测微信登录。"
fi
ok "脚本执行完成。"

