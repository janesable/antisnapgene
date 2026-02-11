import runNeedlemanWunschAlignment from "./runNeedlemanWunschAlignment";

describe("runNeedlemanWunschAlignment", () => {
  it("returns pairwise alignment tracks with equal sequence length", () => {
    const result = runNeedlemanWunschAlignment("ACTG", "ACG");
    const [referenceTrack, readTrack] = result.pairwiseAlignment;

    expect(referenceTrack.alignmentData.sequence).toBe("ACTG");
    expect(readTrack.alignmentData.sequence).toBe("AC-G");
    expect(referenceTrack.alignmentData.sequence.length).toBe(
      readTrack.alignmentData.sequence.length
    );
  });
});
