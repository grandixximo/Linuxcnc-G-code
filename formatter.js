const vscode = require('vscode');
const { parseGCode } = require('./parser.cjs');

function formatASTToString(ast, indent = 0) {
  if (Array.isArray(ast)) {
    return formatStatements(ast, indent);
  }
  if (!ast) return "";

  if (ast.type === "UnknownToken") {
    return ast.value;
  }

  switch (ast.type) {
    case "Program":
      return formatStatements(ast.body, indent);
    case "FlowBlock":
      return formatFlowBlock(ast, indent);
    case "OStatement":
      return formatOStatement(ast, indent);
    case "CommandLine":
      return formatCommandLine(ast, indent);
    case "Assignment":
      return formatAssignment(ast, indent);
    case "Comment":
      return indentStr(indent) + ast.value;
    case "EOL":
      return ast.value;
    default:
      return indentStr(indent) + JSON.stringify(ast);
  }
}

function formatStatements(statements, indent) {
  let out = "";
  let i = 0;
  while (i < statements.length) {
    const current = statements[i];
    const next = statements[i + 1];

    // Special case: Assignment immediately followed by a Comment => put them on the same line
    if (current?.type === "Assignment" && next?.type === "Comment") {
      const assignmentStr = formatAssignment(current, indent);
      out += assignmentStr + " " + next.value;
      i += 2;
      continue;
    }

    // Normal case:
    out += formatASTToString(current, indent);
    i++;
  }
  return out;
}

function formatFlowBlock(node, indent) {
  // We only do special logic for "IF" blocks
  const lowerKW = node.openKeyword.toLowerCase();
  const isIfBlock = (lowerKW === "if");

  // Non-IF block or empty body => old/standard approach
  if (!isIfBlock || !node.body || node.body.length === 0) {
    let out = formatOHeaderString(node.header, indent);
    out += formatStatements(node.body || [], indent + 1);
    if (node.endHeader) {
      out += formatOHeaderString(node.endHeader, indent);
    }
    return out;
  }

  // === IF block with special "ELSE" / "ELSEIF" handling ===
  // 1) Print IF and the first statement on the same line
  //    e.g. o<some-label> if [#5399 EQ 2]
  const [firstStmt, ...rest] = node.body;
  let out = "";
  
  // We'll reuse a helper to print "o<lbl> if" plus an optional expression:
  const ifLine = formatOControlLine(node.header, firstStmt, indent);
  out += ifLine;

  // 2) We'll keep collecting statements into "currentBlock" for the THEN portion
  let currentBlock = [];
  let i = 0;

  // Helper to flush the currentBlock at some indent
  function flushBlock(blockIndent) {
    if (currentBlock.length > 0) {
      out += formatStatements(currentBlock, blockIndent);
      currentBlock = [];
    }
  }

  while (i < rest.length) {
    const stmt = rest[i];
    if (stmt.type === "OStatement") {
      // Check if it's else/elseif
      const kw = stmt.header.keyword.toLowerCase();
      if (kw === "else" || kw === "elseif") {
        // Flush the THEN block at indent+1
        flushBlock(indent + 1);

        // Now we want to print the else/elseif line at the same indent
        // BUT if it's an elseif, we might also want to attach an expression
        // (the bracket expression) on the same line.
        //
        // So let's look ahead: if the next statement is a bracket or expression,
        // we tack it onto the "control line" (like elseif [#5399 EQ 2]).
        //
        let maybeExpr = null;
        if (kw === 'elseif' && (i + 1) < rest.length) {
          const nextStmt = rest[i + 1];
          // Adjust the condition below if your parser returns expressions differently
          if (isExpressionLike(nextStmt)) {
            maybeExpr = nextStmt;
            i++; // We'll consume that statement so it doesn't appear in the main body
          }
        }

        // Print the else/elseif line
        out += formatOControlLine(stmt.header, maybeExpr, indent);

        // The block that follows goes to indent+1, until we hit another else/elseif or the end
        i++;
        // We'll gather everything after this line in currentBlock again
        // until next else/elseif or the end.
        continue;
      }
    }
    // If it's not else/elseif, just accumulate it
    currentBlock.push(stmt);
    i++;
  }

  // 3) Flush leftover block (the final THEN or ELSE block) at indent+1
  flushBlock(indent + 1);

  // 4) Print the closing line (o<some-label> endif) aligned with the IF
  if (node.endHeader) {
    out += formatOHeaderString(node.endHeader, indent);
  }
  return out;
}

/**
 * Formats something like o<lbl> if [#5399 EQ 2]
 * or o<lbl> elseif [#5399 EQ 3]
 * or o<lbl> else.
 *
 * @param {object} header - The header from a flow statement: {oToken, label, keyword}
 * @param {object|null} firstExpr - Possibly a bracketed or other expression node
 * @param {number} indent - indentation level
 */
function formatOControlLine(header, firstExpr, indent) {
  let line = indentStr(indent);

  // Build "o<label>"
  // Remove the extra space if you want exactly o<some-label>:
  line += header.oToken.value; // typically "o"
  if (header.label?.value) {
    line += header.label.value; // e.g. "<kins-check-is-2>"
  }

  // Add space + the keyword in lowercase
  // e.g. " if", " else", " elseif"
  line += " " + header.keyword.toLowerCase();

  // If there's an expression (like [#5399 EQ 2]), append it on same line
  if (firstExpr) {
    let exprStr = formatASTToString(firstExpr, 0).trimStart();
    if (exprStr.length > 0) {
      line += " " + exprStr;
    }
  }

  return line; // no trailing newline
}

/**
 * Quick helper to decide if a statement is basically an expression we want on the elseif line.
 * Adjust the type checks to match however your AST is shaped.
 */
function isExpressionLike(stmt) {
  return (
    stmt.type === "BracketedExpression" ||
    stmt.type === "BinaryExpression" ||
    stmt.type === "UnaryExpression" ||
    // etc. whatever else your parser might produce
    false
  );
}

// ------------------------------------------------------------------
// OSTATEMENT FORMATTING LOGIC
// ------------------------------------------------------------------
function formatOStatement(node, indent) {
  // If it’s an IF/ELSEIF/ELSE/ENDIF, we might want to indent a block of statements
  // until the matching else/endif. But that requires scanning forward. 
  // For simplicity, we handle it inline here.

  const { oToken, label, keyword, condition } = node.header;
  const lowerKW = keyword.toLowerCase();

  // Build line: e.g. "o<someLabel> if [#5399 EQ 2]"
  let line = indentStr(indent) + oToken.value; // "o"
  if (label?.value) {
    line += label.value;                       // "<someLabel>"
  }
  line += " " + lowerKW;                       // " if" / " else" / " elseif" / etc.
  if (condition) {
    // Condition is typically a bracketed expression if it's an IF/ELSEIF
    line += " " + formatExpressionString(condition);
  }

  // If it's not IF/ELSEIF/ELSE, or if it’s a single-line statement like "o<lbl> call",
  // we might have commands (like parameters after the statement).
  let out = line;
  
  // If we have commands, add them to the same line:
  if (node.commands && node.commands.commands.length > 0) {
    const cmdStr = formatCommandLine(node.commands, 0).trim();
    if (cmdStr) out += " " + cmdStr;
  }

  // If this OStatement is an `if` (or `elseif`, or `else`), 
  // we want to indent subsequent statements (the "body") 
  // until we see `elseif/else/endif` *for the same label* or we run out of statements.
  if (["if", "elseif", "else"].includes(lowerKW)) {
    // Find the sub-statements that belong to this block
    // i.e., everything until the next OStatement that has the same label 
    // and a keyword in {elseif, else, endif}, or until we run out.

    out += formatBlockBody(node, indent + 1);
  }

  return out;
}

function formatBlockBody(node, indent) {
  const statements = findSiblingStatements(node); 
  // `findSiblingStatements` is a concept: you can keep track of the "global" array 
  // from your parse tree, see what statements come after this node, etc.

  let out = "";
  for (const stmt of statements) {
    out += formatASTToString(stmt, indent);
  }
  return out;
}

function findSiblingStatements(node) {
  // In a real formatter, you'd have the entire array of statements and the index 
  // where `node` appears. Then you'd gather subsequent lines until the next 
  // "o<sameLabel> elseif/else/endif" or the end of file. 
  // 
  // For now, return an empty array so we do no further indentation.
  return [];
}

function formatCommandLine(node, indent) {
  let out = indentStr(indent);
  const parts = node.commands.map(cmd => formatCommandElement(cmd));
  out += parts.join(" ");
  return out;
}

function formatAssignment(node, indent) {
  let out = indentStr(indent);
  out += node.target + " = " + formatExpressionString(node.value);
  return out;
}

function formatCommandElement(cmd) {
  switch (cmd.type) {
    case "WordExpression": {
      const valStr = cmd.value ? formatExpressionString(cmd.value) : "";
      return cmd.word + valStr;
    }
    case "BracketedExpression":
      return "[" + formatExpressionString(cmd.value) + "]";
    case "Comment":
      return cmd.value;
    case "UnknownToken":
      return cmd.value;
    default:
      return JSON.stringify(cmd);
  }
}

function formatOHeaderString(header, indent) {
  let line = indentStr(indent);
  // header.oToken.value is usually "o"
  line += header.oToken.value;   
  if (header.label?.value) {
    line += header.label.value;  // no extra space => "o<my-label>"
  }
  line += " " + header.keyword.toLowerCase();
  return line;
}

function formatExpressionString(expr) {
  if (!expr) return "";
  switch (expr.type) {
    case "Number":
      return expr.value;
    case "Parameter":
      return expr.value;
    case "UnaryExpression":
      return expr.operator + formatExpressionString(expr.argument);
    case "BinaryExpression":
      return (
        formatExpressionString(expr.left) +
        " " + expr.operator + " " +
        formatExpressionString(expr.right)
      );
    case "BracketedExpression":
      return "[" + formatExpressionString(expr.value) + "]";
    case "WordExpression":
      return expr.word + (expr.value ? formatExpressionString(expr.value) : "");
    case "FunctionCall":
      return expr.name + formatExpressionString(expr.argument);
    default:
      return JSON.stringify(expr);
  }
}

function indentStr(indent) {
  return "  ".repeat(indent);
}

function activate(context) {
  const provider = vscode.languages.registerDocumentFormattingEditProvider('gcode', {
    provideDocumentFormattingEdits(document) {
      const source = document.getText();
      const ast = parseGCode(source);
      const formatted = formatASTToString(ast);
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(source.length)
      );
      return [vscode.TextEdit.replace(fullRange, formatted)];
    }
  });
  context.subscriptions.push(provider);
}

function deactivate() { }

module.exports = { activate, deactivate };
