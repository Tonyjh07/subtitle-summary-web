#!/usr/bin/env bash
#
# subtitle-summary-web Linux 一键部署脚本
#
# 用法（在仓库根目录执行）：
#   bash scripts/deploy.sh install    # 首次部署：装依赖 → 构建 → 注册 systemd 服务并启动
#   bash scripts/deploy.sh update     # 更新部署：git 拉取 → 装依赖 → 构建 → 重启服务
#   bash scripts/deploy.sh start|stop|restart|status|logs
#
# 可配置环境变量（也可直接改下面的默认值）：
#   APP_DIR     仓库目录          默认 /opt/subtitle-summary-web
#   APP_PORT    监听端口          默认 3000
#   APP_USER    运行用户          默认 www-data（不存在则回退当前用户）
#   SERVICE     systemd 服务名    默认 subtitle-summary
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/subtitle-summary-web}"
APP_PORT="${APP_PORT:-3000}"
SERVICE="${SERVICE:-subtitle-summary}"
APP_USER="${APP_USER:-}"
NODE_MAJOR=20                      # Next 14 / engines >=18.17，取 LTS 20 稳妥
PNPM_VERSION="$(node -e "console.log(require('./package.json').packageManager.split('@')[1])" 2>/dev/null || echo 9.15.0)"

log()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

need_root() { [ "$(id -u)" -eq 0 ] || die "该子命令需要 root（sudo bash scripts/deploy.sh $1）"; }

# ---------- 环境检查 ----------
ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    log "安装 Node.js ${NODE_MAJOR}.x（NodeSource）"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  node -v || die "Node.js 安装失败"
  command -v git  >/dev/null 2>&1 || { log "安装 git"; apt-get install -y git; }
}

ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    log "安装 pnpm@${PNPM_VERSION}"
    corepack enable >/dev/null 2>&1 || true
    if ! command -v pnpm >/dev/null 2>&1; then
      npm install -g "pnpm@${PNPM_VERSION}"
    fi
  fi
  pnpm -v
}

ensure_user() {
  if [ -z "$APP_USER" ]; then
    if id www-data >/dev/null 2>&1; then APP_USER=www-data; else APP_USER="$(id -un)"; fi
  fi
  id "$APP_USER" >/dev/null 2>&1 || die "用户不存在：$APP_USER"
}

# ---------- 构建 ----------
build_app() {
  cd "$APP_DIR"
  log "安装依赖（frozen-lockfile）"
  pnpm install --frozen-lockfile
  log "构建（next build）"
  rm -rf .next
  pnpm build
  # .next 归属运行用户：systemd 以 DynamicUser/指定用户跑时需要可读
  chown -R "$APP_USER:" .next 2>/dev/null || true
}

# ---------- env ----------
ensure_env() {
  if [ ! -f "$APP_DIR/.env.local" ]; then
    if [ -f "$APP_DIR/.env.example" ]; then
      cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
      warn "已从 .env.example 生成 .env.local —— 如需全站 LLM 兜底 Key，请编辑它"
    fi
  fi
}

# ---------- systemd ----------
write_unit() {
  cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=subtitle-summary-web (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=HOSTNAME=0.0.0.0
ExecStart=$(command -v node) node_modules/next/dist/bin/next start -p ${APP_PORT}
Restart=always
RestartSec=3
# 服务进程为 simple 型，长请求（字幕 5-7s / LLM 总结 30-70s）不受启动超时影响；
# 仅限制 stop 时的优雅退出等待
TimeoutStopSec=30

# 加固（可按需注释）
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null 2>&1
}

# ---------- 子命令 ----------
cmd_install() {
  need_root install
  ensure_node
  ensure_user
  ensure_pnpm
  [ -d "$APP_DIR" ] || die "仓库不在 $APP_DIR —— 先 git clone 到该目录：sudo git clone <repo> $APP_DIR"
  ensure_env
  build_app
  write_unit
  systemctl restart "$SERVICE"
  log "完成：http://$(hostname -f | head -1):${APP_PORT}  （systemctl status ${SERVICE} 查看状态）"
}

cmd_update() {
  need_root update
  ensure_pnpm
  log "拉取代码：$APP_DIR"
  git -C "$APP_DIR" pull --ff-only
  ensure_env
  build_app
  systemctl restart "$SERVICE"
  log "更新完成"
}

cmd_start()   { need_root start;   systemctl start "$SERVICE"; }
cmd_stop()    { need_root stop;    systemctl stop "$SERVICE"; }
cmd_restart() { need_root restart; systemctl restart "$SERVICE"; }
cmd_status()  { systemctl status "$SERVICE" --no-pager; }
cmd_logs()    { journalctl -u "$SERVICE" -f -n 100; }

# 可选：Nginx 反代 + HTTPS（有域名时用；没有可跳过）
cmd_nginx() {
  need_root nginx
  local domain="${1:-}"
  [ -n "$domain" ] || die "用法：sudo bash scripts/deploy.sh nginx your.domain.com"
  command -v nginx >/dev/null 2>&1 || { apt-get install -y nginx; }
  command -v certbot >/dev/null 2>&1 || { apt-get install -y certbot python3-certbot-nginx; }
  cat > "/etc/nginx/sites-available/${SERVICE}" <<EOF
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;   # 字幕获取 + LLM 总结都是长请求
        proxy_buffering off;
    }
}
EOF
  ln -sf "/etc/nginx/sites-available/${SERVICE}" "/etc/nginx/sites-enabled/${SERVICE}"
  nginx -t && systemctl reload nginx
  certbot --nginx -d "$domain" --non-interactive --agree-tos -m "${CERTBOT_EMAIL:-admin@${domain}}"
  log "HTTPS 完成：https://${domain}"
}

case "${1:-}" in
  install)  cmd_install ;;
  update)   cmd_update ;;
  start)    cmd_start ;;
  stop)     cmd_stop ;;
  restart)  cmd_restart ;;
  status)   cmd_status ;;
  logs)     cmd_logs ;;
  nginx)    shift; cmd_nginx "$@" ;;
  *)
    cat <<'EOF'
subtitle-summary-web 部署脚本

  sudo bash scripts/deploy.sh install          首次部署（依赖 → 构建 → systemd 服务）
  sudo bash scripts/deploy.sh update           更新部署（git pull → 构建 → 重启）
  sudo bash scripts/deploy.sh start|stop|restart|status|logs
  sudo bash scripts/deploy.sh nginx domain.com 可选：Nginx 反代 + Let's Encrypt HTTPS

  环境变量可覆盖：APP_DIR（默认 /opt/subtitle-summary-web）
                  APP_PORT（默认 3000）  APP_USER（默认 www-data）
EOF
    ;;
esac
