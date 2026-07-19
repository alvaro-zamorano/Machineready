// HABLA analyzer — rubric 2.0 — Vercel serverless, sin dependencias
//
// Qué cambió respecto de la 1.x, y por qué:
//
// La 1.x medía VOCABULARIO. `answerability` contaba cuántas de diez palabras
// ("precio", "gratis", "contacto"…) aparecían en los 800 primeros caracteres del HTML
// — que incluyen el <title>, la meta description y el MENÚ DE NAVEGACIÓN. El menú de
// cualquier tienda ("Servicio · Precios · Contacto") ya sumaba tres de cuatro sin que
// la web respondiera absolutamente nada. Y `cites` contaba repeticiones, así que un
// pie de página con "© 2020 2021 2022 2023 2024" regalaba puntos.
//
// La 2.0 mide HECHOS, sobre el BLOQUE DE CONTENIDO REAL (sin nav, header ni footer):
// ¿dices qué eres? ¿para quién? ¿cuánto/cuántos, con una cifra? ¿está fechado?
// ¿se sostiene solo, sin "descubre más abajo"? Cinco preguntas, diez puntos cada una.
//
// El rubric va versionado a propósito: una nota sin rubric no es una nota, es una
// opinión. `rubric` viaja en cada respuesta.

const RUBRIC = '2.0';

// Lo que esta nota SÍ significa y lo que NO. Viaja en cada respuesta a propósito:
// una herramienta que no declara sus límites no está midiendo, está vendiendo.
const CAVEAT = 'HABLA mide si una máquina PUEDE leerte y extraer una afirmación citable. ' +
  'No mide autoridad. Wikipedia saca 68 en este mismo rubric y los modelos la citan cada día, ' +
  'porque la autoridad no se marca: se gana. Una nota alta no te compra citas — elimina el ' +
  'motivo técnico por el que hoy no te citan. El rubric es público y va versionado.';

// El eje L (answerability) asume que la página TIENE algo que afirmar: un producto, un
// servicio, una tesis. En la portada de un periódico o en un artículo de enciclopedia,
// pedir "precio" y "para quién" no tiene sentido. Se dice, no se disimula.
const SCOPE = 'Calibrado para páginas con una propuesta: landing, producto, servicio, curso, ficha. ' +
  'En portadas de medios o enciclopedias el eje L penaliza de más.';
const AI_BOTS = ['GPTBot','ClaudeBot','PerplexityBot','OAI-SearchBot','Google-Extended','CCBot','ChatGPT-User','Perplexity-User','Applebot-Extended','Bytespider'];
const UA = 'Mozilla/5.0 (compatible; HABLA-audit/2.0; +https://machineready.vercel.app)';

async function get(url, ms = 10000) {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: c.signal, redirect: 'follow' });
    clearTimeout(t);
    return { status: r.status, body: (await r.text()).slice(0, 1_500_000) };
  } catch { return { status: 0, body: '' }; }
}

const strip = h => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');            // los comentarios NO son texto visible

const toText = h => strip(h)
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&\w+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/**
 * Texto de CONTENIDO: sin menú, cabecera, pie ni barras laterales.
 * La 1.x contaba todo el body, así que el chrome de una SPA vacía podía colar el gate A.
 */
function contentText(html) {
  let h = strip(html);
  const main = h.match(/<main[\s\S]*?<\/main>/i) || h.match(/<article[\s\S]*?<\/article>/i);
  if (main) h = main[0];
  h = h.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
  return h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** ¿El fichero es de verdad, o es el shell del SPA con otro nombre? */
const isRealTextFile = r => r.status === 200 && !/^\s*<(!doctype|html)/i.test(r.body.slice(0, 200));

/** Una directiva real, no el nombre del bot suelto en un comentario. */
function botsDeclared(robots) {
  if (robots.status !== 200) return [];
  const lines = robots.body.split('\n').filter(l => !l.trim().startsWith('#'));
  const clean = lines.join('\n').toLowerCase();
  return AI_BOTS.filter(b => new RegExp(`user-agent:\\s*${b.toLowerCase().replace(/[-]/g, '\\-')}\\b`).test(clean));
}

function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set(); let valid = 0, broken = 0, entity = false, contactPoint = false;
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1].trim()); valid++;
      const walk = n => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        // @type puede ser string O array: ["Organization","EducationalOrganization"] es
        // schema.org perfectamente válido. Mirar solo strings penalizaba a las webs que
        // lo hacen BIEN. Se descubrió porque el auditor decía que esgeo.ai no declaraba
        // entidad cuando sí lo hacía.
        const t = n['@type'];
        const ts = typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter(x => typeof x === 'string') : [];
        ts.forEach(x => types.add(x));
        if (ts.some(x => ['Organization','Person','LocalBusiness','EducationalOrganization','NewsMediaOrganization'].includes(x)) && (n.name || n.url)) entity = true;
        if (ts.includes('ContactPoint') || n.contactPoint || n.email) contactPoint = true;
        Object.values(n).forEach(walk);
      };
      walk(j);
    } catch { broken++; }
  }
  const CONTENT_TYPES = ['Article','BlogPosting','NewsArticle','Product','Course','FAQPage','HowTo','Recipe','Event','Service','SoftwareApplication','WebApplication','LocalBusiness','JobPosting'];
  return { valid, broken, types: [...types], hasContentType: [...types].some(t => CONTENT_TYPES.includes(t)), entity, contactPoint };
}

/** Jerarquía de encabezados sin saltos: un h1→h3 rompe el árbol del documento. */
function headingHierarchy(html) {
  const levels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map(m => +m[1]);
  if (!levels.length) return { ok: false, skips: 0, count: 0 };
  let skips = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skips++;
  return { ok: skips === 0 && levels[0] === 1, skips, count: levels.length };
}

/** Un <img> sin alt es invisible para el modelo: no puede describir ni citar la imagen. */
function altCoverage(html) {
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  if (!imgs.length) return { total: 0, withAlt: 0, pct: 100 };
  const withAlt = imgs.filter(i => /\salt\s*=\s*["'][^"']+["']/i.test(i)).length;
  return { total: imgs.length, withAlt, pct: Math.round(100 * withAlt / imgs.length) };
}

/**
 * ANSWERABILITY 2.0 — cinco hechos sobre el primer bloque de CONTENIDO.
 * No busca palabras sueltas: busca que la afirmación exista.
 */
function answerability(content, title) {
  const first = content.slice(0, 700);
  const lo = first.toLowerCase();

  // 1. QUÉ. Un verbo definitorio, no la palabra "servicio" perdida en un menú.
  const what = /\b(es|son|somos|ofrece|ofrecemos|ayuda|ayudamos|permite|hace|hacemos|vende|vendemos|enseña|enseñamos|fabrica|diseña|gestiona|desarrolla|construye)\b/.test(lo)
    && first.length > 80;

  // 2. PARA QUIÉN.
  const who = /\b(para (empresas|equipos|pymes|autónomos|fundadores|marcas|profesionales|particulares|quien|los? |las? )|dirigido a|pensado para|orientado a|si eres|ideal para)\b/.test(lo);

  // 3. CUÁNTO — una cifra con unidad. No vale el símbolo € suelto.
  const howMuch = /\d+([.,]\d+)?\s?(€|%|euros?|años?|meses?|semanas?|días?|horas?|minutos?|páginas?|módulos?|lecciones?|clientes?|proyectos?|empleados?|km|m2|m²|plazas?|usuarios?)\b/i.test(first)
    || /\bgratis\b|\bgratuito\b|\bsin coste\b/.test(lo) && /\d/.test(first);

  // 4. FECHADO — mes y año, o ISO. Un "2026" suelto no fecha nada.
  const dated = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(de\s+)?20\d\d\b/i.test(first)
    || /\b20\d\d-\d{2}-\d{2}\b/.test(first)
    || /\b(actualizado|publicado|revisado)\b[^.]{0,40}\b20\d\d\b/i.test(lo);

  // 5. AUTOSUFICIENTE — se entiende sin hacer scroll ni clic.
  const deixis = /\b(aquí abajo|más abajo|descubre|haz clic|pincha|scroll|sigue leyendo|ver más|entérate)\b/.test(lo);
  const sentences = (first.match(/[.!?]\s/g) || []).length;
  const selfContained = !deixis && sentences >= 2;

  const facts = { what, who, howMuch, dated, selfContained };
  const score = Object.values(facts).filter(Boolean).length * 10;
  return { score, facts };
}

export async function analyze(url) {
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  const { status, body: html } = await get(url);
  if (status !== 200) return {
    url, http: status, rubric: RUBRIC, gateH: false, total: 0, grade: 'MUDA',
    detail: status === 403 ? 'La web bloquea user-agents desconocidos (403): invisible para agentes IA.'
      : status === 0 ? 'No se pudo conectar.' : `HTTP ${status}.`,
    scores: { H: 0, A: 0, B: 0, L: 0, X: 0 }, checks: {}, wins: []
  };

  const txt = toText(html);
  const content = contentText(html);
  const T = content.length;            // solo contenido; el chrome ya no cuenta
  const root = url.match(/^https?:\/\/[^\/]+/)[0];
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ''])[1];

  const [llmsR, robR, smR] = await Promise.all([
    get(root + '/llms.txt', 6000), get(root + '/robots.txt', 6000), get(root + '/sitemap.xml', 6000)
  ]);

  // ── H — Higiene ────────────────────────────────────────────────────────
  const robotsOk = isRealTextFile(robR) && /(user-agent|disallow|allow|sitemap)\s*:/i.test(robR.body);
  const sitemapLocs = (smR.status === 200 ? (smR.body.match(/<loc>/g) || []).length : 0);
  const aiBots = botsDeclared(robR);
  // lang: el modelo necesita saber en qué idioma le hablas. canonical: y cuál es la
  // dirección buena, si la misma página se sirve desde varias.
  const lang = /<html[^>]+lang\s*=\s*["'][a-z]{2}/i.test(html);
  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1] || null;
  const canonicalOk = !!canonical && /^https?:\/\//.test(canonical);
  const inSitemap = sitemapLocs > 0 && smR.body.includes(url.replace(/\/$/, ''));
  const H = 20 + (robotsOk ? 20 : 0) + (sitemapLocs > 0 ? 15 : 0) + (aiBots.length ? 20 : 0)
    + (lang ? 10 : 0) + (canonicalOk ? 15 : 0);

  // ── A — Accesible (gate) ───────────────────────────────────────────────
  const rootShell = /<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/.test(html);
  const shell = rootShell || T < 300;
  const A = shell ? 15 : T >= 3000 ? 100 : T >= 1200 ? 80 : T >= 400 ? 55 : 20;

  // ── B — Bloques ────────────────────────────────────────────────────────
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  const heads = (html.match(/<h[1-6][\s>]/gi) || []).length;
  const sem = (html.match(/<(article|main|nav|section|aside|header|footer)[\s>]/gi) || []).length;
  const ld = parseJsonLd(html);
  const meta = /name=["']description["']/i.test(html);
  const hier = headingHierarchy(html);
  const alt = altCoverage(html);
  const ldPts = ld.valid === 0 ? 0 : ld.hasContentType ? 25 : 15;
  const B = (h1 === 1 ? 20 : h1 > 1 ? 6 : 0)
    + (heads >= 5 ? 10 : 3)
    + (hier.ok ? 15 : hier.skips <= 2 ? 7 : 0)     // saltos h1→h3: el árbol se rompe
    + (sem >= 5 ? 15 : sem >= 2 ? 6 : 0)
    + ldPts
    + (meta ? 5 : 0)
    + (alt.pct >= 90 ? 10 : alt.pct >= 60 ? 5 : 0) // un <img> sin alt no existe para el modelo
    - (ld.broken ? 10 : 0);

  // ── L — Lenguaje ───────────────────────────────────────────────────────
  const ratio = 100 * T / Math.max(html.length, 1);
  const ratioPts = ratio >= 8 ? 30 : ratio >= 4 ? 22 : ratio >= 1.5 ? 12 : 4;
  const ans = answerability(content, title);
  // Cifras DISTINTAS: el "© 2020 2021 2022…" del pie ya no regala nada.
  const distinctFigures = new Set((content.slice(0, 8000).match(/\d+([.,]\d+)?\s?(€|%|años?|meses?|días?|páginas?|módulos?|horas?|clientes?|proyectos?)/gi) || []).map(s => s.toLowerCase().replace(/\s+/g, ''))).size;
  const figPts = Math.min(20, distinctFigures * 4);
  const L = Math.max(0, ratioPts + ans.score + figPts);

  // ── X — eXtras ─────────────────────────────────────────────────────────
  const llmsOk = isRealTextFile(llmsR);
  const llmsRich = llmsOk && llmsR.body.length >= 200 && (llmsR.body.match(/\]\(|https?:\/\//g) || []).length >= 3;
  const emailInPage = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(txt) || /mailto:/i.test(html);
  const phone = /\b\d{3}[\s.]?\d{2,3}[\s.]?\d{2,3}\b/.test(txt);
  const contact = phone || emailInPage || ld.contactPoint;
  const X = (llmsOk ? 20 : 0) + (llmsRich ? 20 : 0) + (contact ? 30 : 0) + (ld.entity ? 30 : 0);

  let total = Math.round(H * .20 + A * .25 + Math.min(100, B) * .20 + Math.min(100, L) * .25 + X * .10);
  const gateA = A > 20;
  if (H < 50 || !gateA) total = Math.min(total, 39);
  const grade = total >= 80 ? 'BILINGÜE' : total >= 60 ? 'CONVERSACIONAL' : total >= 40 ? 'BALBUCEA' : 'MUDA';

  // ── quick wins ─────────────────────────────────────────────────────────
  const wins = [];
  if (!gateA) wins.push('CRÍTICO: tu contenido no está en el HTML inicial. Los crawlers IA no ejecutan JS: necesitas SSR o pre-render.');
  if (!aiBots.length) wins.push('robots.txt sin directivas User-agent para bots IA: decide qué permites (citación vs entrenamiento). 15 min.');
  if (ld.valid === 0) wins.push('Sin datos estructurados JSON-LD válidos: el mayor salto de clasificación. 1-2 h.');
  else if (ld.broken) wins.push(`Tienes ${ld.broken} bloque(s) JSON-LD que no parsean: para el modelo es como si no existieran.`);
  else if (!ld.hasContentType) wins.push('Tu JSON-LD solo declara el sitio, no el contenido (Article, Product, Course, FAQPage…). 1 h.');
  if (!ans.facts.what) wins.push('Tu primer bloque no dice QUÉ eres con un verbo claro. Empieza por "X es…". 30 min.');
  if (!ans.facts.who) wins.push('Tu primer bloque no dice PARA QUIÉN es. Nómbralo ("para equipos de…", "si eres…"). 15 min.');
  if (!ans.facts.howMuch) wins.push('Tu primer bloque no da una sola cifra con unidad (precio, plazo, tamaño): sin cifra no hay nada que citar. 30 min.');
  if (!ans.facts.dated) wins.push('Tu primer bloque no está fechado (mes y año). Los modelos priorizan lo reciente y lo fechado. 10 min.');
  if (!ans.facts.selfContained) wins.push('Tu primer bloque no se sostiene solo: depende de "descubre", "más abajo" o de hacer clic. Reescríbelo autocontenido.');
  if (!llmsOk) wins.push('Sin llms.txt: párrafo de identidad + enlaces curados. Opcionalidad B2A a coste cero. 30 min.');
  else if (!llmsRich) wins.push('Tu llms.txt existe pero está vacío de sustancia: identidad + al menos 3 enlaces curados.');
  if (!contact) wins.push('Sin vía de contacto legible (email, teléfono o ContactPoint en JSON-LD): el modelo no sabe cómo se te alcanza. 10 min.');
  if (!ld.entity) wins.push('Sin entidad declarada (Organization/Person con nombre y url en JSON-LD): el modelo no sabe QUIÉN eres. 30 min.');
  if (ratio < 2 && gateA) wins.push(`Solo el ${ratio.toFixed(1)}% de tu HTML es contenido: dieta de markup.`);
  if (h1 !== 1) wins.push(h1 === 0 ? 'Falta el h1.' : 'Más de un h1: deja uno.');
  if (!hier.ok && hier.count) wins.push(`Jerarquía de encabezados rota (${hier.skips} salto(s) tipo h1→h3): el modelo pierde el árbol del documento. 30 min.`);
  if (alt.total && alt.pct < 90) wins.push(`Solo el ${alt.pct}% de tus ${alt.total} imágenes tiene alt: para el modelo, el resto no existe. 30 min.`);
  if (!lang) wins.push('Falta lang en <html>: el modelo no sabe en qué idioma le hablas. 2 min.');
  if (!canonicalOk) wins.push('Sin canonical absoluto: si la misma página se sirve desde varias URLs, el modelo no sabe cuál citar. 15 min.');

  return {
    url, http: 200, rubric: RUBRIC, caveat: CAVEAT, scope: SCOPE, total, grade, gateH: H >= 50, gateA,
    scores: { H, A, B: Math.min(100, B), L: Math.min(100, L), X },
    checks: {
      content_chars: T, all_text_chars: txt.length, ratio: +ratio.toFixed(1), shell,
      h1, headings: heads, semantic: sem,
      heading_hierarchy_ok: hier.ok, heading_skips: hier.skips,
      img_alt_pct: alt.pct, img_total: alt.total,
      lang, canonical, in_sitemap: inSitemap,
      jsonld_valid: ld.valid, jsonld_broken: ld.broken, ld_types: ld.types.slice(0, 6),
      jsonld_content_type: ld.hasContentType, entity: ld.entity,
      meta_desc: meta, llms_txt: llmsOk, llms_txt_rich: llmsRich,
      robots_ai_bots: aiBots, sitemap_urls: sitemapLocs,
      answerability: ans.score / 10, answerability_facts: ans.facts,
      distinct_figures: distinctFigures,
      contact, contact_via: ld.contactPoint ? 'schema ContactPoint' : emailInPage ? 'email' : phone ? 'teléfono' : null
    },
    wins: wins.slice(0, 5)
  };
}

// ---- log comercial: cada análisis se guarda (insert-only via RLS) ----
const SB_URL = 'https://bcicjjkgjgajxbrwmeyf.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaWNqamtnamdhanhicndtZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU3ODIsImV4cCI6MjA4NDc2MTc4Mn0.BqgzIMTWvDIzbx1lofd7ZHYWt3FWjdpWc89kBaQGvrs';
async function logAnalysis(r) {
  try {
    await fetch(SB_URL + '/rest/v1/habla_analyses', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ url: r.url, http: r.http, total: r.total, grade: r.grade, scores: r.scores || null, checks: r.checks || null, wins: r.wins || null })
    });
  } catch { /* nunca bloquear la respuesta al usuario */ }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = (req.query && req.query.url) || '';
  if (!url) return res.status(400).json({ error: 'Falta ?url=' });
  try {
    const r = await analyze(url);
    await logAnalysis(r);
    res.status(200).json(r);
  } catch (e) { res.status(500).json({ error: 'Análisis fallido', detail: String(e).slice(0, 120) }); }
}
