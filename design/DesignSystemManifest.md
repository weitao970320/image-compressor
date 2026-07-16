# DesignSystemManifest

> 来源：用户选定 — 液态光方向
> 更新时间：2025-07-15（v2：增加亮色模式 + 光晕增强 + 布局调整）
> 置信度：高

---

## 1. 配色方案

### 暗色模式（默认 + :root.dark）

| 角色 | 色名 | OKLCH | HEX | 用途 |
|------|------|-------|-----|------|
| 底色 | Deep Navy | oklch(0.18 0.03 260) | `#0f1119` | 页面主背景 |
| 面板底 | Glass Dark | oklch(0.22 0.02 260) | `#1a1d28` | 卡片/面板半透明基底 |
| 文字主 | Frost White | oklch(0.96 0 0) | `#f0f1f5` | 主文字（提亮，对比度增强） |
| 文字次 | Mist Blue | oklch(0.70 0.02 240) | `#a0a4b8` | 次要文字/说明（提亮） |
| 文字三级 | Slate Blue | oklch(0.55 0.02 250) | `#6b6f85` | 三级文字 |
| 强调A | Electric Blue | oklch(0.65 0.18 255) | `#3b82f6` | 主强调色 / CTA / 聚焦 |
| 强调B | Neon Violet | oklch(0.60 0.20 290) | `#8b5cf6` | 辅助强调 / 渐变搭配 |
| 成功 | Mint Glow | oklch(0.70 0.18 160) | `#34d399` | 成功状态 |
| 警告 | Amber Glow | oklch(0.75 0.16 85) | `#fbbf24` | 警告状态 |
| 错误 | Rose Glow | oklch(0.60 0.20 15) | `#f87171` | 错误状态 |
| 边框 | Subtle Border | oklch(0.35 0.02 260) | `#2a2d3a` | 卡片/面板边框 |

### 亮色模式（prefers-color-scheme: light 或用户选择）

| 角色 | 色名 | OKLCH | HEX | 用途 |
|------|------|-------|-----|------|
| 底色 | Warm Gray | oklch(0.97 0.002 260) | `#f5f5f7` | 页面主背景（浅灰白，非纯白） |
| 面板底 | Glass White | oklch(1.0 0 0) | `#ffffff` | 卡片/面板半透明基底 |
| 文字主 | Deep Ink | oklch(0.18 0.02 270) | `#1a1a2e` | 主文字 |
| 文字次 | Slate | oklch(0.48 0.02 260) | `#555770` | 次要文字 |
| 文字三级 | Stone | oklch(0.60 0.02 260) | `#8889a0` | 三��文字 |
| 强调A | Royal Blue | oklch(0.55 0.20 255) | `#2563eb` | 主强调色 |
| 强调B | Deep Violet | oklch(0.52 0.22 290) | `#7c3aed` | 辅助强调 |
| 成功 | Forest Green | oklch(0.52 0.16 160) | `#059669` | 成功状态 |
| 警告 | Amber | oklch(0.60 0.16 85) | `#d97706` | 警告状态 |
| 错误 | Crimson | oklch(0.50 0.20 15) | `#dc2626` | 错误状态 |
| 边框 | Light Border | oklch(0.85 0.01 260) | `#d4d4dc` | 卡片/面板边框 |

### 主题切换机制

- 优先级：`localStorage("img-compressor-theme")` > `prefers-color-scheme` 媒体查询
- 暗色模式通过 `:root.dark` class 显式触发
- 亮色模式通过 `@media (prefers-color-scheme: light)` + `:root:not(.dark)` 触发
- 用户手动切换后写入 localStorage，覆盖系统偏好

---

## 2. 玻璃面板 Token（双模式）

### 暗色模式

- `--glass-bg`: `rgba(26, 29, 40, 0.65)` — 半透明面板背景
- `--glass-bg-hover`: `rgba(26, 29, 40, 0.85)` — hover 加深
- `--glass-bg-light`: `rgba(26, 29, 40, 0.4)` — 轻量玻璃
- `--glass-border`: `rgba(255, 255, 255, 0.06)` — 玻璃面板边框
- `--glass-blur`: `20px` — backdrop-filter blur 值
- `--glass-highlight`: `rgba(255, 255, 255, 0.04)` — 顶部高光线

### 亮色模式

- `--glass-bg`: `rgba(255, 255, 255, 0.65)` — 半透明白色面板
- `--glass-bg-hover`: `rgba(255, 255, 255, 0.85)` — hover 加深
- `--glass-bg-light`: `rgba(255, 255, 255, 0.4)` — 轻量玻璃
- `--glass-border`: `rgba(0, 0, 0, 0.06)` — 玻璃面板边框
- `--glass-blur`: `20px`
- `--glass-highlight`: `rgba(255, 255, 255, 0.8)` — 顶部高光线

---

## 3. 光晕 Token（双模式）

### 环境光斑（Ambient Glow Orbs）

页面背景上 2-3 个大型模糊光斑（`radial-gradient` + `filter: blur(80px)`），`position: fixed`：

| 光斑 | 大小 | 位置 | 暗色模式颜色 | 亮色模式颜色 |
|------|------|------|------------|------------|
| Orb A | 700px | top-right (-250, -180) | `rgba(59,130,246,0.07)` | `rgba(37,99,235,0.05)` |
| Orb B | 550px | bottom-left (-200, -150) | `rgba(139,92,246,0.06)` | `rgba(124,58,237,0.04)` |
| Orb C | 450px | center (40%, 50%) | `rgba(59,130,246,0.04)` | `rgba(37,99,235,0.03)` |

### 组件光晕

暗色模式：
- `--glow-blue`: `0 0 40px rgba(59, 130, 246, 0.15), 0 0 80px rgba(59, 130, 246, 0.06)`
- `--glow-violet`: `0 0 40px rgba(139, 92, 246, 0.15), 0 0 80px rgba(139, 92, 246, 0.06)`
- `--glow-mixed`: `0 0 60px rgba(59, 130, 246, 0.12), 0 0 120px rgba(139, 92, 246, 0.08)`
- `--glow-upload`: `0 0 80px rgba(59, 130, 246, 0.12), 0 0 160px rgba(139, 92, 246, 0.06)`

亮色模式：
- `--glow-blue`: `0 0 40px rgba(37, 99, 235, 0.1), 0 0 80px rgba(37, 99, 235, 0.04)`
- `--glow-violet`: `0 0 40px rgba(124, 58, 237, 0.1), 0 0 80px rgba(124, 58, 237, 0.04)`
- `--glow-mixed`: `0 0 60px rgba(37, 99, 235, 0.08), 0 0 120px rgba(124, 58, 237, 0.05)`
- `--glow-upload`: `0 0 80px rgba(37, 99, 235, 0.08), 0 0 160px rgba(124, 58, 237, 0.04)`

---

## 4. 字体

| 层级 | 字体族 | 字重 | 字号 | 行高 | 用途 |
|------|--------|------|------|------|------|
| Display | Plus Jakarta Sans | 700 | 40px / 2.5rem | 1.15 | 页面大标题 |
| H1 | Plus Jakarta Sans | 600 | 28px / 1.75rem | 1.25 | 区块标题 |
| H2 | Plus Jakarta Sans | 600 | 20px / 1.25rem | 1.3 | 子区块标题 |
| H3 | Plus Jakarta Sans | 600 | 16px / 1rem | 1.35 | 小组件标题 |
| Body | Plus Jakarta Sans | 400 | 14px / 0.875rem | 1.6 | 正文 |
| Body-Small | Plus Jakarta Sans | 400 | 12px / 0.75rem | 1.5 | 辅助说明 |
| Caption | Plus Jakarta Sans | 500 | 10px / 0.625rem | 1.4 | 标签/角标 |
| Mono | JetBrains Mono | 400 | 12px / 0.75rem | 1.5 | 文件大小/数字/代码 |

**配对理由**：Plus Jakarta Sans 几何感中性但带微妙人文细节，在深色科技背景下既有工具精度又不冰冷。搭配 JetBrains Mono 处理数据类信息，形成工具感与可读性的平衡。

**Google Fonts CDN**：
```
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

---

## 5. 间距标尺

基础单位：**4px**

| 标记 | 值 | 用途 |
|------|-----|------|
| xs | 4px | 元素内部紧贴间距 |
| sm | 8px | 紧密元素间距 |
| md | 12px | 组件内元素间距 |
| lg | 16px | 组件间标准间距 |
| xl | 24px | 区块内间距 |
| 2xl | 32px | Section 内间距 |
| 3xl | 48px | Section 之间间距 |
| 4xl | 64px | 大区块分隔 |
| 5xl | 96px | 页面级留白 |

---

## 6. 圆角

| 标记 | 值 | 适用组件 |
|------|-----|---------|
| sharp | 2px | 小标签、badge |
| subtle | 6px | 输入框、小按钮、主题切换按钮 |
| normal | 10px | 按钮、卡片、面板 |
| lg | 16px | 上传区域 |
| pill | 9999px | 胶囊按钮、预设标签 |

---

## 7. 阴影

| 层级 | 暗色模式 | 亮色模式 | 用途 |
|------|---------|---------|------|
| subtle | `0 1px 2px rgba(0,0,0,0.3)` | `0 1px 2px rgba(0,0,0,0.06)` | 微浮起元素 |
| normal | `0 4px 12px rgba(0,0,0,0.4)` | `0 4px 12px rgba(0,0,0,0.08)` | 卡片浮起 |
| elevated | `0 8px 24px rgba(0,0,0,0.5)` | `0 8px 24px rgba(0,0,0,0.12)` | 模态/弹窗 |
| glow | `var(--glow-blue)` 或 `var(--glow-mixed)` | 同（亮色模式 glow token） | 强调光晕 |

---

## 8. 卡片样式

**玻璃面板（Glass Panel）**：
- 背景：`var(--glass-bg)`
- 边框：`1px solid var(--glass-border)`
- 圆角：`var(--radius-normal)` — 10px
- 模糊：`backdrop-filter: blur(var(--glass-blur))`
- 内边距：`var(--space-xl)` — 24px
- 顶部高光线（可选）：`border-top: 1px solid var(--glass-highlight)`

**上传区域（Upload Zone）** — v2 更新：
- 虚线边框：`2px dashed var(--color-border)` → hover 时 `var(--color-accent-a)`
- 圆角：`var(--radius-lg)` — 16px
- 背景：`var(--glass-bg-light)` → hover 时 `var(--glass-bg)`
- hover 发光边框：`box-shadow: var(--glow-upload), 0 0 0 4px rgba(59,130,246,0.06)`
- 拖拽激活时：`box-shadow: 0 0 0 6px rgba(59,130,246,0.08), var(--glow-blue)`
- 最小高度：**320px**（桌面端，从原 240px 提升）
- 上传图标环 hover 放大 + 发光

**预设胶囊标签（Preset Chip）**：
- 背景：`var(--glass-bg-light)`
- 边框：`1px solid var(--glass-border)`
- 圆角：`var(--radius-pill)`
- 内边距：6px 14px
- Hover：边框色变为 `var(--color-accent-a)`，背景微亮，box-shadow 微光晕
- Active：背景 `rgba(59, 130, 246, 0.12)`，边框 `var(--color-accent-a)`
- 自定义预设：带 ⭐ 标记，hover 显示删除 ✕ 按钮

**结果卡片**：
- 背景：`var(--glass-bg)`
- 边框：`1px solid var(--glass-border)`
- 圆角：`var(--radius-normal)`
- 成功状态左边框色：`var(--color-success)`
- 错误状态左边框色：`var(--color-error)`

---

## 9. 组件清单（v2 更新）

| 组件 | 用途 | v2 变更 |
|------|------|--------|
| AppShell | 整体布局容器 | 增加环境光斑层 |
| AmbientGlow | 3 个大型模糊光斑 | **新增**，position:fixed + filter:blur(80px) |
| Header | 顶部导航 | **高度从 56px 缩减到 48px**，移除副标题和 badge |
| ThemeToggle | 亮暗切换按钮 | **新增**，太阳/月亮图标，localStorage 记忆 |
| PresetChip | 预设胶囊标签 | 移到上传区下方，增加自定义预设支持 |
| SavePresetBtn | 保存预设按钮 | **新增**，内联命名输入 |
| UploadZone | 文件拖拽上传区 | **最小高度 320px**，hover 发光边框增强 |
| FileList | 已选文件缩略图网格 | 不变 |
| FormatSelector | 格式选择按钮组 | 不变 |
| QualitySlider | 质量滑块 | 不变 |
| DimensionInput | 尺寸输入组 | 不变 |
| IcoSizeSelector | ICO 多尺寸标签 | 不变 |
| AdvancedToggle | 高级选项折叠区 | 不变 |
| ProcessButton | 主处理按钮 | **增加持续光晕脉冲动画**（btnGlowPulse） |
| ResultStats | 统计卡片行 | 不变 |
| ResultList | 详细结果列表 | 不变 |
| ErrorAlert | 错误提示 | 不变 |
| TechInfo | 技术栈说明 | 不变 |

---

## 10. 交互状态

| 状态 | 视觉规范 |
|------|---------|
| default | 按各组件定义 |
| hover | 背景微亮 +5% opacity 或边框色变为强调色；可拖拽区域显示光晕边框 |
| active/pressed | `transform: scale(0.98)`，光晕减弱 |
| focus-visible | `outline: 2px solid var(--color-accent-a)`，`outline-offset: 2px` |
| disabled | `opacity: 0.5`，`cursor: not-allowed`，无 hover 效果，动画停止 |
| loading | 按钮显示旋转 spinner + 文字变为"处理中..." |
| error | 红色左边框 + 浅红背景 + 错误图标 |
| success | 绿色左边框 + 绿色勾选图标 |
| drag-over | 边框变为强调色 + 蓝色光晕 + 6px 外发光 ring + 背景微亮 |

---

## 11. 自定义预设数据结构

```js
{
  id: 'custom-{timestamp}',
  name: '我的预设',
  isCustom: true,
  // ... 继承所有 state.options 字段
  format, quality, width, height, fit, lossless, effort, colors, dither, progressive, stripMetadata, icoSizes
}
```

- 存储在 `localStorage("img-compressor-custom-presets")`
- 最多 10 个自定义预设
- 与系统预设混合展示在 presets-row 中
- 自定义预设 hover 显示删除按钮
- 自定义预设带 ⭐ 视觉标识
