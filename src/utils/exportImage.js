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

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export function exportElementAsPng(element, filename, options = {}) {
  if (!element) return;

  const pixelRatio = Math.max(2, window.devicePixelRatio || 1);
  const clone = element.cloneNode(true);
  options.onClone?.(clone);

  const width = Math.ceil(options.width ?? element.scrollWidth);
  const height = Math.ceil(options.height ?? element.scrollHeight);
  const styleText = `
    ${collectStyleText()}
    * { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; }
    .export-capture {
      width: ${width}px;
      min-height: ${height}px;
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

  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        ${serialized}
      </foreignObject>
    </svg>
  `;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;

    const context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    downloadDataUrl(canvas.toDataURL('image/png'), filename);
  };

  image.src = svgUrl;
}
