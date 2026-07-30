import beatingHeart from "../assets/beating_heart.gif";
import bouncingBall from "../assets/bouncing_ball.gif";
import emotionList from "./emotion-list.json";

export const ANIMATIONS = [
  { key: "joy", label: "Joy", gif: bouncingBall },
  { key: "love", label: "Love", gif: beatingHeart },
];

// emotion -> list of words/stems that count as a match for that emotion,
// used to auto-select words when applying an animation.
export const EMOTION_WORD_LISTS = emotionList.reduce((acc, entry) => {
  acc[entry.emotion] = entry.word_list;
  return acc;
}, {});

export function getEmotionMatchIdsInWords(wordsArr, animationKey) {
  const list = EMOTION_WORD_LISTS[animationKey];
  if (!list || list.length === 0) return new Set();
  const lowerList = list.map((w) => w.toLowerCase());
  const matches = new Set();
  wordsArr.forEach((w) => {
    const clean = w.text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (lowerList.some((listWord) => clean.includes(listWord)))
      matches.add(w.id);
  });
  return matches;
}
