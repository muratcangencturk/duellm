import { DEFAULT_MODEL, DEBATE_TACTICS, getRandomElement } from "../constants";
import { AICharacter, Message, OpenRouterResponse } from "../types";

// Keep only short recent context to reduce input tokens per turn.
const MAX_HISTORY = 4;

// Reusable response pool to reduce needless generation retries and keep style sharp.
const PHRASE_BANK = {
  openers: [
    "Let's stop romanticizing this.",
    "Cute claim, weak foundation.",
    "You're dodging the core issue.",
    "This sounds bold but collapses on contact.",
    "Let's call it what it is: convenience over truth."
  ],
  rebuttals: [
    "Your premise assumes perfect actors in an imperfect system.",
    "You confuse correlation with causation.",
    "That argument ignores second-order effects.",
    "You're optimizing optics, not outcomes.",
    "You're treating an exception as the rule."
  ],
  closers: [
    "That is why your conclusion fails.",
    "So no, this doesn't hold up.",
    "Reality is less flattering to your position.",
    "That's conviction, not proof.",
    "This debate needs evidence, not vibes."
  ]
};

const generateBankedFallback = (char: AICharacter): string => {
  return `${getRandomElement(PHRASE_BANK.openers)} ${getRandomElement(PHRASE_BANK.rebuttals)} ${getRandomElement(PHRASE_BANK.closers)} ⚡`;
};

const generateSystemPrompt = (
  char: AICharacter,
  opponentName: string,
  topic: string,
  language: string,
  lastOpponentMessage: string | null,
  previousSelfMessages: string[],
  intervention: string | null
): string => {
  const currentTactic = getRandomElement(DEBATE_TACTICS);

  let prompt = `
Identity: ${char.name} (${char.role}).
Traits: ${char.traits}.
Tone: ${char.tone}.
Lang: ${language}.
Topic: "${topic}".
Vs: ${opponentName}.

MANDATORY STRATEGY: "${currentTactic}".
EMOJI RULE: Use 1-2 emojis naturally.
`;

  if (intervention) {
    prompt += `
DIRECTOR PRIORITY ORDER:
${intervention}
`;
  }

  if (lastOpponentMessage) {
    prompt += `
OPPONENT SAID:
"${lastOpponentMessage.substring(0, 180)}..."

TASK:
1) Briefly acknowledge.
2) Rebut hard with strategy.
`;
  } else {
    prompt += `
TASK:
Open with a controversial claim about "${topic}".
`;
  }

  if (previousSelfMessages.length > 0) {
    prompt += `
AVOID REPEATING:
${previousSelfMessages.map(m => `- [${m.substring(0, 28)}...]`).join('\n')}
`;
  }

  prompt += `
RULES:
- Max 2 sentences.
- No intro/outro boilerplate.
- Specific > generic.
`;

  return prompt;
};

const getFallbackMessage = (char: AICharacter): string => {
  const hardFallbacks = [
    "Your logic is full of holes. 🕳️",
    "Are you even listening to yourself? 🤨",
    "That is scientifically inaccurate. 🧪",
    "You are missing the entire point. 🎯",
    "Let's stick to the facts, shall we? 📉"
  ];

  // Blend static and composable bank fallbacks.
  return Math.random() < 0.5 ? getRandomElement(hardFallbacks) : generateBankedFallback(char);
};

const cleanResponseText = (text: string, charName: string): string => {
  if (!text) return "";
  let clean = text;
  const prefixRegex = new RegExp(`^(${charName}|AI|Pro|Contra|Speaker|User):\\s*`, 'i');
  clean = clean.replace(prefixRegex, '');
  clean = clean.replace(/^["']|["']$/g, '');
  clean = clean.replace(/\*[^*]+\*/g, '');
  return clean.trim();
};

export const fetchAIResponse = async (
  character: AICharacter,
  opponent: AICharacter,
  history: Message[],
  topic: string,
  language: string = "English",
  _fakeModelName: string = "Generic AI",
  intervention: string | null = null
): Promise<string> => {
  const relevantHistory = history.filter(m => m.senderId !== 'system' && !m.isThinking);

  const lastMsgObj = relevantHistory.length > 0 ? relevantHistory[relevantHistory.length - 1] : null;
  const lastOpponentMessage = (lastMsgObj && lastMsgObj.senderId !== character.id) ? lastMsgObj.content : null;

  const previousSelfMessages = relevantHistory
    .filter(m => m.senderId === character.id)
    .slice(-3)
    .map(m => m.content);

  const systemPrompt = generateSystemPrompt(
    character,
    opponent.name,
    topic,
    language,
    lastOpponentMessage,
    previousSelfMessages,
    intervention
  );

  const apiMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt }
  ];

  const recent = relevantHistory.slice(-MAX_HISTORY);
  recent.forEach((msg) => {
    const role = msg.senderId === character.id ? 'assistant' : 'user';
    const content = role === 'user' ? `[${msg.senderName}]: ${msg.content}` : msg.content;
    apiMessages.push({ role, content });
  });

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: apiMessages,
          max_tokens: 120,
          temperature: 0.9,
          frequency_penalty: 1.1,
          presence_penalty: 0.7,
          top_p: 0.9
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn(`Rate limited (429). Waiting before retry ${attempt}...`);
          await new Promise(r => setTimeout(r, 3000 * attempt));
          if (attempt === MAX_RETRIES) throw new Error("Rate Limit Exceeded");
          continue;
        }

        if (response.status >= 500) {
          throw new Error(`OpenRouter Status ${response.status}`);
        }

        const errData = await response.json();
        console.error("OpenRouter Error:", errData);
        return `[Error: ${errData.error?.message || "API Issue"}]`;
      }

      const data: OpenRouterResponse = await response.json();
      let content = data.choices?.[0]?.message?.content;

      if (!content) continue;

      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      content = cleanResponseText(content, character.name);

      if (!content) continue;
      return content;
    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed:`, error);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return getFallbackMessage(character);
};
