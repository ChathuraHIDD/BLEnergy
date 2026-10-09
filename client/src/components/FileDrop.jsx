import { useRef, useState } from 'react';
import clsx from 'clsx';
import { FileText, ImageIcon, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { fileSize } from '../lib/format';

const MAX = 15 * 1024 * 1024;

export default function FileDrop({ files, onChange, accept, multiple = false, error, hint, types }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);

  const add = (list) => {
    const ok = [];
    for (const f of list) {
      if (types && !types.includes(f.type)) {
        toast.error(`${f.name}: unsupported file type`);
        continue;
      }
      if (f.size > MAX) {
        toast.error(`${f.name} is larger than 15 MB`);
        continue;
      }
      ok.push(f);
    }
    if (!ok.length) return;
    onChange(multiple ? [...files, ...ok].slice(0, 10) : [ok[0]]);
  };

  return (
    <div>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add([...e.dataTransfer.files]);
        }}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition',
          drag ? 'border-brand bg-brand/10' : error ? 'border-bad/60 bg-bad/5' : 'border-line-strong bg-surface-2/50 hover:border-brand/50',
        )}
      >
        <UploadCloud className={clsx('h-7 w-7', drag ? 'text-brand' : 'text-dim')} />
        <p className="text-sm font-semibold">
          Drop {multiple ? 'files' : 'a file'} here or <span className="text-brand">browse</span>
        </p>
        {hint && <p className="text-xs text-dim">{hint}</p>}
        <input
          ref={input}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
              {f.type?.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-gold" /> : <FileText className="h-4 w-4 text-brand" />}
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-dim">{fileSize(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-dim hover:text-bad">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
