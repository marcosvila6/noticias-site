export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)"
      ).run();

      if (url.pathname === "/api/db-test") {
        const result = await env.DB
          .prepare("SELECT COUNT(*) AS total FROM noticias")
          .first();

        return json({ ok: true, noticias: result.total });
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        const { senha } = await request.json();

        if (senha !== SENHA) {
          return json({ ok: false, erro: "Senha incorreta" }, 401);
        }

        const token = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO sessoes(token) VALUES(?)"
        ).bind(token).run();

        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `admin=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`
          }
        });
      }

      if (url.pathname === "/api/publicar" && request.method === "POST") {
        if (!await autenticado(request, env)) {
          return json({ ok: false, erro: "Não autorizado" }, 401);
        }

        const dados = await request.json();

        const titulo = (dados.titulo || "").trim();
        const texto = (dados.texto || "").trim();
        const imagem = (dados.imagem || "").trim();
        const anuncio = (dados.anuncio || "").trim();

        if (!titulo || !texto) {
          return json({
            ok: false,
            erro: "Preencha título e texto"
          }, 400);
        }

        let slugAtual = slug(titulo);
        let numero = 2;

        while (
          await env.DB
            .prepare("SELECT id FROM noticias WHERE slug=?")
            .bind(slugAtual)
            .first()
        ) {
          slugAtual = slug(titulo) + "-" + numero++;
        }

        await env.DB.prepare(`
          INSERT INTO noticias
          (titulo, texto, imagem, anuncio, slug)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          titulo,
          texto,
          imagem,
          anuncio,
          slugAtual
        ).run();

        return json({
          ok: true,
          url: "/n/" + slugAtual
        });
      }

      if (url.pathname.startsWith("/n/")) {
        const slugNoticia = decodeURIComponent(
          url.pathname.slice(3)
        );

        const noticia = await env.DB
          .prepare("SELECT * FROM noticias WHERE slug=?")
          .bind(slugNoticia)
          .first();

        if (!noticia) {
          return html(pagina(
            "Não encontrada",
            "<h1>Notícia não encontrada</h1>"
          ), 404);
        }

        return html(pagina(
          noticia.titulo,
          `
          <h1>${esc(noticia.titulo)}</h1>

          ${
            noticia.imagem
              ? `<img src="${esc(noticia.imagem)}">`
              : ""
          }

          <div class="texto">
            ${esc(noticia.texto)}
          </div>

          ${
            noticia.anuncio
              ? `<div class="anuncio">${noticia.anuncio}</div>`
              : ""
          }
          `
        ));
      }

      if (url.pathname === "/admin") {
        return html(admin());
      }

      return html(home());

    } catch (erro) {
      return json({
        ok: false,
        erro: erro.message
      }, 500);
    }
  }
};

const SENHA = "28b15632357bcb1e480aa7569221e16ed3adf10ba60ec86589becfc98dfd38d9";

function slug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "noticia";
}

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[caractere]));
}

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function html(conteudo, status = 200) {
  return new Response(conteudo, {
    status,
    headers: {
      "Content-Type": "text/html;charset=utf-8"
    }
  });
}

function pagina(titulo, conteudo) {
  return `
  <!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)}</title>

    <style>
      body {
        font-family: Arial;
        max-width: 760px;
        margin: auto;
        padding: 20px;
      }

      input, textarea {
        width: 100%;
        padding: 12px;
        margin: 6px 0 14px;
        box-sizing: border-box;
      }

      textarea {
        height: 220px;
      }

      button {
        padding: 12px 20px;
        background: #111;
        color: white;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
      }

      img {
        max-width: 100%;
      }

      .texto {
        white-space: pre-wrap;
        font-size: 18px;
        line-height: 1.6;
      }

      .anuncio {
        margin: 25px 0;
        text-align: center;
      }
    </style>
  </head>

  <body>
    ${conteudo}
  </body>
  </html>
  `;
}

function home() {
  return pagina(
    "Notícias",
    `
    <h1>Notícias</h1>
    <p>Site funcionando.</p>
    `
  );
}

function admin() {
  return pagina(
    "Painel",
    `
    <h1>Painel de Notícias</h1>

    <div id="login">
      <input id="senha" type="password" placeholder="Senha">
      <button onclick="entrar()">ENTRAR</button>
    </div>

    <div id="formulario" style="display:none">

      <input id="titulo" placeholder="Título">

      <textarea id="texto"
        placeholder="Texto da notícia"></textarea>

      <input id="imagem"
        placeholder="URL da imagem">

      <textarea id="anuncio"
        placeholder="Código do anúncio"></textarea>

      <button onclick="publicar()">
        PUBLICAR
      </button>

      <p id="mensagem"></p>

    </div>

    <script>

      async function entrar() {

        const resposta = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            senha: document.getElementById("senha").value
          })
        });

        const dados = await resposta.json();

        if (dados.ok) {
          document.getElementById("login").style.display = "none";
          document.getElementById("formulario").style.display = "block";
        } else {
          document.getElementById("mensagem").textContent =
            dados.erro;
        }
      }

      async function publicar() {

        const resposta = await fetch("/api/publicar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            titulo: document.getElementById("titulo").value,
            texto: document.getElementById("texto").value,
            imagem: document.getElementById("imagem").value,
            anuncio: document.getElementById("anuncio").value
          })
        });

        const dados = await resposta.json();

        if (dados.ok) {
          document.getElementById("mensagem").innerHTML =
            "PUBLICADO!<br><a href='" +
            dados.url +
            "' target='_blank'>" +
            location.origin + dados.url +
            "</a>";
        } else {
          document.getElementById("mensagem").textContent =
            dados.erro;
        }
      }

    </script>
    `
  );
}

function cookie(request) {
  const cookies = request.headers.get("Cookie") || "";

  const item = cookies
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("admin="));

  return item ? item.slice(6) : "";
}

async function autenticado(request, env) {

  const token = cookie(request);

  if (!token) return false;

  const resultado = await env.DB
    .prepare("SELECT token FROM sessoes WHERE token=?")
    .bind(token)
    .first();

  return !!resultado;
}
