#!/usr/bin/env node
/**
 * meeting-minutes-pro · SVG 看板自检
 *
 * 用法：
 *   node scripts/check-board.mjs <看板文件.svg>
 *   node scripts/check-board.mjs <看板文件.svg> --json
 *
 * 检查：XML 合法性 / 根元素契约 / 重复 id / 文字溢出 / 元素越界 / 外链与脚本
 * 退出码：0 = 无 error；1 = 有 error；2 = 用法或读文件失败
 *
 * 零依赖，不需要联网，不需要安装任何东西。
 */

import fs from 'node:fs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const issues = [];
const push = (level, msg, line) => issues.push({ level, msg, line });

/* ---------- XML 合法性 ---------- */

function findTagEnd(src, from) {
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([A-Za-z_:][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return attrs;
}

function lineOf(src, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') n++;
  return n;
}

function checkWellFormed(src) {
  const stack = [];
  const elements = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      if (src.slice(i).trim()) push('error', '根元素之外存在文本内容', lineOf(src, i));
      break;
    }
    if (src.slice(i, lt).trim() && stack.length === 0) {
      push('error', '根元素之外存在文本内容', lineOf(src, i));
    }
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) { push('error', '注释未闭合', lineOf(src, lt)); return null; }
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) { push('error', 'CDATA 未闭合', lineOf(src, lt)); return null; }
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt);
      if (end === -1) { push('error', '处理指令未闭合', lineOf(src, lt)); return null; }
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      const end = findTagEnd(src, lt);
      if (end === -1) { push('error', 'DOCTYPE 未闭合', lineOf(src, lt)); return null; }
      i = end + 1;
      continue;
    }
    const gt = findTagEnd(src, lt);
    if (gt === -1) { push('error', `第 ${lineOf(src, lt)} 行的标签未闭合`, lineOf(src, lt)); return null; }
    const raw = src.slice(lt + 1, gt);
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      const top = stack.pop();
      if (!top) push('error', `多余的闭合标签 </${name}>`, lineOf(src, lt));
      else if (top.name !== name) push('error', `标签未配对：<${top.name}> 被 </${name}> 关闭（第 ${lineOf(src, lt)} 行）`, lineOf(src, lt));
    } else {
      const nameMatch = raw.match(/^([A-Za-z_][\w.:-]*)/);
      if (!nameMatch) { push('error', '出现了不合法的 "<"（文本里的 < 需写成 &lt;）', lineOf(src, lt)); return null; }
      const name = nameMatch[1];
      const selfClosing = raw.trimEnd().endsWith('/');
      const attrs = parseAttrs(raw);
      const line = lineOf(src, lt);
      elements.push({ name, attrs, line });
      if (!selfClosing) stack.push({ name, line });
    }
    i = gt + 1;
  }
  for (const open of stack) push('error', `<${open.name}> 未闭合`, open.line);
  return elements;
}

/* ---------- 文字宽度估算 ---------- */

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp <= 0x7f) {
    if (ch === ' ') return 0.32;
    if ("ilj.,'!:;|".includes(ch)) return 0.3;
    if (ch >= 'A' && ch <= 'Z') return 0.62;
    if (ch >= '0' && ch <= '9') return 0.56;
    return 0.52;
  }
  if (cp >= 0x1f300 && cp <= 0x1faff) return 1.0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) return 1.0;
  if (cp >= 0x2000 && cp <= 0x206f) return 0.45;
  return 0.6;
}

function estimateWidth(text, fontSize) {
  let units = 0;
  for (const ch of text) units += charWidth(ch);
  return units * fontSize;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

const num = (v) => (v === undefined ? undefined : Number.parseFloat(v));

/* 把注释 / CDATA / 处理指令抹成等长空白，保留行号，避免把注释里的示例标签当元素 */
function blankOut(src) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, blank)
    .replace(/<\?[\s\S]*?\?>/g, blank);
}

/* ---------- 主流程 ---------- */

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('用法: node scripts/check-board.mjs <看板文件.svg> [--json]');
    process.exit(2);
  }

  let src;
  try {
    src = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    console.error(`读不到文件: ${file}\n${e.message}`);
    process.exit(2);
  }

  const elements = checkWellFormed(src);
  if (!elements) return report(file, json, null);
  if (elements.length === 0) {
    push('error', '没有解析到任何元素');
    return report(file, json, null);
  }

  /* 根元素契约 */
  const root = elements[0];
  if (root.name !== 'svg') push('error', `根元素是 <${root.name}>，应为 <svg>`, root.line);
  if (root.attrs.xmlns !== SVG_NS) push('error', '根元素缺少正确的 xmlns="http://www.w3.org/2000/svg"', root.line);

  const vb = (root.attrs.viewBox || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => Number.isNaN(n))) {
    push('error', 'viewBox 缺失或格式不对（应为 "0 0 宽 高"）', root.line);
  }
  const vbW = vb[2];
  const vbH = vb[3];
  const width = num(root.attrs.width);
  const height = num(root.attrs.height);
  if (width === undefined || height === undefined) {
    push('error', '根元素缺少 width / height（浏览器会按 1:1 缩小）', root.line);
  } else if (!Number.isNaN(vbW) && (width !== vbW || height !== vbH)) {
    push('warn', `width/height (${width}×${height}) 与 viewBox (${vbW}×${vbH}) 不一致`, root.line);
  }

  /* 危险元素与外链 */
  for (const el of elements) {
    if (['script', 'foreignObject', 'image'].includes(el.name)) {
      push('error', `出现了禁止元素 <${el.name}>：看板必须完全离线自包含`, el.line);
    }
    for (const [k, v] of Object.entries(el.attrs)) {
      if (/^(href|xlink:href|src)$/i.test(k) && /^(https?:)?\/\//i.test(v)) {
        push('error', `第 ${el.line} 行引用外部资源 ${k}="${v}"：换机器会裂图`, el.line);
      }
      if (/^on[a-z]+$/i.test(k)) push('error', `出现了内联事件属性 ${k}`, el.line);
    }
  }

  /* 重复 id */
  const seen = new Map();
  for (const el of elements) {
    const id = el.attrs.id;
    if (!id) continue;
    if (seen.has(id)) push('error', `id="${id}" 重复（第 ${seen.get(id)} 行与第 ${el.line} 行）`, el.line);
    else seen.set(id, el.line);
  }

  /* 元素越界 */
  if (!Number.isNaN(vbW) && !Number.isNaN(vbH)) {
    for (const el of elements) {
      const x = num(el.attrs.x);
      const y = num(el.attrs.y);
      const w = num(el.attrs.width);
      const h = num(el.attrs.height);
      if (x !== undefined && x < 0) push('warn', `第 ${el.line} 行 x=${x} 为负，会被裁切`, el.line);
      if (y !== undefined && y < 0) push('warn', `第 ${el.line} 行 y=${y} 为负，会被裁切`, el.line);
      if (w !== undefined && x !== undefined && x + w > vbW + 0.5) {
        push('warn', `第 ${el.line} 行元素右边界 ${x + w} 超出画布 ${vbW}`, el.line);
      }
      if (h !== undefined && y !== undefined && y + h > vbH + 0.5) {
        push('warn', `第 ${el.line} 行元素下边界 ${y + h} 超出画布 ${vbH}`, el.line);
      }
    }
  }

  /* 文字溢出 */
  const scanSrc = blankOut(src);
  const re = /<text\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text>)/g;
  let m;
  let textCount = 0;
  let unmarked = 0;
  while ((m = re.exec(scanSrc))) {
    textCount++;
    const line = lineOf(scanSrc, m.index);
    const attrs = parseAttrs(m[1]);
    const rawText = decodeEntities((m[2] || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (!rawText) continue;

    const fontSize = num(attrs['font-size']);
    const maxWidth = num(attrs['data-max-width']);

    if (maxWidth === undefined) {
      unmarked++;
      continue;
    }
    const fs2 = fontSize ?? 14;
    if (fontSize === undefined) push('warn', `第 ${line} 行 <text> 没写 font-size，按 14px 估算`, line);

    const estimated = estimateWidth(rawText, fs2);
    if (estimated > maxWidth) {
      const over = Math.round(estimated - maxWidth);
      const shown = rawText.length > 28 ? rawText.slice(0, 28) + '…' : rawText;
      push('error', `第 ${line} 行文字溢出：「${shown}」估算 ${Math.round(estimated)}px > 上限 ${maxWidth}px（超出 ${over}px）`, line);
    }

    /* 水平越界 */
    const x = num(attrs.x) ?? 0;
    const anchor = attrs['text-anchor'] || 'start';
    if (!Number.isNaN(vbW)) {
      const left = anchor === 'middle' ? x - estimated / 2 : anchor === 'end' ? x - estimated : x;
      const right = left + estimated;
      if (left < -0.5) push('warn', `第 ${line} 行文字左边界 ${Math.round(left)} 越出画布`, line);
      else if (right > vbW + 0.5) push('warn', `第 ${line} 行文字右边界 ${Math.round(right)} 超出画布 ${vbW}`, line);
    }
  }

  if (textCount === 0) push('warn', '没有找到任何 <text>，看板可能是空图');
  if (unmarked > 0) {
    push('info', `${unmarked} 条 <text> 未标注 data-max-width，无法自动检查溢出`);
  }

  report(file, json, { width: vbW, height: vbH, textCount, unmarked });
}

function report(file, json, meta) {
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const infos = issues.filter((i) => i.level === 'info');

  if (json) {
    console.log(JSON.stringify({ file, meta, errors, warns, infos, ok: errors.length === 0 }, null, 2));
  } else {
    console.log('meeting-minutes-pro · SVG 看板自检');
    console.log(`文件: ${file}`);
    if (meta && !Number.isNaN(meta.width)) console.log(`画布: ${meta.width} × ${meta.height}`);
    console.log('');
    for (const i of issues) {
      const tag = i.level === 'error' ? '[ERROR]' : i.level === 'warn' ? '[WARN ]' : '[INFO ]';
      console.log(`${tag} ${i.msg}`);
    }
    if (issues.length === 0) console.log('没有发现问题。');
    console.log('');
    console.log(`结果: ${errors.length} error / ${warns.length} warn / ${infos.length} info`);
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
