// TODO maybe move to TRC or elsewhere
let hiddenInput;
let callback;

function getInput({ multiple, accept }) {
  if (!hiddenInput) {
    hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.style.position = "absolute";
    hiddenInput.style.visibility = "hidden";
    hiddenInput.addEventListener("change", event => {
      callback(event.target.files);
    });

    document.body.appendChild(hiddenInput);
  }
  hiddenInput.multiple = multiple ? "multiple" : undefined;
  hiddenInput.accept = accept || "";
  return hiddenInput;
}

export default function showFileDialog({ multiple = false, onSelect, accept }) {
  const input = getInput({ multiple, accept });
  callback = onSelect;
  input.click();
}
