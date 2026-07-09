/**
 * Resizes and compresses an image file in the browser before upload.
 * Preserves aspect ratio; the larger dimension is capped at maxDimension.
 *
 * @param file - The image file to resize (must be an image, not video)
 * @param maxDimension - Maximum width or height in pixels (aspect ratio preserved)
 * @param quality - JPEG quality between 0 and 1 (default: 0.8)
 * @returns A Promise resolving to the resized image as a Blob
 *
 * @note This function only handles images. Callers must ensure a video file is not passed.
 */
export async function resizeImageFile(
  file: File,
  maxDimension: number,
  quality: number = 0.8
): Promise<Blob> {
  // Decode image using createImageBitmap (efficient, works in Web Workers)
  const imageBitmap = await createImageBitmap(file);

  // Calculate new dimensions preserving aspect ratio
  const { width: origWidth, height: origHeight } = imageBitmap;
  let newWidth = origWidth;
  let newHeight = origHeight;

  if (origWidth > maxDimension || origHeight > maxDimension) {
    const scale = Math.min(maxDimension / origWidth, maxDimension / origHeight);
    newWidth = Math.round(origWidth * scale);
    newHeight = Math.round(origHeight * scale);
  }

  const mimeType = file.type || 'image/jpeg';

  // Use OffscreenCanvas if available, else fallback to regular canvas.
  // Branch by concrete type up front so getContext('2d') resolves to a
  // single, well-typed overload instead of the ambiguous union.
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
    imageBitmap.close();
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }
  ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
  imageBitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to Blob'));
        }
      },
      mimeType,
      quality
    );
  });
}
