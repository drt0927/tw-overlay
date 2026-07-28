interface SidebarCategory {
  id: string;
  label: string;
  trayLabel?: string;
  icon: string;
  color: string;
  trayOrder: number;
}

interface Window {
  sidebarCategories: readonly SidebarCategory[];
}

(function exposeSidebarCategories(globalObject: Window | null): void {
  const SIDEBAR_CATEGORIES: readonly SidebarCategory[] = Object.freeze([
    { id: 'monitoring', label: '실시간 모니터링', icon: 'activity', color: 'purple-400', trayOrder: 0 },
    { id: 'alarms', label: '알림 설정', icon: 'bell-ring', color: 'pink-400', trayOrder: 1 },
    { id: 'calculators', label: '전문 계산기', icon: 'calculator', color: 'indigo-400', trayOrder: 2 },
    { id: 'information', label: '정보 & 도감', icon: 'book-open', color: 'blue-400', trayOrder: 3 },
    { id: 'utilities', label: '편의 유틸리티', icon: 'pocket', color: 'yellow-400', trayOrder: 4 },
    { id: 'records', label: '플레이 기록', icon: 'calendar-check', color: 'emerald-400', trayOrder: 6 },
    {
      id: 'homework',
      label: '숙제 체크 리스트',
      trayLabel: '숙제 체크',
      icon: 'check-square',
      color: 'violet-400',
      trayOrder: 5,
    },
  ]);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SIDEBAR_CATEGORIES };
  }
  if (globalObject) {
    globalObject.sidebarCategories = SIDEBAR_CATEGORIES;
  }
})(typeof window !== 'undefined' ? window : null);
