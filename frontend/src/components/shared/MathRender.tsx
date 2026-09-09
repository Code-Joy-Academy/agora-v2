import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content?: string | null;
  className?: string;
}

export function MathRenderer({ content, className = '' }: MathRendererProps) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    let text = String(content);

    // 1. Process Display Math: $$...$$
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, math) => {
      try {
        return katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        return math;
      }
    });

    // 2. Process Inline Math: $...$
    // Using a replacer function prevents '$' from being treated as a regex replacement pattern
    text = text.replace(/\$([^\$\n]+?)\$/g, (_match, math) => {
      try {
        return katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        return math;
      }
    });

    // 3. Fallback for common raw expressions like "x^2" or "a^2 + b^2 = c^2" when prompt omitted $ delimiters
    if (text.includes('^') && !text.includes('<span class="katex">')) {
      text = text.replace(/([a-zA-Z0-9]+)\^([a-zA-Z0-9]+)/g, '$1<sup>$2</sup>');
    }

    return text;
  }, [content]);

  return (
    <span
      className={`inline-block leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}