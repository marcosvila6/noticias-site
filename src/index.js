const ADMIN_PASSWORD = "28b15632357bcb1e480aa7569221e16ed3adf10ba60ec86589becfc98dfd38d9";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS sessoes (
          token TEXT PRIMARY KEY,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      if (url.pathname === "/api/login" && request.method === "POST") {
        const body = await request.json();
        if (body.senha !== ADMIN_PASSWORD) {
          return json({ ok: false, erro: "Senha incorreta." }, 401);
        }

        const token = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sessoes (token) VALUES (?)"
        ).bind(token).run();

        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `admin=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
          }
        });
      }

      if (url.pathname === "/api/publicar" && request.method === "POST") {
        if (!(await isAdmin(request, env))) {
          return json({ ok: false, erro: "Não autorizado." }, 401);
        }

        const body = await request.json();
        const titulo = String(body.titulo || "").trim();
        const texto = String(body.texto || "").trim();
        const imagem = String(body.imagem || "").trim();
        const anuncio = String(body.anuncio || "").trim();

        if (!titulo || !texto) {
          return json({ ok: false, erro: "Título e texto são obrigatórios." }, 400);
        }

        let slugBase = makeSlug(titulo) || "noticia";
        let slug = slugBase;
        let n = 2;

        while (await env.DB.prepare(
          "SELECT id FROM noticias WHERE slug = ?"
        ).bind(slug).first()) {
          slug = `${slugBase}-${n++}`;
        }

        await env.DB.prepare(`
          INSERT INTO noticias (titulo, texto, imagem, anuncio, slug)
          VALUES (?, ?, ?, ?, ?)
        `).bind(titulo, texto, imagem, anuncio, slug).run();

        return json({
          ok: true,
          slug,
          url: `${url.origin}/n/${slug}`
        });
      }

      if (url.pathname === "/api/db-test") {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM noticias"
        ).first();
        return json({ ok: true, noticias: result.total });
      }

      if (url.pathname === "/admin") {
        return html(adminPage());
      }

      if (url.pathname.startsWith("/n/")) {
        const slug = decodeURIComponent(url.pathname.slice(3));
        const noticia = await env.DB.prepare(
          "SELECT titulo, texto, imagem, anuncio, criado_em FROM noticias WHERE slug = ?"
        ).bind(slug).first();

        if (!noticia) {
          return html(layout("Notícia não encontrada", `
            <main class="container">
              <h1>Notícia não encontrada</h1>
              <p>O endereço pode estar incorreto ou a notícia foi removida.</p>
            </main>
          `), 404);
        }

        return html(layout(noticia.titulo, `
          <article class="news">
            <h1>${esc(noticia.titulo)}</h1>
            ${noticia.imagem ? `<img class="hero" src="${escAttr(noticia.imagem)}" alt="">` : ""}
            <div class="text">${esc(noticia.texto)}</div>
            ${noticia.anuncio ? `<div class="ad">${noticia.anuncio}</div>` : ""}
          </article>
        `));
      }

      return html(layout("Notícias", `
        <main class="container home">
          <h1>Notícias</h1>
          <p>Site funcionando.</p>
        </main>
      `));
    } catch (e) {
      return json({ ok: false, erro: e?.message || "Erro interno." }, 500);
    }
  }
};

async function isAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)admin=([^;]+)/);
  if (!match) return false;

  const row = await env.DB.prepare(
    "SELECT token FROM sessoes WHERE token = ?"
  ).bind(match[1]).first();

  return !!row;
}

function makeSlug(value) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));
}

function escAttr(value) {
  return esc(value);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function layout(title, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f5f6f8;color:#15171a;font-family:Arial,Helvetica,sans-serif}
.container{max-width:820px;margin:0 auto;padding:28px 18px}
.news{max-width:820px;margin:0 auto;padding:28px 18px;background:#fff;min-height:100vh}
h1{font-size:38px;line-height:1.12;margin:0 0 24px}
.hero{display:block;width:100%;height:auto;max-height:650px;object-fit:cover;margin:0 0 26px;border-radius:10px}
.text{font-size:20px;line-height:1.65;white-space:pre-wrap}
.ad{margin:32px 0;text-align:center}
.home{background:#fff;min-height:100vh}
.card{background:#fff;padding:28px;border-radius:14px;box-shadow:0 4px 24px #00000012}
label{display:block;font-weight:700;margin:16px 0 7px}
input,textarea{width:100%;padding:13px;border:1px solid #cfd3d8;border-radius:8px;font-size:16px}
textarea{min-height:190px;resize:vertical}
button{margin-top:18px;padding:13px 22px;border:0;border-radius:8px;background:#111;color:#fff;font-weight:700;font-size:16px;cursor:pointer}
#msg{margin-top:18px;font-weight:700;word-break:break-word}
a{color:#06c}
@media(max-width:600px){h1{font-size:30px}.text{font-size:18px}.container,.news{padding:20px 14px}}
</style>
</head>
<body>${body}</body>
</html>`;
}

function adminPage() {
  return layout("Painel de Notícias", `
<main class="container">
<div class="card">
<h1>Painel de Notícias</h1>

<section id="login">
<label>Senha</label>
<input id="senha" type="password" autocomplete="current-password">
<button onclick="login()">ENTRAR</button>
</section>

<section id="editor" style="display:none">
<label>Título</label>
<input id="titulo" placeholder="Título da notícia">

<label>Texto da notícia</label>
<textarea id="texto" placeholder="Digite a notícia"></textarea>

<label>URL da imagem</label>
<input id="imagem" placeholder="https://...">

<label>Código do anúncio</label>
<textarea id="anuncio" placeholder="Cole aqui o código do anúncio"></textarea>

<button onclick="publicar()">PUBLICAR</button>
<div id="msg"></div>
</section>
</div>
</main>

<script>
async function login(){
  const r=await fetch("/api/login",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({senha:document.getElementById("senha").value})
  });
  const d=await r.json();
  if(d.ok){
    document.getElementById("login").style.display="none";
    document.getElementById("editor").style.display="block";
  }else{
    document.getElementById("msg").textContent=d.erro||"Erro";
  }
}

async function publicar(){
  const msg=document.getElementById("msg");
  msg.textContent="Publicando...";
  const r=await fetch("/api/publicar",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      titulo:document.getElementById("titulo").value,
      texto:document.getElementById("texto").value,
      imagem:document.getElementById("imagem").value,
      anuncio:document.getElementById("anuncio").value
    })
  });
  const d=await r.json();
  if(d.ok){
    msg.innerHTML='PUBLICADO!<br><a href="'+d.url+'" target="_blank">'+d.url+'</a>';
  }else{
    msg.textContent=d.erro||"Erro ao publicar.";
  }
}
</script>
`);
}
