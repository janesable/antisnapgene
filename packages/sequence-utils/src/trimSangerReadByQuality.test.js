import trimSangerReadByQuality from "./trimSangerReadByQuality";

describe("trimSangerReadByQuality", () => {
  it("trims sequence and chromatogram arrays using quality scores", () => {
    const result = trimSangerReadByQuality({
      sequence: "AACCGGTT",
      chromatogramData: {
        qualNums: [2, 5, 30, 35, 30, 4, 2, 1],
        baseCalls: ["A", "A", "C", "C", "G", "G", "T", "T"],
        basePos: [0, 1, 2, 3, 4, 5, 6, 7],
        otherData: [10, 11, 12, 13, 14, 15, 16, 17]
      }
    });

    expect(result).toEqual({
      trimmedSequence: "CCG",
      trimmedChromatogramData: {
        qualNums: [30, 35, 30],
        baseCalls: ["C", "C", "G"],
        basePos: [2, 3, 4],
        otherData: [10, 11, 12, 13, 14, 15, 16, 17]
      },
      trimRange: {
        start: 2,
        end: 4
      }
    });
  });

  it("returns untrimmed data when qualNums are missing", () => {
    const chromatogramData = {
      baseCalls: ["A", "C", "G"],
      basePos: [0, 1, 2]
    };
    const result = trimSangerReadByQuality({
      sequence: "ACG",
      chromatogramData
    });

    expect(result).toEqual({
      trimmedSequence: "ACG",
      trimmedChromatogramData: chromatogramData,
      trimRange: {
        start: 0,
        end: 2
      }
    });
  });

  it("returns empty trims when all quality values are too low", () => {
    const result = trimSangerReadByQuality({
      sequence: "ACGT",
      chromatogramData: {
        qualNums: [0, 0, 0, 0],
        baseCalls: ["A", "C", "G", "T"],
        basePos: [0, 1, 2, 3]
      }
    });

    expect(result).toEqual({
      trimmedSequence: "",
      trimmedChromatogramData: {
        qualNums: [],
        baseCalls: [],
        basePos: []
      },
      trimRange: {
        start: 0,
        end: -1
      }
    });
  });
});
