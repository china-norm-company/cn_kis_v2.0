#!/usr/bin/env bash
# 确保 Maestro E2E 能找到 Java 和 maestro 命令
# 若已通过 Homebrew 安装 openjdk@17：export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
# Maestro 安装脚本会往 ~/.zshrc 写入：export PATH="$PATH:$HOME/.maestro/bin"
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Homebrew OpenJDK（常见路径）
for jdk in /opt/homebrew/opt/openjdk@17/bin /opt/homebrew/opt/openjdk/bin; do
  if [[ -d "$jdk" ]]; then
    export PATH="$jdk:$PATH"
    break
  fi
done
# 用户本地 Maestro
if [[ -d "$HOME/.maestro/bin" ]]; then
  export PATH="$PATH:$HOME/.maestro/bin"
fi

if ! command -v maestro &>/dev/null; then
  echo "Error: maestro not found. Install: curl -Ls https://get.maestro.mobile.dev | bash"
  exit 1
fi
if ! command -v java &>/dev/null; then
  echo "Error: java not found. Install: brew install openjdk@17"
  exit 1
fi

exec maestro "$@"
