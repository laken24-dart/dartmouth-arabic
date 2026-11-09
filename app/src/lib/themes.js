// Picks a vocabulary theme for each lesson's batch of words (used for the symbols on the path map).
const THEMES = [
  { id: "greetings", label: "Greetings", words: ["hello", "welcome", "good morning", "peace be upon", "thank", "you're welcome", "goodbye", "congratulations", "never mind", "how do we say", "i have a question", "excuse", "blessings", "holiday greeting", "ladies and gentlemen", "i present", "greetings", "please accept"] },
  { id: "family", label: "Family & people", words: ["brother", "sister", "father", "mother", "son", "daughter", "uncle", "aunt", "family", "grand", "husband", "wife", "cousin", "relative", "boy", "girl", "man", "woman", "child", "bride", "groom", "boyfriend", "girlfriend", "friend", "neighbor", "parents", "sibling", "young man", "young woman", "mr.", "mrs.", "miss", "person", "classmate", "colleague"] },
  { id: "food", label: "Food & drink", words: ["bread", "tea", "coffee", "chicken", "milk", "water", "sugar", "rice", "fish", "meat", "soup", "salad", "fruit", "vegetable", "dinner", "lunch", "breakfast", "eat", "drink", "restaurant", "oil", "café", "cook", "kitchen", "meal", "kunafa", "apricot", "hungry", "thirsty", "tasty"] },
  { id: "school", label: "School & study", words: ["book", "homework", "student", "professor", "class", "page", "notebook", "pen", "exam", "library", "study", "university", "school", "word", "sentence", "read", "write", "dictionary", "lecture", "translation", "translator", "teach", "memorize", "drill", "exercise", "paper", "test", "department", "college", "grade", "semester", "graduate", "major", "program", "ba", "master", "ph.d", "admissions", "literature", "science", "engineering", "history", "medicine", "psychology", "sociology", "anthropology", "economics", "law", "commerce", "business", "letter", "article", "newspaper", "journal", "magazine", "story", "novel", "language", "culture", "grammar", "teaching assistant", "elementary", "intermediate", "advanced", "secondary", "diploma", "succeed", "fail", "remember", "understand"] },
  { id: "places", label: "Places & getting around", words: ["street", "city", "house", "room", "car", "bus", "airplane", "travel", "go", "return", "door", "window", "building", "office", "desk", "table", "chair", "area", "region", "state", "capital", "river", "island", "sea", "near", "far", "apartment", "floor", "bathroom", "bedroom", "living room", "garden", "park", "pool", "place", "address", "move to", "arrive", "enter", "leave", "come", "between", "below", "above", "behind", "next to", "in front", "mosque", "church", "club", "rent", "dining room", "reception"] },
  { id: "world", label: "Countries & the world", words: ["egypt", "canada", "qatar", "syria", "jordan", "lebanon", "iraq", "morocco", "tunisia", "yemen", "sudan", "libya", "kuwait", "bahrain", "uae", "saudi", "algeria", "oman", "palestine", "israel", "iran", "turkey", "france", "germany", "britain", "america", "australia", "colombia", "pakistan", "afghanistan", "bangladesh", "mauritania", "belgium", "africa", "london", "paris", "moscow", "new york", "baghdad", "beirut", "amman", "tripoli", "sana'a", "united nations", "middle east", "near east", "gulf", "world", "foreign", "egyptian", "palestinian", "english", "arab", "descent"] },
  { id: "numbers", label: "Numbers", words: ["zero", "one)", "two)", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "how many", "how much", "half", "quarter", "third", "first", "second", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "twelfth", "eleventh", "thirteenth"] },
  { id: "time", label: "Time & days", words: ["hour", "day", "week", "month", "year", "morning", "evening", "daytime", "night", "minute", "time", "clock", "watch", "now", "yesterday", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "always", "sometimes", "usually", "before", "after", "since", "until", "finally", "late", "appointment", "afternoon", "future", "past", "childhood", "age", "stay up", "wake", "sleep", "middle"] },
  { id: "weather", label: "Weather & seasons", words: ["weather", "cold", "hot", "snow", "rain", "sun", "winter", "summer", "autumn", "spring", "cloudy", "humidity", "temperature", "degree", "sky", "atmosphere", "overcrowded"] },
  { id: "feelings", label: "Feelings & descriptions", words: ["happy", "tired", "sick", "upset", "exhausted", "big", "small", "good", "beautiful", "new", "old", "tall", "long", "short", "wide", "difficult", "strange", "odd", "astonishing", "nice", "kind", "excellent", "fine", "shy", "busy", "lonely", "only", "famous", "boring", "enjoyable", "expensive", "cheap", "smart", "important", "outstanding", "different", "real", "dangerous", "deep", "favorite", "special", "appropriate", "necessary", "angry", "loneliness", "comfort", "manners"] },
  { id: "body", label: "Body & colors", words: ["head", "hair", "eye", "nose", "tongue", "mouth", "ear", "teeth", "heart", "hand", "stomach", "blood", "leg", "foot", "body", "color", "brown", "purple", "pink", "gray", "gold", "silver", "blue", "red", "white", "black", "green", "yellow", "blond", "bald", "blind", "dark-complexioned", "doctor's office"] },
  { id: "hobbies", label: "Hobbies & sports", words: ["sport", "basketball", "soccer", "volleyball", "running", "skiing", "swimming", "dancing", "music", "reading", "movies", "cinema", "painting", "drawing", "photography", "hobby", "match", "chess", "play", "watch", "channel", "tv series", "championship", "clubs", "enjoy", "listen"] },
  { id: "work", label: "Work & jobs", words: ["work", "employee", "job", "company", "officer", "army", "ministry", "institution", "foundation", "position", "fire (from a job)", "interview", "writer", "editor", "worker", "thinker", "experience", "supervise", "specialist", "king", "majesty"] },
  { id: "faith", label: "Expressions & faith", words: ["god", "prayer", "prophet", "caliph", "quran", "verse", "hadith", "fast", "ramadan", "pilgrimage", "worship", "believe", "heaven", "the lord", "bless him", "pleased with him", "god willing", "name of god", "the late", "deceased"] },
  { id: "verbs", label: "Actions & verbs", words: [] },
  { id: "grammar", label: "Grammar words", words: ["singular", "plural", "feminine", "masculine", "noun", "verb", "subject", "predicate", "nominative", "accusative", "genitive", "dual", "past tense", "present tense", "root", "pattern", "adjective", "preposition", "doer", "object", "iḍāfa", "nisba", "example"] }
];

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Keywords match at a word start ("cook" matches "cooking"); short ones (≤3 letters) must be whole words ("go" ≠ "God").
const matchers = new Map(THEMES.map(theme => [theme.id, theme.words.map(keyword => new RegExp(keyword.length <= 3 ? `(^|[^a-z])${escape(keyword)}([^a-z]|$)` : `(^|[^a-z])${escape(keyword)}`))]));

function score(theme, words) {
  if (theme.id === "verbs") return words.filter(word => /^to [a-z]/i.test(word.en.trim())).length;
  const patterns = matchers.get(theme.id);
  return words.filter(word => patterns.some(pattern => pattern.test(word.en.toLowerCase()))).length;
}

/** Returns { id, label } — the theme most of these words belong to (falls back to "words"). */
export function themeFor(words) {
  let best = { id: "words", label: "New words", value: 0 };
  for (const theme of THEMES) {
    const value = score(theme, words);
    if (value > best.value) best = { id: theme.id, label: theme.label, value };
  }
  return best.value >= 2 ? { id: best.id, label: best.label } : { id: "words", label: "New words" };
}
