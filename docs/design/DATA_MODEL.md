# 데이터 모델 v0.1
## 엔티티
- World: id, seed, turn, countryIds, geography, marketIds, ruleVersion
- Country: id, parcels, resourceDeposits, citizenIds, institutions, currencyId, relations
- Citizen: id, birthTurn, citizenship, residence, householdId, education, health, employment, preferences
- Household: id, members, dwellingId, accounts, assets, debts, consumptionPlan
- Company: id, sector, siteIds, employeeIds, accounts, inventory, machines, debt, pricePlan
- Bank: id, deposits, loans, reserves, capital, riskRules
- Government: id, treasuryAccount, taxRules, budget, debt, projects
- CentralBank: id, mandate, policyRate, balanceSheet, monetaryOperations
- Party: id, ideologyVector, members, leader, candidateList, funds, platform
- Legislator: citizenId, partyId, term, positions, votes
- Law/Policy: id, authority, legalBasis, proposalStatus, effectiveTurn, parameters
- Parcel/Building: id, geometry, ownerId, zoning, capacity, condition, constructionProgress
- ForeignCountry: id, macroAccounts, sectors, policies, relations, tradeFlows

## 거래 및 회계
Account(id, ownerId, currencyId, kind); JournalEntry(id, turn, causeEventId, postings[]); Posting(accountId, debitMinor, creditMinor). 통화별 차변 합=대변 합. 재화 재고는 별도 물량 장부로 입출고 기록. 대출은 은행 대출자산과 예금부채를 동시에 생성. 통화 발행/소각은 중앙은행 장부에서 추적.

## 명령 및 사건
GameCommand(id, turn, actorId, kind, payload, expectedRevision); DomainEvent(id, turn, type, subjectIds, causeIds, payload); TurnResult(turn, stateHash, journalIds, events, aggregates, diagnostics).

## 데이터 불변식
전체 인구=거주 시민 엔티티 또는 코호트 인구 합. 출생-사망+유입-유출과 전월 대비 인구 차이 일치. 은행 자산·부채·자본 항등식 유지. 기업의 물량 재고는 생산+매입-판매-투입-폐기와 일치. 선거 의석 총합=11(충원 전 공석은 별도 표시). 모든 집계 지표에 기준 기간과 계산 방법 기록.

## 성능
시뮬레이션 내부는 정규화된 ID 참조와 인덱스 사용. 렌더러는 전체 세계가 아닌 화면에 필요한 투영 데이터만 받음. 대규모 인구 코호트 전환은 보존성 테스트 통과 후 적용.
