// HABLA scan — escaneo de sitio, rubric 2.0
//
// /api/analyze mira UNA página. Esto mira el sitio: coge las primeras URLs del
// sitemap, las pasa por el mismo motor en paralelo y agrega el resultado.
//
// El dato que justifica el escaneo no es la media — es el FALLO REPETIDO. Saber que
// "tu primer bloque no dice para quién es" aparece en 9 de 10 páginas convierte una
// lista de tareas en una sola decisión editorial. Eso no se puede ver desde la home.
//
// Requiere email. No es un paywall: es el precio de un informe que cuesta 10x más
// cómputo que el análisis suelto, y es la única forma de saber quién nos usa.

import { analyze } from './analyze.js';

// Nota: analyze() devuelve sus 5 recomendaciones de mayor impacto. Es suficiente
// para detectar patrones: si un fallo asoma en el top 5 de ocho paginas distintas,
// es de plantilla. Depender del listado completo obligaria a tocar /api/analyze,
// que esgeo.ai consume en produccion. No merece el riesgo.

// Vercel corta las funciones a los 10 s por defecto. Un sitio lento con 10 paginas
// puede pasarse: sin esto el escaneo devuelve 504 justo en el momento en que el
// usuario acaba de dar su email. Es el peor sitio posible para fallar.
export const config = { maxDuration: 60 };

const SB_URL = 'https://bcicjjkgjgajxbrwmeyf.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaWNqamtnamdhanhicndtZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU3ODIsImV4cCI6MjA4NDc2MTc4Mn0.BqgzIMTWvDIzbx1lofd7ZHYWt3FWjdpWc89kBaQGvrs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_URLS = 12;
const CONCURRENCY = 6;

const norm = u => {
  const s = String(u || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return s && s.includes('.') ? 'https://' + s : null;
};

async function fetchText(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; HABLA-audit/2.0; +https://machineready.vercel.app)' } });
    return r.ok ? await r.text() : '';
  } catch { return ''; } finally { clearTimeout(t); }
}

// Descubre qué páginas mirar. Sitemap primero; si no hay, los enlaces de la home.
//
// Dos formatos rompen la extracción ingenua y entre ambos cubren media web:
//   · WordPress (All in One SEO, Yoast) envuelve las URLs en <![CDATA[...]]>
//   · muchos temas enlazan en absoluto (href="https://dominio/x"), no en relativo
// Si no se contemplan, el escaneo devuelve una sola página y parece que el sitio
// no tiene más. Falso negativo silencioso: el peor tipo de bug en un informe.

const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/g;
const SKIP_EXT = /\.(xml|txt|pdf|jpe?g|png|webp|gif|svg|gz|css|js|ico|zip|mp4)$/i;
const locsIn = xml => [...xml.matchAll(LOC_RE)].map(m => m[1]);

async function discover(root, limit) {
  const host = root.replace(/^https?:\/\//, '');
  const seen = new Set();
  const out = [];
  const add = u => {
    const k = u.replace(/\/+$/, '').replace(/^http:/, 'https:');
    if (seen.has(k) || out.length >= limit) return;
    if (!k.includes(host) || SKIP_EXT.test(k)) return;
    seen.add(k); out.push(k || root);
  };
  add(root);

  let locs = locsIn(await fetchText(root + '/sitemap.xml'));

  // Un índice de sitemaps apunta a otros sitemaps. Sigue hasta tres:
  // WordPress suele partirlos en posts / páginas / categorías.
  const children = locs.filter(l => /\.xml($|\?)/i.test(l)).slice(0, 3);
  if (children.length) {
    const inner = await Promise.all(children.map(c => fetchText(c)));
    locs = inner.flatMap(locsIn);
  }
  locs.forEach(add);

  // Sin sitemap útil: los enlaces internos de la home, relativos o absolutos.
  if (out.length === 1) {
    const home = await fetchText(root);
    for (const m of home.matchAll(/href=["']([^"']+)["']/g)) {
      const h = m[1];
      if (h.startsWith('data:') || h.startsWith('#') || h.startsWith('mailto:')) continue;
      if (h.startsWith('/') && !h.startsWith('//')) add(root + h.split(/[#?]/)[0]);
      else if (h.includes(host)) add(h.split(/[#?]/)[0]);
    }
  }
  return out.slice(0, limit);
}

// Paralelo, pero de seis en seis: no queremos parecer un ataque a la web del cliente.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// El titular es la linea que vende el informe: cortar a 70 caracteres dejaba frases
// mutiladas ("...los modelos priorizan lo…"). Cada recomendacion ya empieza por una
// frase autosuficiente; usamos esa y tiramos el resto.
const frase = w => {
  const s = String(w).replace(/^CRÍTICO:\s*/, '').split('. ')[0].replace(/\.$/, '');
  return s.length > 95 ? s.slice(0, 92).trimEnd() + '…' : s + '.';
};

// Fallback v4 para runtimes sin crypto.randomUUID. No necesita ser criptografico:
// solo agrupar las paginas de un mismo escaneo sin colisionar.
const uuid4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

async function logScan(rows, email, scanId, referrer) {
  try {
    await fetch(SB_URL + '/rest/v1/habla_analyses', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows.map(r => ({
        url: r.url, http: r.http, total: r.total, grade: r.grade,
        scores: r.scores || null, checks: r.checks || null, wins: r.wins || null,
        wins_total: (r.wins || []).length, email, scan_id: scanId, referrer: referrer || 'scan'
      })))
    });
  } catch { /* nunca bloquear la respuesta */ }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = req.query || {};

  const root = norm(q.url);
  if (!root) return res.status(400).json({ error: 'Falta ?url= o el dominio no es válido.' });

  const email = String(q.email || '').trim().toLowerCase().slice(0, 120);
  if (!EMAIL_RE.test(email)) {
    return res.status(403).json({
      error: 'email_requerido',
      detail: 'El escaneo de sitio necesita un email. El análisis de una sola página es libre en /api/analyze.'
    });
  }

  const limit = Math.min(MAX_URLS, Math.max(2, parseInt(q.limit, 10) || 10));
  const t0 = Date.now();

  try {
    const urls = await discover(root, limit);
    const results = await pool(urls, CONCURRENCY, u => analyze(u).catch(() => ({ url: u, http: 0, total: null, grade: null, scores: null, checks: null, wins: [] })));

    const ok = results.filter(r => typeof r.total === 'number' && r.http === 200);
    if (!ok.length) return res.status(200).json({
      url: root, rubric: '2.0', pages_scanned: results.length, pages_ok: 0,
      detail: 'No pude leer ninguna página de ese dominio. O no responde, o bloquea a los crawlers que no conoce.',
      pages: results.map(r => ({ url: r.url, total: r.total, grade: r.grade, http: r.http }))
    });

    const sorted = [...ok].sort((a, b) => a.total - b.total);
    const avg = Math.round(ok.reduce((s, r) => s + r.total, 0) / ok.length);

    // El fallo repetido: la misma recomendación en varias páginas es un problema
    // de plantilla, no de contenido. Se arregla una vez y sube todo el sitio.
    const freq = new Map();
    for (const r of ok) for (const w of new Set(r.wins || [])) {
      const e = freq.get(w) || { win: w, pages: 0 };
      e.pages++; freq.set(w, e);
    }
    // Un fallo de SITIO (robots.txt, sitemap, llms.txt, HTTPS) vive en un unico
    // fichero: sale en las 10 paginas porque es el mismo fichero leido 10 veces,
    // no porque se repita. Colarlo en el titular como "aparece en 10 de 10
    // paginas" hace que la linea que vende el informe suene a tonteria.
    const DE_SITIO = /robots\.txt|sitemap|llms\.txt|HTTPS|certificado/i;
    const todos = [...freq.values()].sort((a, b) => b.pages - a.pages)
      .map(p => ({ ...p, share: Math.round(100 * p.pages / ok.length) }));
    const siteIssues = todos.filter(p => DE_SITIO.test(p.win));
    const patterns = todos.filter(p => !DE_SITIO.test(p.win) && p.pages > 1);

    const dist = ok.reduce((a, r) => (a[r.grade] = (a[r.grade] || 0) + 1, a), {});
    const gateFails = ok.filter(r => !r.gateA).length;

    // scan_id es uuid en Postgres: un fallback no-uuid haria que el insert de
    // Supabase devolviera 400 y logScan se lo tragara. Leads perdidos sin ruido.
    const scanId = globalThis.crypto?.randomUUID?.() || uuid4();

    const out = {
      url: root, rubric: '2.0', scan_id: scanId,
      pages_scanned: results.length, pages_ok: ok.length,
      elapsed_ms: Date.now() - t0,
      site_score: avg,
      site_grade: avg >= 80 ? 'BILINGÜE' : avg >= 60 ? 'CONVERSACIONAL' : avg >= 40 ? 'BALBUCEA' : 'MUDA',
      spread: { min: sorted[0].total, max: sorted[sorted.length - 1].total },
      worst: { url: sorted[0].url, total: sorted[0].total, grade: sorted[0].grade },
      best: { url: sorted[sorted.length - 1].url, total: sorted[sorted.length - 1].total, grade: sorted[sorted.length - 1].grade },
      grade_distribution: dist,
      pages_failing_gate: gateFails,
      repeated_issues: patterns.slice(0, 6),
      site_issues: siteIssues.slice(0, 4),
      headline: patterns.length
        ? `"${frase(patterns[0].win)}" aparece en ${patterns[0].pages} de ${ok.length} páginas.`
        : `Sin fallos repetidos entre páginas: los problemas son puntuales, no de plantilla.`,
      pages: ok.map(r => ({
        url: r.url, total: r.total, grade: r.grade,
        scores: r.scores, wins_count: (r.wins || []).length, wins: r.wins || []
      })).sort((a, b) => a.total - b.total)
    };

    await logScan(results.filter(r => r.http === 200), email, scanId, String(q.from || '').slice(0, 40));
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Escaneo fallido', detail: String(e).slice(0, 140) });
  }
}
