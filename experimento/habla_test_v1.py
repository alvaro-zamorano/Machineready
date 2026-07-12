import urllib.request, re, json, ssl
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA={'User-Agent':'Mozilla/5.0 (compatible; HABLA-audit/0.1; +https://example.com)'}

SITES=[
 ('MDN docs','https://developer.mozilla.org/es/docs/Web/HTML'),
 ('Wikipedia ES','https://es.wikipedia.org/wiki/Inteligencia_artificial'),
 ('Stripe','https://stripe.com/es'),
 ('Anthropic','https://www.anthropic.com'),
 ('Linear (SPA)','https://linear.app'),
 ('El País','https://elpais.com'),
 ('Gestclar (cliente)','https://gestclar-site.vercel.app'),
 ('alvaro-pipeline','https://alvaro-pipeline.pages.dev'),
]

def get(url,timeout=15):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=timeout,context=ctx) as r:
            return r.status, r.read().decode('utf-8','ignore')
    except Exception as e:
        return None, str(e)[:60]

def visible_text(html):
    h=re.sub(r'<script[\s\S]*?</script>','',html,flags=re.I)
    h=re.sub(r'<style[\s\S]*?</style>','',h,flags=re.I)
    h=re.sub(r'<[^>]+>',' ',h)
    h=re.sub(r'&\w+;',' ',h)
    return re.sub(r'\s+',' ',h).strip()

def analyze(name,url):
    st,html=get(url)
    if st!=200:
        return {'name':name,'error':f'{st} {html}'}
    txt=visible_text(html)
    root=re.match(r'(https?://[^/]+)',url).group(1)
    llms_st,llms_body=get(root+'/llms.txt')
    llms_ok=llms_st==200 and '<html' not in (llms_body or '')[:200].lower()
    rob_st,rob=get(root+'/robots.txt')
    ai_bots=['GPTBot','ClaudeBot','Claude-Web','PerplexityBot','OAI-SearchBot','Google-Extended','CCBot','anthropic-ai']
    mentioned=[b for b in ai_bots if rob_st==200 and b.lower() in rob.lower()]
    jsonld=re.findall(r'application/ld\+json',html)
    ld_types=re.findall(r'"@type"\s*:\s*"([^"]+)"',html)[:6]
    return {
      'name':name,
      'html_kb':len(html)//1024,
      'text_chars':len(txt),
      'ratio_pct':round(100*len(txt)/max(len(html),1),1),
      'h1':len(re.findall(r'<h1[\s>]',html,re.I)),
      'headings':len(re.findall(r'<h[1-6][\s>]',html,re.I)),
      'semantic':len(re.findall(r'<(article|main|nav|section|aside|header|footer)[\s>]',html,re.I)),
      'jsonld_blocks':len(jsonld),
      'ld_types':ld_types,
      'meta_desc':bool(re.search(r'name=["\']description["\']',html,re.I)),
      'llms_txt':llms_ok,
      'robots_ai_bots':mentioned,
      'js_shell': len(txt)<1500,
    }

results=[analyze(n,u) for n,u in SITES]
print(json.dumps(results,indent=1,ensure_ascii=False))
