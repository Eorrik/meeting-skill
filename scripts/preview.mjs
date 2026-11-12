#!/usr/bin/env node
/**
 * 本地预览：把会议纪要 Markdown 渲染成一份 HTML（自动链接同目录的看板 SVG），用默认浏览器打开。
 *
 *   node scripts/preview.mjs "2026-11-12_产品对齐_纪要.md"
 *   node scripts/preview.mjs "…_纪要.md" --no-open     # 只生成，不弹浏览器
 *
 * 零依赖、不联网、不起服务器。生成的 `<同名>.preview.html` 与 md 放在同一目录，
 * 因此 md 里 `![](xxx_看板.svg)` 这类相对路径照常生效。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

/* ---------------- 参数 ---------------- */
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const noOpen = args.includes('--no-open');
if (!target) {
  console.error('用法: node scripts/preview.mjs <纪要.md> [--no-open]');
  process.exit(1);
}
const mdPath = path.resolve(target);
if (!fs.existsSync(mdPath)) {
  console.error(`找不到文件: ${mdPath}`);
  process.exit(1);
}
const dir = path.dirname(mdPath);
const base = path.basename(mdPath).replace(/\.(md|markdown)$/i, '');

/* ---------------- Markdown → HTML（够用就好） ---------------- */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');

function render(md) {
  const lines = md.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* 代码块 */
    const fence = line.match(/^\s*```\s*(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // 跳过结尾 ```
      const body = esc(buf.join('\n'));
      if (lang === 'mermaid') {
        out.push(
          '<div class="mermaid-note">Mermaid 源码（本预览不渲染图形，看板请见图后 SVG）</div>' +
            `<pre class="code"><code>${body}</code></pre>`
        );
      } else {
        out.push(`<pre class="code"><code>${body}</code></pre>`);
      }
      continue;
    }

    /* 标题 */
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      out.push(`<h${lv}>${inline(h[2].trim())}</h${lv}>`);
      i++;
      continue;
    }

    /* 分隔线 */
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    /* 表格 */
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (l) =>
        l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table></div>'
      );
      continue;
    }

    /* 引用 */
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    /* 列表 */
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        items.push({ indent: m[1].length, ordered: /\d+\./.test(m[2]), text: m[3] });
        i++;
      }
      const ordered = items[0].ordered;
      let html = ordered ? '<ol>' : '<ul>';
      let prevIndent = items[0].indent;
      let liOpen = false;
      for (const it of items) {
        if (it.indent > prevIndent) {
          html += '<ul>'; // 嵌套列表开在当前未闭合的 <li> 内部
          prevIndent = it.indent;
        } else {
          if (liOpen) {
            html += '</li>';
            liOpen = false;
          }
          while (it.indent < prevIndent) {
            html += '</ul></li>';
            prevIndent = Math.max(it.indent, prevIndent - 2);
            if (prevIndent <= it.indent) break;
          }
          prevIndent = it.indent;
        }
        html += `<li>${inline(it.text)}`;
        liOpen = true;
      }
      if (liOpen) html += '</li>';
      html += ordered ? '</ol>' : '</ul>';
      out.push(html);
      continue;
    }

    /* 空行 */
    if (!line.trim()) {
      i++;
      continue;
    }

    /* 段落 */
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !isTableRow(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ---------------- 找同目录看板 SVG ---------------- */
let svgFile = null;
try {
  const svgs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.svg'));
  svgFile = svgs.find((f) => f.includes('看板')) || svgs[0] || null;
} catch {}

/* ---------------- 组装 HTML ---------------- */
const md = fs.readFileSync(mdPath, 'utf8');
const body = render(md);
const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(base)}</title>
<style>
  :root{--ink:#1F2329;--sub:#646A73;--line:#E5E6EB;--bg:#fff;--accent:#5178C6;}
  *{box-sizing:border-box}
  body{margin:0;background:#F7F8FA;color:var(--ink);
    font:15px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif}
  .wrap{max-width:920px;margin:32px auto 80px;background:var(--bg);border:1px solid var(--line);
    border-radius:14px;padding:40px 48px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  h1{font-size:26px;margin:0 0 6px;letter-spacing:.3px}
  h2{font-size:19px;margin:34px 0 12px;padding-left:10px;border-left:4px solid var(--accent);line-height:1.2}
  h3{font-size:16px;margin:22px 0 8px;color:#2B2F36}
  p{margin:8px 0}
  ul,ol{margin:8px 0;padding-left:24px}
  li{margin:4px 0}
  li ul,li ol{margin:2px 0}
  strong{color:#0F1114}
  code{background:#F2F3F5;border-radius:4px;padding:1px 5px;font-size:13px;
    font-family:"Cascadia Mono",Consolas,monospace}
  pre.code{background:#F7F8FA;border:1px solid var(--line);border-radius:8px;padding:12px 14px;
    overflow:auto;font-size:13px;line-height:1.6}
  pre.code code{background:none;padding:0}
  blockquote{margin:12px 0;padding:8px 14px;background:#F7F8FA;border-left:3px solid #C9CDD4;color:var(--sub)}
  hr{border:0;border-top:1px solid var(--line);margin:26px 0}
  .table-wrap{overflow:auto;margin:12px 0}
  table{border-collapse:collapse;width:100%;font-size:14px}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#F5F6F7;font-weight:600;white-space:nowrap}
  tbody tr:nth-child(even){background:#FCFCFD}
  img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;margin:10px 0;display:block}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .mermaid-note{font-size:12px;color:var(--sub);margin-top:12px}
  .bar{display:flex;gap:10px;align-items:center;margin-bottom:18px;padding-bottom:14px;
    border-bottom:1px solid var(--line);font-size:12px;color:var(--sub)}
  .bar a{background:#F2F3F5;border-radius:20px;padding:4px 12px;color:#1F2329}
  .bar a:hover{background:#E8EAED;text-decoration:none}
</style>
<div class="wrap">
  <div class="bar">
    <span>${esc(base)}</span>
    ${svgFile ? `<a href="./${encodeURI(svgFile)}" target="_blank">在新窗口打开看板 SVG ↗</a>` : ''}
  </div>
  ${body}
</div>
</html>`;

const outPath = path.join(dir, `${base}.preview.html`);
fs.writeFileSync(outPath, html, 'utf8');
console.log(`已生成: ${outPath}`);

if (!noOpen) {
  const url = pathToFileURL(outPath).href;
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const cargs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const p = spawn(cmd, cargs, { detached: true, stdio: 'ignore' });
    p.on('error', () => console.log(`请在浏览器打开: ${url}`));
    p.unref();
    console.log(`已在浏览器打开: ${url}`);
  } catch {
    console.log(`请在浏览器打开: ${url}`);
  }
}
