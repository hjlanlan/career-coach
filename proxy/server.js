/**
 * AI 职业规划 — 语义分类代理服务器（DeepSeek 版）
 *
 * 部署到 Render / Railway 等任意平台。
 *
 * 启动：node server.js
 * 端口：process.env.PORT || 3000
 *
 * 端点：
 *   POST /api/classify
 *   Body: { "message": "不讨厌吧", "slot": "commAttitude" }
 *   Response: { "value": "Medium" }
 */

import http from 'node:http';

const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

// ===== Prompt 模板 =====

function buildMessages(message, slot) {
  let systemPrompt;
  switch (slot) {
    case 'codeAttitude':
      systemPrompt = `你是一个职业规划AI的分类器。用户正在被询问"对写代码的态度"。请根据用户的回答，判断属于以下三类中的哪一类。

- High: 擅长写代码、喜欢写代码、对编程有热情
- Medium: 一般、不排斥、还行、能接受、不算擅长但也不讨厌
- Low: 讨厌写代码、排斥、反感、不会写、不想写

严格只输出一个单词：High、Medium 或 Low。不要输出任何其他内容。`;
      break;
    case 'commAttitude':
      systemPrompt = `你是一个职业规划AI的分类器。用户正在被询问"对沟通的态度"。请根据用户的回答，判断属于以下三类中的哪一类。

- High: 喜欢和人打交道、喜欢沟通、外向、擅长社交、社牛
- Medium: 一般、谈不上讨厌、不排斥、不算喜欢也不讨厌、正常、i人、无所谓
- Low: 讨厌沟通、害怕社交、排斥、社恐、反感、不喜欢和人交流

严格只输出一个单词：High、Medium 或 Low。不要输出任何其他内容。`;
      break;
    default:
      systemPrompt = '严格只输出 High、Medium 或 Low。不要输出任何其他内容。';
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];
}

// ===== 调用 DeepSeek API（OpenAI 兼容格式） =====

async function callDeepSeek(message, slot) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: buildMessages(message, slot),
      max_tokens: 10,
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return text;
}

// ===== HTTP 服务器 =====

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /api/classify
  if (req.method === 'POST' && req.url === '/api/classify') {
    try {
      const rawBody = await readBody(req);
      const { message, slot } = JSON.parse(rawBody);

      if (!message || !slot) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing message or slot' }));
        return;
      }

      const text = await callDeepSeek(message, slot);
      const value = text.trim();

      // 清洗：有些模型会输出 "High。" 带句号
      const clean = value.replace(/[^A-Za-z]/g, '');

      if (!['High', 'Medium', 'Low'].includes(clean)) {
        console.warn(`Unexpected output: "${value}" → cleaned "${clean}", returning null`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: null, raw: value }));
        return;
      }

      console.log(`[classify] slot=${slot} msg="${message}" → ${clean}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value: clean }));
    } catch (err) {
      console.error('Classification error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET —— 首页 + 健康检查
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Career Coach Proxy</title>
<style>body{font-family:-apple-system,sans-serif;max-width:400px;margin:60px auto;text-align:center;color:#333}
code{background:#f0f0f0;padding:2px 8px;border-radius:4px}</style></head>
<body>
  <h1>🧭 Career Coach Proxy</h1>
  <p>模型: <strong>DeepSeek</strong></p>
  <p>API Key: ${DEEPSEEK_API_KEY ? '✅ 已配置' : '❌ 未配置'}</p>
  <p>端点: <code>POST /api/classify</code></p>
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
  console.log(`🧭 Career Coach Proxy (DeepSeek) running on port ${PORT}`);
  console.log(`   POST http://localhost:${PORT}/api/classify`);
  console.log(`   Key: ${DEEPSEEK_API_KEY ? '✅ configured' : '❌ missing'}`);
});
