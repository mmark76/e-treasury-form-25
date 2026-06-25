import { getFieldValue } from '../../shared/form-state.js';
import { buildPdfFromJpeg } from './pdf-document.js';
import { renderOfficialFormToJpeg } from './render-form.js';

function safeFilePart(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\//g, '-')
    .replace(/[<>:"\\|?*\x00-\x1f]+/g, '')
    .replace(/\s+/g, '-');

  return cleaned || fallback;
}

export function filenameFromCurrentForm() {
  const invoiceNumber = safeFilePart(getFieldValue('invoiceNumber'), '00000');
  const issueDate = safeFilePart(getFieldValue('issueDate'), new Date().toISOString().slice(0, 10));

  return `GL25-${invoiceNumber}-${issueDate}.pdf`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createOfficialPdfBlob(preview) {
  const image = await renderOfficialFormToJpeg(preview);
  return buildPdfFromJpeg(image.bytes, image.width, image.height);
}

export async function downloadOfficialPdf({ filename = filenameFromCurrentForm() } = {}) {
  const preview = document.getElementById('invoice-preview');
  const pdf = await createOfficialPdfBlob(preview);
  downloadBlob(pdf, filename);
  return pdf;
}

