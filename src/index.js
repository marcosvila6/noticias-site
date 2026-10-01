export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/db-test") {
      const result = await env.DB
        .prepare("SELECT COUNT(*) AS total FROM noticias")
        .first();

      return Response.json({
        ok: true,
        noticias: result.total
      });
    }

    return env.ASSETS.fetch(request);
  }
};
