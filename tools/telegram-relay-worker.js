// Cloudflare Worker: Telegram Bot API'ye aracı. İstekleri olduğu gibi api.telegram.org'a iletir.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/bot')) return new Response('Lithos relay', { status: 200 });
    url.protocol = 'https:';
    url.hostname = 'api.telegram.org';
    url.port = '';
    return fetch(new Request(url, request));
  },
};
