/**
 * We Designerz — клиентская оптимизация изображений (T17-A).
 * Сборки нет — всё через canvas в браузере. EXIF-ориентация читается движком
 * через imageOrientation: 'from-image', иначе вертикальные фото с телефона
 * ложатся боком.
 */

const BG_COLOR = '#0a0a0f'; // фон сайта — заливка под jpeg-fallback без альфы

export async function optimizeImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  let ext = 'webp';

  if (!blob || blob.type !== 'image/webp') {
    // jpeg не умеет альфу — заливаем фон сайта под прозрачные пиксели PNG
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
    ext = 'jpg';
  }

  if (!blob || blob.size >= file.size) {
    return { blob: file, ext: extFromMime(file.type) };
  }

  return { blob, ext };
}

/**
 * Ширина/высота файла ПОСЛЕ нормализации EXIF-ориентации (та же опция
 * imageOrientation, что и в optimizeImage) — для валидации пропорций на
 * загрузке, до самого ресайза.
 */
export async function readImageDimensions(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = bitmap;
  bitmap.close?.();
  return { width, height };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function extFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
