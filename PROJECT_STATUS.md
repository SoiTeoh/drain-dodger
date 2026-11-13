# 公路车躲下水道（Drain Dodger）— 项目状态

## 1. 项目定位

Idea Lab v2 — Project 03：基于 **Vite + TypeScript (strict) + 原生 HTML5 Canvas 2D + Web Audio API** 的第一人称伪 3D 竖屏公路车避障小游戏。

## 2. 当前开发阶段

- **MVP 核心开发、试玩问题修复与自动化验收已完成**（Task 1～5 对应工程搭建、伪 3D 透视投影与公平生成器、骑行物理与超车状态机、第一人称弯把与道路渲染、合成音效、单元测试及三视口 Playwright 检查；已修复超车红车驶远后隐形撞车问题，并将 Near Miss 外框容差微调至 `0.13`）。
- **已同步至 GitHub 仓库**：`origin`（`https://github.com/SoiTeoh/drain-dodger.git`）`main` 分支已完成提交并推送。

## 3. 伪 3D 透视与核心参数

- 逻辑视口：`390×640`，固定步长 `1000/60 ms`（帧间隔钳制 `<= 50 ms`）。
- 透视投影：`horizonY = 235`，`cameraHeight = 1.0`，`cameraDepth = 0.85`，`roadScaleY = 300`，`collisionZ = 0.945`（对应前轮着地基准点 `y ≈ 505`），`drawDistanceZ = 24`。
- 安全走廊：`worldX ∈ [-1.0, +1.0]`，轮胎碰撞半宽 `0.055 × 0.88`（12% 宽松容错），Near Miss 外框 `+0.08`，公平生成器保证每个 `Z` 窗口至少保留 `>= 0.28` 连续安全宽度。

## 4. 最新自动化验证结果

- `npm.cmd --prefix D:\Codex\idea-lab\drain-dodger run typecheck`：通过（0 错误）。
- `npm.cmd --prefix D:\Codex\idea-lab\drain-dodger test`：1 个测试文件、18 项 Vitest 单元测试全部通过（`tests/rules.test.ts`，包含连续 200 波公平生成器无死局验证）。
- `npm.cmd --prefix D:\Codex\idea-lab\drain-dodger run build`：通过（`dist/assets/index-*.js` `27.14 kB` / gzip `9.38 kB`）。
- Playwright Chromium 三视口端到端验证（`360×640`、`390×844` 含 `?debug=1`、`1280×800`）：
  - 均满足 `fitsViewport: true`、`overflow: false`。
  - 模拟点击开局、连续左右转向全程 0 控制台错误、0 页面异常、0 外部网络请求。

## 5. 待真人试玩验证项

- 触屏/桌面端连续压弯转向的惯性阻尼与回正手感。
- 远距离下 `||||` 竖缝铁箅子与 `====` 横纹格栅的辨识清晰度及中后期加速节奏。
- 试玩确认后再创建 Git 提交并推送至 `origin/main`。
