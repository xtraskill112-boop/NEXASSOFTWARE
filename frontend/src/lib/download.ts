/**
 * Saves a generated file (Excel export, CSV report, template).
 * - Browsers / desktop: a normal download.
 * - Android app (Capacitor): the in-app WebView cannot download blob files, so the file is
 *   written to the app cache and the Android share sheet opens (Save to Files, Drive, WhatsApp...).
 */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, Record<string, (opts: unknown) => Promise<Record<string, unknown>>>>;
}

const capacitor = () => (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;

export const isNativeApp = () => !!capacitor()?.isNativePlatform?.();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveFile(blob: Blob, fileName: string) {
  const cap = capacitor();
  const fs = cap?.Plugins?.Filesystem;
  const share = cap?.Plugins?.Share;
  if (cap?.isNativePlatform?.() && fs && share) {
    const data = await blobToBase64(blob);
    const written = await fs.writeFile({ path: fileName, data, directory: 'CACHE' });
    await share.share({ title: fileName, dialogTitle: `Save ${fileName}`, files: [written.uri as string] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
