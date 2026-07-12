# Framework HABLA — ¿Tu web habla máquina?

**Metodología de auditoría y optimización de legibilidad máquina.**
Versión 0.1 · Julio 2026 · Basada en evidencia publicada + experimento empírico propio (8 webs analizadas con la vista real de un crawler IA + test de lectura por LLM).

---

## Por qué existe

La mayoría del tráfico web relevante para descubrimiento ya incluye agentes y crawlers de IA que deciden qué se cita, qué se recomienda y qué se compra. Estos lectores tienen reglas distintas a Google y al ojo humano:

1. **No ejecutan JavaScript.** Análisis de 500M+ fetches de GPTBot: cero evidencia de ejecución JS. GPTBot, ClaudeBot y PerplexityBot leen solo el HTML inicial. Una SPA client-side puede rankear #1 en Google y estar en blanco para todos los motores de IA a la vez (Vercel/MERJ; Lantern, 2026).
2. **Citan lo citable.** El paper GEO (Aggarwal et al., KDD 2024) midió: añadir estadísticas, citas y fuentes sube la visibilidad en respuestas generativas hasta +40%; mejorar solo la fluidez del texto, +28%; el keyword stuffing *baja* 8–10% vs. no hacer nada. Y las webs peor rankeadas en SERP son las que más ganan (+115% la 5ª posición) — GEO es la palanca del pequeño.
3. **El acceso es binario.** Un 403 a user-agents desconocidos (verificado en nuestro test: El País) = invisibilidad total, da igual la calidad del contenido. robots.txt se configura ya por-bot: se puede permitir citación (OAI-SearchBot, Claude-Web) y bloquear entrenamiento (GPTBot, ClaudeBot) — es una decisión estratégica, no técnica.
4. **llms.txt: opcionalidad barata, no milagro.** Adopción ~10% de dominios (SE Ranking, 300k dominios); los crawlers apenas lo leen hoy (408 fetches de 500M eventos, Limy 2026); Google lo ignora oficialmente. Pero cuesta media hora, el ecosistema de agentes IDE ya lo usa, y es la primera superficie B2A (business-to-agent) estandarizada. Se recomienda con esa honestidad: peso bajo, coste casi nulo.

---

## El experimento (12/07/2026)

Analizamos 8 webs con HTML crudo sin JS — exactamente lo que recibe un crawler IA — midiendo texto visible, ratio señal/HTML, jerarquía, schema, llms.txt y robots. Después, lectura subjetiva por LLM respondiendo: *"¿qué es, para quién, cuánto, cómo actúo?"*

| Web | Texto visible | Ratio señal | Schema | llms.txt | Lectura LLM |
|---|---|---|---|---|---|
| Wikipedia ES (artículo) | 110.880 chars | 16,4% | Article ✓ | ✗ | Máxima: denso, jerárquico, citable |
| MDN docs | 12.369 | 6,0% | ✗ | ✗ | Alta: semántica limpia, 1 h1 |
| Stripe | 15.900 | 2,5% | Org+Contact ✓ | ✓ | Alta vía llms.txt (resumen + enlaces curados) |
| Anthropic | 4.742 | 2,4% | ✗ | ✗ | Media |
| Linear | 9.884 | **0,4%** | ✗ | ✓ | **Baja: 2,3MB de HTML para ruido de UI; extraigo eslogan, no hechos** |
| El País | — | — | — | — | **Nula: 403 a UA desconocido** |
| Gestoría pyme (cliente) | 1.141 | 16,7% | ✗ | ✗ | **Alta pese al tamaño: cada frase es dato accionable** |
| alvaro-pipeline.pages.dev | 1.281 | 0,9% | ✗ | ✗ | Baja: shell JS |

### Lo que me atrae como lector máquina (hallazgos del test)

1. **Respondibilidad en los primeros ~500 tokens.** La gestoría pyme, con solo 1.141 caracteres, me dejó responder qué hace, dónde, teléfono, tiempo de respuesta y qué es gratis. Linear, con 9× más texto, solo me dio un eslogan repetido tres veces y migas de interfaz. *La métrica no es volumen: es respondibilidad.*
2. **Datos con forma de cita.** "Respuesta en menos de 1 hora", "tabla oficial de 2026": frases con número + fecha + sujeto son unidades que un LLM puede levantar y citar tal cual. Coincide con el +40% del paper GEO. El adorno sin dato es coste de tokens sin retorno.
3. **El ruido cobra peaje de confianza.** Cuando el 99,6% del HTML es markup (Linear), gasto contexto en basura y mi confianza en lo extraído baja. Ratio señal/HTML alto = web que "respeta" a su lector máquina.
4. **llms.txt bien hecho es una delicia.** El de Stripe: un párrafo de identidad + enlaces curados con descripción de una línea. Orientación instantánea, cero ruido. Es la versión máquina de un buen recibidor.
5. **Corrección honesta a nuestra propia heurística:** el detector "shell JS si <1.500 chars" dio falso positivo con la gestoría (pequeña pero densa y server-rendered). Longitud absoluta es mal proxy; el check correcto es *respondibilidad + contenido presente en HTML inicial*. El framework incorpora esta lección.

---

## Las 5 dimensiones HABLA

Cada dimensión puntúa 0–100; el score global es la media ponderada, con dos **gates** (si fallan, el resto casi no importa).

### H — Hallable (peso 20) · GATE
*¿Pueden llegar los lectores máquina?*
- robots.txt con reglas explícitas por bot IA (decidir: citación sí / entrenamiento a elección)
- Sin 403/challenges a user-agents desconocidos en contenido público
- sitemap.xml actualizado; URLs limpias y estables
- **Verificar:** `curl -A "Mozilla/5.0 (compatible; TestBot)" -o /dev/null -w "%{http_code}" URL` → 200

### A — Accesible (peso 25) · GATE
*¿Está el contenido en el HTML inicial?*
- Contenido crítico (servicios, precios, FAQ, contacto) server-rendered o pre-rendered
- Sin dependencia de JS para texto principal; sin muros de scroll/click para datos clave
- **Verificar:** `curl URL | grep "frase clave del negocio"` → match. Si el HTML es `<div id="root">` + scripts, invisible.

### B — Bien estructurado (peso 20)
*¿Puede clasificarse sin adivinar?*
- Un h1 por página; jerarquía h2/h3 sin saltos; HTML semántico (main, article, nav)
- JSON-LD relevante al negocio: LocalBusiness (pymes), Product, FAQPage, Organization
- Meta description real; datos NAP (nombre-dirección-teléfono) en texto, no en imagen
- **Verificar:** `grep -c 'ld+json'` ≥1 con @type correcto; un solo `<h1`

### L — Legible y citable (peso 25)
*¿Hay unidades que un LLM quiera levantar?*
- Respuesta directa a "qué/para quién/cuánto" en el primer bloque
- Datos citables: cifras con fecha y fuente, no adjetivos ("+40% visibilidad con estadísticas" > "gran visibilidad")
- Prosa fluida y concreta (fluency +28% en GEO); cero keyword stuffing (−8/−10%)
- Ratio señal/HTML como indicador de respeto al lector: <2% es bandera roja
- **Verificar:** test de respondibilidad — un LLM con solo el HTML crudo debe contestar las 4 preguntas básicas

### A — Accionable (peso 10)
*¿Puede un agente hacer algo, no solo leer?*
- llms.txt con párrafo de identidad + enlaces curados (formato Stripe)
- Precios, horarios, teléfono, email en texto plano y estructurado
- Donde aplique: endpoints/acciones declaradas (reservar, presupuestar, comprar)
- **Verificar:** `curl dominio/llms.txt` → 200 texto plano

### Puntuación
- **80–100 · Bilingüe:** la web habla máquina con fluidez
- **60–79 · Conversacional:** visible, pero pierde citas frente a competidores optimizados
- **40–59 · Balbucea:** los agentes la encuentran pero extraen poco
- **<40 o gate fallido · Muda:** invisible para la economía de agentes

---

## Quick wins ordenados por ROI (para el servicio)

1. Test del gate A (5 min): curl + grep de la frase de negocio. Si falla, SSR/pre-render es LA prioridad.
2. robots.txt por-bot con decisión consciente citación/entrenamiento (15 min).
3. JSON-LD LocalBusiness/Product/FAQ (1–2 h): el mayor salto de B para pymes.
4. Reescritura del primer bloque a "respondibilidad": qué/quién/cuánto/contacto con cifras fechadas (2 h).
5. llms.txt formato Stripe (30 min): opcionalidad B2A a coste casi cero.
6. Dieta de ruido: si señal/HTML <2%, auditar qué markup sobra.

---

## Empaquetado servicio (borrador)

- **Auditoría HABLA exprés** — score 5 dimensiones + 3 quick wins priorizados. Gancho gratuito (herramienta) o 149€ con informe.
- **Informe completo** — 29–49€ self-serve (LemonSqueezy) o incluido en implementación.
- **Implementación** — 300–900€/web pyme: gates + schema + llms.txt + reescritura bloque 1. Verificación con los mismos checks máquina del framework (evidencia antes/después en el entregable).

*Caso demo interno: la web de la gestoría cliente puntúa alto en L (denso, citable) pero 0 en schema y llms.txt — upsell natural con checks verificables.*

---

## Fuentes

- Aggarwal, P. et al. (2024). *GEO: Generative Engine Optimization*. KDD '24. arxiv.org/abs/2311.09735
- Vercel/MERJ (2025). *The rise of the AI crawler* — 569M requests GPTBot, sin ejecución JS. vercel.com/blog/the-rise-of-the-ai-crawler
- Lantern (2026). *AI crawlers do not render JavaScript* — 500M fetches, conversión tráfico IA 14,2% vs 2,8% Google.
- Limy (2026). *llms.txt in 2026* — 408 fetches de llms.txt en 500M eventos bot; postura oficial de Google (Illyes/Mueller).
- SE Ranking (2026). Estudio 300k dominios: adopción llms.txt 10,13%.
- Originality.ai (jun 2026). Tracking 3M sitios: crecimiento 8,8× de llms.txt en 12 meses.
- Experimento propio (12/07/2026): 8 webs, HTML crudo + test de lectura LLM. Script `habla_test.py` reproducible.
