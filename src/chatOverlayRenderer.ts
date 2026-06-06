// Electron API type definition
interface Window {
  electronAPI: {
    toggleChatOverlay: () => void;
    toggleChatOverlaySub: (subNum: 1 | 2) => void;
    getChatHistory: (category: string) => Promise<any[]>;
    getMoreChatHistory: (category: string) => Promise<any[]>;
    openTodayLog: () => void;
    fetchEtaRankings: () => Promise<boolean>;
    onChatUpdated: (callback: (chatItem: any) => void) => void;
    onConfigData: (callback: (config: any) => void) => void;
    onChatOverlayMode: (callback: (mode: 'main' | 'sub1' | 'sub2') => void) => void;
    cleanupAllListeners: () => void;
    setChatOverlaySize: (mode: 'main' | 'sub1' | 'sub2', width: number, height: number) => void;
    applySettings: (settings: any) => void;
    toggleSettings: (tabId?: string) => void;
  };
  lucide?: {
    createIcons: () => void;
  };
}

// NPC/몬스터 이름 블랙리스트
const NPC_BLACK_LIST = [
  '데스포이나', '신조', '키시니크', '에레오스', '로카고스',
  '마티아', '티로로스', '라이코스', '체리아', '실반',
  '샐리온', '실라이론', '샐레아나', '루미너스', '크라모르'
];

// NPC/몬스터 대사 여부 판별 함수
function isNpcOrMonsterChat(chat: any): boolean {
  if (!chat) return false;
  const sender = chat.sender || '';
  const message = chat.message || '';
  
  // 1. 보낸 사람이 NPC인 경우
  if (NPC_BLACK_LIST.includes(sender)) return true;
  
  // 2. 시스템 메시지 내에서 "NPC이름 : 대사" 형태인 경우
  if (chat.type === 'system') {
    const match = message.match(/^(.+?)\s*:\s*(.*)$/);
    if (match) {
      const parsedSender = match[1].trim();
      if (NPC_BLACK_LIST.includes(parsedSender)) return true;
      // 공백이 있는 이름은 보통 NPC/몬스터 (예: "심연의 제2사도", "수색대장, 에토스")
      if (parsedSender.includes(' ') && !parsedSender.includes(']') && !parsedSender.includes('[')) {
        return true;
      }
    }
  }
  return false;
}

// 오버레이 노출 조건 판별 함수
function shouldShowChat(chat: any): boolean {
  if (!chat) return false;

  // 1. NPC/몬스터 대사 필터 적용
  const showNpcChat = chatOverlayAppConfig?.chatOverlayShowNpcChat !== false;
  if (!showNpcChat && isNpcOrMonsterChat(chat)) {
    return false;
  }

  // 2. 채널별 필터 적용
  if (chatOverlayCurrentTab === 'Basic') {
    const channels = chatOverlayAppConfig?.chatOverlaySelectedChannels || ['general', 'whisper', 'team', 'club', 'shout', 'system'];
    return channels.includes(chat.type);
  } else {
    const expectedType = tabTypeMap[chatOverlayCurrentTab];
    return chat.type === expectedType;
  }
}

let chatOverlayCurrentTab = 'Basic';
let chatOverlayHoverTimer: any = null;
let chatOverlayAppConfig: any = null;
let lastKnownConfig: any = null;
let isLoadingMore = false;
let hasReachedEnd = false;
let chatOverlayMode: 'main' | 'sub1' | 'sub2' = 'main';
let isInitialTabLoaded = false;
let isModeReceived = false;
let isConfigReceived = false;

// Config 정보와 Mode 정보가 모두 수신된 안전한 시점에 단 한 번만 초기 탭을 로드합니다.
function checkAndLoadInitialTab() {
  if (isInitialTabLoaded || !isModeReceived || !isConfigReceived || !chatOverlayAppConfig) return;
  isInitialTabLoaded = true;

  const savedTab = chatOverlayMode === 'main'
    ? (chatOverlayAppConfig.chatOverlayTab || 'Basic')
    : (chatOverlayMode === 'sub1' ? (chatOverlayAppConfig.chatOverlaySubTab || 'Basic') : (chatOverlayAppConfig.chatOverlaySub2Tab || 'Basic'));

  selectTab(savedTab, false);
}

const btnOpenSub1 = document.getElementById('btnOpenSub1') as HTMLButtonElement;
const btnOpenSub2 = document.getElementById('btnOpenSub2') as HTMLButtonElement;

// HTML Elements
const overlayPanel = document.getElementById('overlayPanel') as HTMLDivElement;
const dragHeader = document.getElementById('dragHeader') as HTMLDivElement;
const tabsBar = document.getElementById('tabsBar') as HTMLDivElement;
const chatArea = document.getElementById('chatArea') as HTMLDivElement;
const copyToast = document.getElementById('copyToast') as HTMLDivElement;
const resizeHandle = document.getElementById('resizeHandle') as HTMLDivElement;

// Tab mapping (UI tab -> chat.type)
const tabTypeMap: Record<string, string> = {
  'General': 'general',
  'Team': 'team',
  'Club': 'club',
  'Shout': 'shout',
  'Whisper': 'whisper',
  'System': 'system'
};

// Initialize Icons
function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Format timestamp: "오전 10시 24분 53초" -> "10:24"
function formatTime(timestamp: string): string {
  if (!timestamp) return '';
  const match = timestamp.match(/(\d+)시\s*(\d+)분/);
  if (match) {
    const isPm = timestamp.includes('오후');
    let hour = parseInt(match[1], 10);
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    const min = match[2].padStart(2, '0');
    return `${String(hour).padStart(2, '0')}:${min}`;
  }
  return timestamp;
}

// Copy sender nickname to clipboard
async function copyNickname(nickname: string) {
  if (!nickname) return;
  try {
    await navigator.clipboard.writeText(nickname);
    showCopyToast();
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
}

// Show temporary toast on copy
function showCopyToast() {
  copyToast.classList.add('show');
  setTimeout(() => {
    copyToast.classList.remove('show');
  }, 1500);
}

// Get Korean Channel Display Name
function getChannelBadgeText(type: string): string {
  switch (type) {
    case 'general': return '일반';
    case 'team': return '팀';
    case 'club': return '클럽';
    case 'shout': return '외치기';
    case 'whisper': return '귓속말';
    case 'system': return '시스템';
    default: return type;
  }
}

// Build chat row element
function createChatRow(chat: any): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'chat-message-row';

  // 1. Time
  const timeSpan = document.createElement('span');
  timeSpan.className = 'chat-timestamp';
  timeSpan.textContent = formatTime(chat.timestamp);
  row.appendChild(timeSpan);

  // 2. Channel Badge
  const channelBadge = document.createElement('span');
  channelBadge.className = `channel-badge badge-${chat.type}`;
  channelBadge.textContent = getChannelBadgeText(chat.type);
  row.appendChild(channelBadge);

  // 3. Eta Level Badge (If exists)
  if (chat.level !== undefined && chat.level !== null) {
    const badge = document.createElement('span');
    badge.className = 'eta-badge';
    badge.textContent = `에타 ${chat.level}`;
    row.appendChild(badge);
  }

  // 4. Sender
  const senderSpan = document.createElement('span');
  senderSpan.className = 'chat-sender';
  senderSpan.textContent = chat.sender ? `${chat.sender}:` : '';
  if (chat.sender && chat.sender !== '시스템') {
    senderSpan.addEventListener('click', () => copyNickname(chat.sender));
  } else {
    senderSpan.style.cursor = 'default';
    senderSpan.style.textDecoration = 'none';
  }
  row.appendChild(senderSpan);

  // 5. Message Content
  const textSpan = document.createElement('span');
  textSpan.className = 'chat-text';
  textSpan.textContent = ` ${chat.message}`;
  if (chat.color) {
    textSpan.style.color = chat.color;
  }
  row.appendChild(textSpan);

  return row;
}

// Load history for selected tab
async function loadHistory() {
  chatArea.innerHTML = '';
  try {
    const history = await window.electronAPI.getChatHistory(chatOverlayCurrentTab);
    if (history && history.length > 0) {
      const filtered = history.filter((chat: any) => shouldShowChat(chat));

      filtered.forEach((chat: any) => {
        chatArea.appendChild(createChatRow(chat));
      });
      scrollToBottom();
    }
  } catch (e) {
    console.error('Failed to load chat history:', e);
  }
}

// Scroll chat area to bottom
function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Switch Active Tab
function selectTab(tabName: string, save = true) {
  chatOverlayCurrentTab = tabName;
  document.querySelectorAll('.tab-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  isLoadingMore = false;
  hasReachedEnd = false;
  loadHistory();

  if (save) {
    if (chatOverlayMode === 'main') {
      window.electronAPI.applySettings({ chatOverlayTab: tabName });
    } else if (chatOverlayMode === 'sub1') {
      window.electronAPI.applySettings({ chatOverlaySubTab: tabName });
    } else if (chatOverlayMode === 'sub2') {
      window.electronAPI.applySettings({ chatOverlaySub2Tab: tabName });
    }
  }
}

// Handle Mouse Hover (Fade In/Out Control Panels) - Disabled as visibility is now controlled strictly by click-through status
function handleMouseEnter() {
  return;
}

function handleMouseLeave() {
  return;
}

// Update Header, Tabs, and Resize Handle visibility based on Click Through config
function updateHeaderVisibility(config: any) {
  if (!config) return;
  const clickThrough = !!config.chatOverlayClickThrough;
  
  // clickThrough 상태가 변경되었는지 또는 최초 설정 로드인지 확인
  const prevClickThrough = lastKnownConfig ? !!lastKnownConfig.chatOverlayClickThrough : null;
  const clickThroughChanged = (prevClickThrough !== clickThrough);

  if (clickThrough) {
    // 마우스 투과 일때는 헤더 완전히 숨김
    overlayPanel.classList.remove('hover-active');
    dragHeader.classList.remove('visible');
    tabsBar.classList.remove('visible');
    if (resizeHandle) {
      resizeHandle.classList.remove('visible');
    }
  } else {
    // 마우스 투과 아닐때는 헤더 항상 표시
    overlayPanel.classList.add('hover-active');
    dragHeader.classList.add('visible');
    tabsBar.classList.add('visible');
    if (resizeHandle) {
      resizeHandle.classList.add('visible');
    }
  }
  // 스크롤 보정은 clickThrough가 실제로 변경되었을 때만 실행 (타 오버레이 탭 변경 시 스크롤 리셋 방지)
  if (clickThroughChanged) {
    setTimeout(() => scrollToBottom(), 250);
  }
}

// Update Styles based on Config
function applyConfigStyles(config: any) {
  if (!config) return;
  chatOverlayAppConfig = config;

  // Font Size
  if (config.chatOverlayFontSize) {
    document.documentElement.style.setProperty('--font-size-base', `${config.chatOverlayFontSize}px`);
  }

  // Opacity
  let normalOpacity = 0.8;
  if (chatOverlayMode === 'main') {
    normalOpacity = config.chatOverlayOpacity !== undefined ? config.chatOverlayOpacity : 0.8;
  } else if (chatOverlayMode === 'sub1') {
    normalOpacity = config.chatOverlaySubOpacity !== undefined ? config.chatOverlaySubOpacity : 0.8;
  } else if (chatOverlayMode === 'sub2') {
    normalOpacity = config.chatOverlaySub2Opacity !== undefined ? config.chatOverlaySub2Opacity : 0.8;
  }
  const hoverOpacity = Math.min(normalOpacity + 0.25, 1.0);
  document.documentElement.style.setProperty('--bg-overlay', `rgba(15, 14, 26, ${normalOpacity})`);
  document.documentElement.style.setProperty('--bg-overlay-hover', `rgba(15, 14, 26, ${hoverOpacity})`);

  isConfigReceived = true;
  if (!isInitialTabLoaded) {
    checkAndLoadInitialTab();
  }

  // Main 창인 경우 Sub 1, Sub 2 각 개별 창 활성화 여부에 따라 버튼 스타일 토글 처리 (항상 클릭 가능)
  if (chatOverlayMode === 'main') {
    const sub1Open = !!config.chatOverlaySubEnabled;
    const sub2Open = !!config.chatOverlaySub2Enabled;
    
    if (btnOpenSub1) {
      if (sub1Open) {
        btnOpenSub1.style.background = 'rgba(52, 211, 153, 0.15)'; // bg-emerald-500/15
        btnOpenSub1.style.color = '#34d399'; // text-emerald-400
        btnOpenSub1.style.borderColor = 'rgba(52, 211, 153, 0.3)'; // border-emerald-500/30
        btnOpenSub1.title = 'Sub 1 창 닫기';
      } else {
        btnOpenSub1.style.background = 'transparent';
        btnOpenSub1.style.color = 'var(--tab-inactive)';
        btnOpenSub1.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        btnOpenSub1.title = 'Sub 1 창 열기';
      }
    }

    if (btnOpenSub2) {
      if (sub2Open) {
        btnOpenSub2.style.background = 'rgba(52, 211, 153, 0.15)';
        btnOpenSub2.style.color = '#34d399';
        btnOpenSub2.style.borderColor = 'rgba(52, 211, 153, 0.3)';
        btnOpenSub2.title = 'Sub 2 창 닫기';
      } else {
        btnOpenSub2.style.background = 'transparent';
        btnOpenSub2.style.color = 'var(--tab-inactive)';
        btnOpenSub2.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        btnOpenSub2.title = 'Sub 2 창 열기';
      }
    }
  }

  updateHeaderVisibility(config);
}

// Event Bindings
document.querySelectorAll('.tab-item').forEach(el => {
  el.addEventListener('click', () => {
    const tab = el.getAttribute('data-tab');
    if (tab === 'Settings') {
      window.electronAPI.toggleSettings('chatlog');
    } else if (tab === 'OpenLog') {
      window.electronAPI.openTodayLog();
    } else if (tab) {
      selectTab(tab);
    }
  });
});

overlayPanel.addEventListener('mouseenter', handleMouseEnter);
overlayPanel.addEventListener('mouseleave', handleMouseLeave);

// Register Electron IPC Listeners
window.electronAPI.onChatUpdated((chatItem) => {
  // Check if item should be shown in current tab
  const show = shouldShowChat(chatItem);

  if (show) {
    const isAtBottom = (chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight) < 50;
    chatArea.appendChild(createChatRow(chatItem));
    
    // Keep max 1000 items in view (실시간 모니터링 중 바닥 근처일 때만 돔 수량 제한)
    if (chatArea.childNodes.length > 1000) {
      if (isAtBottom) {
        chatArea.removeChild(chatArea.firstChild!);
      }
    }
    
    if (isAtBottom) {
      scrollToBottom();
    }
  }
});

window.electronAPI.onConfigData((config) => {
  const isFirstConfig = !lastKnownConfig;

  // Calculate current active tab configured for this specific window mode
  const currentConfigTab = chatOverlayMode === 'main'
    ? (config.chatOverlayTab || 'Basic')
    : (chatOverlayMode === 'sub1' ? (config.chatOverlaySubTab || 'Basic') : (config.chatOverlaySub2Tab || 'Basic'));

  // Detect if channel filters changed
  let channelsChanged = false;
  let npcChatSettingChanged = false;
  if (lastKnownConfig) {
    const oldChannels = lastKnownConfig.chatOverlaySelectedChannels || [];
    const newChannels = config.chatOverlaySelectedChannels || [];
    if (oldChannels.length !== newChannels.length) {
      channelsChanged = true;
    } else {
      const sortedOld = [...oldChannels].sort();
      const sortedNew = [...newChannels].sort();
      for (let i = 0; i < sortedOld.length; i++) {
        if (sortedOld[i] !== sortedNew[i]) {
          channelsChanged = true;
          break;
        }
      }
    }
    npcChatSettingChanged = (lastKnownConfig.chatOverlayShowNpcChat !== config.chatOverlayShowNpcChat);
  } else {
    channelsChanged = true;
    npcChatSettingChanged = true;
  }

  applyConfigStyles(config);
  lastKnownConfig = config;

  if (isFirstConfig) {
    // Initial loading is managed inside applyConfigStyles -> checkAndLoadInitialTab
    return;
  }

  const tabChangedExternally = (currentConfigTab !== chatOverlayCurrentTab);
  if (tabChangedExternally) {
    selectTab(currentConfigTab, false);
  } else if ((channelsChanged || npcChatSettingChanged) && chatOverlayCurrentTab === 'Basic') {
    loadHistory();
  } else if (npcChatSettingChanged) {
    loadHistory();
  }
});

// Mode configuration for Main/Sub windows
window.electronAPI.onChatOverlayMode((mode) => {
  chatOverlayMode = mode;
  isModeReceived = true;
  
  // 헤더 타이틀 표시 치환
  const titleTextEl = document.getElementById('dragHeaderTitleText');
  if (titleTextEl) {
    if (mode === 'main') {
      titleTextEl.innerText = 'CHAT HISTORY (MAIN)';
    } else if (mode === 'sub1') {
      titleTextEl.innerText = 'CHAT HISTORY (SUB 1)';
    } else if (mode === 'sub2') {
      titleTextEl.innerText = 'CHAT HISTORY (SUB 2)';
    }
  }

  if (btnOpenSub1) {
    btnOpenSub1.style.display = mode === 'main' ? 'inline-flex' : 'none';
  }
  if (btnOpenSub2) {
    btnOpenSub2.style.display = mode === 'main' ? 'inline-flex' : 'none';
  }
  initIcons(); // Re-render Lucide icons inside header

  if (!isInitialTabLoaded) {
    checkAndLoadInitialTab();
  }
});

if (btnOpenSub1) {
  btnOpenSub1.addEventListener('click', () => {
    window.electronAPI.toggleChatOverlaySub(1);
  });
}
if (btnOpenSub2) {
  btnOpenSub2.addEventListener('click', () => {
    window.electronAPI.toggleChatOverlaySub(2);
  });
}

const btnClose = document.getElementById('btnCloseOverlay') as HTMLButtonElement;
if (btnClose) {
  btnClose.addEventListener('click', () => {
    if (chatOverlayMode === 'main') {
      window.electronAPI.toggleChatOverlay();
    } else if (chatOverlayMode === 'sub1') {
      window.electronAPI.toggleChatOverlaySub(1);
    } else if (chatOverlayMode === 'sub2') {
      window.electronAPI.toggleChatOverlaySub(2);
    }
  });
}

// Resize Drag Control
let chatOverlayIsResizing = false;
let chatOverlayStartX = 0;
let chatOverlayStartY = 0;
let chatOverlayStartWidth = 0;
let chatOverlayStartHeight = 0;

if (resizeHandle) {
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chatOverlayIsResizing = true;
    chatOverlayStartX = e.screenX;
    chatOverlayStartY = e.screenY;
    if (chatOverlayMode === 'main') {
      chatOverlayStartWidth = window.outerWidth || chatOverlayAppConfig?.chatOverlayWidth || 450;
      chatOverlayStartHeight = window.outerHeight || chatOverlayAppConfig?.chatOverlayHeight || 400;
    } else if (chatOverlayMode === 'sub1') {
      chatOverlayStartWidth = window.outerWidth || chatOverlayAppConfig?.chatOverlaySubWidth || 450;
      chatOverlayStartHeight = window.outerHeight || chatOverlayAppConfig?.chatOverlaySubHeight || 400;
    } else {
      chatOverlayStartWidth = window.outerWidth || chatOverlayAppConfig?.chatOverlaySub2Width || 450;
      chatOverlayStartHeight = window.outerHeight || chatOverlayAppConfig?.chatOverlaySub2Height || 400;
    }
  });
}

window.addEventListener('mousemove', (e) => {
  if (!chatOverlayIsResizing) return;
  const deltaX = e.screenX - chatOverlayStartX;
  const deltaY = e.screenY - chatOverlayStartY;
  
  const newWidth = Math.max(300, chatOverlayStartWidth + deltaX);
  const newHeight = Math.max(200, chatOverlayStartHeight + deltaY);
  
  window.electronAPI.setChatOverlaySize(chatOverlayMode, newWidth, newHeight);
});

window.addEventListener('mouseup', (e) => {
  if (!chatOverlayIsResizing) return;
  chatOverlayIsResizing = false;
  
  const deltaX = e.screenX - chatOverlayStartX;
  const deltaY = e.screenY - chatOverlayStartY;
  const newWidth = Math.max(300, chatOverlayStartWidth + deltaX);
  const newHeight = Math.max(200, chatOverlayStartHeight + deltaY);
  
  if (chatOverlayMode === 'main') {
    window.electronAPI.applySettings({
      chatOverlayWidth: newWidth,
      chatOverlayHeight: newHeight
    });
  } else if (chatOverlayMode === 'sub1') {
    window.electronAPI.applySettings({
      chatOverlaySubWidth: newWidth,
      chatOverlaySubHeight: newHeight
    });
  } else if (chatOverlayMode === 'sub2') {
    window.electronAPI.applySettings({
      chatOverlaySub2Width: newWidth,
      chatOverlaySub2Height: newHeight
    });
  }
});

// Scroll Event for Infinite Scroll
chatArea.addEventListener('scroll', async () => {
  if (chatArea.scrollTop <= 5 && !isLoadingMore && !hasReachedEnd) {
    isLoadingMore = true;
    try {
      const oldScrollHeight = chatArea.scrollHeight;
      const newItems = await window.electronAPI.getMoreChatHistory(chatOverlayCurrentTab);
      
      if (newItems && newItems.length > 0) {
        const filtered = newItems.filter((chat: any) => shouldShowChat(chat));

        // insertBefore로 앞에 끼워 넣을 때, 가장 최신(뒤쪽) 데이터부터 먼저 삽입해야 
        // 결과적으로 올바른 시간 순서(오래된 로그가 위, 최신 로그가 아래)로 정렬됩니다.
        const reversedItems = [...filtered].reverse();
        reversedItems.forEach((chat: any) => {
          chatArea.insertBefore(createChatRow(chat), chatArea.firstChild);
        });

        // 튕김 방지 스크롤 고정
        chatArea.scrollTop = chatArea.scrollHeight - oldScrollHeight;

        if (newItems.length < 150) {
          hasReachedEnd = true;
        }
      } else {
        hasReachedEnd = true;
      }
    } catch (err) {
      console.error('Failed to load more chat history:', err);
    } finally {
      isLoadingMore = false;
    }
  }
});

// Window Load Handler
window.onload = async () => {
  initIcons();
  
  // 탭바 마우스 휠 좌우 스크롤 연동 (반응형 휠 편의성 제공)
  if (tabsBar) {
    tabsBar.addEventListener('wheel', (e) => {
      e.preventDefault();
      tabsBar.scrollLeft += e.deltaY;
    });
  }
};
