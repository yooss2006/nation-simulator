import { test, expect } from "@playwright/test";
import { mockLogin } from "./auth-fixture";

test("비로그인 상태에서는 게임을 시작하지 못한다", async ({ page }) => {
  let workers = 0;
  page.on("worker", () => {
    workers++;
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "국가 창설 · 취임하기" }),
  ).toHaveCount(0);
  expect(workers).toBe(0);
  await page.route("**/auth/v1/settings", (route) =>
    route.fulfill({ json: { external: { google: false } } }),
  );
  await page.getByRole("button", { name: "Google로 계속하기" }).click();
  await expect(page.getByRole("alert")).toContainText("연결을 준비 중");
});

test("서버가 거절한 저장 토큰으로는 입장하지 못한다", async ({ page }) => {
  await mockLogin(page);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ status: 401, json: { message: "invalid JWT" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "국가 창설 · 취임하기" }),
  ).toHaveCount(0);
});

test("로그아웃하면 실행 중인 게임을 닫는다", async ({ page }) => {
  await mockLogin(page);
  await page.goto("/");
  await page.getByRole("button", { name: "국가 창설 · 취임하기" }).click();
  await expect(
    page.getByRole("button", { name: "다음 달 진행 →" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "다음 달 진행 →" }),
  ).toHaveCount(0);
});
