import axios from 'axios';
import { http, ApiError } from './http';

/**
 * Downloads a file from an authenticated endpoint (a plain <a href> can't send the Bearer header).
 * Error bodies arrive as Blobs, so they are parsed back into an ApiError message.
 */
export async function downloadFile(url: string, params: Record<string, string | undefined>, fallbackName: string) {
  try {
    const res = await http.get<Blob>(url, { params, responseType: 'blob', timeout: 120_000 });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const href = URL.createObjectURL(res.data);
    const a = Object.assign(document.createElement('a'), { href, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return name;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      let message = 'Download failed';
      try {
        message = (JSON.parse(await err.response.data.text()) as { message?: string }).message ?? message;
      } catch {
        /* not JSON */
      }
      throw new ApiError(err.response.status, message);
    }
    throw err;
  }
}
