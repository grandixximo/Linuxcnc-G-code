const { Tokenizer, TokenType } = require("./tokenizer.cjs");

// Map from opening keywords -> corresponding closing keywords
const FLOW_CONTROL_PAIRS = {
  DO: "WHILE",
  WHILE: "ENDWHILE",
  IF: "ENDIF",
  SUB: "ENDSUB",
  REPEAT: "ENDREPEAT"
};

const PRECEDENCE = {
  OR: 1, XOR: 1, AND: 2,
  LT: 4, LE: 4, EQ: 4, NE: 4, GT: 4, GE: 4,
  '+': 5, '-': 5, '*': 6, '/': 6, MOD: 6,
  '**': 7, unary: 8
};

// Any recognized flow-keyword, both openers and closers:
const FLOW_KEYWORDS = new Set([
  ...Object.keys(FLOW_CONTROL_PAIRS),        // e.g. "IF", "SUB", "DO", etc.
  ...Object.values(FLOW_CONTROL_PAIRS),      // e.g. "ENDIF", "ENDSUB", ...
  "CALL", "CONTINUE", "BREAK", "RETURN", "%"
]);

class Parser {
  constructor(inputOrTokenizer) {
    this.initTokenizer(inputOrTokenizer);
    this.pos = 0;
    this.errors = [];
    this.MAX_ITERATIONS = 10000;
  }

  initTokenizer(inputOrTokenizer) {
    if (typeof inputOrTokenizer === "string") {
      this.tokens = new Tokenizer(inputOrTokenizer).tokenize();
    } else {
      this.tokens = inputOrTokenizer.tokenize();
    }
  }

  // Peek a token at offset, or null if out of range
  peekToken(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  // Advance and return the current token
  nextToken() {
    return this.tokens[this.pos++];
  }

  // Consume and verify the expected type/value
  consumeExpected(type, value = null) {
    const tk = this.peekToken();
    if (tk?.type === type && (value === null || tk.value === value)) {
      return this.nextToken();
    }
    this.errors.push(
      `Expected ${type}${value ? ` '${value}'` : ''}, got ${tk ? `${tk.type} '${tk.value}'` : 'EOF'
      }`
    );
    return null;
  }

  // Main entry point to parse entire code
  parse() {
    const body = this.parseStatements();
    return { type: "Program", body, errors: this.errors };
  }

  // Parse statements until EOF or no more tokens
  parseStatements() {
    const statements = [];
    while (
      this.iterationSafe(() => {
        if (!this.peekToken() || this.peekToken().type === TokenType.EOF) {
          return false;
        }
        statements.push(this.parseStatement());
        return true;
      })
    );
    return statements;
  }

  // Method to handle concatenating unknown tokens until EOL or EOF
  concatenateUnknownTokens() {
    const tk = this.peekToken();
    let concatenatedValue = tk.value; // Start with the value of the current token
    this.nextToken(); // Consume the current token (first token)

    // Concatenate all tokens until EOL or EOF
    while (this.peekToken()?.type !== TokenType.EOL && this.peekToken()?.type !== TokenType.EOF) {
      const nextToken = this.nextToken();
      concatenatedValue += nextToken.value; // Concatenate the value of the next token
    }

    // Stack an error similar to other UnknownTokens
    this.errors.push(`Unexpected token sequence at line ${tk.line}: '${concatenatedValue}'`);

    // Create and return the UnknownToken directly without nesting in UnknownTokens
    const unknownToken = {
      type: "UnknownToken",
      value: concatenatedValue,  // Concatenated string of token values
      line: tk.line             // Line number for the token
    };

    // Return the UnknownToken directly (no nested structure)
    return unknownToken;
  }

  parseStatement() {
    const tk = this.peekToken();
    if (!tk) return null;

    // Debugging: Log current token

    // Check for 'Unknown' token types that fall through normal checks
    if (tk.type === TokenType.Unknown || tk.type === TokenType.Operator || tk.type === TokenType.ComparisonOperator) {
      return this.concatenateUnknownTokens(); // Call the helper method to handle the unknown token
    }

    if (tk.value === "%") {
      // Handle % symbol (e.g., return or break behavior)
      this.nextToken(); // Consume the % token
      return { type: "Word", value: "%" }; // Return a flow control token for %
    }

    // Otherwise handle known statement types

    // 1. Blank line / EOL
    if (tk.type === TokenType.EOL) {
      const consumed = this.nextToken();
      return { type: "EOL", value: consumed.value };
    }

    // 2. Comment
    if (tk.type === TokenType.Comment) {
      const consumed = this.nextToken();
      return { type: "Comment", value: consumed.value };
    }

    // 3. Assignment? (like #100 = 5)
    if (this.isAssignmentStart()) {
      return this.parseAssignment();
    }

    // 4. O-Statements? (like `o <label> if`, `o <label> sub`, etc.)
    if (this.isOStatementStart()) {
      return this.parseOFlowStatement();
    }

    // 5. Otherwise parse a line of commands (G/M codes, etc.)
    const commandLine = this.parseCommandLine();

    // If no command was parsed or there's an unprocessed unknown token, handle it here
    if (!commandLine || commandLine.commands.length === 0) {
      return this.concatenateUnknownTokens(); // Concatenate any unknown tokens
    }

    return commandLine;
  }

  // Detect #var =, <param> =, etc.
  isAssignmentStart() {
    return (
      this.peekToken()?.type === TokenType.Parameter &&
      this.peekToken(1)?.type === TokenType.Assign
    );
  }

  // #var = something
  parseAssignment() {
    const target = this.nextToken().value;  // Parameter token
    this.consumeExpected(TokenType.Assign, "=");
    return {
      type: "Assignment",
      target,
      value: this.parseValueExpression()
    };
  }

  // Detect e.g. `o <label>`
  isOStatementStart() {
    const tk = this.peekToken();
    return tk?.type === TokenType.Word && tk.value.toLowerCase() === "o";
  }

  // Parse e.g. `o <my-label> sub ...`
  parseOFlowStatement() {
    // 1. consume 'o'
    const oToken = this.nextToken();
    // 2. parse the label expression
    const label = this.parseValueExpression();
    // 3. see if next token is recognized flow-control
    const keywordToken = this.peekToken();
    if (!keywordToken || keywordToken.type !== TokenType.FlowControl) {
      // Not recognized => treat it as an OStatement with empty keyword
      return this.createOStatement(oToken, label, "", this.parseCommandLine());
    }
    // 4. read the flow-control keyword
    const originalKeyword = this.nextToken().value;  
    const upperKeyword = originalKeyword.toUpperCase();
  
    // If it's a "block" style flow keyword (IF, WHILE, SUB, etc.):
    if (FLOW_CONTROL_PAIRS[upperKeyword]) {
      // e.g. `IF => ENDIF`
      return this.parseFlowBlock(oToken, label, upperKeyword, originalKeyword);
    }
  
    // ELSEIF is a bit special: either handle it in parseFlowBlock 
    // or do something custom. E.g. treat it like "IF" internally:
    if (upperKeyword === "ELSEIF") {
      // parse a bracketed expression if present
      let condition = null;
      if (this.peekToken()?.type === TokenType.BracketOpen) {
        condition = this.parseBracketedExpression();
      }
      // For simplicity, treat ELSEIF as an OStatement for now,
      // or also feed it into parseFlowBlock if you want nested behavior.
      return this.createOStatement(oToken, label, originalKeyword, null, condition);
    }
  
    // For other flow controls (like "RETURN", "CALL", etc.), 
    // just parse it as an OStatement with a possible command line
    return this.createOStatement(oToken, label, originalKeyword, this.parseCommandLine());
  }

  // parse e.g. `o <label> if ... o <label> endif`
  parseFlowBlock(oToken, label, openKeyword, originalKeyword) {
    const block = {
      type: "FlowBlock",
      openKeyword: originalKeyword, 
      header: { oToken, label, keyword: originalKeyword },
      body: [],
      endHeader: null
    };
  
    // Keep collecting statements until we find the matching close
    this.iterationSafe(() => {
      const closeKeyword = FLOW_CONTROL_PAIRS[openKeyword]; 
      if (this.isClosingStatement(label, closeKeyword)) {
        block.endHeader = this.parseClosingHeader();
        return false; 
      }
      block.body.push(this.parseStatement());
      return true;
    });
  
    return block;
  }

  // e.g. detect `o <same-label> endif`
  isClosingStatement(expectedLabel, closeKeyword) {
    const position = this.pos;
    try {
      // Must be `o <label> closeKeyword`
      const tk = this.peekToken();
      if (!tk || tk.value?.toLowerCase() !== "o") {
        return false;
      }
      this.nextToken(); // consume 'o'

      // parse next as a label expression
      const labelNode = this.parseValueExpression();

      // see if next is the flow-control token we want
      const nextT = this.peekToken();
      if (!nextT || nextT.type !== TokenType.FlowControl) {
        return false;
      }
      const possibleClose = nextT.value.toUpperCase();

      // We confirm both the label and the close-keyword
      return (
        possibleClose === closeKeyword &&
        this.labelsMatch(expectedLabel, labelNode)
      );
    } finally {
      // revert position if not actually a close
      this.pos = position;
    }
  }

  // Actually consume `o <label> endif` tokens for the final AST node
  parseClosingHeader() {
    const oToken = this.nextToken(); // 'o'
    const label = this.parseValueExpression();
    const keywordToken = this.nextToken(); // e.g. 'endif'
    return {
      oToken,
      label,
      keyword: keywordToken.value // keep original user case
    };
  }

  // Decide if two labels match ignoring case
  labelsMatch(a, b) {
    return this.canonicalize(a).toLowerCase() === this.canonicalize(b).toLowerCase();
  }

  // Return a string representation (for label comparison)
  canonicalize(node) {
    if (!node) return "";
    switch (node.type) {
      case "Number":
      case "Parameter":
      case "Word":
        return node.value; // we only convert toLowerCase() in labelsMatch
      case "BracketedExpression":
        return `[${this.canonicalize(node.value)}]`;
      case "BinaryExpression":
        return `(${this.canonicalize(node.left)}${node.operator}${this.canonicalize(node.right)})`;
      case "UnaryExpression":
        return `${node.operator}${this.canonicalize(node.argument)}`;
      default:
        return "";
    }
  }

  // Parse a command line: e.g. `G1 X10 Y20`, or `M66P91L0`
  parseCommandLine() {
    const commands = [];
    this.iterationSafe(() => {
      const tk = this.peekToken();
      if (!tk || this.isCommandTerminator(tk)) {
        return false;
      }
      if (tk.type === TokenType.Comment) {
        commands.push({ type: "Comment", value: this.nextToken().value });
        return true;
      }
      commands.push(this.parseCommandElement());
      return true;
    });
    return { type: "CommandLine", commands };
  }

  // Decide if we should stop reading the command line
  isCommandTerminator(tk) {
    return (
      tk.type === TokenType.EOF ||
      tk.type === TokenType.EOL ||
      (tk.type === TokenType.Word && tk.value.toLowerCase() === "o") ||
      (tk.type === TokenType.FlowControl && FLOW_KEYWORDS.has(tk.value.toUpperCase())) ||
      this.isAssignmentStart()
    );
  }

  parseCommandElement() {
    const tk = this.peekToken();
    if (!tk) {
      this.errors.push("Unexpected end of tokens in parseCommandElement");
      return null;
    }

    if (tk.type === TokenType.Word) {
      return this.parseWordWithValue();
    }

    if (tk.type === TokenType.BracketOpen) {
      return this.parseBracketedExpression();
    }

    if (tk.type === TokenType.Function) {
      return this.parseFunctionCall();
    }

    // If the token doesn't match any of the expected types, we treat it as an unknown token.
    this.errors.push(`Unexpected token in command: ${tk.type} '${tk.value}' at line ${tk.line}`);

    // Call concatenateUnknownTokens to handle concatenating unknown tokens until EOL or EOF.
    return this.concatenateUnknownTokens(); // Handle unknown tokens properly
  }


  // e.g. parse `M66 P91 L0` => each "Word" (M66) might have a numeric value (P91 might have numeric value after)
  parseWordWithValue() {
    // Keep original case in the AST:
    const word = this.nextToken().value;
    // If next token looks like a value expression, parse it
    const value = this.isValueExpressionStart() ? this.parseValueExpression() : null;
    return { type: "WordExpression", word, value };
  }

  // Detect if next tokens start a number/parameter/expression
  isValueExpressionStart() {
    const tk = this.peekToken();
    return (
      tk?.type === TokenType.Number ||
      tk?.type === TokenType.Parameter ||
      tk?.type === TokenType.BracketOpen ||
      tk?.type === TokenType.Function ||
      (tk?.type === TokenType.Operator && "+-".includes(tk.value))
    );
  }

  // Parse a mathematical/logical expression with correct precedence
  parseValueExpression() {
    return this.parseBinaryExpression(this.parseUnary(), 0);
  }

  // e.g. unary operators: +1, -5
  parseUnary() {
    const operators = [];
    // gather all leading + or - (multiple in a row: '---5' => unary expression)
    while ("+-".includes(this.peekToken()?.value)) {
      operators.push(this.nextToken().value);
    }
    let expr = this.parsePrimary();
    // then wrap them inside nested unary expressions from right to left
    while (operators.length) {
      expr = {
        type: "UnaryExpression",
        operator: operators.pop(),
        argument: expr
      };
    }
    return expr;
  }

  // Parse binary expression with the given minimum precedence
  parseBinaryExpression(left, minPrec) {
    while (true) {
      const operatorToken = this.peekToken();
      if (!this.isValidOperator(operatorToken, minPrec)) break;
      const operator = this.nextToken().value; // e.g. EQ, +, -, etc.
      let right = this.parseUnary();
      right = this.handleHigherPrecedence(right, this.getPrecedence(operator));
      left = { type: "BinaryExpression", operator, left, right };
    }
    return left;
  }

  // Is the next token an operator with precedence >= minPrec?
  isValidOperator(tk, minPrec) {
    return tk && this.isOperatorToken(tk) && this.getPrecedence(tk.value) >= minPrec;
  }

  // If the next operator has higher precedence, parse it first
  handleHigherPrecedence(right, currentPrec) {
    while (true) {
      const nextOp = this.peekToken();
      if (!nextOp || !this.isOperatorToken(nextOp)) break;
      const nextPrec = this.getPrecedence(nextOp.value);
      if (nextPrec <= currentPrec) break;
      right = this.parseBinaryExpression(right, nextPrec);
    }
    return right;
  }

  // Return the precedence of an operator or 0 if unknown
  getPrecedence(operator) {
    return PRECEDENCE[operator] || 0;
  }

  // Parse a single primary expression: number, parameter, bracketed expr, function call, or lone word
  parsePrimary() {
    const tk = this.peekToken();
    if (!tk) return null;
    switch (tk.type) {
      case TokenType.Number:
      case TokenType.Parameter:
        return this.nextToken();
      case TokenType.BracketOpen:
        return this.parseBracketedExpression();
      case TokenType.Function:
        return this.parseFunctionCall();
      case TokenType.Word:
        // e.g. a bare word like `G1` or something
        return { type: "Word", value: this.nextToken().value };
      default:
        this.errors.push(
          `Unexpected primary expression Line: ${tk.line} token: ${tk.type}`
        );
        return null;
    }
  }

  // e.g. parse `[ #5399 EQ -1 ]`
  parseBracketedExpression() {
    this.consumeExpected(TokenType.BracketOpen, "[");
    const value = this.parseValueExpression();
    this.consumeExpected(TokenType.BracketClose, "]");
    return { type: "BracketedExpression", value };
  }

  // e.g. parse a function call like `SIN[90]`
  parseFunctionCall() {
    const fnToken = this.consumeExpected(TokenType.Function);
    const name = fnToken?.value || "";
    let argument = null;
    if (this.peekToken()?.type === TokenType.BracketOpen) {
      argument = this.parseBracketedExpression();
    }
    return { type: "FunctionCall", name, argument };
  }

  // Is this token an operator?
  isOperatorToken(tk) {
    return [
      TokenType.Operator,
      TokenType.ComparisonOperator,
      TokenType.LogicalOperator
    ].includes(tk?.type);
  }

  // Safely iterate parsing logic to avoid infinite loops
  iterationSafe(callback) {
    for (let i = 0; i < this.MAX_ITERATIONS; i++) {
      const beforePos = this.pos;
      const shouldContinue = callback();
      if (!shouldContinue) {
        return false;
      }
      if (this.pos === beforePos) {
        this.errors.push(
          `Parser stuck at position ${this.pos}; no tokens consumed this iteration.`
        );
        return false;
      }
    }
    this.errors.push("Max iterations exceeded");
    return false;
  }

  // Build an OStatement node, e.g. `o <my-label> RETURN`
  createOStatement(oToken, label, keyword, commands, condition = null) {
    return {
      type: "OStatement",
      header: { oToken, label, keyword, condition },
      commands: commands || { type: "CommandLine", commands: [] }
    };
  }  
}

// Helper function for external usage
function parseGCode(input) {
  const parser = new Parser(input);
  const resultAst = parser.parse();

  // Debug: Print the entire AST
  console.log("=== DEBUG AST ===");
  console.log(JSON.stringify(resultAst, null, 2));

  return resultAst;
}

module.exports = { Parser, parseGCode };