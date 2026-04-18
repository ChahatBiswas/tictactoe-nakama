import React from "react";

interface BoardProps {
  board: string[];
  onCellClick: (index: number) => void;
  disabled: boolean;
}

const WINNING_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function getWinners(board: string[]): number[] {
  for (const [a, b, c] of WINNING_COMBOS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a, b, c];
  }
  return [];
}

export const Board: React.FC<BoardProps> = ({ board, onCellClick, disabled }) => {
  const winning = getWinners(board);

  return (
    <div className="ttt-grid">
      {board.map((cell, i) => {
        const isWin = winning.includes(i);
        const isEmpty = cell === "";
        const clickable = isEmpty && !disabled;

        const cls = [
          "ttt-cell",
          clickable ? "clickable" : "",
          cell === "X" ? "sym-x" : cell === "O" ? "sym-o" : "",
          isWin && cell === "X" ? "win-x" : "",
          isWin && cell === "O" ? "win-o" : "",
          !isEmpty ? "cell-pop" : "",
        ].filter(Boolean).join(" ");

        return (
          <button
            key={`${i}-${cell}`}
            className={cls}
            onClick={() => clickable && onCellClick(i)}
            aria-label={cell ? `${cell} at cell ${i + 1}` : `Cell ${i + 1}`}
          >
            {cell}
          </button>
        );
      })}
    </div>
  );
};
