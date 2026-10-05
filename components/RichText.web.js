import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import { docToText } from '../richText';

// ─── 설정 ───

const FONT_SIZES = [
  { label: '작게', value: '14px' },
  { label: '보통', value: null },
  { label: '크게', value: '20px' },
  { label: '아주 크게', value: '24px' },
];

// 링크로 허용하는 주소. javascript: 같은 스킴은 화면에 그릴 때도 걸러진다.
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

const buildExtensions = ({ placeholder, onReadOnlyChecked } = {}) => [
  StarterKit.configure({
    heading: { levels: [1, 2] },
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && SAFE_LINK.test(url),
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
    },
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
    onReadOnlyChecked,
    a11y: {
      checkboxLabel: (node, checked) => `${node.textContent || '빈 항목'} ${checked ? '완료됨' : '미완료'}`,
    },
  }),
  TextStyle,
  FontSize,
  Placeholder.configure({ placeholder: placeholder || '' }),
];

// 사용자가 입력한 주소를 링크로 쓸 수 있는 형태로 정리. 쓸 수 없으면 null.
const normalizeUrl = (raw) => {
  const value = raw.trim();
  if (!value) return null;
  if (SAFE_LINK.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // 그 외 스킴은 거부
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'mailto:' + value;
  if (/^[^\s]+\.[^\s]{2,}/.test(value)) return 'https://' + value;
  return null;
};

// ─── 스타일 (한 번만 주입) ───

const CSS = `
.rt-root { display:flex; flex-direction:column; flex:1; min-height:0; width:100%;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; }
.rt-toolbar { display:flex; flex-wrap:nowrap; align-items:center; gap:2px; padding:6px 8px; overflow-x:auto;
  border-bottom:1px solid #E5E7EB; background:#FFFFFF; flex:0 0 auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.rt-toolbar::-webkit-scrollbar { display:none; }
.rt-btn { flex:0 0 auto; min-width:34px; height:34px; padding:0 8px; border:0; border-radius:8px; background:transparent;
  color:#374151; font-size:15px; font-family:inherit; cursor:pointer; display:inline-flex; align-items:center;
  justify-content:center; -webkit-tap-highlight-color:transparent; }
.rt-btn:disabled { color:#D1D5DB; cursor:default; }
.rt-btn.is-active { background:#DBEAFE; color:#1D4ED8; }
.rt-sep { flex:0 0 auto; width:1px; height:20px; background:#E5E7EB; margin:0 4px; }
.rt-sizes { display:flex; gap:6px; padding:6px 8px; overflow-x:auto; border-bottom:1px solid #E5E7EB; background:#F9FAFB; flex:0 0 auto; }
.rt-sizes .rt-btn { background:#FFFFFF; border:1px solid #E5E7EB; }
.rt-sizes .rt-btn.is-active { background:#DBEAFE; border-color:#93C5FD; }
.rt-scroll { flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.rt-content { outline:none; padding:16px; min-height:100%; box-sizing:border-box; font-size:16px; line-height:1.6;
  color:#1F2937; overflow-wrap:anywhere; }
.rt-viewing .rt-content { padding:0; min-height:0; }
.rt-content > *:first-child { margin-top:0; }
.rt-content p { margin:0 0 4px; }
.rt-content h1 { font-size:26px; line-height:1.3; font-weight:700; margin:14px 0 6px; }
.rt-content h2 { font-size:21px; line-height:1.35; font-weight:700; margin:12px 0 4px; }
.rt-content ul, .rt-content ol { padding-left:24px; margin:4px 0; }
.rt-content li > p { margin:0; }
.rt-content ul[data-type="taskList"] { list-style:none; padding-left:2px; }
.rt-content ul[data-type="taskList"] li { display:flex; align-items:flex-start; gap:8px; }
.rt-content ul[data-type="taskList"] li > label { flex:0 0 auto; margin-top:3px; user-select:none; }
.rt-content ul[data-type="taskList"] li > div { flex:1 1 auto; min-width:0; }
.rt-content ul[data-type="taskList"] li[data-checked="true"] > div { color:#9CA3AF; text-decoration:line-through; }
.rt-content input[type="checkbox"] { width:18px; height:18px; margin:0; accent-color:#3B82F6; cursor:pointer; }
.rt-content a { color:#2563EB; text-decoration:underline; cursor:pointer; }
.rt-content p.is-editor-empty:first-child::before { content:attr(data-placeholder); color:#9CA3AF; float:left;
  height:0; pointer-events:none; }
.rt-backdrop { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  padding:16px; background:rgba(0,0,0,0.45); }
.rt-dialog { width:100%; max-width:380px; box-sizing:border-box; padding:20px; border-radius:14px; background:#FFFFFF;
  font-family:inherit; }
.rt-dialog h3 { margin:0 0 14px; font-size:18px; color:#1F2937; }
.rt-dialog label { display:block; margin:0 0 4px; font-size:13px; font-weight:600; color:#6B7280; }
.rt-dialog input { width:100%; box-sizing:border-box; margin-bottom:12px; padding:10px 12px; border:1px solid #D1D5DB;
  border-radius:8px; font-size:16px; font-family:inherit; }
.rt-error { margin:-6px 0 10px; font-size:13px; color:#EF4444; }
.rt-actions { display:flex; gap:8px; margin-top:6px; }
.rt-actions button { flex:1; padding:11px 0; border:0; border-radius:8px; font-size:15px; font-weight:700;
  font-family:inherit; cursor:pointer; }
.rt-cancel { background:#F3F4F6; color:#4B5563; }
.rt-remove { background:#FEE2E2; color:#B91C1C; }
.rt-confirm { background:#3B82F6; color:#FFFFFF; }
`;

const injectStyles = () => {
  if (typeof document === 'undefined' || document.getElementById('rich-text-styles')) return;
  const style = document.createElement('style');
  style.id = 'rich-text-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
};

// ─── 툴바 ───

// 버튼을 눌러도 편집기의 선택 영역(과 아이폰 키보드)이 풀리지 않게 한다
const keepSelection = (event) => event.preventDefault();

function ToolButton({ label, title, active, disabled, onPress }) {
  return (
    <button
      type="button"
      className={'rt-btn' + (active ? ' is-active' : '')}
      title={title}
      aria-label={title}
      aria-pressed={active ? 'true' : 'false'}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor, onOpenLink }) {
  const [showSizes, setShowSizes] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      fontSize: e.getAttributes('textStyle').fontSize || null,
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const run = (apply) => () => apply(editor.chain().focus()).run();

  return (
    <>
      {/* 버튼 사이 여백을 눌러도 편집기 포커스(아이폰 키보드)가 빠지지 않게 툴바 전체에서 막는다 */}
      <div className="rt-toolbar" role="toolbar" aria-label="서식" onMouseDown={keepSelection}>
        <ToolButton
          label="가▾"
          title="글자 크기"
          active={showSizes || !!state.fontSize}
          onPress={() => setShowSizes((v) => !v)}
        />
        <span className="rt-sep" />
        <ToolButton label="H1" title="제목 1" active={state.h1} onPress={run((c) => c.toggleHeading({ level: 1 }))} />
        <ToolButton label="H2" title="제목 2" active={state.h2} onPress={run((c) => c.toggleHeading({ level: 2 }))} />
        <span className="rt-sep" />
        <ToolButton label={<b>B</b>} title="굵게" active={state.bold} onPress={run((c) => c.toggleBold())} />
        <ToolButton label={<i>I</i>} title="기울임꼴" active={state.italic} onPress={run((c) => c.toggleItalic())} />
        <ToolButton label={<u>U</u>} title="밑줄" active={state.underline} onPress={run((c) => c.toggleUnderline())} />
        <ToolButton label={<s>S</s>} title="취소선" active={state.strike} onPress={run((c) => c.toggleStrike())} />
        <span className="rt-sep" />
        <ToolButton label="•" title="글머리 기호 목록" active={state.bullet} onPress={run((c) => c.toggleBulletList())} />
        <ToolButton label="1." title="번호 목록" active={state.ordered} onPress={run((c) => c.toggleOrderedList())} />
        <ToolButton label="☑" title="체크리스트" active={state.task} onPress={run((c) => c.toggleTaskList())} />
        <span className="rt-sep" />
        <ToolButton label="🔗" title="링크" active={state.link} onPress={onOpenLink} />
        <span className="rt-sep" />
        <ToolButton label="↶" title="실행 취소" disabled={!state.canUndo} onPress={run((c) => c.undo())} />
        <ToolButton label="↷" title="다시 실행" disabled={!state.canRedo} onPress={run((c) => c.redo())} />
      </div>

      {showSizes && (
        <div className="rt-sizes" role="group" aria-label="글자 크기" onMouseDown={keepSelection}>
          {FONT_SIZES.map((size) => (
            <ToolButton
              key={size.label}
              label={size.label}
              title={`글자 크기: ${size.label}`}
              active={state.fontSize === size.value}
              onPress={() => {
                const chain = editor.chain().focus();
                (size.value ? chain.setFontSize(size.value) : chain.unsetFontSize()).run();
                setShowSizes(false);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── 링크 입력 창 ───

function LinkDialog({ draft, onApply, onRemove, onClose }) {
  const [text, setText] = useState(draft.text);
  const [href, setHref] = useState(draft.href);
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const url = normalizeUrl(href);
    if (!url) {
      setError('http(s) 주소, 이메일, 전화번호만 링크로 넣을 수 있습니다.');
      return;
    }
    onApply({ text: text.trim(), url });
  };

  return (
    <div className="rt-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="rt-dialog" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h3>{draft.href ? '링크 수정' : '링크 삽입'}</h3>
        <label htmlFor="rt-link-text">표시할 텍스트</label>
        <input id="rt-link-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="비워두면 주소가 표시됩니다" />
        <label htmlFor="rt-link-url">주소</label>
        <input
          id="rt-link-url"
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setError('');
          }}
          placeholder="https://example.com"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
        />
        {error ? <div className="rt-error">{error}</div> : null}
        <div className="rt-actions">
          <button type="button" className="rt-cancel" onClick={onClose}>
            취소
          </button>
          {draft.href ? (
            <button type="button" className="rt-remove" onClick={onRemove}>
              링크 제거
            </button>
          ) : null}
          <button type="submit" className="rt-confirm">
            확인
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── 편집기 ───

export function RichEditor({ initialDoc, placeholder, onChange }) {
  injectStyles();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [linkDraft, setLinkDraft] = useState(null);

  const editor = useEditor({
    extensions: buildExtensions({ placeholder }),
    content: initialDoc || '',
    editorProps: { attributes: { class: 'rt-content' } },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      onChangeRef.current && onChangeRef.current({ json, text: docToText(json) });
    },
  });

  if (!editor) return null;

  const openLinkDialog = () => {
    // 커서가 기존 링크 위에 있으면 그 링크 전체를 대상으로 잡는다
    if (editor.isActive('link')) editor.chain().extendMarkRange('link').run();
    let { from, to } = editor.state.selection;
    // 더블클릭 선택처럼 앞뒤 공백이 딸려온 경우 공백은 링크 범위에서 뺀다.
    // (빼지 않으면 표시 텍스트를 다듬은 것과 원래 선택이 달라져, 선택 영역의 굵게 등이 지워진다)
    const raw = editor.state.doc.textBetween(from, to, ' ');
    from += raw.length - raw.trimStart().length;
    to = Math.max(from, to - (raw.length - raw.trimEnd().length));
    const text = raw.trim();
    setLinkDraft({ from, to, text, originalText: text, href: editor.getAttributes('link').href || '' });
  };

  const applyLink = ({ text, url }) => {
    const { from, to, originalText } = linkDraft;
    const label = text || url;
    const chain = editor.chain().focus().setTextSelection({ from, to });
    if (from !== to && label === originalText) {
      // 선택한 글자는 그대로 두고 링크만 건다 (굵게 등 기존 서식 유지)
      chain.setLink({ href: url }).setTextSelection(to);
    } else {
      chain.insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] });
    }
    // 링크 바로 뒤에 이어 쓰는 글자까지 링크가 되지 않게 한다
    chain.unsetMark('link').run();
    setLinkDraft(null);
  };

  const removeLink = () => {
    const { from, to } = linkDraft;
    editor.chain().focus().setTextSelection({ from, to }).unsetLink().run();
    setLinkDraft(null);
  };

  return (
    <div className="rt-root rt-editing">
      <Toolbar editor={editor} onOpenLink={openLinkDialog} />
      <div className="rt-scroll">
        <EditorContent editor={editor} />
      </div>
      {linkDraft && (
        <LinkDialog
          draft={linkDraft}
          onApply={applyLink}
          onRemove={removeLink}
          onClose={() => {
            setLinkDraft(null);
            editor.commands.focus();
          }}
        />
      )}
    </div>
  );
}

// ─── 보기 (읽기 전용, 체크박스만 조작 가능) ───

// 체크박스가 속한 taskItem의 문서상 위치
const findTaskItemPos = (view, listItem) => {
  const contentDom = listItem.querySelector(':scope > div') || listItem;
  let pos;
  try {
    pos = view.posAtDOM(contentDom, 0);
  } catch (e) {
    return null;
  }
  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'taskItem') return $pos.before(depth);
  }
  return $pos.nodeAfter && $pos.nodeAfter.type.name === 'taskItem' ? pos : null;
};

export function RichViewer({ doc, onToggleTask }) {
  injectStyles();
  const containerRef = useRef(null);
  const onToggleRef = useRef(onToggleTask);
  onToggleRef.current = onToggleTask;

  const editor = useEditor({
    editable: false,
    // 읽기 전용에서도 체크박스 클릭을 허용 (실제 문서 반영은 아래 change 리스너에서)
    extensions: buildExtensions({ onReadOnlyChecked: () => true }),
    content: doc || '',
    editorProps: { attributes: { class: 'rt-content' } },
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!editor || !container) return undefined;

    const handleChange = (event) => {
      const input = event.target;
      if (!input || input.type !== 'checkbox') return;
      const listItem = input.closest('ul[data-type="taskList"] > li');
      if (!listItem) return;
      const pos = findTaskItemPos(editor.view, listItem);
      if (pos === null) return;
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: input.checked }));
      const json = editor.getJSON();
      onToggleRef.current && onToggleRef.current({ json, text: docToText(json) });
    };

    container.addEventListener('change', handleChange);
    return () => container.removeEventListener('change', handleChange);
  }, [editor]);

  return (
    <div className="rt-root rt-viewing" ref={containerRef}>
      <EditorContent editor={editor} />
    </div>
  );
}
