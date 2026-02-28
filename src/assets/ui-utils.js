/**
 * TW-Overlay 공통 UI 유틸리티
 */

// 아이콘 새로고침
window.refreshIcons = function() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
};

// Escape 키로 창 닫기 바인딩
window.bindEscapeClose = function() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 닫기 전 추가 로직이 필요한 경우를 위해 이벤트를 전파하지 않음
      window.close();
    }
  });
};

// 사운드 목록 로드 (공통)
window.loadSoundList = async function() {
  try {
    const response = await fetch('assets/data/sounds.json');
    return await response.json();
  } catch (e) {
    console.error('Failed to load sound list:', e);
    return [];
  }
};

// 슬라이더 값 퍼센트 표시 업데이트
window.updateRangeValue = function(inputEl, targetId) {
  const target = document.getElementById(targetId);
  if (target) {
    target.innerText = inputEl.value + '%';
  }
};

// 사운드 미리보기
window.playPreview = function(soundFile, volume = null) {
  if (window.electronAPI && window.electronAPI.previewBossSound) {
    window.electronAPI.previewBossSound(soundFile, volume);
  }
};
