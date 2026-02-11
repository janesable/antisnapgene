const defaultTrimFields = ["baseCalls", "basePos", "qualNums"];

function getMottTrimRange(qualNums, cutoff) {
  if (!Array.isArray(qualNums) || !qualNums.length) return null;

  const totalScoreInfo = [];
  let totalScore = 0;

  for (let i = 0; i < qualNums.length; i++) {
    const score = cutoff - Math.pow(10, qualNums[i] / -10);
    totalScore += score;
    totalScoreInfo.push(totalScore);
    if (totalScore < 0) {
      totalScore = 0;
    }
  }

  const firstPositiveValue = totalScoreInfo.find(value => value > 0);
  if (firstPositiveValue === undefined) {
    return {
      start: 0,
      end: -1
    };
  }

  const start = totalScoreInfo.indexOf(firstPositiveValue);
  const highestValue = Math.max(...totalScoreInfo);
  const end = totalScoreInfo.lastIndexOf(highestValue);

  return {
    start,
    end
  };
}

export default function trimSangerReadByQuality({
  sequence = "",
  chromatogramData = {},
  options = {}
} = {}) {
  const { qualNums } = chromatogramData;
  const { cutoff = 0.05, trimFields = defaultTrimFields } = options;

  const trimRange = getMottTrimRange(qualNums, cutoff);
  if (!trimRange) {
    return {
      trimmedSequence: sequence,
      trimmedChromatogramData: chromatogramData,
      trimRange: {
        start: 0,
        end: Math.max(sequence.length - 1, 0)
      }
    };
  }

  const { start, end } = trimRange;
  const trimmedSequence = end < start ? "" : sequence.slice(start, end + 1);

  const trimmedChromatogramData = {
    ...chromatogramData
  };

  trimFields.forEach(field => {
    if (Array.isArray(trimmedChromatogramData[field])) {
      trimmedChromatogramData[field] =
        end < start
          ? []
          : trimmedChromatogramData[field].slice(start, end + 1);
    }
  });

  return {
    trimmedSequence,
    trimmedChromatogramData,
    trimRange
  };
}
