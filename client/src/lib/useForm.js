import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage, fieldErrors } from './api';

/** Minimal form state helper with per-field errors and server error mapping. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  const setValue = useCallback((key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const bind = (key) => ({
    value: values[key] ?? '',
    onChange: (e) => setValue(key, e.target.value),
    error: errors[key],
  });

  /** Returns true when there are no errors; otherwise shows a toast. */
  const check = (errs) => {
    const clean = Object.fromEntries(Object.entries(errs).filter(([, v]) => v));
    setErrors(clean);
    const n = Object.keys(clean).length;
    if (n) toast.error(n === 1 ? Object.values(clean)[0] : `Please fix ${n} highlighted fields`);
    return n === 0;
  };

  const serverError = (err) => {
    const fields = fieldErrors(err);
    if (Object.keys(fields).length) setErrors((e) => ({ ...e, ...fields }));
    toast.error(errorMessage(err));
  };

  return { values, setValues, setValue, bind, errors, setErrors, check, serverError };
}

export const rules = {
  required: (v, label) => (v === undefined || v === null || String(v).trim() === '' ? `${label} is required` : null),
  phone: (v) => (v && !/^\+?[0-9\s\-()]{7,20}$/.test(v.trim()) ? 'Enter a valid phone number' : null),
  email: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? 'Enter a valid email address' : null),
  money: (v, label, { positive = false, required = true } = {}) => {
    if (v === '' || v === null || v === undefined) return required ? `${label} is required` : null;
    const n = Number(String(v).replace(/,/g, ''));
    if (Number.isNaN(n)) return `${label} must be a number`;
    if (positive && n <= 0) return `${label} must be greater than 0`;
    if (n < 0) return `${label} cannot be negative`;
    return null;
  },
};
