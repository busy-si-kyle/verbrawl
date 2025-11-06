import React from 'react';

interface WordleGridProps {
  board: string[][];
  currentRow: number;
  currentCol: number;
  revealed: boolean[][];
  solution?: string; // Optional for multiplayer - we won't show solution until game ends
}

const WordleGrid: React.FC<WordleGridProps> = ({ 
  board, 
  currentRow, 
  currentCol, 
  revealed,
  solution
}) => {
  // Determine cell status based on current state and solution
  const getCellStatus = (row: number, col: number): string => {
    if (!revealed[row][col]) return '';
    
    const currentLetter = board[row][col];
    if (!currentLetter) return '';
    
    if (!solution) return 'submitted'; // If no solution provided, just mark as submitted
    
    const solutionLetter = solution[col];
    
    if (currentLetter === solutionLetter) {
      return 'correct';
    } else if (solution.includes(currentLetter)) {
      return 'present';
    } else {
      return 'absent';
    }
  };

  return (
    <div className="wordle-grid">
      {board.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((letter, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`grid-cell ${
                getCellStatus(rowIndex, colIndex)
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