const EXPORT_WIDTH = 2481;
const EXPORT_HEIGHT = 3509;
const PDF_IMAGE_QUALITY = 0.98;

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function imageToDataUrl(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Unable to load image: ${src}`);
  return readBlobAsDataUrl(await response.blob());
}

function imageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function hasVisibleColor(value) {
  return value && value !== 'transparent' && !value.endsWith(', 0)') && value !== 'rgba(0, 0, 0, 0)';
}

function drawDottedBottomBorder(context, box, style) {
  if (style.borderBottomStyle !== 'dotted' || parseFloat(style.borderBottomWidth) <= 0) return;

  context.save();
  context.strokeStyle = style.borderBottomColor;
  context.lineWidth = Math.max(1, parseFloat(style.borderBottomWidth) * box.scaleY);
  context.setLineDash([context.lineWidth, context.lineWidth * 2]);
  context.beginPath();
  context.moveTo(box.x, box.y + box.height - context.lineWidth / 2);
  context.lineTo(box.x + box.width, box.y + box.height - context.lineWidth / 2);
  context.stroke();
  context.restore();
}

function canvasFont(style, scale) {
  const weight = style.fontWeight || '400';
  const size = Math.max(1, parseFloat(style.fontSize) * scale);
  const family = style.fontFamily || 'Arial, Helvetica, sans-serif';

  return `${weight} ${size}px ${family}`;
}

function drawOverlayField(context, field, previewRect, scaleX, scaleY) {
  const text = field.textContent ?? '';
  const fieldRect = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const box = {
    x: (fieldRect.left - previewRect.left) * scaleX,
    y: (fieldRect.top - previewRect.top) * scaleY,
    width: fieldRect.width * scaleX,
    height: fieldRect.height * scaleY,
    scaleY
  };

  if (hasVisibleColor(style.backgroundColor)) {
    context.fillStyle = style.backgroundColor;
    context.fillRect(box.x, box.y, box.width, box.height);
  }

  drawDottedBottomBorder(context, box, style);
  if (!text.trim()) return;

  const paddingLeft = parseFloat(style.paddingLeft) * scaleX;
  const paddingRight = parseFloat(style.paddingRight) * scaleX;
  const align = style.textAlign === 'center' || style.justifyContent === 'center'
    ? 'center'
    : style.textAlign === 'right' || style.justifyContent === 'flex-end'
      ? 'right'
      : 'left';
  const x = align === 'center'
    ? box.x + box.width / 2
    : align === 'right'
      ? box.x + box.width - paddingRight
      : box.x + paddingLeft;

  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.width, box.height);
  context.clip();
  context.fillStyle = style.color;
  context.font = canvasFont(style, scaleX);
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillText(text, x, box.y + box.height / 2);
  context.restore();
}

export async function renderOfficialFormToJpeg(preview) {
  const template = preview?.querySelector('.form-template');
  if (!template) throw new Error('Official template image was not found.');

  if (document.fonts?.ready) await document.fonts.ready;

  const previewRect = preview.getBoundingClientRect();
  const scaleX = EXPORT_WIDTH / previewRect.width;
  const scaleY = EXPORT_HEIGHT / previewRect.height;
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;

  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

  const templateDataUrl = await imageToDataUrl(template.currentSrc || template.src);
  const templateImage = await imageFromUrl(templateDataUrl);
  context.drawImage(templateImage, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

  preview.querySelectorAll('.overlay-field').forEach(field => {
    drawOverlayField(context, field, previewRect, scaleX, scaleY);
  });

  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', PDF_IMAGE_QUALITY);
  if (!jpegBlob) throw new Error('Unable to render PDF image.');

  return {
    bytes: await jpegBlob.arrayBuffer(),
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT
  };
}

