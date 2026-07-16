const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const AdmZip = require('adm-zip');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 生产环境提供前端静态文件
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  console.log(`前端静态文件: ${CLIENT_DIST}`);
}

// 确保上传和输出目录存在
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}。支持的格式: ${allowed.join(', ')}`));
    }
  }
});

// ========== 辅助函数 ==========

/**
 * 获取文件基础名（不含扩展名）
 */
function getBaseName(filename) {
  return path.basename(filename, path.extname(filename));
}

/**
 * 使用 sharp 处理图片
 */
async function processImage(inputPath, outputPath, options) {
  const {
    format,           // 'jpeg' | 'png' | 'webp'
    quality = 80,     // 1-100
    width,            // 目标宽度
    height,           // 目标高度
    fit = 'inside',   // 'inside' | 'cover' | 'fill' | 'contain'
    background = { r: 255, g: 255, b: 255, alpha: 0 },
    lossless = false,
    effort = 4,       // WebP effort (0-6)
    colors = 256,     // PNG 颜色数（量化）
    dither = 1.0,     // PNG 抖动
    progressive = true, // JPEG 渐进式
    stripMetadata = true, // 移除元数据
  } = options;

  let pipeline = sharp(inputPath);

  // 移除元数据
  if (stripMetadata) {
    pipeline = pipeline.withMetadata({}).rotate(); // rotate 基于 EXIF 方向自动旋转
  }

  // 获取原图信息
  const metadata = await pipeline.metadata();

  // 等比例裁切/缩放
  if (width || height) {
    pipeline = pipeline.resize({
      width: width || undefined,
      height: height || undefined,
      fit: fit,
      background: background,
      withoutEnlargement: fit === 'inside', // inside 模式不放大
    });
  }

  // 格式特定设置
  switch (format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({
        quality: quality,
        progressive: progressive,
        mozjpeg: true, // 使用 mozjpeg 编码器获得更好压缩
      });
      break;
    case 'png':
      pipeline = pipeline.png({
        quality: quality,
        progressive: progressive,
        compressionLevel: Math.round((100 - quality) / 11), // 0-9
        palette: lossless ? false : true,
        colors: lossless ? 256 : colors,
        dither: dither,
        effort: Math.min(effort, 10),
      });
      break;
    case 'webp':
      pipeline = pipeline.webp({
        quality: quality,
        lossless: lossless,
        effort: effort,
      });
      break;
    default:
      throw new Error(`不支持的输出格式: ${format}`);
  }

  await pipeline.toFile(outputPath);
  return await sharp(outputPath).metadata();
}

/**
 * 生成 ICO 文件（多尺寸）
 */
async function convertToIco(inputPath, outputPath, sizes) {
  // ICO 支持的标准尺寸
  const validSizes = sizes
    .filter(s => s <= 256)
    .sort((a, b) => b - a);

  if (validSizes.length === 0) {
    validSizes.push(32);
  }

  // 生成各尺寸 PNG 并合成 ICO
  const pngBuffers = [];
  for (const size of validSizes) {
    const buffer = await sharp(inputPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer });
  }

  // 手动合成 ICO 文件
  const icoBuffer = buildIco(pngBuffers);
  fs.writeFileSync(outputPath, icoBuffer);
  return icoBuffer;
}

/**
 * 构建 ICO 文件格式
 */
function buildIco(images) {
  const imageCount = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + dirEntrySize * imageCount;

  // 计算图像数据偏移
  let imageOffset = dirSize;
  const imageDataBlocks = [];

  for (const img of images) {
    // BMP 数据（含 BITMAPINFOHEADER）
    const pngBuffer = img.buffer;
    const bmpData = pngToBmpData(pngBuffer, img.size);
    imageDataBlocks.push(bmpData);
  }

  // 重新计算偏移量（考虑实际 BMP 数据大小）
  imageOffset = dirSize;
  const finalImageDataBlocks = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const pngBuffer = img.buffer;
    const bmpData = pngToBmpData(pngBuffer, img.size);
    finalImageDataBlocks.push({ data: bmpData, size: img.size });
  }

  // 计算总大小
  const totalSize = dirSize + finalImageDataBlocks.reduce((sum, b) => sum + b.data.length, 0);

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // ICO 头
  buf.writeUInt16LE(0, offset);      // reserved
  buf.writeUInt16LE(1, offset + 2);  // type: ICO = 1
  buf.writeUInt16LE(imageCount, offset + 4); // count
  offset += headerSize;

  // 目录项
  let dataOffset = dirSize;
  for (let i = 0; i < imageCount; i++) {
    const img = finalImageDataBlocks[i];
    const s = img.size >= 256 ? 0 : img.size; // 256 存为 0

    buf.writeUInt8(s, offset);           // width
    buf.writeUInt8(s, offset + 1);       // height (same as width for square)
    buf.writeUInt8(0, offset + 2);       // color palette (0 for 32-bit)
    buf.writeUInt8(0, offset + 3);       // reserved
    buf.writeUInt16LE(1, offset + 4);    // color planes
    buf.writeUInt16LE(32, offset + 6);   // bits per pixel
    buf.writeUInt32LE(img.data.length, offset + 8);  // image size
    buf.writeUInt32LE(dataOffset, offset + 12);       // image offset

    dataOffset += img.data.length;
    offset += dirEntrySize;
  }

  // 图像数据
  for (const img of finalImageDataBlocks) {
    img.data.copy(buf, offset);
    offset += img.data.length;
  }

  return buf;
}

/**
 * 将 PNG 缓冲区转换为 BMP 数据（用于 ICO）
 */
function pngToBmpData(pngBuffer, size) {
  // PNG 数据可以直接用于 Vista ICO（32位带 alpha）
  // 但为了兼容性，我们生成 AND mask + XOR mask
  // 简化版：使用 PNG 压缩数据（现代 ICO 支持）
  
  // 使用 sharp 解码 PNG 获取原始像素
  // 这里我们直接使用 PNG 数据作为 ICO 条目（Vista 风格）
  // 大多数现代应用都支持这种格式
  
  // 构建 BITMAPINFOHEADER + XOR mask + AND mask
  const rowSize = Math.floor((32 * size + 31) / 32) * 4;
  const xorSize = rowSize * size;
  const andRowSize = Math.floor((size + 31) / 32) * 4;
  const andSize = andRowSize * size;
  const headerSize = 40;
  const totalSize = headerSize + xorSize + andSize;
  
  const buf = Buffer.alloc(totalSize);
  let offset = 0;
  
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, offset);          // biSize
  buf.writeInt32LE(size, offset + 4);     // biWidth
  buf.writeInt32LE(size * 2, offset + 8); // biHeight (double for ICO)
  buf.writeUInt16LE(1, offset + 12);      // biPlanes
  buf.writeUInt16LE(32, offset + 14);     // biBitCount
  buf.writeUInt32LE(0, offset + 16);      // biCompression
  buf.writeUInt32LE(xorSize, offset + 20);// biSizeImage
  buf.writeInt32LE(0, offset + 24);       // biXPelsPerMeter
  buf.writeInt32LE(0, offset + 28);       // biYPelsPerMeter
  buf.writeUInt32LE(0, offset + 32);      // biClrUsed
  buf.writeUInt32LE(0, offset + 36);      // biClrImportant
  
  // XOR mask (用白色填充)
  offset = headerSize;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // BGRA: white
      buf.writeUInt8(255, offset++); // B
      buf.writeUInt8(255, offset++); // G
      buf.writeUInt8(255, offset++); // R
      buf.writeUInt8(255, offset++); // A
    }
  }
  
  // AND mask (全0 = 不透明)
  offset = headerSize + xorSize;
  buf.fill(0, offset, offset + andSize);
  
  return buf;
}

/**
 * 使用 PNG 数据创建 ICO（简化但兼容的方法）
 * 实际上我们使用 sharp 生成 BMP 格式
 */
async function createIcoSimple(inputPath, outputPath, sizes) {
  // 对于更可靠的 ICO 生成，使用 to-ico 类似的方法
  // 这里我们生成 PNG 格式的 ICO（现代风格）
  
  const validSizes = sizes.filter(s => s <= 256).sort((a, b) => b - a);
  if (validSizes.length === 0) validSizes.push(32);

  // 为每个尺寸创建 PNG
  const pngBuffers = [];
  for (const size of validSizes) {
    const buffer = await sharp(inputPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer });
  }

  // 构建 ICO
  const imageCount = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirOffset = headerSize + dirEntrySize * imageCount;

  // 准备图像数据
  const imageEntries = [];
  let currentOffset = dirOffset;

  for (const { size, buffer } of pngBuffers) {
    // 将 PNG 转换为 BMP 用于 ICO
    const bmpData = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data: rawData, info } = bmpData;
    const { width, height, channels } = info;

    // 构建 DIB 数据 (BITMAPINFOHEADER + pixel data)
    const rowSize = width * 4;
    const pixelDataSize = rowSize * height;
    const headerAndPixels = Buffer.alloc(40 + pixelDataSize);

    // BITMAPINFOHEADER
    headerAndPixels.writeUInt32LE(40, 0);           // biSize
    headerAndPixels.writeInt32LE(width, 4);          // biWidth
    headerAndPixels.writeInt32LE(height * 2, 8);     // biHeight (double for ICO)
    headerAndPixels.writeUInt16LE(1, 12);            // biPlanes
    headerAndPixels.writeUInt16LE(32, 14);           // biBitCount
    headerAndPixels.writeUInt32LE(0, 16);            // biCompression = BI_RGB
    headerAndPixels.writeUInt32LE(pixelDataSize, 20);// biSizeImage
    headerAndPixels.writeInt32LE(0, 24);             // biXPelsPerMeter
    headerAndPixels.writeInt32LE(0, 28);             // biYPelsPerMeter
    headerAndPixels.writeUInt32LE(0, 32);            // biClrUsed
    headerAndPixels.writeUInt32LE(0, 36);            // biClrImportant

    // 填充像素数据 (BGRA)
    // 翻转行（BMP 从下到上存储）
    for (let y = 0; y < height; y++) {
      const srcRowStart = (height - 1 - y) * width * channels;
      const dstRowStart = 40 + y * rowSize;
      for (let x = 0; x < width; x++) {
        const srcIdx = srcRowStart + x * channels;
        const dstIdx = dstRowStart + x * 4;
        // RGBA -> BGRA
        headerAndPixels.writeUInt8(rawData[srcIdx + 2] || rawData[srcIdx], dstIdx);       // B
        headerAndPixels.writeUInt8(rawData[srcIdx + 1] || rawData[srcIdx + 1], dstIdx + 1); // G
        headerAndPixels.writeUInt8(rawData[srcIdx] || rawData[srcIdx + 2], dstIdx + 2);     // R
        headerAndPixels.writeUInt8(rawData[srcIdx + 3] || 255, dstIdx + 3);                // A
      }
    }

    const entryData = headerAndPixels;
    imageEntries.push({ size, data: entryData });
  }

  // 重新计算偏移
  currentOffset = dirOffset;
  for (const entry of imageEntries) {
    entry.offset = currentOffset;
    currentOffset += entry.data.length;
  }

  const totalSize = currentOffset;
  const icoBuf = Buffer.alloc(totalSize);

  // 写入头
  icoBuf.writeUInt16LE(0, 0);          // reserved
  icoBuf.writeUInt16LE(1, 2);          // ICO type
  icoBuf.writeUInt16LE(imageCount, 4); // count

  // 写入目录
  let dirPos = headerSize;
  for (const entry of imageEntries) {
    const s = entry.size >= 256 ? 0 : entry.size;
    icoBuf.writeUInt8(s, dirPos);                    // width
    icoBuf.writeUInt8(s, dirPos + 1);                // height
    icoBuf.writeUInt8(0, dirPos + 2);                // palette
    icoBuf.writeUInt8(0, dirPos + 3);                // reserved
    icoBuf.writeUInt16LE(1, dirPos + 4);             // planes
    icoBuf.writeUInt16LE(32, dirPos + 6);            // bpp
    icoBuf.writeUInt32LE(entry.data.length, dirPos + 8);  // size
    icoBuf.writeUInt32LE(entry.offset, dirPos + 12);      // offset
    dirPos += dirEntrySize;
  }

  // 写入图像数据
  for (const entry of imageEntries) {
    entry.data.copy(icoBuf, entry.offset);
  }

  fs.writeFileSync(outputPath, icoBuf);
  return icoBuf;
}

// ========== API 路由 ==========

/**
 * POST /api/process - 处理图片
 * 
 * Body (multipart/form-data):
 * - images: File[] (图片文件)
 * - options: JSON string
 *   {
 *     format: 'jpeg' | 'png' | 'webp' | 'ico' | 'original',
 *     quality: number (1-100),
 *     width: number | null,
 *     height: number | null,
 *     fit: 'inside' | 'cover' | 'fill',
 *     lossless: boolean,
 *     effort: number,
 *     colors: number,
 *     progressive: boolean,
 *     stripMetadata: boolean,
 *     icoSizes: number[]  // 仅 ICO 格式
 *   }
 */
app.post('/api/process', upload.array('images', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请上传至少一张图片' });
    }

    let options;
    try {
      options = JSON.parse(req.body.options || '{}');
    } catch {
      return res.status(400).json({ error: '无效的选项 JSON' });
    }

    const {
      format = 'jpeg',
      quality = 80,
      width = null,
      height = null,
      fit = 'inside',
      lossless = false,
      effort = 4,
      colors = 256,
      progressive = true,
      stripMetadata = true,
      icoSizes = [16, 32, 48, 64, 128, 256],
    } = options;

    const sessionId = uuidv4();
    const sessionDir = path.join(OUTPUT_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const results = [];

    for (const file of req.files) {
      const baseName = getBaseName(file.originalname);
      let outputFormat = format;
      
      // 如果选择 original，保持原格式
      if (format === 'original') {
        const ext = path.extname(file.originalname).toLowerCase();
        outputFormat = ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 
                       ext === '.png' ? 'png' : 
                       ext === '.webp' ? 'webp' : 'jpeg';
      }

      const ext = outputFormat === 'jpeg' ? '.jpg' : `.${outputFormat}`;
      const outputFilename = `${baseName}${ext}`;
      const outputPath = path.join(sessionDir, outputFilename);

      const inputMetadata = await sharp(file.path).metadata();

      try {
        if (outputFormat === 'ico') {
          await createIcoSimple(file.path, outputPath.replace('.ico', '.ico'), icoSizes);
          const finalPath = outputPath.replace(ext, '.ico');
          const stats = fs.statSync(finalPath);
          results.push({
            originalName: file.originalname,
            outputName: `${baseName}.ico`,
            originalSize: file.size,
            outputSize: stats.size,
            originalWidth: inputMetadata.width,
            originalHeight: inputMetadata.height,
            format: 'ico',
            success: true,
          });
        } else {
          const outMetadata = await processImage(file.path, outputPath, {
            format: outputFormat,
            quality,
            width: width ? parseInt(width) : null,
            height: height ? parseInt(height) : null,
            fit,
            lossless,
            effort,
            colors,
            progressive,
            stripMetadata,
          });
          const outStats = fs.statSync(outputPath);

          results.push({
            originalName: file.originalname,
            outputName: outputFilename,
            originalSize: file.size,
            outputSize: outStats.size,
            originalWidth: inputMetadata.width,
            originalHeight: inputMetadata.height,
            outputWidth: outMetadata.width,
            outputHeight: outMetadata.height,
            format: outputFormat,
            success: true,
          });
        }
      } catch (err) {
        results.push({
          originalName: file.originalname,
          error: err.message,
          success: false,
        });
      }
    }

    // 打包为 ZIP
    const zipFilename = `processed_${sessionId}.zip`;
    const zipPath = path.join(OUTPUT_DIR, zipFilename);
    
    const zip = new AdmZip();
    const files = fs.readdirSync(sessionDir);
    for (const f of files) {
      zip.addLocalFile(path.join(sessionDir, f));
    }
    zip.writeZip(zipPath);

    // 清理临时文件
    for (const file of req.files) {
      fs.unlink(file.path, () => {});
    }
    fs.rmSync(sessionDir, { recursive: true, force: true });

    res.json({
      success: true,
      results,
      downloadUrl: `/api/download/${zipFilename}`,
      sessionId,
    });
  } catch (err) {
    console.error('处理错误:', err);
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

/**
 * GET /api/download/:filename - 下载处理后的文件
 */
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在或已过期' });
  }

  res.download(filePath, 'processed_images.zip', (err) => {
    if (!err) {
      // 下载后清理
      setTimeout(() => {
        fs.unlink(filePath, () => {});
      }, 60000); // 60秒后清理
    }
  });
});

/**
 * GET /api/health - 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// SPA fallback：非 API 路由返回 index.html
if (fs.existsSync(CLIENT_DIST)) {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && req.method === 'GET') {
      // 检查是否为静态文件请求
      const ext = path.extname(req.path);
      if (!ext || !['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2'].includes(ext)) {
        return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
      }
    }
    next();
  });
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`图片处理服务已启动: http://localhost:${PORT}`);
  console.log(`上传目录: ${UPLOAD_DIR}`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
});
