import React from 'react';

interface WordleGridProps {
  board: string[][];
  currentRow: number;
  currentCol: number;
  revealed: (boolean | 'correct' | 'present' | 'absent')[][];
  solution?: string; // Current word solution for coloring letters
}

// Compare a guess to the solution and return status for each letter
// Returns an array of statuses: 'correct', 'present', 'absent'
function getLetterStatuses(guess: string, solution: string): ('correct' | 'present' | 'absent')[] {
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

const WordleGrid: React.FC<WordleGridProps> = ({ 
  board, 
  currentRow, 
  currentCol, 
  revealed,
  solution
}) => {
  // Determine cell status based on the solution if solution is provided
  const getSolutionAwareStatus = (row: number, col: number): string => {
    const cellStatus = revealed[row][col];
    
    // If it's already a status string, return it
    if (typeof cellStatus === 'string' && ['correct', 'present', 'absent'].includes(cellStatus)) {
      return cellStatus;
    }
    
    // If it's false (not revealed yet), return empty string
    if (cellStatus === false) {
      return '';
    }
    
    // If it's true but no solution provided, return 'submitted'
    if (cellStatus === true && !solution) return 'submitted'; // If no solution provided, just mark as submitted
    
    // Fallback: calculate statuses based on the solution
    const letterStatuses = solution ? getLetterStatuses(board[row].join(''), solution) : [];
    return letterStatuses[col] || 'submitted';
  };

  return (
    <div className="wordle-grid">
      {board.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((letter, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`grid-cell ${
                getSolutionAwareStatus(rowIndex, colIndex)
              } ${
                rowIndex === currentRow && colIndex === currentCol && !revealed[rowIndex][colIndex] 
                  ? 'cell-input' 
                  : ''
              }`}
            >
              {letter}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default WordleGrid;