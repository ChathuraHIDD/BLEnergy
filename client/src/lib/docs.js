import { toast } from 'sonner';
import { api, errorMessage } from './api';

function filenameFrom(res, fallback) {
  const cd = res.headers['content-disposition'] || '';
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1]);
  const plain = cd.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : fallback;
}

async function fetchBlob(url, params) {
  const res = await api.get(url, { responseType: 'blob', params });
  return { blob: res.data, name: filenameFrom(res, 'document.pdf') };
}

/**
 * Download, print or preview a server generated document (all share the branded template).
 * mode: 'download' | 'print' | 'view'
 */
export async function openDocument(url, mode = 'view', params = {}) {
  const id = toast.loading(mode === 'print' ? 'Preparing document for printing…' : 'Generating document…');
  try {
    const { blob, name } = await fetchBlob(url, mode === 'download' ? { ...params, download: 1 } : params);
    const objectUrl = URL.createObjectURL(blob);
    if (mode === 'download') {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Downloaded ${name}`, { id });
    } else if (mode === 'print') {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      frame.src = objectUrl;
      frame.onload = () => {
        setTimeout(() => {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch {
            window.open(objectUrl, '_blank');
          }
        }, 300);
      };
      document.body.appendChild(frame);
      setTimeout(() => frame.remove(), 120000);
      toast.success('Print dialog opened', { id });
    } else {
      window.open(objectUrl, '_blank');
      toast.dismiss(id);
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  } catch (err) {
    toast.error(errorMessage(err, 'Could not generate the document'), { id });
  }
}

/** Download an uploaded file (quotation, bill) by id. */
export async function openFile(fileId, download = false) {
  const id = toast.loading('Opening file…');
  try {
    const { blob, name } = await fetchBlob(`/files/${fileId}`, download ? { download: 1 } : {});
    const objectUrl = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.click();
    } else {
      window.open(objectUrl, '_blank');
    }
    toast.dismiss(id);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  } catch (err) {
    toast.error(errorMessage(err, 'Could not open the file'), { id });
  }
}
