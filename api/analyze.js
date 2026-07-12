// HABLA analyzer — Vercel serverless, sin dependencias
const AI_BOTS=['GPTBot','ClaudeBot','PerplexityBot','OAI-SearchBot','Google-Extended','CCBot'];
const UA='Mozilla/5.0 (compatible; HABLA-audit/1.0; +https://machineready.vercel.app)';

async function get(url,ms=10000){
  try{
    const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
    const r=await fetch(url,{headers:{'User-Agent':UA},signal:c.signal,redirect:'follow'});
    clearTimeout(t);
    const body=(await r.text()).slice(0,1_500_000);
    return {status:r.status,body};
  }catch(e){return {status:0,body:''}}
}
const vis=h=>h.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'')
  .replace(/<[^>]+>/g,' ').replace(/&\w+;/g,' ').replace(/\s+/g,' ').trim();

export async function analyze(url){
  if(!/^https?:\/\//.test(url)) url='https://'+url;
  const {status,body:html}=await get(url);
  if(status!==200) return {url,http:status,gateH:false,total:0,grade:'MUDA',
    detail:status===403?'La web bloquea user-agents desconocidos (403): invisible para agentes IA.':status===0?'No se pudo conectar.':`HTTP ${status}.`,
    scores:{H:0,A:0,B:0,L:0,X:0},checks:{},wins:[]};
  const txt=vis(html), T=txt.length;
  const root=url.match(/^https?:\/\/[^\/]+/)[0];
  const [llms,rob,sm]=await Promise.all([get(root+'/llms.txt',6000),get(root+'/robots.txt',6000),get(root+'/sitemap.xml',6000)]);
  const llmsOk=llms.status===200 && !/^\s*<(!doctype|html)/i.test(llms.body.slice(0,200));
  const aiBots=AI_BOTS.filter(b=>rob.status===200 && rob.body.toLowerCase().includes(b.toLowerCase()));
  const rootShell=/<div[^>]+id=["'](root|app|__next)["'][^>]*>\s*<\/div>/.test(html);
  const shell=rootShell && T<600;
  const h1=(html.match(/<h1[\s>]/gi)||[]).length;
  const heads=(html.match(/<h[1-6][\s>]/gi)||[]).length;
  const sem=(html.match(/<(article|main|nav|section|aside|header|footer)[\s>]/gi)||[]).length;
  const ld=(html.match(/application\/ld\+json/g)||[]).length;
  const ldTypes=[...new Set([...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m=>m[1]))].slice(0,4);
  const meta=/name=["']description["']/i.test(html);
  const ratio=100*T/Math.max(html.length,1);
  const cites=(txt.slice(0,6000).match(/(\b20\d\d\b|\d+\s?%|\d+[.,]?\d*\s?€)/g)||[]).length;
  const first=txt.slice(0,800).toLowerCase();
  const answer=['€','precio','contact','teléfono','tel','servicio','gratis','años','clientes','desde'].filter(k=>first.includes(k)).length;
  const phone=/\b\d{3}[\s.]?\d{2,3}[\s.]?\d{2,3}\b/.test(txt), euro=txt.includes('€');
  const H=50+(rob.status===200?20:0)+(sm.status===200?15:0)+(aiBots.length?15:0);
  const A=shell?15:(T>=3000?100:T>=1200?80:T>=400?55:20);
  const B=(h1===1?25:h1>1?8:0)+(heads>=5?15:5)+(sem>=5?20:sem>=2?8:0)+(ld>=1?30:0)+(meta?10:0);
  const L=(ratio>=8?40:ratio>=4?30:ratio>=1.5?18:5)+Math.min(30,cites*3)+Math.min(30,answer*8);
  const X=(llmsOk?60:0)+(phone?25:0)+(euro?15:0);
  let total=Math.round(H*.20+A*.25+B*.20+L*.25+X*.10);
  const gateA=A>20;
  if(H<50||!gateA) total=Math.min(total,39);
  const grade=total>=80?'BILINGÜE':total>=60?'CONVERSACIONAL':total>=40?'BALBUCEA':'MUDA';
  // quick wins ordenados
  const wins=[];
  if(!gateA) wins.push('CRÍTICO: tu contenido no está en el HTML inicial. Los crawlers IA no ejecutan JS: necesitas SSR o pre-render.');
  if(!aiBots.length) wins.push('robots.txt sin reglas para bots IA: decide qué permites (citación vs entrenamiento). 15 min.');
  if(!ld) wins.push('Sin datos estructurados JSON-LD (LocalBusiness/Product/FAQ): el mayor salto de clasificación. 1-2 h.');
  if(answer<3) wins.push('Tu primer bloque no responde qué/para quién/cuánto: reescribe con cifras fechadas. 2 h.');
  if(!llmsOk) wins.push('Sin llms.txt: párrafo de identidad + enlaces curados. Opcionalidad B2A a coste cero. 30 min.');
  if(ratio<2 && gateA) wins.push(`Solo el ${ratio.toFixed(1)}% de tu HTML es contenido: dieta de markup.`);
  if(h1!==1) wins.push(h1===0?'Falta el h1.':'Más de un h1: deja uno.');
  return {url,http:200,total,grade,gateH:true,gateA,
    scores:{H,A,B,L,X},
    checks:{text_chars:T,ratio:+ratio.toFixed(1),shell,h1,headings:heads,semantic:sem,jsonld:ld,ld_types:ldTypes,
      meta_desc:meta,llms_txt:llmsOk,robots_ai_bots:aiBots,cites,answerability:answer,phone,euro},
    wins:wins.slice(0,4)};
}

// ---- log comercial: cada análisis se guarda (insert-only via RLS) ----
const SB_URL='https://bcicjjkgjgajxbrwmeyf.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaWNqamtnamdhanhicndtZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU3ODIsImV4cCI6MjA4NDc2MTc4Mn0.BqgzIMTWvDIzbx1lofd7ZHYWt3FWjdpWc89kBaQGvrs';
async function logAnalysis(r){
  try{
    await fetch(SB_URL+'/rest/v1/habla_analyses',{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({url:r.url,http:r.http,total:r.total,grade:r.grade,
        scores:r.scores||null,checks:r.checks||null,wins:r.wins||null})
    });
  }catch(e){/* nunca bloquear la respuesta al usuario */}
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const url=(req.query&&req.query.url)||'';
  if(!url) return res.status(400).json({error:'Falta ?url='});
  try{
    const r=await analyze(url);
    await logAnalysis(r);
    res.status(200).json(r);
  }
  catch(e){ res.status(500).json({error:'Análisis fallido',detail:String(e).slice(0,120)}); }
}
