// 서식 메모(TipTap JSON) ↔ 일반 텍스트 변환.
// TipTap에 의존하지 않는 순수 함수라 웹·네이티브 양쪽에서 쓸 수 있다.
//
// 일반 텍스트는 memos.content에 함께 저장되어 검색, 목록 미리보기,
// 그리고 서식을 모르는 구버전 앱의 표시용으로 쓰인다.

const inlineText = (node) =>
  (node.content || [])
    .map((child) => {
      if (child.type === 'text') return child.text || '';
      if (child.type === 'hardBreak') return '\n';
      return inlineText(child);
    })
    .join('');

const isTextBlock = (node) => node && (node.type === 'paragraph' || node.type === 'heading');

const pushListItem = (item, marker, depth, out) => {
  const [first, ...rest] = item.content || [];
  const indent = '  '.repeat(depth);
  if (isTextBlock(first)) {
    out.push(indent + marker + inlineText(first));
    pushBlocks(rest, depth + 1, out);
  } else {
    out.push(indent + marker);
    pushBlocks(item.content, depth + 1, out);
  }
};

const pushBlocks = (nodes, depth, out) => {
  (nodes || []).forEach((node) => {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        out.push('  '.repeat(depth) + inlineText(node));
        break;
      case 'bulletList':
        (node.content || []).forEach((item) => pushListItem(item, '• ', depth, out));
        break;
      case 'orderedList': {
        const start = (node.attrs && node.attrs.start) || 1;
        (node.content || []).forEach((item, i) => pushListItem(item, `${start + i}. `, depth, out));
        break;
      }
      case 'taskList':
        (node.content || []).forEach((item) =>
          pushListItem(item, item.attrs && item.attrs.checked ? '☑ ' : '☐ ', depth, out)
        );
        break;
      default:
        if (node.content) pushBlocks(node.content, depth, out);
    }
  });
};

export const docToText = (doc) => {
  if (!doc || !Array.isArray(doc.content)) return '';
  const out = [];
  pushBlocks(doc.content, 0, out);
  return out.join('\n');
};

// 일반 텍스트를 줄 단위 문단으로 바꾼다 (서식 도입 이전에 저장된 메모용)
export const textToDoc = (text) => ({
  type: 'doc',
  content: String(text || '')
    .split('\n')
    .map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
});

// 본문에 그냥 적혀 있는 http(s) 주소를 링크로 바꾼다.
// 자동 링크는 입력 중 띄어쓰기를 해야 걸리므로, 기존 메모나 맨 끝에 붙여넣은 주소는 링크가 아닐 수 있다.
// 글자 자체는 바꾸지 않으므로 docToText 결과는 그대로다.
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
const TRAILING_PUNCTUATION = /[.,!?;:'")\]]+$/;

const linkifyText = (node) => {
  const hasLink = (node.marks || []).some((m) => m.type === 'link');
  if (hasLink || !node.text) return [node];

  const parts = [];
  let last = 0;
  node.text.replace(URL_PATTERN, (match, offset) => {
    const url = match.replace(TRAILING_PUNCTUATION, '');
    if (!/^https?:\/\/[^/?#]+/.test(url)) return match; // "https://"만 있는 경우 등은 제외
    if (offset > last) parts.push({ ...node, text: node.text.slice(last, offset) });
    parts.push({ ...node, text: url, marks: [...(node.marks || []), { type: 'link', attrs: { href: url } }] });
    last = offset + url.length;
    return match;
  });
  if (parts.length === 0) return [node];
  if (last < node.text.length) parts.push({ ...node, text: node.text.slice(last) });
  return parts;
};

export const linkifyDoc = (node) => {
  if (!node || !Array.isArray(node.content)) return node;
  return {
    ...node,
    content: node.content.flatMap((child) => (child.type === 'text' ? linkifyText(child) : [linkifyDoc(child)])),
  };
};

// 메모를 화면에 그릴 때 쓸 문서.
// content_rich가 있어도 content와 어긋나 있으면(서식을 모르는 구버전 앱이 본문만 고친 경우)
// 최신 내용인 content를 우선한다.
export const resolveMemoDoc = (memo) => {
  const doc =
    memo && memo.contentRich && docToText(memo.contentRich) === (memo.content || '')
      ? memo.contentRich
      : textToDoc(memo ? memo.content : '');
  return linkifyDoc(doc);
};

// 체크리스트 진행 현황 (목록 카드 표시용)
export const countTasks = (doc) => {
  let total = 0;
  let done = 0;
  const walk = (nodes) =>
    (nodes || []).forEach((node) => {
      if (node.type === 'taskItem') {
        total += 1;
        if (node.attrs && node.attrs.checked) done += 1;
      }
      walk(node.content);
    });
  walk(doc && doc.content);
  return { total, done };
};
