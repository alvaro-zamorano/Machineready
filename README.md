# HABLA — auditoría de legibilidad máquina

Mide si una web es visible y citable para agentes de IA (GPTBot, ClaudeBot, PerplexityBot).
Cinco dimensiones, cada una verificable con un comando. Sin opiniones.

| | |
|---|---|
| **Landing + herramienta** | `/` → [machineready.vercel.app](https://machineready.vercel.app/) |
| **API** | `GET /api/analyze?url=holded.com` → JSON con score, checks y quick wins |
| **Exposición** | `/exposicion/` — "La web de las máquinas", pieza divulgativa |
| **Framework** | [`docs/framework-habla.md`](docs/framework-habla.md) |

## Framework

| Dim | Peso | Qué mide | Check |
|-----|------|----------|-------|
| **H** Hallable | 20% · gate | robots.txt por bot, sin 403 a agentes, sitemap | `curl -A TestBot → 200` |
| **A** Accesible | 25% · gate | contenido en el HTML inicial (los crawlers IA no ejecutan JS) | `curl \| grep "frase clave"` |
| **B** Bien estructurado | 20% | un h1, jerarquía, semántico, JSON-LD | `grep -c 'ld+json' ≥ 1` |
| **L** Legible y citable | 25% | cifras con fecha, respondibilidad, ratio señal/HTML | test de respondibilidad |
| **A** Accionable | 10% | llms.txt, contacto y precios en texto plano | `curl /llms.txt → 200` |

Escala: **80-100** Bilingüe · **60-79** Conversacional · **40-59** Balbucea · **<40 o gate fallido** Muda.

## Resultados (20 webs, 12/07/2026)

Holded 92 · Stripe 80 · Wikipedia 72 · Mercadona 27 · Zara 21 · BBVA e Idealista 0 (devuelven 403 a agentes).

Hallazgo: **la respondibilidad supera al volumen.** Una gestoría con 1.141 caracteres respondió a todo; una web con 9× más texto solo devolvió eslogan y ruido de UI (0,4% de señal en 2,3 MB).

## Stack

Estático + una función serverless en JS puro, cero dependencias. Cada análisis se registra en Supabase (`habla_analyses`, RLS insert-only) como dataset y como lead.

> La `SUPABASE_ANON_KEY` está en el código a propósito: es una clave publicable con RLS de solo-inserción. No lee nada.
