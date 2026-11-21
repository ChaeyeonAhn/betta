export const SNS_QUESTIONS = [
  { prompt: "Do you edit your photos or captions several times before you post?", effect: "colour intensity" },
  { prompt: "Do you often post your everyday life on social media?", effect: "tail fin length" },
  { prompt: "Do you tap on posts about topics you don't usually care about?", effect: "body colour" },
  { prompt: "Do you post again in a format that got a good response?", effect: "body and fin markings" },
  { prompt: "When a stranger sends you a follow request, do you check their account first?", effect: "personal space" },
  { prompt: "Do you often like or comment on your friends' posts?", effect: "pull toward other bettas" },
  { prompt: "When a notification pops up, do you stop what you're doing to check it?", effect: "quickness of movement" },
  { prompt: "When you open your feed, do you scroll fast instead of reading each post?", effect: "swimming range" },
] as const;

export const ANSWER_SCALE = { low: "Not at all", high: "Very much" };
