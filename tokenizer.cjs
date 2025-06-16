const TokenType = {
    Number: 'Number',
    Parameter: 'Parameter',
    Word: 'Word',
    Function: 'Function',
    Operator: 'Operator',
    BracketOpen: 'BracketOpen',
    BracketClose: 'BracketClose',
    Assign: 'Assign',
    EOL: 'EOL',
    EOF: 'EOF',
    OpenBracket: 'OpenBracket',
    FlowControl: 'FlowControl',
    LogicalOperator: 'LogicalOperator',
    ComparisonOperator: 'ComparisonOperator',
    Unknown: 'Unknown',
    Comment: 'Comment'
};

const FLOW_CONTROL_KEYWORDS = new Set([
    'IF', 'WHILE', 'SUB', 'ENDSUB', 'ENDWHILE', 'ENDIF',
    'ELSEIF', 'ELSE', 'CALL', 'DO', 'RETURN', 'REPEAT',
    'ENDREPEAT', 'BREAK', 'CONTINUE'
]);

const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'XOR']);
const COMPARISON_OPERATORS = new Set(['LT', 'LE', 'GT', 'GE', 'EQ', 'NE']);
const MULTI_CHAR_OPS = new Set([...LOGICAL_OPERATORS, ...COMPARISON_OPERATORS, '**', 'MOD']);
const FUNCTIONS = new Set([
    'ATAN', 'ABS', 'ACOS', 'ASIN', 'COS', 'EXP',
    'FIX', 'FUP', 'ROUND', 'LN', 'SIN', 'SQRT', 'TAN', 'EXISTS'
]);

const DICTIONARY_TOKENS = new Set([
    ...FLOW_CONTROL_KEYWORDS,
    ...LOGICAL_OPERATORS,
    ...COMPARISON_OPERATORS,
    ...MULTI_CHAR_OPS,
    ...FUNCTIONS
]);

function getTokenType(word) {
    const up = word.toUpperCase();
    if (FUNCTIONS.has(up)) return TokenType.Function;
    if (FLOW_CONTROL_KEYWORDS.has(up)) return TokenType.FlowControl;
    if (LOGICAL_OPERATORS.has(up)) return TokenType.LogicalOperator;
    if (COMPARISON_OPERATORS.has(up)) return TokenType.ComparisonOperator;
    if (MULTI_CHAR_OPS.has(up)) {
        return (up === 'MOD' ? TokenType.Operator : TokenType.ComparisonOperator);
    }
    return TokenType.Word;
}

class Tokenizer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.line = 1;
        this.buffer = [];
        this.pendingTokens = [];

        // Track nested bracket expressions like [ ... ]
        this.expressionLevel = 0;

        // We'll track the most recently returned token type
        this.previousTokenType = null;

        // Not strictly necessary, but preserved from original
        this.lineStartsWithO = false;
    }

    preprocessInput() {
        let cleanedInput = '';
        let inComment = false;

        // First pass: identify whitespace-only lines
        const lines = this.input.split(/\r\n|\r|\n/);
        const whitespaceOnlyLines = new Set();
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (line.length > 0 && /^\s+$/.test(line)) {
                whitespaceOnlyLines.add(lineIndex);
            }
        }

        // Second pass: process character by character, preserving whitespace-only lines
        let currentLine = 0;
        
        for (let i = 0; i < this.input.length; i++) {
            const ch = this.input[i];

            // Track line numbers
            if (ch === '\n' || (ch === '\r' && this.input[i + 1] !== '\n')) {
                currentLine++;
            }

            // Start comment on ';' or '(' (unless "()")
            if (!inComment && (ch === ';' || (ch === '(' && this.input[i + 1] !== ')'))) {
                inComment = true;
            }
            // End comment on newline or '\r' that isn't followed by '\n'
            else if (inComment && (ch === '\n' || (ch === '\r' && this.input[i + 1] !== '\n'))) {
                inComment = false;
            }
            // <-- Add this block to handle closing parenthesis -->
            else if (inComment && ch === ')') {
                inComment = false;
                // We still append the ')' if you want it in the comment text
                cleanedInput += ch;
                continue;
            }

            if (inComment) {
                cleanedInput += ch;
            } else if (ch === '\n' || ch === '\r') {
                cleanedInput += ch;
            } else if (ch === '\t' || ch === ' ') {
                // Preserve whitespace if this is a whitespace-only line
                if (whitespaceOnlyLines.has(currentLine)) {
                    cleanedInput += ch;
                } else {
                    // Otherwise skip whitespace as before
                    continue;
                }
            } else {
                cleanedInput += ch;
            }
        }

        return cleanedInput;
    }


    eof() {
        return this.pos >= this.input.length && this.buffer.length === 0;
    }

    peek(offset = 0) {
        if (offset < this.buffer.length) {
            return this.buffer[offset];
        }
        const inputOffset = offset - this.buffer.length;
        return this.input[this.pos + inputOffset] || '';
    }

    nextChar() {
        if (this.buffer.length > 0) {
            return this.buffer.shift();
        }
        const ch = this.input[this.pos++];
        // Update line # if we see a newline, or a '\r' not followed by '\n'
        if (ch === "\n" || (ch === "\r" && this.peek(1) === "\n")) {
            this.line++;
        }
        return ch;
    }

    createToken(type, value, line) {
        return { type, value, line: line || this.line };
    }

    tryReadEndOfLine() {
        // 1) Windows-style CR+LF
        if (this.peek() === '\r' && this.peek(1) === '\n') {
            this.nextChar(); // consume '\r'
            this.nextChar(); // consume '\n'
            this.lineStartsWithO = (this.peek() === 'o' || this.peek() === 'O');
            return this.createToken(TokenType.EOL, '\r\n');
        }
        // 2) Classic Mac-style CR
        else if (this.peek() === '\r') {
            this.nextChar(); // consume '\r'
            this.lineStartsWithO = (this.peek() === 'o' || this.peek() === 'O');
            return this.createToken(TokenType.EOL, '\r');
        }
        // 3) Unix-style LF
        else if (this.peek() === '\n') {
            this.nextChar(); // consume '\n'
            this.lineStartsWithO = (this.peek() === 'o' || this.peek() === 'O');
            return this.createToken(TokenType.EOL, '\n');
        }

        // If it's none of the above, no EOL token
        return null;
    }


    tryReadComment() {
        // Single-line comment using ';'
        if (this.peek() === ';') {
            let comment = this.nextChar();
            while (!this.eof() && this.peek() !== "\n" && this.peek() !== "\r") {
                comment += this.nextChar();
            }
            return this.createToken(TokenType.Comment, comment);
        }
        // Parenthetical comment: '(' ... ')'
        else if (this.peek() === '(') {
            let comment = this.nextChar();
            let isCommentComplete = false;
            while (!this.eof()) {
                const ch = this.nextChar();
                comment += ch;
                if (ch === ')') {
                    isCommentComplete = true;
                    break; // End of comment reached
                }
                // If end of line is reached without closing parenthesis, it's an unknown comment
                if (this.peek() === '\n' || this.peek() === '\r') {
                    break;
                }
            }
            if (isCommentComplete) {
                return this.createToken(TokenType.Comment, comment);
            }
            // If no closing parenthesis was found before EOL, treat as unknown
            return this.createToken(TokenType.Unknown, comment);
        }
        return null;
    }


    tryReadNumber() {
        if (/[0-9.]/.test(this.peek())) {
            let numStr = "";
            let hasDecimal = false;
            while (!this.eof()) {
                const ch = this.peek();
                if (ch === '.') {
                    if (hasDecimal) break; // If we already have a decimal point, break
                    hasDecimal = true;
                } else if (!/[0-9]/.test(ch)) {
                    break;
                }
                numStr += this.nextChar();
            }
            if (numStr === '.') {  // If the entire number is just a dot
                return this.createToken(TokenType.Unknown, '.');
            }
            return this.createToken(TokenType.Number, numStr);
        }
        return null;
    }

    tryReadParameter() {
        // <...> or #<...> or #NNN style parameters
        if (this.peek() === '<') {
            let param = this.nextChar();
            while (!this.eof() && this.peek() !== '>' && !/\r|\n/.test(this.peek())) {
                param += this.nextChar();
            }
            if (this.peek() === '>') param += this.nextChar();
            return this.createToken(TokenType.Parameter, param);
        } else if (this.peek() === '#') {
            let param = this.nextChar();
            if (this.peek() === '<') {
                param += this.nextChar();
                while (!this.eof() && this.peek() !== '>' && !/\r|\n/.test(this.peek())) {
                    param += this.nextChar();
                }
                if (this.peek() === '>') param += this.nextChar();
            } else {
                while (!this.eof() && /[0-9]/.test(this.peek())) {
                    param += this.nextChar();
                }
            }
            return this.createToken(TokenType.Parameter, param);
        }
        return null;
    }

    tryReadAssignment() {
        if (this.peek() === '=') {
            this.nextChar();
            return this.createToken(TokenType.Assign, '=');
        }
        return null;
    }

    tryStartExpression() {
        if (this.peek() === '[') {
            this.expressionLevel++;
            this.nextChar();
            return this.createToken(TokenType.BracketOpen, '[');
        }
        return null;
    }

    tryEndExpression() {
        if (this.peek() === ']') {
            if (this.expressionLevel > 0) {
                this.expressionLevel--;
                this.nextChar();
                return this.createToken(TokenType.BracketClose, ']');
            }
        }
        return null;
    }

    tryReadOperator() {
        const ch = this.peek();

        // Check for '%' as a Word
        if (ch === '%') {
            this.nextChar();
            return this.createToken(TokenType.Word, '%');
        }

        // Check for '+' or '-'
        if (ch === '+' || ch === '-') {
            this.nextChar();
            return this.createToken(TokenType.Operator, ch);
        }

        // Check for '*'
        if (ch === '*') {
            // If next char is also '*', then it's '**'
            if (this.peek(1) === '*') {
                this.nextChar(); // consume first '*'
                this.nextChar(); // consume second '*'
                return this.createToken(TokenType.Operator, '**');
            }
            // Otherwise just a single '*'
            this.nextChar();
            return this.createToken(TokenType.Operator, '*');
        }

        // Check for '/'
        if (ch === '/') {
            this.nextChar();
            return this.createToken(TokenType.Operator, '/');
        }

        return null; // Not an operator we handle here
    }


    readWordSegment() {
        let segment = "";
        while (!this.eof() && /[A-Za-z$]/.test(this.peek())) {
            segment += this.nextChar();
        }
        return segment;
    }

    segmentWordSegment(segment) {
        if (!segment) return [];

        // Check all possible prefixes from longest to shortest
        for (let len = segment.length; len >= 1; len--) {
            const prefix = segment.substring(0, len);
            const upperPrefix = prefix.toUpperCase();

            if (DICTIONARY_TOKENS.has(upperPrefix)) {
                const tokenType = getTokenType(prefix);
                const token = this.createToken(tokenType, prefix);
                const remaining = segment.substring(len);
                const restTokens = this.segmentWordSegment(remaining);
                return [token, ...restTokens];
            }
        }

        // If no valid prefix found, split into first character and rest
        const firstChar = segment[0];
        const remaining = segment.substring(1);
        const token = this.createToken(TokenType.Word, firstChar);
        const restTokens = this.segmentWordSegment(remaining);
        return [token, ...restTokens];
    }

    /**
     * Refines a single token in-place, handling the "Function" special-case 
     * that might need to be split into (Word + Function).
     */
    refineSingleToken(token) {
        // If it's a function token...
        if (token.type === TokenType.Function) {
            // Are we at the start of the file, or is previous token type not 
            // one of the 'allowed' preceding types?
            const isFirst = (this.previousTokenType === null);
            const notAllowedBefore = ![
                TokenType.Word,
                TokenType.Operator,
                TokenType.BracketOpen,
                TokenType.LogicalOperator,
                TokenType.Assign
            ].includes(this.previousTokenType);

            if (isFirst || notAllowedBefore) {
                // We'll split the function name into firstChar as Word, rest as Function
                const funcValue = token.value;  // e.g. "EXISTS"
                const firstChar = funcValue[0];  // "E"
                const rest = funcValue.slice(1); // "XISTS"

                // If rest is empty or just 1 char, do as you wish—but typically:
                const splitted = [
                    this.createToken(TokenType.Word, firstChar, token.line),
                    this.createToken(TokenType.Function, rest, token.line),
                ];
                return splitted;
            }
        }
        // Otherwise, no refinement
        return [token];
    }

    /**
     * Core: readNextToken() produces exactly one final token each call,
     * applying refinement logic on-the-fly.
     */
    readNextToken() {
        // If we have leftover tokens, use those first
        if (this.pendingTokens.length > 0) {
            const t = this.pendingTokens.shift();
            this.previousTokenType = t.type;
            return t;
        }

        // If input is done, yield EOF
        if (this.eof()) {
            const eofToken = this.createToken(TokenType.EOF, null);
            this.previousTokenType = eofToken.type;
            return eofToken;
        }

        // 1) Attempt to read known token types in the usual order
        let token = this.tryReadEndOfLine();
        if (token) {
            // EOL
            // "Refine" is trivial for EOL, so we skip
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryReadComment();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryReadNumber();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryReadParameter();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryReadAssignment();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryStartExpression();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryEndExpression();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        token = this.tryReadOperator();
        if (token) {
            this.previousTokenType = token.type;
            return token;
        }

        // 2) If none of those matched, read a word segment
        const segment = this.readWordSegment();
        if (segment) {
            // Segment might resolve to multiple tokens (e.g. "ENDWHILE" => [FlowControl], or "EXISTS" => [Function], etc.)
            const segmentedTokens = this.segmentWordSegment(segment);

            // We only refine the first token out of segmentedTokens right now;
            // the rest we push to pendingTokens, where they'll also be refined 
            // before we pop them out in subsequent calls.

            // Take the first token from the segmented list
            let firstSegmentToken = segmentedTokens.shift();

            // Potentially refine that single token
            const refinedArray = this.refineSingleToken(firstSegmentToken);

            // Put any leftover from the refined array and from the remainder of segmentedTokens into pending
            this.pendingTokens.unshift(...segmentedTokens);
            // If the refined array has more than 1 token, we also queue them (except the first).
            if (refinedArray.length > 1) {
                this.pendingTokens.unshift(...refinedArray.slice(1));
            }

            // The final token to return is the first one from refineSingleToken()
            const finalToken = refinedArray[0];
            this.previousTokenType = finalToken.type;
            return finalToken;
        }

        // 3) If we got here, it's an unknown character
        const unknownChar = this.nextChar();
        const unknownToken = this.createToken(TokenType.Unknown, unknownChar);
        this.previousTokenType = unknownToken.type;
        return unknownToken;
    }

    /**
     * The main public method: tokenize the entire input and return the array of tokens.
     */
    tokenize() {
        // Clean input first
        this.input = this.preprocessInput();

        const tokens = [];
        let token = this.readNextToken();
        while (token.type !== TokenType.EOF) {
            tokens.push(token);
            token = this.readNextToken();
        }
        // Push the EOF token as well
        tokens.push(token);

        return tokens;
    }
}

module.exports = { Tokenizer, TokenType };