import runNeedlemanWunschAlignment from "./runNeedlemanWunschAlignment";

describe("runNeedlemanWunschAlignment", function () {
  it("returns expected aligned sequences for an insertion", function () {
    const result = runNeedlemanWunschAlignment("ACGT", "ACGGT");

    expect(result.alignedReference).toEqual("AC-GT");
    expect(result.alignedQuery).toEqual("ACGGT");
  });

  it("returns expected aligned sequences for a deletion", function () {
    const result = runNeedlemanWunschAlignment("ACGGT", "ACGT");

    expect(result.alignedReference).toEqual("ACGGT");
    expect(result.alignedQuery).toEqual("AC-GT");
  });

  it("supports custom scoring options", function () {
    const result = runNeedlemanWunschAlignment("A", "G", {
      matchScore: 2,
      mismatchScore: -2,
      gapScore: -5
    });

    expect(result.alignedReference).toEqual("A");
    expect(result.alignedQuery).toEqual("G");
    expect(result.score).toEqual(-2);
  });
});
