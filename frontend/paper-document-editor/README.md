# Paper Document Editor

A browser-based document/design viewer and editor inspired by the supplied reference image and grounded in the supplied Paper style guide.

## Included

- Figma/Paper-like 3-column editor layout
- Pages and layers tree
- Center document canvas
- Right-side inspector
- Editable document text via `contenteditable`
- Typography controls
- Fill/color control
- Radius control
- Zoom controls
- Text tool for inserting editable text
- Floating Claude Code panel
- Responsive behavior

## Style source

The implementation follows the supplied guide's key tokens:
- Bone Canvas `#efefe4`
- Paper White `#fcfcf9`
- Ink `#181818`
- Studio Blue `#5d8cd7`
- Stone `#d7d7d6`
- Inter for UI
- Manrope as a practical substitute for Matter
- JetBrains Mono as a practical substitute for Paper Mono

## Run

```bash
python -m http.server 5500
```

Open `http://localhost:5500`.

This is a frontend prototype. It does not persist edits to a backend or export a real design document yet.
