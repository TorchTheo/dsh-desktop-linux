#!/usr/bin/env bash
# DSH Linux 桌面端 —— 环境初始化（设计文档 §8 阶段 0）
# 用法：bash setup-env.sh
set -euo pipefail
cd "$(dirname "$0")"

# 关键：把 cargo 临时目录与 target 指到工作区，避开 /tmp 配额限制
export TMPDIR="$PWD/.build-tmp"
export CARGO_TARGET_DIR="$PWD/.build-target"
mkdir -p "$TMPDIR" "$CARGO_TARGET_DIR"
echo "[0/5] TMPDIR=$TMPDIR  CARGO_TARGET_DIR=$CARGO_TARGET_DIR"

# 1. 系统开发依赖（需 sudo 密码；webkit2gtk-4.1 运行时系统已装，这里补 dev 头文件）
echo "[1/5] 安装系统开发依赖 ..."
sudo apt-get update
sudo apt-get install -y \
  build-essential pkg-config curl wget file \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libgtk-3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libayatana-appindicator3-dev \
  libssl-dev \
  patchelf

# 2. 验证 pkg-config 能找到 webkit2gtk-4.1
echo "[2/5] 验证 WebKitGTK 4.1 开发头文件 ..."
pkg-config --modversion webkit2gtk-4.1
pkg-config --modversion javascriptcoregtk-4.1

# 2.5 生成应用图标（Tauri 打包/上下文宏必需；纯 Python 标准库，无额外依赖）
echo "[2.5/5] 生成应用图标 ..."
python3 gen_icons.py
file src-tauri/icons/*.png

# 3. 安装 Tauri CLI（cargo install 用上面的 TMPDIR，不再占用 /tmp）
echo "[3/5] 安装 Tauri CLI v2 ..."
if ! command -v cargo-tauri >/dev/null 2>&1; then
  cargo install tauri-cli --version '^2' --locked
else
  echo "cargo-tauri 已存在，跳过"
fi
cargo tauri --version

# 4. 编译验证最小骨架
echo "[4/5] 编译验证 ..."
cd src-tauri
cargo check
cargo build

echo "[5/5] 环境初始化完成：可运行 cargo tauri dev"
