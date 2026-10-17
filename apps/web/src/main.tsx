import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Command,
  Difficulty,
  Ideology,
  WorkerRequest,
  WorkerResponse,
} from "../../../packages/contracts/src/index";
import {
  deserialize,
  stateHash,
  serialize,
} from "../../../packages/simulation-core/src/index";
import { Map } from "./Map";
import { useGame } from "./store";
import { loadLocal, saveLocal } from "./storage";
import { auth, cloudRequest } from "./cloud";
import "@fontsource-variable/noto-sans-kr";
import "./style.css";
import { AuthGate } from "./AuthGate";
const cash = (v: bigint) =>
  `${(Number(v) / 100).toLocaleString("ko-KR", { maximumFractionDigits: 0 })} N`;
const TABS = [
  "집무실",
  "국가 지도",
  "경제·재정",
  "국민·기업",
  "의회·정책",
  "외교",
  "월간 보고서",
  "저장",
];
function App({ userId }: { userId: string }) {
  const autosaveId = `user:${userId}:autosave`;
  const { world: w, busy, error, queue, selected, set } = useGame();
  const [tab, setTab] = useState(TABS[0]);
  const [seed, setSeed] = useState(2026);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [ideology, setIdeology] = useState<Ideology>([0, 0, 0]);
  const [tax, setTax] = useState(15);
  const [notice, setNotice] = useState("");
  const [reviewTurn, setReviewTurn] = useState(false);
  const [cloudId, setCloudId] = useState("");
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState<{
    snapshot: string;
    revision: number;
  } | null>(null);
  const [slots, setSlots] = useState<{ id: string; revision: number }[]>([]);
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  const pending = useRef(
    new globalThis.Map<
      number,
      { resolve: () => void; reject: (e: Error) => void }
    >(),
  );
  useEffect(() => {
    const instance = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.onmessage = ({ data }: { data: WorkerResponse }) => {
      const callback = pending.current.get(data.requestId);
      pending.current.delete(data.requestId);
      if (data.ok) {
        set({
          world: deserialize(data.snapshot),
          busy: false,
          error: "",
          queue: [],
        });
        saveLocal(autosaveId, {
          snapshot: data.snapshot,
          hash: data.hash,
          cloudRevision: 0,
          pending: true,
        }).catch((e) => set({ error: `자동 저장 실패: ${e.message}` }));
        callback?.resolve();
      } else {
        set({ busy: false, error: data.error });
        callback?.reject(Error(data.error));
      }
    };
    instance.onerror = () => {
      set({
        busy: false,
        error:
          "계산 작업이 중단됐습니다. 페이지를 새로고침한 뒤 자동 저장을 복원하세요",
      });
      for (const p of pending.current.values())
        p.reject(Error("Worker failed"));
      pending.current.clear();
    };
    return () => {
      instance.terminate();
    };
  }, [set, autosaveId]);
  const send = (msg: WorkerRequest) => {
    set({ busy: true, error: "" });
    return new Promise<void>((resolve, reject) => {
      pending.current.set(msg.requestId, { resolve, reject });
      worker.current!.postMessage(msg);
    });
  };
  const run = (fn: () => Promise<unknown>) => {
    set({ error: "" });
    fn().catch((e) => set({ error: e.message }));
  };
  const select = useCallback((id: string) => set({ selected: id }), [set]);
  const command = (kind: Command["kind"], payload: Command["payload"]) => {
    if (!w) return;
    set({
      queue: [
        ...queue,
        {
          id: crypto.randomUUID(),
          turn: w.turn,
          expectedRevision: w.revision,
          actorId: "president",
          kind,
          payload,
        },
      ],
    });
    setNotice("다음 월 진행에 적용할 명령을 추가했습니다");
  };
  const restore = () =>
    run(async () => {
      const s = await loadLocal(autosaveId);
      if (!s) throw Error("자동 저장이 없습니다");
      await send({
        requestId: ++request.current,
        type: "load",
        snapshot: s.snapshot,
      });
    });
  const sync = () =>
    run(async () => {
      if (!w) return;
      if (!cloudId) throw Error("저장 슬롯을 선택하거나 새로 만드세요");
      const result = await cloudRequest(`/saves/${cloudId}`, "PUT", {
        expectedRevision: revision,
        snapshot: serialize(w),
      });
      if (result.status === 409) {
        setConflict(result.data.current);
        setNotice("충돌: 로컬과 서버 버전을 모두 보존했습니다");
      } else {
        setRevision(result.data.revision);
        setNotice("온라인 저장 완료");
      }
    });
  const advance = () =>
    run(async () => {
      await send({
        requestId: ++request.current,
        type: "turn",
        commands: queue,
      });
      setReviewTurn(false);
      setNotice("한 달을 진행했습니다. 이번 달 소식을 확인하세요");
      setTab("집무실");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  const commandLabel = (c: Command) => {
    if (c.kind === "tax") return `소득세 ${c.payload.value}% 개정안 제출`;
    if (c.kind === "bond") return "국채 3,000 N 발행";
    if (c.kind === "project") return `${c.payload.target}에 도로 건설`;
    if (c.kind === "diplomacy") return "무역협정 체결 · 500 N";
    return "정책 실행";
  };
  if (!w)
    return (
      <main className="onboarding">
        <div className="eyebrow">NATION SIMULATOR · 국가 운영 시뮬레이션</div>
        <h1>
          당신의 선택으로
          <br />한 나라가 시작됩니다
        </h1>
        <p>
          국민 1,000명, 첫 번째 임기
          <br />
          정책과 삶이 이어지는 월 단위 국가 시뮬레이션
        </p>
        <section className="start-guide">
          <h2>처음이라면, 이렇게 시작하세요</h2>
          <p>
            대통령이 되어 국민의 생활과 국가 재정을 관리합니다. 시간은 직접
            ‘다음 달’을 누를 때만 흐릅니다.
          </p>
          <ol>
            <li>국고와 생활 만족도를 살펴보세요</li>
            <li>필요한 정책을 예약하세요. 아무것도 바꾸지 않아도 괜찮아요</li>
            <li>한 달을 진행하고 결과를 비교하세요</li>
          </ol>
          <p>
            첫 목표는 3개월 동안 나라의 변화를 관찰하는 것. 기본 설정 그대로
            시작해도 됩니다.
          </p>
        </section>
        <section>
          <h2>나의 첫 국가</h2>
          <details>
            <summary>상세 설정 · 정치 성향과 세계 시드</summary>
            {[
              "시장 자율 ↔ 공공 개입",
              "전통 유지 ↔ 사회 변화",
              "개발 우선 ↔ 환경 보전",
            ].map((label, i) => (
              <label key={label}>
                {label}
                <input
                  aria-label={label}
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={ideology[i]}
                  onChange={(e) => {
                    const n = [...ideology] as Ideology;
                    n[i] = +e.target.value;
                    setIdeology(n);
                  }}
                />
              </label>
            ))}
            <label>
              세계 시드
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(+e.target.value)}
              />
            </label>
          </details>
          <label>
            초기 조건
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">쉬움</option>
              <option value="normal">보통</option>
              <option value="hard">어려움</option>
              <option value="extreme">극한</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(() =>
                send({
                  requestId: ++request.current,
                  type: "new",
                  seed,
                  difficulty,
                  ideology,
                }),
              )
            }
          >
            국가 창설 · 취임하기
          </button>
          <button disabled={busy} onClick={restore}>
            자동 저장 이어하기
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
        <small>개발 중인 내부 통합 빌드 · 현실 예측 모델이 아닙니다</small>
      </main>
    );
  const m = w.metrics;
  const previous = w.history.at(-2);
  const parcel = w.parcels.find((p) => p.id === selected);
  return (
    <div className="layout">
      <aside>
        <div className="brand">
          N<span>신생국</span>
        </div>
        <p className="eyebrow">PRESIDENT'S OFFICE</p>
        <nav aria-label="국가 운영 메뉴">
          {TABS.map((name, i) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              <span>0{i + 1}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          제 {w.presidentTerms}대 대통령
          <br />
          세계 시드 {w.seed}
          <br />
          <small>내부 개발 빌드 0.1</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">국가 운영 현황</div>
            <h1>
              {Math.floor(w.turn / 12) + 1}년 {(w.turn % 12) + 1}월{" "}
              <small>· {w.turn}개월 경과</small>
            </h1>
          </div>
          <span className="month-label">정책을 고르고 한 달씩 진행하세요</span>
        </header>
        {w.status === "ended" && (
          <section className="ending">
            <h2>임기를 마쳤습니다</h2>
            <p>
              {w.endReason} · 재임 {w.turn}개월
            </p>
          </section>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
            <button onClick={() => setNotice("")}>닫기</button>
          </p>
        )}
        {tab === "집무실" && (
          <section className="mission">
            <div className="eyebrow">
              {w.turn < 3 ? "첫 운영 가이드" : "대통령 집무실"}
            </div>
            <h2>
              {w.turn === 0
                ? "취임을 환영합니다"
                : `${w.turn}개월의 운영을 돌아볼 시간입니다`}
            </h2>
            <p>
              {w.turn === 0
                ? "첫 달에는 정책을 바꾸지 않고 진행해 보세요. 국민의 고용·소비·생활이 어떻게 변하는지 확인할 수 있습니다."
                : "아래 지표와 이번 달 소식을 확인한 뒤 다음 결정을 내려보세요. 정책의 결과는 여러 달에 걸쳐 나타날 수 있습니다."}
            </p>
            <ol className="steps">
              <li>현황 확인</li>
              <li>
                정책 예약 <small>선택 사항</small>
              </li>
              <li>다음 달 진행</li>
            </ol>
            {w.turn < 3 && (
              <p className="goal">
                첫 목표 · 3개월 운영해 보기 <span>{w.turn} / 3개월</span>
              </p>
            )}
          </section>
        )}
        <div className="metrics">
          {[
            ["국민", `${m.population.toLocaleString()} 명`],
            ["월간 GDP", cash(m.gdp)],
            ["국고", cash(w.accounts.treasury)],
            ["생활 만족", `${m.approval.toFixed(1)}%`],
          ].map(([k, v]) => (
            <section key={k}>
              <small>{k}</small>
              <strong>{v}</strong>
            </section>
          ))}
        </div>
        {tab === "집무실" && (
          <>
            <section>
              <h2>이번 달, 무엇을 할까요?</h2>
              <p>
                한 번에 하나씩 바꾸고 결과를 비교해 보세요. 예약만으로는 시간이
                흐르지 않습니다.
              </p>
              <div className="action-grid">
                <button onClick={() => setTab("의회·정책")}>
                  <strong>세금 조정</strong>
                  <span>가계 소득과 국가 세수 사이에서 선택</span>
                  <small>의회·정책 →</small>
                </button>
                <button onClick={() => setTab("국가 지도")}>
                  <strong>도로 건설</strong>
                  <span>3,000 N을 투자하는 6개월 사업</span>
                  <small>국가 지도 →</small>
                </button>
                <button onClick={() => setTab("경제·재정")}>
                  <strong>재정 점검</strong>
                  <span>고용·세수·부채를 확인하고 자금 마련</span>
                  <small>경제·재정 →</small>
                </button>
                <button onClick={() => setTab("외교")}>
                  <strong>무역협정</strong>
                  <span>주변국과의 교역 조건 살펴보기</span>
                  <small>외교 →</small>
                </button>
              </div>
            </section>
            <section>
              <h2>이번 달 소식</h2>
              {previous && (
                <p className="month-change">
                  지난달 대비 · 생활 만족{" "}
                  {(m.approval - previous.approval).toFixed(1)}%p · 국민{" "}
                  {m.population - previous.population}명 · GDP{" "}
                  {cash(m.gdp - previous.gdp)}
                </p>
              )}
              {w.turn === 0 ? (
                <p>
                  아직 진행한 달이 없습니다. 하단의 ‘다음 달 진행’을 누르면 첫
                  결과가 나옵니다.
                </p>
              ) : (
                <>
                  <p>
                    실업률 {m.unemployment.toFixed(1)}% · 월 세수 {cash(m.tax)}{" "}
                    · 출생 {m.births}명 · 사망 {m.deaths}명
                  </p>
                  {w.events
                    .filter((e) => !["wage", "consumption"].includes(e.type))
                    .slice(-4)
                    .map((e) => (
                      <p key={e.id}>{e.message}</p>
                    ))}
                  <button onClick={() => setTab("월간 보고서")}>
                    월간 보고서 자세히 보기 →
                  </button>
                </>
              )}
            </section>
          </>
        )}
        {tab === "국가 지도" && (
          <>
            <div className="section-title">
              <h2>우리의 영토</h2>
              <span>드래그 이동 · 휠 확대 · 필지 클릭</span>
            </div>
            <Map parcels={w.parcels} select={select} />
            <section className="row">
              <div>
                <h3>공공 인프라</h3>
                <p>
                  예상 공기 6개월 · 사업비 {cash(300000n)}
                  <br />
                  생산성 개선은 고용·수요에 따라 달라집니다
                </p>
              </div>
              <label>
                필지 선택
                <select
                  aria-label="필지 선택"
                  value={selected ?? ""}
                  onChange={(e) => select(e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {w.parcels
                    .filter((p) => p.terrain !== "water" && !p.building)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} · {p.terrain}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!parcel || busy || w.status === "ended"}
                onClick={() =>
                  command("project", { target: selected!, project: "road" })
                }
              >
                도로 건설 예약
              </button>
            </section>
            <section>
              <h3>진행 중인 공공사업</h3>
              {w.projects.length === 0 ? (
                <p>착수한 사업이 없습니다</p>
              ) : (
                w.projects.map((p) => (
                  <p key={p.id}>
                    {p.parcelId} · {p.kind} ·{" "}
                    {p.complete ? "준공" : `${p.remaining}개월 남음`}
                  </p>
                ))
              )}
            </section>
          </>
        )}
        {tab === "경제·재정" && (
          <>
            <section>
              <h2>경제와 금융</h2>
              <div className="facts">
                <p>
                  고용 {m.employed} / 경제활동인구 {m.laborForce}
                </p>
                <p>실업률 {m.unemployment.toFixed(1)}%</p>
                <p>식량 가격지수 {m.priceIndex.toFixed(1)} (초기=100)</p>
                <p>월 세수 {cash(m.tax)}</p>
                <p>정부 부채 {cash(w.governmentDebt)}</p>
                <p>중앙은행 기준금리 {(w.policyRateBps / 100).toFixed(2)}%</p>
              </div>
              <p>GDP: 월간 국내 최종 소비와 공공조달 거래 합계, 수입 제외</p>
              <button
                disabled={busy || w.status === "ended"}
                onClick={() => command("bond", { value: 300000 })}
              >
                국채 3,000 N 발행 예약
              </button>
            </section>
            <section>
              <h3>최근 12개월 GDP</h3>
              <div className="bars">
                {w.history.slice(-12).map((x) => (
                  <div key={x.turn} title={cash(x.gdp)}>
                    <i
                      style={{
                        height: `${Math.max(2, (Number(x.gdp) * 100) / Math.max(1, ...w.history.slice(-12).map((x) => Number(x.gdp))))}px`,
                      }}
                    />
                    <small>{x.turn}월</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {tab === "국민·기업" && (
          <>
            <section>
              <h2>기업</h2>
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>고용</th>
                    <th>재고</th>
                    <th>잔액</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {w.companies.map((f) => (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{f.employees.length}</td>
                      <td>{f.inventory}</td>
                      <td>{cash(w.accounts[f.id])}</td>
                      <td>{f.active ? "영업" : "중단"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section>
              <h2>가구 장부</h2>
              <details>
                <summary>전체 {w.households.length}가구 보기</summary>
                <table>
                  <thead>
                    <tr>
                      <th>가구</th>
                      <th>구성원</th>
                      <th>자산</th>
                      <th>식량</th>
                      <th>만족도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.households.map((h) => (
                      <tr key={h.id}>
                        <td>{h.id}</td>
                        <td>{h.memberIds.length}</td>
                        <td>{cash(w.accounts[h.id])}</td>
                        <td>{h.food}</td>
                        <td>{h.satisfaction.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          </>
        )}
        {tab === "의회·정책" && (
          <>
            <section>
              <h2>국민의회 · 11석</h2>
              <div className="seats">
                {w.parties.map((p) => (
                  <div key={p.id}>
                    <span>{p.name}</span>
                    <strong>{p.seats}</strong>
                    <small>석</small>
                  </div>
                ))}
              </div>
              <p>
                초대 총선: 24개월 · 이후 48개월 간격 / 대통령 선거: 48개월 간격
              </p>
            </section>
            <section>
              <h2>소득세 개정안</h2>
              <p>현재 {w.incomeTax}% · 의회 과반수 6석 찬성 시 다음 달 시행</p>
              <label>
                제안 세율
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={tax}
                  onChange={(e) => setTax(+e.target.value)}
                />
              </label>
              <p>
                세율 인상은 가계 가처분소득과 세수에 영향을 줄 수 있습니다. 실제
                결과는 고용·소비 거래에 따라 결정됩니다
              </p>
              <button
                disabled={busy || w.status === "ended"}
                onClick={() => command("tax", { value: tax })}
              >
                법안 제출 예약
              </button>
              {w.laws.map((l) => (
                <p key={l.id}>
                  {l.tax}% · {l.status} · 찬성 {l.yes} 반대 {l.no}
                </p>
              ))}
            </section>
          </>
        )}
        {tab === "외교" && (
          <section>
            <h2>주변국</h2>
            <div className="neighbors">
              {w.neighbors.map((n) => (
                <article key={n.id}>
                  <div className="eyebrow">NEIGHBORING NATION</div>
                  <h3>{n.name}</h3>
                  <p>
                    인구 {n.population.toLocaleString()}
                    <br />
                    관계 {n.relation}
                    <br />
                    변동환율 {n.exchangeRate.toFixed(3)}
                    <br />
                    식량 수입 기준가 {cash(n.foodPrice)}
                  </p>
                  <button
                    disabled={n.tradeAgreement || busy || w.status === "ended"}
                    onClick={() => command("diplomacy", { target: n.id })}
                  >
                    {n.tradeAgreement ? "협정 체결됨" : "무역협정 예약 · 500 N"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === "월간 보고서" && (
          <section>
            <h2>{w.turn}개월 차 월간 보고서</h2>
            <p>
              출생 {m.births}명 · 사망 {m.deaths}명 · 거래 {w.journal.length}건
            </p>
            <p>
              결과 해시 <code>{stateHash(w)}</code> · 모든 분개 균형 검증 완료
            </p>
            <div className="events">
              {w.events
                .filter((e) => !["wage", "consumption"].includes(e.type))
                .map((e) => (
                  <p key={e.id}>
                    <code>{e.id}</code> {e.message}
                  </p>
                ))}
            </div>
            <details>
              <summary>개별 거래·원인 추적</summary>
              {w.journal.map((j) => (
                <p key={j.id}>
                  <code>
                    {j.id} → {j.causeEventId}
                  </code>{" "}
                  {j.postings
                    .map(
                      (p) =>
                        `${p.accountId}: 차변 ${cash(p.debitMinor)} / 대변 ${cash(p.creditMinor)}`,
                    )
                    .join(" | ")}
                </p>
              ))}
            </details>
          </section>
        )}
        {tab === "저장" && (
          <>
            <section>
              <h2>로컬 저장</h2>
              <p>월 진행마다 이 브라우저에 자동 저장됩니다</p>
              <button disabled={busy} onClick={restore}>
                자동 저장 복원
              </button>
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([serialize(w)], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `nation-${w.turn}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                파일 내보내기
              </button>
              <label>
                저장 파일 가져오기
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      run(async () => {
                        if (f.size > 20000000) throw Error("파일 크기 초과");
                        await send({
                          requestId: ++request.current,
                          type: "load",
                          snapshot: await f.text(),
                        });
                      });
                  }}
                />
              </label>
            </section>
            <section>
              <h2>온라인 저장</h2>
              {!auth ? (
                <p>
                  무료 운영 모드에서는 온라인 저장을 제공하지 않습니다. 자동
                  저장과 파일 내보내기를 이용하세요
                </p>
              ) : (
                <>
                  <button
                    onClick={() =>
                      run(async () => {
                        const { error } = await auth!.auth.signInWithOAuth({
                          provider: "google",
                          options: { redirectTo: location.origin },
                        });
                        if (error) throw error;
                      })
                    }
                  >
                    Google 계정으로 로그인
                  </button>
                  <button
                    onClick={() =>
                      run(async () => {
                        const { data } = await cloudRequest("/saves");
                        setNotice("저장 슬롯 목록을 불러왔습니다");
                        setSlots(data);
                      })
                    }
                  >
                    내 저장 슬롯 조회
                  </button>
                  <button
                    onClick={() =>
                      run(async () => {
                        const { data } = await cloudRequest("/saves", "POST", {
                          snapshot: serialize(w),
                        });
                        setCloudId(data.id);
                        setRevision(data.revision);
                        setNotice("새 온라인 저장 슬롯 생성 완료");
                      })
                    }
                  >
                    새 슬롯 만들기
                  </button>
                  <label>
                    저장 슬롯
                    <select
                      value={cloudId}
                      onChange={(e) => {
                        setCloudId(e.target.value);
                        setRevision(
                          slots.find((s) => s.id === e.target.value)
                            ?.revision ?? 0,
                        );
                      }}
                    >
                      <option value="">선택</option>
                      {slots.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} · v{s.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button onClick={sync}>온라인 저장</button>
                  <button
                    onClick={() =>
                      run(async () => {
                        const { data } = await cloudRequest(
                          `/saves/${cloudId}`,
                        );
                        await send({
                          requestId: ++request.current,
                          type: "load",
                          snapshot: data.snapshot,
                        });
                        setRevision(data.revision);
                      })
                    }
                  >
                    온라인 복원
                  </button>
                  {conflict && (
                    <div role="alert">
                      <h3>저장 충돌</h3>
                      <p>
                        서버 버전 {conflict.revision}과 로컬 버전을 자동
                        병합하지 않습니다
                      </p>
                      <button
                        onClick={() =>
                          run(async () => {
                            await send({
                              requestId: ++request.current,
                              type: "load",
                              snapshot: conflict.snapshot,
                            });
                            setRevision(conflict.revision);
                            setConflict(null);
                          })
                        }
                      >
                        서버 버전 복원
                      </button>
                      <button
                        onClick={() =>
                          run(async () => {
                            const { data } = await cloudRequest(
                              "/saves",
                              "POST",
                              { snapshot: serialize(w) },
                            );
                            setCloudId(data.id);
                            setRevision(data.revision);
                            setConflict(null);
                          })
                        }
                      >
                        로컬을 새 슬롯에 보존
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
        {queue.length > 0 && (
          <section className="queue">
            <h3>다음 달 명령 {queue.length}건</h3>
            {queue.map((c, i) => (
              <div key={c.id}>
                {commandLabel(c)}
                <button
                  disabled={busy}
                  aria-label={`${commandLabel(c)} 취소`}
                  onClick={() =>
                    set({ queue: queue.filter((_, j) => j !== i) })
                  }
                >
                  취소
                </button>
              </div>
            ))}
          </section>
        )}
        <div className="turn-bar">
          <div>
            <strong>
              {queue.length
                ? `실행할 정책 ${queue.length}건`
                : "현재 정책 유지"}
            </strong>
            <small>한 달 진행 후 이 기기에 자동 저장</small>
          </div>
          <button
            className="primary"
            disabled={busy || w.status === "ended"}
            onClick={() => (queue.length ? setReviewTurn(true) : advance())}
          >
            {busy ? "계산 중…" : "다음 달 진행 →"}
          </button>
        </div>
        {reviewTurn && (
          <dialog
            ref={(node) => {
              if (node && !node.open) node.showModal();
            }}
            onCancel={(event) => {
              event.preventDefault();
              if (!busy) setReviewTurn(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            className="turn-dialog"
          >
            <h2 id="review-title">다음 달 실행할 정책</h2>
            <p>
              예약한 정책을 적용하고 한 달을 진행합니다. 법안은 의회 표결 결과에
              따라 달라집니다.
            </p>
            <ul>
              {queue.map((c) => (
                <li key={c.id}>{commandLabel(c)}</li>
              ))}
            </ul>
            <button disabled={busy} onClick={() => setReviewTurn(false)}>
              돌아가기
            </button>
            <button className="primary" disabled={busy} onClick={advance}>
              {busy ? "계산 중…" : "정책 적용하고 한 달 진행"}
            </button>
            {error && <p role="alert">{error}</p>}
          </dialog>
        )}
        <footer>
          1턴 = 1개월 · 자동 시간 진행 없음 · 국민의 삶은 거래에서 시작됩니다
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AuthGate>{(user) => <App key={user.id} userId={user.id} />}</AuthGate>,
);
