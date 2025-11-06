import React from 'react';
import { ArrowRight } from 'lucide-react';

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  usedKeys: Record<string, string>;
}

const Keyboard: React.FC<KeyboardProps> = ({ onKeyPress, usedKeys }) => {
  const firstRow = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  const secondRow = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
  const thirdRow = ['Enter', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'];

  const getKeyStatus = (key: string): string => {
    if (key === 'Enter' || key === 'Backspace') return '';
    return usedKeys[key] || '';
  };

  return (
    <div className="keyboard">
      <div className="keyboard-row">
        {firstRow.map((key) => (
          <button
            key={key}
            className={`key ${getKeyStatus(key)}`}
            onClick={() => onKeyPress(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="keyboard-row">
        {secondRow.map((key) => (
          <button
            key={key}
            className={`key ${getKeyStatus(key)}`}
            onClick={() => onKeyPress(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="keyboard-row">
        <button
          className="key key-wide"
          onClick={() => onKeyPress('Enter')}
        >
          <span className="enter-text">Enter</span>
          <ArrowRight className="enter-icon" />
        </button>
        {thirdRow.slice(1, -1).map((key) => (
          <button
            key={key}
            className={`key ${getKeyStatus(key)}`}
            onClick={() => onKeyPress(key)}
          >
            {key}
          </button>
        ))}
        <button
          className="key key-wide"
          onClick={() => onKeyPress('Backspace')}
        >
          <span className="backspace-text">Back</span>
          <span className="backspace-icon">⌫</span>
        </button>
      </div>
    </div>
  );
};

export default Keyboard;