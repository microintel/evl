// Tiny dependency-free PDF writer (text + lines + filled rects, built-in Helvetica). Works offline.
const f2 = n => (Math.round(n * 100) / 100).toString();
const clean = s => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');

export class Page {
  constructor(w, h) { this.w = w; this.h = h; this.ops = []; }
  // y is measured from the TOP of the page for easier layout.
  text(str, x, y, size = 10, { bold = false, gray = 0, align = 'left' } = {}) {
    if (align !== 'left') {
      const wd = textWidth(str, size);
      x = align === 'center' ? x - wd / 2 : x - wd;
    }
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${f2(size)} Tf ${f2(gray)} g ${f2(x)} ${f2(this.h - y)} Td (${clean(str)}) Tj ET`);
  }
  line(x1, y1, x2, y2, width = 0.5, gray = 0.55) {
    this.ops.push(`${f2(gray)} G ${f2(width)} w ${f2(x1)} ${f2(this.h - y1)} m ${f2(x2)} ${f2(this.h - y2)} l S`);
  }
  rect(x, y, w, h, gray) {
    this.ops.push(`${f2(gray)} g ${f2(x)} ${f2(this.h - y - h)} ${f2(w)} ${f2(h)} re f`);
  }
}

// Approximate Helvetica width (good enough for centering / right-align).
export const textWidth = (str, size) => String(str).length * size * 0.54;

export function buildPdf(pages) {
  const objs = [];
  const add = body => objs.push(body) && objs.length;
  const catalog = add('');           // 1
  const pagesObj = add('');          // 2
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2o = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const p of pages) {
    const stream = p.ops.join('\n');
    const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pg = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${f2(p.w)} ${f2(p.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2o} 0 R >> >> /Contents ${c} 0 R >>`);
    kids.push(`${pg} 0 R`);
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
