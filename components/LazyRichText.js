import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, View } from 'react-native';

// 서식 편집기는 용량이 커서 첫 화면 로딩에 포함하지 않고, 메모를 열 때 불러온다.
export const preloadRichText = () => import('./RichText');

const LazyEditor = lazy(() => preloadRichText().then((m) => ({ default: m.RichEditor })));
const LazyViewer = lazy(() => preloadRichText().then((m) => ({ default: m.RichViewer })));

const Fallback = () => (
  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
    <ActivityIndicator color="#3B82F6" />
  </View>
);

export function RichEditor(props) {
  return (
    <Suspense fallback={<Fallback />}>
      <LazyEditor {...props} />
    </Suspense>
  );
}

export function RichViewer(props) {
  return (
    <Suspense fallback={<Fallback />}>
      <LazyViewer {...props} />
    </Suspense>
  );
}
