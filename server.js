import http from "node:http";
import crypto from "node:crypto";

/* ───────────── CONFIG ───────────── */
const PORT = process.env.PORT || 3000;
const SCRIPT_URL =
  process.env.SCRIPT_URL ||
  "";

const CACHE_TTL_MS = 60_000;          // script cache (gist down ho to bhi chalega)
const RATE_LIMIT = 30;                // requests per window per IP on /load
const RATE_WINDOW_MS = 60_000;
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // /admin/stats?key=XXXX
const STARTED = Date.now();

/* ───────────── STATE ───────────── */
const stats = { loads: 0, blocked: 0, rateLimited: 0, pageViews: 0, lastLoad: null };
let cache = { body: null, etag: null, at: 0 };
const hits = new Map();

/* ───────────── HELPERS ───────────── */
const getIP = (req) =>
  (req.headers["cf-connecting-ip"] ||
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown");

function rateLimited(ip) {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.reset) {
    hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  e.count++;
  return e.count > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, 60_000).unref();

// Browser se aaya hai ya executor se? (sirf deterrence, real security nahi)
function looksLikeBrowser(req) {
  const h = req.headers;
  if (h["sec-fetch-mode"] === "navigate" || h["sec-fetch-dest"] === "document") return true;
  const accept = h.accept || "";
  const ua = h["user-agent"] || "";
  return accept.includes("text/html") && /Mozilla\/5\.0/.test(ua) && /(Chrome|Safari|Firefox|Edg)/.test(ua);
}

async function getScript() {
  const now = Date.now();
  if (cache.body && now - cache.at < CACHE_TTL_MS) return cache;
  try {
    const r = await fetch(SCRIPT_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("Upstream " + r.status);
    const body = await r.text();
    const etag = '"' + crypto.createHash("sha1").update(body).digest("hex").slice(0, 16) + '"';
    cache = { body, etag, at: now };
    return cache;
  } catch (err) {
    if (cache.body) return cache; // stale-on-error
    throw err;
  }
}

function secHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    ...extra,
  };
}

/* ───────────── PAGE ───────────── */
function renderPage(nonce) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#050505">
<meta name="robots" content="noindex,nofollow">
<title>EGO EMPIRE | PROTECTOR V4</title>
<style nonce="${nonce}">
:root{--gold:#ffdb78;--gold2:#d9b75d;--gold3:#a97920;--bg:#050505}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;min-height:100vh;background:var(--bg);color:#fff;font-family:Inter,system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:center;overflow-x:hidden;padding:25px}
body:before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse at 50% 10%,#8c641b40,transparent 55%),radial-gradient(ellipse at 85% 95%,#6b3b0f30,transparent 50%);pointer-events:none}
#fx{position:fixed;inset:0;pointer-events:none}
.wrap{perspective:1200px;width:min(620px,100%);position:relative;z-index:2}
.card{position:relative;padding:44px 30px 34px;border-radius:28px;text-align:center;background:linear-gradient(145deg,#211909cc,#090909f0 55%,#1d1608cc);backdrop-filter:blur(20px);box-shadow:0 0 80px #d69e2522,inset 0 0 40px #e5b33b0d;transition:transform .15s ease-out;animation:appear 1s ease both;transform-style:preserve-3d}
.card:before{content:"";position:absolute;inset:0;border-radius:28px;padding:1.5px;background:conic-gradient(from var(--a,0deg),#ffd76b,#2a1d07,#ffd76b,#2a1d07,#ffd76b);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:spin 6s linear infinite;pointer-events:none}
@property --a{syntax:"<angle>";initial-value:0deg;inherits:false}
@keyframes spin{to{--a:360deg}}
@keyframes appear{from{opacity:0;transform:translateY(28px) scale(.96)}to{opacity:1;transform:none}}
.logo{width:92px;height:92px;margin:0 auto 20px;border:2px solid #e9bd51;border-radius:26px;display:grid;place-items:center;color:var(--gold);font-size:34px;font-weight:900;letter-spacing:-4px;box-shadow:0 0 30px #e6b33c55,inset 0 0 22px #e6b33c20;transform:rotate(-5deg);animation:float 4s ease-in-out infinite}
@keyframes float{50%{transform:rotate(-5deg) translateY(-8px)}}
h1{margin:0;font-size:clamp(32px,8vw,50px);letter-spacing:4px;background:linear-gradient(90deg,#b98a2c,#fff0b0,#d9a73c,#fff0b0,#b98a2c);background-size:250% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shine 4s linear infinite;filter:drop-shadow(0 0 18px #d99d3680)}
@keyframes shine{to{background-position:250% center}}
h2{margin:8px 0 22px;font-size:14px;letter-spacing:8px;color:var(--gold2)}
.tag{color:#f5d88c;font-size:13px;line-height:2;margin:6px 0}
.tag.second{color:#d7bd7e;font-size:12px}
.line{height:1px;background:linear-gradient(90deg,transparent,#d5a73f,transparent);margin:24px 0}
.status{display:inline-flex;align-items:center;gap:9px;border:1px solid #b9913e70;color:#f5d88c;border-radius:30px;padding:8px 16px;font-size:11px;letter-spacing:2px;margin-bottom:18px;background:#0006}
.dot{width:8px;height:8px;border-radius:50%;background:#555;box-shadow:0 0 0 0 #0000}
.dot.on{background:#46e08a;animation:pulse 1.8s infinite}
.dot.off{background:#ff5b5b}
@keyframes pulse{0%{box-shadow:0 0 0 0 #46e08a99}100%{box-shadow:0 0 0 10px #46e08a00}}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
.stat{border:1px solid #a9823955;border-radius:14px;padding:12px 6px;background:#0a0a0acc}
.stat b{display:block;font-size:20px;color:var(--gold);letter-spacing:1px}
.stat span{font-size:9px;letter-spacing:2px;color:#a89260}
.codebox{position:relative;background:#050505;border:1px solid #a9823970;border-radius:14px;padding:16px;text-align:left;overflow-wrap:anywhere;color:#f0d38a;font:12px/1.8 ui-monospace,Menlo,Consolas,monospace;user-select:all}
.codebox:after{content:"LUA";position:absolute;top:8px;right:12px;font-size:9px;letter-spacing:2px;color:#7d6733}
button{margin-top:16px;width:100%;border:0;border-radius:13px;padding:16px;background:linear-gradient(100deg,#a97920,#f5d477,#b58224);background-size:200% auto;color:#171006;font-weight:900;letter-spacing:2px;font-size:13px;cursor:pointer;box-shadow:0 5px 25px #d8a33140;transition:.25s;position:relative;overflow:hidden}
button:hover{transform:translateY(-2px);background-position:right center;filter:brightness(1.1)}
button:active{transform:scale(.98)}
button.ok{background:linear-gradient(100deg,#1f9d5a,#5ff0a2)}
.steps{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:20px;font-size:10px;letter-spacing:1px;color:#b59b5c}
.steps i{font-style:normal;border:1px solid #a9823955;border-radius:20px;padding:6px 11px;background:#0008}
.note{font-size:10px;color:#99845b;margin-top:20px;letter-spacing:1px}
#toast{position:fixed;left:50%;bottom:30px;transform:translate(-50%,120px);background:#17120a;border:1px solid #d6a83d;color:#ffe08a;padding:12px 20px;border-radius:12px;font-size:12px;letter-spacing:1px;transition:.4s;z-index:9;box-shadow:0 0 30px #d6a83d40}
#toast.show{transform:translate(-50%,0)}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<canvas id="fx"></canvas>
<div class="wrap">
<main class="card" id="card">
<div class="logo">EE</div>
<h1>EGO EMPIRE</h1>
<h2>PROTECTOR V4</h2>
<div class="tag">🇦🇱 13_Pᴀʀᴛʜ Pᴀᴘᴀ Jɪ Oɴ Tᴏᴘ — 🇦🇱</div>
<div class="tag second">🇦🇱 Pᴀᴘᴀ Kɪ Sᴄʀɪ𝒑ᴛ Cʜᴏʀɪ Nʜɪ Kʀ Sᴀᴋᴛᴀ Bᴇᴛᴇ 🇦🇱</div>
<div class="line"></div>
<div class="status"><span class="dot" id="dot"></span><span id="stext">CHECKING SERVER…</span></div>
<div class="stats">
<div class="stat"><b id="s-loads">0</b><span>TOTAL LOADS</span></div>
<div class="stat"><b id="s-up">0m</b><span>UPTIME</span></div>
<div class="stat"><b id="s-ping">--</b><span>PING</span></div>
</div>
<div class="codebox" id="loadstring"></div>
<button id="copy">✦ COPY LOADSTRING ✦</button>
<div class="steps"><i>1 · COPY</i><i>2 · PASTE IN EXECUTOR</i><i>3 · EXECUTE</i></div>
<div class="note">EGO EMPIRE • V4 EDITION • PROTECTED</div>
</main>
</div>
<div id="toast"></div>
<script nonce="${nonce}">
(function(){
 /* ── particles ── */
 var c=document.getElementById("fx"),x=c.getContext("2d"),W,H,P=[];
 function rs(){W=c.width=innerWidth;H=c.height=innerHeight}
 rs();addEventListener("resize",rs);
 var glyphs=["✿","❀","✦","✧"];
 for(var i=0;i<45;i++)P.push({x:Math.random()*W,y:Math.random()*H,s:8+Math.random()*14,v:.3+Math.random()*1,d:(Math.random()-.5)*.6,r:Math.random()*6,g:glyphs[i%4],a:.25+Math.random()*.6});
 function draw(){
  x.clearRect(0,0,W,H);
  for(var i=0;i<P.length;i++){var p=P[i];
   p.y+=p.v;p.x+=p.d+Math.sin(p.y/60)*.4;p.r+=.01;
   if(p.y>H+30){p.y=-30;p.x=Math.random()*W}
   x.save();x.translate(p.x,p.y);x.rotate(p.r);x.globalAlpha=p.a;
   x.fillStyle="#ffd45c";x.shadowColor="#ffbf35";x.shadowBlur=12;
   x.font=p.s+"px serif";x.fillText(p.g,0,0);x.restore();
  }
  requestAnimationFrame(draw);
 }
 draw();

 /* ── 3D tilt ── */
 var card=document.getElementById("card");
 if(matchMedia("(hover:hover)").matches){
  addEventListener("mousemove",function(e){
   var rx=(e.clientY/innerHeight-.5)*-7,ry=(e.clientX/innerWidth-.5)*9;
   card.style.transform="rotateX("+rx+"deg) rotateY("+ry+"deg)";
  });
  addEventListener("mouseleave",function(){card.style.transform=""});
 }

 /* ── loadstring + copy ── */
 var loadstring='loadstring(game:HttpGet("'+location.origin+'/load"))()';
 document.getElementById("loadstring").textContent=loadstring;
 var toast=document.getElementById("toast"),tt;
 function say(m){toast.textContent=m;toast.classList.add("show");clearTimeout(tt);tt=setTimeout(function(){toast.classList.remove("show")},2200)}
 var btn=document.getElementById("copy");
 async function copy(){
  try{await navigator.clipboard.writeText(loadstring)}
  catch(e){
   var t=document.createElement("textarea");t.value=loadstring;document.body.appendChild(t);t.select();
   try{document.execCommand("copy")}catch(_){say("COPY FAILED — SELECT TEXT MANUALLY");t.remove();return}
   t.remove();
  }
  btn.textContent="✓ COPIED SUCCESSFULLY";btn.classList.add("ok");say("✦ LOADSTRING COPIED ✦");
  setTimeout(function(){btn.textContent="✦ COPY LOADSTRING ✦";btn.classList.remove("ok")},2200);
 }
 btn.addEventListener("click",copy);

 /* ── live stats ── */
 function fmt(ms){var m=Math.floor(ms/60000);if(m<60)return m+"m";var h=Math.floor(m/60);return h<24?h+"h "+(m%60)+"m":Math.floor(h/24)+"d "+(h%24)+"h"}
 async function poll(){
  var dot=document.getElementById("dot"),st=document.getElementById("stext");
  var t0=performance.now();
  try{
   var r=await fetch("/api/status",{cache:"no-store"});
   var d=await r.json();
   document.getElementById("s-loads").textContent=d.loads.toLocaleString();
   document.getElementById("s-up").textContent=fmt(d.uptime);
   document.getElementById("s-ping").textContent=Math.round(performance.now()-t0)+"ms";
   dot.className="dot "+(d.scriptOnline?"on":"off");
   st.textContent=d.scriptOnline?"SCRIPT ONLINE • PROTECTED":"SCRIPT OFFLINE";
  }catch(e){dot.className="dot off";st.textContent="SERVER OFFLINE"}
 }
 poll();setInterval(poll,15000);
})();
</script>
</body>
</html>`;
}

/* ───────────── SERVER ───────────── */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    const ip = getIP(req);

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, secHeaders({ Allow: "GET, HEAD", "Content-Type": "text/plain" }));
      return res.end("Method not allowed");
    }

    const browser = looksLikeBrowser(req);

    // Landing page
    if (path === "/" && browser) {
      stats.pageViews++;
      const nonce = crypto.randomBytes(16).toString("base64");
      res.writeHead(
        200,
        secHeaders({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        })
      );
      return res.end(renderPage(nonce));
    }

    // Public status (page ke liye)
    if (path === "/api/status") {
      res.writeHead(200, secHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store" }));
      return res.end(
        JSON.stringify({
          loads: stats.loads,
          uptime: Date.now() - STARTED,
          scriptOnline: !!cache.body && Date.now() - cache.at < CACHE_TTL_MS * 5 ? true : await probe(),
        })
      );
    }

    // Health check (Render/Railway ke liye)
    if (path === "/health") {
      res.writeHead(200, secHeaders({ "Content-Type": "text/plain" }));
      return res.end("ok");
    }

    // Admin stats (ADMIN_KEY set ho tabhi)
    if (path === "/admin/stats") {
      const ok =
        ADMIN_KEY &&
        url.searchParams.get("key") &&
        crypto.timingSafeEqual(
          Buffer.from(crypto.createHash("sha256").update(url.searchParams.get("key")).digest("hex")),
          Buffer.from(crypto.createHash("sha256").update(ADMIN_KEY).digest("hex"))
        );
      if (!ok) {
        res.writeHead(404, secHeaders({ "Content-Type": "text/plain" }));
        return res.end("Not found");
      }
      res.writeHead(200, secHeaders({ "Content-Type": "application/json" }));
      return res.end(JSON.stringify({ ...stats, uptime: Date.now() - STARTED, cacheAgeMs: Date.now() - cache.at }, null, 2));
    }

    // Script delivery
    if (path === "/load" || path === "/") {
      if (rateLimited(ip)) {
        stats.rateLimited++;
        res.writeHead(429, secHeaders({ "Content-Type": "text/plain", "Retry-After": "60" }));
        return res.end("-- Too many requests. Slow down.");
      }

      // Browser se /load khola to script nahi dikhega
      if (browser) {
        stats.blocked++;
        res.writeHead(403, secHeaders({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }));
        return res.end("-- EGO EMPIRE PROTECTOR V4\n-- Access denied. Use an executor.");
      }

      let data;
      try {
        data = await getScript();
      } catch {
        res.writeHead(502, secHeaders({ "Content-Type": "text/plain" }));
        return res.end('warn("EGO EMPIRE: unable to fetch script source, try again later.")');
      }

      stats.loads++;
      stats.lastLoad = new Date().toISOString();

      if (req.headers["if-none-match"] === data.etag) {
        res.writeHead(304, secHeaders({ ETag: data.etag }));
        return res.end();
      }

      res.writeHead(
        200,
        secHeaders({
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          ETag: data.etag,
        })
      );
      return res.end(req.method === "HEAD" ? undefined : data.body);
    }

    res.writeHead(404, secHeaders({ "Content-Type": "text/plain" }));
    res.end("Not found");
  } catch (error) {
    console.error(error);
    res.writeHead(500, secHeaders({ "Content-Type": "text/plain" }));
    res.end("Server error");
  }
});

async function probe() {
  try {
    await getScript();
    return true;
  } catch {
    return false;
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("EGO EMPIRE PROTECTOR V4 running on port " + PORT);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
