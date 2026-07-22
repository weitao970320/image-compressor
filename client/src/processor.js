// =============================================================================
// 浏览器端图片处理引擎 — 纯前端，无需任何服务器
// 使用 Canvas API 完成缩放 / 裁切 / 格式转换，自实现 ZIP 打包（STORE 模式）。
// SVG → 图标字体：复用归一化管线 + opentype.js 组装字形，WOFF 用 CompressionStream 封装。
// 所有像素处理均在用户浏览器内完成，图片不会上传到任何服务器。
// =============================================================================

import opentype from 'opentype.js';

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

  // 量测实际绘制范围（克隆节点挂载到文档调用 getBBox）
  let bbox = measureBBox(root);

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

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(newSvg);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  return { blob, width: outW, height: outH };
}

// -------------------------- SVG → OpenType 字形路径 --------------------------
// 复用 sanitizeSvg + getBBox：把每个图形（path/rect/circle/ellipse/polygon/line）
// 归一化到 em 方形，并转换坐标（Y 轴翻转，SVG 的 y 向下 → 字体的 y 向上）。

function measureBBox(root) {
  // 用 clone 量测：clone 不是 documentElement，可安全挂到文档调用 getBBox；几何与原节点一致
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;';
  const clone = root.cloneNode(true);
  holder.appendChild(clone);
  document.body.appendChild(holder);
  let bbox;
  try { bbox = clone.getBBox(); } catch { bbox = null; }
  document.body.removeChild(holder);

  if (bbox && bbox.width > 0 && bbox.height > 0) return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  const vb = parseViewBox(root.getAttribute('viewBox'));
  if (vb) return { x: vb.x, y: vb.y, width: vb.w, height: vb.h };
  return { x: 0, y: 0, width: parseFloat(root.getAttribute('width')) || 100, height: parseFloat(root.getAttribute('height')) || 100 };
}

// 把内容 bbox 映射到 [pad, unitsPerEm-pad] 的方形内（contain 居中），并翻转 Y
function makeEmMap(bbox, unitsPerEm, pad) {
  const inner = unitsPerEm - 2 * pad;
  const scale = inner / Math.max(bbox.width, bbox.height);
  const ox = pad + (inner - bbox.width * scale) / 2 - bbox.x * scale;
  const oy = pad + (inner - bbox.height * scale) / 2 - bbox.y * scale;
  return (x, y) => {
    const fx = x * scale + ox;
    const fy = unitsPerEm - (y * scale + oy); // 翻转 Y 轴
    return [fx, fy];
  };
}

// SVG 圆弧命令 → 三次贝塞尔（标准端点-中心参数化）
function arcToCubic(x1, y1, x2, y2, rx, ry, phiDeg, largeArc, sweep) {
  const phi = phiDeg * Math.PI / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let rxn = Math.abs(rx), ryn = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxn * rxn) + (y1p * y1p) / (ryn * ryn);
  if (lambda > 1) { const s = Math.sqrt(lambda); rxn *= s; ryn *= s; }
  const sign = (largeArc === sweep) ? -1 : 1;
  const denom = (rxn * rxn * y1p * y1p + ryn * ryn * x1p * x1p) || 1;
  let co = sign * Math.sqrt(Math.max(0, (rxn * rxn * ryn * ryn - rxn * rxn * y1p * y1p - ryn * ryn * x1p * x1p) / denom));
  if (isNaN(co)) co = 0;
  const cxp = co * (rxn * y1p) / ryn;
  const cyp = co * (-ryn * x1p) / rxn;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy) || 1;
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rxn, (y1p - cyp) / ryn);
  let delta = angle((x1p - cxp) / rxn, (y1p - cyp) / ryn, (-x1p - cxp) / rxn, (-y1p - cyp) / ryn);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const dTheta = delta / segs;
  const t = (4 / 3) * Math.tan(dTheta / 4);
  const out = [];
  let px = x1, py = y1;
  for (let i = 0; i < segs; i++) {
    const a1 = theta1 + i * dTheta;
    const a2 = a1 + dTheta;
    const ex = cx + rxn * Math.cos(a2);
    const ey = cy + ryn * Math.sin(a2);
    const c1x = px + t * (-rxn * Math.sin(a1));
    const c1y = py + t * (ryn * Math.cos(a1));
    const c2x = ex - t * (-rxn * Math.sin(a2));
    const c2y = ey - t * (ryn * Math.cos(a2));
    out.push([c1x, c1y, c2x, c2y, ex, ey]);
    px = ex; py = ey;
  }
  return out;
}

// 解析 path 的 d 属性：处理全部命令（含相对坐标），逐点经 map 变换后写入 opentype.Path
function appendPathD(otPath, d, map) {
  if (!d) return;
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return;
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, pcx = null, pcy = null, cmd = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[A-Za-z]/.test(tk)) { cmd = tk; i++; }
    else if (!cmd) { i++; continue; }
    const abs = cmd === cmd.toUpperCase();
    const c = cmd.toUpperCase();
    if (c === 'M') {
      let x = num(), y = num();
      if (!abs) { x += cx; y += cy; }
      const [X, Y] = map(x, y); otPath.moveTo(X, Y);
      sx = x; sy = y; cx = x; cy = y; pcx = pcy = null;
      cmd = abs ? 'L' : 'l';
    } else if (c === 'L') {
      let x = num(), y = num();
      if (!abs) { x += cx; y += cy; }
      const [X, Y] = map(x, y); otPath.lineTo(X, Y);
      cx = x; cy = y; pcx = pcy = null;
    } else if (c === 'H') {
      let x = num();
      if (!abs) x += cx;
      const [X, Y] = map(x, cy); otPath.lineTo(X, Y);
      cx = x; pcx = pcy = null;
    } else if (c === 'V') {
      let y = num();
      if (!abs) y += cy;
      const [X, Y] = map(cx, y); otPath.lineTo(X, Y);
      cy = y; pcx = pcy = null;
    } else if (c === 'C') {
      let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      if (!abs) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
      const [X1, Y1] = map(x1, y1), [X2, Y2] = map(x2, y2), [X, Y] = map(x, y);
      otPath.curveTo(X1, Y1, X2, Y2, X, Y);
      pcx = x2; pcy = y2; cx = x; cy = y;
    } else if (c === 'S') {
      let x2 = num(), y2 = num(), x = num(), y = num();
      if (!abs) { x2 += cx; y2 += cy; x += cx; y += cy; }
      const rcx = pcx == null ? cx : 2 * cx - pcx;
      const rcy = pcy == null ? cy : 2 * cy - pcy;
      const [X1, Y1] = map(rcx, rcy), [X2, Y2] = map(x2, y2), [X, Y] = map(x, y);
      otPath.curveTo(X1, Y1, X2, Y2, X, Y);
      pcx = x2; pcy = y2; cx = x; cy = y;
    } else if (c === 'Q') {
      let x1 = num(), y1 = num(), x = num(), y = num();
      if (!abs) { x1 += cx; y1 += cy; x += cx; y += cy; }
      const [X1, Y1] = map(x1, y1), [X, Y] = map(x, y);
      otPath.quadTo(X1, Y1, X, Y);
      pcx = x1; pcy = y1; cx = x; cy = y;
    } else if (c === 'T') {
      let x = num(), y = num();
      if (!abs) { x += cx; y += cy; }
      const rcx = pcx == null ? cx : 2 * cx - pcx;
      const rcy = pcy == null ? cy : 2 * cy - pcy;
      const [X1, Y1] = map(rcx, rcy), [X, Y] = map(x, y);
      otPath.quadTo(X1, Y1, X, Y);
      pcx = rcx; pcy = rcy; cx = x; cy = y;
    } else if (c === 'A') {
      let rx = num(), ry = num(), phi = num(), laf = num(), sf = num(), x = num(), y = num();
      if (!abs) { x += cx; y += cy; }
      const segs = arcToCubic(cx, cy, x, y, rx, ry, phi, laf, sf);
      for (const s of segs) {
        const [c1x, c1y] = map(s[0], s[1]), [c2x, c2y] = map(s[2], s[3]), [X, Y] = map(s[4], s[5]);
        otPath.curveTo(c1x, c1y, c2x, c2y, X, Y);
      }
      pcx = pcy = null; cx = x; cy = y;
    } else if (c === 'Z') {
      otPath.close();
      cx = sx; cy = sy; pcx = pcy = null;
    } else { i++; }
  }
}

function emitEllipse(otPath, cxv, cyv, rx, ry, map) {
  const k = 0.5522847498307936;
  const top = [cxv, cyv - ry], right = [cxv + rx, cyv], bottom = [cxv, cyv + ry], left = [cxv - rx, cyv];
  const c1 = [cxv + rx * k, cyv - ry], c2 = [cxv + rx, cyv - ry * k];
  const c3 = [cxv + rx, cyv + ry * k], c4 = [cxv + rx * k, cyv + ry];
  const c5 = [cxv - rx * k, cyv + ry], c6 = [cxv - rx, cyv + ry * k];
  const c7 = [cxv - rx, cyv - ry * k], c8 = [cxv - rx * k, cyv - ry];
  let S = map(top[0], top[1]); otPath.moveTo(S[0], S[1]);
  let a = map(c1[0], c1[1]), b = map(c2[0], c2[1]), e = map(right[0], right[1]); otPath.curveTo(a[0], a[1], b[0], b[1], e[0], e[1]);
  a = map(c3[0], c3[1]); b = map(c4[0], c4[1]); e = map(bottom[0], bottom[1]); otPath.curveTo(a[0], a[1], b[0], b[1], e[0], e[1]);
  a = map(c5[0], c5[1]); b = map(c6[0], c6[1]); e = map(left[0], left[1]); otPath.curveTo(a[0], a[1], b[0], b[1], e[0], e[1]);
  a = map(c7[0], c7[1]); b = map(c8[0], c8[1]); e = map(top[0], top[1]); otPath.curveTo(a[0], a[1], b[0], b[1], e[0], e[1]);
  otPath.close();
}

function appendShapeToPath(otPath, el, map) {
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'path') { appendPathD(otPath, el.getAttribute('d'), map); return; }
  const num = (v) => parseFloat(v) || 0;
  if (tag === 'rect') {
    const x = num(el.getAttribute('x')), y = num(el.getAttribute('y'));
    const w = num(el.getAttribute('width')), h = num(el.getAttribute('height'));
    const rx = num(el.getAttribute('rx')), ry = num(el.getAttribute('ry')) || rx;
    if (rx > 0 && ry > 0) {
      const [aX, aY] = map(x + rx, y); otPath.moveTo(aX, aY);
      const [bX, bY] = map(x + w - rx, y); otPath.lineTo(bX, bY);
      let q1 = map(x + w, y), q2 = map(x + w, y + ry); otPath.quadTo(q1[0], q1[1], q2[0], q2[1]);
      const [cX, cY] = map(x + w, y + h - ry); otPath.lineTo(cX, cY);
      let q3 = map(x + w, y + h), q4 = map(x + w - rx, y + h); otPath.quadTo(q3[0], q3[1], q4[0], q4[1]);
      const [dX, dY] = map(x + rx, y + h); otPath.lineTo(dX, dY);
      let q5 = map(x, y + h), q6 = map(x, y + h - ry); otPath.quadTo(q5[0], q5[1], q6[0], q6[1]);
      const [eX, eY] = map(x, y + ry); otPath.lineTo(eX, eY);
      let q7 = map(x, y), q8 = map(x + rx, y); otPath.quadTo(q7[0], q7[1], q8[0], q8[1]);
      otPath.close();
    } else {
      const [X0, Y0] = map(x, y); otPath.moveTo(X0, Y0);
      const [X1, Y1] = map(x + w, y); otPath.lineTo(X1, Y1);
      const [X2, Y2] = map(x + w, y + h); otPath.lineTo(X2, Y2);
      const [X3, Y3] = map(x, y + h); otPath.lineTo(X3, Y3);
      otPath.close();
    }
    return;
  }
  if (tag === 'circle') { emitEllipse(otPath, num(el.getAttribute('cx')), num(el.getAttribute('cy')), num(el.getAttribute('r')), num(el.getAttribute('r')), map); return; }
  if (tag === 'ellipse') { emitEllipse(otPath, num(el.getAttribute('cx')), num(el.getAttribute('cy')), num(el.getAttribute('rx')), num(el.getAttribute('ry')), map); return; }
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    for (let k = 0; k < pts.length; k += 2) {
      const [X, Y] = map(pts[k], pts[k + 1]);
      if (k === 0) otPath.moveTo(X, Y); else otPath.lineTo(X, Y);
    }
    if (tag === 'polygon') otPath.close();
    return;
  }
  if (tag === 'line') {
    const [X1, Y1] = map(num(el.getAttribute('x1')), num(el.getAttribute('y1')));
    const [X2, Y2] = map(num(el.getAttribute('x2')), num(el.getAttribute('y2')));
    otPath.moveTo(X1, Y1); otPath.lineTo(X2, Y2);
    return;
  }
}

// 把一段 SVG 文本转成 opentype.Path（em 方形、Y 翻转）
export async function svgToOpenTypePath(svgText, unitsPerEm = 1000, pad = 0) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') return null;
  sanitizeSvg(root);
  const bbox = measureBBox(root);
  if (!bbox) return null;
  const map = makeEmMap(bbox, unitsPerEm, pad);
  const otPath = new opentype.Path();
  root.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line').forEach((el) => appendShapeToPath(otPath, el, map));
  if (!otPath.commands || otPath.commands.length === 0) return null;
  return otPath;
}

// ------------------------------ 图标字体（iconfont 模式） ------------------------------
// 每个 SVG → 一个字形，码位从私有区 U+E001 起；生成 TTF + WOFF + CSS + 演示 HTML + JSON。

function slugify(s) {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join('-') || 'icon';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}
const align4 = (n) => Math.ceil(n / 4) * 4;
function tagToUint32(t) { let v = 0; for (let i = 0; i < 4; i++) v = (v << 8) | (t.charCodeAt(i) || 0); return v >>> 0; }

async function deflateZlib(buf) {
  if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream 不可用');
  const cs = new CompressionStream('deflate'); // zlib 格式（RFC1950），即 WOFF 所需
  const writer = cs.writable.getWriter();
  writer.write(new Uint8Array(buf));
  writer.close();
  return await new Response(cs.readable).arrayBuffer();
}

// 把 OpenType(TTF) 字节按表压缩封装为 WOFF
export async function ttfToWoff(ttf) {
  const dv = new DataView(ttf);
  const numTables = dv.getUint16(4);
  const flavor = dv.getUint32(0);
  const tables = [];
  let off = 12;
  for (let i = 0; i < numTables; i++) {
    const tag = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
    const checksum = dv.getUint32(off + 4);
    const offset = dv.getUint32(off + 8);
    const length = dv.getUint32(off + 12);
    tables.push({ tag, checksum, offset, length });
    off += 16;
  }
  const totalSfnt = ttf.byteLength;
  const compressed = [];
  const dir = [];
  let dataOffset = 44 + numTables * 20;
  for (const t of tables) {
    const slice = ttf.slice(t.offset, t.offset + t.length);
    const comp = await deflateZlib(slice);
    compressed.push(comp);
    dir.push({ tag: t.tag, offset: dataOffset, compLength: comp.byteLength, origLength: t.length, checksum: t.checksum });
    dataOffset += align4(comp.byteLength);
  }
  const out = new ArrayBuffer(dataOffset);
  const odv = new DataView(out);
  odv.setUint32(0, 0x774f4646); // 'wOFF'
  odv.setUint32(4, flavor);
  odv.setUint32(8, dataOffset);
  odv.setUint16(12, numTables);
  odv.setUint16(14, 0);
  odv.setUint32(16, totalSfnt);
  odv.setUint16(20, 1);
  odv.setUint16(22, 0);
  let p = 44;
  for (const e of dir) {
    odv.setUint32(p, tagToUint32(e.tag));
    odv.setUint32(p + 4, e.offset);
    odv.setUint32(p + 8, e.compLength);
    odv.setUint32(p + 12, e.origLength);
    odv.setUint32(p + 16, e.checksum);
    p += 20;
  }
  let wp = 44 + numTables * 20;
  for (const c of compressed) {
    new Uint8Array(out).set(new Uint8Array(c), wp);
    wp += align4(c.byteLength);
  }
  return out;
}

export async function buildIconFont(files, options, onProgress) {
  const fontFamily = (options.fontFamily || 'MyIcons').trim() || 'MyIcons';
  const unitsPerEm = 1000;
  const padRaw = parseDim(options.fontPad);
  const pad = (padRaw != null && padRaw >= 0) ? Math.min(padRaw, unitsPerEm * 0.4) : 0;

  const svgFiles = files.filter((f) => (f.name.split('.').pop() || '').toLowerCase() === 'svg');
  const otGlyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: unitsPerEm, path: new opentype.Path() })];
  const glyphs = [];
  const previewSvgs = [];
  const usedNames = new Set();
  let code = 0xe001;

  for (let i = 0; i < svgFiles.length; i++) {
    const file = svgFiles[i];
    try {
      const text = await file.text();
      const otPath = await svgToOpenTypePath(text, unitsPerEm, pad);
      if (!otPath) { glyphs.push({ name: file.name, ok: false, error: '无法解析为有效路径' }); onProgress?.(i + 1, svgFiles.length); continue; }
      let cls = 'icon-' + slugify(file.name.replace(/\.[^.]+$/, ''));
      if (usedNames.has(cls)) cls = `${cls}-${i}`;
      usedNames.add(cls);
      const unicode = code++;
      otGlyphs.push(new opentype.Glyph({ name: cls, unicode, advanceWidth: unitsPerEm, path: otPath }));
      const prev = await exportSVG(file, { width: 240, bleed: 0, square: true });
      const prevText = await prev.blob.text();
      glyphs.push({ name: file.name, className: cls, unicode, code: unicode.toString(16), ok: true });
      previewSvgs.push({ className: cls, unicode, code: unicode.toString(16), svg: prevText });
    } catch (e) {
      glyphs.push({ name: file.name, ok: false, error: e.message || '生成失败' });
    }
    onProgress?.(i + 1, svgFiles.length);
  }

  const font = new opentype.Font({ familyName: fontFamily, styleName: 'Regular', unitsPerEm, ascender: unitsPerEm, descender: 0, glyphs: otGlyphs });
  const ttf = font.toArrayBuffer();
  let woff = null;
  try { woff = await ttfToWoff(ttf); } catch { woff = null; }

  const safe = fontFamily.replace(/[^A-Za-z0-9_-]/g, '-');
  const ttfB64 = arrayBufferToBase64(ttf);
  const woffB64 = woff ? arrayBufferToBase64(woff) : null;
  const srcParts = [];
  if (woffB64) srcParts.push(`url('data:font/woff;charset=utf-8;base64,${woffB64}') format('woff')`);
  srcParts.push(`url('data:font/ttf;charset=utf-8;base64,${ttfB64}') format('truetype')`);
  // 每个图标的 ::before 内容规则（iconfont 标准用法：<i class="icon icon-xxx"></i> 即渲染对应字形）
  const glyphCss = previewSvgs.map((p) => `.${p.className}::before { content: "\\${p.code}"; }`).join('\n');
  const css = `@font-face {\n  font-family: '${fontFamily}';\n  src: ${srcParts.join(',\n       ')};\n  font-weight: normal;\n  font-style: normal;\n  font-display: block;\n}\n.icon {\n  font-family: '${fontFamily}';\n  font-weight: normal;\n  font-style: normal;\n  font-variant: normal;\n  line-height: 1;\n  display: inline-block;\n  -webkit-font-smoothing: antialiased;\n}\n${glyphCss}\n`;

  const items = previewSvgs.map((p) => `      <li class="icon-item" data-cls="${escapeHtml(p.className)}" data-code="${escapeHtml(p.code)}" title="点击复制 unicode（当前模式）">
        <i class="icon ${escapeHtml(p.className)}"></i>
        <span class="icon-name" title="点击复制类名 ${escapeHtml(p.className)}">${escapeHtml(p.className)}</span>
        <code class="icon-code">&amp;#x${escapeHtml(p.code)};</code>
      </li>`).join('\n');

  const demo = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fontFamily)} · 图标字体预览</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; background:#0f1220; color:#e8ecf5; padding:32px; }
  h1 { font-size:20px; font-weight:700; margin:0 0 4px; }
  .controls { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
  .search { flex:1; min-width:200px; background:#181c2e; border:1px solid #2a2f45; border-radius:10px; color:#e8ecf5; font-size:13px; padding:9px 12px; outline:none; }
  .search:focus { border-color:#5b8cff; }
  .mode { display:inline-flex; background:#181c2e; border:1px solid #2a2f45; border-radius:10px; padding:3px; gap:3px; }
  .mode-btn { border:0; background:transparent; color:#aeb6cc; font-size:12px; padding:6px 12px; border-radius:8px; cursor:pointer; transition:.15s; }
  .mode-btn--active { background:#5b8cff; color:#fff; }
  .sub { color:#8b93a7; font-size:13px; margin-bottom:20px; }
  .icon { font-size:28px; }
  ${css}
  .grid { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:12px; }
  .icon-item { background:#181c2e; border:1px solid #262b40; border-radius:12px; padding:18px 10px; display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer; transition:.15s; }
  .icon-item:hover { border-color:#5b8cff; transform:translateY(-2px); }
  .icon-name { font-size:12px; color:#aeb6cc; word-break:break-all; text-align:center; cursor:pointer; border-bottom:1px dashed transparent; }
  .icon-name:hover { color:#cfd6e8; border-bottom-color:#5b8cff; }
  .icon-code { font-size:11px; color:#6b738f; background:#0f1220; padding:2px 6px; border-radius:6px; }
  .toast { position:fixed; left:50%; bottom:32px; transform:translateX(-50%) translateY(20px); background:#5b8cff; color:#fff; padding:10px 18px; border-radius:999px; font-size:13px; opacity:0; transition:.2s; pointer-events:none; max-width:80vw; }
  .toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
</style>
</head>
<body>
  <h1>${escapeHtml(fontFamily)}</h1>
  <div class="controls">
    <input id="search" class="search" type="search" placeholder="搜索图标类名…" autocomplete="off" />
    <div class="mode" id="mode">
      <button type="button" class="mode-btn mode-btn--active" data-mode="dev">开发复制</button>
      <button type="button" class="mode-btn" data-mode="design">设计复制</button>
    </div>
  </div>
  <div class="sub" id="count">共 ${previewSvgs.length} 个图标 · 点击图标复制（开发：浏览器可解析的 unicode；设计：可粘贴进 Figma 的字符）</div>
  <ul class="grid">
${items}
  </ul>
  <div class="toast" id="toast">已复制</div>
  <script>
    const t = document.getElementById('toast');
    function showToast(msg){ t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 1600); }
    let mode = 'dev';
    const modeBox = document.getElementById('mode');
    modeBox.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      modeBox.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('mode-btn--active'));
      b.classList.add('mode-btn--active');
    }));
    function fallbackCopy(text){
      try { const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); const r=document.execCommand('copy'); ta.remove(); return r; }
      catch { return false; }
    }
    function copyText(text){
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(()=>true).catch(()=>fallbackCopy(text));
      }
      return Promise.resolve(fallbackCopy(text));
    }
    document.querySelectorAll('.icon-item').forEach(li => {
      const cls = li.dataset.cls;
      const code = li.dataset.code;
      const char = String.fromCodePoint(parseInt(code, 16));
      const dev = '&#x' + code + ';';
      li.addEventListener('click', async () => {
        const text = mode === 'design' ? char : dev;
        const ok = await copyText(text);
        const label = mode === 'design'
          ? ('设计字符 · ' + cls + ' (U+' + code.toUpperCase() + ')')
          : ('开发 unicode · ' + dev);
        showToast((ok ? '已复制 ' : '复制失败：') + label);
      });
      li.querySelector('.icon-name').addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await copyText(cls);
        showToast((ok ? '已复制类名：' : '复制失败：') + cls);
      });
    });
    const search = document.getElementById('search');
    const itemsAll = Array.from(document.querySelectorAll('.icon-item'));
    const countEl = document.getElementById('count');
    const total = itemsAll.length;
    const baseSub = '点击图标复制（开发：浏览器可解析的 unicode；设计：可粘贴进 Figma 的字符）';
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      itemsAll.forEach(li => {
        const match = li.dataset.cls.toLowerCase().includes(q);
        li.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      countEl.textContent = q ? ('匹配 ' + shown + ' / ' + total + ' 个图标') : ('共 ' + total + ' 个图标 · ' + baseSub);
    });
  </script>
</body>
</html>`;

  const json = JSON.stringify({
    fontFamily,
    count: previewSvgs.length,
    icons: previewSvgs.map((p) => ({
      className: p.className,
      unicode: p.unicode,
      char: String.fromCodePoint(p.unicode),
      code: '&#x' + p.code + ';',
      css: '.' + p.className + '::before { content: "\\' + p.code + '"; }',
    })),
  }, null, 2);

  const zipFiles = [
    woff ? { name: `${safe}.woff`, blob: new Blob([woff], { type: 'font/woff' }) } : null,
    { name: `${safe}.ttf`, blob: new Blob([ttf], { type: 'font/ttf' }) },
    { name: `${safe}.css`, blob: new Blob([css], { type: 'text/css' }) },
    { name: 'demo.html', blob: new Blob([demo], { type: 'text/html' }) },
    { name: 'glyphs.json', blob: new Blob([json], { type: 'application/json' }) },
  ].filter(Boolean);

  const zipBlob = await createZip(zipFiles);
  return {
    type: 'iconfont',
    fontName: fontFamily,
    count: previewSvgs.length,
    total: svgFiles.length,
    failed: glyphs.filter((g) => !g.ok).length,
    glyphs,
    previewSvgs,
    zipBlob,
    zipName: `${safe}_iconfont.zip`,
    css,
  };
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
