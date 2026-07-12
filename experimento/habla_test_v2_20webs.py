import urllib.request, re, json, ssl, concurrent.futures as cf
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA={'User-Agent':'Mozilla/5.0 (compatible; HABLA-audit/0.2)'}

SITES=[
 # referencia previa
 ('MDN','https://developer.mozilla.org/es/docs/Web/HTML'),('Wikipedia','https://es.wikipedia.org/wiki/Inteligencia_artificial'),
 ('Stripe','https://stripe.com/es'),('Linear','https://linear.app'),('Gestclar','https://gestclar-site.vercel.app'),
 # España: banca/salud/retail/admin
 ('BBVA','https://www.bbva.es'),('Sanitas','https://www.sanitas.es'),('Mercadona','https://www.mercadona.es'),
 ('Zara','https://www.zara.com/es/'),('AEAT','https://sede.agenciatributaria.gob.es'),
 # SaaS español / fiscal
 ('Holded','https://www.holded.com/es'),('Factorial','https://factorialhr.es'),('TaxDown','https://taxdown.es'),
 ('Declarando','https://declarando.es'),('Infoautonomos','https://www.infoautonomos.com'),
 # global mix
 ('Notion','https://www.notion.so'),('GitHub','https://github.com'),('Vercel','https://vercel.com'),
 ('TheFork','https://www.thefork.es'),('Idealista','https://www.idealista.com'),
]

def get(url,timeout=12):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=timeout,context=ctx) as r:
            return r.status, r.read(1_500_000).decode('utf-8','ignore')
    except urllib.error.HTTPError as e: return e.code, ''
    except Exception as e: return 0, str(e)[:40]

def vis(html):
    h=re.sub(r'<script[\s\S]*?</script>','',html,flags=re.I)
    h=re.sub(r'<style[\s\S]*?</style>','',h,flags=re.I)
    h=re.sub(r'<[^>]+>',' ',h); h=re.sub(r'&\w+;',' ',h)
    return re.sub(r'\s+',' ',h).strip()

def analyze(item):
    name,url=item
    st,html=get(url)
    if st!=200: return {'name':name,'url':url,'http':st,'total':0,'grade':'MUDA (gate H)','H':0,'A':0,'B':0,'L':0,'X':0}
    txt=vis(html); T=len(txt)
    root=re.match(r'(https?://[^/]+)',url).group(1)
    llms,_b=get(root+'/llms.txt'); llms_ok = llms==200 and '<html' not in _b[:200].lower()
    rst,rob=get(root+'/robots.txt'); sm_st,_=get(root+'/sitemap.xml')
    ai_bots=[b for b in ['GPTBot','ClaudeBot','PerplexityBot','OAI-SearchBot','Google-Extended','CCBot'] if rst==200 and b.lower() in rob.lower()]
    # shell v2: contenido real presente, no solo longitud
    body=re.search(r'<body[\s\S]*',html) ; bodyhtml=body.group(0) if body else html
    root_shell=bool(re.search(r'<div[^>]+id=["\'](root|app|__next)["\'][^>]*>\s*</div>',bodyhtml))
    paras=len(re.findall(r'<p[\s>]',html,re.I))
    shell = root_shell and T<600
    h1=len(re.findall(r'<h1[\s>]',html,re.I)); heads=len(re.findall(r'<h[1-6][\s>]',html,re.I))
    sem=len(re.findall(r'<(article|main|nav|section|aside|header|footer)[\s>]',html,re.I))
    ld=len(re.findall(r'application/ld\+json',html)); ldt=list(dict.fromkeys(re.findall(r'"@type"\s*:\s*"([^"]+)"',html)))[:4]
    meta=bool(re.search(r'name=["\']description["\']',html,re.I))
    ratio=100*T/max(len(html),1)
    # citabilidad: números con contexto
    cites=len(re.findall(r'(\b20\d\d\b|\d+\s?%|\d+[.,]?\d*\s?€)',txt[:6000]))
    first=txt[:800].lower()
    answer=sum(k in first for k in ['€','precio','contact','teléfono','tel','servicio','gratis','años','clientes','desde'])
    phone=bool(re.search(r'\b\d{3}[\s.]?\d{2,3}[\s.]?\d{2,3}\b',txt)); euro='€' in txt
    # scores
    H=(50 if st==200 else 0)+(20 if rst==200 else 0)+(15 if sm_st==200 else 0)+(15 if ai_bots else 0)
    A=15 if shell else (100 if T>=3000 else 80 if T>=1200 else 55 if T>=400 else 20)
    B=(25 if h1==1 else 8 if h1>1 else 0)+(15 if heads>=5 else 5)+(20 if sem>=5 else 8 if sem>=2 else 0)+(30 if ld>=1 else 0)+(10 if meta else 0)
    L=(40 if ratio>=8 else 30 if ratio>=4 else 18 if ratio>=1.5 else 5)+min(30,cites*3)+min(30,answer*8)
    X=(60 if llms_ok else 0)+(25 if phone else 0)+(15 if euro else 0)
    total=round(H*.20+A*.25+B*.20+L*.25+X*.10)
    if H<50 or A<=20: total=min(total,39)
    grade='BILINGÜE' if total>=80 else 'CONVERSACIONAL' if total>=60 else 'BALBUCEA' if total>=40 else 'MUDA'
    return {'name':name,'http':st,'text':T,'ratio':round(ratio,1),'shell':shell,'ld':ldt,'llms':llms_ok,'ai_bots':len(ai_bots),
            'H':H,'A':A,'B':B,'L':L,'X':X,'total':total,'grade':grade}

with cf.ThreadPoolExecutor(8) as ex:
    res=list(ex.map(analyze,SITES))
res.sort(key=lambda r:-r['total'])
print(f"{'WEB':<14}{'HTTP':<6}{'TXT':<8}{'R%':<6}{'H':<4}{'A':<4}{'B':<4}{'L':<4}{'X':<4}{'TOT':<5}GRADE")
for r in res:
    print(f"{r['name']:<14}{r['http']:<6}{r.get('text','-'):<8}{r.get('ratio','-'):<6}{r['H']:<4}{r['A']:<4}{r['B']:<4}{r['L']:<4}{r['X']:<4}{r['total']:<5}{r['grade']}")
json.dump(res,open('habla_results.json','w'),ensure_ascii=False,indent=1)
