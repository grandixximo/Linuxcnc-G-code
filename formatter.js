let vscode;
try {
  vscode = require('vscode');
} catch (e) {
  // Not running in VS Code, ignore
}
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

    const isCommentable =
      current?.type === "Assignment" ||
      current?.type === "OStatement" ||
      current?.type === "FlowBlock" ||
      current?.type === "CommandLine";

    // Special case: a statement immediately followed by a Comment => put them on the same line
    if (isCommentable && next?.type === "Comment") {
      const statementStr = formatASTToString(current, indent).trimEnd();
      out += statementStr + " " + next.value;
      i += 2; // Consume both statement and comment
      continue;
    }

    // Normal case:
    out += formatASTToString(current, indent);
    i++;
  }
  return out;
}

function formatFlowBlock(node, indent) {
  const lowerKW = node.openKeyword.toLowerCase();
  const isIfBlock = (lowerKW === "if");

  if (!isIfBlock) {
    let out = formatOHeaderString(node.header, indent);
    out += formatStatements(node.body || [], indent + 1);
    if (node.endHeader) {
      out += formatOHeaderString(node.endHeader, indent);
    }
    return out;
  }

  // === IF block with special "ELSE" / "ELSEIF" handling ===
  // 1) Print IF and the condition on the same line
  let out = "";
  const ifLine = formatOControlLine(node.header, node.header.condition, indent);
  out += ifLine;

  const body = [...(node.body || [])];

  // If the first statement in the body is a comment, it's likely an inline comment for the 'if' line
  if (body.length > 0 && body[0].type === 'Comment') {
    const comment = body.shift(); // Remove comment from body
    out += " " + comment.value.trim();
  }

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

  while (i < body.length) {
    const stmt = body[i];
    if (stmt.type === "OStatement") {
      const kw = stmt.header.keyword.toLowerCase();
      if (kw === "else" || kw === "elseif") {
        flushBlock(indent + 1);
        out += formatOControlLine(stmt.header, stmt.header.condition, indent);
        
        if (stmt.commands && stmt.commands.commands.length > 0) {
            const cmdStr = formatCommandLine(stmt.commands, 0).trim();
            if (cmdStr.length > 0) {
                out += " " + cmdStr;
            }
        }

        i++;
        continue;
      }
    }
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
    let exprStr = formatExpressionString(firstExpr).trimStart();
    if (exprStr.length > 0) {
      line += " " + exprStr;
    }
  }

  return line; // no trailing newline
}

// ------------------------------------------------------------------
// OSTATEMENT FORMATTING LOGIC
// ------------------------------------------------------------------
function formatOStatement(node, indent) {
  // If it's an IF/ELSEIF/ELSE/ENDIF, we might want to indent a block of statements
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

  // If it's not IF/ELSEIF/ELSE, or if it's a single-line statement like "o<lbl> call",
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
  let line = indentStr(indent) + header.oToken.value;
  if (header.label?.value) {
    line += header.label.value;
  }
  line += " " + header.keyword.toLowerCase();
  if (header.condition) {
    line += " " + formatExpressionString(header.condition);
  }
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

if (vscode) {
  function activate(context) {
    const provider = vscode.languages.registerDocumentFormattingEditProvider('gcode', {
      provideDocumentFormattingEdits(document) {
        const source = document.getText();
        // Pass VSCode document to parser for efficient line count
        const ast = parseGCode(source, { vscodeDocument: document });
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
  module.exports = { activate, deactivate, formatASTToString };
} else {
  module.exports = { formatASTToString };
}
