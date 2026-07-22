import { useState, useCallback, useRef, useEffect } from 'react';
import { processFiles } from './processor';

// ========== 系统预设 ==========
const SYSTEM_PRESETS = [
  { id: 'web-photo', name: '网页照片优化', format: 'jpeg', quality: 85, width: 1920, height: null, fit: 'inside', progressive: true, stripMetadata: true },
  { id: 'web-thumb', name: '缩略图生成', format: 'jpeg', quality: 75, width: 400, height: 300, fit: 'cover', progressive: true, stripMetadata: true },
  { id: 'png-lossless', name: 'PNG 无损压缩', format: 'png', quality: 100, width: null, height: null, lossless: true, colors: 256, stripMetadata: true },
  { id: 'png-quant', name: 'PNG 有损量化', format: 'png', quality: 80, width: null, height: null, lossless: false, colors: 128, dither: 0.8, stripMetadata: true },
  { id: 'webp-best', name: 'WebP 最佳压缩', format: 'webp', quality: 80, width: null, height: null, effort: 6, stripMetadata: true },
  { id: 'ico-favicon', name: 'Favicon 图标', format: 'ico', quality: 100, width: 256, height: 256, fit: 'cover', icoSizes: [16, 32, 48, 64, 128, 256] },
  { id: 'social-media', name: '社交媒体封面', format: 'jpeg', quality: 90, width: 1200, height: 630, fit: 'cover', progressive: true, stripMetadata: true },
  { id: 'max-compress', name: '极限压缩', format: 'jpeg', quality: 60, width: 1280, height: null, fit: 'inside', progressive: false, stripMetadata: true },
];

const FORMATS = [
  { value: 'jpeg', label: 'JPEG', ext: '.jpg' },
  { value: 'png', label: 'PNG', ext: '.png' },
  { value: 'webp', label: 'WebP', ext: '.webp' },
  { value: 'ico', label: 'ICO', ext: '.ico' },
  { value: 'svg', label: 'SVG', ext: '.svg' },
  { value: 'original', label: '保持原格式', ext: '' },
];

const FIT_OPTIONS = [
  { value: 'inside', label: '等比例缩放 — 不超出目标尺寸' },
  { value: 'cover', label: '居中裁切 — 填满目标尺寸' },
  { value: 'fill', label: '拉伸填充 — 可能变形' },
];

const ICO_SIZES_ALL = [16, 32, 48, 64, 128, 256];

// ========== 工具函数 ==========
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function calcRatio(orig, out) {
  if (!orig || orig === 0) return '0';
  return ((orig - out) / orig * 100).toFixed(1);
}

// ========== 自定义预设管理 ==========
const CUSTOM_PRESETS_KEY = 'img-compressor-custom-presets';
function loadCustomPresets() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || '[]'); }
  catch { return []; }
}
function saveCustomPresets(presets) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

// ========== 主题管理 ==========
function initTheme() {
  const stored = localStorage.getItem('img-compressor-theme');
  if (stored === 'light') document.documentElement.classList.remove('dark');
  else if (stored === 'dark') document.documentElement.classList.add('dark');
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) { document.documentElement.classList.remove('dark'); localStorage.setItem('img-compressor-theme', 'light'); }
  else { document.documentElement.classList.add('dark'); localStorage.setItem('img-compressor-theme', 'dark'); }
}

export default function App() {
  // 主题
  const [isDark, setIsDark] = useState(() => {
    initTheme();
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      if (!localStorage.getItem('img-compressor-theme')) {
        if (e.matches) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        setIsDark(e.matches);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleThemeToggle = () => { toggleTheme(); setIsDark(!isDark); };

  // 状态
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState({
    format: 'jpeg', quality: 80, width: '', height: '', fit: 'inside',
    lossless: false, effort: 4, colors: 256, dither: 1.0,
    progressive: true, stripMetadata: true, icoSizes: [16, 32, 48, 64, 128, 256],
    svgWidth: 1024, svgBleed: 100,
  });
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [customPresets, setCustomPresets] = useState(loadCustomPresets);
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState('processed_images.zip');
  const [showDownloadNotif, setShowDownloadNotif] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const presetInputRef = useRef(null);

  // 合并预设
  const allPresets = [...SYSTEM_PRESETS, ...customPresets.map(p => ({ ...p, isCustom: true }))];

  // 处理文件选择（支持单文件、多选与文件夹）
  const handleFileSelect = useCallback((newFiles) => {
    const validExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'svg'];
    const validFiles = Array.from(newFiles).filter(f => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      return validExts.includes(ext);
    });
    setFiles(prev => {
      const existingKeys = new Set(prev.map(f => (f.webkitRelativePath || f.name) + f.size));
      const unique = validFiles.filter(f => !existingKeys.has((f.webkitRelativePath || f.name) + f.size));
      return [...prev, ...unique];
    });
    setResults(null);
    setError(null);
    setDownloadUrl(null);
    setShowDownloadNotif(false);
  }, []);

  // 拖拽处理
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setResults(null);
    setDownloadUrl(null);
  };

  const clearFiles = () => { setFiles([]); setResults(null); setDownloadUrl(null); setShowDownloadNotif(false); };

  const updateOption = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
    setActivePreset(null);
  };

  const applyPreset = (preset) => {
    const optKeys = ['format', 'quality', 'width', 'height', 'fit', 'lossless', 'effort', 'colors', 'dither', 'progressive', 'stripMetadata', 'icoSizes'];
    const newOpts = { ...options };
    optKeys.forEach(k => { if (preset[k] !== undefined) newOpts[k] = preset[k]; });
    setOptions(newOpts);
    setActivePreset(preset.id);
  };

  // 保存自定义预设
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const newPreset = {
      id: 'custom-' + Date.now(),
      name,
      isCustom: true,
      ...options,
      width: options.width === '' ? null : parseInt(options.width),
      height: options.height === '' ? null : parseInt(options.height),
    };
    const updated = [...customPresets, newPreset].slice(-10); // 最多10个
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetName('');
    setShowPresetInput(false);
    setActivePreset(newPreset.id);
  };

  const deleteCustomPreset = (presetId) => {
    const updated = customPresets.filter(p => p.id !== presetId);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    if (activePreset === presetId) setActivePreset(null);
  };

  // 处理提交（纯浏览器端，无需服务器）
  const handleProcess = async () => {
    if (files.length === 0) { setError('请先上传图片'); return; }

    setProcessing(true);
    setError(null);
    setResults(null);
    setDownloadUrl(null);
    setShowDownloadNotif(false);

    // 压缩包名称：单图用首图名，多图用「首图名等N张图片」，保证每次有区别
    const firstBase = (files[0]?.name || '').replace(/\.[^.]+$/, '') || 'processed_images';
    const zipName = files.length > 1
      ? `${firstBase}等${files.length}张图片_processed.zip`
      : `${firstBase}_processed.zip`;
    setDownloadName(zipName);

    try {
      const out = await processFiles(files, options, () => {});
      setResults({ results: out.results });

      const url = URL.createObjectURL(out.zipBlob);
      setDownloadUrl(url);
      setShowDownloadNotif(true);

      // 自动下载
      const link = document.createElement('a');
      link.href = url;
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(err.message || '处理失败');
    } finally {
      setProcessing(false);
    }
  };

  // 手动下载
  const manualDownload = () => {
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowDownloadNotif(true);
    }
  };

  const currentFormat = FORMATS.find(f => f.value === options.format);
  const successResults = results?.results?.filter(r => r.success) || [];
  const totalOrig = successResults.reduce((s, r) => s + r.originalSize, 0);
  const totalOut = successResults.reduce((s, r) => s + (r.outputSize || 0), 0);

  return (
    <>
      {/* 环境光晕 */}
      <div className="ambient-glow ambient-glow--a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow--b" aria-hidden="true" />
      <div className="ambient-glow ambient-glow--c" aria-hidden="true" />

      {/* Header */}
      <header className="header">
        <div className="container header__inner">
          <div className="header__brand">
            <div className="header__logo">
              <svg viewBox="0 0 24 24" fill="none">
                <text x="12" y="18" fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fontSize="16" fontWeight="800" textAnchor="middle" fill="currentColor">M</text>
              </svg>
            </div>
            <span className="header__title">小明图像处理</span>
          </div>
          <button className="theme-toggle" onClick={handleThemeToggle} aria-label="切换亮色/暗色模式" title="切换亮色/暗色模式">
            <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
            <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <div className="container">
          {/* 上传区 */}
          <section className="upload-section">
            <div
              className={`upload-zone${dragOver ? ' upload-zone--drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="拖拽图片到此处上传，或点击选择文件"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            >
              <div className="upload-zone__icon-ring">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <p className="upload-zone__title">拖拽图片到此处，或点击上传</p>
              <p className="upload-zone__desc">支持 JPG、PNG、WebP、BMP、TIFF、GIF、SVG — 批量处理，本地完成</p>
              <div className="upload-zone__actions">
                <button className="upload-zone__btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>选择文件</button>
                <button className="upload-zone__btn upload-zone__btn--ghost" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>上传文件夹</button>
              </div>
              <div className="upload-zone__hint">
                <span>单文件 ≤ 50MB</span>
                <span className="upload-zone__hint-divider" />
                <span>最多 50 张</span>
                <span className="upload-zone__hint-divider" />
                <span>隐私安全</span>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file" multiple
              accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/svg+xml"
              onChange={(e) => { handleFileSelect(e.target.files); e.target.value = ''; }}
              style={{ display: 'none' }}
            />
            <input
              ref={folderInputRef}
              type="file" multiple webkitdirectory="" directory=""
              onChange={(e) => { handleFileSelect(e.target.files); e.target.value = ''; }}
              style={{ display: 'none' }}
            />
          </section>

          {/* 预设胶囊 */}
          <section className="presets-section">
            <div className="presets-label">
              <span className="presets-label__dot" />
              快捷预设
            </div>
            <div className="presets-row">
              {allPresets.map(p => (
                <button
                  key={p.id}
                  className={`preset-chip${activePreset === p.id ? ' preset-chip--active' : ''}${p.isCustom ? ' preset-chip--custom' : ''}`}
                  onClick={() => applyPreset(p)}
                  aria-pressed={activePreset === p.id}
                >
                  <span className="preset-chip__indicator" />
                  {p.name}
                  {p.isCustom && (
                    <span
                      className="preset-chip__delete"
                      onClick={(e) => { e.stopPropagation(); deleteCustomPreset(p.id); }}
                      title="删除此预设"
                    >✕</span>
                  )}
                </button>
              ))}
              <button className="save-preset-btn" onClick={() => { setShowPresetInput(true); setPresetName(''); setTimeout(() => presetInputRef.current?.focus(), 100); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                保存预设
              </button>
            </div>
            {showPresetInput && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <input
                  ref={presetInputRef}
                  type="text"
                  className="input-field"
                  style={{ maxWidth: 220, borderRadius: 'var(--radius-pill)' }}
                  placeholder="输入预设名称…"
                  maxLength={12}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') setShowPresetInput(false); }}
                />
                <button
                  className="save-preset-btn"
                  style={{ color: '#fff', background: 'var(--color-accent-a)', border: 'none' }}
                  onClick={savePreset}
                >保存</button>
                <button
                  className="save-preset-btn"
                  onClick={() => setShowPresetInput(false)}
                >取消</button>
              </div>
            )}
          </section>

          {/* 文件列表 */}
          {files.length > 0 && (
            <section className="filelist-section">
              <div className="filelist-header">
                <div className="filelist-header__left">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  已选择 <span className="filelist-header__count">{files.length}</span> 张图片
                </div>
                <button className="filelist-header__clear" onClick={clearFiles}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  清空
                </button>
              </div>
              <div className="filelist-grid">
                {files.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="file-card">
                    <div className="file-card__thumb">
                      {file.type?.startsWith('image/')
                        ? <img src={URL.createObjectURL(file)} alt="" onLoad={(e) => URL.revokeObjectURL(e.target.src)} />
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                    </div>
                    <div className="file-card__info">
                      <div className="file-card__name" title={file.name}>{file.name}</div>
                      <div className="file-card__size">{formatSize(file.size)}</div>
                    </div>
                    <button className="file-card__remove" onClick={() => removeFile(i)} aria-label={`移除 ${file.name}`}>✕</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 处理按钮 */}
          {files.length > 0 && (
            <section className="process-section">
              <button className="process-btn" onClick={handleProcess} disabled={processing}>
                {processing ? (
                  <>
                    <span className="process-btn__spinner" />
                    处理中...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l9 4.5v4L12 15l-9-4.5v-4L12 2z"/><path d="M12 15l9-4.5v4L12 22l-9-4.5v-4L12 15z"/></svg>
                    开始处理 {files.length} 张图片
                  </>
                )}
              </button>
            </section>
          )}

          {/* 设置面板 */}
          <section className="settings-panel">
            <div className="settings-panel__header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 600 }}>处理设置</h3>
            </div>

            <div className="settings-grid">
              {/* 格式选择 */}
              <div className="settings-group">
                <div className="settings-group__label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="4"/><path d="M4 20l5.5-8 3.5 5 2.5-3.5L20 20"/></svg>
                  输出格式
                </div>
                <div className="format-grid">
                  {FORMATS.map(f => (
                    <button
                      key={f.value}
                      className={`format-btn${options.format === f.value ? ' format-btn--active' : ''}`}
                      onClick={() => updateOption('format', f.value)}
                    >{f.label}</button>
                  ))}
                </div>
              </div>

              {/* 质量（JPEG / WebP 可调；PNG / SVG 不在此控制） */}
              {options.format !== 'ico' && options.format !== 'original' && options.format !== 'png' && options.format !== 'svg' && (
                <div className="settings-group">
                  <div className="settings-group__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                    压缩质量
                  </div>
                  <div className="quality-row">
                    <input type="range" className="slider" min="1" max="100" value={options.quality} onChange={(e) => updateOption('quality', parseInt(e.target.value))} />
                    <span className="quality-value">{options.quality}%</span>
                  </div>
                  <div className="quality-labels"><span>小文件</span><span>高质量</span></div>
                </div>
              )}

              {/* PNG 无损提示 */}
              {options.format === 'png' && (
                <div className="settings-group">
                  <div className="settings-group__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    无损格式
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: 0 }}>
                    PNG 为无损压缩，体积主要由分辨率决定。降低尺寸可获得更明显的大小收益。
                  </p>
                </div>
              )}

              {/* 尺寸（光栅格式） */}
              {options.format !== 'ico' && options.format !== 'svg' && (
                <div className="settings-group settings-group--full">
                  <div className="settings-group__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    目标尺寸（可选）
                  </div>
                  <div className="dimension-row">
                    <input type="number" className="input-field" placeholder="宽度" min="1" max="10000" value={options.width} onChange={(e) => updateOption('width', e.target.value)} />
                    <span className="dimension-sep">×</span>
                    <input type="number" className="input-field" placeholder="高度" min="1" max="10000" value={options.height} onChange={(e) => updateOption('height', e.target.value)} />
                    <span className="dimension-sep">px</span>
                  </div>
                  <select className="select-field" style={{ marginTop: 'var(--space-sm)' }} value={options.fit} onChange={(e) => updateOption('fit', e.target.value)}>
                    {FIT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              )}

              {/* SVG 设置（矢量重排 + 出血外框） */}
              {options.format === 'svg' && (
                <div className="settings-group settings-group--full">
                  <div className="settings-group__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/></svg>
                    SVG 输出设置（iconfont 兼容）
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: '4px 0 12px' }}>
                    统一正方形画布 + 透明出血外框；自动清洗 Figma 导出的 &lt;style&gt; 类样式与断链引用，处理后可直传 iconfont。
                  </p>
                  <div className="dimension-row">
                    <input type="number" className="input-field" placeholder="画布宽度" min="1" max="4096" value={options.svgWidth} onChange={(e) => updateOption('svgWidth', e.target.value)} />
                    <span className="dimension-sep">×</span>
                    <input type="number" className="input-field" placeholder="画布高度" min="1" max="4096" value={options.svgWidth} disabled readOnly />
                    <span className="dimension-sep">px 正方形</span>
                  </div>
                  <div className="dimension-row" style={{ marginTop: 'var(--space-sm)' }}>
                    <input type="number" className="input-field" placeholder="出血外框宽度" min="0" max="2000" value={options.svgBleed} onChange={(e) => updateOption('svgBleed', e.target.value)} />
                    <span className="dimension-sep">px</span>
                    <span className="dimension-sep">四周透明留白</span>
                  </div>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: '8px 0 0' }}>
                    出血：图标四周统一留白，避免贴边被裁切。留空默认取画布宽度的 10%。
                  </p>
                </div>
              )}

              {/* ICO 尺寸 */}
              {options.format === 'ico' && (
                <div className="settings-group settings-group--full">
                  <div className="settings-group__label">ICO 包含尺寸</div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: '4px 0 0' }}>
                    等比缩放适应、不裁切，非正方形图片多余区域为透明像素。
                  </p>
                  <div className="ico-sizes">
                    {ICO_SIZES_ALL.map(size => (
                      <button
                        key={size}
                        className={`ico-size-chip${options.icoSizes.includes(size) ? ' ico-size-chip--active' : ''}`}
                        onClick={() => {
                          const sizes = options.icoSizes.includes(size)
                            ? options.icoSizes.filter(s => s !== size)
                            : [...options.icoSizes, size].sort((a, b) => a - b);
                          updateOption('icoSizes', sizes);
                        }}
                      >{size}×{size}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 高级选项 */}
            <button
              className={`advanced-toggle${showAdvanced ? ' advanced-toggle--open' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <svg className="advanced-toggle__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              高级选项
            </button>

            {showAdvanced && (
              <div className="advanced-panel">
                <div className="advanced-row">
                  <span className="advanced-row__label">隐私保护</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    始终启用
                  </span>
                </div>
                <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: '2px 0 0' }}>
                  所有处理均在你的浏览器本地完成，图片不会上传到任何服务器；Canvas 渲染过程会自动剥离 EXIF 等元数据。
                </p>
              </div>
            )}
          </section>

          {/* 错误提示 */}
          {error && (
            <div className="error-alert">
              <svg className="error-alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <div className="error-alert__title">处理出错</div>
                <div className="error-alert__desc">{error}</div>
              </div>
            </div>
          )}

          {/* 结果 */}
          {results && (
            <section className="results-section">
              <div className="results-section__header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                处理结果
              </div>

              {/* 下载通知 */}
              {showDownloadNotif && downloadUrl && (
                <div className="download-notif">
                  <div className="download-notif__inner">
                    <svg className="download-notif__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>处理完成，ZIP 包已自动下载</span>
                    <button className="download-notif__retry" onClick={manualDownload}>重新下载</button>
                    <button className="download-notif__dismiss" onClick={() => setShowDownloadNotif(false)} aria-label="关闭">✕</button>
                  </div>
                </div>
              )}

              {/* 统计 */}
              {successResults.length > 0 && (
                <div className="stats-row">
                  <div className="stat-card">
                    <div className="stat-card__label">处理数量</div>
                    <div className="stat-card__value">{successResults.length}/{results.results.length}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">原始大小</div>
                    <div className="stat-card__value">{formatSize(totalOrig)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">压缩后 / 节省</div>
                    <div className="stat-card__value stat-card__value--success">{formatSize(totalOut)}</div>
                    <div className="stat-card__sub">-{calcRatio(totalOrig, totalOut)}%</div>
                  </div>
                </div>
              )}

              {/* 详细列表 */}
              <div className="result-list">
                {results.results.map((r, i) => (
                  <div key={i} className={`result-item${r.success ? '' : ' result-item--error'}`}>
                    <div className="result-item__info">
                      <div className="result-item__name" title={r.originalName}>{r.originalName}</div>
                      <div className="result-item__meta">
                        {r.success
                          ? <>{formatSize(r.originalSize)} → {formatSize(r.outputSize)}<span className="savings">-{calcRatio(r.originalSize, r.outputSize)}%</span>{r.outputWidth && <span style={{ marginLeft: 'var(--space-sm)' }}>{r.outputWidth}×{r.outputHeight}</span>}</>
                          : <span style={{ color: 'var(--color-error)' }}>{r.error}</span>
                        }
                      </div>
                    </div>
                    {r.success && (
                      <span className="result-item__badge">{r.format}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 技术栈说明 */}
          <div className="tech-footer">
            <div className="tech-footer__title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              技术栈
            </div>
            <div className="tech-footer__items">
              <span>纯 <strong>浏览器端</strong> 运行，无需上传服务器</span>
              <span>基于 <strong>Canvas API</strong> 完成缩放 / 裁切 / 编码，SVG 走<strong>矢量重排</strong></span>
              <span>自实现 <strong>ZIP 打包</strong>，零第三方依赖</span>
              <span>输出格式：<strong>{currentFormat?.label || 'JPEG'}</strong></span>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          小明图像处理 · Xiaoming Compress · 100% 浏览器本地处理，图片不出本机
        </div>
      </footer>
    </>
  );
}
