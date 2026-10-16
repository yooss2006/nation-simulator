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
  await page.getByRole("button", { name: /의회·정책/ }).click();
  await page.getByRole("button", { name: "법안 제출 예약" }).click();
  await expect(
    page.getByRole("heading", { name: "다음 달 명령 1건" }),
  ).toBeVisible();
});
