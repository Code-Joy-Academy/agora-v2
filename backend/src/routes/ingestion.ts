import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { ingestDocument, type ResourceType } from '../ingestion/ingestionService.js';
import { formatFromMimeOrName } from '../ingestion/parsers.js';
import { withCourseScope } from '../db/pool.js';

// Configure storage with generous limits for PDFs and DOCX files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
    fieldSize: 25 * 1024 * 1024, // 25 MB
    files: 1,
  },
});

export const ingestionRouter = Router();

// Wrap single file upload with explicit error handler for Multer
const uploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum supported size is 25 MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    next();
  });
};

ingestionRouter.post('/courses/:id/documents', uploadMiddleware, async (req: Request, res: Response) => {
  const course_id = req.params.id;
  const { resource_type, node_id } = req.body as { resource_type?: ResourceType; node_id?: string };

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file field missing' });
  }

  try {
    const format = formatFromMimeOrName(req.file.mimetype, req.file.originalname);
    const result = await ingestDocument({
      course_id,
      title: req.file.originalname,
      buffer: req.file.buffer,
      format,
      resource_type: resource_type ?? 'notes',
      node_id: node_id || null,
    });
    res.json(result);
  } catch (e) {
    console.error('Ingestion failed:', e);
    res.status(400).json({ error: (e as Error).message });
  }
});

ingestionRouter.get('/courses/:id/documents', async (req: Request, res: Response) => {
  try {
    const rows = await withCourseScope(req.params.id, (client) =>
      client
        .query(
          'SELECT id, title, resource_type, node_id, created_at FROM documents WHERE course_id = $1 ORDER BY created_at DESC',
          [req.params.id]
        )
        .then((r) => r.rows)
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});