const revokeAfterMs = 60_000;

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}

export function bookFilename(title: string, authors: string[], format: string): string {
  const stem = authors.length > 0 ? `${title} - ${authors.join(' & ')}` : title;
  return `${stem}.${format.toLowerCase()}`.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_');
}
