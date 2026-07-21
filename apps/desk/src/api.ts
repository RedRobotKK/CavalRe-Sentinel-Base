const BASE = "/api";

export async function getMeta() {
  const r = await fetch(`${BASE}/meta`);
  if (!r.ok) throw new Error(`meta_${r.status}`);
  return r.json();
}

export async function getLatest(limit = 300) {
  const r = await fetch(`${BASE}/journals/latest?limit=${limit}`);
  if (!r.ok) throw new Error(`latest_${r.status}`);
  return r.json();
}

export async function getJournalFiles() {
  const r = await fetch(`${BASE}/journals`);
  if (!r.ok) throw new Error(`journals_${r.status}`);
  return r.json();
}
