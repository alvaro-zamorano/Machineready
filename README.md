# HABLA — machine-readability audit

Measures whether a website is visible and citable by AI agents (GPTBot, ClaudeBot, PerplexityBot).
Five dimensions, each verifiable with a single command. No opinions.

| | |
|---|---|
| **Landing + tool** | `/` → [machineready.vercel.app](https://machineready.vercel.app/) |
| **API** | `GET /api/analyze?url=holded.com` → JSON with score, checks and quick wins |
| **Exhibition** | `/exposicion/` — "The Web of the Machines", explanatory piece (Spanish) |
| **Framework** | [`docs/framework-habla.md`](docs/framework-habla.md) |

## The framework

HABLA is a Spanish acronym; the dimensions map cleanly to English:

| Dim | Weight | What it measures | Check |
|-----|--------|------------------|-------|
| **H** Findable | 20% · gate | robots.txt per bot, no 403 to agents, sitemap | `curl -A TestBot → 200` |
| **A** Accessible | 25% · gate | content present in the initial HTML (AI crawlers don't execute JS) | `curl \| grep "key phrase"` |
| **B** Well-structured | 20% | single h1, heading hierarchy, semantic markup, JSON-LD | `grep -c 'ld+json' ≥ 1` |
| **L** Legible & citable | 25% | dated figures, answerability, signal-to-HTML ratio | answerability test |
| **A** Actionable | 10% | llms.txt, contact and pricing in plain text | `curl /llms.txt → 200` |

Scale: **80–100** Bilingual · **60–79** Conversational · **40–59** Mumbling · **<40 or failed gate** Mute.

## Results (20 sites, 2026-07-12)

Holded 92 · Stripe 80 · Wikipedia 72 · Mercadona 27 · Zara 21 · BBVA and Idealista 0 (they return 403 to agents).

Key finding: **answerability beats volume.** A small firm's site with 1,141 characters answered every test question; a site with 9× more text returned only slogans and UI noise (0.4% signal in 2.3 MB of HTML).

## Stack

Static site + one serverless function in plain JS, zero dependencies. Every analysis is logged to Supabase (`habla_analyses`, insert-only RLS) — it doubles as dataset and lead capture.

> The `SUPABASE_ANON_KEY` is in the code on purpose: it's a publishable key with insert-only RLS. It cannot read anything.
