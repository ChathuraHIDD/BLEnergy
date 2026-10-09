import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Filter state kept in the URL so it survives refreshes and can be linked to. */
export function useUrlFilters(keys) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f = Object.fromEntries(keys.map((k) => [k, params.get(k) || '']));
    f.page = Number(params.get('page')) || 1;
    return f;
  }, [params, keys.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFilters = (next) => {
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v && !(k === 'page' && Number(v) === 1)) p.set(k, v);
    });
    setParams(p, { replace: true });
  };
  return [filters, setFilters];
}

/** Query params for the API (drops empty values). */
export const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v != null));
