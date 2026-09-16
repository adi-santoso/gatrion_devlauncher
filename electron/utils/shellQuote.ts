/** Quote a single shell argument; Windows cmd expansion is rejected explicitly. */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(value)) return value;
  if (process.platform === 'win32') {
    if (/["%!\r\n]/.test(value)) throw new Error('This argument contains characters unsupported by the Windows command shell');
    return `"${value}"`;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
