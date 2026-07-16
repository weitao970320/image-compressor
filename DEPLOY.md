# 图片压缩工坊 — 部署指南

## 项目概述

批量图片压缩 WebUI 应用，基于 **Node.js + Sharp + Express** 后端 + **React + Vite** 前端。

功能：JPEG/PNG/WebP/ICO 格式互转、批量压缩、等比例裁切、预设模板、自定义预设、亮暗双主题。

## 环境要求

- **Node.js** >= 18
- **npm** >= 9
- 服务器需要能够安装 Sharp 的原生依赖（libvips），Linux/macOS/Windows 均支持

## 快速部署

```bash
# 1. 克隆仓库
git clone https://github.com/weitao970320/image-compressor.git
cd image-compressor

# 2. 安装依赖
npm install

# 3. 构建前端
npm run build

# 4. 启动服务（默认端口 3001）
npm run server
```

访问 `http://localhost:3001` 即可使用。

## 生产环境部署建议

### 使用 PM2 守护进程

```bash
npm install -g pm2
npm run build
pm2 start server/index.js --name image-compressor
pm2 save
pm2 startup
```

### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 100M;  # 支持大文件上传

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Docker 部署

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache vips-dev
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "server/index.js"]
```

```bash
docker build -t image-compressor .
docker run -d -p 3001:3001 --name image-compressor image-compressor
```

## 配置说明

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | 3001 | 服务端口 |

## 目录结构

```
image-compressor/
├── server/index.js      # Express + Sharp 后端 API
├── client/              # React + Vite 前端源码
│   ├── src/App.jsx      # 主组件
│   ├── src/index.css    # 液态光设计系统 CSS
│   └── dist/            # 构建产物（npm run build 后生成）
├── design/              # 设计文档和原型
├── uploads/             # 临时上传目录（运行时创建）
├── output/              # 临时输出目录（运行时创建）
└── package.json
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/process` | 上传图片并处理（multipart/form-data） |
| GET | `/api/download/:filename` | 下载处理后的 ZIP |
| GET | `/api/health` | 健康检查 |

## 注意事项

1. **Sharp 依赖 libvips**，安装时 npm 会自动下载预编译二进制。如遇问题，手动安装：`apt install libvips-dev`（Debian/Ubuntu）或 `brew install vips`（macOS）
2. **上传限制**：单文件 50MB，单次最多 50 张图片
3. **临时文件清理**：ZIP 下载后 60 秒自动清理
