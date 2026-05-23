#!/bin/bash
# ─────────────────────────────────────────────────────────
# BCI Tracker 一键部署脚本
# 适用于全新 Ubuntu 22.04 服务器
# 使用方法：复制整段脚本粘贴到服务器终端执行
# ─────────────────────────────────────────────────────────

set -e

echo "🧠 BCI Tracker 一键部署开始..."
echo "─────────────────────────────────"

# 1. 系统更新 + 安装必要工具
echo "📦 [1/6] 更新系统 & 安装依赖..."
apt-get update -qq && apt-get install -y -qq git curl

# 2. 安装 Node.js 20
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    echo "📦 [2/6] 安装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
else
    echo "✅ [2/6] Node.js $(node -v) 已安装"
fi

# 3. 安装 PM2
if ! command -v pm2 &>/dev/null; then
    echo "📦 [3/6] 安装 PM2..."
    npm install -g pm2
else
    echo "✅ [3/6] PM2 已安装"
fi

# 4. 克隆项目
echo "📥 [4/6] 拉取代码..."
cd /root
if [ -d "bci-tracker" ]; then
    cd bci-tracker && git pull
else
    git clone https://github.com/xtrailbeima/bci-tracker.git
    cd bci-tracker
fi
npm install --production

# 5. 配置环境变量
echo "🔐 [5/6] 配置 API Keys..."
cat > .env << 'EOF'
GEMINI_API_KEY=YOUR_GEMINI_KEY
HUNYUAN_API_KEY=YOUR_HUNYUAN_KEY
PORT=4000
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_KEY
EOF
chmod 600 .env

# 6. 启动服务 + 开机自启
echo "🚀 [6/6] 启动服务..."
pm2 delete bci-tracker 2>/dev/null || true
pm2 start server.js --name bci-tracker --node-args="--env-file=.env"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# 7. 开放防火墙端口
if command -v ufw &>/dev/null; then
    ufw allow 4000/tcp 2>/dev/null || true
fi

# 完成
echo ""
echo "─────────────────────────────────"
echo "✅ BCI Tracker 部署完成！"
echo ""
echo "🌐 访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP'):4000"
echo "📊 服务状态:"
pm2 status
echo ""
echo "💡 常用命令："
echo "   pm2 logs bci-tracker    # 查看日志"
echo "   pm2 restart bci-tracker # 重启服务"
echo "   pm2 status              # 查看状态"
