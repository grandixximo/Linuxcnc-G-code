# LinuxCNC RS274 G-Code Language Support for Visual Studio Code

This extension provides **syntax highlighting** and **code formatting** support for G-code files in Visual Studio Code. It includes:

- **Syntax Highlighting**: Color-coding for different G-code elements such as commands, variables, comments, operators, and more.
- **Code Formatter**: Automatically formats G-code files to enhance readability.

## Features

### Syntax Highlighting
- **G-code commands** (e.g., `G1`, `M3`)
- **Control flow keywords** (e.g., `IF`, `WHILE`, `SUB`, `ENDIF`)
- **Operators** (e.g., `+`, `-`, `*`, `/`)
- **Numeric constants** (e.g., `100`, `5.5`)
- **Variables** (e.g., `#100`, `<parameter>`)
- **Comments** (single-line using `;`, block comments using `(` and `)`)
- **Functions** (e.g., `SIN`, `COS`, `ATAN`)

### Code Formatter
- **Indentation**: The formatter automatically adds indentation to G-code statements and flow blocks.
- **Flow Control**: Properly formats flow control blocks (`IF`, `WHILE`, `DO`, `RETURN`, etc.).
- **Assignments**: Ensures assignment statements are properly formatted with spacing (`#100 = 5`).
- **Inline Comments**: Keeps comments formatted inline with code for better readability.

## Installation

### Install from Visual Studio Code Marketplace

1. Open **Visual Studio Code**.
2. Go to the **Extensions** view by clicking the square icon in the sidebar.
3. Search for **G-Code Language Support**.
4. Click **Install** on the extension page.

### Install via VSIX (Manual Installation)

1. Download the `.vsix` file from the [extension release page](https://example.com/releases).
2. In **Visual Studio Code**, go to the **Extensions** view.
3. Click the `...` (three-dot) menu and select **Install from VSIX...**.
4. Select the downloaded `.vsix` file.

## Usage

1. Open your G-code file (`.gcode`, `.nc`, or `.cnc`) in Visual Studio Code.
2. The syntax highlighting will be automatically applied based on the contents of the file.
3. To format the document, either:
   - Press `Shift + Alt + F` (Windows/Linux) or `Shift + Option + F` (Mac) to format the entire file.
   - Right-click inside the editor and select **Format Document** from the context menu.

## Configuration

You can modify the default indentation behavior and other settings via the `settings.json` file in Visual Studio Code. For example:

```json
{
  "editor.tabSize": 2,
  "editor.insertSpaces": true
}
```

### **G-Code Parsing Rules **

---


## **1. General Structure**
Every **letter (A-Z)** acts as a **word** and must be followed by a **value expression**.  
A **value expression** consists of:
- **Numbers** (`1`, `-10.5`)
- **Parameters** (`#1`, `#<test>`)
- **Functions** (`ABS`, `SQRT`, `SIN`, etc.)
- **Bracketed expressions** (`[...]`)
- **Arithmetic operators** (`+`, `-`, `*`, `/`, `**`) (inside brackets)
- **Logical operators (`AND`, `OR`, `XOR`)** (inside brackets)
- **Comparison operators (`LT`, `LE`, `GT`, `GE`, `EQ`, `NE`)** (inside brackets)
- **Unary operators (`+`, `-`)** at the **start** of a value expression
- **Bracketed expressions can contain other bracketed expressions** (deep nesting allowed)

### 🔹 **Clarifications:**
- **`G#1` is valid** syntax **without requiring brackets**, since `#1` is a value expression.
- **`G[1]` is valid**, since `[1]` is a bracketed value expression.
- **`G-1` is valid in ALS**, as `-1` is a correctly structured **value expression**, even if LinuxCNC does not currently support `G-1`.

✅ **Valid Examples:**
```
A[SQRT[4]]         ; ✅ `A` is a word, `[SQRT[4]]` is a value expression
B-ABS[-1]          ; ✅ `B` is a word, `-ABS[-1]` is a value expression
C#100              ; ✅ `C` is a word, `#100` is a value expression
D---10             ; ✅ `D` is a word, `---10` is a valid value expression
E[5+SQRT[#3]]      ; ✅ `E` is a word, `[5+SQRT[#3]]` is a valid value expression
F#1                ; ✅ `F` is a word, `#1` is a value expression (no brackets needed)
G[1]               ; ✅ `G` is a word, `[1]` is a value expression (valid bracketed syntax)
H-1                ; ✅ `H` is a word, `-1` is a valid value expression (ALS allows it)  
I[#1+1]            ; ✅ `I` is a word, `[#1+1]` is a valid bracketed value expression  
J#<test>           ; ✅ `J` is a word, `#<test>` is a valid value expression
```

❌ **Invalid Examples:**
```
G           ; ❌ `G` is a word but has no value expression
XAND10      ; ❌ `AND` must be inside brackets and between two values
G[#<test>+5][5+5] ; ❌ A word was expected after closing the first bracket
```

---

## **2. Spacing Rules**
- **Spaces are ignored** in parsing.
- `GABS[-1]X500` is **identical** to `G A B S  [ - 1 ] X 5 0 0`
- `O500ENDSUB` is **identical** to `O 5 0 0 E N D S U B`
- There is **no** requirement to add spaces between words.

✅ **Valid Examples (Equivalent G-Code):**
```
GABS[-1]X500
G A B S [ - 1 ] X 5 0 0
```
These are **identical** in meaning.

---

## **3. Special Handling of `O` Words (Program Flow)**  

The **only exception** to the "word + value expression" rule is `O` words, which represent **program flow statements**.

- An **`O` word must always be followed by a valid value expression**.
- After the **value expression**, a **flow control keyword** (`IF`, `WHILE`, `SUB`, `ENDSUB`, `CALL`, etc.) **must follow**.
- **Conditional statements** (`IF`, `WHILE`) must be followed by a **bracketed expression (`[...]`)** containing a valid **logical comparison**.
- **Non-conditional flow control statements** (`SUB`, `ENDSUB`, etc.) do **not** require a following value expression.
- **For `CALL`, multiple value expressions can follow, but each must be enclosed in brackets (`[...]`)**.

---

✅ **Valid Examples:**
```
O#100 IF [#10 LT 11]              ; `O` word, `#100` valid value expression, `IF` flow control  
O-ABS[#5] WHILE [#<test> GE 5]    ; `O` word, `-ABS[#5]` valid value expression, `WHILE` flow control  
O[#1+1] SUB                       ; `O` word, `[#1+1]` valid value expression, `SUB` starts a subroutine  
O[SIN[#<var>]] ENDSUB             ; `O` word, `[SIN[#<var>]]` valid value expression, `ENDSUB` ends a subroutine  
OEXP[#100+[10**2]] CALL [#1] [-1] [ABS[#5]] ; `O` word, `EXP[#100+[10**2]]` valid value expression, `CALL` with multiple valid bracketed value expressions  
```

---

❌ **Invalid Examples:**
```
O[SIN[#<var>]] [#10 LT 11]        ; ❌ Flow control keyword (IF, WHILE, etc.) missing after value expression  
OEXP[#100] IF -[#1]               ; ❌ `IF` condition must be fully enclosed in brackets  
OEXP[#100] CALL #1 -1 ABS[#5]     ; ❌ Each additional value expression after `CALL` must be enclosed in brackets  
O500 SUB [#10]                    ; ❌ `SUB` does not accept additional value expressions  
O#100 WHILE 5 LT #1               ; ❌ `WHILE` condition must be enclosed in brackets  
```

---

### 🔹 **Clarifications:**
- **An `O` word must always be followed by a valid value expression.**  
- **A flow control keyword (`IF`, `WHILE`, `SUB`, `CALL`, etc.) must always follow the value expression.**  
- **`CALL` can accept multiple value expressions, but each must be enclosed in brackets (`[...]`).**  
- **Conditions for `IF`, `WHILE`, etc., must always be fully enclosed in brackets.**  
- **Flow control keywords like `SUB`, `ENDSUB` do not accept additional value expressions.**
---

### **4. Assignments (`#` Parameter Assignments)**
An assignment **must start with a `#`**, followed by a **value expression**, then an `=` sign, and then another **valid value expression**.

- **The assignment itself (`=`) cannot be inside square brackets.**
- **The right-hand side must be a valid value expression.**
- **Binary operators (`+`, `-`, `*`, `/`, `AND`, etc.) require square brackets (`[...]`), but `=` is NOT a binary operator.**

✅ **Valid Assignments:**
```
#1 = 10          ; ✅ Assign number
#100 = -5        ; ✅ Assign negative number
#<var> = #5      ; ✅ Assign parameter to another parameter
#<test> = SQRT[#1 + 2] ; ✅ Assign function result to parameter
#<a> = -ABS[#3]  ; ✅ Assign function with unary operator
#1 = [10 + 5]    ; ✅ Right-hand side can be a bracketed expression
#1 = [[#1] + [#1]]  ; ✅ Nested bracketed expressions
```

❌ **Invalid Assignments:**
```
# = 10           ; ❌ Missing value expression after #
#1 10            ; ❌ Missing assignment operator (=)
#<test> - 5      ; ❌ Missing assignment operator (=)
[#1 = 10]        ; ❌ Assignment inside brackets is invalid
```

---

Yes, that is consistent with what we discussed. A **value expression** always follows a **word expression** or a **flow word**, but **when it follows a flow word, it must be enclosed in brackets (`[...]`)**.

---

### **5. Value Expressions**  

A **value expression** follows strict rules and always comes after either:  
1. **A word expression** (e.g., `G`, `X`, `F`, etc.).  
2. **A flow word** (`IF`, `WHILE`, `CALL`, etc.), but in this case, it **must be enclosed in brackets (`[...]`)**.

A **value expression** must be one of the following:  

1. **A single value:**  
   - **Numbers:** `1`, `-10.5`  
   - **Parameters:** `#1`, `#<test>`  
2. **A function call:**  
   - `ABS[#10]`, `SQRT[#3]`, `SIN[#2]`, etc.  
3. **A bracketed expression (`[...]`):**  
   - **Contains a valid value expression**  
   - **Can contain other bracketed expressions (nested expressions allowed)**  
   - **Bracketed expressions can be nested inside assignments.**  
4. **A binary operation inside brackets (`[...]`)**:  
   - `[#10 + #20]`, `[#<X> * 2]`, `[#<X> LT #<Y>]`  
5. **A logical operation inside brackets (`[...]`)**:  
   - `[#<A> LT #<B> AND #<C> GE #<D>]`  
6. **A unary operation (`+`, `-`) applied to any of the above**:  
   - `-#10`, `+5`, `-ABS[#<X>]`, `-SIN[#5]`

---

### 🔹 **Clarifications:**
- **Value expressions always come after a word expression or a flow word.**  
- **Value expressions after a word expression do not require brackets.**  
  - ✅ `G-1`, `X#100`, `F[ABS[-1]]` are all valid.  
- **Value expressions after a flow word must be enclosed in brackets (`[...]`).**  
  - ✅ `IF [#10 LT 11]`, `WHILE [#<test> GE 5]`, `CALL [#1] [#2] [-ABS[#5]]` are all valid.  
- **Bracketed expressions (`[...]`) are required for binary expressions (`+`, `-`, `*`, `/`, `AND`, etc.).**  
  - ✅ `G[1 + 2]` is valid, but ❌ `G1 + 2` is invalid.  
- **Unary expressions (`+`, `-`) do not require brackets unless they are part of a binary operation.**  
  - ✅ `G-1`, `X-ABS[#5]` are valid, but ❌ `IF -#1` is invalid (must be `IF [-#1]`).  

---

✅ **Valid Value Expressions:**
```
G-1               ; ✅ Word `G` followed by a valid unary number value expression
X---10            ; ✅ Multiple unary negations resolve to `-10`
F#100             ; ✅ `F` followed by a valid parameter value expression
G[SQRT[4]]        ; ✅ `G` followed by a valid bracketed function call
G[#1 - 1]         ; ✅ `G` followed by a binary operation inside brackets
G[-#1*1]X--+ABS[-10]    ; ✅ Unary and binary operators combined
IF [#<test> LT #<value>]  ; ✅ `IF` flow word followed by a properly bracketed logical expression
WHILE [#<x> GE #10]      ; ✅ `WHILE` flow word followed by a properly bracketed condition
CALL [#100] [-ABS[#5]] [SQRT[#1]] ; ✅ `CALL` flow word followed by multiple bracketed value expressions
```

❌ **Invalid Value Expressions:**
```
[A LT B]          ; ❌ `A` and `B` are not valid value expressions (missing `#<A>`)
G[SQRT[4]]X -     ; ❌ `-` must be followed by a valid operand
[#1 = 10]         ; ❌ Assignments cannot be inside brackets
#1 = [10 + ]      ; ❌ Incomplete binary operation
#1 = [[#1] + ]    ; ❌ Missing operand in nested expression
IF -#1            ; ❌ `IF` must be followed by a bracketed condition (`IF [-#1]`)
CALL #1 -1 ABS[#5]  ; ❌ Each value expression after `CALL` must be inside brackets (`[...]`)
```

---

### 🔹 **Summary of Value Expression Rules:**
| **Context**          | **Example**                | **Valid?** |
|----------------------|---------------------------|---------|
| Word + value expression | `G-1`                  | ✅ Yes |
| Word + parameter | `X#100`                        | ✅ Yes |
| Word + function call | `F[ABS[#5]]`              | ✅ Yes |
| Flow word + bracketed expression | `IF [#10 LT 11]`  | ✅ Yes |
| Flow word + multiple bracketed expressions | `CALL [#1] [-ABS[#5]]` | ✅ Yes |
| Word + binary operation in brackets | `G[#1 + 1]` | ✅ Yes |
| Flow word without brackets | `IF -#1`             | ❌ No |
| Binary operation without brackets | `G1 + 2`       | ❌ No |
| `CALL` with unbracketed values | `CALL #1 -1 ABS[#5]` | ❌ No |

---

## **6. Operators (Clarified Unary & Binary Operators)**
### 🔹 **Unary Operators (`+`, `-`)**  
- A **value expression** can start with **multiple unary operators** (`+`, `-`).  
- **Unary operators must be applied to a valid value expression** (number, parameter, function, or bracketed expression).  
- **They cannot be applied to a word or logical expression**.
- **`G-1` is valid formatting, even if LinuxCNC does not support it.**  

✅ **Valid Unary Operator Cases:**
```
#1 = -10         ; ✅ `-` applied to a number  
G#100X-ABS[-1]   ; ✅ `-` applied to function call  
X-10             ; ✅ `-` applied to a number  
A+SQRT[#3]       ; ✅ `+` applied to function call  
G-1              ; ✅ `G` is a word, `-1` is a value expression  
```

---

#### **Binary Operators (`+`, `-`, `*`, `/`, `AND`, `OR`, etc.)**  
- Binary operators **must be inside brackets (`[...]`)**.  
- **They must be placed between two value expressions.**  
- **Comparison operators (`LT`, `LE`, `GT`, `GE`, `EQ`, `NE`)** must be inside brackets and between valid operands.  
- **Logical operators (`AND`, `OR`, `XOR`)** require two **logical expressions** inside brackets.

✅ **Valid Binary Operators:**
```
X[5 + -10]    ; ✅ `-10` is a value expression  
X[5 AND 10]   ; ✅ `AND` requires two operands  
#<A> = [#1 + #2] ; ✅ Assignment with a valid binary expression  
```

❌ **Invalid Binary Operators:**
```
XAND10      ; ❌ `AND` requires brackets and two operands  
X[AND 10]   ; ❌ `AND` cannot be the first token in a bracketed expression  
```

---

#### **Logical Operators (`AND`, `OR`, `XOR`) & Comparison Operators (`LT`, `LE`, `GT`, `GE`, `EQ`, `NE`)**  
- **Comparison operators** require **two value expressions** inside brackets.  
- **Logical operators** require **two logical expressions** inside brackets.  
- **Named parameters (`#<A>`, `#<B>`) must be used instead of words inside bracketed logical expressions**.

✅ **Valid Logical Expressions:**
```
[#<A> LT #<B> AND #<C> GE #<D>] ; ✅ Correct syntax  
[#<X> EQ 10]                    ; ✅ Comparison operator  
[#<X> LT #<Y>]                  ; ✅ Two value expressions compared  
[[[#<A>] LT [#<B>]] AND [[#<C>] GE [#<D>]]] ; ✅ Fully bracketed nested logical expression  
X[5 LT 10]                      ; ✅ `X` word followed by a valid logical comparison  
X[#1 AND 5]                     ; ✅ `AND` between two valid value expressions  
```

❌ **Invalid Logical Expressions:**
```
[A LT B]              ; ❌ `A` and `B` are not valid value expressions  
[[A LT B] AND [C GE D]] ; ❌ `A` and `B` are not valid value expressions  
IF #1 LT 10          ; ❌ `IF` must be followed by a bracketed condition (`IF [#1 LT 10]`)  
```

---
### **🆕 CHAPTER 7: Flow Control & Conditional Statements (Expanded for Clarity)**  

Flow control words (`IF`, `WHILE`, `ENDSUB`, etc.) **only work inside `O` statements.**  

#### **✅ Valid Flow Control Syntax**
```
O#<A> IF [#<B> LT 10]              ; ✅ `O` word, `#<A>` valid value expression, `IF` flow control  
O-ABS[#5] WHILE [#<test> GE #3]    ; ✅ `O` word, `-ABS[#5]` valid value expression, `WHILE` flow control  
O[SQRT[#1+1]] SUB                  ; ✅ `O` word, `[SQRT[#1+1]]` valid value expression, `SUB` starts a subroutine  
O[EXP[#100]+10] ENDSUB             ; ✅ `O` word, `[EXP[#100]+10]` valid value expression, `ENDSUB` ends a subroutine  
O[COS[#<var>]] CALL [#1] [-1] [ABS[#5]] ; ✅ `O` word, `[COS[#<var>]]` valid value expression, `CALL` with multiple valid bracketed value expressions  
```

#### **❌ Invalid Flow Control Cases**
```
O[SIN[#<var>]] [#10 LT 11]         ; ❌ Flow control keyword (IF, WHILE, etc.) missing after value expression  
O[EXP[#100]] IF -[#1]              ; ❌ `IF` condition must be fully enclosed in brackets  
O[LOG[#10]] CALL #1 -1 ABS[#5]     ; ❌ Each additional value expression after `CALL` must be enclosed in brackets  
```

---

## **8. Summary of Parsing Rules**  

| **Rule** | **Example** | **Valid?** |  
|------------------|---------------------|---------|  
| A letter must be followed by a value expression | `G[#100]` | ✅ Yes |  
| A letter can be followed by a function call | `G-ABS[-1]` | ✅ Yes |  
| A letter can be followed by a parameter | `G#1` | ✅ Yes |  
| A letter can be followed by a bracketed value expression | `G[1]` | ✅ Yes |  
| A letter can be followed by a **negative number** | `G-1` | ✅ Yes (Valid ALS Formatting, even if LinuxCNC does not support it) |  
| The only special letter is `O` (program flow) | `O500 IF [#10 LT 11]` | ✅ Yes |  
| Unary operators can be stacked at the start of a value expression | `G[#100]X---10` | ✅ Yes |  
| Binary operators must be inside brackets | `X[5 AND 10]` | ✅ Yes |  
| `AND` cannot be used without brackets | `XAND10` | ❌ No |  
| A word must follow a bracketed expression | `G[EXP[2]]X[5]` | ✅ Yes |  
| Two consecutive bracketed expressions are invalid | `G[#<test>+5][5+5]` | ❌ No |  
| Assignments require a value expression on the right-hand side | `#1 = [10 + 5]` | ✅ Yes |  
| Assignments cannot be enclosed in brackets | `[#1 = 10]` | ❌ No |  



