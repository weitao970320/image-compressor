<p align="center">
  <img src="client/public/favicon.svg" width="96" alt="Xiaoming Compress Logo" />
</p>

<h1 align="center">小明图像处理 · Xiaoming Compress</h1>

<p align="center">
  <b>100% 浏览器本地运行的批量图片压缩神器</b><br/>
  压缩 · 格式转换 · 批量裁切 · ICO 生成 —— 图片不出本机，隐私零风险
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge" alt="version" />
  <img src="https://img.shields.io/badge/运行环境-纯浏览器-8b5cf6?style=for-the-badge" alt="platform" />
  <img src="https://img.shields.io/badge/隐私-本地处理_不上传-brightgreen?style=for-the-badge" alt="privacy" />
  <img src="https://img.shields.io/badge/部署-GitHub_Pages-ff6b6b?style=for-the-badge" alt="deploy" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license" />
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> ·
  <a href="#-为什么是客户端">为什么是客户端</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-一键部署到-github-pages">部署到 Pages</a> ·
  <a href="#-技术栈">技术栈</a> ·
  <a href="#-路线图">路线图</a>
</p>

---

## 🎯 一句话介绍

> **小明图像处理（Xiaoming Compress）** 是一款开箱即用的批量图片处理 Web 应用。
> 你只需要在上传区里选好设置、拖入图片、点一下「开始处理」，剩下的交给浏览器 ——
> **所有像素处理都在你的设备上完成，图片永远不会离开你的电脑。**

没有后端、没有上传、没有等待、没有隐私焦虑。打开网页就能用，关掉网页什么都不留。

---

## ✨ 核心特性

| 🔧 能力 | 📋 说明 |
| :--- | :--- |
| **批量压缩** | 一次拖入数十张 JPG / PNG，按质量一键压缩，结果自动打包成 ZIP 下载 |
| **格式互转** | JPG ⇄ PNG ⇄ WebP 自由转换，也支持「保持原格式」批量重处理 |
| **ICO 生成** | 一张图一键生成 16/32/48/64/128/256 多尺寸图标，直接拿去当网站 Favicon |
| **等比例裁切** | 批量把图片裁切 / 缩放成统一分辨率，`cover` 居中裁切、`inside` 等比适配、`fill` 拉伸 |
| **预设模板** | 8 套开箱预设（网页照片 / 缩略图 / 社交封面 / Favicon …）+ 保存你自己的常用配置 |
| **自动下载** | 处理完成自动下载 ZIP，页面内还能「重新下载」，不怕手滑关掉 |
| **亮暗双主题** | 跟随系统自动切换，也可手动一键切换；深夜修图也不刺眼 |
| **零依赖打包** | ZIP 打包为自实现纯前端逻辑，整个应用无需任何第三方运行时依赖 |

---

## 🛡️ 为什么是「客户端」？

传统的图片压缩工具要么要你把照片传到服务器，要么得装个几十 MB 的客户端。
**Xiaoming Compress 走的是第三条路 —— 纯浏览器端（Client-Side）：**

- 🔒 **隐私满分**：图片只在本地 Canvas 里处理，断网也能用，没有任何上传动作。
- ⚡ **零等待**：没有网络往返，没有排队，处理速度取决于你电脑的算力。
- 💸 **托管免费**：纯静态文件，直接扔到 **GitHub Pages** 就能全球访问，零服务器成本。
- 📦 **部署简单**：不需要 Node、不需要数据库、不需要运维，拷贝 `dist/` 即可。

> 💡 **想要更高性能 / 大批量？** 仓库里还附带一套基于 **Sharp + libvips** 的 Node.js 服务端版本（`server/`），
> 适合需要服务端批量处理、MozJPEG 极致压缩的企业场景。二选一，随心切换。

---

## 🚀 快速开始

### 方式一：直接打开（最简单）

本项目构建后是纯静态文件，**双击 `dist/index.html` 即可在浏览器中使用**（部分浏览器对本地文件有限制，推荐用方式二）。

### 方式二：本地起一个静态服务

```bash
# 1. 安装依赖并构建前端
cd client
npm install
npm run build      # 产物在 client/dist/

# 2. 用任意静态服务器打开
npx serve dist
# 或
python3 -m http.server 8080 -d dist
```

浏览器访问 `http://localhost:8080` 即可。

### 方式三：开发模式（热更新）

```bash
cd client
npm install
npm run dev        # 默认 http://localhost:5173
```

---

## ☁️ 部署到 GitHub Pages

本应用是纯静态站点，部署到 GitHub Pages **完全免费**，且无需任何后端。

> 🌐 **已上线**：<https://weitao970320.github.io/image-compressor/>

### 当前采用：分支部署（gh-pages）

仓库已通过 `gh-pages` 分支部署，配置方式如下：

1. 进入仓库 **Settings → Pages → Build and deployment → Source**，选择 **Deploy from a branch**；
2. Branch 选 **`gh-pages`**，目录选 **`/ (root)`**，保存；
3. 访问 `https://<用户名>.github.io/image-compressor/`。

重新发布只需把最新的 `client/dist/` 推送到 `gh-pages` 分支即可。

### 可选：GitHub Actions 自动部署

如需推送到 `main` 即自动发布，可追加 `.github/workflows/deploy.yml`（已在本地方便取用）。
注意：GitHub 要求推送工作流文件必须拥有 `workflow` 权限的 Token，若你的令牌没有该权限，
请用具备权限的账户推送该文件，并将上面的 Source 改为 **GitHub Actions**。

### 手动构建

```bash
cd client && npm run build
# 将 dist/ 目录内容推送到 gh-pages 分支，或上传到任意静态托管（Vercel / Netlify / 对象存储）
```

---

## 🖥️ 可选：Node.js 高性能服务端版

如果你需要**服务端批量处理**或 **MozJPEG 极致压缩**，可以使用仓库内的 `server/`：

```bash
npm install          # 安装根目录依赖（express / sharp / multer …）
npm run server       # 启动 API 服务（默认 http://localhost:3001）
npm run dev          # 同时启动前端(5173) + 后端(3001) 开发
```

> 服务端版适合企业内网、大量图片批处理等场景；个人使用与公网托管，客户端版足矣。

---

## 🧰 技术栈

<p align="left">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?style=flat&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Canvas_API-2d-ff9f43?style=flat" alt="Canvas" />
  <img src="https://img.shields.io/badge/纯前端_ZIP-零依赖-10b981?style=flat" alt="zip" />
  <img src="https://img.shields.io/badge/CSS-液态光设计-8b5cf6?style=flat" alt="css" />
</p>

- **前端框架**：React 19 + Vite 8
- **处理引擎**：浏览器原生 `Canvas API`（缩放 / 裁切 / 编码）+ 自实现 ZIP 打包（STORE 模式，CRC32 校验）
- **设计语言**：「液态光 Liquid Light」—— 玻璃拟态面板、蓝紫辉光、Plus Jakarta Sans 字体
- **主题**：CSS 变量驱动，亮 / 暗自动跟随系统
- **可选后端**：Node.js + Express 5 + Sharp(libvips) + Multer

### 支持的格式与处理

| 输出格式 | 压缩质量 | 缩放裁切 | 备注 |
| :--- | :--- | :--- | :--- |
| JPEG | ✅ 可调 1–100% | ✅ | 自动剥离 EXIF |
| PNG | ➖ 无损 | ✅ | 体积主要由分辨率决定 |
| WebP | ✅ 可调 | ✅ | 依赖浏览器编码支持 |
| ICO | ➖ 多尺寸 | ✅ 居中裁切 | 内置 16–256 多尺寸 |

---

## 📸 界面预览

> 📷 把一张应用截图放到 `docs/screenshot.png`，替换下面这行即可：
>
> `![preview](docs/screenshot.png)`

<p align="center">
  <i>「上传区即一切」—— 在一个区域完成设置，一次提交解决全部。</i>
</p>

---

## 🗺️ 路线图

- [ ] 🧪 PNG 有损压缩（前端 pngquant / OxIPNG WASM）
- [ ] 🎨 实时压缩前后对比预览
- [ ] 📋 拖拽排序与单独重命名
- [ ] 🌐 多语言（中 / 英 / 日）
- [ ] 📦 单文件离线版（PWA，可安装到桌面）

---

## 📄 许可证

[MIT](LICENSE) © Xiaoming Compress

<p align="center">
  <sub>Made with ⚡ by Canvas & ☕ — 图片不出本机，压缩更安心。</sub>
</p>
