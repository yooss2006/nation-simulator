import { test, expect } from "@playwright/test";
import { mockLogin } from "./auth-fixture";
test("세계 생성, 한 달 진행, 자동 저장 복원", async ({ page }) => {
  await mockLogin(page);
  await page.goto("/");
  await page.getByRole("button", { name: "국가 창설 · 취임하기" }).click();
  await expect(
    page.getByRole("heading", { name: "1년 1월 · 0개월 경과" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다음 달 진행 →" }).click();
  await expect(
    page.getByRole("heading", { name: "1년 2월 · 1개월 경과" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "자동 저장 이어하기" }).click();
  await expect(
    page.getByRole("heading", { name: "1년 2월 · 1개월 경과" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "test-results/game-map.png", fullPage: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /의회·정책/ })
    .click();
  await page.getByRole("button", { name: "법안 제출 예약" }).click();
  await expect(
    page.getByRole("heading", { name: "다음 달 명령 1건" }),
  ).toBeVisible();
});

for (const width of [390, 320]) {
  test(`모바일 ${width}px 안내, 정책 확인, 월 진행`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockLogin(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "처음이라면, 이렇게 시작하세요" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "국가 창설 · 취임하기" }).click();
    await expect(
      page.getByRole("heading", { name: "취임을 환영합니다" }),
    ).toBeVisible();
    const next = page.getByRole("button", { name: "다음 달 진행 →" });
    await expect(next).toBeInViewport();
    for (const name of [
      "국가 지도",
      "경제·재정",
      "국민·기업",
      "의회·정책",
      "외교",
      "월간 보고서",
      "저장",
      "집무실",
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: new RegExp(name) })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole("button", { name: /세금 조정/ }).click();
    await page.getByRole("button", { name: "법안 제출 예약" }).click();
    await next.click();
    await expect(page.getByRole("dialog")).toContainText(
      "소득세 15% 개정안 제출",
    );
    await page.getByRole("button", { name: "돌아가기", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "1년 1월 · 0개월 경과" }),
    ).toBeVisible();
    await next.click();
    await page
      .getByRole("button", { name: "정책 적용하고 한 달 진행" })
      .click();
    await expect(
      page.getByRole("heading", { name: "1년 2월 · 1개월 경과" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "이번 달 소식" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/mobile-${width}.png`,
      fullPage: true,
    });
  });
}
