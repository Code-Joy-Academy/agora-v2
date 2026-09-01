import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export type SourceFormat = 'md' | 'txt' | 'pdf' | 'docx';

export async function parseToText(buffer: Buffer, format: SourceFormat): Promise<string> {
  switch (format) {
    case 'pdf':
      return (await pdfParse(buffer)).text;
    case 'docx':
      return (await mammoth.extractRawText({ buffer })).value;
    case 'md':
    case 'txt':
      return buffer.toString('utf-8');
  }
}

export function formatFromMimeOrName(mimetype: string, filename: string): SourceFormat {
  if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) return 'pdf';
  if (filename.endsWith('.docx') || mimetype.includes('officedocument.wordprocessingml')) return 'docx';
  if (filename.endsWith('.md')) return 'md';
  return 'txt';
}
