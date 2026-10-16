import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { loginClient, authUrl, publicKey } from "./auth";
import { useGame } from "./store";

export function AuthGate({
  children,
}: {
  children: (user: User) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let revision = 0;
    let currentId: string | null = null;
    const reset = () => {
      useGame.getState().set({
        world: null,
        queue: [],
        selected: null,
        busy: false,
        error: "",
      });
    };
    const validate = async () => {
      const request = ++revision;
      try {
        const {
          data: { session },
          error: sessionError,
        } = await loginClient.auth.getSession();
        if (sessionError) throw sessionError;
        let verified: User | null = null;
        if (session) {
          const { data, error: userError } = await loginClient.auth.getUser();
          if (userError) throw userError;
          if (data.user && !data.user.is_anonymous) verified = data.user;
        }
        if (!active || request !== revision) return;
        if (currentId !== (verified?.id ?? null)) reset();
        currentId = verified?.id ?? null;
        setUser(verified);
      } catch {
        if (!active || request !== revision) return;
        reset();
        currentId = null;
        setUser(null);
        setError(
          "로그인을 확인하지 못했습니다. 인터넷 연결을 확인하고 다시 로그인해 주세요",
        );
      } finally {
        if (active && request === revision) setChecking(false);
      }
    };
    const {
      data: { subscription },
    } = loginClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        ++revision;
        currentId = null;
        reset();
        setUser(null);
        setChecking(false);
      } else {
        // Do not await another Auth call inside the SDK's session lock.
        setTimeout(() => {
          if (active) void validate();
        }, 0);
      }
    });
    void validate();
    const onFocus = () => {
      void validate();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      ++revision;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      reset();
    };
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      const settings = await fetch(`${authUrl}/auth/v1/settings`, {
        headers: { apikey: publicKey },
      });
      if (!settings.ok) throw Error("settings unavailable");
      const config = await settings.json();
      if (!config.external?.google) {
        setError(
          "Google 로그인 연결을 준비 중입니다. 연결이 완료되면 누구나 이용할 수 있습니다",
        );
        setBusy(false);
        return;
      }
      const { error } = await loginClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch {
      setError(
        "Google 로그인 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요",
      );
      setBusy(false);
    }
  };
  if (checking)
    return (
      <main className="onboarding">
        <p role="status">로그인 확인 중…</p>
      </main>
    );
  if (!user)
    return (
      <main className="onboarding">
        <div className="eyebrow">NATION SIMULATOR</div>
        <h1>
          당신의 나라를
          <br />
          시작할 준비가 됐나요?
        </h1>
        <section>
          <h2>로그인하고 시작하기</h2>
          <p>Google 계정으로 로그인하면 누구나 이용할 수 있습니다</p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void signIn()}
          >
            {busy ? "로그인으로 이동 중…" : "Google로 계속하기"}
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
        <small>진행 상황은 이 기기의 브라우저에 저장됩니다</small>
      </main>
    );
  return (
    <>
      <div className="account-bar">
        <span>{user.email ?? "로그인됨"}</span>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await loginClient.auth.signOut({
              scope: "local",
            });
            setBusy(false);
            if (error) setError("로그아웃하지 못했습니다. 다시 시도해 주세요");
          }}
        >
          로그아웃
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
      {children(user)}
    </>
  );
}
