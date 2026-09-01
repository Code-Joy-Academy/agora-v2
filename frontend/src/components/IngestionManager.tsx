import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { DocumentRow } from '../types';

const RESOURCE_TYPES = [
  { value: 'notes', label: 'Lecture notes' },
  { value: 'rubric', label: 'Rubric' },
  { value: 'assignment_guidelines', label: 'Assignment guidelines' },
];

export default function IngestionManager({ courseId }: { courseId: string }) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [resourceType, setResourceType] = useState('notes');
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => api.documents(courseId).then(setDocs);
  useEffect(() => { refresh(); }, [courseId]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setStatus('Uploading…');
    const result = await api.uploadDocument(courseId, file, resourceType);
    setStatus(`Ingested ${result.chunk_count} chunks${result.embedded ? ' (embedded)' : ' (lexical)'}`);
    if (fileRef.current) fileRef.current.value = '';
    refresh();
  };

  return (
    <div className="border border-slatemid rounded-lg p-4 bg-slatemid/20">
      <p className="font-mono text-xs text-exploring uppercase tracking-widest mb-3">Ingestion Manager</p>

      <div className="flex gap-2 mb-3">
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}
          className="bg-realm border border-slatemid rounded px-2 py-2 text-xs text-cream outline-none focus:border-familiar">
          {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt"
          className="flex-1 text-xs text-cream/70 file:bg-familiar file:text-realm file:border-0 file:rounded file:px-3 file:py-1.5 file:text-xs file:font-semibold file:mr-2" />
        <button onClick={upload} className="px-3 py-2 bg-exploring text-realm rounded text-xs font-semibold hover:brightness-110">Upload</button>
      </div>
      {status && <p className="text-xs font-mono text-cream/40 mb-3">{status}</p>}

      <div className="space-y-1">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-xs border-b border-slatemid/50 py-1.5">
            <span className="text-cream font-serif">{d.title}</span>
            <span className="text-cream/40 font-mono">{d.resource_type}</span>
          </div>
        ))}
        {docs.length === 0 && <p className="text-xs font-mono text-cream/30">No documents uploaded yet</p>}
      </div>
    </div>
  );
}
