// Ticket-04 §3 local leaderboard: pure helpers shared by the server (tools/serve.js) and the browser fallback.
const VI = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
const NAME_RE = new RegExp(`^[A-Za-z0-9_${VI}${VI.toUpperCase()}]{3,12}$`, 'u'); // [A-Za-z0-9_] + Vietnamese letters (bonus)
export const MAX_ENTRIES = 10;

export const normalizeName = (name) => String(name ?? '').normalize('NFC').trim();
export const validName = (name) => NAME_RE.test(normalizeName(name));

/** ISO 8601 with the local UTC offset, e.g. 2026-11-20T15:04:05+07:00. */
export function isoLocal(d = new Date()) {
  const pad = (n) => String(Math.abs(n)).padStart(2, '0'), off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    + `${off >= 0 ? '+' : '-'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

/** Score descending; equal score -> whoever reached it first (earlier achieved_at) ranks higher. Keeps the top 10. */
export const rank = (entries) => [...entries]
  .sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at))
  .slice(0, MAX_ENTRIES);

/** Validate an untrusted submission and return the new ranked list (throws on bad input). */
export function addEntry(entries, { name, score, nights_won, seed }, now = new Date()) {
  if (!validName(name)) throw new Error('name must be 3-12 characters: letters, digits or _');
  if (!Number.isInteger(score) || score < 0) throw new Error('score must be an integer >= 0');
  if (!Number.isInteger(nights_won) || nights_won < 0 || nights_won > 3) throw new Error('nights_won must be 0..3');
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
  return rank([...entries, { name: normalizeName(name), score, nights_won, achieved_at: isoLocal(now), seed }]);
}
