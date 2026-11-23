<div align="center">

<img src="ui/public/app-icon.png" alt="DSH Desktop Logo" width="96" height="96" />

# DSH Desktop for Linux

**轻量级、原生的 DeepSeek Harness (`dsh`) Linux 桌面客户端**

[![License: MIT](https://img.shields.io/badge/License-MIT-4D6BFE.svg)](LICENSE)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux%20x86__64-1D2433.svg)](#系统要求)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.x-24C8DB.svg)](https://v2.tauri.app/)
[![CI](https://github.com/ctrlsea/dsh-desktop-linux/actions/workflows/ci.yml/badge.svg)](https://github.com/ctrlsea/dsh-desktop-linux/actions/workflows/ci.yml)

</div>

---

## 简介

**DSH Desktop** 是基于 **Tauri 2 + Rust + 系统 WebKitGTK 4.1 + React/Tailwind** 构建的 Linux 原生桌面客户端，用于连接本地 DeepSeek Harness（`dsh` ≥ `0.2.2-rc.5`）。

相比 Electron 方案，它直接复用系统 WebKitGTK，安装包仅 **~4 MB**，同时完整兼容 DSH 的工具审批、提问交互、后台任务、插件生态、Skill 技能与多级子代理编排。

> [!NOTE]
> 本项目为社区开源的**非官方** Linux 桌面客户端，与 DeepSeek 官方无隶属关系。使用前需自行安装并登录官方 `dsh` CLI。

---

## 核心特性

- **原生轻量体验**：基于 Tauri 2 + Rust，`.deb` 安装包约 4 MB，40ms 流式增量合并 + 轻量长文渲染，高速输出不卡顿。
- **DeepSeek 浅色 / 深色双主题**：清爽蓝白主题与深海暗色主题一键切换，支持 `Ctrl +` / `Ctrl -` / `Ctrl 0` 全局缩放。
- **会话级三视图工作区**：每个会话独立维护 **`对话` | `轨迹` | `子代理`** 视图：
  - **对话**：自动折叠工具调用前的思考与过程说明，主回复清晰聚焦；支持图片附件、交付物卡片预览、消息排队与不中断后台任务的打断插队。
  - **轨迹**：按轮次展示思考、工具调用与耗时时间线。
  - **子代理关系树**：递归解析多级子代理树，准确区分「运行中 / 已完成 / 已中止 / 异常」，点击任意节点即可查看该子代理的完整对话记录。
- **完整 DSH 生态兼容**：
  - 原生挂载 DSH 客户端插件槽位（侧栏面板、输入框工具栏、工具自定义视图、覆盖层等），无需 iframe。
  - 内置 **插件管理器** 与 **Skill 技能管理器**（支持用户级/项目级 Skill 增删改查，以及输入框 `/` 快捷补全）。
  - 支持 Agent 模式预设切换（标准 / PTC / 极简 / 插件开发及第三方扩展预设）、模型与推理强度选择、权限模式与工作目录切换。
- **Linux 原生系统集成**：
  - 纯 Rust `ksni` 原生 D-Bus 托盘（`StatusNotifierItem` + `DBusMenu`），完美适配 Ubuntu GNOME / Wayland。
  - 单实例保护、桌面通知、会话右键菜单（置顶、重命名、Fork 分叉、归档）及快照回退。

---

## 系统要求

- **操作系统**：Linux x86_64（已在 Ubuntu 24.04 / 26.04 Wayland + GNOME 测试）
- **DeepSeek Harness**：已安装 `dsh` ≥ `0.2.2-rc.5` 且在 `PATH` 中可用
- **从源码构建依赖**：
  - Rust ≥ 1.77（`cargo`、`cargo-tauri`）
  - Node.js ≥ 22 & `pnpm`
  - 系统开发库（Ubuntu / Debian）：
    ```bash
    sudo apt update
    sudo apt install -y \
      build-essential pkg-config curl \
      libwebkit2gtk-4.1-dev libgtk-3-dev \
      librsvg2-dev libssl-dev patchelf
    ```

---

## 安装与构建

### 方式一：下载预编译 `.deb`（推荐）

前往 [Releases](https://github.com/ctrlsea/dsh-desktop-linux/releases) 页面下载最新 `dsh-desktop_*_amd64.deb`：

```bash
sudo apt install ./dsh-desktop_*_amd64.deb
```

### 方式二：从源码本地构建 `.deb`

```bash
git clone https://github.com/ctrlsea/dsh-desktop-linux.git
cd dsh-desktop-linux

# 安装前端依赖
pnpm --dir ui install

# 安装 Tauri CLI（如尚未安装）
cargo install tauri-cli --version "^2"

# 一键构建前端与 .deb 安装包
./scripts/build-deb.sh
```

构建完成后，安装包位于 `.build-target/release/bundle/deb/` 目录。

### 开发模式运行

```bash
pnpm --dir ui install
cd src-tauri && cargo tauri dev
```

---

## 常用快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `Ctrl + 1` | 切换到当前会话「对话」视图 |
| `Ctrl + 2` | 切换到当前会话「轨迹」视图 |
| `Ctrl + 3` | 切换到当前会话「子代理」关系树 |
| `Ctrl + 4` | 打开「插件与技能管理」 |
| `Ctrl + B` | 展开 / 收起左侧会话栏 |
| `Ctrl + +` / `-` / `0` | 放大 / 缩小 / 重置界面缩放 |
| `/`（输入框内） | 触发 Skill 技能快捷补全 |

---

## 项目结构

```text
├── bridge-plugin/        # 注入 dsh --profile web 的本地 JSON-RPC 桥接插件
├── scripts/              # 构建与 .deb 打包脚本
├── src-tauri/            # Rust 主进程（SDK 适配器、日志解析、Skill 管理、ksni 托盘）
└── ui/                   # React + TypeScript + Tailwind CSS 前端界面
```

---

## 数据存储

DSH Desktop 直接读写标准 `~/.dsh/` 目录，与官方 `dsh` CLI / Web 完全互通：
- 会话日志：`~/.dsh/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`
- 附件缓存：`~/.dsh/attachments/`
- 用户技能：`~/.dsh/skills/`

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
