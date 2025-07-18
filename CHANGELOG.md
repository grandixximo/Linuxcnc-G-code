# Changelog

All notable changes to this project will be documented in this file. 

## [1.0.3] - 2025-02-13

### Formatter Fixes & Improvements

- **Inline Comment Formatting:**
  - Fixed an issue where inline comments following `IF`, `ELSEIF`, or other control statements were pushed to the next line with incorrect indentation. Comments now remain correctly on the same line.
  - Corrected spacing for comments that appear on the same line as a statement to ensure a single, consistent space.
- **Node.js Compatibility:**
  - Made the formatter compatible with a standard Node.js environment, allowing it to be used in test runners and other command-line tools without causing a `vscode module not found` error.

## [1.0.2] - 2025-02-12

### **Enhanced Parameter Support**

- **HAL & INI Parameter Parsing:**
  - Added support for `#<_hal[...]>` and `#<_ini[...]>` parameter syntax.
  - Improved regex handling to correctly recognize parameters with embedded square brackets and trailing identifiers (e.g., `#<_ini[setup]xpos>`, `#<_hal[motion-controller.time]>`).

- **Formatter Updates:**
  - Ensured parameters within bracket notation remain correctly spaced and formatted.
  - Improved handling of HAL and INI parameters when used inside expressions and conditions.

- **Bug Fixes & Refinements:**
  - Fixed an issue where `#<param[xyz]>` was sometimes not detected correctly.
  - Updated syntax highlighting rules to properly categorize HAL and INI parameters under `variable.language.global.gcode`.


## [1.0.1] - 2025-02-11

### Parser & Formatter Enhancements

- **Improved Parser**:
  - Added `FlowBlock` logic for `IF`-style statements, enabling proper nesting of statements until the matching `ENDIF`.
  - Updated handling of `ELSEIF` to attach bracketed conditions (`[#5399 EQ 2]`) directly to the flow statement rather than as separate commands.
  - Ensured unknown tokens are concatenated and reported more clearly.

- **Improved Formatter**:
  - Indentation logic now correctly reflects nested blocks for `IF/ELSEIF/ELSE/ENDIF`.
  - Eliminated extra blank lines by removing redundant newlines in the `OStatement` printing logic.
  - Properly retains bracketed expressions in `elseif [condition]` lines without losing them.

- **Minor Fixes**:
  - Updated debug logging to print the entire AST for troubleshooting.
  - Fixed minor spacing and alignment issues in output.

## [1.0.0] - 2025-02-10

### Initial Release

- **Syntax Highlighting**: 
  - Added syntax highlighting for G-code commands (e.g., `G1`, `M3`, `M6`).
  - Highlighted control flow keywords (e.g., `IF`, `THEN`, `WHILE`, `RETURN`, `ELSE`).
  - Supported operators (e.g., `+`, `-`, `*`, `/`, `MOD`, `**`, `=`, `EQ`).
  - Numeric constants and variables are now highlighted (e.g., `#100`, `5.5`, `<parameter>`).
  - Block and line comments highlighted (single-line `;`, multi-line `()`).
  - Built-in function names like `ATAN`, `ABS`, `EXP`, `ROUND`, `SIN` are highlighted.

- **Code Formatter**: 
  - Automatic indentation and formatting of flow control blocks (`IF`, `WHILE`, `DO`, etc.).
  - Supports formatting of assignment statements (`#100 = 5`).
  - Ensures consistent spacing between operators and operands.
  - Inline comments are formatted properly within the code.

- **Installation**:
  - Available on the **Visual Studio Code Marketplace** for easy installation.
  - Manual installation via `.vsix` package is supported.

- **Customization**:
  - Default indentation behavior can be configured via the `settings.json` file for user preferences.

---

Feel free to reach out if you encounter any issues or have suggestions for the next version!
