import type { Command, World } from "../../../packages/contracts/src/index";
import { RULES } from "../../../packages/game-data/src/index";
const money = (value: bigint) =>
  `${(Number(value) / 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })} N`;
export function ActionPreview({
  world,
  kind,
  value = 15,
  target,
}: {
  world: World;
  kind: Command["kind"];
  value?: number;
  target?: string;
}) {
  let direct = "";
  let benefit = "";
  let risk = "";
  let watch = "";
  if (kind === "tax") {
    direct = `현재 ${world.incomeTax}% → 제안 ${value}%. 의회 6석 이상 찬성해야 시행됩니다. 임금 100 N당 세후 소득은 ${100 - world.incomeTax} N에서 ${100 - value} N으로 바뀝니다.`;
    benefit =
      value > world.incomeTax
        ? "고용과 임금이 유지되면 세수가 늘어나 공공사업과 생활지원에 쓸 재원을 확보합니다."
        : value < world.incomeTax
          ? "세후 임금이 늘어 식량 구매 여력이 부족했던 가구가 더 살 수 있습니다."
          : "현재 세율을 유지하므로 이 법안 자체로 세후 임금은 달라지지 않습니다.";
    risk =
      value > world.incomeTax
        ? "세후 임금이 줄어 식량 구매가 부족해지면 생활 만족도가 낮아질 수 있습니다."
        : value < world.incomeTax
          ? "같은 임금 규모에서 세수가 줄어듭니다. 가구가 이미 필요한 식량을 모두 사고 있다면 소비 증가 효과도 제한됩니다."
          : "정책을 유지해도 고용·기업 자금·물가가 변하면 세수와 만족도는 달라집니다.";
    watch =
      "진행 후 월 세수, 생활 만족, 식량 구입량을 비교하세요. 부결되면 세율은 바뀌지 않습니다.";
  } else if (kind === "project") {
    direct = `착수 시 국고 ${money(RULES.projectCost)} 지출 · 공기 ${RULES.projectMonths}개월. 준공 시 생산량 계산에 쓰는 인프라 계수가 0.02 증가합니다.`;
    benefit =
      "기업이 고용을 유지하면 준공 이후 생산량이 늘어날 수 있습니다. 부족했던 식량 공급을 보완할 수 있습니다.";
    risk =
      "건설비를 먼저 쓰지만 생산 효과는 준공 이후에 나타납니다. 기업이 임금을 감당하지 못하거나 재고가 남으면 효과가 제한됩니다.";
    watch =
      "국고 여유와 공사 남은 기간, 준공 이후 기업 생산·재고를 확인하세요. 빈 육지와 영업 중인 시공 기업이 필요합니다.";
  } else if (kind === "bond") {
    const principal = BigInt(value);
    direct = `국고 +${money(principal)}, 국가 부채 +${money(principal)}. 발행 시 연 ${(world.policyRateBps / 100).toFixed(2)}% 고정, 월 이자 ${money((principal * BigInt(world.policyRateBps)) / 120000n)}, 만기 24개월입니다.`;
    benefit = "당장 부족한 공공사업비나 생활지원 재원을 확보할 수 있습니다.";
    risk =
      "발행한 달부터 이자가 나가고 만기에는 원금을 갚습니다. 상환 자금이 부족하면 남은 원금은 12개월 연장됩니다. 은행 자금도 줄어듭니다.";
    watch =
      "월 세수와 이자 부담, 정부 부채를 함께 보세요. 은행에 발행액 이상의 자금이 있어야 합니다.";
  } else {
    const neighbor = world.neighbors.find((n) => n.id === target);
    direct = `체결 시 국고 500 N 지출 · 해당 국가와 관계 +20.${neighbor ? ` 현재 식량 수입 단가 약 ${money(BigInt(Math.round(Number(neighbor.foodPrice) * neighbor.exchangeRate)))}입니다.` : ""}`;
    benefit =
      "국내 식량을 충분히 사지 못한 가구에 수입 경로가 생깁니다. 구매 자금이 있으면 식량 부족과 만족도 하락을 줄일 수 있습니다.";
    risk =
      "가구에 돈이 없으면 협정만으로 식량을 살 수 없습니다. 수입대금은 해외로 나가며 국내 GDP에는 포함되지 않습니다. 환율에 따라 가격도 달라집니다.";
    watch =
      "식량 부족 가구, 수입 내역과 환율을 확인하세요. 여러 협정이 있어도 현재 게임은 식량 기준가가 가장 낮은 협정국부터 선택합니다.";
  }
  return (
    <details className="action-preview">
      <summary>예상 시나리오 · 선택하면 어떻게 될까?</summary>
      <p className="preview-note">
        현재 게임 규칙에 따른 설명입니다. 미래 수치나 성공 확률을 보장하지
        않으며, 다른 예약 정책과 이후 경제 변화에 따라 결과가 달라집니다.
      </p>
      <dl>
        <dt>실행되면</dt>
        <dd>{direct}</dd>
        <dt>기대할 수 있는 흐름</dt>
        <dd>{benefit}</dd>
        <dt>주의할 흐름</dt>
        <dd>{risk}</dd>
        <dt>다음에 확인할 것</dt>
        <dd>{watch}</dd>
      </dl>
    </details>
  );
}
