# DSH Linux 桌面端（Tauri 2）

基于 Tauri 2 + Rust + 系统 WebKitGTK 4.1 的 DSH Linux 原生桌面壳。
目标：最低资源占用 + 最高性能的完整 DSH 桌面体验。

设计文档见 [设计文档.md](设计文档.md)。

## 环境要求

- Ubuntu 26.04 x86_64
- Rust ≥ 1.77 / Node ≥ 24.9 / pnpm
- WebKitGTK 4.1 开发头文件（见设计文档 §2.3）
- `dsh` ≥ 0.2.2-rc.5

## 仓库结构

- `src-tauri/` — Tauri 2 骨架（Rust 主进程 + 配置 + capabilities）
- `ui/` — 前端占位页（PoC hello-world）
- `setup-env.sh` — 环境初始化脚本（设计文档 §8 阶段 0）
- `设计文档.md` — 完整设计

## 当前状态

- [x] 仓库初始化（git init + 基线提交）
- [x] 环境探测：git 2.53 / rustc 1.99.1 / node 26.13 / pnpm 12.21 / dsh 0.2.2-rc.5 均就绪
- [x] 缺失项确认：`libwebkit2gtk-4.1-dev` 等 dev 包未装、Tauri CLI 未装
- [x] Tauri 项目骨架已创建（待提交）
- [ ] 系统开发依赖安装（需 sudo 交互式密码）
- [ ] Tauri CLI 安装（首次尝试因 `/tmp` 配额耗尽失败；脚本已改 TMPDIR 到工作区）
- [ ] `cargo check` / `cargo build` 编译验证

## 环境初始化

在本机终端执行（sudo 会提示输入密码）：

```bash
bash setup-env.sh
```

脚本做的事：把 cargo 临时目录设到 `.build-tmp/`、target 设到 `.build-target/`（避开 `/tmp` 配额），安装 WebKitGTK 4.1 等 dev 包，安装 Tauri CLI v2，最后 `cargo check && cargo build` 验证。

初始化完成后：

```bash
cd src-tauri && cargo tauri dev
```
