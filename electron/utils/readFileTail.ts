import { open } from 'fs/promises';

/** Read at most 2 MB from the end, avoiding allocation of an entire application log. */
export async function readFileTail(filePath: string, limit: number): Promise<string> {
  const file = await open(filePath, 'r');
  try {
    const { size } = await file.stat();
    const length = Math.min(size, 2 * 1024 * 1024);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, size - length);
    let content = buffer.subarray(0, bytesRead).toString('utf8');
    if (size > length) {
      const newline = content.indexOf('\n');
      content = newline === -1 ? '[Log line exceeds the 2 MB tail limit]' : content.slice(newline + 1);
    }
    return content.split(/\r?\n/).slice(-limit).join('\n');
  } finally { await file.close(); }
}
