// Supabase Edge Function "nfce"
// Busca a página da nota fiscal (NFC-e) no site da Fazenda e devolve o HTML para o aplicativo.
// O navegador não deixa o app abrir o site da Fazenda direto (bloqueio de CORS); esta função faz a ponte.
// Segurança: só aceita endereços terminados em .gov.br e só responde a usuários logados (JWT do Supabase).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url } = await req.json();
    let u: URL;
    try { u = new URL(String(url)); } catch { return json({ error: 'endereço inválido' }, 400); }
    if (!/\.gov\.br$/i.test(u.hostname)) return json({ error: 'só endereços .gov.br' }, 400);
    u.protocol = 'https:';

    const r = await fetch(u.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    let charset = (r.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1];
    if (!charset) charset = new TextDecoder('latin1').decode(buf.slice(0, 4096)).match(/charset=["']?([\w-]+)/i)?.[1];
    let html: string;
    try { html = new TextDecoder(charset || 'utf-8').decode(buf); } catch { html = new TextDecoder('utf-8').decode(buf); }
    return json({ status: r.status, html });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
