import type { SupabaseClient } from "@supabase/supabase-js";
import { compressSnapshot, expandSnapshot } from "./cloud-codec";
// Static deployment: no authentication or external API clients are initialized.
export const auth: SupabaseClient | null = null;
export const apiUrl = import.meta.env.VITE_API_URL || "/api";
export async function cloudRequest(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; data: any }> {
  if (!auth) throw Error("온라인 저장 환경변수가 설정되지 않았습니다");
  const {
    data: { session },
  } = await auth.auth.getSession();
  if (!session) throw Error("먼저 Google 계정으로 로그인하세요");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  let payload: ArrayBuffer | undefined;
  if (method === "POST" || method === "PUT") {
    const input = body as { snapshot: string; expectedRevision?: number };
    payload = await compressSnapshot(input.snapshot);
    headers["Content-Type"] = "application/octet-stream";
    if (method === "PUT")
      headers["X-Save-Revision"] = String(input.expectedRevision);
  }
  const res = await fetch(apiUrl + path, { method, headers, body: payload });
  if (res.ok && res.headers.get("Content-Type") === "application/octet-stream")
    return {
      status: res.status,
      data: {
        snapshot: await expandSnapshot(res),
        revision: Number(res.headers.get("X-Save-Revision")),
      },
    };
  const data = await res.json();
  if (res.status === 409 && data.current?.id) {
    const remote = await cloudRequest(`/saves/${data.current.id}`);
    return { status: 409, data: { ...data, current: remote.data } };
  }
  if (!res.ok) throw Error(data.error ?? "온라인 저장 오류");
  return { status: res.status, data };
}
