export default function runNeedlemanWunschAlignment(
  referenceSequence = "",
  querySequence = "",
  options = {}
) {
  const {
    matchScore = 1,
    mismatchScore = -1,
    gapScore = -1
  } = options;

  const ref = referenceSequence.toUpperCase();
  const query = querySequence.toUpperCase();

  const rows = ref.length + 1;
  const cols = query.length + 1;

  const scores = Array.from({ length: rows }, () => Array(cols).fill(0));
  const pointers = Array.from({ length: rows }, () => Array(cols).fill(null));

  for (let i = 1; i < rows; i++) {
    scores[i][0] = i * gapScore;
    pointers[i][0] = "up";
  }
  for (let j = 1; j < cols; j++) {
    scores[0][j] = j * gapScore;
    pointers[0][j] = "left";
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const isMatch = ref[i - 1] === query[j - 1];
      const diag =
        scores[i - 1][j - 1] + (isMatch ? matchScore : mismatchScore);
      const up = scores[i - 1][j] + gapScore;
      const left = scores[i][j - 1] + gapScore;

      if (diag >= up && diag >= left) {
        scores[i][j] = diag;
        pointers[i][j] = "diag";
      } else if (up >= left) {
        scores[i][j] = up;
        pointers[i][j] = "up";
      } else {
        scores[i][j] = left;
        pointers[i][j] = "left";
      }
    }
  }

  let i = ref.length;
  let j = query.length;
  let alignedReference = "";
  let alignedQuery = "";

  while (i > 0 || j > 0) {
    const pointer = pointers[i][j];
    if (pointer === "diag") {
      alignedReference = ref[i - 1] + alignedReference;
      alignedQuery = query[j - 1] + alignedQuery;
      i -= 1;
      j -= 1;
    } else if (pointer === "up") {
      alignedReference = ref[i - 1] + alignedReference;
      alignedQuery = "-" + alignedQuery;
      i -= 1;
    } else {
      alignedReference = "-" + alignedReference;
      alignedQuery = query[j - 1] + alignedQuery;
      j -= 1;
    }
  }

  return {
    score: scores[ref.length][query.length],
    alignedReference,
    alignedQuery
  };
}
