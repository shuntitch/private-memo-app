import React, { useState } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { docToText } from '../richText';

// 네이티브 앱용 대체 구현.
// 서식 편집기(TipTap)는 웹 전용이라, 네이티브에서는 서식을 일반 텍스트로 보여주고 편집한다.
// 네이티브에서 편집하면 서식 정보(json)는 비워서 저장하므로 일반 텍스트가 기준이 된다.

export function RichEditor({ initialDoc, placeholder, onChange }) {
  const [text, setText] = useState(() => docToText(initialDoc));
  return (
    <TextInput
      style={styles.input}
      value={text}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      multiline
      onChangeText={(value) => {
        setText(value);
        onChange && onChange({ json: null, text: value });
      }}
    />
  );
}

export function RichViewer({ doc }) {
  return (
    <Text style={styles.text} selectable>
      {docToText(doc)}
    </Text>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minHeight: 300,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    color: '#1F2937',
    textAlignVertical: 'top',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1F2937',
  },
});
