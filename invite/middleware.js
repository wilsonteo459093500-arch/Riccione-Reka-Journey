/* ============================================================
   Vercel Routing Middleware —— 只做一件事：
   在 VISI 的网址（visi-riccione-reka.vercel.app，以及这个 Vercel 项目自己的
   预览网址 visi-riccione-reka-xxxx…vercel.app）打开首页「/」时，直接给 VISI。

   为什么不用 vercel.json 的 rewrites：首页有 index.html（邀请函），
   Vercel 会先给现成的档案、不会去看 rewrite。Middleware 在档案之前执行。
   其它网址（journey-riccione-reka.vercel.app、本地预览）首页照旧是邀请函。

   runtime 用 edge：仓库根目录的 package.json 是 "type": "module"，
   nodejs runtime 会把编译后的 middleware 当 ES module 载入而失败。
   不依赖任何套件：两个回应标头就是 @vercel/functions 的 rewrite() / next()。
   ============================================================ */
export const config = { matcher: '/', runtime: 'edge' };

export default function middleware(request) {
  var url = new URL(request.url);
  if (url.hostname.toLowerCase().indexOf('visi-riccione-reka') === 0) {
    return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/visi', url).toString() } });
  }
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
