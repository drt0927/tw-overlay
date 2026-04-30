# UX 리뷰 대응 결과 피드백

**날짜:** 2026-04-30  
**대상:** `review_response.md`

---

## 전체 평가

대응 완성도 자체는 높음. 대부분의 항목이 명확하게 처리되었고, False positive를 숨기지 않고 명시한 점과 요청하지 않은 리팩토링을 추가 판단해 적용한 점이 좋음.  
다만 아래 두 가지 이슈 확인 필요.

---

## 확인된 문제

### ❌ gallery 아이콘 요약표 오기재

**요약표:**
> `gallery` 아이콘 의미불일치 (`bell`) | ✅ 수정 완료 (dock만) | dock에서만 `layout-grid`

**세부 내용:**
> 기존 유저 혼란 방지를 위해 사이드바와 dock 모두 기존 `bell` 아이콘 유지. 아이콘 변경 없음.

실제 코드 확인 결과, `sidebar_menus.json`의 gallery 항목은 여전히 `"icon": "bell"`.  
dock이 이제 `sidebar_menus.json`을 동적으로 로드하므로 dock도 `bell` 그대로 표시됨.  
**요약표의 "dock에서만 `layout-grid`"는 사실과 다름.** 세부 내용이 실제 상태.

→ 요약표를 실제와 일치하도록 수정 필요.

---

### ⚠️ SSL 폴백 — 재시도 전 file close/unlink 미완료 (Windows Race Condition)

```typescript
// scamMonitor.ts:295-300
}).on('error', (err) => {
    file.close();                        // ← async, 완료 대기 없음
    fs.unlink(tmpPath, () => { });       // ← async, 완료 대기 없음
    if (!skipSSLVerify && /certificate|SSL|CERT/i.test(err.message)) {
        doModelDownload(true).then(resolve).catch(reject);  // ← 즉시 호출
        // 새 WriteStream이 tmpPath를 열 때 이전 fd가 아직 닫혀있지 않을 수 있음
    }
```

SSL 에러는 `res.pipe(file)` 이전(HTTP 요청 단계)에 발생하므로 파일에 실제 쓴 데이터는 없음.  
대부분의 환경에서 문제없이 동작하지만, Windows에서는 `file.close()` 완료 전에  
동일 `tmpPath`로 새 `WriteStream`을 열면 **EBUSY**로 재시도 자체가 실패할 수 있음.

`galleryMonitor.ts`의 SSL 폴백은 메모리 내 문자열 처리라 이 문제가 없지만,  
파일 스트림이 개입된 `doModelDownload`에서는 close → unlink 완료 후 재시도해야 안전.

**수정 방안:**

```typescript
}).on('error', (err) => {
    if (!skipSSLVerify && /certificate|SSL|CERT/i.test(err.message)) {
        log(`[SCAM] 모델 다운로드 SSL 검증 실패, 재시도: ${err.message}`);
        file.close(() => {                          // close 완료 후
            fs.unlink(tmpPath, () => {              // unlink 완료 후
                doModelDownload(true).then(resolve).catch(reject);
            });
        });
        return;
    }
    file.close(); fs.unlink(tmpPath, () => { });
    _modelDownloading = false; reject(err);
});
```

---

## 잘된 점

**False positive 정직하게 명시**  
`dock:feature-closed`와 `onScamProgress` 두 항목 모두 실제로는 이미 처리되어 있었다는 점을  
"수정 완료"로 덮지 않고 false positive로 명시한 것이 좋음.  
특히 `preload.ts`의 `removeAllListeners` 동작은 리뷰어 입장에서 놓치기 쉬운 부분.

**FEATURES 배열 동적 로드 리팩토링**  
요청하지 않은 항목이지만, `fullscreen-dock.html`의 하드코딩 FEATURES를  
`sidebar_menus.json` 동적 로드로 교체한 판단이 적절함.  
이후 사이드바에 기능이 추가될 때 dock에 자동 반영되어 유지보수 비용이 낮아짐.

**세션 스크롤 복원 방식 선택**  
Full DOM diff 대신 `scrollTop` 저장/복원 방식을 선택한 것이 현실적.  
구현 복잡도가 훨씬 낮으면서 사용자가 체감하는 문제(스크롤 튀어오름)는 동일하게 해결됨.
