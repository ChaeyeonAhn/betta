export const SNS_QUESTIONS = [
  { prompt: "게시물을 올리기 전에 사진이나 문구를 여러 번 다듬나요?", effect: "몸 색의 선명도" },
  { prompt: "SNS에 내 일상을 자주 올리나요?", effect: "꼬리지느러미의 길이" },
  { prompt: "피드에서 평소 관심 없던 주제의 글도 눌러보나요?", effect: "몸 색" },
  { prompt: "반응이 좋았던 형식으로 다시 게시물을 올리나요?", effect: "몸과 지느러미의 무늬" },
  { prompt: "모르는 사람의 팔로우 요청을 받으면 먼저 그 사람의 계정을 살펴보나요?", effect: "혼자 머무는 공간의 크기" },
  { prompt: "친구가 올린 글에 좋아요나 댓글로 자주 반응하나요?", effect: "다른 베타에게 다가가는 성향" },
  { prompt: "SNS 알림이 뜨면 하던 일을 멈추고 바로 확인하나요?", effect: "움직임이 바뀌는 빠르기" },
  { prompt: "피드를 열면 게시물을 하나하나 보기보다 빠르게 넘기나요?", effect: "유영하는 폭" },
] as const;

export const ANSWER_SCALE = { low: "전혀 그렇지 않다", high: "매우 그렇다" };
