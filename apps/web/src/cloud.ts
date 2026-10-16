import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const auth = url && key ? createClient(url, key) : null;
export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
export async function cloudRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  if (!auth) throw Error("온라인 저장 환경변수가 설정되지 않았습니다");
  const {
    data: { session },
  } = await auth.auth.getSession();
  if (!session) throw Error("먼저 로그인하세요");
  const res = await fetch(apiUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok && res.status !== 409)
    throw Error(data.error ?? "온라인 저장 오류");
  return { status: res.status, data };
}
