/**
 * Image attachment helpers for the agent chat.
 *
 * Files are downscaled client-side (max 1568px on the long edge) before being
 * sent to omp: the RPC prompt frame stays small and vision tokens scale with
 * resolution, so a screenshot/diagram needs far fewer tokens than the raw file.
 */

export const MAX_ATTACHMENTS = 8;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DIM = 1568;

/**
 * Read an image File and produce an attachment: { name, mimeType, dataUrl,
 * base64, bytes }. PNG is re-encoded as PNG (keeps transparency); everything
 * else is re-encoded as JPEG q0.85. When canvas is unavailable (jsdom/test
 * environments), the original bytes are passed through unchanged.
 *
 * @param {File} file
 * @returns {Promise<{name: string, mimeType: string, dataUrl: string, base64: string, bytes: number}>}
 */
export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = () => {
      const originalDataUrl = /** @type {string} */ (reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error(`Could not decode image "${file.name}"`));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
        canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // No canvas support (e.g. tests) — keep the original bytes.
          const raw = originalDataUrl.split(',')[1] || '';
          resolve({ name: file.name, mimeType: file.type, dataUrl: originalDataUrl, base64: raw, bytes: Math.round(raw.length * 0.75) });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const isPng = file.type === 'image/png';
        const dataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({
          name: file.name,
          mimeType: isPng ? 'image/png' : 'image/jpeg',
          dataUrl,
          base64,
          bytes: Math.round(base64.length * 0.75),
        });
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
