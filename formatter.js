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
    if (
      current?.type === "Assignment" &&
      next?.type === "Comment"
    ) {
      const assignmentStr = formatAssignment(current, indent);
      out += assignmentStr + " " + next.value;
      i += 2;
    } else {
      out += formatASTToString(current, indent);
      i++;
    }
  }
  return out;
}

function formatFlowBlock(node, indent) {
  let out = formatOHeaderString(node.header, indent);
  if (node.openKeyword.toLowerCase() === "if" && node.body && node.body.length > 0) {
    const firstStmt = node.body[0];
    let firstStr = formatASTToString(firstStmt, 0);
    firstStr = firstStr.trimStart();
    out += " " + firstStr;
    const remainder = node.body.slice(1);
    if (remainder.length > 0) {
      out += formatStatements(remainder, indent + 1);
    }
  } else {
    if (node.body) {
      out += formatStatements(node.body, indent + 1);
    }
  }
  if (node.endHeader) {
    out += formatOHeaderString(node.endHeader, indent);
  }
  return out;
}

function formatOStatement(node, indent) {
  let out = formatOHeaderString(node.header, indent);
  if (node.commands) {
    const cmdStr = formatASTToString(node.commands, 0).trim();
    if (cmdStr) out += " " + cmdStr;
  }
  return out;
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
  const pieces = [];
  pieces.push(indentStr(indent));
  if (header.oToken) {
    pieces.push(header.oToken.value);
    if (header.label) {
      pieces.push(header.label.value);
    }
  } else {
    pieces.push("o");
    if (header.label) pieces.push(header.label.value);
  }
  if (header.keyword) {
    pieces.push(" " + header.keyword.toLowerCase());
  }
  return pieces.join("");
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
