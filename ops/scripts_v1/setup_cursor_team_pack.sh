#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_RULE="${ROOT_DIR}/.cursor/rules/cursor-ai-collaboration.mdc"
TARGET_RULE_DIR="${HOME}/.cursor/rules"
TARGET_RULE_FILE="${TARGET_RULE_DIR}/cursor-ai-collaboration.mdc"
TARGET_MCP_FILE="${HOME}/.cursor/mcp.json"

echo "[1/4] 检查源规则文件..."
if [[ ! -f "${SOURCE_RULE}" ]]; then
  echo "未找到规则文件: ${SOURCE_RULE}"
  exit 1
fi

echo "[2/4] 同步规则到本机 Cursor..."
mkdir -p "${TARGET_RULE_DIR}"
cp "${SOURCE_RULE}" "${TARGET_RULE_FILE}"
echo "已同步: ${TARGET_RULE_FILE}"

echo "[3/4] 生成 GitNexus MCP 配置参考..."
cat > "${ROOT_DIR}/docs/CURSOR_MCP_GITNEXUS_SNIPPET.json" <<'EOF'
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
EOF
echo "已生成: docs/CURSOR_MCP_GITNEXUS_SNIPPET.json"

echo "[4/4] 安装说明"
if [[ -f "${TARGET_MCP_FILE}" ]]; then
  echo "检测到现有 ${TARGET_MCP_FILE}，请手动合并 gitnexus 配置。"
else
  echo "未检测到 ${TARGET_MCP_FILE}。可将 docs/CURSOR_MCP_GITNEXUS_SNIPPET.json 复制为该文件。"
fi

echo "完成。建议下一步：在仓库根目录执行 npx gitnexus analyze"
