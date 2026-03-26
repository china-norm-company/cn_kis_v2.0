#!/bin/bash
echo "启动OpenClaw Gateway..."

# 检查openclaw命令
if command -v openclaw > /dev/null 2>&1; then
    echo "[找到] openclaw命令"
    
    # 检查端口
    if lsof -i :18789 > /dev/null 2>&1; then
        echo "[已运行] Gateway已在运行"
        lsof -i :18789
    else
        echo "[启动] 正在启动Gateway..."
        nohup openclaw gateway start > ~/.openclaw/logs/gateway.log 2>&1 &
        sleep 3
        
        if lsof -i :18789 > /dev/null 2>&1; then
            echo "[成功] Gateway已启动"
            echo "访问: http://127.0.0.1:18789/overview"
        else
            echo "[失败] Gateway启动失败"
            echo "查看日志: tail -f ~/.openclaw/logs/gateway.log"
        fi
    fi
else
    echo "[错误] openclaw命令未找到"
    echo "请检查安装或PATH配置"
fi
