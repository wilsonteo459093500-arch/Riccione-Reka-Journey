import { KINDS, STORAGE_KEYS } from '../constants.js';

const defaultRates = () => Object.fromEntries(KINDS.map((k) => [k.id, k.rate]));

export function loadRates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.rates);
    return raw ? { ...defaultRates(), ...JSON.parse(raw) } : defaultRates();
  } catch {
    return defaultRates();
  }
}

export function saveRates(rates) {
  try {
    localStorage.setItem(STORAGE_KEYS.rates, JSON.stringify(rates));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

const defaultPrefs = { unit: 'mm', ortho: true, polyline: false, showQuote: false };

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.prefs);
    return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : { ...defaultPrefs };
  } catch {
    return { ...defaultPrefs };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadCurrentId() {
  try {
    return localStorage.getItem(STORAGE_KEYS.current);
  } catch {
    return null;
  }
}

export function saveCurrentId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEYS.current, id);
    else localStorage.removeItem(STORAGE_KEYS.current);
  } catch {
    /* ignore */
  }
}
