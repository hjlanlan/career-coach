/**
 * AI 职业规划 — 语义分类代理服务器
 *
 * 部署方式（三选一，都免费）：
 *   Render.com → 把 proxy/ 目录 push 到 GitHub，在 Render 上连仓库即可
 *   Railway.app → 同上
 *   fly.io     → fly launch
 *
 * 启动：node server.js
 * 端口：process.env.PORT || 3000
 *
 * 端点：
 *   POST /api/classify
 *   Body: { "message": "不讨厌吧", "slot": "commAttitude", "context": "询问沟通态度" }
 *   Response: { "value": "Medium" }
 */

import http from 'node:http';

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ===== Prompt 模板 =====

function buildPrompt(message, slot, context) {
  let systemPrompt;
  switch (slot) {
    case 'codeAttitude':
      systemPrompt = `你是一个职业规划AI的分类器。用户正在被询问"对写代码的态度"。
请根据用户的回答，判断属于以下三类中的哪一类，只输出对应的英文标签：

- High: 擅长写代码、喜欢写代码、对编程有热情
- Medium: 一般、不排斥、不擅长但也不讨厌、能接受
- Low: 讨厌写代码、排斥、反感、不想写

请严格只输出 High、Medium 或 Low，不要输出任何其他内容。`;
      break;
    case 'commAttitude':
      systemPrompt = `你是一个职业规划AI的分类器。用户正在被询问"对沟通的态度"。
请根据用户的回答，判断属于以下三类中的哪一类，只输出对应的英文标签：

- High: 喜欢和人打交道、喜欢沟通、外向、擅长社交、社牛
- Medium: 一般、谈不上讨厌、不排斥、不算喜欢也不讨厌、正常、i人、无所谓
- Low: 讨厌沟通、害怕社交、排斥、社恐、反感、不喜欢和人交流

请严格只输出 High、Medium 或 Low，不要输出任何其他内容。`;
      break;
    default:
      systemPrompt = '请只输出 High、Medium 或 Low。';
  }

  return {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  };
}

// ===== 调用 Anthropic API =====

async function callClaude(message, slot, context) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const body = buildPrompt(message, slot, context);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text?.trim() || '';
  return text;
}

// ===== HTTP 服务器 =====

const server = http.createServer(async (req, res) => {
  // CORS 头 —— 匹配所有请求方法
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /api/classify —— 核心分类端点
  if (req.method === 'POST' && req.url === '/api/classify') {
    try {
      const rawBody = await readBody(req);
      const { message, slot, context } = JSON.parse(rawBody);

      if (!message || !slot) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing message or slot' }));
        return;
      }

      const text = await callClaude(message, slot, context || '');
      const value = text.trim();

      if (!['High', 'Medium', 'Low'].includes(value)) {
        console.warn(`Unexpected LLM output: "${value}", defaulting to null`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: null, raw: text }));
        return;
      }

      console.log(`[classify] slot=${slot} msg="${message}" → ${value}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value }));
    } catch (err) {
      console.error('Classification error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET 请求（根路径、健康检查、Render 自动检测）
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Career Coach Proxy</title>
<style>body{font-family:-apple-system,sans-serif;max-width:400px;margin:60px auto;text-align:center;color:#333}
a{color:#6366f1}</style></head>
<body>
  <h1>🧭 运行中</h1>
  <p>API Key: ${ANTHROPIC_API_KEY ? '✅ 已配置' : '❌ 未配置'}</p>
  <p>端点: <code>POST /api/classify</code></p>
  <p><a href="/health">健康检查</a></p>
</body></html>`);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

server.listen(PORT, () => {
  console.log(`🧭 Career Coach Proxy running on port ${PORT}`);
  console.log(`   Classify endpoint: POST http://localhost:${PORT}/api/classify`);
  console.log(`   Has API key: ${!!ANTHROPIC_API_KEY}`);
});
