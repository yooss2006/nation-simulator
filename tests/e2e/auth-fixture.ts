import type { Page } from "@playwright/test";
export async function mockLogin(page: Page, id = "user-a") {
  const user = {
    id,
    email: `${id}@example.test`,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: false,
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp })).toString("base64url")}.test`;
  await page.addInitScript(
    ({ user, exp, token }) => {
      localStorage.setItem(
        "sb-dhpxzwgkbkkvjiisnkbc-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: exp,
          user,
        }),
      );
    },
    { user, exp, token },
  );
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/auth/v1/logout*", (route) =>
    route.fulfill({ status: 204 }),
  );
}
