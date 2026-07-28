/** 모험일지 주간/일일 타임라인에서 공유하는 로그 처리 유틸리티. */
(() => {
  const systemTags = new Set(['숙제 완료', '자동', '득템', '수익']);

  function parseAutoLogAmount(content: string): number {
    const amountText = content.match(/\(([^)]+)\)/)?.[1];
    if (!amountText) return 0;
    const rawNumber = amountText.match(/([\d,]+)/)?.[1];
    let amount = rawNumber ? parseInt(rawNumber.replace(/,/g, ''), 10) : 0;
    if (amountText.includes('조')) amount *= 1000000000000;
    if (amountText.includes('억')) amount *= 100000000;
    else if (amountText.includes('만')) amount *= 10000;
    return amount;
  }

  function formatLogContent(content: string): string {
    return content.replace(/\[(.*?)\]/g, (match: string, tag: string) => {
      if (systemTags.has(tag)) return match;
      return `<span class="char-badge">${tag}</span>`;
    });
  }

  window.diaryLogUtils = Object.freeze({ parseAutoLogAmount, formatLogContent });
})();
