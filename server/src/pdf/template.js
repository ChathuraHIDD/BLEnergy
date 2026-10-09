import PDFDocument from 'pdfkit';
import LOGO from './logo.js';
import { query } from '../db/index.js';


export const C = {
  black: '#0B0B0B',
  ink: '#1F1F1F',
  muted: '#6B6B6B',
  line: '#E6DED0',
  orange: '#E8731A',
  gold: '#D4A017',
  zebra: '#FBF7EF',
  headFill: '#161616',
  green: '#1E8E4E',
  red: '#C0392B',
};

const PAGE = { width: 595.28, height: 841.89 };
const M = { left: 40, right: 40, top: 128, bottom: 72 };
const HEADER_H = 96;
const CONTENT_W = PAGE.width - M.left - M.right;

export const lkr = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (d) => {
  if (!d) return '-';
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
};

export const label = (s) =>
  String(s || '-')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export async function getCompany() {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'company'`);
  return rows[0]?.value || { name: 'BatteryLab Energy (Pvt) Ltd', address: 'Kotte, Sri Lanka' };
}

/**
 * Branded A4 document. All PDFs in the system are produced through this class
 * so downloads and prints share one header/footer template.
 */
export class BrandedPdf {
  constructor(res, { title, filename, company, download = false }) {
    this.company = company;
    this.title = title;
    this.doc = new PDFDocument({ size: 'A4', margins: M, bufferPages: true, info: { Title: title, Author: company.name } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/[^\w.\-]/g, '_')}"`,
    );
    this.doc.pipe(res);
    this.doc.on('pageAdded', () => this.#header());
    this.#header();
  }

  get y() {
    return this.doc.y;
  }

  #header() {
    const { doc, company } = this;
    doc.save();
    doc.rect(0, 0, PAGE.width, HEADER_H).fill('#000000');
    try {
      doc.image(LOGO, 26, 12, { height: HEADER_H - 24 });
    } catch {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#FFFFFF').text('BatteryLab', 40, 34);
    }
    const lines = [company.address, company.phone && `Tel: ${company.phone}`, company.email, company.website].filter(Boolean);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.gold)
      .text(company.name, 300, 22, { width: PAGE.width - 340, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#D9D9D9');
    lines.forEach((l) => doc.text(l, { width: PAGE.width - 340, align: 'right' }));
    if (company.registration) doc.fillColor('#9A9A9A').text(`Reg. No: ${company.registration}`, { width: PAGE.width - 340, align: 'right' });

    const grad = doc.linearGradient(0, 0, PAGE.width, 0);
    grad.stop(0, C.orange).stop(1, C.gold);
    doc.rect(0, HEADER_H, PAGE.width, 4).fill(grad);
    doc.restore();
    doc.x = M.left;
    doc.y = M.top;
  }

  #footers() {
    const { doc, company } = this;
    const range = doc.bufferedPageRange();
    const generated = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' });
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = PAGE.height - 48;
      doc.save();
      doc.moveTo(M.left, y).lineTo(PAGE.width - M.right, y).lineWidth(0.8).strokeColor(C.gold).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink)
        .text(company.name, M.left, y + 8, { width: CONTENT_W / 2, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
        .text([company.address, company.phone, company.email].filter(Boolean).join('  |  '), M.left, y + 19, { width: CONTENT_W * 0.65, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, M.left, y + 8, { width: CONTENT_W, align: 'right', lineBreak: false });
      doc.text(`Generated ${generated}`, M.left, y + 19, { width: CONTENT_W, align: 'right', lineBreak: false });
      doc.restore();
      doc.page.margins.bottom = bottom;
    }
  }

  ensureSpace(h) {
    if (this.doc.y + h > PAGE.height - M.bottom) this.doc.addPage();
  }

  /** Big document title with reference/date block on the right. */
  titleBlock(heading, meta = []) {
    const { doc } = this;
    const top = doc.y;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.ink).text(heading.toUpperCase(), M.left, top, { width: CONTENT_W * 0.55, characterSpacing: 1 });
    const afterTitle = doc.y;
    doc.rect(M.left, afterTitle + 3, 46, 3).fill(C.orange);

    let my = top;
    meta.forEach(([k, v]) => {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(k, M.left + CONTENT_W * 0.55, my, { width: CONTENT_W * 0.2, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(String(v ?? '-'), M.left + CONTENT_W * 0.77, my, { width: CONTENT_W * 0.23, align: 'right' });
      my += 14;
    });
    doc.x = M.left;
    doc.y = Math.max(afterTitle + 18, my + 8);
  }

  section(title) {
    const { doc } = this;
    this.ensureSpace(100); // keep the heading with at least a couple of lines of its content
    doc.moveDown(0.6);
    const y = doc.y;
    doc.rect(M.left, y, 3, 13).fill(C.orange);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(title.toUpperCase(), M.left + 10, y + 1, { characterSpacing: 0.6 });
    doc.moveTo(M.left, doc.y + 3).lineTo(PAGE.width - M.right, doc.y + 3).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.x = M.left;
    doc.y += 9;
  }

  /** Label/value grid. pairs: [[label, value], ...] */
  keyValues(pairs, columns = 2) {
    const { doc } = this;
    const colW = CONTENT_W / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      const row = pairs.slice(i, i + columns);
      doc.font('Helvetica').fontSize(7.5);
      const labelH = Math.max(...row.map(([k]) => doc.heightOfString(String(k).toUpperCase(), { width: colW - 12, characterSpacing: 0.4 })));
      doc.font('Helvetica-Bold').fontSize(9.5);
      const h = labelH + Math.max(...row.map(([, v]) => doc.heightOfString(String(v ?? '-'), { width: colW - 12 }))) + 8;
      this.ensureSpace(h);
      const y = doc.y;
      row.forEach(([k, v], j) => {
        const x = M.left + j * colW;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(String(k).toUpperCase(), x, y, { width: colW - 12, characterSpacing: 0.4 });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(String(v ?? '-') || '-', x, y + labelH + 1, { width: colW - 12 });
      });
      doc.x = M.left;
      doc.y = y + h;
    }
  }

  paragraph(text, opts = {}) {
    const { doc } = this;
    doc.font('Helvetica').fontSize(opts.size || 9.5).fillColor(opts.color || C.ink)
      .text(text || '-', M.left, doc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    doc.moveDown(0.4);
  }

  /**
   * columns: [{ label, width (fraction), align, render(row) }]
   */
  table(columns, rows, { emptyText = 'No records', fontSize = 8.5 } = {}) {
    const { doc } = this;
    const widths = columns.map((c) => c.width * CONTENT_W);
    const pad = 5;

    const drawHead = () => {
      const y = doc.y;
      doc.rect(M.left, y, CONTENT_W, 20).fill(C.headFill);
      let x = M.left;
      columns.forEach((c, i) => {
        doc.font('Helvetica-Bold').fontSize(7.8).fillColor(C.gold)
          .text(c.label.toUpperCase(), x + pad, y + 6.5, { width: widths[i] - pad * 2, align: c.align || 'left', lineBreak: false });
        x += widths[i];
      });
      doc.y = y + 20;
    };

    this.ensureSpace(44);
    drawHead();
    if (!rows.length) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted).text(emptyText, M.left, doc.y + 8, { width: CONTENT_W, align: 'center' });
      doc.y += 8;
      doc.x = M.left;
      return;
    }
    rows.forEach((row, r) => {
      const cells = columns.map((c) => String(c.render(row) ?? '-'));
      doc.font('Helvetica').fontSize(fontSize);
      const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - pad * 2 }))) + pad * 2;
      if (doc.y + h > PAGE.height - M.bottom) {
        doc.addPage();
        drawHead();
      }
      const y = doc.y;
      if (r % 2 === 1) doc.rect(M.left, y, CONTENT_W, h).fill(C.zebra);
      let x = M.left;
      cells.forEach((t, i) => {
        const col = columns[i];
        doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(col.color?.(row) || C.ink)
          .text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: col.align || 'left' });
        x += widths[i];
      });
      doc.moveTo(M.left, y + h).lineTo(PAGE.width - M.right, y + h).lineWidth(0.4).strokeColor(C.line).stroke();
      doc.y = y + h;
    });
    doc.x = M.left;
    doc.moveDown(0.3);
  }

  /** Right-aligned totals box. pairs: [[label, value, {strong}]] */
  totals(pairs) {
    const { doc } = this;
    const w = CONTENT_W * 0.45;
    const x = M.left + CONTENT_W - w;
    this.ensureSpace(pairs.length * 20 + 10);
    doc.moveDown(0.4);
    pairs.forEach(([k, v, opt = {}]) => {
      const y = doc.y;
      if (opt.strong) {
        doc.rect(x, y - 2, w, 22).fill(C.black);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.gold).text(k, x + 8, y + 4, { width: w / 2 });
        doc.text(v, x + w / 2, y + 4, { width: w / 2 - 8, align: 'right' });
        doc.y = y + 24;
      } else {
        doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(k, x + 8, y, { width: w / 2 });
        doc.font('Helvetica-Bold').fillColor(opt.color || C.ink).text(v, x + w / 2, y, { width: w / 2 - 8, align: 'right' });
        doc.y = y + 16;
      }
    });
    doc.x = M.left;
  }

  /** Highlighted amount panel used on receipts/vouchers. */
  amountBanner(caption, amount) {
    const { doc } = this;
    this.ensureSpace(60);
    doc.moveDown(0.5);
    const y = doc.y;
    const grad = doc.linearGradient(M.left, 0, M.left + CONTENT_W, 0);
    grad.stop(0, C.orange).stop(1, C.gold);
    doc.roundedRect(M.left, y, CONTENT_W, 48, 6).fill(grad);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text(caption.toUpperCase(), M.left + 16, y + 10, { characterSpacing: 0.8 });
    doc.fontSize(18).text(amount, M.left + 16, y + 22);
    doc.y = y + 60;
    doc.x = M.left;
  }

  signatures(labels = ['Prepared by', 'Authorised signature']) {
    const { doc } = this;
    this.ensureSpace(70);
    doc.moveDown(2.5);
    const y = doc.y;
    const w = (CONTENT_W - 40 * (labels.length - 1)) / labels.length;
    labels.forEach((l, i) => {
      const x = M.left + i * (w + 40);
      doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.6).strokeColor(C.muted).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(l, x, y + 5, { width: w, align: 'center' });
    });
    doc.y = y + 20;
    doc.x = M.left;
  }

  note(text) {
    const { doc } = this;
    this.ensureSpace(30);
    doc.moveDown(0.6);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text(text, M.left, doc.y, { width: CONTENT_W, align: 'center' });
  }

  end() {
    this.#footers();
    this.doc.end();
  }
}

export async function startPdf(req, res, opts) {
  const company = await getCompany();
  return new BrandedPdf(res, { ...opts, company, download: req.query.download === '1' });
}
