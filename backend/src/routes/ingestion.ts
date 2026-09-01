import { Router } from 'express';
import multer from 'multer';
import { ingestDocument, type ResourceType } from '../ingestion/ingestionService.js';
import { formatFromMimeOrName } from '../ingestion/parsers.js';
import { withCourseScope } from '../db/pool.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const ingestionRouter = Router();

ingestionRouter.post('/courses/:id/documents', upload.single('file'), async (req, res) => {
  const course_id = req.params.id;
  const { resource_type, node_id } = req.body as { resource_type: ResourceType; node_id?: string };
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

  try {
    const format = formatFromMimeOrName(req.file.mimetype, req.file.originalname);
    const result = await ingestDocument({
      course_id, title: req.file.originalname, buffer: req.file.buffer, format,
      resource_type: resource_type ?? 'notes', node_id: node_id || null,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

ingestionRouter.get('/courses/:id/documents', async (req, res) => {
  const rows = await withCourseScope(req.params.id, (client) =>
    client.query('SELECT id, title, resource_type, node_id, created_at FROM documents WHERE course_id = $1 ORDER BY created_at DESC', [req.params.id])
      .then((r) => r.rows)
  );
  res.json(rows);
});
