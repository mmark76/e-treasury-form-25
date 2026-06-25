const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

export function buildPdfFromJpeg(jpegBytes, width, height) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let byteOffset = 0;
  const content = `q\n${A4_WIDTH_PT} 0 0 ${A4_HEIGHT_PT} 0 0 cm\n/Im1 Do\nQ\n`;

  function addText(text) {
    const bytes = encoder.encode(text);
    parts.push(bytes);
    byteOffset += bytes.length;
  }

  function addBytes(bytes) {
    parts.push(bytes);
    byteOffset += bytes.byteLength;
  }

  function addObject(index, writeContent) {
    offsets[index] = byteOffset;
    addText(`${index} 0 obj\n`);
    writeContent();
    addText('\nendobj\n');
  }

  const imageBytes = new Uint8Array(jpegBytes);

  addText('%PDF-1.4\n');
  addObject(1, () => addText('<< /Type /Catalog /Pages 2 0 R >>'));
  addObject(2, () => addText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  addObject(3, () => addText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`));
  addObject(4, () => addText(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`));
  addObject(5, () => {
    addText(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`);
    addBytes(imageBytes);
    addText('\nendstream');
  });

  const xrefOffset = byteOffset;
  addText('xref\n0 6\n0000000000 65535 f \n');
  offsets.slice(1).forEach(offset => {
    addText(`${String(offset).padStart(10, '0')} 00000 n \n`);
  });
  addText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: 'application/pdf' });
}

