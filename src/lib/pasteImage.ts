import { invoke } from '@tauri-apps/api/core';
import { useTerminalStore } from '../store/terminalStore';
import { toast } from '../store/toastStore';
import { reportInvokeFailure } from './errorReporter';
import { toBracketedPaste } from './bracketedPaste';

/**
 * The image to paste, if this paste is an image. A clipboard holding real text
 * as well (cells copied from a spreadsheet also carry a picture of themselves)
 * stays a text paste: that is what the user meant.
 */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  if (data.getData('text/plain').trim() !== '') return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}

/** A path as agent CLIs expect it: quoted only when a space would split it. */
export function pathForPaste(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

interface SavedPaste {
  absolute_path: string;
}

export async function saveAndPasteImage(terminalId: string, image: File): Promise<void> {
  try {
    const dataBase64 = await toBase64(image);
    const saved = await invoke<SavedPaste>('write_image_paste', {
      terminalId,
      dataBase64,
      mime: image.type,
    });
    await useTerminalStore.getState().writeToTerminal(terminalId, toBracketedPaste(pathForPaste(saved.absolute_path)));
  } catch (err) {
    toast.error('Could not paste the image', String(err));
    reportInvokeFailure('write_image_paste', err);
  }
}
