function collectStyleText() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');
}

function isStandaloneWebApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareOrDownloadBlob(blob, filename) {
  if (isStandaloneWebApp() && typeof navigator.share === 'function' && typeof File === 'function') {
    const file = new File([blob], filename, { type: blob.type });
    const shareData = { files: [file], title: filename };
    const canShareFile = typeof navigator.canShare !== 'function' || navigator.canShare(shareData);

    if (canShareFile) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
        throw error;
      }
    }

    throw new Error('当前网页 App 不支持分享图片文件');
  }

  downloadBlob(blob, filename);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('导出图片加载失败'));
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('导出图片生成失败'));
    }, 'image/png');
  });
}

function measureAndSerializeExport(wrapper, width, fallbackHeight) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `
    position: fixed;
    left: -100000px;
    top: 0;
    width: ${width}px;
    height: 1px;
    border: 0;
    visibility: hidden;
    pointer-events: none;
  `;
  document.body.appendChild(frame);

  try {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      return {
        height: fallbackHeight,
        serialized: new XMLSerializer().serializeToString(wrapper),
      };
    }

    frameDocument.documentElement.style.width = `${width}px`;
    frameDocument.documentElement.style.overflow = 'hidden';
    frameDocument.body.style.width = `${width}px`;
    frameDocument.body.style.margin = '0';
    frameDocument.body.style.overflow = 'hidden';
    frameDocument.body.appendChild(wrapper);

    return {
      height: Math.ceil(wrapper.scrollHeight) || fallbackHeight,
      serialized: new XMLSerializer().serializeToString(wrapper),
    };
  } finally {
    frame.remove();
  }
}

export async function exportElementAsPng(element, filename, options = {}) {
  if (!element) throw new Error('没有可导出的内容');

  const clone = element.cloneNode(true);
  options.onClone?.(clone);

  const width = Math.ceil(options.width ?? element.scrollWidth);
  const styleText = `
    ${collectStyleText()}
    * { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; }
    .export-capture {
      width: ${width}px;
      padding: 0;
      background: #ffffff;
    }
    ${options.extraCss ?? ''}
  `;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.className = `export-capture ${options.className ?? ''}`;
  wrapper.appendChild(clone);

  const style = document.createElement('style');
  style.textContent = styleText;
  wrapper.insertBefore(style, wrapper.firstChild);

  const measuredExport = measureAndSerializeExport(wrapper, width, Math.ceil(element.scrollHeight));
  const height = Math.ceil(options.height ?? measuredExport.height);
  const preferredPixelRatio = Math.max(2, window.devicePixelRatio || 1);
  const pixelRatio = Math.min(
    preferredPixelRatio,
    Math.sqrt(16_000_000 / Math.max(1, width * height)),
    8192 / Math.max(1, width),
    8192 / Math.max(1, height),
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        ${measuredExport.serialized}
      </foreignObject>
    </svg>
  `;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(svgUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建导出画布');

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const pngBlob = await canvasToBlob(canvas);
  await shareOrDownloadBlob(pngBlob, filename);
}
