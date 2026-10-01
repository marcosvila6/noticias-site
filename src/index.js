export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test") {
      return Response.json({
        ok: true,
        mensagem: "Worker funcionando"
      });
    }

    return env.ASSETS.fetch(request);
  }
};
