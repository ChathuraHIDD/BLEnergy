export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

export function errorHandler(err, req, res, _next) {
  if (err.name === 'ZodError') {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.');
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(422).json({ message: 'Please fix the highlighted fields', fields });
  }
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 4 MB)' : err.message;
    return res.status(400).json({ message });
  }
  // Postgres constraint errors
  if (err.code === '23505') return res.status(409).json({ message: 'A record with the same value already exists' });
  if (err.code === '23503') return res.status(409).json({ message: 'This record is linked to other data and cannot be changed that way' });
  if (err.code === '23514') return res.status(422).json({ message: 'One of the values is out of the allowed range' });
  if (err.code === '22P02' || err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ message: 'Invalid value supplied' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong on the server' : err.message,
    ...(err.details ? { fields: err.details } : {}),
  });
}
