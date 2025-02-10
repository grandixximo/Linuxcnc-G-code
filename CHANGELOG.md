# Changelog

All notable changes to this project will be documented in this file. 

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
