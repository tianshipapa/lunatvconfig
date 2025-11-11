// functions/_worker.js
export default {
  async fetch(request, env, ctx) {
    // 1. 从 Pages 控制台读取环境变量 U
    const jsonUrl = (env.U || '').trim() || 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/main/jingjian.json'

    // -------------- 工具函数（原封不动） --------------
    const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    function base58Encode(obj) {
      const str = JSON.stringify(obj)
      const bytes = new TextEncoder().encode(str)
      let intVal = 0n
      for (let b of bytes) intVal = (intVal << 8n) + BigInt(b)
      let result = ''
      while (intVal > 0n) {
        const mod = intVal % 58n
        result = BASE58_ALPHABET[Number(mod)] + result
        intVal = intVal / 58n
      }
      for (let b of bytes) { if (b === 0) result = BASE58_ALPHABET[0] + result; else break }
      return result
    }

    function addOrReplacePrefix(obj, newPrefix) {
      if (typeof obj !== 'object' || obj === null) return obj
      if (Array.isArray(obj)) return obj.map(item => addOrReplacePrefix(item, newPrefix))
      const newObj = {}
      for (const key in obj) {
        if (key === 'api' && typeof obj[key] === 'string') {
          let apiUrl = obj[key]
          const urlIndex = apiUrl.indexOf('?url=')
          if (urlIndex !== -1) apiUrl = apiUrl.slice(urlIndex + 5)
          if (!apiUrl.startsWith(newPrefix)) apiUrl = newPrefix + apiUrl
          newObj[key] = apiUrl
        } else newObj[key] = addOrReplacePrefix(obj[key], newPrefix)
      }
      return newObj
    }
    // --------------------------------------------------------

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders })

    const reqUrl = new URL(request.url)
    const targetUrlParam = reqUrl.searchParams.get('url')
    const configParam = reqUrl.searchParams.get('config')
    const prefixParam = reqUrl.searchParams.get('prefix')
    const encodeParam = reqUrl.searchParams.get('encode')
    const currentOrigin = reqUrl.origin
    const defaultPrefix = currentOrigin + '/?url='

    // ---------------- 代理逻辑（与原来一致） ----------------
    if (targetUrlParam) {
      let fullTargetUrl = targetUrlParam
      const urlMatch = request.url.match(/[?&]url=([^&]+(?:&.*)?)/)
      if (urlMatch) fullTargetUrl = decodeURIComponent(urlMatch[1])

      let targetURL
      try { targetURL = new URL(fullTargetUrl) }
      catch {
        return new Response(JSON.stringify({ error: 'Invalid URL', url: fullTargetUrl }, null, 2),
          { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders } })
      }

      try {
        const proxyRequest = new Request(targetURL.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
        })
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)
        const response = await fetch(proxyRequest, { signal: controller.signal })
        clearTimeout(timeoutId)

        const responseHeaders = new Headers(corsHeaders)
        const exclude = ['content-encoding','content-length','transfer-encoding','connection','keep-alive','set-cookie','set-cookie2']
        for (const [k, v] of response.headers) if (!exclude.includes(k.toLowerCase())) responseHeaders.set(k, v)

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        })
      } catch (err) {
        return new Response(JSON.stringify({
          error: 'Proxy Error',
          message: err.message || '代理请求失败',
          target: fullTargetUrl,
          timestamp: new Date().toISOString()
        }, null, 2), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders } })
      }
    }

    // ---------------- JSON 配置接口（改用 jsonUrl） ----------------
    if (configParam === '1') {
      try {
        const data = await (await fetch(jsonUrl)).json()
        const newData = addOrReplacePrefix(data, prefixParam || defaultPrefix)
        if (encodeParam === 'base58') {
          return new Response(base58Encode(newData), { headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...corsHeaders } })
        } else {
          return new Response(JSON.stringify(newData), { headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders } })
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders } })
      }
    }

    if (configParam === '0') {
      try {
        const data = await (await fetch(jsonUrl)).json()
        if (encodeParam === 'base58') {
          return new Response(base58Encode(data), { headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...corsHeaders } })
        } else {
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders } })
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=UTF-8', ...corsHeaders } })
      }
    }

    // ---------------- 首页说明 ----------------
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API 中转代理服务</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:800px;margin:50px auto;padding:20px;line-height:1.6}
h1{color:#333}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:14px}
pre{background:#f4f4f4;padding:15px;border-radius:5px;overflow-x:auto}
.example{background:#e8f5e9;padding:15px;border-left:4px solid #4caf50;margin:20px 0}
</style>
</head><body>
<h1>🔄 API 中转代理服务</h1>
<p>通用 API 中转代理，用于访问被墙或限制的接口。</p>
<h2>使用方法</h2>
<p>中转任意 API：在请求 URL 后添加 <code>?url=目标地址</code> 参数</p>
<pre>${defaultPrefix}https://example.com/api</pre>
<div class="example">
<strong>示例：</strong><br>
<a href="${defaultPrefix}https://caiji.kuaichezy.org/api.php/provide/vod" target="_blank">
${defaultPrefix}https://caiji.kuaichezy.org/api.php/provide/vod
</a>
</div>
<h2>中转API配置订阅链接</h2>
<p>原始 JSON 配置订阅：<code>${currentOrigin}?config=0</code></p>
<p>中转API JSON 配置订阅：<code>${currentOrigin}?config=1</code></p>
<p>中转API Base58 编码配置订阅：<code>${currentOrigin}?config=1&encode=base58</code></p>
<p>JSON 配置 + 自定义中转API：<code>${currentOrigin}?config=1&prefix=自定义中转API</code></p>
<p>Base58编码 + 自定义中转API：<code>${currentOrigin}?config=1&encode=base58&prefix=自定义中转API</code></p>
<h2>支持的功能</h2>
<ul>
<li>✅ 支持 GET、POST、PUT、DELETE 等所有 HTTP 方法</li>
<li>✅ 自动转发请求头和请求体</li>
<li>✅ 保留原始响应头（除敏感信息）</li>
<li>✅ 完整的 CORS 支持</li>
<li>✅ 超时保护（30 秒）</li>
</ul>
</body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } })
  }
}
