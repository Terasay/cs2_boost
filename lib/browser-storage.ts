export function readStorage(kind: "localStorage" | "sessionStorage", key: string) {
  try { return window[kind].getItem(key); } catch { return null; }
}

export function writeStorage(kind: "localStorage" | "sessionStorage", key: string, value: string | null) {
  try {
    if (value === null) window[kind].removeItem(key);
    else window[kind].setItem(key, value);
    return true;
  } catch { return false; }
}
