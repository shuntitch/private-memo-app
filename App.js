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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

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

// 정렬 모드
const SORT_MODES = [
  { id: 'latest', label: '최신' },
  { id: 'oldest', label: '오래된' },
  { id: 'title', label: '제목' },
];

export default function App() {
  const [categories, setCategories] = useState([]);
  const [memos, setMemos] = useState([]);
  const [currentView, setCurrentView] = useState('list'); // 'list', 'edit', 'categoryEdit'
  const [currentMemo, setCurrentMemo] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]); // 복수 선택으로 변경

  // 리스트 부가 기능 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState('latest'); // latest | oldest | title

  // 메모 입력 상태
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [memoCategories, setMemoCategories] = useState([]); // 복수 선택으로 변경
  const [memoPinned, setMemoPinned] = useState(false);
  const [memoImages, setMemoImages] = useState([]); // 이미지 배열 추가

  // 카테고리 입력 상태
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState(COLORS[0]);
  const [editingCategory, setEditingCategory] = useState(null);

  // 모달 상태
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      let savedCategories, savedMemos;

      // 웹 환경에서는 localStorage 직접 사용
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        savedCategories = localStorage.getItem('categories');
        savedMemos = localStorage.getItem('memos');
        console.log('localStorage에서 로드:', {
          categories: savedCategories ? '있음' : '없음',
          memos: savedMemos ? '있음' : '없음',
          categoriesSize: savedCategories ? (savedCategories.length / 1024).toFixed(2) + 'KB' : '0KB',
          memosSize: savedMemos ? (savedMemos.length / 1024).toFixed(2) + 'KB' : '0KB'
        });
      } else {
        savedCategories = await AsyncStorage.getItem('categories');
        savedMemos = await AsyncStorage.getItem('memos');
      }

      let parsedCategories = savedCategories ? JSON.parse(savedCategories) : [];
      let parsedMemos = savedMemos ? JSON.parse(savedMemos) : [];

      // 카테고리가 하나도 없으면 기본 카테고리 생성
      if (parsedCategories.length === 0) {
        parsedCategories = [
          {
            id: Date.now().toString(),
            name: '일반',
            color: COLORS[0],
            createdAt: new Date().toISOString(),
          },
          {
            id: (Date.now() + 1).toString(),
            name: '중요',
            color: COLORS[1],
            createdAt: new Date().toISOString(),
          },
          {
            id: (Date.now() + 2).toString(),
            name: '할일',
            color: COLORS[2],
            createdAt: new Date().toISOString(),
          },
        ];
        console.log('기본 카테고리 생성됨');
      }

      console.log('파싱된 데이터:', {
        categoriesCount: parsedCategories.length,
        memosCount: parsedMemos.length
      });

      // 데이터 마이그레이션: 단일 카테고리 → 복수 카테고리
      parsedMemos = parsedMemos.map((m) => {
        let migrated = { ...m };

        // pinned 보정
        migrated.pinned = typeof m.pinned === 'boolean' ? m.pinned : false;

        // categoryId → categoryIds 변환
        if (m.categoryId !== undefined && !m.categoryIds) {
          migrated.categoryIds = m.categoryId ? [m.categoryId] : [];
          delete migrated.categoryId;
        } else if (!m.categoryIds) {
          migrated.categoryIds = [];
        }

        // images 보정
        migrated.images = Array.isArray(m.images) ? m.images : [];

        return migrated;
      });

      // memos 중 삭제된 카테고리를 참조하는 것이 있으면, categories에 "삭제된 카테고리"를 보장
      const hasDeletedRef = parsedMemos.some((m) =>
        m.categoryIds && m.categoryIds.includes(DELETED_CATEGORY_ID)
      );
      if (hasDeletedRef) {
        parsedCategories = ensureDeletedCategory(parsedCategories);
      }

      setCategories(parsedCategories);
      setMemos(parsedMemos);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  const saveCategories = async (newCategories) => {
    try {
      setCategories(newCategories);
      const jsonData = JSON.stringify(newCategories);

      // 웹 환경에서는 localStorage 직접 사용
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('categories', jsonData);
          console.log('카테고리 저장 성공:', newCategories.length);
        } catch (e) {
          console.error('localStorage 저장 실패:', e);
          Alert.alert('저장 실패', 'localStorage 용량 초과 또는 오류');
        }
      } else {
        await AsyncStorage.setItem('categories', jsonData);
      }
    } catch (error) {
      console.error('카테고리 저장 실패:', error);
      Alert.alert('오류', '카테고리 저장 중 오류 발생');
    }
  };

  const saveMemos = async (newMemos) => {
    try {
      setMemos(newMemos);
      const jsonData = JSON.stringify(newMemos);
      const sizeInMB = (new Blob([jsonData]).size / (1024 * 1024)).toFixed(2);
      console.log('메모 저장 시도:', { count: newMemos.length, size: sizeInMB + 'MB' });

      // 웹 환경에서는 localStorage 직접 사용
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('memos', jsonData);
          console.log('메모 localStorage 저장 완료');

          // 저장 확인
          const verified = localStorage.getItem('memos');
          if (verified === jsonData) {
            console.log('✓ 저장 검증 성공');
          } else {
            console.error('✗ 저장 검증 실패: 데이터 불일치');
          }
        } catch (e) {
          console.error('localStorage 저장 실패:', e.name, e.message);
          if (e.name === 'QuotaExceededError') {
            Alert.alert(
              '저장 용량 초과',
              `브라우저 저장 공간이 부족합니다.\n\n현재 크기: ${sizeInMB}MB\n\n해결 방법:\n1. 이미지 개수를 줄이세요\n2. 일부 메모를 삭제하세요\n3. 브라우저 캐시를 지우세요`,
              [{ text: '확인' }]
            );
          } else {
            Alert.alert('저장 실패', `오류: ${e.message}`);
          }
          return false;
        }
      } else {
        await AsyncStorage.setItem('memos', jsonData);
      }
      return true;
    } catch (error) {
      console.error('메모 저장 실패:', error);
      Alert.alert('오류', '메모 저장 중 오류 발생');
      return false;
    }
  };

  // 카테고리 관리
  const createOrUpdateCategory = () => {
    if (!categoryName.trim()) {
      Alert.alert('알림', '카테고리 이름을 입력하세요.');
      return;
    }

    if (editingCategory) {
      // 카테고리 업데이트 (메모의 색상 동기화는 제거 - 복수 카테고리로 인해 복잡도 증가)
      const updatedCategories = categories.map((c) =>
        c.id === editingCategory.id ? { ...c, name: categoryName, color: categoryColor } : c
      );
      saveCategories(updatedCategories);
    } else {
      const newCategory = {
        id: Date.now().toString(),
        name: categoryName,
        color: categoryColor,
        createdAt: new Date().toISOString(),
      };
      saveCategories([...categories, newCategory]);
    }

    setCategoryName('');
    setCategoryColor(COLORS[0]);
    setEditingCategory(null);
    setShowCategoryModal(false);
  };

  const deleteCategory = (id) => {
    // 삭제된 카테고리는 삭제 불가(안전장치)
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

    const affectedCount = memos.filter((m) => m.categoryIds && m.categoryIds.includes(id)).length;

    const message =
      affectedCount > 0
        ? `해당 카테고리로 등록된 메모가 ${affectedCount}개 존재합니다.\n그래도 삭제하시겠습니까?\n삭제 시 해당 카테고리는 '삭제된 카테고리'로 대체됩니다.`
        : '이 카테고리를 삭제하시겠습니까?';

    // 웹 환경
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(message);
      if (!confirmed) return;

      console.log('카테고리 삭제 시작:', id);

      setCategories((currentCategories) => {
        console.log('현재 카테고리 개수:', currentCategories.length);
        let nextCategories = currentCategories.filter((c) => c.id !== id);
        if (affectedCount > 0) {
          nextCategories = ensureDeletedCategory(nextCategories);
        }
        console.log('삭제 후 카테고리 개수:', nextCategories.length);

        try {
          const jsonData = JSON.stringify(nextCategories);
          localStorage.setItem('categories', jsonData);
          console.log('카테고리 삭제 저장 완료');
        } catch (error) {
          console.error('카테고리 삭제 저장 실패:', error);
        }

        return nextCategories;
      });

      if (affectedCount > 0) {
        setMemos((currentMemos) => {
          const nextMemos = currentMemos.map((m) => {
            if (m.categoryIds && m.categoryIds.includes(id)) {
              const newCategoryIds = m.categoryIds.filter((cid) => cid !== id);
              if (!newCategoryIds.includes(DELETED_CATEGORY_ID)) {
                newCategoryIds.push(DELETED_CATEGORY_ID);
              }
              return { ...m, categoryIds: newCategoryIds };
            }
            return m;
          });

          try {
            const jsonData = JSON.stringify(nextMemos);
            localStorage.setItem('memos', jsonData);
            console.log('메모 업데이트 저장 완료');
          } catch (error) {
            console.error('메모 업데이트 저장 실패:', error);
          }

          return nextMemos;
        });
      }

      setSelectedCategories((prev) => prev.filter((cid) => cid !== id));
    } else {
      // 네이티브 환경
      Alert.alert('카테고리 삭제', message, [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            console.log('카테고리 삭제 시작:', id);

            setCategories((currentCategories) => {
              console.log('현재 카테고리 개수:', currentCategories.length);
              let nextCategories = currentCategories.filter((c) => c.id !== id);
              if (affectedCount > 0) {
                nextCategories = ensureDeletedCategory(nextCategories);
              }
              console.log('삭제 후 카테고리 개수:', nextCategories.length);

              try {
                const jsonData = JSON.stringify(nextCategories);
                AsyncStorage.setItem('categories', jsonData);
                console.log('카테고리 삭제 저장 완료');
              } catch (error) {
                console.error('카테고리 삭제 저장 실패:', error);
              }

              return nextCategories;
            });

            if (affectedCount > 0) {
              setMemos((currentMemos) => {
                const nextMemos = currentMemos.map((m) => {
                  if (m.categoryIds && m.categoryIds.includes(id)) {
                    const newCategoryIds = m.categoryIds.filter((cid) => cid !== id);
                    if (!newCategoryIds.includes(DELETED_CATEGORY_ID)) {
                      newCategoryIds.push(DELETED_CATEGORY_ID);
                    }
                    return { ...m, categoryIds: newCategoryIds };
                  }
                  return m;
                });

                try {
                  const jsonData = JSON.stringify(nextMemos);
                  AsyncStorage.setItem('memos', jsonData);
                  console.log('메모 업데이트 저장 완료');
                } catch (error) {
                  console.error('메모 업데이트 저장 실패:', error);
                }

                return nextMemos;
              });
            }

            setSelectedCategories((prev) => prev.filter((cid) => cid !== id));
          },
        },
      ]);
    }
  };

  // 메모 관리
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

    // 저장 성공 시에만 화면 전환
    if (success) {
      setCurrentView('list');
    }
  };

  const deleteMemo = (id) => {
    // 웹 환경에서는 window.confirm 사용
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('이 메모를 삭제하시겠습니까?');
      if (!confirmed) return;

      console.log('메모 삭제 시작:', id);
      setMemos((currentMemos) => {
        console.log('현재 메모 개수:', currentMemos.length);
        const updated = currentMemos.filter((m) => m.id !== id);
        console.log('삭제 후 메모 개수:', updated.length);

        try {
          const jsonData = JSON.stringify(updated);
          localStorage.setItem('memos', jsonData);
          console.log('메모 삭제 저장 완료');
        } catch (error) {
          console.error('메모 삭제 저장 실패:', error);
          window.alert('메모 삭제 중 오류가 발생했습니다.');
        }

        return updated;
      });
    } else {
      // 네이티브 환경
      Alert.alert('메모 삭제', '이 메모를 삭제하시겠습니까?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            console.log('메모 삭제 시작:', id);
            setMemos((currentMemos) => {
              console.log('현재 메모 개수:', currentMemos.length);
              const updated = currentMemos.filter((m) => m.id !== id);
              console.log('삭제 후 메모 개수:', updated.length);

              try {
                const jsonData = JSON.stringify(updated);
                AsyncStorage.setItem('memos', jsonData);
                console.log('메모 삭제 저장 완료');
              } catch (error) {
                console.error('메모 삭제 저장 실패:', error);
                Alert.alert('오류', '메모 삭제 중 오류 발생');
              }

              return updated;
            });
          },
        },
      ]);
    }
  };

  const togglePinMemo = async (id) => {
    const updated = memos.map((m) =>
      m.id === id ? { ...m, pinned: !m.pinned } : m
    );
    await saveMemos(updated);
  };

  // 리스트에 표시할 메모: 카테고리 필터 → 검색 → 정렬(핀 우선)
  const displayedMemos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // OR 조건: 선택한 카테고리 중 하나라도 포함된 메모
    let arr = selectedCategories.length > 0
      ? memos.filter((m) =>
          m.categoryIds &&
          m.categoryIds.some((cid) => selectedCategories.includes(cid))
        )
      : [...memos];

    if (q) {
      arr = arr.filter((m) => {
        const t = (m.title || '').toLowerCase();
        const c = (m.content || '').toLowerCase();
        return t.includes(q) || c.includes(q);
      });
    }

    const compare = (a, b) => {
      if (sortMode === 'oldest') {
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      if (sortMode === 'title') {
        return (a.title || '').localeCompare(b.title || '', 'ko');
      }
      // latest (default)
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

  // 카테고리 편집 화면
  if (currentView === 'categoryEdit') {
    // 삭제된 카테고리는 목록에서 제외
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
            {visibleCategories.map((cat) => {
              return (
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
              );
            })}

            {visibleCategories.length === 0 && (
              <Text style={styles.emptyText}>
                카테고리가 없습니다.{'\n'}+ 추가 버튼을 눌러 만들어보세요!
              </Text>
            )}
          </ScrollView>

          {/* 카테고리 추가/수정 모달 */}
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

  // 메모 작성/수정 화면
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
            {/* 상단 메타 정보 영역 */}
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
                                setMemoCategories(memoCategories.filter((id) => id !== cat.id));
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

              {/* 구분선 */}
              <View style={styles.divider} />
            </View>

            {/* 메모 입력 영역 - 나머지 공간 모두 사용 */}
            <TextInput
              style={styles.contentInput}
              placeholder="여기에 메모를 작성하세요..."
              value={content}
              onChangeText={setContent}
              multiline
              placeholderTextColor="#9CA3AF"
            />

            {/* 하단 이미지 섹션 */}
            <View style={styles.imageSection}>
              <View style={styles.imageSectionHeader}>
                <Text style={styles.imageSectionLabel}>📎 첨부 이미지</Text>
                <TouchableOpacity
                onPress={async () => {
                  try {
                    if (Platform.OS === 'web' && typeof document !== 'undefined') {
                      // 웹 환경 - 이미지 압축 적용
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = Array.from(e.target.files);
                        files.forEach((file) => {
                          if (file.size > 5 * 1024 * 1024) {
                            Alert.alert('알림', '이미지는 5MB 이하만 가능합니다.');
                            return;
                          }

                          // 이미지 압축
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const img = document.createElement('img');
                            img.onload = () => {
                              // Canvas로 이미지 리사이즈 및 압축
                              const canvas = document.createElement('canvas');
                              let width = img.width;
                              let height = img.height;

                              // 최대 크기 제한 (600px로 줄임)
                              const maxSize = 600;
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

                              // JPEG 품질 0.5로 더 강력한 압축
                              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
                              const sizeMB = (compressedDataUrl.length * 0.75 / (1024 * 1024)).toFixed(2);
                              console.log('압축된 이미지 크기:', sizeMB, 'MB');

                              setMemoImages((prev) => [...prev, compressedDataUrl]);
                            };
                            img.src = event.target.result;
                          };
                          reader.readAsDataURL(file);
                        });
                      };
                      input.click();
                    } else {
                      // 네이티브 환경 (iOS/Android)
                      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (status !== 'granted') {
                        Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다.');
                        return;
                      }

                      const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ImagePicker.MediaTypeOptions.Images,
                        allowsMultipleSelection: true,
                        quality: 0.5,
                        base64: true,
                        allowsEditing: false,
                        maxWidth: 600, // 최대 너비 제한 (800 → 600)
                        maxHeight: 600, // 최대 높이 제한 (800 → 600)
                      });

                      if (!result.canceled) {
                        result.assets.forEach((asset) => {
                          const base64Image = `data:image/jpeg;base64,${asset.base64}`;
                          setMemoImages((prev) => [...prev, base64Image]);
                        });
                      }
                    }
                  } catch (error) {
                    console.error('이미지 업로드 오류:', error);
                    Alert.alert('오류', '이미지 업로드 중 오류가 발생했습니다.');
                  }
                }}
                style={styles.imageButtonCompact}
              >
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

          {/* 이미지 뷰어 모달 */}
          <Modal visible={showImageModal} transparent animationType="fade">
            <View style={styles.imageModalOverlay}>
              <TouchableOpacity
                style={styles.imageModalCloseButton}
                onPress={() => setShowImageModal(false)}
              >
                <Text style={styles.imageModalCloseText}>✕</Text>
              </TouchableOpacity>

              {selectedImage && selectedImage.length > 0 && (
                <>
                  <Image
                    source={{ uri: selectedImage[selectedImageIndex] }}
                    style={styles.imageModalImage}
                    resizeMode="contain"
                  />

                  {/* 이미지 카운터 */}
                  <View style={styles.imageModalCounter}>
                    <Text style={styles.imageModalCounterText}>
                      {selectedImageIndex + 1} / {selectedImage.length}
                    </Text>
                  </View>

                  {/* 이전/다음 버튼 */}
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

  // 메모 목록 화면
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
          </View>
        </View>

        {/* 검색 */}
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

        {/* 정렬 */}
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

        {/* 카테고리 필터 (복수 선택) */}
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
                          setSelectedCategories(selectedCategories.filter((id) => id !== cat.id));
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
              // 메모의 카테고리들 가져오기
              const memoCategories = (memo.categoryIds || [])
                .map((cid) => categories.find((c) => c.id === cid))
                .filter(Boolean);

              // 메모의 첫 번째 카테고리 색상 사용 (없으면 흰색)
              const firstCategory = memoCategories[0];
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

                  {/* 이미지 미리보기 */}
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
                      {memoCategories.map((cat) => (
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

        {/* 이미지 뷰어 모달 */}
        <Modal visible={showImageModal} transparent animationType="fade">
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity
              style={styles.imageModalCloseButton}
              onPress={() => setShowImageModal(false)}
            >
              <Text style={styles.imageModalCloseText}>✕</Text>
            </TouchableOpacity>

            {selectedImage && selectedImage.length > 0 && (
              <>
                <Image
                  source={{ uri: selectedImage[selectedImageIndex] }}
                  style={styles.imageModalImage}
                  resizeMode="contain"
                />

                {/* 이미지 카운터 */}
                <View style={styles.imageModalCounter}>
                  <Text style={styles.imageModalCounterText}>
                    {selectedImageIndex + 1} / {selectedImage.length}
                  </Text>
                </View>

                {/* 이전/다음 버튼 */}
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

  // 선택된 칩 텍스트
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
