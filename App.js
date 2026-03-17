import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  StatusBar,
  Platform,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabaseClient';

// 사용 가능한 색상들
const COLORS = [
  { id: 'blue', name: '파랑', color: '#3B82F6', light: '#DBEAFE' },
  { id: 'green', name: '초록', color: '#10B981', light: '#D1FAE5' },
  { id: 'purple', name: '보라', color: '#8B5CF6', light: '#EDE9FE' },
  { id: 'pink', name: '핑크', color: '#EC4899', light: '#FCE7F3' },
  { id: 'orange', name: '주황', color: '#FF7F00', light: '#FFE5CC' },
  { id: 'red', name: '빨강', color: '#EF4444', light: '#FEE2E2' },
  { id: 'teal', name: '청록', color: '#D946EF', light: '#FAE8FF' },
  { id: 'indigo', name: '남색', color: '#84CC16', light: '#ECFCCB' },
  { id: 'yellow', name: '노랑', color: '#FFD400', light: '#FFF9E6' },
  { id: 'rose', name: '장미', color: '#06B6D4', light: '#CFFAFE' },
];

// "삭제된 카테고리" 예약 ID (고정)
const DELETED_CATEGORY_ID = 'deleted-category';

// 삭제된 카테고리 기본 색상(회색 계열)
const DELETED_CATEGORY_COLOR = {
  id: 'gray',
  name: '회색',
  color: '#6B7280',
  light: '#F3F4F6',
};

const buildDeletedCategory = () => ({
  id: DELETED_CATEGORY_ID,
  name: '삭제된 카테고리',
  color: DELETED_CATEGORY_COLOR,
  createdAt: new Date(0).toISOString(),
});

const ensureDeletedCategory = (cats) => {
  const exists = cats.some((c) => c.id === DELETED_CATEGORY_ID);
  return exists ? cats : [...cats, buildDeletedCategory()];
};

// 웹 이미지 압축 헬퍼
const compressImageWeb = (file, maxSize, quality) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// 정렬 모드
const SORT_MODES = [
  { id: 'latest', label: '최신' },
  { id: 'oldest', label: '오래된' },
  { id: 'title', label: '제목' },
];

export default function App() {
  // ─── 인증 상태 ───
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [resetSent, setResetSent] = useState(false);

  // ─── 데이터 상태 ───
  const [categories, setCategories] = useState([]);
  const [memos, setMemos] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [currentView, setCurrentView] = useState('list');
  const [currentMemo, setCurrentMemo] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);

  // 리스트 부가 기능 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState('latest');

  // 메모 입력 상태
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [memoCategories, setMemoCategories] = useState([]);
  const [memoPinned, setMemoPinned] = useState(false);
  const [memoImages, setMemoImages] = useState([]);

  // 카테고리 입력 상태
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState(COLORS[0]);
  const [editingCategory, setEditingCategory] = useState(null);

  // 모달 상태
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // ─── 인증 Effect ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 로그인 후 데이터 로드 + 마이그레이션 체크
  useEffect(() => {
    if (session) {
      loadData().then(() => {
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          const localMemos = localStorage.getItem('memos');
          const localCategories = localStorage.getItem('categories');
          if (localMemos || localCategories) {
            migrateLocalData();
          }
        }
      });
    }
  }, [session]);

  // ─── 인증 함수 ───
  const handleLogin = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setAuthError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setAuthError(error.message);
      }
    }
  };

  const handleSignUp = async () => {
    setAuthError('');
    if (!authEmail.trim()) {
      setAuthError('이메일을 입력하세요.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
    });
    if (error) {
      if (error.message.includes('already registered')) {
        setAuthError('이미 등록된 이메일입니다.');
      } else {
        setAuthError(error.message);
      }
    }
  };

  const handleResetPassword = async () => {
    setAuthError('');
    if (!authEmail.trim()) {
      setAuthError('이메일을 입력하세요.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
      redirectTo: 'https://cerulean-pie-99509e.netlify.app',
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setResetSent(true);
    }
  };

  const handleLogout = async () => {
    const message = '로그아웃 하시겠습니까?';
    if (Platform.OS === 'web') {
      if (!window.confirm(message)) return;
    } else {
      const confirmed = await new Promise((resolve) => {
        Alert.alert('로그아웃', message, [
          { text: '취소', style: 'cancel', onPress: () => resolve(false) },
          { text: '확인', onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }
    await supabase.auth.signOut();
    setCategories([]);
    setMemos([]);
    setSession(null);
  };

  // ─── 데이터 로드 (Supabase) ───
  const loadData = async () => {
    try {
      setDataLoading(true);

      const { data: dbCategories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: true });
      if (catError) throw catError;

      let parsedCategories = (dbCategories || []).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        createdAt: row.created_at,
      }));

      // 카테고리가 없으면 기본 생성
      if (parsedCategories.length === 0) {
        const now = Date.now();
        const defaults = [
          { id: now.toString(), user_id: session.user.id, name: '일반', color: COLORS[0], created_at: new Date().toISOString() },
          { id: (now + 1).toString(), user_id: session.user.id, name: '중요', color: COLORS[1], created_at: new Date().toISOString() },
          { id: (now + 2).toString(), user_id: session.user.id, name: '할일', color: COLORS[2], created_at: new Date().toISOString() },
        ];
        const { error: insertError } = await supabase.from('categories').insert(defaults);
        if (insertError) throw insertError;
        parsedCategories = defaults.map((d) => ({ id: d.id, name: d.name, color: d.color, createdAt: d.created_at }));
      }

      const { data: dbMemos, error: memoError } = await supabase
        .from('memos')
        .select('*')
        .order('updated_at', { ascending: false });
      if (memoError) throw memoError;

      let parsedMemos = (dbMemos || []).map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        categoryIds: row.category_ids || [],
        pinned: row.pinned || false,
        images: row.images || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      const hasDeletedRef = parsedMemos.some((m) => m.categoryIds && m.categoryIds.includes(DELETED_CATEGORY_ID));
      if (hasDeletedRef) {
        parsedCategories = ensureDeletedCategory(parsedCategories);
      }

      setCategories(parsedCategories);
      setMemos(parsedMemos);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      const msg = '데이터를 불러오는데 실패했습니다.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('오류', msg);
      }
    } finally {
      setDataLoading(false);
    }
  };

  // ─── localStorage → Supabase 마이그레이션 ───
  const migrateLocalData = async () => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;

    const localMemos = localStorage.getItem('memos');
    const localCategories = localStorage.getItem('categories');
    if (!localMemos && !localCategories) return;

    const confirmed = window.confirm(
      '기존 로컬 데이터를 발견했습니다.\n서버로 가져오시겠습니까?\n\n(가져오기를 하면 기기 변경/캐시 삭제 후에도 메모가 유지됩니다)'
    );
    if (!confirmed) {
      localStorage.removeItem('memos');
      localStorage.removeItem('categories');
      return;
    }

    try {
      if (localCategories) {
        const cats = JSON.parse(localCategories);
        const rows = cats.map((c) => ({
          id: c.id,
          user_id: session.user.id,
          name: c.name,
          color: c.color,
          created_at: c.createdAt || new Date().toISOString(),
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'id' });
          if (error) throw error;
        }
      }

      if (localMemos) {
        const memosArr = JSON.parse(localMemos);
        for (const memo of memosArr) {
          const newImages = [];
          const images = memo.images || [];
          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (img.startsWith('data:')) {
              try {
                const response = await fetch(img);
                const blob = await response.blob();
                const fileName = `${session.user.id}/${memo.id}/migrated-${i}.jpg`;
                const { error: uploadError } = await supabase.storage
                  .from('memo-images')
                  .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
                if (uploadError) {
                  console.error('이미지 마이그레이션 실패:', uploadError);
                  continue;
                }
                const { data: { publicUrl } } = supabase.storage
                  .from('memo-images')
                  .getPublicUrl(fileName);
                newImages.push(publicUrl);
              } catch (e) {
                console.error('이미지 변환 실패:', e);
              }
            } else {
              newImages.push(img);
            }
          }

          const categoryIds = memo.categoryIds || (memo.categoryId ? [memo.categoryId] : []);
          const row = {
            id: memo.id,
            user_id: session.user.id,
            title: memo.title || '제목 없음',
            content: memo.content || '',
            category_ids: categoryIds,
            pinned: memo.pinned || false,
            images: newImages,
            created_at: memo.createdAt || new Date().toISOString(),
            updated_at: memo.updatedAt || new Date().toISOString(),
          };
          const { error } = await supabase.from('memos').upsert(row, { onConflict: 'id' });
          if (error) throw error;
        }
      }

      localStorage.removeItem('memos');
      localStorage.removeItem('categories');
      await loadData();
      window.alert('데이터 마이그레이션이 완료되었습니다!');
    } catch (error) {
      console.error('마이그레이션 실패:', error);
      window.alert('데이터 마이그레이션 중 오류가 발생했습니다: ' + error.message);
    }
  };

  // ─── 카테고리 저장 (Supabase) ───
  const saveCategories = async (newCategories) => {
    try {
      setCategories(newCategories);
      const rows = newCategories.map((c) => ({
        id: c.id,
        user_id: session.user.id,
        name: c.name,
        color: c.color,
        created_at: c.createdAt || new Date().toISOString(),
      }));
      const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (error) {
      console.error('카테고리 저장 실패:', error);
      const msg = '카테고리 저장 중 오류 발생';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('오류', msg);
    }
  };

  // ─── 메모 저장 (Supabase) ───
  const saveMemos = async (newMemos) => {
    try {
      setMemos(newMemos);
      const rows = newMemos.map((m) => ({
        id: m.id,
        user_id: session.user.id,
        title: m.title,
        content: m.content,
        category_ids: m.categoryIds,
        pinned: m.pinned,
        images: m.images,
        created_at: m.createdAt,
        updated_at: m.updatedAt,
      }));
      const { error } = await supabase.from('memos').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('메모 저장 실패:', error);
      const msg = '메모 저장 중 오류 발생';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('오류', msg);
      return false;
    }
  };

  // ─── 카테고리 관리 ───
  const createOrUpdateCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert('알림', '카테고리 이름을 입력하세요.');
      return;
    }

    if (editingCategory) {
      const updatedCategories = categories.map((c) =>
        c.id === editingCategory.id ? { ...c, name: categoryName, color: categoryColor } : c
      );
      await saveCategories(updatedCategories);
    } else {
      const newCategory = {
        id: Date.now().toString(),
        name: categoryName,
        color: categoryColor,
        createdAt: new Date().toISOString(),
      };
      await saveCategories([...categories, newCategory]);
    }

    setCategoryName('');
    setCategoryColor(COLORS[0]);
    setEditingCategory(null);
    setShowCategoryModal(false);
  };

  const deleteCategory = async (id) => {
    if (id === DELETED_CATEGORY_ID) {
      if (Platform.OS === 'web') {
        window.alert("'삭제된 카테고리'는 삭제할 수 없습니다.");
      } else {
        Alert.alert('알림', "'삭제된 카테고리'는 삭제할 수 없습니다.");
      }
      return;
    }

    const target = categories.find((c) => c.id === id);
    if (!target) return;
    const affectedMemos = memos.filter((m) => m.categoryIds && m.categoryIds.includes(id));
    const affectedCount = affectedMemos.length;

    const message =
      affectedCount > 0
        ? `해당 카테고리로 등록된 메모가 ${affectedCount}개 존재합니다.\n그래도 삭제하시겠습니까?\n삭제 시 해당 카테고리는 '삭제된 카테고리'로 대체됩니다.`
        : '이 카테고리를 삭제하시겠습니까?';

    let confirmed;
    if (Platform.OS === 'web') {
      confirmed = window.confirm(message);
    } else {
      confirmed = await new Promise((resolve) => {
        Alert.alert('카테고리 삭제', message, [
          { text: '취소', style: 'cancel', onPress: () => resolve(false) },
          { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
    }
    if (!confirmed) return;

    try {
      // Supabase에서 카테고리 삭제
      const { error: delError } = await supabase.from('categories').delete().eq('id', id);
      if (delError) throw delError;

      // 영향받는 메모 업데이트
      if (affectedCount > 0) {
        const deletedCat = buildDeletedCategory();
        await supabase.from('categories').upsert({
          id: deletedCat.id,
          user_id: session.user.id,
          name: deletedCat.name,
          color: deletedCat.color,
          created_at: deletedCat.createdAt,
        }, { onConflict: 'id' });

        for (const memo of affectedMemos) {
          const newCategoryIds = memo.categoryIds.filter((cid) => cid !== id);
          if (!newCategoryIds.includes(DELETED_CATEGORY_ID)) {
            newCategoryIds.push(DELETED_CATEGORY_ID);
          }
          await supabase.from('memos').update({ category_ids: newCategoryIds }).eq('id', memo.id);
        }
      }

      // 로컬 상태 업데이트
      let nextCategories = categories.filter((c) => c.id !== id);
      if (affectedCount > 0) {
        nextCategories = ensureDeletedCategory(nextCategories);
      }
      setCategories(nextCategories);

      setMemos((prev) =>
        prev.map((m) => {
          if (m.categoryIds && m.categoryIds.includes(id)) {
            const newCategoryIds = m.categoryIds.filter((cid) => cid !== id);
            if (!newCategoryIds.includes(DELETED_CATEGORY_ID)) {
              newCategoryIds.push(DELETED_CATEGORY_ID);
            }
            return { ...m, categoryIds: newCategoryIds };
          }
          return m;
        })
      );

      setSelectedCategories((prev) => prev.filter((cid) => cid !== id));
    } catch (error) {
      console.error('카테고리 삭제 실패:', error);
      const msg = '카테고리 삭제 중 오류 발생';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('오류', msg);
    }
  };

  // ─── 메모 관리 ───
  const createNewMemo = () => {
    setCurrentMemo(null);
    setTitle('');
    setContent('');
    setMemoCategories([]);
    setMemoPinned(false);
    setMemoImages([]);
    setCurrentView('edit');
  };

  const editMemo = (memo) => {
    setCurrentMemo(memo);
    setTitle(memo.title);
    setContent(memo.content);
    setMemoCategories(memo.categoryIds || []);
    setMemoPinned(!!memo.pinned);
    setMemoImages(memo.images || []);
    setCurrentView('edit');
  };

  const saveMemo = async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('알림', '제목이나 내용을 입력하세요.');
      return;
    }

    const now = new Date().toISOString();
    let success = false;

    if (currentMemo) {
      const updated = memos.map((m) =>
        m.id === currentMemo.id
          ? {
              ...m,
              title: title.trim() || '제목 없음',
              content,
              categoryIds: memoCategories,
              pinned: memoPinned,
              images: memoImages,
              updatedAt: now,
            }
          : m
      );
      success = await saveMemos(updated);
    } else {
      const newMemo = {
        id: Date.now().toString(),
        title: title.trim() || '제목 없음',
        content,
        categoryIds: memoCategories,
        pinned: memoPinned,
        images: memoImages,
        createdAt: now,
        updatedAt: now,
      };
      success = await saveMemos([newMemo, ...memos]);
    }

    if (success) {
      setCurrentView('list');
    }
  };

  const deleteMemo = async (id) => {
    const message = '이 메모를 삭제하시겠습니까?';

    let confirmed;
    if (Platform.OS === 'web') {
      confirmed = window.confirm(message);
    } else {
      confirmed = await new Promise((resolve) => {
        Alert.alert('메모 삭제', message, [
          { text: '취소', style: 'cancel', onPress: () => resolve(false) },
          { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
    }
    if (!confirmed) return;

    try {
      // 연관 이미지 삭제
      const memo = memos.find((m) => m.id === id);
      if (memo && memo.images && memo.images.length > 0) {
        const paths = memo.images
          .map((url) => {
            const match = url.match(/memo-images\/(.+)$/);
            return match ? match[1] : null;
          })
          .filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('memo-images').remove(paths);
        }
      }

      const { error } = await supabase.from('memos').delete().eq('id', id);
      if (error) throw error;
      setMemos((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      console.error('메모 삭제 실패:', error);
      const msg = '메모 삭제 중 오류 발생';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('오류', msg);
    }
  };

  const togglePinMemo = async (id) => {
    const memo = memos.find((m) => m.id === id);
    if (!memo) return;
    const newPinned = !memo.pinned;

    const { error } = await supabase.from('memos').update({ pinned: newPinned }).eq('id', id);
    if (error) {
      console.error('핀 토글 실패:', error);
      return;
    }
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: newPinned } : m)));
  };

  // ─── 이미지 업로드 (Supabase Storage) ───
  const pickAndUploadImages = async () => {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async (e) => {
          const files = Array.from(e.target.files);
          for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
              window.alert('이미지는 5MB 이하만 가능합니다.');
              continue;
            }
            try {
              const compressedBlob = await compressImageWeb(file, 600, 0.5);
              const memoId = currentMemo ? currentMemo.id : 'temp-' + Date.now();
              const fileName = `${session.user.id}/${memoId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
              const { error: uploadError } = await supabase.storage
                .from('memo-images')
                .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });
              if (uploadError) {
                console.error('이미지 업로드 오류:', uploadError);
                continue;
              }
              const { data: { publicUrl } } = supabase.storage
                .from('memo-images')
                .getPublicUrl(fileName);
              setMemoImages((prev) => [...prev, publicUrl]);
            } catch (err) {
              console.error('이미지 처리 오류:', err);
            }
          }
        };
        input.click();
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          quality: 0.5,
          allowsEditing: false,
          maxWidth: 600,
          maxHeight: 600,
        });

        if (!result.canceled) {
          for (const asset of result.assets) {
            try {
              const memoId = currentMemo ? currentMemo.id : 'temp-' + Date.now();
              const fileName = `${session.user.id}/${memoId}/${Date.now()}.jpg`;
              const response = await fetch(asset.uri);
              const blob = await response.blob();
              const { error: uploadError } = await supabase.storage
                .from('memo-images')
                .upload(fileName, blob, { contentType: 'image/jpeg' });
              if (uploadError) {
                console.error('이미지 업로드 오류:', uploadError);
                continue;
              }
              const { data: { publicUrl } } = supabase.storage
                .from('memo-images')
                .getPublicUrl(fileName);
              setMemoImages((prev) => [...prev, publicUrl]);
            } catch (err) {
              console.error('이미지 처리 오류:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
      Alert.alert('오류', '이미지 업로드 중 오류가 발생했습니다.');
    }
  };

  // ─── 정렬/필터 ───
  const displayedMemos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let arr =
      selectedCategories.length > 0
        ? memos.filter((m) => m.categoryIds && m.categoryIds.some((cid) => selectedCategories.includes(cid)))
        : [...memos];

    if (q) {
      arr = arr.filter((m) => {
        const t = (m.title || '').toLowerCase();
        const c = (m.content || '').toLowerCase();
        return t.includes(q) || c.includes(q);
      });
    }

    const compare = (a, b) => {
      if (sortMode === 'oldest') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      if (sortMode === 'title') return (a.title || '').localeCompare(b.title || '', 'ko');
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    };

    const pinned = arr.filter((m) => m.pinned);
    const normal = arr.filter((m) => !m.pinned);
    pinned.sort(compare);
    normal.sort(compare);
    return [...pinned, ...normal];
  }, [memos, selectedCategories, searchQuery, sortMode]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;

    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // ═══════════════════════════════════════════
  // 렌더링
  // ═══════════════════════════════════════════

  // 로딩 화면
  if (authLoading) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 16 }}>로딩 중...</Text>
      </View>
    );
  }

  // ─── 인증 화면 ───
  if (!session) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.authTitle}>📝 메모 앱</Text>

        {authMode === 'reset' ? (
          // 비밀번호 재설정 화면
          <>
            <Text style={styles.authSubtitle}>비밀번호 재설정</Text>
            {resetSent ? (
              <>
                <View style={styles.authSuccessBox}>
                  <Text style={styles.authSuccessText}>
                    비밀번호 재설정 링크가 이메일로 발송되었습니다.{'\n'}이메일을 확인해주세요.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setAuthMode('login'); setResetSent(false); setAuthError(''); }}
                  style={[styles.authButton, { backgroundColor: '#6B7280' }]}
                >
                  <Text style={styles.authButtonText}>로그인으로 돌아가기</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.authHint}>가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="이메일"
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}
                <TouchableOpacity onPress={handleResetPassword} style={styles.authButton}>
                  <Text style={styles.authButtonText}>재설정 링크 보내기</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setAuthMode('login'); setAuthError(''); }}>
                  <Text style={styles.authLinkText}>← 로그인으로 돌아가기</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          // 로그인 / 회원가입 화면
          <>
            <Text style={styles.authSubtitle}>
              {authMode === 'signup' ? '새 계정 만들기' : '로그인'}
            </Text>

            <TextInput
              style={styles.authInput}
              placeholder="이메일"
              value={authEmail}
              onChangeText={setAuthEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.authInput}
              placeholder="비밀번호"
              value={authPassword}
              onChangeText={setAuthPassword}
              secureTextEntry
            />

            {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}

            <TouchableOpacity
              onPress={authMode === 'signup' ? handleSignUp : handleLogin}
              style={styles.authButton}
            >
              <Text style={styles.authButtonText}>
                {authMode === 'signup' ? '회원가입' : '로그인'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}
            >
              <Text style={styles.authLinkText}>
                {authMode === 'signup' ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
              </Text>
            </TouchableOpacity>

            {authMode === 'login' && (
              <TouchableOpacity onPress={() => { setAuthMode('reset'); setAuthError(''); setResetSent(false); }}>
                <Text style={[styles.authLinkText, { color: '#6B7280', marginTop: 8 }]}>
                  비밀번호를 잊으셨나요?
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  }

  // 데이터 로딩 화면
  if (dataLoading) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 16 }}>데이터 불러오는 중...</Text>
      </View>
    );
  }

  // ─── 카테고리 편집 화면 ───
  if (currentView === 'categoryEdit') {
    const visibleCategories = categories.filter((cat) => cat.id !== DELETED_CATEGORY_ID);

    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: Platform.OS === 'ios' ? 44 : 0 }}>
        <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setCurrentView('list')}>
              <Text style={styles.headerButton}>← 닫기</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>카테고리 관리</Text>
            <TouchableOpacity
              onPress={() => {
                setCategoryName('');
                setCategoryColor(COLORS[0]);
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
            >
              <Text style={styles.headerButton}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {visibleCategories.map((cat) => (
              <View key={cat.id} style={[styles.categoryItem, { backgroundColor: cat.color.light }]}>
                <View style={styles.categoryInfo}>
                  <View style={[styles.colorDot, { backgroundColor: cat.color.color }]} />
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </View>

                <View style={styles.categoryActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setCategoryName(cat.name);
                      setCategoryColor(cat.color);
                      setEditingCategory(cat);
                      setShowCategoryModal(true);
                    }}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>수정</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => deleteCategory(cat.id)}
                    style={[styles.actionButton, styles.deleteButton]}
                  >
                    <Text style={styles.deleteButtonText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {visibleCategories.length === 0 && (
              <Text style={styles.emptyText}>
                카테고리가 없습니다.{'\n'}+ 추가 버튼을 눌러 만들어보세요!
              </Text>
            )}
          </ScrollView>

          <Modal visible={showCategoryModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{editingCategory ? '카테고리 수정' : '새 카테고리'}</Text>

                <TextInput
                  style={styles.input}
                  placeholder="카테고리 이름"
                  value={categoryName}
                  onChangeText={setCategoryName}
                />

                <Text style={styles.label}>색상 선택:</Text>
                <View style={styles.colorGrid}>
                  {COLORS.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setCategoryColor(c)}
                      style={[
                        styles.colorOption,
                        { backgroundColor: c.color },
                        categoryColor.id === c.id && styles.selectedColor,
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCategoryModal(false);
                      setEditingCategory(null);
                    }}
                    style={[styles.modalButton, styles.cancelButton]}
                  >
                    <Text style={styles.cancelButtonText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={createOrUpdateCategory} style={[styles.modalButton, styles.saveButton]}>
                    <Text style={styles.saveButtonText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    );
  }

  // ─── 메모 작성/수정 화면 ───
  if (currentView === 'edit') {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: Platform.OS === 'ios' ? 44 : 0 }}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#FFFFFF' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
        >
          <StatusBar barStyle="dark-content" />
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setCurrentView('list')}>
              <Text style={styles.headerButton}>← 취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveMemo}>
              <Text style={[styles.headerButton, styles.saveText]}>완료</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.metaSection}>
              <TextInput
                style={styles.titleInput}
                placeholder="제목"
                value={title}
                onChangeText={setTitle}
                placeholderTextColor="#9CA3AF"
              />

              <View style={styles.metaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.metaLabel}>카테고리</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {categories
                      .filter((cat) => cat.id !== DELETED_CATEGORY_ID)
                      .map((cat) => {
                        const isSelected = memoCategories.includes(cat.id);
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => {
                              if (isSelected) {
                                setMemoCategories(memoCategories.filter((cid) => cid !== cat.id));
                              } else {
                                setMemoCategories([...memoCategories, cat.id]);
                              }
                            }}
                            style={[
                              styles.categoryChipCompact,
                              { backgroundColor: cat.color.light },
                              isSelected && styles.selectedChipCompact,
                            ]}
                          >
                            <Text style={[styles.chipTextCompact, isSelected && styles.selectedChipTextCompact]}>
                              {isSelected ? '✓ ' : ''}{cat.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>

                <TouchableOpacity
                  onPress={() => setMemoPinned((p) => !p)}
                  style={[styles.pinToggleCompact, memoPinned && styles.pinToggleActiveCompact]}
                >
                  <Text style={[styles.pinToggleTextCompact, memoPinned && styles.pinToggleTextActiveCompact]}>
                    {memoPinned ? '📌' : '📌'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />
            </View>

            <TextInput
              style={styles.contentInput}
              placeholder="여기에 메모를 작성하세요..."
              value={content}
              onChangeText={setContent}
              multiline
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.imageSection}>
              <View style={styles.imageSectionHeader}>
                <Text style={styles.imageSectionLabel}>📎 첨부 이미지</Text>
                <TouchableOpacity onPress={pickAndUploadImages} style={styles.imageButtonCompact}>
                  <Text style={styles.imageButtonTextCompact}>+ 추가</Text>
                </TouchableOpacity>
              </View>

              {memoImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageList}>
                  {memoImages.map((img, idx) => (
                    <View key={idx} style={styles.imageContainer}>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedImage(memoImages);
                          setSelectedImageIndex(idx);
                          setShowImageModal(true);
                        }}
                      >
                        <Image source={{ uri: img }} style={styles.imagePreview} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setMemoImages(memoImages.filter((_, i) => i !== idx))}
                        style={styles.imageDeleteButton}
                      >
                        <Text style={styles.imageDeleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>

          <Modal visible={showImageModal} transparent animationType="fade">
            <View style={styles.imageModalOverlay}>
              <TouchableOpacity style={styles.imageModalCloseButton} onPress={() => setShowImageModal(false)}>
                <Text style={styles.imageModalCloseText}>✕</Text>
              </TouchableOpacity>

              {selectedImage && selectedImage.length > 0 && (
                <>
                  <Image
                    source={{ uri: selectedImage[selectedImageIndex] }}
                    style={styles.imageModalImage}
                    resizeMode="contain"
                  />
                  <View style={styles.imageModalCounter}>
                    <Text style={styles.imageModalCounterText}>
                      {selectedImageIndex + 1} / {selectedImage.length}
                    </Text>
                  </View>
                  {selectedImage.length > 1 && (
                    <>
                      {selectedImageIndex > 0 && (
                        <TouchableOpacity
                          style={[styles.imageModalNavButton, styles.imageModalPrevButton]}
                          onPress={() => setSelectedImageIndex((prev) => prev - 1)}
                        >
                          <Text style={styles.imageModalNavText}>‹</Text>
                        </TouchableOpacity>
                      )}
                      {selectedImageIndex < selectedImage.length - 1 && (
                        <TouchableOpacity
                          style={[styles.imageModalNavButton, styles.imageModalNextButton]}
                          onPress={() => setSelectedImageIndex((prev) => prev + 1)}
                        >
                          <Text style={styles.imageModalNavText}>›</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─── 메모 목록 화면 ───
  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: Platform.OS === 'ios' ? 44 : 0 }}>
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>메모</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setCurrentView('categoryEdit')} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>📁</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={createNewMemo} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>🚪</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="검색 (제목/내용)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sortBar}>
          {SORT_MODES.map((m) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => setSortMode(m.id)}
              style={[styles.sortChip, sortMode === m.id && styles.sortChipSelected]}
            >
              <Text style={[styles.sortChipText, sortMode === m.id && styles.sortChipTextSelected]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {categories.filter((cat) => cat.id !== DELETED_CATEGORY_ID).length > 0 && (
          <View style={styles.filterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setSelectedCategories([])}
                style={[styles.filterChip, selectedCategories.length === 0 && styles.selectedFilterChip]}
              >
                <Text style={[styles.filterChipText, selectedCategories.length === 0 && styles.selectedFilterChipText]}>
                  전체
                </Text>
              </TouchableOpacity>

              {categories
                .filter((cat) => cat.id !== DELETED_CATEGORY_ID)
                .map((cat) => {
                  const isSelected = selectedCategories.includes(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedCategories(selectedCategories.filter((cid) => cid !== cat.id));
                        } else {
                          setSelectedCategories([...selectedCategories, cat.id]);
                        }
                      }}
                      style={[
                        styles.filterChip,
                        { backgroundColor: cat.color.light },
                        isSelected && styles.selectedFilterChip,
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && styles.selectedFilterChipText]}>
                        {isSelected ? '✓ ' : ''}{cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        )}

        <ScrollView style={styles.content}>
          {displayedMemos.length === 0 ? (
            <Text style={styles.emptyText}>
              {selectedCategories.length > 0 || searchQuery.trim()
                ? '조건에 맞는 메모가 없습니다'
                : '메모가 없습니다.\n✏️ 버튼을 눌러 새 메모를 작성해보세요!'}
            </Text>
          ) : (
            displayedMemos.map((memo) => {
              const memoCats = (memo.categoryIds || [])
                .map((cid) => categories.find((c) => c.id === cid))
                .filter(Boolean);
              const firstCategory = memoCats[0];
              const cardBgColor = firstCategory ? firstCategory.color.light : '#FFFFFF';

              return (
                <TouchableOpacity
                  key={memo.id}
                  onPress={() => editMemo(memo)}
                  style={[styles.memoCard, { backgroundColor: cardBgColor }]}
                >
                  <View style={styles.memoHeader}>
                    <View style={styles.memoTitleRow}>
                      {memo.pinned && <Text style={styles.pinnedBadge}>📌</Text>}
                      <Text style={styles.memoTitle} numberOfLines={1}>
                        {memo.title}
                      </Text>
                    </View>

                    <View style={styles.memoHeaderActions}>
                      <TouchableOpacity onPress={() => togglePinMemo(memo.id)} style={styles.smallIconButton}>
                        <Text style={[styles.smallIcon, memo.pinned && styles.smallIconActive]}>📌</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMemo(memo.id)} style={styles.smallIconButton}>
                        <Text style={styles.smallIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {memo.content && (
                    <Text style={styles.memoContent} numberOfLines={2}>
                      {memo.content}
                    </Text>
                  )}

                  {memo.images && memo.images.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memoImageList}>
                      {memo.images.slice(0, 3).map((img, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => {
                            setSelectedImage(memo.images);
                            setSelectedImageIndex(idx);
                            setShowImageModal(true);
                          }}
                        >
                          <Image source={{ uri: img }} style={styles.memoImagePreview} />
                        </TouchableOpacity>
                      ))}
                      {memo.images.length > 3 && (
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedImage(memo.images);
                            setSelectedImageIndex(3);
                            setShowImageModal(true);
                          }}
                          style={styles.moreImagesIndicator}
                        >
                          <Text style={styles.moreImagesText}>+{memo.images.length - 3}</Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  )}

                  <View style={styles.memoFooter}>
                    <View style={styles.memoCategoryList}>
                      {memoCats.map((cat) => (
                        <View key={cat.id} style={[styles.memoCategoryTag, { backgroundColor: cat.color.color }]}>
                          <Text style={styles.memoCategoryText}>{cat.name}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.memoDate}>{formatDate(memo.updatedAt)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <Modal visible={showImageModal} transparent animationType="fade">
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity style={styles.imageModalCloseButton} onPress={() => setShowImageModal(false)}>
              <Text style={styles.imageModalCloseText}>✕</Text>
            </TouchableOpacity>

            {selectedImage && selectedImage.length > 0 && (
              <>
                <Image
                  source={{ uri: selectedImage[selectedImageIndex] }}
                  style={styles.imageModalImage}
                  resizeMode="contain"
                />
                <View style={styles.imageModalCounter}>
                  <Text style={styles.imageModalCounterText}>
                    {selectedImageIndex + 1} / {selectedImage.length}
                  </Text>
                </View>
                {selectedImage.length > 1 && (
                  <>
                    {selectedImageIndex > 0 && (
                      <TouchableOpacity
                        style={[styles.imageModalNavButton, styles.imageModalPrevButton]}
                        onPress={() => setSelectedImageIndex((prev) => prev - 1)}
                      >
                        <Text style={styles.imageModalNavText}>‹</Text>
                      </TouchableOpacity>
                    )}
                    {selectedImageIndex < selectedImage.length - 1 && (
                      <TouchableOpacity
                        style={[styles.imageModalNavButton, styles.imageModalNextButton]}
                        onPress={() => setSelectedImageIndex((prev) => prev + 1)}
                      >
                        <Text style={styles.imageModalNavText}>›</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 센터 스크린 (로딩, 인증)
  centerScreen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // 인증 화면
  authTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },
  authHint: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
    width: '100%',
    maxWidth: 360,
  },
  authInput: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  authErrorText: {
    color: '#EF4444',
    marginBottom: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  authButton: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  authLinkText: {
    color: '#3B82F6',
    fontSize: 14,
    marginTop: 16,
  },
  authSuccessBox: {
    backgroundColor: '#D1FAE5',
    padding: 16,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
    maxWidth: 360,
  },
  authSuccessText: {
    color: '#065F46',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerButton: {
    fontSize: 16,
    color: '#3B82F6',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  iconButtonText: {
    fontSize: 24,
  },
  saveText: {
    fontWeight: '600',
  },

  // 검색/정렬 바
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  clearButton: {
    marginLeft: 10,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#4B5563',
  },
  sortBar: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  sortChipSelected: {
    backgroundColor: '#1F2937',
  },
  sortChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  sortChipTextSelected: {
    color: '#FFFFFF',
  },

  // 필터 바
  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 34,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedFilterChip: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    fontWeight: '600',
  },
  selectedFilterChipText: {
    color: '#FFFFFF',
  },

  // 공통 컨텐츠 영역
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // 메모 카드
  memoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  memoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
  },
  memoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  pinnedBadge: {
    fontSize: 14,
  },
  memoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  memoHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallIconButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  smallIcon: {
    fontSize: 20,
  },
  smallIconActive: {
    opacity: 1,
  },
  memoContent: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  memoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memoCategoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memoCategoryText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  memoDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // 빈 상태
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 60,
    lineHeight: 24,
  },

  // 편집 화면
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
    paddingVertical: 8,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pinToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  pinToggleActive: {
    backgroundColor: '#111827',
  },
  pinToggleText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },
  pinToggleTextActive: {
    color: '#FFFFFF',
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedChip: {
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  chipText: {
    fontSize: 11,
    color: '#1F2937',
    lineHeight: 18,
    fontWeight: '600',
  },
  contentInput: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 24,
    flex: 1,
    minHeight: 300,
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlignVertical: 'top',
  },
  metaSection: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
  },
  metaLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 16,
  },
  categoryChipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedChipCompact: {
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  chipTextCompact: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '600',
  },
  selectedChipTextCompact: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  pinToggleCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  pinToggleActiveCompact: {
    backgroundColor: '#DBEAFE',
  },
  pinToggleTextCompact: {
    fontSize: 20,
  },
  pinToggleTextActiveCompact: {
    fontSize: 20,
  },
  imageSection: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  imageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageSectionLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  imageButtonCompact: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  imageButtonTextCompact: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // 카테고리 화면
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: '#1F2937',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  selectedChipText: {
    fontWeight: '700',
  },

  // 이미지 관련 스타일
  imageButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  imageList: {
    marginTop: 8,
  },
  imageContainer: {
    position: 'relative',
    marginRight: 8,
  },
  imagePreview: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    borderRadius: 8,
  },
  imageDeleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageDeleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // 메모 카드 이미지
  memoImageList: {
    marginVertical: 8,
  },
  memoImagePreview: {
    width: 60,
    height: 60,
    resizeMode: 'cover',
    borderRadius: 6,
    marginRight: 6,
  },
  moreImagesIndicator: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreImagesText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },

  // 카테고리 리스트
  memoCategoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },

  // 이미지 뷰어 모달
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImage: {
    width: '100%',
    height: '80%',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  imageModalCloseText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  imageModalCounter: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  imageModalCounterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  imageModalNavButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    top: '50%',
    marginTop: -25,
  },
  imageModalPrevButton: {
    left: 20,
  },
  imageModalNextButton: {
    right: 20,
  },
  imageModalNavText: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: 'bold',
  },
});
