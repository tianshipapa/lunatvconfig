// ---------------------- 改造后的 _worker (zj).js ----------------------
export default {
  async fetch(request, env, ctx) {
    /* ========== 1. 决定远程 JSON 地址 ========== */
    const DEFAULT_JSON_SOURCES = {
      jin18:
        'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json',
      jingjian:
        'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json',
      full:
        'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json',
    };

    // 环境变量 U 优先
    let jsonUrl = (env.U || '').trim();
    if (!jsonUrl) {
      // 没配 U 就走 source 参数
      const reqUrl = new URL(request.url);
      const source = reqUrl.searchParams.get('source'); // 与 (d).js 保持一致
      jsonUrl = DEFAULT_JSON_SOURCES[source] || DEFAULT_JSON_SOURCES.full;
    }

    /* ========== 2. 工具函数（从 (d).js 完整迁移） ========== */
    const BASE58_ALPHABET =
      '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function base58Encode(obj) {
      const str = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(str);
      let intVal = 0n;
      for (const b of bytes) intVal = (intVal << 8n) + BigInt(b);
      let result = '';
      while (intVal > 0n) {
        const mod = intVal % 58n;
        result = BASE58_ALPHABET[Number(mod)] + result;
        intVal = intVal / 58n;
      }
      // 处理前导 0
      for (const b of bytes) {
        if (b === 0) result = BASE58_ALPHABET[0] + result;
        else break;
      }
      return result;
    }

    function addOrReplacePrefix(obj, newPrefix) {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj))
        return obj.map((item) => addOrReplacePrefix(item, newPrefix));
      const newObj = {};
      for (const key in obj) {
        if (key === 'api' && typeof obj[key] === 'string') {
          let apiUrl = obj[key];
          const urlIndex = apiUrl.indexOf('?url=');
          if (urlIndex !== -1) apiUrl = apiUrl.slice(urlIndex + 5);
          if (!apiUrl.startsWith(newPrefix)) apiUrl = newPrefix + apiUrl;
          newObj[key] = apiUrl;
        } else {
          newObj[key] = addOrReplacePrefix(obj[key], newPrefix);
        }
      }
      return newObj;
    }

    /* ========== 3. CORS 通用头 ========== */
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });

    const reqUrl = new URL(request.url);
    const targetUrlParam = reqUrl.searchParams.get('url');
    const configParam = reqUrl.searchParams.get('config'); // 0 原始  1 加前缀
    const prefixParam = reqUrl.searchParams.get('prefix');
    const encodeParam = reqUrl.searchParams.get('encode'); // base58
    const currentOrigin = reqUrl.origin;
    const defaultPrefix = currentOrigin + '/?url=';

    /* ========== 4. 代理任意 URL（与 (d).js 相同） ========== */
    if (targetUrlParam) {
      let fullTargetUrl = targetUrlParam;
      const urlMatch = request.url.match(/[?&]url=([^&]+(?:&.*)?)/);
      if (urlMatch) fullTargetUrl = decodeURIComponent(urlMatch[1]);

      let targetURL;
      try {
        targetURL = new URL(fullTargetUrl);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid URL', url: fullTargetUrl }, null, 2),
          { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders } }
        );
      }

      try {
        const proxyRequest = new Request(targetURL.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.arrayBuffer()
            : undefined,
        });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s
        const response = await fetch(proxyRequest, { signal: controller.signal });
        clearTimeout(timeoutId);

        const responseHeaders = new Headers(corsHeaders);
        const exclude = [
          'content-encoding',
          'content-length',
          'transfer-encoding',
          'connection',
          'keep-alive',
          'set-cookie',
          'set-cookie2',
        ];
        for (const [k, v] of response.headers) {
          if (!exclude.includes(k.toLowerCase())) responseHeaders.set(k, v);
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      } catch (err) {
        return new Response(
          JSON.stringify(
            {
              error: 'Proxy Error',
              message: err.message || '代理请求失败',
              target: fullTargetUrl,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders } }
        );
      }
    }

    /* ========== 5. JSON 配置接口 ========== */
    if (configParam === '1') {
      try {
        const data = await (await fetch(jsonUrl)).json();
        const newData = addOrReplacePrefix(data, prefixParam || defaultPrefix);
        if (encodeParam === 'base58') {
          return new Response(base58Encode(newData), {
            headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...corsHeaders },
          });
        } else {
          return new Response(JSON.stringify(newData), {
            headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders },
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders },
        });
      }
    }

    if (configParam === '0') {
      try {
        const data = await (await fetch(jsonUrl)).json();
        if (encodeParam === 'base58') {
          return new Response(base58Encode(data), {
            headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...corsHeaders },
          });
        } else {
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders },
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders },
        });
      }
    }

    /* ========== 6. 首页说明 ========== */
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API 中转代理服务</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:800px;margin:50px auto;padding:20px;line-height:1.6}
h1{color:#333}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:14px}
pre{background:#f4f4f4;padding:15px;border-radius:5px;overflow-x:auto}
.example{background:#e8f5e9;padding:15px;border-left:4px solid #4caf50;margin:20px 0}
.section{background:#f9f9f9;padding:15px;border-radius:5px;margin:15px 0}
table{width:100%;border-collapse:collapse;margin:15px 0}
table td{padding:8px;border:1px solid #ddd}
table td:first-child{background:#f5f5f5;font-weight:bold;width:30%}
</style>
</head>
<body>
<h1>🔄 API 中转代理服务</h1>
<p>通用 API 中转代理，用于访问被墙或限制的接口。</p>

<h2>使用方法</h2>
<p>中转任意 API：在请求 URL 后添加 <code>?url=目标地址</code> 参数</p>
<pre>${defaultPrefix}https://example.com/api</pre>

<h2>配置订阅参数说明</h2>
<div class="section">
<table>
<tr><td>config</td><td><code>0</code> = 原始 JSON<br><code>1</code> = 添加代理前缀</td></tr>
<tr><td>encode</td><td>留空 = 原始 JSON<br><code>base58</code> = Base58 编码输出</td></tr>
<tr><td>prefix</td><td>自定义代理前缀（仅在 config=1 时生效）</td></tr>
<tr><td>source</td><td><code>jin18</code> = 精简版<br><code>jingjian</code> = 精简版+成人<br><code>full</code> = 完整版（默认）</td></tr>
</table>
</div>

<h2>配置订阅链接示例</h2>
<div class="section">
<h3>📦 精简版（jin18）</h3>
<p>原始 JSON：<br><code>${currentOrigin}?config=0&source=jin18</code></p>
<p>中转代理 JSON：<br><code>${currentOrigin}?config=1&source=jin18</code></p>
<p>原始 Base58：<br><code>${currentOrigin}?config=0&encode=base58&source=jin18</code></p>
<p>中转 Base58：<br><code>${currentOrigin}?config=1&encode=base58&source=jin18</code></p>
</div>

<div class="section">
<h3>📦 精简版+成人（jingjian）</h3>
<p>原始 JSON：<br><code>${currentOrigin}?config=0&source=jingjian</code></p>
<p>中转代理 JSON：<br><code>${currentOrigin}?config=1&source=jingjian</code></p>
<p>原始 Base58：<br><code>${currentOrigin}?config=0&encode=base58&source=jingjian</code></p>
<p>中转 Base58：<br><code>${currentOrigin}?config=1&encode=base58&source=jingjian</code></p>
</div>

<div class="section">
<h3>📦 完整版（full，默认）</h3>
<p>原始 JSON：<br><code>${currentOrigin}?config=0&source=full</code></p>
<p>中转代理 JSON：<br><code>${currentOrigin}?config=1&source=full</code></p>
<p>原始 Base58：<br><code>${currentOrigin}?config=0&encode=base58&source=full</code></p>
<p>中转 Base58：<br><code>${currentOrigin}?config=1&encode=base58&source=full</code></p>
</div>

<h2>支持的功能</h2>
<ul>
<li>✅ 支持 GET、POST、PUT、DELETE 等所有 HTTP 方法</li>
<li>✅ 自动转发请求头和请求体</li>
<li>✅ 保留原始响应头（除敏感信息）</li>
<li>✅ 完整的 CORS 支持</li>
<li>✅ 超时保护（30 秒）</li>
<li>✅ 支持多种配置源切换</li>
<li>✅ 支持 Base58 编码输出</li>
<li>✅ 环境变量 U 自定义 JSON 地址</li>
</ul>
</body>
</html>`;
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
    });
  },
};