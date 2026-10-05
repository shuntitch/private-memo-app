// 링크 미리보기 Edge Function
// POST { url } → { ok, url, title, description, image, siteName, favicon, finalUrl }
//
// 아무 주소나 서버가 대신 요청하는 기능이라 악용(SSRF) 방지가 핵심이다.
// - 로그인한 사용자만 호출 가능 (공개 anon key로는 거부)
// - 내부망·예약 대역 주소 차단, 리다이렉트는 직접 따라가며 단계마다 다시 검사
// - 시간·크기 제한, HTML만 처리, 메타데이터만 돌려준다

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { detectCharset, extractMetadata, isBlockedIp, isIpLiteral, parsePublicHttpUrl } from './preview.js';

const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const CACHE_OK_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_FAIL_MS = 60 * 60 * 1000; // 일시적 차단(429 등)이 하루 동안 굳지 않게 짧게
const USER_AGENT = 'Mozilla/5.0 (compatible; MemoLinkPreview/1.0)';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// 실패 사유는 정해진 값만 돌려준다 (내부 오류 문구에 IP 등이 섞여 나가지 않게)
class PreviewError extends Error {}
const fail = (reason: string): never => {
  throw new PreviewError(reason);
};

// ─── DNS: 도메인이 실제로 가리키는 IP가 공인 주소인지 확인 ───

let dohOnly = false;

async function resolveWithDoh(host: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: 'application/dns-json' },
  });
  if (!res.ok) return [];
  const body = await res.json();
  const code = type === 'A' ? 1 : 28;
  return (body.Answer || []).filter((a: { type: number }) => a.type === code).map((a: { data: string }) => a.data);
}

async function resolveIps(host: string): Promise<string[]> {
  const ips: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    if (!dohOnly) {
      try {
        ips.push(...(await Deno.resolveDns(host, type)));
        continue;
      } catch (e) {
        // 실행 환경이 resolveDns를 지원하지 않으면 DNS-over-HTTPS로 전환
        if (e instanceof Error && /not ?supported|not implemented|permission/i.test(`${e.name} ${e.message}`)) dohOnly = true;
        else continue; // 해당 타입의 레코드가 없는 경우
      }
    }
    ips.push(...(await resolveWithDoh(host, type)));
  }
  return ips;
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) return; // IP 표기는 parsePublicHttpUrl에서 이미 검사함
  const ips = await resolveIps(host);
  if (ips.length === 0) fail('dns');
  if (ips.some((ip) => isBlockedIp(ip))) fail('blocked');
}

// ─── 페이지 가져오기 ───

async function readLimited(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const ascii = new TextDecoder('latin1');
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (ascii.decode(value).toLowerCase().includes('</head')) break; // 메타 태그는 <head> 안에 있다
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const n = Math.min(chunk.length, out.length - offset);
    out.set(chunk.subarray(0, n), offset);
    offset += n;
    if (offset >= out.length) break;
  }
  return out;
}

async function fetchHtml(start: URL, signal: AbortSignal): Promise<{ html: string; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko,en;q=0.8' },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) fail('redirect');
      const next = parsePublicHttpUrl(new URL(location!, url).toString());
      if (!next) fail('blocked');
      url = next!;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      fail(`status_${res.status}`);
    }
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
      await res.body?.cancel();
      fail('not_html');
    }

    const bytes = await readLimited(res.body!, MAX_BYTES);
    const charset = detectCharset(type, new TextDecoder('latin1').decode(bytes.subarray(0, 4096)));
    let html: string;
    try {
      html = new TextDecoder(charset).decode(bytes);
    } catch (_) {
      html = new TextDecoder('utf-8').decode(bytes);
    }
    return { html, finalUrl: url };
  }
  return fail('too_many_redirects');
}

// ─── YouTube: 일반 페이지 요청은 서버 IP에서 429로 막히는 일이 잦아 공식 oEmbed를 쓴다 ───

const YOUTUBE_HOST = /^(www.|m.|music.)?youtube.com$|^youtu.be$/;

async function fetchYoutubeOembed(target: URL, signal: AbortSignal) {
  const res = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target.toString())}`,
    { signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
  );
  if (!res.ok) {
    await res.body?.cancel();
    fail(`oembed_${res.status}`);
  }
  const info = await res.json();
  const image = typeof info.thumbnail_url === 'string' ? parsePublicHttpUrl(info.thumbnail_url) : null;
  return {
    title: typeof info.title === 'string' ? info.title.slice(0, 200) : null,
    description: typeof info.author_name === 'string' ? info.author_name.slice(0, 100) : null,
    image: image ? image.toString().replace(/^http:/, 'https:') : null,
    siteName: 'YouTube',
    favicon: 'https://www.youtube.com/favicon.ico',
    finalUrl: target.toString(),
  };
}

// ─── 요청 처리 ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // 로그인 사용자만 허용 (anon key도 JWT라서 게이트웨이는 통과하므로 여기서 사용자 확인)
  const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData?.user) return json({ error: 'unauthorized' }, 401);

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'bad_request' }, 400);
  }
  const target = parsePublicHttpUrl(typeof body.url === 'string' ? body.url : '');
  if (!target) return json({ error: 'invalid_url' }, 400);
  const key = target.toString();

  // 캐시: 성공은 7일, 실패는 1일 보관 (캐시 테이블이 없어도 동작은 한다)
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: cached } = await admin.from('link_previews').select('data, ok, fetched_at').eq('url', key).maybeSingle();
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < (cached.ok ? CACHE_OK_MS : CACHE_FAIL_MS)) return json({ ok: cached.ok, url: key, ...cached.data, cached: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let ok = false;
  let data: Record<string, unknown>;
  try {
    let fromOembed: Record<string, unknown> | null = null;
    if (YOUTUBE_HOST.test(target.hostname)) {
      try {
        fromOembed = await fetchYoutubeOembed(target, controller.signal);
      } catch (_) {
        fromOembed = null; // oEmbed가 안 되면 일반 방식으로 한 번 더 시도
      }
    }
    if (fromOembed) {
      data = fromOembed;
    } else {
      const { html, finalUrl } = await fetchHtml(target, controller.signal);
      data = { ...extractMetadata(html, finalUrl.toString()), finalUrl: finalUrl.toString() };
    }
    ok = true;
  } catch (e) {
    const reason = e instanceof PreviewError ? e.message : controller.signal.aborted ? 'timeout' : 'fetch_failed';
    data = { reason };
  } finally {
    clearTimeout(timer);
  }

  await admin.from('link_previews').upsert({ url: key, data, ok, fetched_at: new Date().toISOString() });
  return json({ ok, url: key, ...data });
});
