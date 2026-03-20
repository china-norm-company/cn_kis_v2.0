#!/usr/bin/env bash
# CN KIS V2.0 - 阿里云自托管 Runner 安装脚本
# 在阿里云服务器上运行，解决 GitHub Actions 免费分钟数限制问题
# 自托管 Runner 完全免费，不消耗 GitHub Actions 分钟
#
# 使用方法：
#   1. SSH 登录阿里云服务器
#   2. bash <(curl -s https://raw.githubusercontent.com/china-norm-company/cn_kis_v2.0/main/ops/scripts/setup_self_hosted_runner.sh)
#   或
#   1. 复制本脚本内容到服务器
#   2. bash setup_self_hosted_runner.sh

set -euo pipefail

RUNNER_DIR="/home/wuxianyu/actions-runner"
REPO="china-norm-company/cn_kis_v2.0"

echo "================================================================"
echo "  CN KIS V2.0 - GitHub Actions 自托管 Runner 安装"
echo "  仓库: $REPO"
echo "================================================================"
echo ""

# Step 1: 创建 Runner 目录
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# Step 2: 下载 Runner（amd64 Linux）
RUNNER_VERSION="2.321.0"
RUNNER_FILE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

if [ ! -f "$RUNNER_FILE" ]; then
    echo "📥 下载 GitHub Actions Runner v${RUNNER_VERSION}..."
    curl -sLO "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"
    echo "✅ 下载完成"
fi

echo "📦 解压..."
tar xzf "$RUNNER_FILE"

# Step 3: 配置 Runner
# ⚠️  注意：注册 token 有效期 1 小时，需要在 V2 仓库 Settings → Actions → Runners 新建 token
echo ""
echo "🔑 Step 3: 配置 Runner（需要注册 token）"
echo ""
echo "   请在以下地址获取最新注册 token："
echo "   https://github.com/china-norm-company/cn_kis_v2.0/settings/actions/runners/new"
echo ""
echo -n "   请输入注册 token: "
read -r RUNNER_TOKEN

./config.sh \
    --url "https://github.com/$REPO" \
    --token "$RUNNER_TOKEN" \
    --name "aliyun-test-runner" \
    --labels "aliyun,test,linux,x64,self-hosted" \
    --work "_work" \
    --unattended

echo "✅ Runner 配置完成"

# Step 4: 安装为 systemd 服务
echo ""
echo "⚙️  Step 4: 安装为系统服务..."
sudo ./svc.sh install wuxianyu
sudo ./svc.sh start

echo ""
echo "✅ Self-hosted Runner 已安装并启动！"
echo ""
echo "验证："
echo "  sudo ./svc.sh status"
echo "  # 或在 GitHub 上查看："
echo "  # https://github.com/china-norm-company/cn_kis_v2.0/settings/actions/runners"
echo ""
echo "安装完成后，V2 的 GitHub Actions workflow 将自动使用此 Runner，"
echo "不再消耗 GitHub Actions 免费分钟数。"
