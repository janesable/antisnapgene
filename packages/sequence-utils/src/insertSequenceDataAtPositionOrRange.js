import { getRangeLength } from "@teselagen/range-utils";
import { map, cloneDeep } from "lodash-es";
import convertDnaCaretPositionOrRangeToAa from "./convertDnaCaretPositionOrRangeToAA";
import rotateSequenceDataToPosition from "./rotateSequenceDataToPosition";
import { adjustRangeToDeletionOfAnotherRange } from "@teselagen/range-utils";
import tidyUpSequenceData from "./tidyUpSequenceData";
import { modifiableTypes } from "./annotationTypes";
import adjustBpsToReplaceOrInsert from "./adjustBpsToReplaceOrInsert";
import adjustAnnotationsToInsert from "./adjustAnnotationsToInsert";

export default function insertSequenceDataAtPositionOrRange(
  _sequenceDataToInsert,
  _existingSequenceData,
  caretPositionOrRange,
  options = {}
) {
  //maintainOriginSplit means that if you're inserting around the origin with n bps selected before the origin
  //when inserting new seq, n bps of the new seq should go in before the origin and the rest should be
  //inserted at the sequence start
  const { maintainOriginSplit } = options;
  let existingSequenceData = tidyUpSequenceData(_existingSequenceData, {
    doNotRemoveInvalidChars: true,
    ...options
  });
  const sequenceDataToInsert = tidyUpSequenceData(_sequenceDataToInsert, {
    topLevelSeqData: existingSequenceData,
    ...options
  });
  const newSequenceData = cloneDeep(existingSequenceData);
  newSequenceData.chromatogramData = getSyncedChromatogramDataOrFallback(
    newSequenceData.chromatogramData,
    newSequenceData.sequence.length
  );
  const insertLength =
    sequenceDataToInsert.isProtein && sequenceDataToInsert.proteinSequence
      ? sequenceDataToInsert.proteinSequence.length * 3
      : sequenceDataToInsert.sequence.length;
  let caretPosition = caretPositionOrRange;

  if (
    caretPositionOrRange.start > -1 &&
    getRangeLength(
      caretPositionOrRange,
      existingSequenceData.sequence.length
    ) === existingSequenceData.sequence.length
  ) {
    //handle the case where we're deleting everything!
    existingSequenceData = tidyUpSequenceData(
      {
        ...existingSequenceData,
        ...modifiableTypes.reduce((acc, type) => {
          return (acc[type] = []);
        }, {}),
        sequence: "",
        doNotRemoveInvalidChars: true,
        proteinSequence: "",
        chromatogramData: undefined
      },
      options
    );
    newSequenceData.chromatogramData = undefined;
  } else if (
    newSequenceData.chromatogramData &&
    newSequenceData.chromatogramData.baseTraces
  ) {
    //handle chromatogramData updates
    if (caretPositionOrRange && caretPositionOrRange.start > -1) {
      if (caretPositionOrRange.start > caretPositionOrRange.end) {
        newSequenceData.chromatogramData = trimChromatogram({
          chromatogramData: newSequenceData.chromatogramData,
          range: {
            start: caretPositionOrRange.start,
            end: newSequenceData.sequence.length
          },
          includeTraceData: true
        });
        newSequenceData.chromatogramData = trimChromatogram({
          chromatogramData: newSequenceData.chromatogramData,
          range: {
            start: 0,
            end: caretPositionOrRange.end
          },
          includeTraceData: true
        });
      } else {
        newSequenceData.chromatogramData = trimChromatogram({
          chromatogramData: newSequenceData.chromatogramData,
          range: {
            start: caretPositionOrRange.start,
            end: caretPositionOrRange.end
          },
          includeTraceData: true
        });
      }
    }
    if (sequenceDataToInsert.sequence) {
      insertIntoChromatogram({
        chromatogramData: newSequenceData.chromatogramData,
        caretPosition:
          caretPositionOrRange.start > -1
            ? caretPositionOrRange.start
            : caretPositionOrRange,
        seqToInsert: sequenceDataToInsert.sequence,
        includeTraceData: true
      });
    }
  }

  //update the sequence
  newSequenceData.sequence = adjustBpsToReplaceOrInsert(
    existingSequenceData.sequence,
    sequenceDataToInsert.sequence,
    caretPositionOrRange
  );
  newSequenceData.size = newSequenceData.sequence.length;
  newSequenceData.proteinSequence = adjustBpsToReplaceOrInsert(
    existingSequenceData.proteinSequence,
    sequenceDataToInsert.proteinSequence,
    convertDnaCaretPositionOrRangeToAa(caretPositionOrRange)
  );
  newSequenceData.proteinSize = newSequenceData.proteinSequence.length;

  //handle the insert
  modifiableTypes.forEach(annotationType => {
    let existingAnnotations = existingSequenceData[annotationType];
    //update the annotations:
    //handle the delete if necessary
    if (caretPositionOrRange && caretPositionOrRange.start > -1) {
      //we have a range! so let's delete it!
      const range = caretPositionOrRange;
      caretPosition = range.start > range.end ? 0 : range.start;
      //update all annotations for the deletion
      existingAnnotations = adjustAnnotationsToDelete(
        existingAnnotations,
        range,
        existingSequenceData.sequence.length
      );
    }
    //first clear the newSequenceData's annotations
    newSequenceData[annotationType] = [];
    //in two steps adjust the annotations to the insert
    newSequenceData[annotationType] = newSequenceData[annotationType].concat(
      adjustAnnotationsToInsert(
        existingAnnotations,
        caretPosition,
        insertLength
      )
    );
    newSequenceData[annotationType] = newSequenceData[annotationType].concat(
      adjustAnnotationsToInsert(
        sequenceDataToInsert[annotationType],
        0,
        caretPosition
      )
    );
  });
  if (
    maintainOriginSplit &&
    caretPositionOrRange &&
    caretPositionOrRange.start > caretPositionOrRange.end
  ) {
    //we're replacing around the origin and maintainOriginSplit=true
    //so rotate the resulting seqData n bps
    const caretPosToRotateTo =
      existingSequenceData.sequence.length - caretPositionOrRange.start;
    return rotateSequenceDataToPosition(
      newSequenceData,
      Math.min(caretPosToRotateTo, insertLength)
    );
  }
  return newSequenceData;
}

function adjustAnnotationsToDelete(annotationsToBeAdjusted, range, maxLength) {
  return map(annotationsToBeAdjusted, annotation => {
    const newRange = adjustRangeToDeletionOfAnotherRange(
      annotation,
      range,
      maxLength
    );
    const newLocations =
      annotation.locations &&
      annotation.locations
        .map(loc => adjustRangeToDeletionOfAnotherRange(loc, range, maxLength))
        .filter(range => !!range);
    if (newLocations && newLocations.length) {
      return {
        ...newRange,
        start: newLocations[0].start,
        end: newLocations[newLocations.length - 1].end,
        ...(newLocations.length > 0 && { locations: newLocations })
      };
    } else {
      return newRange;
    }
  }).filter(range => !!range); //filter any fully deleted ranges
}

function insertIntoChromatogram({
  chromatogramData,
  caretPosition,
  seqToInsert,
  includeTraceData
}) {
  if (!seqToInsert.length) return;

  chromatogramData.baseCalls &&
    chromatogramData.baseCalls.splice(
      caretPosition,
      0,
      ...seqToInsert.split("")
    );
  if (!includeTraceData) {
    //return early if just base calls
    return chromatogramData;
  }

  const baseTracesToInsert = [];
  const qualNumsToInsert = [];

  for (let index = 0; index < seqToInsert.length; index++) {
    qualNumsToInsert.push(0);
    const toPush = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    baseTracesToInsert.push({
      aTrace: toPush,
      cTrace: toPush,
      gTrace: toPush,
      tTrace: toPush
    });
  }

  chromatogramData.baseTraces &&
    chromatogramData.baseTraces.splice(caretPosition, 0, ...baseTracesToInsert);
  chromatogramData.qualNums &&
    chromatogramData.qualNums.splice(caretPosition, 0, ...qualNumsToInsert);
  chromatogramData.basePos &&
    chromatogramData.basePos.splice(caretPosition, 0, ...qualNumsToInsert);

  return chromatogramData;
}

function trimChromatogram({
  chromatogramData,
  range: { start, end },
  includeTraceData
}) {
  ["baseCalls", ...(includeTraceData ? ["qualNums", "baseTraces", "basePos"] : [])].forEach(type => {
    chromatogramData[type] &&
      chromatogramData[type].splice(start, end - start + 1);
  });

  return chromatogramData;
}

function getSyncedChromatogramDataOrFallback(chromatogramData, sequenceLength) {
  if (!chromatogramData) return chromatogramData;

  const lengthsToMatch = {
    baseCalls: chromatogramData.baseCalls,
    baseTraces: chromatogramData.baseTraces,
    qualNums: chromatogramData.qualNums,
    basePos: chromatogramData.basePos
  };

  const invalidKey = Object.keys(lengthsToMatch).find(key => {
    const arr = lengthsToMatch[key];
    return arr && arr.length !== sequenceLength;
  });

  if (!invalidKey) return chromatogramData;

  console.error(
    `Chromatogram data is out of sync with sequence length (${sequenceLength}). Falling back by dropping chromatogramData.`,
    {
      sequenceLength,
      baseCallsLength:
        chromatogramData.baseCalls && chromatogramData.baseCalls.length,
      baseTracesLength:
        chromatogramData.baseTraces && chromatogramData.baseTraces.length,
      qualNumsLength: chromatogramData.qualNums && chromatogramData.qualNums.length,
      basePosLength: chromatogramData.basePos && chromatogramData.basePos.length
    }
  );

  return undefined;
}
