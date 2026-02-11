export default function runNeedlemanWunschAlignment(reference = "", read = "") {
  const referenceSeq = (reference || "").toUpperCase();
  const readSeq = (read || "").toUpperCase();

  const matchScore = 1;
  const mismatchScore = -1;
  const gapScore = -1;

  const rows = referenceSeq.length + 1;
  const cols = readSeq.length + 1;
  const scoreMatrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i++) {
    scoreMatrix[i][0] = i * gapScore;
  }
  for (let j = 1; j < cols; j++) {
    scoreMatrix[0][j] = j * gapScore;
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const diagonalScore =
        scoreMatrix[i - 1][j - 1] +
        (referenceSeq[i - 1] === readSeq[j - 1] ? matchScore : mismatchScore);
      const upScore = scoreMatrix[i - 1][j] + gapScore;
      const leftScore = scoreMatrix[i][j - 1] + gapScore;
      scoreMatrix[i][j] = Math.max(diagonalScore, upScore, leftScore);
    }
  }

  let i = referenceSeq.length;
  let j = readSeq.length;
  const alignedReference = [];
  const alignedRead = [];

  while (i > 0 || j > 0) {
    const diagonalScore =
      i > 0 && j > 0
        ? scoreMatrix[i - 1][j - 1] +
          (referenceSeq[i - 1] === readSeq[j - 1] ? matchScore : mismatchScore)
        : Number.NEGATIVE_INFINITY;
    const upScore = i > 0 ? scoreMatrix[i - 1][j] + gapScore : Number.NEGATIVE_INFINITY;
    if (i > 0 && j > 0 && scoreMatrix[i][j] === diagonalScore) {
      alignedReference.push(referenceSeq[i - 1]);
      alignedRead.push(readSeq[j - 1]);
      i -= 1;
      j -= 1;
    } else if (i > 0 && scoreMatrix[i][j] === upScore) {
      alignedReference.push(referenceSeq[i - 1]);
      alignedRead.push("-");
      i -= 1;
    } else {
      alignedReference.push("-");
      alignedRead.push(readSeq[j - 1]);
      j -= 1;
    }
  }

  return {
    pairwiseAlignment: [
      {
        alignmentData: {
          sequence: alignedReference.reverse().join("")
        }
      },
      {
        alignmentData: {
          sequence: alignedRead.reverse().join("")
        }
      }
    ]
  };
}
