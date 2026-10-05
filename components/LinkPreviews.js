import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabaseClient';

// 한 메모에서 미리보기를 만드는 링크 수 (Edge Function 호출량 제한)
const MAX_PREVIEWS = 3;

// 앱이 켜져 있는 동안 같은 주소는 한 번만 요청한다 (서버 쪽에도 7일 캐시가 있다)
const previewCache = new Map();

const loadPreview = (url) => {
  if (!previewCache.has(url)) {
    const request = supabase.functions
      .invoke('link-preview', { body: { url } })
      .then(({ data, error }) => {
        if (error || !data) throw error || new Error('empty');
        return data;
      })
      .catch(() => {
        previewCache.delete(url); // 일시적인 실패는 다음에 다시 시도
        return { ok: false, url };
      });
    previewCache.set(url, request);
  }
  return previewCache.get(url);
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
};

function PreviewCard({ url }) {
  const [preview, setPreview] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadPreview(url).then((data) => active && setPreview(data));
    return () => {
      active = false;
    };
  }, [url]);

  const host = hostOf(url);
  const loading = preview === null;
  const ok = !!(preview && preview.ok);
  // 제목을 못 얻은 사이트(봇 차단 등)는 도메인만 보여준다
  const title = ok && preview.title ? preview.title : host;
  const description = ok ? preview.description : null;
  const footer = ok && preview.siteName && preview.siteName !== title ? `${preview.siteName} · ${host}` : host;
  const showImage = ok && preview.image && !imageFailed;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={`${title} 링크 열기`}
    >
      <View style={styles.thumb}>
        {loading ? (
          <ActivityIndicator color="#9CA3AF" />
        ) : showImage ? (
          <Image source={{ uri: preview.image }} style={styles.thumbImage} onError={() => setImageFailed(true)} />
        ) : (
          <Text style={styles.thumbIcon}>🔗</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <Text style={styles.host} numberOfLines={1}>
          {footer}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function LinkPreviews({ urls }) {
  if (!urls || urls.length === 0) return null;
  return (
    <View style={styles.list}>
      {urls.slice(0, MAX_PREVIEWS).map((url) => (
        <PreviewCard key={url} url={url} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 20,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  thumb: {
    width: 88,
    minHeight: 88,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: 88,
    height: '100%',
    minHeight: 88,
    resizeMode: 'cover',
  },
  thumbIcon: {
    fontSize: 26,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  host: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
