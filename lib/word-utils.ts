// We'll fetch the word lists dynamically at runtime and cache them
let validWordsCache: string[] | null = null;
let wordleWordsCache: string[] | null = null;

// Function to load and return the word lists
export async function getWordLists() {
  if (validWordsCache && wordleWordsCache) {
    return {
      validWords: validWordsCache,
      wordleWords: wordleWordsCache,
    };
  }

  // Load the files - they're now in the public directory
  const validWordsResponse = await fetch('/valid-words.txt');
  const wordleWordsResponse = await fetch('/wordle-words.txt');
  
  const validWordsText = await validWordsResponse.text();
  const wordleWordsText = await wordleWordsResponse.text();
  
  const validWordsList = validWordsText.split('\n')
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0 && word.length === 5); // Only 5-letter words
    
  const wordleWordsList = wordleWordsText.split('\n')
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0 && word.length === 5); // Only 5-letter words
  
  validWordsCache = validWordsList;
  wordleWordsCache = wordleWordsList;

  return {
    validWords: validWordsList,
    wordleWords: wordleWordsList
  };
}

// Check if a word is valid against the valid words list
export async function isValidWord(word: string): Promise<boolean> {
  const { validWords } = await getWordLists();
  return validWords.includes(word.toLowerCase());
}

// Check if a word is in the wordle word list
export async function isWordleWord(word: string): Promise<boolean> {
  const { wordleWords } = await getWordLists();
  return wordleWords.includes(word.toLowerCase());
}

// Get a random sample of words from the wordle list using partial Fisher-Yates shuffle
// This is more efficient as we only shuffle the number of elements we need
export async function getRandomWords(count: number): Promise<string[]> {
  const { wordleWords } = await getWordLists();

  // Make a copy of the wordleWords array to avoid modifying the original
  const wordsCopy = [...wordleWords];
  const totalWords = wordsCopy.length;

  // Only perform the shuffle for the number of words we need
  // This is a partial Fisher-Yates shuffle - we only shuffle the first 'count' elements
  for (let i = 0; i < Math.min(count, totalWords); i++) {
    // Generate a random index from i to the end of the array
    const j = i + Math.floor(Math.random() * (totalWords - i));
    // Swap elements at i and j
    [wordsCopy[i], wordsCopy[j]] = [wordsCopy[j], wordsCopy[i]];
  }

  // Return the first 'count' shuffled words
  return wordsCopy.slice(0, count);
}

// Compare a guess to the solution and return status for each letter
// Returns an array of statuses: 'correct', 'present', 'absent'
export function getLetterStatuses(guess: string, solution: string): ('correct' | 'present' | 'absent')[] {
  const result: ('correct' | 'present' | 'absent')[] = Array(5).fill('absent');
  const solutionLetters = solution.split('');
  const guessLetters = guess.split('');

  // First pass: mark correct letters
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === solutionLetters[i]) {
      result[i] = 'correct';
      // Mark this letter in solution as used
      solutionLetters[i] = '';
    }
  }

  // Second pass: mark present letters
  for (let i = 0; i < 5; i++) {
    if (result[i] !== 'correct') {
      const letterIndex = solutionLetters.indexOf(guessLetters[i]);
      if (letterIndex !== -1) {
        result[i] = 'present';
        // Mark this letter in solution as used
        solutionLetters[letterIndex] = '';
      }
    }
  }

  return result;
}

