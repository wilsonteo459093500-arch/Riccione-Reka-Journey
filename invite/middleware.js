/* ============================================================
   Vercel Routing Middleware —— 只做一件事：
   在 visi-riccione-reka.vercel.app 打开首页「/」时，直接给 VISI。

   为什么不用 vercel.json 的 rewrites：首页有 index.html（邀请函），
   Vercel 会先给现成的档案、不会去看 rewrite。Middleware 在档案之前执行。
   其它网址（journey-riccione-reka.vercel.app、本地预览）首页照旧是邀请函。
   不依赖任何套件：两个回应标头就是 @vercel/functions 的 rewrite() / next()。
   ============================================================ */
export const config = { matcher: '/' };

var VISI_HOST = 'visi-riccione-reka.vercel.app';

export default function middleware(request) {
  var url = new URL(request.url);
  if (url.hostname.toLowerCase() === VISI_HOST) {
    return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/visi', url).toString() } });
  }
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
