// =============================================================================
// 浏览器端图片处理引擎 — 纯前端，无需任何服务器
// 使用 Canvas API 完成缩放 / 裁切 / 格式转换，自实现 ZIP 打包（STORE 模式）。
// 所有像素处理均在用户浏览器内完成，图片不会上传到任何服务器。
// =============================================================================

// ----------------------------- CRC32（ZIP 校验用） -----------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time: time & 0xffff, date: date & 0xffff };
}

// --------------------------------- ZIP 打包 -----------------------------------
// 采用 STORE（不压缩）模式：图片本身已压缩，二次压缩收益极低，且无需引入依赖。
export async function createZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const { time, date } = dosDateTime();
  const central = [];

  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const nameBytes = enc.encode(f.name);
    const crc = crc32(data);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // 本地文件头签名
    lh.setUint16(4, 20, true);          // 版本
    lh.setUint16(6, 0x0800, true);      // 通用标志：bit11=文件名 UTF-8（修复中文名乱码）
    lh.setUint16(8, 0, true);           // 压缩方法 = 0 (store)
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); // 中央目录头签名
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);      // 通用标志：bit11=文件名 UTF-8（与本地头一致）
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint16(38, 0, true);
    cd.setUint32(42, offset, true);   // 相对偏移量位于第 42 字节
    central.push({ cd: new Uint8Array(cd.buffer), name: nameBytes });

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((s, c) => s + 46 + c.name.length, 0);
  const centralOffset = offset;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // 结束记录签名
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true);

  const all = [...chunks];
  for (const c of central) all.push(c.cd, c.name);
  all.push(new Uint8Array(end.buffer));

  return new Blob(all, { type: 'application/zip' });
}

// --------------------------------- 工具函数 -----------------------------------
function coverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let sw, sh, sx, sy;
  if (srcRatio > dstRatio) {
    sh = srcH;
    sw = Math.round(srcH * dstRatio);
    sx = Math.round((srcW - sw) / 2);
    sy = 0;
  } else {
    sw = srcW;
    sh = Math.round(srcW / dstRatio);
    sx = 0;
    sy = Math.round((srcH - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

function parseDim(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extOf(format) {
  return { jpeg: '.jpg', png: '.png', webp: '.webp', ico: '.ico', bmp: '.bmp', gif: '.gif', svg: '.svg' }[format] || '.png';
}

function inferFormat(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg'].includes(ext)) return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  if (ext === 'svg') return 'svg';
  return 'png';
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      img._url = url;
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法解析该图片，可能已损坏或格式不支持'));
    };
    img.src = url;
  });
}

// --------------------------- Canvas 编码（JPEG/PNG/WebP） ----------------------
async function encodeCanvas(img, srcW, srcH, opts) {
  const { width, height, fit, format, quality } = opts;

  let w, h;
  if (width && height) { w = width; h = height; }
  else if (width) { w = width; h = Math.round(srcH * (width / srcW)); }
  else if (height) { h = height; w = Math.round(srcW * (height / srcH)); }
  else { w = srcW; h = srcH; }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // JPEG 无透明通道，先铺白底
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  if (fit === 'cover') {
    const c = coverRect(srcW, srcH, w, h);
    ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
  } else if (fit === 'fill') {
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, w, h);
  } else {
    // inside：等比缩放并居中，多余区域留白/透明
    const scale = Math.min(w / srcW, h / srcH);
    const dw = Math.round(srcW * scale);
    const dh = Math.round(srcH * scale);
    const dx = Math.round((w - dw) / 2);
    const dy = Math.round((h - dh) / 2);
    ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, dw, dh);
  }

  const mime =
    format === 'jpeg' ? 'image/jpeg' :
    format === 'webp' ? 'image/webp' : 'image/png';
  const q = Math.max(0.01, Math.min(1, (quality ?? 80) / 100));

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`${format.toUpperCase()} 编码失败，当前浏览器可能不支持该格式`))),
      mime,
      q,
    );
  });

  return { blob, width: w, height: h };
}

// ------------------------------- ICO 打包（多尺寸） ----------------------------
async function buildICO(img, srcW, srcH, sizes) {
  const entries = [];
  let offset = 6 + sizes.length * 16;

  for (const size of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // 等比缩放适应（contain）：不裁切，超出部分保留透明，不主动放大模糊
    const scale = Math.min(1, size / srcW, size / srcH);
    const dw = Math.round(srcW * scale);
    const dh = Math.round(srcH * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, dw, dh);

    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    const data = new Uint8Array(await pngBlob.arrayBuffer());
    entries.push({ size, data, offset });
    offset += data.length;
  }

  const header = new DataView(new ArrayBuffer(6));
  header.setUint16(0, 0, true);          // 保留
  header.setUint16(2, 1, true);          // 类型 = 图标
  header.setUint16(4, sizes.length, true);

  const parts = [new Uint8Array(header.buffer)];
  for (const e of entries) {
    const b = e.size >= 256 ? 0 : e.size; // 256 用 0 表示
    const entry = new DataView(new ArrayBuffer(16));
    entry.setUint8(0, b);                 // 宽度
    entry.setUint8(1, b);                 // 高度
    entry.setUint8(2, 0);                 // 颜色数
    entry.setUint8(3, 0);                 // 保留
    entry.setUint16(4, 1, true);          // 颜色平面
    entry.setUint16(6, 32, true);         // 每像素位数
    entry.setUint32(8, e.data.length, true);
    entry.setUint32(12, e.offset, true);
    parts.push(new Uint8Array(entry.buffer), e.data);
  }

  return new Blob(parts, { type: 'image/x-icon' });
}

// ----------------------------- SVG 处理（iconfont 兼容） ----------------------
function parseViewBox(vb) {
  if (!vb) return null;
  const p = vb.trim().split(/[\s,]+/).map(Number);
  if (p.length === 4 && p.every(Number.isFinite)) return { x: p[0], y: p[1], w: p[2], h: p[3] };
  return null;
}

function round4(n) { return Math.round(n * 10000) / 10000; }

// 仅将少量「安全」的 CSS 属性转为 SVG 展示属性；丢弃 CSS 变量与百分比尺寸（iconfont 易失败）
const SVG_PAINT_PROPS = ['fill', 'stroke', 'stop-color'];
const SVG_NUM_PROPS = ['fill-opacity', 'stroke-opacity', 'stroke-width', 'opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray'];

function applyCssToAttr(el, prop, val) {
  if (!prop || !val) return;
  if (val.includes('var(')) return; // CSS 变量无法解析，直接丢弃
  if (/%$/.test(val) && ['fill', 'stroke', 'stop-color', 'width', 'height'].includes(prop)) return; // 百分比尺寸在 iconfont 易失败
  const set = (name, value) => { if (!el.hasAttribute(name)) el.setAttribute(name, value); };
  if (SVG_PAINT_PROPS.includes(prop)) set(prop, val);
  else if (SVG_NUM_PROPS.includes(prop)) set(prop, val);
}

// 将 Figma 导出的 SVG 清洗为 iconfont 可接受的合规格式：
// 1) 内联 <style> 中的类样式；2) 解析内联 style；3) 移除指向不存在 def 的 clip-path/mask/filter；
// 4) 为缺 fill 的图元补 fill；5) 确保 xmlns。
function sanitizeSvg(root) {
  const rules = [];
  root.querySelectorAll('style').forEach(st => {
    const css = st.textContent || '';
    const re = /([^{}]+)\{([^{}]+)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const sel = m[1].trim();
      const decls = {};
      m[2].split(';').forEach(d => {
        const idx = d.indexOf(':');
        if (idx > -1) {
          const p = d.slice(0, idx).trim();
          const v = d.slice(idx + 1).trim();
          if (p && v) decls[p] = v;
        }
      });
      if (Object.keys(decls).length) rules.push({ sel, decls });
    }
    st.remove();
  });

  root.querySelectorAll('*').forEach(el => {
    for (const rule of rules) {
      if (rule.sel.split(',').some(s => { try { return el.matches(s.trim()); } catch { return false; } })) {
        for (const [p, v] of Object.entries(rule.decls)) applyCssToAttr(el, p, v);
      }
    }
    const styleAttr = el.getAttribute('style');
    if (styleAttr) {
      styleAttr.split(';').forEach(d => {
        const idx = d.indexOf(':');
        if (idx > -1) applyCssToAttr(el, d.slice(0, idx).trim(), d.slice(idx + 1).trim());
      });
      el.removeAttribute('style');
    }
  });

  const ids = new Set([...root.querySelectorAll('[id]')].map(e => e.getAttribute('id')));
  root.querySelectorAll('[clip-path],[mask],[filter]').forEach(el => {
    ['clip-path', 'mask', 'filter'].forEach(attr => {
      const v = el.getAttribute(attr) || '';
      const mm = v.match(/url\(#([^)]+)\)/);
      if (mm && !ids.has(mm[1])) el.removeAttribute(attr);
    });
  });

  root.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,use').forEach(el => {
    if (!el.hasAttribute('fill') && !el.hasAttribute('stroke')) el.setAttribute('fill', 'currentColor');
  });

  // 类样式已内联为展示属性，移除 class 以免冗余 / 干扰解析
  root.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'));

  if (!root.hasAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return root;
}

// 读取 SVG → 清洗 → 量测实际绘制范围 → 重排为「正方形画布 + 透明出血外框」或「原比例收紧 viewBox」
export async function exportSVG(file, opts = {}) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') throw new Error('不是有效的 SVG 文件');

  sanitizeSvg(root);

  // 量测实际绘制范围（需挂载到文档才能调用 getBBox）
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;';
  holder.appendChild(root);
  document.body.appendChild(holder);

  let bbox;
  try { bbox = root.getBBox(); } catch { bbox = null; }
  document.body.removeChild(holder);
  doc.appendChild(root); // 量测后 root 被临时移出，重新挂回文档以便重建

  if (!bbox || !(bbox.width > 0) || !(bbox.height > 0)) {
    const vb = parseViewBox(root.getAttribute('viewBox'));
    if (vb) bbox = { x: vb.x, y: vb.y, width: vb.w, height: vb.h };
    else {
      const w = parseFloat(root.getAttribute('width')) || 100;
      const h = parseFloat(root.getAttribute('height')) || 100;
      bbox = { x: 0, y: 0, width: w, height: h };
    }
  }

  const square = !!opts.square;
  let outW, outH, scale, tx, ty;

  if (square) {
    outW = parseDim(opts.width) || 1024;
    const b = parseDim(opts.bleed);
    const bleed = (b != null && b >= 0) ? b : Math.round(outW * 0.1);
    const inner = Math.max(1, outW - 2 * bleed);
    scale = inner / Math.max(bbox.width, bbox.height);
    const cw = bbox.width * scale;
    const ch = bbox.height * scale;
    // 内容居中于内部出血区域 [bleed, bleed, inner, inner]，四周保留透明留白
    tx = bleed + (inner - cw) / 2 - bbox.x * scale;
    ty = bleed + (inner - ch) / 2 - bbox.y * scale;
    outH = outW;
  } else {
    // 保持原比例，仅将 viewBox 收紧到实际内容（清理 Figma 导出的多余留白）
    scale = 1;
    outW = Math.max(1, Math.round(bbox.width));
    outH = Math.max(1, Math.round(bbox.height));
    tx = -bbox.x;
    ty = -bbox.y;
  }

  const newSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  newSvg.setAttribute('width', String(outW));
  newSvg.setAttribute('height', String(outH));
  newSvg.setAttribute('viewBox', `0 0 ${outW} ${outH}`);

  const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${round4(tx)} ${round4(ty)}) scale(${round4(scale)})`);
  while (root.firstChild) g.appendChild(root.firstChild); // 搬运清洗后的全部子节点
  newSvg.appendChild(g);

  doc.replaceChild(newSvg, root);

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc.documentElement);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  return { blob, width: outW, height: outH };
}

// --------------------------------- 主入口 -------------------------------------
// files: File[]; options: 与 UI 一致的配置对象
// onProgress(done, total)
export async function processFiles(files, options, onProgress) {
  const results = [];
  const zipFiles = [];
  const icoSizes = options.icoSizes && options.icoSizes.length
    ? options.icoSizes
    : [16, 32, 48, 64, 128, 256];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let img = null;
    try {
      const targetFormat = options.format === 'original' ? inferFormat(file) : options.format;
      const outExt = extOf(targetFormat);

      let outBlob, outW, outH;

      if (targetFormat === 'svg') {
        // SVG 走矢量重排路径，无需解码为位图
        const r = await exportSVG(file, {
          width: options.svgWidth,
          bleed: options.svgBleed,
          square: options.format === 'svg',
        });
        outBlob = r.blob;
        outW = r.width;
        outH = r.height;
      } else {
        img = await loadImage(file);
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;

        if (targetFormat === 'ico') {
          outBlob = await buildICO(img, srcW, srcH, icoSizes);
          const maxSize = icoSizes[icoSizes.length - 1] || 256;
          outW = maxSize;
          outH = maxSize;
        } else {
          const r = await encodeCanvas(img, srcW, srcH, {
            width: parseDim(options.width),
            height: parseDim(options.height),
            fit: options.fit || 'inside',
            format: targetFormat,
            quality: options.quality,
          });
          outBlob = r.blob;
          outW = r.width;
          outH = r.height;
        }
      }

      const baseName = file.name.replace(/\.[^.]+$/, '');
      const outName = `${baseName}${outExt}`;
      zipFiles.push({ name: outName, blob: outBlob });

      results.push({
        success: true,
        originalName: file.name,
        originalSize: file.size,
        outputSize: outBlob.size,
        outputWidth: outW,
        outputHeight: outH,
        format: targetFormat,
      });
    } catch (e) {
      results.push({
        success: false,
        originalName: file.name,
        originalSize: file.size,
        error: e.message || '处理失败',
      });
    } finally {
      if (img && img._url) URL.revokeObjectURL(img._url);
    }
    onProgress?.(i + 1, files.length);
  }

  const zipBlob = await createZip(zipFiles);
  return { results, zipBlob };
}
