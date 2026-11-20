# DSH Linux 桌面端（Tauri 2）

基于 Tauri 2 + Rust + 系统 WebKitGTK 4.1 的 DSH Linux 原生桌面壳。
目标：最低资源占用 + 最高性能的完整 DSH 桌面体验。

设计文档见 [设计文档.md](设计文档.md)。

## 环境要求

- Ubuntu 26.04 x86_64
- Rust ≥ 1.77 / Node ≥ 24.9 / pnpm
- WebKitGTK 4.1 开发头文件（见设计文档 §2.3）
- `dsh` ≥ 0.2.2-rc.5

## 状态

- [x] 阶段 0：环境准备（仓库初始化 + 系统依赖 + Tauri CLI）
