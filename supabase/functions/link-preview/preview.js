// 링크 미리보기의 순수 로직 (네트워크·DB 없음).
// Edge Function(Deno)과 로컬 단위 테스트(Node)가 함께 쓴다.

export const MAX_URL_LENGTH = 2048;

// ─── 주소 검증 (SSRF 방지) ───

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export const isIpLiteral = (host) => IPV4.test(host) || host.includes(':');

// 내부망·예약 대역이면 true. 형식이 이상하면 안전하게 막는다.
export function isBlockedIp(ip) {
  if (ip.includes(':')) return isBlockedIpv6(ip);
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 || // 현재 네트워크
    a === 10 || // 사설망
    a === 127 || // 루프백
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 링크 로컬 (클라우드 메타데이터 169.254.169.254 포함)
    (a === 172 && b >= 16 && b <= 31) || // 사설망
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 예약·문서용
    (a === 192 && b === 168) || // 사설망
    (a === 198 && (b === 18 || b === 19)) || // 벤치마크용
    (a === 198 && b === 51 && c === 100) || // 문서용
    (a === 203 && b === 0 && c === 113) || // 문서용
    a >= 224 // 멀티캐스트·예약
  );
}

function isBlockedIpv6(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  // IPv4 매핑 주소(::ffff:1.2.3.4 또는 ::ffff:102:304)는 안의 IPv4로 판단
  const dotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isBlockedIp(dotted[1]);
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isBlockedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // ::, ::1, IPv4 호환 주소 등 앞이 0으로 시작하는 주소는 공인 주소가 아니다
  if (s.startsWith('::')) return true;
  const first = parseInt(s.split(':')[0], 16);
  if (Number.isNaN(first)) return true;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 사설
    (first & 0xffc0) === 0xfe80 || // fe80::/10 링크 로컬
    (first & 0xff00) === 0xff00 || // 멀티캐스트
    s.startsWith('2001:db8:') || // 문서용
    s.startsWith('64:ff9b:') // NAT64 (내부 IPv4로 우회 가능)
  );
}

// 외부에 공개된 http(s) 주소로 보이면 URL 객체, 아니면 null.
// (도메인이 실제로 어디를 가리키는지는 호출하는 쪽에서 DNS로 한 번 더 확인한다)
export function parsePublicHttpUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch (e) {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;

  // URL 파서가 2130706433, 0x7f.1 같은 표기를 127.0.0.1로 정규화해 준다
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost') return null;
  if (/\.(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null;
  if (!host.includes('.') && !host.includes(':')) return null; // 점 없는 내부 호스트명
  if (isIpLiteral(host) && isBlockedIp(host)) return null;

  url.hash = '';
  return url;
}

// ─── HTML 해석 ───

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', middot: '·',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });
}

const clean = (text) => decodeEntities(text).replace(/\s+/g, ' ').trim();

const truncate = (text, max) => {
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
};

function parseAttributes(tag) {
  const attrs = {};
  const re = /([^\s=/>"']+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

// 미리보기 이미지·아이콘 주소: 상대 경로를 풀고, https만 쓴다
// (http 이미지는 https 페이지에서 차단되므로 https로 올려보고, 안 뜨면 앱에서 숨긴다)
function toImageUrl(raw, baseUrl) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw.trim(), baseUrl);
  } catch (e) {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  return parsePublicHttpUrl(url.toString()) ? url.toString() : null;
}

// 헤더나 <meta>에서 문자 인코딩을 찾는다 (EUC-KR 같은 국내 사이트 대응)
export function detectCharset(contentType, headSnippet) {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '');
  if (fromHeader) return fromHeader[1].toLowerCase();
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(headSnippet || '');
  return fromMeta ? fromMeta[1].toLowerCase() : 'utf-8';
}

export function extractMetadata(html, baseUrl) {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 200000);

  const metas = {};
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content && attrs.content.trim() && !(key in metas)) metas[key] = attrs.content;
  }
  const pick = (...keys) => {
    for (const key of keys) if (metas[key]) return clean(metas[key]);
    return null;
  };

  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const icon = [...head.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => parseAttributes(tag))
    .find((attrs) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(attrs.rel || '') && attrs.href);

  return {
    title: truncate(pick('og:title', 'twitter:title') || (titleTag ? clean(titleTag[1]) : null), 200),
    description: truncate(pick('og:description', 'twitter:description', 'description'), 300),
    image: toImageUrl(pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), baseUrl),
    siteName: truncate(pick('og:site_name', 'application-name'), 100),
    favicon: toImageUrl(icon ? icon.href : '/favicon.ico', baseUrl),
  };
}
