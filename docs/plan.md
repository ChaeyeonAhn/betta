# Betta Project — 구현 플랜 v1

> v0 2026-11-18 작성 → v1 같은 날 리뷰 반영. 근거: 피칭 덱(Team3_ChaeyeonAhn_FinalProject.pdf), 노션 「Final Project 아이디어 / 계획」(최신), 「베타 프로젝트」·「정리본」(겹치면 최신 우선).
> 목표: **11/23까지 전체 흐름 뼈대 데모**. 입장부터 한 어항까지 소켓으로 끝까지 돌아가야 하고, 비주얼은 플레이스홀더로 둔다.

## 0. 확정된 결정

| 항목 | 결정 |
| --- | --- |
| 베타 생성 입력 | **A/B 두 모드 모두 구현**, 관리자 키로 전환. A = 1–10 다이얼패드 5문항, B = 30초 알림 폭주 가짜 피드 |
| 칸막이 해제 | **다 같이 힘을 합침**: 전원 입력의 합산이 임계치를 넘으면 붕괴. 제한 시간이 지나면 **자동 해제**로 fallback |
| 싸움 | **싸움 개념은 쓰지 않음.** 베타 사이 관계는 다가감 / 거리 두기 / 색이 묻어남으로만 표현. Genome의 `aggression` 축은 **`boundary`(경계)**로 교체 |
| 엔딩 | **끝 없이 계속**. open이 전시 루프가 되고, 늦게 온 관객은 합류하고 떠난 관객의 베타는 흐려짐 (§1-1) |
| 11/23 범위 | 전체 흐름 뼈대. 인트로 영상·사운드·고퀄 베타는 자리만 잡아둠 |
| 호스팅 | **로컬 먼저.** 노트북 한 대에서 Next + 소켓 서버를 돌리고, 폰은 같은 Wi‑Fi로 접속(`pnpm dev:mobile`). 클라우드(Vercel + Railway)는 데모 뒤로 미룸. 소켓 주소를 env 하나(`NEXT_PUBLIC_SOCKET_URL`)로만 바꾸면 옮겨갈 수 있게 짠다 (§5) |

## 1. 경험 흐름 = 상태 머신

```
lobby ──▶ input ──▶ born ──▶ grid ──▶ open ⟲ (끝 없음)
 (접속)   (A or B)  (탄생)   (칸막이)  (한 어항)
```

| stage | 메인 화면 (`/screen`) | 폰 (`/phone`) | 다음으로 |
| --- | --- | --- | --- |
| `lobby` | QR, 접속 인원 수, 빈 어항 | "입수 완료" | 관리자 키 |
| `input` | A: 지금 문항 / B: "폰을 보세요" | A: 다이얼패드 / B: 가짜 피드 | 전원 완료 or 관리자 키 |
| `born` | 베타가 하나씩 태어남 | 내 베타 미리보기 | 자동 (연출 끝) |
| `grid` | 큐브 격자(덱 1번 슬라이드 느낌), 칸마다 베타 1마리, 벽에 금이 감 | 탭/흔들기로 내 벽 밀기, 전체 게이지 | 합산 ≥ 임계치 or 타임아웃 |
| `open` | 벽이 무너지고 한 어항에서 헤엄침. 비슷하면 무리를 짓고, 경계가 큰 베타는 거리를 둠 | 드래그로 내 베타 조종 | 없음 (관리자 리셋만) |

### 1-1. 끝없는 open: 들어오고 나가기

`open` 한 번으로 회차를 닫지 않으니, 다음 두 경우를 처리해야 한다. **(리뷰에서 추가)**

- **늦게 온 관객**: 접속하면 혼자 input(현재 모드)을 거쳐 베타가 태어나고, **자기만의 큐브 하나에 갇힌 채 어항에 들어온다.** 혼자 탭해서 벽을 깨고 나온다. 혼자 기준이라 임계치가 낮고 타임아웃도 있다. 격자 장면을 한 마리 단위로 다시 겪는 셈.
- **떠난 관객**: 연결이 끊긴 지 N분(기본 3분)이 지나면 베타가 천천히 투명해지다 사라진다. 그 사이 재접속하면 복귀.
- **관리자 리셋**: 시연용. A 한 바퀴 → 리셋 → B 한 바퀴.

## 2. 아키텍처

```
[phone × N] ─┐                         ┌─ [screen (projection)]
             ├── Socket.IO ── server ──┤
             ┘   (노트북 :4000)          └─ (admin = screen 위 키보드)
      Next.js도 같은 노트북 (:3000), 같은 Wi‑Fi
      나중에: Next → Vercel, server → Railway (env만 교체)
```

**서버가 "세션"을 갖고, 스크린이 "물리"를 갖는다.**

- **서버 (authoritative)**: stage, mode, 플레이어 목록, 각자의 raw 입력과 genome, effort 합산, 타이머. **genome 계산도 서버에서**(한 곳에서만). 폰이 잠들거나 스크린을 새로고침해도 복구된다.
- **스크린**: 베타 위치, 무리 짓기, 거리 두기, 색 묻음 시뮬레이션과 렌더링. 서버는 위치를 모르고 조종 입력만 중계한다.
- **폰**: 입력 장치. `playerId`를 localStorage에 저장해 재접속하면 같은 베타로 돌아온다.

템플릿의 `socket-server.mjs`(join/message 단순 중계)는 이 구조와 맞지 않는다. betta 전용 서버로 교체한다.

### 2-1. `Genome`: 입력 모드와 무관한 공통 타입

A와 B 모두 같은 타입을 만든다. `born` 이후 단계는 어느 모드였는지 몰라도 된다. Mode A가 축마다 한 문항이라 **5축**으로 확정한다(v0의 `finSpread`는 `finLength`에서 파생).

```ts
type Genome = {
  hue: number;          // 0–1  몸 색 (차가움 → 따뜻함)
  saturation: number;   // 0–1  화려함 = 꾸밈 (selectively bred)
  finLength: number;    // 0–1  지느러미 = 드러내고 싶은 마음
  boundary: number;     // 0–1  경계 = 개인 공간 반경 (partitioned tank)
  sociability: number;  // 0–1  무리 짓는 성향
};
```

### 2-2. Mode A: 5문항 초안 (1 = 전혀, 10 = 매우)

| 축 | 질문 (KO) | Question (EN) |
| --- | --- | --- |
| `hue` | 오늘 하루, 마음의 온도는 몇 도쯤인가요? | How warm does your day feel right now? |
| `saturation` | 사진을 올리기 전에 고르고 다듬는 데 얼마나 공을 들이나요? | How much effort goes into choosing and editing before you post? |
| `finLength` | 사람들이 나를 봐줬으면 하는 마음은 얼마나 큰가요? | How much do you want to be seen by others? |
| `boundary` | 누군가 내 공간에 불쑥 들어오면, 얼마나 불편한가요? | When someone steps into your space uninvited, how uncomfortable do you feel? |
| `sociability` | 지금 더 필요한 건 혼자만의 시간인가요, 함께하는 시간인가요? (1 = 혼자) | Right now, do you need time alone or time together? (1 = alone) |

매핑: `(value − 1) / 9`. 문구는 리뷰 대상이다.

### 2-3. Mode B: 30초 알림 폭주

- 폰 한 화면에 가짜 피드 몇 장이 깔리고, 위에서 알림 배너가 점점 빠르게 쏟아진다(30초).
- 콘텐츠는 **텍스트 + 색 블록만** 쓴다. 이미지 제작 없이 11/23 안에 끝낼 수 있게.
- 게시물·알림 종류마다 축 태그를 단다. 예: `자랑`(saturation/finLength), `낯선 사람`(boundary), `친구·DM`(sociability), `무드`(hue).

| 축 | 관찰하는 행동 |
| --- | --- |
| `hue` | 머문 게시물들의 무드 색 평균 |
| `saturation` | `자랑` 게시물 체류시간·좋아요 비율 |
| `finLength` | "내 스토리 올리기" 같은 노출 버튼 누름 여부, 내 게시물 알림 반응 |
| `boundary` | `낯선 사람`(모르는 계정의 팔로우 요청·DM·태그) 알림을 거절·무시한 비율 |
| `sociability` | `친구·DM` 알림 반응률 vs 전체 무시율 |

폰은 이벤트 로그를 배치로 서버에 보내고, 서버가 genome을 계산한다.

### 2-4. open 행동 규칙

- 거리 `d = |genomeA − genomeB|` (5차원).
- `d`가 작으면 무리 짓기(정렬 + 응집, `sociability`가 강도).
- 베타마다 개인 공간 반경 = `boundary`. 그 안에 다른 베타가 들어오면 천천히 비켜난다. 경계가 큰 베타는 무리 가장자리를 맴돌거나 혼자 떨어져 있게 된다.
- 싸움·충돌 연출은 없다. 관계는 다가감과 거리 두기의 리듬으로만 보인다.
- 가까이 오래 머물면 서로의 색이 조금씩 묻어난다(시각 상태만 바꾸고 genome은 그대로). 노션 Overall view의 "물감 묻듯" 아이디어.
- 플레이어 조종(`steer`)은 이 힘들에 더해지는 힘이라, 완전히 마음대로 움직이지는 않는다.

### 2-5. 소켓 프로토콜 (초안)

| 방향 | 이벤트 | payload |
| --- | --- | --- |
| phone → server | `hello` | `{ role: "phone", playerId, room }` |
| phone → server | `answer` (A) | `{ q, value }` |
| phone → server | `feed` (B) | `{ events: FeedEvent[] }` 배치 |
| phone → server | `effort` | `{ amount }` |
| phone → server → screen | `steer` | `{ playerId, x, y }` ~20Hz 스로틀, 서버는 중계만 |
| screen → server | `hello` | `{ role: "screen", room, adminKey }` |
| screen → server | `admin` | `{ cmd: "setMode" \| "next" \| "goto" \| "reset", arg? }` |
| server → all | `state` | `{ stage, mode, players[{id, genome, phase, connected}], effort{total, threshold}, deadline }` |

- `players[].phase`: 늦게 온 관객 때문에 플레이어마다 단계가 다를 수 있다(`input` / `caged` / `free` / `fading`).
- effort 임계치는 인원에 비례한다(예: `인원 × 30탭`). 합산값은 시간이 지나면 줄어들어서 다 같이 계속 밀어야 깨진다.

## 3. 파일 구조 (예정)

```
app/
  page.tsx                 랜딩 (QR → /phone?room=…)
  screen/page.tsx          프로젝션. R3F Canvas + stage별 씬, 관리자 키
  screen/scenes/           Lobby / Input / Born / Grid / Open
  phone/page.tsx           phase별 폰 UI 스위치
  phone/modes/             DialPad (A) / FakeFeed (B)
  phone/controls/          EffortPad / Joystick
lib/
  protocol.ts              이벤트·State 타입 (서버·클라 공유)
  genome.ts                A/B → Genome, 거리 함수 (서버에서 실행)
  questions.ts             Mode A 문항
  feed.ts                  Mode B 게시물·알림 데이터
  betta/                   절차적 베타 메쉬·지느러미 셰이더 (플레이스홀더)
hooks/
  useBetta.ts              소켓 연결 + state 구독 + send
server/
  index.ts                 Socket.IO 서버, 세션 상태 머신
scripts/
  bots.ts                  가짜 폰 N개 (혼자 20명 테스트용)
```

서버는 Node 24의 TS 타입 스트리핑으로 `node server/index.ts` 바로 실행한다. 서버가 `lib/genome.ts`를 **런타임에** import하므로, import 경로에 `.ts` 확장자를 붙이고 `tsconfig`에 `allowImportingTsExtensions: true`를 추가한다(`noEmit`이라 허용됨). enum 같은 비-erasable 문법은 쓰지 않는다. **(리뷰에서 추가)**

## 4. 일정 (11/18 → 11/23)

11/18은 이미 거의 끝났으니 실질적으로 4.5일이다. 첫 칸이 제일 무겁다.

| 날짜 | 할 일 | 끝났다는 기준 |
| --- | --- | --- |
| 11/19 | `protocol.ts`, `server/index.ts` 상태 머신, `pnpm dev`/`dev:mobile` 스크립트를 새 서버로 교체, room 코드 | 같은 Wi‑Fi의 실제 폰으로 `https://<노트북 IP>:3000/phone`을 열면 `/screen`에 접속 인원이 뜸 |
| 11/20 | lobby·QR, Mode A 다이얼패드 5문항, `genome.ts`, born 씬 (색·지느러미 길이만 다른 플레이스홀더 베타) | 폰 2대가 A로 답하면 서로 다른 베타 2마리 탄생 |
| 11/21 | Mode B 30초 알림 폭주 v0 → genome, A/B 키 전환 | B로도 같은 지점까지 도달 |
| 11/22 | grid 씬 + effort 합산·게이지·타임아웃, open 씬 조종 + 무리 짓기 + 거리 두기, 늦게 온 관객 1인 큐브 | 벽 붕괴 → 한 어항에서 폰으로 조종, 중간에 1명 추가 합류 |
| 11/23 | `bots.ts`로 15–20명 테스트, iOS·Android 실기기, 이탈 → 흐려짐, 리셋 반복 | A 한 바퀴 + B 한 바퀴를 끊김 없이 시연 |

밀리면 이 순서로 덜어낸다: 색 묻음 → 흔들기(탭만 남김) → 늦게 온 관객 1인 큐브(대신 lobby에서만 접속 허용) → B 피드 축 개수.

## 5. 리스크 / 알아둘 것

- **로컬 단계에서 알아둘 것**
  - **자체서명 인증서 경고**: `dev:mobile`은 HTTPS라서 폰마다 `:3000`과 `:4000`을 한 번씩 열어 경고를 통과해야 한다. 혼자·친구 몇 명 테스트에는 괜찮고, 관객용으로는 불편하다. 이게 클라우드로 옮기는 주된 이유.
  - **학교 Wi‑Fi가 기기 간 통신을 막을 수 있다**(AP isolation). 폰에서 노트북 IP로 접속이 안 되면 노트북 핫스팟이나 개인 공유기로 우회한다. 11/19에 데모 장소 Wi‑Fi로 한 번 확인.
  - HTTPS가 필요한 기능(흔들기)은 `dev:mobile`에서만 테스트된다. `pnpm dev`(http)에서는 탭만.
- **나중에 클라우드로 옮길 때**
  - **Vercel은 Socket.IO 서버를 돌릴 수 없다** (서버리스라 상시 연결이 안 됨). 소켓은 별도 서버에 둔다.
  - **Railway**: 잠들지 않고, 사용량만큼 소액 과금. 기본안. 계정 로그인·결제 연결이 필요하다.
  - Render 무료: 15분 동안 접속이 없으면 잠들어서 첫 접속에 ~1분 걸린다. 전시용으로는 부적합.
  - 서버 CORS는 Vercel 도메인만 허용한다.
- **room 코드·adminKey**: 로컬에서는 사실상 필요 없지만 프로토콜에는 처음부터 넣어둔다. 클라우드로 공개 URL이 되면 QR의 `room`이 다른 접속은 거부하고, 관리자 명령은 `adminKey`(env)로 막는다.
- **iOS 흔들기**: `DeviceMotionEvent.requestPermission()`을 사용자 탭 안에서 호출해야 한다. 거부될 수 있으니 탭이 기본, 흔들기는 덤.
- **햅틱**: `navigator.vibrate`는 Android Chrome만 지원하고 iOS Safari는 미지원. 되면 좋은 기능으로 둔다.
- **동시 접속 폭주**: `state` 브로드캐스트는 변경이 있을 때만, 그리고 스로틀을 건다.
- **서버 재배포 = 세션 초기화**: 메모리에만 두니 전시 중에는 재배포하지 않는다. 필요해지면 그때 영속화.
- **Next 16.4.3 보안 경고**: 배포 전에 패치 버전을 확인한다.

## 6. 데모 이후 백로그

- 인트로 영상 (기존 영상 1을 AI로 폴리싱)
- 사운드: Tone.js 앰비언스(낮고 웅웅, 중립) + 버블 샘플 PitchShift/Distortion, genome별로 다르게
- 베타 비주얼: 지느러미 셰이더 고도화 / Blender glTF / Procreate 텍스처 중 택1
- 물(space)의 영향: 굴절·물결, 공간이 베타 행동을 바꾸는 규칙
- 라비린스 기관: 수면 위로 숨 쉬러 올라가는 행동 = "네트워크 밖으로 나가기"
- 누적 데이터: "오늘 이 어항에는 이런 베타 n%" (엔딩은 없지만 화면 구석 상시 표시 정도로)
- 프로젝션 매핑 (ID412 W3 실험 참고)

## 7. 남은 결정

- [ ] Mode A 문항 문구 다듬기 (§2-2 초안)
- [ ] Mode B 게시물·알림 실제 문구 (`lib/feed.ts`)
- [ ] effort 임계치, 타임아웃, 이탈 후 사라지는 시간: 11/22에 실제로 해보고 숫자 확정
- [ ] 전시 일정, 프로젝터 해상도·비율, 예상 최대 인원
- [ ] 데모 장소 Wi‑Fi에서 폰 → 노트북 접속 되는지 (11/19)
- [ ] 클라우드 이전 시점: 데모(11/23) 뒤, 전시 전 언제쯤
- [ ] Railway 계정 준비 (클라우드 이전 전에)
