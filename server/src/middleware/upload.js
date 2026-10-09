import multer from 'multer';
import { HttpError } from '../utils/errors.js';

const DOCS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

const make = (allowed, label) =>
  multer({
    storage: multer.memoryStorage(),
    // Vercel rejects request bodies over 4.5 MB, so keep uploads (all files together) below that.
    limits: { fileSize: 4 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => {
      if (allowed.has(file.mimetype)) return cb(null, true);
      cb(new HttpError(400, `${file.originalname}: only ${label} files are allowed`));
    },
  });

/** Quotations: PDF or Word. */
export const uploadDocument = make(DOCS, 'PDF or Word');
/** Bills / receipts: PDF, Word or images. */
export const uploadBill = make(new Set([...DOCS, ...IMAGES]), 'PDF, Word or image');

export async function saveFile(client, file) {
  const { rows } = await client.query(
    `INSERT INTO files (original_name, mime_type, size_bytes, data) VALUES ($1, $2, $3, $4) RETURNING id`,
    [file.originalname, file.mimetype, file.size, file.buffer],
  );
  return rows[0].id;
}
