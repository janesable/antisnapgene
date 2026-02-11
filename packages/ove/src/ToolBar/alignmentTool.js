import React from "react";
import { Icon, Button, Intent, Classes, Callout } from "@blueprintjs/core";
import {
  FileUploadField,
  TextareaField,
  EditableTextField,
  CheckboxField,
  wrapDialog
} from "@teselagen/ui";
import { reduxForm, FieldArray } from "redux-form";
import { anyToJson } from "@teselagen/bio-parsers";
import { flatMap } from "lodash-es";
import uniqid from "shortid";
import { cloneDeep } from "lodash-es";
import classNames from "classnames";

import ToolbarItem from "./ToolbarItem";
import { connectToEditor } from "../withEditorProps";
import withEditorProps from "../withEditorProps";
import { showDialog } from "../GlobalDialogUtils";
import { compose } from "recompose";
import { array_move } from "./array_move";

export default connectToEditor(({ readOnly, toolBar = {} }) => {
  return {
    readOnly: readOnly,
    isOpen: toolBar.openItem === "alignmentTool"
  };
})(({ toolbarItemProps, isOpen }) => {
  return (
    <ToolbarItem
      {...{
        Icon: <Icon data-test="alignmentTool" icon="align-left" />,
        // toggled: alignmentTool.isOpen,
        renderIconAbove: isOpen,
        // onIconClick: toggleFindTool,
        Dropdown: ConnectedAlignmentToolDropdown,
        onIconClick: "toggleDropdown",
        noDropdownIcon: true,
        tooltip: isOpen ? "Hide Alignment Tool" : "Align to This Sequence",
        ...toolbarItemProps
      }}
    />
  );
});

class AlignmentToolDropdown extends React.Component {
  render() {
    const {
      savedAlignments = [],
      hasSavedAlignments,
      toggleDropdown,
      sequenceData
    } = this.props;
    return (
      <div>
        <Button
          intent={Intent.PRIMARY}
          onClick={() => {
            toggleDropdown();
            showDialog({
              dialogType: "AlignmentToolDialog",
              props: {
                createNewAlignment: this.props.createNewAlignment,
                upsertAlignmentRun: this.props.upsertAlignmentRun,
                initialValues: {
                  addedSequences: [{ ...sequenceData, isTemplate: true }]
                }
              }
            });
          }}
        >
          Create New Alignment
        </Button>
        <br></br>
        <br></br>
        <Callout intent="warning">
          Note: This tool requires an alignment server to be hooked up for it to
          work properly. It will NOT work in the OVE demo page.
        </Callout>
        <div className="vespacer" />
        {hasSavedAlignments && (
          <div>
            <h6>Saved Alignments:</h6>
            {!savedAlignments.length && (
              <div style={{ fontStyle: "italic" }}> No Alignments</div>
            )}
            {savedAlignments.map((savedAlignment, i) => {
              return <div key={i}>Saved Alignment {i}</div>;
            })}
          </div>
        )}
      </div>
    );
  }
}
const ConnectedAlignmentToolDropdown = withEditorProps(AlignmentToolDropdown);

class AlignmentTool extends React.Component {
  state = {
    templateSeqIndex: 0
  };

  getSequenceTrimBounds = addedSequence => {
    const sequenceLength = (addedSequence.sequence || "").length;
    const baseCallsLength =
      addedSequence.chromatogramData && addedSequence.chromatogramData.baseCalls
        ? addedSequence.chromatogramData.baseCalls.length
        : sequenceLength;
    const maxLength = Math.min(sequenceLength, baseCallsLength);
    return {
      maxLength,
      maxIndex: Math.max(maxLength - 1, 0)
    };
  };

  getNormalizedTrimRange = ({
    trimStart,
    trimEnd,
    maxIndex,
    fallbackStart = 0,
    fallbackEnd = maxIndex
  }) => {
    const safeStart = Number.isInteger(trimStart) ? trimStart : fallbackStart;
    const safeEnd = Number.isInteger(trimEnd) ? trimEnd : fallbackEnd;
    const normalizedStart = Math.max(0, Math.min(safeStart, maxIndex));
    const normalizedEnd = Math.max(normalizedStart, Math.min(safeEnd, maxIndex));
    return {
      trimStart: normalizedStart,
      trimEnd: normalizedEnd
    };
  };

  updateSelectedSequenceTrim = ({ fields, index, trimStart, trimEnd }) => {
    const selectedSequence = fields.get(index);
    if (!selectedSequence) return;
    const { maxIndex } = this.getSequenceTrimBounds(selectedSequence);
    const normalizedTrim = this.getNormalizedTrimRange({
      trimStart,
      trimEnd,
      maxIndex,
      fallbackStart: selectedSequence.trimStart,
      fallbackEnd: selectedSequence.trimEnd
    });
    fields.remove(index);
    fields.insert(index, {
      ...selectedSequence,
      ...normalizedTrim
    });
  };

  trimSingleSequence = ({
    addedSequence,
    isAutotrimmedSeq,
    shouldApplyManualTrim
  }) => {
    if (!addedSequence) return addedSequence;
    const output = cloneDeep(addedSequence);
    const { maxLength, maxIndex } = this.getSequenceTrimBounds(output);
    if (!maxLength) {
      output.sequence = "";
      return output;
    }

    let finalTrimRange = this.getNormalizedTrimRange({
      trimStart: output.trimStart,
      trimEnd: output.trimEnd,
      maxIndex
    });

    if (!shouldApplyManualTrim) {
      finalTrimRange = { trimStart: 0, trimEnd: maxIndex };
    }

    if (
      isAutotrimmedSeq &&
      output.chromatogramData &&
      output.chromatogramData.qualNums
    ) {
      const { suggestedTrimStart = 0, suggestedTrimEnd = maxIndex } = mottTrim(
        output.chromatogramData.qualNums
      );
      const autoRange = this.getNormalizedTrimRange({
        trimStart: suggestedTrimStart,
        trimEnd: suggestedTrimEnd,
        maxIndex
      });
      finalTrimRange = {
        trimStart: Math.max(finalTrimRange.trimStart, autoRange.trimStart),
        trimEnd: Math.min(finalTrimRange.trimEnd, autoRange.trimEnd)
      };
      if (finalTrimRange.trimEnd < finalTrimRange.trimStart) {
        finalTrimRange = autoRange;
      }
    }

    const { trimStart, trimEnd } = finalTrimRange;
    output.sequence = (output.sequence || "").slice(trimStart, trimEnd + 1);

    if (output.chromatogramData) {
      const originalBasePos = output.chromatogramData.basePos
        ? [...output.chromatogramData.basePos]
        : undefined;

      const elementsToTrim = ["baseCalls", "basePos", "qualNums"];
      elementsToTrim.forEach(element => {
        if (output.chromatogramData[element]) {
          output.chromatogramData[element] = output.chromatogramData[
            element
          ].slice(trimStart, trimEnd + 1);
        }
      });

      if (output.chromatogramData.baseTraces) {
        const traceStart =
          originalBasePos && originalBasePos.length > trimStart
            ? originalBasePos[trimStart]
            : 0;
        const traceEndExclusive =
          originalBasePos && originalBasePos.length > trimEnd + 1
            ? originalBasePos[trimEnd + 1]
            : undefined;
        Object.keys(output.chromatogramData.baseTraces).forEach(traceKey => {
          const traceValues = output.chromatogramData.baseTraces[traceKey];
          if (!traceValues || !traceValues.slice) return;
          output.chromatogramData.baseTraces[traceKey] = traceValues.slice(
            traceStart,
            traceEndExclusive
          );
        });
        if (output.chromatogramData.basePos) {
          output.chromatogramData.basePos = output.chromatogramData.basePos.map(
            position => position - traceStart
          );
        }
      }
    }

    return output;
  };

  sendSelectedDataToBackendForAlignment = async values => {
    const {
      addedSequences,
      isPairwiseAlignment,
      isAlignToRefSeq,
      isAutotrimmedSeq,
      shouldApplyManualTrim
    } = values;
    const {
      hideModal,
      /* onAlignmentSuccess, */ createNewAlignment,
      // createNewMismatchesList,
      upsertAlignmentRun
    } = this.props;
    const { templateSeqIndex } = this.state;
    const addedSequencesToUse = array_move(addedSequences, templateSeqIndex, 0);

    const shouldTrimSequences = isAutotrimmedSeq || shouldApplyManualTrim;
    const seqsToAlign = shouldTrimSequences
      ? addedSequencesToUse.map(addedSequence => {
          return this.trimSingleSequence({
            addedSequence,
            isAutotrimmedSeq,
            shouldApplyManualTrim
          });
        })
      : addedSequencesToUse;

    hideModal();
    const alignmentId = uniqid();
    // const alignmentIdMismatches = uniqid();
    createNewAlignment({
      id: alignmentId,
      name: seqsToAlign[0].name + " Alignment"
    });
    //set the alignment to loading
    upsertAlignmentRun({
      id: alignmentId,
      loading: true
    });
    // createNewMismatchesList({
    //   id: alignmentIdMismatches,
    //   name: addedSequencesToUse[0].name + " Mismatches",
    //   alignmentId: alignmentId
    // });

    // const j5server = process.env.REMOTE_J5 || "http://j5server.teselagen.com"

    window.toastr.success("Alignment submitted.");
    const replaceProtocol = url => {
      return url.replace("http://", window.location.protocol + "//");
    };

    const seqInfoToSend = seqsToAlign.map(({ sequence, name, id }) => {
      return {
        sequence,
        name,
        id
      };
    });

    const {
      alignedSequences: _alignedSequences,
      pairwiseAlignments,
      alignmentsToRefSeq
    } = await (
      await fetch({
        url: replaceProtocol("http://j5server.teselagen.com/alignment/run"),
        method: "post",
        body: JSON.stringify({
          //only send over the bear necessities :)
          sequencesToAlign: seqInfoToSend,
          isPairwiseAlignment,
          isAlignToRefSeq
        })
      })
    ).json();

    // alignmentsToRefSeq set to alignedSequences for now
    let alignedSequences = _alignedSequences;
    if (alignmentsToRefSeq) {
      alignedSequences = alignmentsToRefSeq;
    }
    if (!alignedSequences && !pairwiseAlignments)
      window.toastr.error("Error running sequence alignment!");
    //set the alignment to loading
    upsertAlignmentRun({
      id: alignmentId,
      pairwiseAlignments:
        pairwiseAlignments &&
        pairwiseAlignments.map((alignedSequences, topIndex) => {
          return alignedSequences.map((alignmentData, innerIndex) => {
            return {
              sequenceData: seqsToAlign[innerIndex > 0 ? topIndex + 1 : 0],
              alignmentData,
              chromatogramData: seqsToAlign[innerIndex].chromatogramData
            };
          });
        }),
      alignmentTracks:
        alignedSequences &&
        alignedSequences.map(alignmentData => {
          return {
            sequenceData:
              seqsToAlign[
                alignmentData.name.slice(0, alignmentData.name.indexOf("_"))
              ],
            alignmentData,
            chromatogramData:
              seqsToAlign[
                alignmentData.name.slice(0, alignmentData.name.indexOf("_"))
              ].chromatogramData
          };
        })
      // alignmentTracks:
      //   alignedSequences &&
      //   alignedSequences.map((alignmentData, i) => {
      //     return {
      //       sequenceData: addedSequencesToUse[i],
      //       alignmentData,
      //       chromatogramData: addedSequencesToUse[i].chromatogramData
      //     };
      //   })
    });
  };

  handleFileUpload = (files, onChange) => {
    const { array } = this.props;
    flatMap(files, async file => {
      const results = await anyToJson(file.originalFileObj, {
        fileName: file.name,
        acceptParts: true
      });
      return results.forEach(result => {
        if (result.success) {
          array.push("addedSequences", result.parsedSequence);
        } else {
          return window.toastr.warning("Error parsing file: ", file.name);
        }
      });
    });
    onChange([]);
  };
  renderAddSequence = ({ fields, templateSeqIndex }) => {
    const { handleSubmit } = this.props;

    const sequencesToAlign = fields.getAll() || [];
    const selectedSequence = sequencesToAlign[templateSeqIndex];
    const selectedTrimBounds = selectedSequence
      ? this.getSequenceTrimBounds(selectedSequence)
      : undefined;
    const selectedTrimRange = selectedSequence
      ? this.getNormalizedTrimRange({
          trimStart: selectedSequence.trimStart,
          trimEnd: selectedSequence.trimEnd,
          maxIndex: selectedTrimBounds.maxIndex
        })
      : undefined;
    const trimmedLength = selectedTrimRange
      ? selectedTrimRange.trimEnd - selectedTrimRange.trimStart + 1
      : 0;

    return (
      <div>
        <h6>Or enter sequences in plain text format</h6>
        <div>
          <AddYourOwnSeqForm
            addSeq={newSeq => {
              fields.push(newSeq);
            }}
          />
          <h6 style={{ marginTop: 15 }}>Sequences To Align: </h6>
          {!fields.getAll() && <div>No sequences added yet.</div>}
          <div
            style={{ maxHeight: 180, overflowY: "auto" }}
            className="veAlignmentToolSelectedSequenceList"
          >
            {sequencesToAlign.map((addedSeq, index) => {
              return (
                <div
                  onClick={() => {
                    this.setState({
                      templateSeqIndex: index
                    });
                  }}
                  style={{
                    borderBottom: "1px solid lightgrey",
                    paddingBottom: 4,
                    marginBottom: 4,
                    width: "100%",
                    justifyContent: "space-between",
                    alignItems: "center",
                    display: "flex"
                  }}
                  key={index}
                >
                  <div>
                    {addedSeq.name}{" "}
                    <span style={{ fontSize: 10 }}>
                      {" "}
                      ({addedSeq.sequence.length} bps)
                    </span>
                  </div>
                  {index === templateSeqIndex && (
                    <div
                      className={classNames(
                        Classes.TAG,
                        Classes.ROUND,
                        Classes.INTENT_PRIMARY
                      )}
                    >
                      template
                    </div>
                  )}

                  <Button
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      fields.remove(index);
                      if (index === templateSeqIndex) {
                        this.setState({ templateSeqIndex: 0 });
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
          <br />
          <CheckboxField
            name="shouldApplyManualTrim"
            style={{ display: "flex", alignItems: "center" }}
            label={
              <div>
                Trim Selected Sequence Range
                <span style={{ fontSize: 11 }}>
                  {" "}
                  Select a sequence from the list and adjust trim start/end
                  before alignment.
                </span>
              </div>
            }
          />
          {selectedSequence && selectedTrimBounds && (
            <div style={{ marginTop: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                {selectedSequence.name} trim preview: {selectedTrimRange.trimStart}
                -{selectedTrimRange.trimEnd} ({trimmedLength} bp after trim)
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 35, fontSize: 12 }}>Start</span>
                <input
                  type="range"
                  min={0}
                  max={selectedTrimBounds.maxIndex}
                  value={selectedTrimRange.trimStart}
                  onChange={e => {
                    this.updateSelectedSequenceTrim({
                      fields,
                      index: templateSeqIndex,
                      trimStart: Number(e.target.value),
                      trimEnd: selectedTrimRange.trimEnd
                    });
                  }}
                  style={{ width: 180 }}
                />
                <input
                  type="number"
                  min={0}
                  max={selectedTrimRange.trimEnd}
                  value={selectedTrimRange.trimStart}
                  onChange={e => {
                    this.updateSelectedSequenceTrim({
                      fields,
                      index: templateSeqIndex,
                      trimStart: Number(e.target.value),
                      trimEnd: selectedTrimRange.trimEnd
                    });
                  }}
                  style={{ width: 80 }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4
                }}
              >
                <span style={{ minWidth: 35, fontSize: 12 }}>End</span>
                <input
                  type="range"
                  min={selectedTrimRange.trimStart}
                  max={selectedTrimBounds.maxIndex}
                  value={selectedTrimRange.trimEnd}
                  onChange={e => {
                    this.updateSelectedSequenceTrim({
                      fields,
                      index: templateSeqIndex,
                      trimStart: selectedTrimRange.trimStart,
                      trimEnd: Number(e.target.value)
                    });
                  }}
                  style={{ width: 180 }}
                />
                <input
                  type="number"
                  min={selectedTrimRange.trimStart}
                  max={selectedTrimBounds.maxIndex}
                  value={selectedTrimRange.trimEnd}
                  onChange={e => {
                    this.updateSelectedSequenceTrim({
                      fields,
                      index: templateSeqIndex,
                      trimStart: selectedTrimRange.trimStart,
                      trimEnd: Number(e.target.value)
                    });
                  }}
                  style={{ width: 80 }}
                />
              </div>
            </div>
          )}
          <CheckboxField
            name="isPairwiseAlignment"
            style={{ display: "flex", alignItems: "center" }}
            label={
              <div>
                Create Pairwise Alignment{" "}
                <span style={{ fontSize: 11 }}>
                  Individually align each uploaded file against the template
                  sequence (instead of creating a single Multiple Sequence
                  Alignment)
                </span>
              </div>
            }
          />
          <CheckboxField
            name="isAlignToRefSeq"
            style={{ display: "flex", alignItems: "center" }}
            label={
              <div>
                Align Sequencing Reads to Reference Sequence{" "}
                <span style={{ fontSize: 11 }}>
                  Align short sequencing reads to a long reference sequence
                </span>
              </div>
            }
          />
          <CheckboxField
            name="isAutotrimmedSeq"
            style={{ display: "flex", alignItems: "center" }}
            label={
              <div>
                Auto-Trim Sequences{" "}
                <span style={{ fontSize: 11 }}>
                  Automatically trim low-quality ends of sequences based on
                  quality scores
                </span>
              </div>
            }
          />

          <Button
            style={{ marginTop: 15, float: "right" }}
            intent={Intent.PRIMARY}
            disabled={sequencesToAlign.length < 2}
            onClick={handleSubmit(this.sendSelectedDataToBackendForAlignment)}
          >
            Create alignment
          </Button>
        </div>
      </div>
    );
  };

  render() {
    const { selectFromSequenceLibraryHook } = this.props;
    const { templateSeqIndex } = this.state;
    return (
      <div style={{ padding: 20 }} className="veAlignmentTool">
        <h6>Upload files you'd like to align (.ab1, .fasta, .gb) </h6>
        <FileUploadField
          name="alignmentToolSequenceUpload"
          style={{ maxWidth: 400 }}
          beforeUpload={this.handleFileUpload}
        />
        {selectFromSequenceLibraryHook && (
          <h6>Or Select from your sequence library </h6>
        )}

        <FieldArray
          name="addedSequences"
          templateSeqIndex={templateSeqIndex}
          component={this.renderAddSequence}
        />
      </div>
    );
  }
}

export const AlignmentToolDialog = compose(
  wrapDialog({ title: "Create New Alignment" }),
  reduxForm({
    form: "veAlignmentTool"
  })
)(AlignmentTool);

const AddYourOwnSeqForm = reduxForm({
  form: "AddYourOwnSeqForm",
  validate: ({ name, sequence }) => {
    const errors = {};
    if (!name) {
      errors.name = "Required";
    }
    if (!sequence) {
      errors.sequence = "Required";
    }
    return errors;
  }
})(({ pristine, error, handleSubmit, reset, addSeq }) => {
  return (
    <form
      onSubmit={handleSubmit(vals => {
        reset();
        addSeq(vals);
      })}
    >
      <EditableTextField
        style={{ maxWidth: 200 }}
        placeholder="Untitled Sequence"
        name="name"
      />
      <TextareaField
        style={{ maxWidth: 400 }}
        placeholder="AGTTGAGC"
        name="sequence"
      />
      <Button disabled={pristine || error} type="submit">
        Add
      </Button>
    </form>
  );
});

function mottTrim(qualNums) {
  if (!qualNums) return;
  let startPos = 0;
  let endPos = 0;
  const totalScoreInfo = [];
  let score = 0;
  let totalScore = 0;
  const cutoff = 0.05;
  for (let i = 0; i < qualNums.length; i++) {
    // low-quality bases have high error probabilities, so may have a negative base score
    score = cutoff - Math.pow(10, qualNums[i] / -10);
    totalScore += score;
    totalScoreInfo.push(totalScore);
    // score = score + cutoff - Math.pow(10, qualNums[i] / -10);
    // if (totalScore < 0) {
    //   tempStart = i;
    // }
    // if (i - tempStart > endPos - startPos) {
    //   startPos = tempStart;
    //   endPos = i;
    // }
    if (totalScore < 0) {
      totalScore = 0;
    }
  }
  const firstPositiveValue = totalScoreInfo.find(e => {
    return e > 0;
  });
  startPos = totalScoreInfo.indexOf(firstPositiveValue);
  const highestValue = Math.max(...totalScoreInfo);
  endPos = totalScoreInfo.lastIndexOf(highestValue);
  return {
    suggestedTrimStart: startPos,
    suggestedTrimEnd: endPos
  };
}
