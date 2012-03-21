var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        var y = cwd || '.';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/parser.js", function (require, module, exports, __dirname, __filename) {
(function(){
  var Lexer, NodeComment, NodeList, NodePrint, default_nodes, tk_tag_open, tk_tag_open_spc, tk_tag_close, tk_tag_close_spc, tk_tag_single, tk_comment_open, tk_comment_open_spc, tk_comment_close, tk_comment_close_spc, tk_comment_single, tk_print_open, tk_print_close, tk_new_line, default_tokens, Parser, _ref, _tag_search;
  Lexer = require('./lexer').Lexer;
  _ref = require('./nodes'), NodeComment = _ref.NodeComment, NodeList = _ref.NodeList, NodePrint = _ref.NodePrint, default_nodes = _ref.default_nodes;
  tk_tag_open = "{%";
  tk_tag_open_spc = "{%-";
  tk_tag_close = "%}";
  tk_tag_close_spc = "-%}";
  tk_tag_single = "%";
  tk_comment_open = "{#";
  tk_comment_open_spc = "{#-";
  tk_comment_close = "#}";
  tk_comment_close_spc = "-#}";
  tk_comment_single = "#";
  tk_print_open = "{{";
  tk_print_close = "}}";
  tk_new_line = "\n";
  default_tokens = [tk_tag_open, tk_tag_open_spc, tk_tag_close, tk_tag_close_spc, tk_comment_open, tk_comment_open_spc, tk_comment_close, tk_comment_close_spc, tk_print_open, tk_print_close, tk_new_line];
  /**
   *  @param str A string
   *  @returns    A trimmed string, without leading nor ending spaces.
   */
  function trim(str){
    if (str === null) {
      return null;
    }
    return str.replace(/^\s+/g, '').replace(/\s+$/g, '');
  }
  _tag_search = /\s*([a-zA-Z][-a-zA-Z0-9_]*)\s+((.|\n)*)/m;
  /**
   *  @param stmt The contents between {% and %}
   *  @returns    An object containing the tag portion and the contents.
   */
  function parse_tag(stmt){
    var m, _ref;
    m = _tag_search.exec(stmt);
    return [m[1], (_ref = m[2]) != null ? _ref : ""];
  }
  function remove_spaces(str){
    var i, _ref;
    i = 0;
    while ((_ref = str[i]) === ' ' || _ref === "\t") {
      i += 1;
    }
    return [str.substr(0, i), str.substr(i)];
  }
  /**
   *  The parser is used to build a node tree : this node tree will present a compile () method
   *  that generates javascript code ready to be compiled.
   */
  Parser = (function(){
    Parser.displayName = 'Parser';
    var prototype = Parser.prototype, constructor = Parser;
    function Parser(specs){
      var _ref;
      specs == null && (specs = {});
      this.nodes = (_ref = specs.nodes) != null ? _ref : default_nodes;
      this.lexer = new Lexer({
        tokens: default_tokens
      });
      this.root = NodeList();
      this.trim_blocks = (_ref = specs.trim_blocks) != null ? _ref : true;
      this._discard_next_space = false;
      this._discard_next_newline = false;
      this._cached_next = null;
    }
    prototype._nextToken = (function(){
      function _nextToken(){
        var acc, spaces, tok, _ref;
        if (this._cached_next != null) {
          this.current_token = this._cached_next;
          this._cached_next = null;
          return;
        }
        acc = '';
        do {
          this.current_token = this.lexer.next();
          if (this.current_token === tk_new_line) {
            acc += this.current_token;
            this.current_token = '';
          } else if (this.current_token != null) {
            _ref = remove_spaces(this.current_token), spaces = _ref[0], tok = _ref[1];
            acc += spaces;
            this.current_token = tok;
          }
        } while (this.current_token === '' && this.current_token !== null);
        if (acc === '' && this.current_token === null) {
          return;
        }
        if (this._discard_next_space || ((_ref = this.current_token) === tk_tag_open_spc || _ref === tk_comment_open_spc)) {
          this._discard_next_space = false;
          return;
        }
        if ((_ref = this.current_token) === tk_comment_close_spc || _ref === tk_tag_close_spc) {
          this._discard_next_space = true;
        }
        if (acc) {
          this._cached_next = this.current_token;
          return this.current_token = acc;
        }
      }
      return _nextToken;
    }());
    prototype.nextToken = (function(){
      function nextToken(){
        var i, _ref, _to, _ref2;
        this._nextToken();
        if (this.current_token == null) {
          return;
        }
        _ref = this.current_token;
        if (this._discard_next_newline) {
          for (i = 0, _to = _ref.length - 1; i <= _to; ++i) {
            if (_ref[i] == '\n') {
              this.current_token = _ref.substr(i + 1);
              break;
            }
          }
          if (!this.current_token) {
            this.nextToken();
            return;
          }
          this._discard_next_newline = false;
        }
        if (this.trim_blocks && ((_ref2 = this.current_token) === tk_comment_close || _ref2 === tk_tag_close)) {
          return this._discard_next_newline = true;
        }
      }
      return nextToken;
    }());
    /**
     *  Parse comments in the input.
     *  @return nothing ! We ditch everything inside.
     */
    prototype.parseComment = (function(){
      function parseComment(){
        var balance, comment;
        balance = 1;
        comment = "";
        do {
          this.nextToken();
          if (this.current_token == tk_comment_close || this.current_token == tk_comment_close_spc) {
            balance -= 1;
            continue;
          }
          if (this.current_token == tk_comment_open || this.current_token == tk_comment_open_spc) {
            balance += 1;
            continue;
          }
          comment += this.current_token;
        } while (this.current_token != null && balance > 0);
        if (balance != 0) {
          throw new Error("Unclosed Comment at line " + _lexer.lineno);
        }
      }
      return parseComment;
    }());
    /**
     *  Parse a print statement. Usually delimited by {{ and }}
     *  The insides of the print statement are in turn parsed to escape
     *  variables and filters with the ctx. and env.filters. prefix respectively.
     *
     *  @return a PrintNode
     */
    prototype.parsePrintStatement = (function(){
      function parsePrintStatement(){
        var statement;
        statement = "";
        do {
          this.current_token = this.lexer.next();
          if (this.current_token && this.current_token != tk_print_close) {
            statement += this.current_token;
          }
        } while (this.current_token != null && this.current_token != tk_print_close);
        if (this.current_token === null) {
          throw new Error("Waiting for '" + tk_print_close + "' at line " + this.lexer.lineno);
        }
        return new NodePrint({
          contents: trim(statement)
        });
      }
      return parsePrintStatement;
    }());
    /**
     *
     */
    prototype.parseTag = (function(){
      function parseTag(waiting_for){
        var tag_contents, name, contents, stop_clause, until_clause, inside_clause, child_node, tag, inside_name, inside_contents, inside_cls, inside_tag, _ref;
        tag_contents = "";
        this.nextToken();
        while (this.current_token != null && this.current_token != tk_tag_close && this.current_token != tk_tag_close_spc) {
          tag_contents += this.current_token;
          this.nextToken();
        }
        if (this.current_token === null) {
          throw new Error("Waiting for '" + tk_tag_close + "' on line " + this.lexer.lineno);
        }
        _ref = parse_tag(tag_contents), name = _ref[0], contents = _ref[1];
        if (name in waiting_for) {
          this.last_tag = [name, contents];
          return;
        }
        if (!this.nodes[name]) {
          throw new Error("Unexpected tag : '" + name + "' at line " + this.lexer.lineno);
        }
        stop_clause = {};
        until_clause = this.nodes[name]['until'];
        stop_clause[until_clause] = true;
        inside_clause = this.nodes[name]['inside'];
        __import(stop_clause, inside_clause);
        if (until_clause == "__endfile__") {
          child_node = this.parseLevel();
        } else if (until_clause) {
          child_node = this.parseLevel(stop_clause);
        }
        tag = new this.nodes[name]({
          name: trim(name),
          contents: trim(contents),
          child_node: child_node
        });
        if (!until_clause) {
          return tag;
        }
        while (this.last_tag != null && this.last_tag[0] != until_clause) {
          _ref = [this.last_tag[0], this.last_tag[1]], inside_name = _ref[0], inside_contents = _ref[1];
          inside_cls = this.nodes[name].inside[inside_name];
          inside_clause = inside_cls['inside'];
          stop_clause = (_ref = __import((_ref = {}, _ref[until_clause + ""] = true, _ref), inside_clause)) != null
            ? _ref
            : {};
          inside_tag = this.parseLevel(stop_clause);
          tag.push(new inside_cls({
            name: inside_name,
            contents: inside_contents,
            child_node: inside_tag
          }));
        }
        return tag;
      }
      return parseTag;
    }());
    /**
     *  Parse the input file.
     *  @return the root NodeList
     */
    prototype.parseLevel = (function(){
      function parseLevel(waiting_for){
        var result, tag;
        waiting_for == null && (waiting_for = {});
        if (waiting_for != null && !typeof waiting_for == 'object') {
          waiting_for = {
            waiting_for: true
          };
        }
        result = new NodeList();
        for (;;) {
          this.nextToken();
          if (!this.current_token) {
            break;
          }
          if (this.current_token == tk_tag_open || this.current_token == tk_tag_open_spc) {
            tag = this.parseTag(waiting_for);
            if (!tag) {
              return result;
            }
            result.push(tag);
            continue;
          }
          if (this.current_token == tk_print_open) {
            result.push(this.parsePrintStatement());
            continue;
          }
          if (this.current_token == tk_comment_open || this.current_token == tk_comment_open_spc) {
            result.push(this.parseComment());
            continue;
          }
          result.push(this.current_token);
        }
        return result;
      }
      return parseLevel;
    }());
    /**
     *  Holder function for _parse_global
     *  @return _parse_global's result
     */
    prototype.parse = (function(){
      function parse(str){
        this.lexer.feed(str);
        this.current = this.root;
        this.current_token = "";
        return this.parseLevel();
      }
      return parse;
    }());
    return Parser;
  }());
  exports.Parser = Parser;
  exports.default_tokens = default_tokens;
  function __import(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);

});

require.define("/lexer.js", function (require, module, exports, __dirname, __filename) {
/**
 *  A Lexer.
 *
 *  Use Lexer.feed (str) to input a string for it to break it down.
 *  Use Lexer.next () to get the next token.
 *  Use Lexer.peek () to see a future token without advancing in the stream.
 *
 *  This Lexer does NOT use regular expression but simple strings for speed.
 */
(function(){
  var Lexer;
  Lexer = (function(){
    /**
     *  Sort function for token sorting. Orders the array so that
     *  the first element in the next token in the string (aka, its
     *  position is the lowest one). In case of having two tokens
     *  at the same position - because they start the same - put first
     *  the longest one, so that, for exemple, == comes before =.
     *
     *  @param a: First Operand
     *  @param b: Second Operand
     *  @returns 1, 0 or -1
     */
    Lexer.displayName = 'Lexer';
    var __token_sort, prototype = Lexer.prototype, constructor = Lexer;
    __token_sort = (function(){
      function __token_sort(a, b){
        if (a.pos == -1) {
          return 1;
        }
        if (b.pos == -1) {
          return -1;
        }
        if (a.pos < b.pos) {
          return -1;
        }
        if (a.pos == b.pos) {
          if (a.tok.length > b.tok.length) {
            return -1;
          }
          if (a.tok.length < b.tok.length) {
            return 1;
          }
          return 0;
        }
        return 1;
      }
      return __token_sort;
    }());
    /**
     *
     */
    function Lexer(specs){
      var token, _res, _i, _ref, _len;
      this.input = null;
      this.position = 0;
      this.lineno = 0;
      _res = [];
      for (_i = 0, _len = (_ref = specs.tokens).length; _i < _len; ++_i) {
        token = _ref[_i];
        _res.push({
          tok: token,
          pos: -1
        });
      }
      this.tokens_order = _res;
    }
    prototype.computeTokenPositions = (function(){
      function computeTokenPositions(){
        var token, _i, _ref, _len;
        for (_i = 0, _len = (_ref = this.tokens_order).length; _i < _len; ++_i) {
          token = _ref[_i];
          token.pos = this.input.indexOf(token.tok, this.position);
        }
        return this.tokens_order.sort(__token_sort);
      }
      return computeTokenPositions;
    }());
    prototype.feed = (function(){
      function feed(str){
        this.input = str;
        this.position = 0;
        this.lineno = 0;
        return this.computeTokenPositions();
      }
      return feed;
    }());
    prototype.advance = (function(){
      function advance(to_position){
        var res;
        res = this.input.slice(this.position, to_position);
        this.position = to_position;
        return res;
      }
      return advance;
    }());
    prototype.advanceCurrentToken = (function(){
      function advanceCurrentToken(){
        var next_token, res;
        next_token = this.tokens_order[0];
        if (next_token.tok == "\n") {
          this.lineno += 1;
        }
        res = this.advance(this.position + next_token.tok.length);
        this.computeTokenPositions();
        return res;
      }
      return advanceCurrentToken;
    }());
    /**
     *  Return the next token in the input stream.
     */
    prototype.next = (function(){
      function next(){
        var result, next_token;
        if (this.input == null) {
          throw {
            message: "Lexer has not been fed an input."
          };
        }
        if (this._cached_next !== undefined) {
          result = this._cached_next;
          this._cached_next = undefined;
          return result;
        }
        if (this.position >= this.input.length) {
          return null;
        }
        next_token = this.tokens_order[0];
        if (next_token.pos == -1) {
          return this.advance(this.input.length);
        }
        if (next_token.pos == this.position) {
          return this.advanceCurrentToken();
        } else {
          return this.advance(next_token.pos);
        }
      }
      return next;
    }());
    /**
     *  Return the next token in the input stream, and cache its result, so that
     *  every subsequents call to peek and the next call to next() return the same token
     */
    prototype.peek = (function(){
      function peek(){
        if (this._cached_next == undefined) {
          this._cached_next = this.next();
        }
        return this._cached_next;
      }
      return peek;
    }());
    return Lexer;
  }());
  exports.Lexer = Lexer;
}).call(this);

});

require.define("/nodes.js", function (require, module, exports, __dirname, __filename) {
(function(){
  var make_expression, make_parse_rule, parse_for, parse_let, parse_macro, parse_extends, parse_block, parse_import, parse_string, Node, NodeBasic, NodeComment, NodeList, NodePrint, NodeTag, NodeExtends, NodeImport, NodeFromImport, NodeInclude, NodeAbspath, NodeLet, NodeDo, NodeTagContainer, NodeMacro, NodeCall, NodeBlock, NodeElse, NodeElseIf, NodeElIf, NodeIf, NodeElseFor, NodeContinue, NodeBreak, NodeFor;
  make_expression = require('./expression').parse;
  make_parse_rule = function(rule_name){
    return function(contents, ctx){
      return make_expression(contents, rule_name, ctx);
    };
  };
  parse_for = make_parse_rule('tag_for');
  parse_let = make_parse_rule('tag_let');
  parse_macro = make_parse_rule('tag_macro');
  parse_extends = make_expression;
  parse_block = make_parse_rule('tag_block');
  parse_import = make_parse_rule('tag_import');
  parse_string = make_parse_rule('string');
  function trim(string){
    return !string
      ? ""
      : string.replace(/^\s*|\s*$/, '');
  }
  /**
   *  @param str  a string
   *  @returns    an escaped string suitable to be quoted.
   */
  function escape(str){
    return str.replace(/\\/g, '\\\\').replace(/["']/g, function(str){
      return "\\" + str;
    }).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  }
  function template_expr_is_string(expr){
    try {
      parse_string(expr);
      return true;
    } catch (e) {
      return false;
    }
  }
  /**
   *
   */
  Node = (function(){
    Node.displayName = 'Node';
    var prototype = Node.prototype, constructor = Node;
    function Node(specs){
      this.contents = (specs != null
        ? specs
        : {}).contents;
    }
    prototype.compile = (function(){
      function compile(){
        throw new Error("This function should never be called.");
      }
      return compile;
    }());
    prototype.ind = (function(){
      function ind(opts){
        var ind;
        opts.__indent__ == null && (opts.__indent__ = 0);
        opts.__indent__ = opts.__indent__ + 1;
        ind = opts.__indent__ * 4;
        return "\n" + __repeatString(" ", ind);
      }
      return ind;
    }());
    prototype.ded = (function(){
      function ded(opts){
        var ind;
        opts.__indent__ == null && (opts.__indent__ = 1);
        opts.__indent__ = opts.__indent__ - 1;
        ind = opts.__indent__ * 4;
        return "\n" + __repeatString(" ", ind);
      }
      return ded;
    }());
    prototype.cur = (function(){
      function cur(opts){
        var ind, _ref;
        ind = ((_ref = opts.__indent__) != null ? _ref : 0) * 4;
        return "\n" + __repeatString(" ", ind);
      }
      return cur;
    }());
    return Node;
  }());
  /**
   *
   */
  NodeBasic = (function(_super){
    NodeBasic.displayName = 'NodeBasic';
    var prototype = __extends(NodeBasic, _super).prototype, constructor = NodeBasic;
    function NodeBasic(specs){
      NodeBasic.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        return "_res += '" + escape(this.contents) + "';";
      }
      return compile;
    }());
    prototype.append = (function(){
      function append(contents){
        return this.contents += contents;
      }
      return append;
    }());
    return NodeBasic;
  }(Node));
  NodeComment = (function(_super){
    NodeComment.displayName = 'NodeComment';
    var prototype = __extends(NodeComment, _super).prototype, constructor = NodeComment;
    function NodeComment(_arg){
      var _ref;
      this.contents = (_ref = _arg.contents) != null ? _ref : "";
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        return "/*" + this.contents + "*/";
      }
      return compile;
    }());
    return NodeComment;
  }(Node));
  /**
   *  A collection of Nodes.
   */
  NodeList = (function(_super){
    NodeList.displayName = 'NodeList';
    var prototype = __extends(NodeList, _super).prototype, constructor = NodeList;
    function NodeList(specs){
      this.nodes = [];
      NodeList.superclass.apply(this, arguments);
    }
    prototype.push = (function(){
      function push(node){
        var last_node;
        if (node == null) {
          return;
        }
        if (typeof node == 'string') {
          last_node = this.nodes[this.nodes.length - 1];
          if (last_node instanceof NodeBasic) {
            return last_node.append(node);
          } else {
            return this.nodes.push(new NodeBasic({
              contents: node
            }));
          }
        } else {
          return this.nodes.push(node);
        }
      }
      return push;
    }());
    prototype.compile = (function(){
      function compile(opts, ctx){
        var res, node, _i, _ref, _len;
        ctx == null && (ctx = {});
        res = "";
        for (_i = 0, _len = (_ref = this.nodes).length; _i < _len; ++_i) {
          node = _ref[_i];
          res += node.compile(opts, ctx);
        }
        return res;
      }
      return compile;
    }());
    return NodeList;
  }(Node));
  /**
   *
   */
  NodePrint = (function(_super){
    NodePrint.displayName = 'NodePrint';
    var prototype = __extends(NodePrint, _super).prototype, constructor = NodePrint;
    function NodePrint(specs){
      NodePrint.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        return "_res += ((_ref = " + make_expression(this.contents, ctx) + ") !== undefined && _ref !== null ? _ref : '').toString();";
      }
      return compile;
    }());
    return NodePrint;
  }(Node));
  NodeTag = (function(_super){
    NodeTag.displayName = 'NodeTag';
    var prototype = __extends(NodeTag, _super).prototype, constructor = NodeTag;
    NodeTag.tag = '__tag__';
    function NodeTag(specs){
      NodeTag.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(){
        throw new JinJSUnimplementedException("The NodeTag is not meant to be used !");
      }
      return compile;
    }());
    prototype.toString = (function(){
      function toString(){
        return "Node: " + this.constructor.displayName;
      }
      return toString;
    }());
    return NodeTag;
  }(Node));
  /**
   *
   */
  NodeExtends = (function(_super){
    NodeExtends.displayName = 'NodeExtends';
    var prototype = __extends(NodeExtends, _super).prototype, constructor = NodeExtends;
    NodeExtends.tag = 'extends';
    function NodeExtends(specs){
      NodeExtends.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var tpl_name;
        opts['extends'] = true;
        tpl_name = parse_extends(this.contents, opts);
        if (template_expr_is_string(tpl_name)) {
          return "__extends__ = require(" + tpl_name + ");";
        } else {
          return "__extends__ = " + tpl_name + ";\nif (__extends__ === null || __extends__ === undefined) throw new Error ('Cant extend a null template.');";
        }
      }
      return compile;
    }());
    return NodeExtends;
  }(NodeTag));
  NodeImport = (function(_super){
    NodeImport.displayName = 'NodeImport';
    var prototype = __extends(NodeImport, _super).prototype, constructor = NodeImport;
    NodeImport.tag = 'import';
    function NodeImport(specs){
      NodeImport.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var tpl, as, imports, with_context, result;
        tpl = parse_import.tpl, as = parse_import.as, imports = parse_import.imports, with_context = parse_import.with_context;
        opts['clone'] = true;
        result = "(function(){\nvar __new_ctx = " + (!with_context ? '{}' : '__import({}, $$)') + ";\n// __new_ctx now gets populated with the new exported variables.\nrequire(" + tpl + ").render(__new_ctx);";
        if (as) {
          result += common + "$$." + as + " = __new_ctx;";
        } else {
          result += "var names = ['" + imports.join("', '") + "'];\nfor (var i = 0; i < names.length; i++) {\n    $$[names[i]] = __new_ctx[names[i]];\n}";
        }
        result += "})();";
        return result;
      }
      return compile;
    }());
    return NodeImport;
  }(NodeTag));
  NodeFromImport = (function(_super){
    NodeFromImport.displayName = 'NodeFromImport';
    var prototype = __extends(NodeFromImport, _super).prototype, constructor = NodeFromImport;
    NodeFromImport.tag = 'from';
    function NodeFromImport(specs){
      NodeFromImport.superclass.apply(this, arguments);
    }
    return NodeFromImport;
  }(NodeImport));
  /**
   *
   */
  NodeInclude = (function(_super){
    NodeInclude.displayName = 'NodeInclude';
    var prototype = __extends(NodeInclude, _super).prototype, constructor = NodeInclude;
    NodeInclude.tag = 'include';
    function NodeInclude(specs){
      NodeInclude.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var tpl_name, tpl_exp;
        tpl_name = parse_extends(this.contents, opts);
        if (template_expr_is_string(tpl_name)) {
          tpl_exp = "require(" + tpl_name + ")";
        } else {
          tpl_exp = tpl_name;
        }
        return "_res += (" + tpl_exp + ").render($$);";
      }
      return compile;
    }());
    return NodeInclude;
  }(NodeTag));
  NodeImport = (function(_super){
    NodeImport.displayName = 'NodeImport';
    var prototype = __extends(NodeImport, _super).prototype, constructor = NodeImport;
    NodeImport.tag = 'import';
    function NodeImport(specs){
      NodeImport.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var template, as_name, variables, with_context, tpl_exp, result, _ref;
        _ref = parse_import(this.contents, ctx), template = _ref.template, as_name = _ref.as_name, variables = _ref.variables, with_context = _ref.with_context;
        opts['clone'] = true;
        if (template_expr_is_string(template)) {
          tpl_exp = "require(" + template + ")";
        } else {
          tpl_exp = template;
        }
        result = "(function(){ ";
        if (with_context) {
          result += "var __new_ctx = __import({}, $$);\n// __new_ctx now gets populated with the new exported variables.\n(" + tpl_exp + ").render(__new_ctx);";
        } else {
          result += "var __new_ctx = (" + tpl_exp + ")._cached_ctx();";
        }
        if (as_name) {
          result += "$$." + as_name + " = __new_ctx;";
        } else {
          result += "var names = ['" + variables.join("', '") + "'];\nfor (var i = 0; i < names.length; i++) {\n    $$[names[i]] = __new_ctx[names[i]];\n}";
        }
        result += "})();";
        return result;
      }
      return compile;
    }());
    return NodeImport;
  }(NodeTag));
  NodeFromImport = (function(_super){
    NodeFromImport.displayName = 'NodeFromImport';
    var prototype = __extends(NodeFromImport, _super).prototype, constructor = NodeFromImport;
    NodeFromImport.tag = 'from';
    function NodeFromImport(specs){
      NodeFromImport.superclass.apply(this, arguments);
    }
    return NodeFromImport;
  }(NodeImport));
  NodeAbspath = (function(_super){
    NodeAbspath.displayName = 'NodeAbspath';
    var prototype = __extends(NodeAbspath, _super).prototype, constructor = NodeAbspath;
    NodeAbspath.tag = 'abspath';
    function NodeAbspath(specs){
      NodeAbspath.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var path;
        path = parse_string(this.contents, ctx);
        return "_res += _require('path').join(__dirname, " + path + ");";
      }
      return compile;
    }());
    return NodeAbspath;
  }(NodeTag));
  /**
   *
   */
  NodeLet = (function(_super){
    NodeLet.displayName = 'NodeLet';
    var prototype = __extends(NodeLet, _super).prototype, constructor = NodeLet;
    NodeLet.tag = 'let';
    function NodeLet(specs){
      NodeLet.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var variable_name, expression, res, _ref;
        _ref = parse_let(this.contents, ctx), variable_name = _ref.variable_name, expression = _ref.expression;
        ctx[variable_name] = true;
        return res = "var " + variable_name + " = ($$." + variable_name + " = " + expression + ");";
      }
      return compile;
    }());
    return NodeLet;
  }(NodeTag));
  NodeDo = (function(_super){
    NodeDo.displayName = 'NodeDo';
    var prototype = __extends(NodeDo, _super).prototype, constructor = NodeDo;
    NodeDo.tag = 'do';
    function NodeDo(specs){
      NodeDo.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        return make_expression(this.contents, ctx) + ";";
      }
      return compile;
    }());
    return NodeDo;
  }(NodeTag));
  /**
   */
  NodeTagContainer = (function(_super){
    NodeTagContainer.displayName = 'NodeTagContainer';
    var prototype = __extends(NodeTagContainer, _super).prototype, constructor = NodeTagContainer;
    function NodeTagContainer(specs){
      NodeTagContainer.superclass.apply(this, arguments);
      this.child_node = specs.child_node;
    }
    prototype.child_code = (function(){
      function child_code(opts, ctx){
        var ind, _ref;
        ind = 0;
        return ((_ref = (_ref = this.child_node) != null ? _ref.compile(opts, ctx) : void 8) != null ? _ref : "").replace(/^/g, function(){
          ind = ind + 1;
          return ind == 1 ? "" : "    ";
        });
      }
      return child_code;
    }());
    return NodeTagContainer;
  }(NodeList));
  /**
   *
   */
  NodeMacro = (function(_super){
    NodeMacro.displayName = 'NodeMacro';
    var prototype = __extends(NodeMacro, _super).prototype, constructor = NodeMacro;
    NodeMacro.tag = 'macro';
    NodeMacro.until = 'endmacro';
    function NodeMacro(specs){
      NodeMacro.superclass.apply(this, arguments);
    }
    prototype.init_defaults = (function(){
      function init_defaults(opts, args){
        var res, a, _i, _len;
        res = "";
        for (_i = 0, _len = args.length; _i < _len; ++_i) {
          a = args[_i];
          if (a.default_value) {
            res += a.name + " = (" + a.name + " === undefined) ? (" + a.default_value + ") : " + a.name + ";";
          }
        }
        return res;
      }
      return init_defaults;
    }());
    prototype.compile = (function(){
      function compile(opts, ctx){
        var args, function_name, backup, argcode, argendcode, a, res, _ref, _i, _len;
        _ref = parse_macro(this.contents, ctx), args = _ref.args, function_name = _ref.function_name;
        args.push({
          name: "caller",
          default_value: "(function(){ return \"\"; })"
        });
        backup = [];
        argcode = [];
        argendcode = [];
        for (_i = 0, _len = args.length; _i < _len; ++_i) {
          a = args[_i];
          backup.push("__" + a.name + " = " + a.name);
          argcode.push("$$." + a.name + " = " + a.name);
          argendcode.push("if (__" + a.name + " !== undefined) $$." + a.name + " = __" + a.name + ";");
        }
        if (args) {
          backup = "var " + backup.join(",") + ";";
          argcode = argcode.join(",") + ";";
          argendcode = argendcode.join(" ");
        }
        res = "function " + function_name + "(" + (function(){
          var _i, _ref, _len, _results = [];
          for (_i = 0, _len = (_ref = args).length; _i < _len; ++_i) {
            a = _ref[_i];
            _results.push(a.name);
          }
          return _results;
        }()).join(", ") + ") {\n    var _res = '';\n    " + this.init_defaults(opts, args) + "\n    " + backup + "\n    " + argcode + "\n    " + this.child_code(opts, ctx) + "\n    " + argendcode + "\n    return _res;\n}\n$$." + function_name + " = " + function_name + ";";
        return res;
      }
      return compile;
    }());
    return NodeMacro;
  }(NodeTagContainer));
  NodeCall = (function(_super){
    NodeCall.displayName = 'NodeCall';
    var prototype = __extends(NodeCall, _super).prototype, constructor = NodeCall;
    NodeCall.tag = 'call';
    NodeCall.until = 'endcall';
    NodeCall.call_re = /([a-zA-Z$_0-9]+)\s*\(\s*(.*)\s*\)\s*/;
    function NodeCall(specs){
      NodeCall.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var m, fname, args, a, callerblock, thecall, _res, _i, _ref, _len;
        m = this.contents.match(NodeCall.call_re);
        if (!m) {
          throw new Error("call tag is malformed");
        }
        fname = m[1];
        args = m[2];
        _res = [];
        for (_i = 0, _len = (_ref = args.split(",")).length; _i < _len; ++_i) {
          a = _ref[_i];
          if (a) {
            _res.push(a.replace(/^\s*|\s*$/g, ''));
          }
        }
        args = _res;
        callerblock = "(function () {\n    var _res = '';\n    " + this.child_code(opts, ctx) + "\n    return _res;\n})";
        args.push(callerblock);
        args = args.join(", ");
        thecall = "_res += " + fname + "(" + args + ");";
        return thecall;
      }
      return compile;
    }());
    return NodeCall;
  }(NodeTagContainer));
  /**
   *
   */
  NodeBlock = (function(_super){
    NodeBlock.displayName = 'NodeBlock';
    var prototype = __extends(NodeBlock, _super).prototype, constructor = NodeBlock;
    NodeBlock.tag = 'block';
    NodeBlock.until = 'endblock';
    function NodeBlock(specs){
      NodeBlock.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var block_name, indent;
        block_name = parse_block(this.contents, ctx);
        opts.blocks == null && (opts.blocks = {});
        indent = opts.__indent__;
        opts.__indent__ = 4;
        opts.blocks[block_name] = this.child_code(opts, ctx) + "";
        opts.__indent__ = indent;
        return "// Adding the current block as the super of the currently defined block with the same name.\nif (_b['" + block_name + "'] !== undefined) {\n    _b['" + block_name + "'] = (function (original) {\n        return function ($$) {\n            var prevsuper = $$.super;\n            $$.super = function() {\n                return __block_" + block_name + "($$);\n            };\n            var res = original($$);\n            if (prevsuper !== undefined)\n                $$.super = prevsuper;\n            return res; };\n    })(_b['" + block_name + "']);\n} else { _b['" + block_name + "'] = __block_" + block_name + "; }\nif (__extends__ === null) _res += _b['" + block_name + "']($$);\n";
      }
      return compile;
    }());
    return NodeBlock;
  }(NodeTagContainer));
  NodeElse = (function(_super){
    NodeElse.displayName = 'NodeElse';
    var prototype = __extends(NodeElse, _super).prototype, constructor = NodeElse;
    NodeElse.tag = 'else';
    NodeElse.parse = (function(){
      function parse(pd){
        return new NodeElse({
          child_node: pd.child_node
        });
      }
      return parse;
    }());
    function NodeElse(specs){
      NodeElse.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var res;
        res = "} else {";
        this.ind(opts);
        res += this.child_code(opts, ctx) + "";
        return res;
      }
      return compile;
    }());
    return NodeElse;
  }(NodeTagContainer));
  NodeElseIf = (function(_super){
    NodeElseIf.displayName = 'NodeElseIf';
    var prototype = __extends(NodeElseIf, _super).prototype, constructor = NodeElseIf;
    NodeElseIf.tag = 'elseif';
    NodeElseIf.inside = {
      elseif: NodeElseIf,
      'else': NodeElse
    };
    function NodeElseIf(specs){
      NodeElseIf.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var res;
        if (!trim(this.contents)) {
          throw new Error("{% elseif <condition> %}: condition can't be empty.");
        }
        res = "} else if (" + make_expression(this.contents, ctx) + ") {";
        this.ind(opts);
        res += this.child_code(opts, ctx) + "";
        return res;
      }
      return compile;
    }());
    return NodeElseIf;
  }(NodeTagContainer));
  NodeElIf = (function(_super){
    NodeElIf.displayName = 'NodeElIf';
    var prototype = __extends(NodeElIf, _super).prototype, constructor = NodeElIf;
    NodeElIf.tag = 'elif';
    NodeElIf.inside = {
      elif: NodeElIf,
      'else': NodeElse
    };
    function NodeElIf(specs){
      NodeElIf.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var res;
        if (!trim(this.contents)) {
          throw new Error("{% elif <condition> %}: condition can't be empty.");
        }
        res = "} else if (" + make_expression(this.contents, ctx) + ") {";
        this.ind(opts);
        res += this.child_code(opts, ctx) + "";
        return res;
      }
      return compile;
    }());
    return NodeElIf;
  }(NodeTagContainer));
  NodeIf = (function(_super){
    NodeIf.displayName = 'NodeIf';
    var prototype = __extends(NodeIf, _super).prototype, constructor = NodeIf;
    NodeIf.tag = 'if';
    NodeIf.until = 'endif';
    NodeIf.inside = {
      'else': NodeElse,
      elseif: NodeElseIf,
      elif: NodeElIf
    };
    function NodeIf(specs){
      NodeIf.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var res;
        if (!trim(this.contents)) {
          throw new Error("{% if <condition> %}: condition can't be empty.");
        }
        res = "if (" + make_expression(this.contents, ctx) + ") {\n    " + this.child_code(opts, ctx) + "\n    " + NodeIf.superclass.prototype.compile.call(this, this, opts, ctx) + "\n}";
        return res;
      }
      return compile;
    }());
    return NodeIf;
  }(NodeTagContainer));
  NodeElseFor = (function(_super){
    NodeElseFor.displayName = 'NodeElseFor';
    var prototype = __extends(NodeElseFor, _super).prototype, constructor = NodeElseFor;
    NodeElseFor.tag = 'else';
    NodeElseFor.until = 'endfor';
    function NodeElseFor(specs){
      NodeElseFor.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var res;
        res = this.child_code(opts, ctx) + "";
        return res;
      }
      return compile;
    }());
    return NodeElseFor;
  }(NodeTagContainer));
  NodeContinue = (function(_super){
    NodeContinue.displayName = 'NodeContinue';
    var prototype = __extends(NodeContinue, _super).prototype, constructor = NodeContinue;
    NodeContinue.tag = 'continue';
    function NodeContinue(specs){
      NodeContinue.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        return "continue;";
      }
      return compile;
    }());
    return NodeContinue;
  }(NodeTag));
  NodeBreak = (function(_super){
    NodeBreak.displayName = 'NodeBreak';
    var prototype = __extends(NodeBreak, _super).prototype, constructor = NodeBreak;
    NodeBreak.tag = 'break';
    function NodeBreak(specs){
      NodeBreak.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        return "break;";
      }
      return compile;
    }());
    return NodeBreak;
  }(NodeTag));
  NodeFor = (function(_super){
    NodeFor.displayName = 'NodeFor';
    var prototype = __extends(NodeFor, _super).prototype, constructor = NodeFor;
    NodeFor.tag = 'for';
    NodeFor.until = 'endfor';
    NodeFor.inside = {
      'else': NodeElseFor
    };
    function NodeFor(specs){
      NodeFor.superclass.apply(this, arguments);
    }
    prototype.compile = (function(){
      function compile(opts, ctx){
        var key, value, condition, k, v, l, _ref;
        _ref = parse_for(this.contents, ctx), key = _ref.key, value = _ref.value, condition = _ref.condition;
        opts.forblock = true;
        if (!value) {
          value = '';
        }
        k = "$$['" + key + "']";
        v = value ? "$$['" + value + "']" : "null";
        l = "$$.loop";
        return "(function() {\nvar _fref = " + condition + " || [], _prev_loop = " + l + ", _prev_key = " + k + ", _prev_value = " + v + ", k = null, v = null, i = 0, l = 0, x = null, last_v = null, last_k = null;\n" + l + " = { };\nif (_fref instanceof Array) {\n    l = _fref.length;\n    for (i = 0; i < l; i++) {\n        " + l + ".last = (i == l - 1);\n        " + l + ".first = (i == 0);\n        " + l + ".index0 = i;\n        " + l + ".index = i + 1;\n        " + k + " = _fref[i]; " + (value ? v + " = i;" : "") + "\n        " + this.child_code(opts, ctx) + "\n    }\n} else {\n    " + l + " = { first: true, last: false };\n    l = Object.keys(_fref).length;\n\n    for (x in _fref) { if (_fref.hasOwnProperty(x)) {\n        " + l + ".last = (i == l - 1);\n        " + k + " = x;\n        " + (value ? v + " = _fref[x];" : "") + "\n        " + l + ".index0 = i;\n        " + l + ".index = i + 1;\n        " + this.child_code(opts, ctx) + "\n        i += 1;\n        " + l + ".first = false;\n    } }\n}\nif (" + l + ".index == undefined) {\n    " + NodeFor.superclass.prototype.compile.call(this, this, opts, ctx) + "\n}\n" + l + " = _prev_loop; " + k + " = _prev_key; " + (value ? v + " = _prev_value;" : "") + "\n})();";
      }
      return compile;
    }());
    return NodeFor;
  }(NodeTagContainer));
  exports.NodeIf = NodeIf;
  exports.NodeDo = NodeDo;
  exports.NodeLet = NodeLet;
  exports.NodeFor = NodeFor;
  exports.NodeMacro = NodeMacro;
  exports.NodeList = NodeList;
  exports.NodeBasic = NodeBasic;
  exports.NodePrint = NodePrint;
  exports.NodeComment = NodeComment;
  exports.NodeExtends = NodeExtends;
  exports.NodeInclude = NodeInclude;
  exports.NodeImport = NodeImport;
  exports.NodeFromImport = NodeFromImport;
  exports.NodeContinue = NodeContinue;
  exports.NodeCall = NodeCall;
  exports.default_nodes = {
    'if': NodeIf,
    'do': NodeDo,
    'let': NodeLet,
    'for': NodeFor,
    'macro': NodeMacro,
    'extends': NodeExtends,
    'block': NodeBlock,
    'include': NodeInclude,
    'from': NodeFromImport,
    'import': NodeImport,
    'abspath': NodeAbspath,
    'continue': NodeContinue,
    'break': NodeBreak,
    'call': NodeCall
  };
  function __repeatString(str, n){
    for (var r = ''; n > 0; (n >>= 1) && (str += str)) if (n & 1) r += str;
    return r;
  }
  function __extends(sub, sup){
    function ctor(){} ctor.prototype = (sub.superclass = sup).prototype;
    (sub.prototype = new ctor).constructor = sub;
    if (typeof sup.extended == 'function') sup.extended(sub);
    return sub;
  }
}).call(this);

});

require.define("/expression.js", function (require, module, exports, __dirname, __filename) {
module.exports = (function(){
  /* Generated by PEG.js 0.6.2 (http://pegjs.majda.cz/). */
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function(input, startRule) {
      var parseFunctions = {
        "ASSIGN": parse_ASSIGN,
        "BINARY_OPERATOR": parse_BINARY_OPERATOR,
        "COLON": parse_COLON,
        "COMMA": parse_COMMA,
        "DOT": parse_DOT,
        "IN": parse_IN,
        "LBRACE": parse_LBRACE,
        "LBRACKET": parse_LBRACKET,
        "LPAREN": parse_LPAREN,
        "MINUS": parse_MINUS,
        "NEW": parse_NEW,
        "PIPE": parse_PIPE,
        "POST_UNARY_OPERATOR": parse_POST_UNARY_OPERATOR,
        "QUESTION_MARK": parse_QUESTION_MARK,
        "RBRACE": parse_RBRACE,
        "RBRACKET": parse_RBRACKET,
        "RPAREN": parse_RPAREN,
        "SPECIAL": parse_SPECIAL,
        "TEXT_BINARY_OPERATOR": parse_TEXT_BINARY_OPERATOR,
        "UNARY_OPERATOR": parse_UNARY_OPERATOR,
        "array_index": parse_array_index,
        "array_indexing_rec": parse_array_indexing_rec,
        "array_literal": parse_array_literal,
        "binary": parse_binary,
        "call_arguments": parse_call_arguments,
        "double_quoted_contents": parse_double_quoted_contents,
        "double_quoted_terminal": parse_double_quoted_terminal,
        "expression": parse_expression,
        "filter_expression": parse_filter_expression,
        "filter_identifier": parse_filter_identifier,
        "filter_literal": parse_filter_literal,
        "filter_name": parse_filter_name,
        "filter_rec": parse_filter_rec,
        "function_call": parse_function_call,
        "function_call_rec": parse_function_call_rec,
        "ic_member_expression": parse_ic_member_expression,
        "ic_member_expression_rec": parse_ic_member_expression_rec,
        "ic_primary_expression": parse_ic_primary_expression,
        "identifier": parse_identifier,
        "macro_argument": parse_macro_argument,
        "macro_call_arguments": parse_macro_call_arguments,
        "member_expression": parse_member_expression,
        "number": parse_number,
        "object_argument": parse_object_argument,
        "object_arguments": parse_object_arguments,
        "object_literal": parse_object_literal,
        "ooc_primary_expression": parse_ooc_primary_expression,
        "operation": parse_operation,
        "post_unary": parse_post_unary,
        "primary_expression": parse_primary_expression,
        "primary_identifier": parse_primary_identifier,
        "regexp": parse_regexp,
        "regexp_contents": parse_regexp_contents,
        "regexp_terminal": parse_regexp_terminal,
        "single_quoted_contents": parse_single_quoted_contents,
        "single_quoted_terminal": parse_single_quoted_terminal,
        "space": parse_space,
        "special_value": parse_special_value,
        "string": parse_string,
        "tag_block": parse_tag_block,
        "tag_for": parse_tag_for,
        "tag_import": parse_tag_import,
        "tag_let": parse_tag_let,
        "tag_macro": parse_tag_macro,
        "ternary_operator": parse_ternary_operator,
        "unary": parse_unary,
        "variable_list": parse_variable_list
      };
      
      if (startRule !== undefined) {
        if (parseFunctions[startRule] === undefined) {
          throw new Error("Invalid rule name: " + quote(startRule) + ".");
        }
      } else {
        startRule = "expression";
      }
      
      var pos = 0;
      var reportMatchFailures = true;
      var rightmostMatchFailuresPos = 0;
      var rightmostMatchFailuresExpected = [];
      var cache = {};
      
      function padLeft(input, padding, length) {
        var result = input;
        
        var padLength = length - input.length;
        for (var i = 0; i < padLength; i++) {
          result = padding + result;
        }
        
        return result;
      }
      
      function escape(ch) {
        var charCode = ch.charCodeAt(0);
        
        if (charCode <= 0xFF) {
          var escapeChar = 'x';
          var length = 2;
        } else {
          var escapeChar = 'u';
          var length = 4;
        }
        
        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
      }
      
      function quote(s) {
        /*
         * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
         * string literal except for the closing quote character, backslash,
         * carriage return, line separator, paragraph separator, and line feed.
         * Any character may appear in the form of an escape sequence.
         */
        return '"' + s
          .replace(/\\/g, '\\\\')            // backslash
          .replace(/"/g, '\\"')              // closing quote character
          .replace(/\r/g, '\\r')             // carriage return
          .replace(/\n/g, '\\n')             // line feed
          .replace(/[\x80-\uFFFF]/g, escape) // non-ASCII characters
          + '"';
      }
      
      function matchFailed(failure) {
        if (pos < rightmostMatchFailuresPos) {
          return;
        }
        
        if (pos > rightmostMatchFailuresPos) {
          rightmostMatchFailuresPos = pos;
          rightmostMatchFailuresExpected = [];
        }
        
        rightmostMatchFailuresExpected.push(failure);
      }
      
      function parse_expression() {
        var cacheKey = 'expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos1 = pos;
        var savedPos2 = pos;
        var result12 = parse_space();
        var result8 = result12 !== null ? result12 : '';
        if (result8 !== null) {
          var result9 = parse_ternary_operator();
          if (result9 !== null) {
            var result11 = parse_space();
            var result10 = result11 !== null ? result11 : '';
            if (result10 !== null) {
              var result6 = [result8, result9, result10];
            } else {
              var result6 = null;
              pos = savedPos2;
            }
          } else {
            var result6 = null;
            pos = savedPos2;
          }
        } else {
          var result6 = null;
          pos = savedPos2;
        }
        var result7 = result6 !== null
          ? (function(t) {
            return t;
          })(result6[1])
          : null;
        if (result7 !== null) {
          var result5 = result7;
        } else {
          var result5 = null;
          pos = savedPos1;
        }
        if (result5 !== null) {
          var result0 = result5;
        } else {
          var savedPos0 = pos;
          var result4 = parse_space();
          var result2 = result4 !== null ? result4 : '';
          var result3 = result2 !== null
            ? (function() {
              return '';
            })()
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_ternary_operator() {
        var cacheKey = 'ternary_operator@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_operation();
        if (result5 !== null) {
          var result6 = parse_QUESTION_MARK();
          if (result6 !== null) {
            var result7 = parse_ternary_operator();
            if (result7 !== null) {
              var result8 = parse_COLON();
              if (result8 !== null) {
                var result9 = parse_ternary_operator();
                if (result9 !== null) {
                  var result3 = [result5, result6, result7, result8, result9];
                } else {
                  var result3 = null;
                  pos = savedPos1;
                }
              } else {
                var result3 = null;
                pos = savedPos1;
              }
            } else {
              var result3 = null;
              pos = savedPos1;
            }
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(p, e1, e2) {
            return "(" + p + " ? " + e1 + " : " + e2 + ")";
          })(result3[0], result3[2], result3[4])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_operation();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_operation() {
        var cacheKey = 'operation@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos6 = pos;
        var savedPos7 = pos;
        var result22 = parse_unary();
        if (result22 !== null) {
          var result23 = parse_expression();
          if (result23 !== null) {
            var result20 = [result22, result23];
          } else {
            var result20 = null;
            pos = savedPos7;
          }
        } else {
          var result20 = null;
          pos = savedPos7;
        }
        var result21 = result20 !== null
          ? (function(u, p) {
            return u + "" + p;
          })(result20[0], result20[1])
          : null;
        if (result21 !== null) {
          var result19 = result21;
        } else {
          var result19 = null;
          pos = savedPos6;
        }
        if (result19 !== null) {
          var result0 = result19;
        } else {
          var savedPos4 = pos;
          var savedPos5 = pos;
          var result16 = parse_filter_expression();
          if (result16 !== null) {
            var result17 = parse_binary();
            if (result17 !== null) {
              var result18 = parse_operation();
              if (result18 !== null) {
                var result14 = [result16, result17, result18];
              } else {
                var result14 = null;
                pos = savedPos5;
              }
            } else {
              var result14 = null;
              pos = savedPos5;
            }
          } else {
            var result14 = null;
            pos = savedPos5;
          }
          var result15 = result14 !== null
            ? (function(p, o, s) {
              return p + "" + o + s;
            })(result14[0], result14[1], result14[2])
            : null;
          if (result15 !== null) {
            var result13 = result15;
          } else {
            var result13 = null;
            pos = savedPos4;
          }
          if (result13 !== null) {
            var result0 = result13;
          } else {
            var savedPos2 = pos;
            var savedPos3 = pos;
            var result10 = parse_filter_expression();
            if (result10 !== null) {
              var result11 = parse_IN();
              if (result11 !== null) {
                var result12 = parse_operation();
                if (result12 !== null) {
                  var result8 = [result10, result11, result12];
                } else {
                  var result8 = null;
                  pos = savedPos3;
                }
              } else {
                var result8 = null;
                pos = savedPos3;
              }
            } else {
              var result8 = null;
              pos = savedPos3;
            }
            var result9 = result8 !== null
              ? (function(p, s) {
                return "__in(" + p + ", " + s + ")";
              })(result8[0], result8[2])
              : null;
            if (result9 !== null) {
              var result7 = result9;
            } else {
              var result7 = null;
              pos = savedPos2;
            }
            if (result7 !== null) {
              var result0 = result7;
            } else {
              var savedPos0 = pos;
              var savedPos1 = pos;
              var result5 = parse_filter_expression();
              if (result5 !== null) {
                var result6 = parse_post_unary();
                if (result6 !== null) {
                  var result3 = [result5, result6];
                } else {
                  var result3 = null;
                  pos = savedPos1;
                }
              } else {
                var result3 = null;
                pos = savedPos1;
              }
              var result4 = result3 !== null
                ? (function(p, o) {
                  return p + "" + o;
                })(result3[0], result3[1])
                : null;
              if (result4 !== null) {
                var result2 = result4;
              } else {
                var result2 = null;
                pos = savedPos0;
              }
              if (result2 !== null) {
                var result0 = result2;
              } else {
                var result1 = parse_filter_expression();
                if (result1 !== null) {
                  var result0 = result1;
                } else {
                  var result0 = null;;
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_filter_expression() {
        var cacheKey = 'filter_expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_member_expression();
        if (result5 !== null) {
          var result6 = parse_filter_rec();
          if (result6 !== null) {
            var result3 = [result5, result6];
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(expr, f) {
            return make_filter(expr, f);
          })(result3[0], result3[1])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_member_expression();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_filter_rec() {
        var cacheKey = 'filter_rec@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_filter_literal();
        if (result5 !== null) {
          var result6 = parse_filter_rec();
          if (result6 !== null) {
            var result3 = [result5, result6];
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(lit, r) {
            return [].concat(lit, r);
          })(result3[0], result3[1])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_filter_literal();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_filter_literal() {
        var cacheKey = 'filter_literal@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos2 = pos;
        var savedPos3 = pos;
        var result9 = parse_PIPE();
        if (result9 !== null) {
          var result10 = parse_filter_name();
          if (result10 !== null) {
            var result11 = parse_LPAREN();
            if (result11 !== null) {
              var result14 = parse_call_arguments();
              var result12 = result14 !== null ? result14 : '';
              if (result12 !== null) {
                var result13 = parse_RPAREN();
                if (result13 !== null) {
                  var result7 = [result9, result10, result11, result12, result13];
                } else {
                  var result7 = null;
                  pos = savedPos3;
                }
              } else {
                var result7 = null;
                pos = savedPos3;
              }
            } else {
              var result7 = null;
              pos = savedPos3;
            }
          } else {
            var result7 = null;
            pos = savedPos3;
          }
        } else {
          var result7 = null;
          pos = savedPos3;
        }
        var result8 = result7 !== null
          ? (function(name, args) {
            return [{
            name: name,
            args: args
          }];
          })(result7[1], result7[3])
          : null;
        if (result8 !== null) {
          var result6 = result8;
        } else {
          var result6 = null;
          pos = savedPos2;
        }
        if (result6 !== null) {
          var result0 = result6;
        } else {
          var savedPos0 = pos;
          var savedPos1 = pos;
          var result4 = parse_PIPE();
          if (result4 !== null) {
            var result5 = parse_filter_name();
            if (result5 !== null) {
              var result2 = [result4, result5];
            } else {
              var result2 = null;
              pos = savedPos1;
            }
          } else {
            var result2 = null;
            pos = savedPos1;
          }
          var result3 = result2 !== null
            ? (function(name) {
              return [{
              name: name
            }];
            })(result2[1])
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_call_arguments() {
        var cacheKey = 'call_arguments@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_expression();
        if (result5 !== null) {
          var result6 = parse_COMMA();
          if (result6 !== null) {
            var result7 = parse_call_arguments();
            if (result7 !== null) {
              var result3 = [result5, result6, result7];
            } else {
              var result3 = null;
              pos = savedPos1;
            }
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(e, c) {
            return e + ", " + c;
          })(result3[0], result3[2])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_expression();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_function_call() {
        var cacheKey = 'function_call@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_LPAREN();
        if (result3 !== null) {
          var result6 = parse_call_arguments();
          var result4 = result6 !== null ? result6 : '';
          if (result4 !== null) {
            var result5 = parse_RPAREN();
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(args) {
            return "(" + args + ")";
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_function_call_rec() {
        var cacheKey = 'function_call_rec@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos4 = pos;
        var savedPos5 = pos;
        var result16 = parse_function_call();
        if (result16 !== null) {
          var result17 = parse_function_call_rec();
          if (result17 !== null) {
            var result14 = [result16, result17];
          } else {
            var result14 = null;
            pos = savedPos5;
          }
        } else {
          var result14 = null;
          pos = savedPos5;
        }
        var result15 = result14 !== null
          ? (function(f, rec) {
            return f + rec;
          })(result14[0], result14[1])
          : null;
        if (result15 !== null) {
          var result13 = result15;
        } else {
          var result13 = null;
          pos = savedPos4;
        }
        if (result13 !== null) {
          var result0 = result13;
        } else {
          var savedPos2 = pos;
          var savedPos3 = pos;
          var result10 = parse_function_call();
          if (result10 !== null) {
            var result11 = parse_DOT();
            if (result11 !== null) {
              var result12 = parse_ic_member_expression_rec();
              if (result12 !== null) {
                var result8 = [result10, result11, result12];
              } else {
                var result8 = null;
                pos = savedPos3;
              }
            } else {
              var result8 = null;
              pos = savedPos3;
            }
          } else {
            var result8 = null;
            pos = savedPos3;
          }
          var result9 = result8 !== null
            ? (function(f, member) {
              return f + "." + member;
            })(result8[0], result8[2])
            : null;
          if (result9 !== null) {
            var result7 = result9;
          } else {
            var result7 = null;
            pos = savedPos2;
          }
          if (result7 !== null) {
            var result0 = result7;
          } else {
            var savedPos0 = pos;
            var savedPos1 = pos;
            var result5 = parse_function_call();
            if (result5 !== null) {
              var result6 = parse_array_indexing_rec();
              if (result6 !== null) {
                var result3 = [result5, result6];
              } else {
                var result3 = null;
                pos = savedPos1;
              }
            } else {
              var result3 = null;
              pos = savedPos1;
            }
            var result4 = result3 !== null
              ? (function(f, a) {
                return f + a;
              })(result3[0], result3[1])
              : null;
            if (result4 !== null) {
              var result2 = result4;
            } else {
              var result2 = null;
              pos = savedPos0;
            }
            if (result2 !== null) {
              var result0 = result2;
            } else {
              var result1 = parse_function_call();
              if (result1 !== null) {
                var result0 = result1;
              } else {
                var result0 = null;;
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_array_index() {
        var cacheKey = 'array_index@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_LBRACKET();
        if (result3 !== null) {
          var result4 = parse_call_arguments();
          if (result4 !== null) {
            var result5 = parse_RBRACKET();
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(contents) {
            return "[" + contents + "]";
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_array_indexing_rec() {
        var cacheKey = 'array_indexing_rec@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos4 = pos;
        var savedPos5 = pos;
        var result16 = parse_array_index();
        if (result16 !== null) {
          var result17 = parse_array_indexing_rec();
          if (result17 !== null) {
            var result14 = [result16, result17];
          } else {
            var result14 = null;
            pos = savedPos5;
          }
        } else {
          var result14 = null;
          pos = savedPos5;
        }
        var result15 = result14 !== null
          ? (function(a, rec) {
            return a + rec;
          })(result14[0], result14[1])
          : null;
        if (result15 !== null) {
          var result13 = result15;
        } else {
          var result13 = null;
          pos = savedPos4;
        }
        if (result13 !== null) {
          var result0 = result13;
        } else {
          var savedPos2 = pos;
          var savedPos3 = pos;
          var result10 = parse_array_index();
          if (result10 !== null) {
            var result11 = parse_DOT();
            if (result11 !== null) {
              var result12 = parse_ic_member_expression_rec();
              if (result12 !== null) {
                var result8 = [result10, result11, result12];
              } else {
                var result8 = null;
                pos = savedPos3;
              }
            } else {
              var result8 = null;
              pos = savedPos3;
            }
          } else {
            var result8 = null;
            pos = savedPos3;
          }
          var result9 = result8 !== null
            ? (function(a, member) {
              return a + "." + member;
            })(result8[0], result8[2])
            : null;
          if (result9 !== null) {
            var result7 = result9;
          } else {
            var result7 = null;
            pos = savedPos2;
          }
          if (result7 !== null) {
            var result0 = result7;
          } else {
            var savedPos0 = pos;
            var savedPos1 = pos;
            var result5 = parse_array_index();
            if (result5 !== null) {
              var result6 = parse_function_call_rec();
              if (result6 !== null) {
                var result3 = [result5, result6];
              } else {
                var result3 = null;
                pos = savedPos1;
              }
            } else {
              var result3 = null;
              pos = savedPos1;
            }
            var result4 = result3 !== null
              ? (function(a, f) {
                return a + f;
              })(result3[0], result3[1])
              : null;
            if (result4 !== null) {
              var result2 = result4;
            } else {
              var result2 = null;
              pos = savedPos0;
            }
            if (result2 !== null) {
              var result0 = result2;
            } else {
              var result1 = parse_array_index();
              if (result1 !== null) {
                var result0 = result1;
              } else {
                var result0 = null;;
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_member_expression() {
        var cacheKey = 'member_expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos4 = pos;
        var savedPos5 = pos;
        var result15 = parse_ooc_primary_expression();
        if (result15 !== null) {
          var result16 = parse_DOT();
          if (result16 !== null) {
            var result17 = parse_ic_member_expression_rec();
            if (result17 !== null) {
              var result13 = [result15, result16, result17];
            } else {
              var result13 = null;
              pos = savedPos5;
            }
          } else {
            var result13 = null;
            pos = savedPos5;
          }
        } else {
          var result13 = null;
          pos = savedPos5;
        }
        var result14 = result13 !== null
          ? (function(p, i) {
            return p + "." + i;
          })(result13[0], result13[2])
          : null;
        if (result14 !== null) {
          var result12 = result14;
        } else {
          var result12 = null;
          pos = savedPos4;
        }
        if (result12 !== null) {
          var result0 = result12;
        } else {
          var savedPos2 = pos;
          var savedPos3 = pos;
          var result10 = parse_ooc_primary_expression();
          if (result10 !== null) {
            var result11 = parse_array_indexing_rec();
            if (result11 !== null) {
              var result8 = [result10, result11];
            } else {
              var result8 = null;
              pos = savedPos3;
            }
          } else {
            var result8 = null;
            pos = savedPos3;
          }
          var result9 = result8 !== null
            ? (function(p, arr) {
              return p + "" + arr;
            })(result8[0], result8[1])
            : null;
          if (result9 !== null) {
            var result7 = result9;
          } else {
            var result7 = null;
            pos = savedPos2;
          }
          if (result7 !== null) {
            var result0 = result7;
          } else {
            var savedPos0 = pos;
            var savedPos1 = pos;
            var result5 = parse_ooc_primary_expression();
            if (result5 !== null) {
              var result6 = parse_function_call_rec();
              if (result6 !== null) {
                var result3 = [result5, result6];
              } else {
                var result3 = null;
                pos = savedPos1;
              }
            } else {
              var result3 = null;
              pos = savedPos1;
            }
            var result4 = result3 !== null
              ? (function(expr, f) {
                return expr + "" + f;
              })(result3[0], result3[1])
              : null;
            if (result4 !== null) {
              var result2 = result4;
            } else {
              var result2 = null;
              pos = savedPos0;
            }
            if (result2 !== null) {
              var result0 = result2;
            } else {
              var result1 = parse_ooc_primary_expression();
              if (result1 !== null) {
                var result0 = result1;
              } else {
                var result0 = null;;
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_ooc_primary_expression() {
        var cacheKey = 'ooc_primary_expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result4 = parse_primary_expression();
        if (result4 !== null) {
          var result0 = result4;
        } else {
          var savedPos0 = pos;
          var result2 = parse_primary_identifier();
          var result3 = result2 !== null
            ? (function(i) {
              return i;
            })(result2)
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_ic_member_expression_rec() {
        var cacheKey = 'ic_member_expression_rec@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_ic_member_expression();
        if (result5 !== null) {
          var result6 = parse_DOT();
          if (result6 !== null) {
            var result7 = parse_ic_member_expression_rec();
            if (result7 !== null) {
              var result3 = [result5, result6, result7];
            } else {
              var result3 = null;
              pos = savedPos1;
            }
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(xp, rec) {
            return xp + "" + rec;
          })(result3[0], result3[2])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_ic_member_expression();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_ic_member_expression() {
        var cacheKey = 'ic_member_expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos4 = pos;
        var savedPos5 = pos;
        var result15 = parse_ic_primary_expression();
        if (result15 !== null) {
          var result16 = parse_DOT();
          if (result16 !== null) {
            var result17 = parse_ic_member_expression();
            if (result17 !== null) {
              var result13 = [result15, result16, result17];
            } else {
              var result13 = null;
              pos = savedPos5;
            }
          } else {
            var result13 = null;
            pos = savedPos5;
          }
        } else {
          var result13 = null;
          pos = savedPos5;
        }
        var result14 = result13 !== null
          ? (function(p, i) {
            return p + "." + i;
          })(result13[0], result13[2])
          : null;
        if (result14 !== null) {
          var result12 = result14;
        } else {
          var result12 = null;
          pos = savedPos4;
        }
        if (result12 !== null) {
          var result0 = result12;
        } else {
          var savedPos2 = pos;
          var savedPos3 = pos;
          var result10 = parse_ic_primary_expression();
          if (result10 !== null) {
            var result11 = parse_array_indexing_rec();
            if (result11 !== null) {
              var result8 = [result10, result11];
            } else {
              var result8 = null;
              pos = savedPos3;
            }
          } else {
            var result8 = null;
            pos = savedPos3;
          }
          var result9 = result8 !== null
            ? (function(p, arr) {
              return p + "" + arr;
            })(result8[0], result8[1])
            : null;
          if (result9 !== null) {
            var result7 = result9;
          } else {
            var result7 = null;
            pos = savedPos2;
          }
          if (result7 !== null) {
            var result0 = result7;
          } else {
            var savedPos0 = pos;
            var savedPos1 = pos;
            var result5 = parse_ic_primary_expression();
            if (result5 !== null) {
              var result6 = parse_function_call_rec();
              if (result6 !== null) {
                var result3 = [result5, result6];
              } else {
                var result3 = null;
                pos = savedPos1;
              }
            } else {
              var result3 = null;
              pos = savedPos1;
            }
            var result4 = result3 !== null
              ? (function(expr, f) {
                return expr + "" + f;
              })(result3[0], result3[1])
              : null;
            if (result4 !== null) {
              var result2 = result4;
            } else {
              var result2 = null;
              pos = savedPos0;
            }
            if (result2 !== null) {
              var result0 = result2;
            } else {
              var result1 = parse_ic_primary_expression();
              if (result1 !== null) {
                var result0 = result1;
              } else {
                var result0 = null;;
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_ic_primary_expression() {
        var cacheKey = 'ic_primary_expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result4 = parse_primary_expression();
        if (result4 !== null) {
          var result0 = result4;
        } else {
          var savedPos0 = pos;
          var result2 = parse_identifier();
          var result3 = result2 !== null
            ? (function(i) {
              return i;
            })(result2)
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_primary_expression() {
        var cacheKey = 'primary_expression@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result12 = parse_special_value();
        if (result12 !== null) {
          var result0 = result12;
        } else {
          var result11 = parse_object_literal();
          if (result11 !== null) {
            var result0 = result11;
          } else {
            var result10 = parse_array_literal();
            if (result10 !== null) {
              var result0 = result10;
            } else {
              var result9 = parse_number();
              if (result9 !== null) {
                var result0 = result9;
              } else {
                var result8 = parse_string();
                if (result8 !== null) {
                  var result0 = result8;
                } else {
                  var result7 = parse_regexp();
                  if (result7 !== null) {
                    var result0 = result7;
                  } else {
                    var savedPos0 = pos;
                    var savedPos1 = pos;
                    var result4 = parse_LPAREN();
                    if (result4 !== null) {
                      var result5 = parse_expression();
                      if (result5 !== null) {
                        var result6 = parse_RPAREN();
                        if (result6 !== null) {
                          var result2 = [result4, result5, result6];
                        } else {
                          var result2 = null;
                          pos = savedPos1;
                        }
                      } else {
                        var result2 = null;
                        pos = savedPos1;
                      }
                    } else {
                      var result2 = null;
                      pos = savedPos1;
                    }
                    var result3 = result2 !== null
                      ? (function(e) {
                        return "(" + e + ")";
                      })(result2[1])
                      : null;
                    if (result3 !== null) {
                      var result1 = result3;
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                    if (result1 !== null) {
                      var result0 = result1;
                    } else {
                      var result0 = null;;
                    };
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_object_literal() {
        var cacheKey = 'object_literal@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_LBRACE();
        if (result3 !== null) {
          var result6 = parse_object_arguments();
          var result4 = result6 !== null ? result6 : '';
          if (result4 !== null) {
            var result5 = parse_RBRACE();
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(args) {
            return "{" + (args ? " " + args + " " : '') + "}";
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_object_arguments() {
        var cacheKey = 'object_arguments@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_object_argument();
        if (result5 !== null) {
          var result6 = parse_COMMA();
          if (result6 !== null) {
            var result7 = parse_object_arguments();
            if (result7 !== null) {
              var result3 = [result5, result6, result7];
            } else {
              var result3 = null;
              pos = savedPos1;
            }
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(a, args) {
            return a + ", " + args;
          })(result3[0], result3[2])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_object_argument();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_object_argument() {
        var cacheKey = 'object_argument@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos2 = pos;
        var savedPos3 = pos;
        var result10 = parse_identifier();
        if (result10 !== null) {
          var result11 = parse_COLON();
          if (result11 !== null) {
            var result12 = parse_expression();
            if (result12 !== null) {
              var result8 = [result10, result11, result12];
            } else {
              var result8 = null;
              pos = savedPos3;
            }
          } else {
            var result8 = null;
            pos = savedPos3;
          }
        } else {
          var result8 = null;
          pos = savedPos3;
        }
        var result9 = result8 !== null
          ? (function(i, e) {
            return i + ": " + e;
          })(result8[0], result8[2])
          : null;
        if (result9 !== null) {
          var result7 = result9;
        } else {
          var result7 = null;
          pos = savedPos2;
        }
        if (result7 !== null) {
          var result0 = result7;
        } else {
          var savedPos0 = pos;
          var savedPos1 = pos;
          var result4 = parse_string();
          if (result4 !== null) {
            var result5 = parse_COLON();
            if (result5 !== null) {
              var result6 = parse_expression();
              if (result6 !== null) {
                var result2 = [result4, result5, result6];
              } else {
                var result2 = null;
                pos = savedPos1;
              }
            } else {
              var result2 = null;
              pos = savedPos1;
            }
          } else {
            var result2 = null;
            pos = savedPos1;
          }
          var result3 = result2 !== null
            ? (function(s, e) {
              return s + ": " + e;
            })(result2[0], result2[2])
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_array_literal() {
        var cacheKey = 'array_literal@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_LBRACKET();
        if (result3 !== null) {
          var result6 = parse_call_arguments();
          var result4 = result6 !== null ? result6 : '';
          if (result4 !== null) {
            var result5 = parse_RBRACKET();
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(args) {
            return "[" + args + "]";
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_identifier() {
        var cacheKey = 'identifier@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        if (input.substr(pos).match(/^[$a-zA-Z_]/) !== null) {
          var result3 = input.charAt(pos);
          pos++;
        } else {
          var result3 = null;
          if (reportMatchFailures) {
            matchFailed("[$a-zA-Z_]");
          }
        }
        if (result3 !== null) {
          var result4 = [];
          if (input.substr(pos).match(/^[$a-zA-Z_0-9]/) !== null) {
            var result5 = input.charAt(pos);
            pos++;
          } else {
            var result5 = null;
            if (reportMatchFailures) {
              matchFailed("[$a-zA-Z_0-9]");
            }
          }
          while (result5 !== null) {
            result4.push(result5);
            if (input.substr(pos).match(/^[$a-zA-Z_0-9]/) !== null) {
              var result5 = input.charAt(pos);
              pos++;
            } else {
              var result5 = null;
              if (reportMatchFailures) {
                matchFailed("[$a-zA-Z_0-9]");
              }
            }
          }
          if (result4 !== null) {
            var result1 = [result3, result4];
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(first, rest) {
            var ident, __indexOf = [].indexOf || function(x){
            var i = -1, l = this.length;
            while (++i < l) if (this.hasOwnProperty(i) && this[i] === x) return i;
            return -1;
          };
          ident = first + "" + (rest ? rest.join("") : "");
          if (__indexOf.call(reserved_words, ident) >= 0) {
            throw new Error("can't use '" + ident + "' as a variable name");
          }
          return ident;
          })(result1[0], result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_primary_identifier() {
        var cacheKey = 'primary_identifier@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result1 = parse_identifier();
        var result2 = result1 !== null
          ? (function(ident) {
            return "$$." + ident;
          })(result1)
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_filter_name() {
        var cacheKey = 'filter_name@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result1 = parse_filter_identifier();
        var result2 = result1 !== null
          ? (function(ident) {
            var ident, filters, id, _i, _ref, _ref2, _len;
          ident = '$' + ident;
          filters = compilation_ctx.filters;
          if (!filters[ident]) {
            throw new Error("No such filter: " + ident);
          }
          if (filters[ident].alias) {
            ident = filters[ident].alias;
          }
          for (_i = 0, _len = (_ref = (_ref2 = filters[ident].dependencies) != null
            ? _ref2
            : []).length; _i < _len; ++_i) {
            id = _ref[_i];
            compilation_ctx.filters_used[id] = filters[id];
          }
          compilation_ctx.filters_used[ident] = filters[ident];
          return ident;
          })(result1)
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_filter_identifier() {
        var cacheKey = 'filter_identifier@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        if (input.substr(pos).match(/^[_a-zA-Z]/) !== null) {
          var result3 = input.charAt(pos);
          pos++;
        } else {
          var result3 = null;
          if (reportMatchFailures) {
            matchFailed("[_a-zA-Z]");
          }
        }
        if (result3 !== null) {
          var result4 = [];
          if (input.substr(pos).match(/^[_a-zA-Z0-9]/) !== null) {
            var result5 = input.charAt(pos);
            pos++;
          } else {
            var result5 = null;
            if (reportMatchFailures) {
              matchFailed("[_a-zA-Z0-9]");
            }
          }
          while (result5 !== null) {
            result4.push(result5);
            if (input.substr(pos).match(/^[_a-zA-Z0-9]/) !== null) {
              var result5 = input.charAt(pos);
              pos++;
            } else {
              var result5 = null;
              if (reportMatchFailures) {
                matchFailed("[_a-zA-Z0-9]");
              }
            }
          }
          if (result4 !== null) {
            var result1 = [result3, result4];
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(first, next) {
            return first + "" + (next ? next.join("") : "");
          })(result1[0], result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_number() {
        var cacheKey = 'number@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos3 = pos;
        var savedPos4 = pos;
        if (input.substr(pos).match(/^[0-9]/) !== null) {
          var result17 = input.charAt(pos);
          pos++;
        } else {
          var result17 = null;
          if (reportMatchFailures) {
            matchFailed("[0-9]");
          }
        }
        if (result17 !== null) {
          var result13 = [];
          while (result17 !== null) {
            result13.push(result17);
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result17 = input.charAt(pos);
              pos++;
            } else {
              var result17 = null;
              if (reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
          }
        } else {
          var result13 = null;
        }
        if (result13 !== null) {
          if (input.substr(pos, 1) === ".") {
            var result14 = ".";
            pos += 1;
          } else {
            var result14 = null;
            if (reportMatchFailures) {
              matchFailed("\".\"");
            }
          }
          if (result14 !== null) {
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result16 = input.charAt(pos);
              pos++;
            } else {
              var result16 = null;
              if (reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
            if (result16 !== null) {
              var result15 = [];
              while (result16 !== null) {
                result15.push(result16);
                if (input.substr(pos).match(/^[0-9]/) !== null) {
                  var result16 = input.charAt(pos);
                  pos++;
                } else {
                  var result16 = null;
                  if (reportMatchFailures) {
                    matchFailed("[0-9]");
                  }
                }
              }
            } else {
              var result15 = null;
            }
            if (result15 !== null) {
              var result11 = [result13, result14, result15];
            } else {
              var result11 = null;
              pos = savedPos4;
            }
          } else {
            var result11 = null;
            pos = savedPos4;
          }
        } else {
          var result11 = null;
          pos = savedPos4;
        }
        var result12 = result11 !== null
          ? (function(f, d, s) {
            return f.join("") + "" + d + s.join("");
          })(result11[0], result11[1], result11[2])
          : null;
        if (result12 !== null) {
          var result10 = result12;
        } else {
          var result10 = null;
          pos = savedPos3;
        }
        if (result10 !== null) {
          var result0 = result10;
        } else {
          var savedPos2 = pos;
          if (input.substr(pos).match(/^[0-9]/) !== null) {
            var result9 = input.charAt(pos);
            pos++;
          } else {
            var result9 = null;
            if (reportMatchFailures) {
              matchFailed("[0-9]");
            }
          }
          if (result9 !== null) {
            var result7 = [];
            while (result9 !== null) {
              result7.push(result9);
              if (input.substr(pos).match(/^[0-9]/) !== null) {
                var result9 = input.charAt(pos);
                pos++;
              } else {
                var result9 = null;
                if (reportMatchFailures) {
                  matchFailed("[0-9]");
                }
              }
            }
          } else {
            var result7 = null;
          }
          var result8 = result7 !== null
            ? (function(n) {
              return n.join("") + "";
            })(result7)
            : null;
          if (result8 !== null) {
            var result6 = result8;
          } else {
            var result6 = null;
            pos = savedPos2;
          }
          if (result6 !== null) {
            var result0 = result6;
          } else {
            var savedPos0 = pos;
            var savedPos1 = pos;
            var result4 = parse_MINUS();
            if (result4 !== null) {
              var result5 = parse_number();
              if (result5 !== null) {
                var result2 = [result4, result5];
              } else {
                var result2 = null;
                pos = savedPos1;
              }
            } else {
              var result2 = null;
              pos = savedPos1;
            }
            var result3 = result2 !== null
              ? (function(n) {
                return "-" + n;
              })(result2[1])
              : null;
            if (result3 !== null) {
              var result1 = result3;
            } else {
              var result1 = null;
              pos = savedPos0;
            }
            if (result1 !== null) {
              var result0 = result1;
            } else {
              var result0 = null;;
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_string() {
        var cacheKey = 'string@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos2 = pos;
        var savedPos3 = pos;
        var result22 = parse_space();
        var result15 = result22 !== null ? result22 : '';
        if (result15 !== null) {
          if (input.substr(pos, 1) === "'") {
            var result16 = "'";
            pos += 1;
          } else {
            var result16 = null;
            if (reportMatchFailures) {
              matchFailed("\"'\"");
            }
          }
          if (result16 !== null) {
            var result21 = parse_single_quoted_contents();
            var result17 = result21 !== null ? result21 : '';
            if (result17 !== null) {
              if (input.substr(pos, 1) === "'") {
                var result18 = "'";
                pos += 1;
              } else {
                var result18 = null;
                if (reportMatchFailures) {
                  matchFailed("\"'\"");
                }
              }
              if (result18 !== null) {
                var result20 = parse_space();
                var result19 = result20 !== null ? result20 : '';
                if (result19 !== null) {
                  var result13 = [result15, result16, result17, result18, result19];
                } else {
                  var result13 = null;
                  pos = savedPos3;
                }
              } else {
                var result13 = null;
                pos = savedPos3;
              }
            } else {
              var result13 = null;
              pos = savedPos3;
            }
          } else {
            var result13 = null;
            pos = savedPos3;
          }
        } else {
          var result13 = null;
          pos = savedPos3;
        }
        var result14 = result13 !== null
          ? (function(sglcnt) {
            return "'" + sglcnt + "'";
          })(result13[2])
          : null;
        if (result14 !== null) {
          var result12 = result14;
        } else {
          var result12 = null;
          pos = savedPos2;
        }
        if (result12 !== null) {
          var result0 = result12;
        } else {
          var savedPos0 = pos;
          var savedPos1 = pos;
          var result11 = parse_space();
          var result4 = result11 !== null ? result11 : '';
          if (result4 !== null) {
            if (input.substr(pos, 1) === "\"") {
              var result5 = "\"";
              pos += 1;
            } else {
              var result5 = null;
              if (reportMatchFailures) {
                matchFailed("\"\\\"\"");
              }
            }
            if (result5 !== null) {
              var result10 = parse_double_quoted_contents();
              var result6 = result10 !== null ? result10 : '';
              if (result6 !== null) {
                if (input.substr(pos, 1) === "\"") {
                  var result7 = "\"";
                  pos += 1;
                } else {
                  var result7 = null;
                  if (reportMatchFailures) {
                    matchFailed("\"\\\"\"");
                  }
                }
                if (result7 !== null) {
                  var result9 = parse_space();
                  var result8 = result9 !== null ? result9 : '';
                  if (result8 !== null) {
                    var result2 = [result4, result5, result6, result7, result8];
                  } else {
                    var result2 = null;
                    pos = savedPos1;
                  }
                } else {
                  var result2 = null;
                  pos = savedPos1;
                }
              } else {
                var result2 = null;
                pos = savedPos1;
              }
            } else {
              var result2 = null;
              pos = savedPos1;
            }
          } else {
            var result2 = null;
            pos = savedPos1;
          }
          var result3 = result2 !== null
            ? (function(dblcnt) {
              return "\"" + dblcnt + "\"";
            })(result2[2])
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_regexp() {
        var cacheKey = 'regexp@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result13 = parse_space();
        var result3 = result13 !== null ? result13 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "/") {
            var result4 = "/";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"/\"");
            }
          }
          if (result4 !== null) {
            var result12 = parse_regexp_contents();
            var result5 = result12 !== null ? result12 : '';
            if (result5 !== null) {
              if (input.substr(pos, 1) === "/") {
                var result6 = "/";
                pos += 1;
              } else {
                var result6 = null;
                if (reportMatchFailures) {
                  matchFailed("\"/\"");
                }
              }
              if (result6 !== null) {
                if (input.substr(pos).match(/^[a-z]/) !== null) {
                  var result11 = input.charAt(pos);
                  pos++;
                } else {
                  var result11 = null;
                  if (reportMatchFailures) {
                    matchFailed("[a-z]");
                  }
                }
                if (result11 !== null) {
                  var result10 = [];
                  while (result11 !== null) {
                    result10.push(result11);
                    if (input.substr(pos).match(/^[a-z]/) !== null) {
                      var result11 = input.charAt(pos);
                      pos++;
                    } else {
                      var result11 = null;
                      if (reportMatchFailures) {
                        matchFailed("[a-z]");
                      }
                    }
                  }
                } else {
                  var result10 = null;
                }
                var result7 = result10 !== null ? result10 : '';
                if (result7 !== null) {
                  var result9 = parse_space();
                  var result8 = result9 !== null ? result9 : '';
                  if (result8 !== null) {
                    var result1 = [result3, result4, result5, result6, result7, result8];
                  } else {
                    var result1 = null;
                    pos = savedPos1;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos1;
                }
              } else {
                var result1 = null;
                pos = savedPos1;
              }
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(regcnt, modifs) {
            return "/" + regcnt + "/" + (modifs ? modifs.join("") : "");
          })(result1[2], result1[4])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_single_quoted_contents() {
        var cacheKey = 'single_quoted_contents@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_single_quoted_terminal();
        if (result5 !== null) {
          var result6 = parse_single_quoted_contents();
          if (result6 !== null) {
            var result3 = [result5, result6];
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(s1, s2) {
            return s1 + s2;
          })(result3[0], result3[1])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_single_quoted_terminal();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_single_quoted_terminal() {
        var cacheKey = 'single_quoted_terminal@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 2) === "\\'") {
          var result2 = "\\'";
          pos += 2;
        } else {
          var result2 = null;
          if (reportMatchFailures) {
            matchFailed("\"\\\\'\"");
          }
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          if (input.substr(pos).match(/^[^']/) !== null) {
            var result1 = input.charAt(pos);
            pos++;
          } else {
            var result1 = null;
            if (reportMatchFailures) {
              matchFailed("[^']");
            }
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_double_quoted_contents() {
        var cacheKey = 'double_quoted_contents@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_double_quoted_terminal();
        if (result5 !== null) {
          var result6 = parse_double_quoted_contents();
          if (result6 !== null) {
            var result3 = [result5, result6];
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(s1, s2) {
            return s1 + s2;
          })(result3[0], result3[1])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_double_quoted_terminal();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_double_quoted_terminal() {
        var cacheKey = 'double_quoted_terminal@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 2) === "\\\"") {
          var result2 = "\\\"";
          pos += 2;
        } else {
          var result2 = null;
          if (reportMatchFailures) {
            matchFailed("\"\\\\\\\"\"");
          }
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          if (input.substr(pos).match(/^[^"]/) !== null) {
            var result1 = input.charAt(pos);
            pos++;
          } else {
            var result1 = null;
            if (reportMatchFailures) {
              matchFailed("[^\"]");
            }
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_regexp_contents() {
        var cacheKey = 'regexp_contents@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_regexp_terminal();
        if (result5 !== null) {
          var result6 = parse_regexp_contents();
          if (result6 !== null) {
            var result3 = [result5, result6];
          } else {
            var result3 = null;
            pos = savedPos1;
          }
        } else {
          var result3 = null;
          pos = savedPos1;
        }
        var result4 = result3 !== null
          ? (function(s1, s2) {
            return s1 + s2;
          })(result3[0], result3[1])
          : null;
        if (result4 !== null) {
          var result2 = result4;
        } else {
          var result2 = null;
          pos = savedPos0;
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_regexp_terminal();
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_regexp_terminal() {
        var cacheKey = 'regexp_terminal@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 2) === "\\/") {
          var result2 = "\\/";
          pos += 2;
        } else {
          var result2 = null;
          if (reportMatchFailures) {
            matchFailed("\"\\\\/\"");
          }
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          if (input.substr(pos).match(/^[^\/]/) !== null) {
            var result1 = input.charAt(pos);
            pos++;
          } else {
            var result1 = null;
            if (reportMatchFailures) {
              matchFailed("[^\\/]");
            }
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_space() {
        var cacheKey = 'space@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos).match(/^[	\n\r ]/) !== null) {
          var result3 = input.charAt(pos);
          pos++;
        } else {
          var result3 = null;
          if (reportMatchFailures) {
            matchFailed("[	\\n\\r ]");
          }
        }
        if (result3 !== null) {
          var result1 = [];
          while (result3 !== null) {
            result1.push(result3);
            if (input.substr(pos).match(/^[	\n\r ]/) !== null) {
              var result3 = input.charAt(pos);
              pos++;
            } else {
              var result3 = null;
              if (reportMatchFailures) {
                matchFailed("[	\\n\\r ]");
              }
            }
          }
        } else {
          var result1 = null;
        }
        var result2 = result1 !== null
          ? (function() {
            return " ";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_MINUS() {
        var cacheKey = 'MINUS@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "-") {
            var result4 = "-";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"-\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "-";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_COMMA() {
        var cacheKey = 'COMMA@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === ",") {
            var result4 = ",";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\",\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return ",";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_COLON() {
        var cacheKey = 'COLON@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === ":") {
            var result4 = ":";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\":\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return ":";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_QUESTION_MARK() {
        var cacheKey = 'QUESTION_MARK@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "?") {
            var result4 = "?";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"?\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "?";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_LPAREN() {
        var cacheKey = 'LPAREN@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "(") {
            var result4 = "(";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"(\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "(";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_RPAREN() {
        var cacheKey = 'RPAREN@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === ")") {
            var result4 = ")";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\")\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return ")";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_LBRACE() {
        var cacheKey = 'LBRACE@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "{") {
            var result4 = "{";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"{\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "\u007B";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_RBRACE() {
        var cacheKey = 'RBRACE@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "}") {
            var result4 = "}";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"}\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "\u007D";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_LBRACKET() {
        var cacheKey = 'LBRACKET@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "[") {
            var result4 = "[";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"[\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "[";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_RBRACKET() {
        var cacheKey = 'RBRACKET@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "]") {
            var result4 = "]";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"]\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "]";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_PIPE() {
        var cacheKey = 'PIPE@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result5 = parse_space();
        var result3 = result5 !== null ? result5 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "|") {
            var result4 = "|";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"|\"");
            }
          }
          if (result4 !== null) {
            var result1 = [result3, result4];
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "|";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_DOT() {
        var cacheKey = 'DOT@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === ".") {
            var result4 = ".";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\".\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return ".";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_IN() {
        var cacheKey = 'IN@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 2) === "in") {
            var result4 = "in";
            pos += 2;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"in\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return " in ";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_ASSIGN() {
        var cacheKey = 'ASSIGN@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 1) === "=") {
            var result4 = "=";
            pos += 1;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"=\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return " = ";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_unary() {
        var cacheKey = 'unary@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          var result4 = parse_UNARY_OPERATOR();
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(op) {
            return op + " ";
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_UNARY_OPERATOR() {
        var cacheKey = 'UNARY_OPERATOR@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 1) === "!") {
          var result11 = "!";
          pos += 1;
        } else {
          var result11 = null;
          if (reportMatchFailures) {
            matchFailed("\"!\"");
          }
        }
        if (result11 !== null) {
          var result0 = result11;
        } else {
          var savedPos0 = pos;
          if (input.substr(pos, 3) === "not") {
            var result9 = "not";
            pos += 3;
          } else {
            var result9 = null;
            if (reportMatchFailures) {
              matchFailed("\"not\"");
            }
          }
          var result10 = result9 !== null
            ? (function() {
              return "!";
            })()
            : null;
          if (result10 !== null) {
            var result8 = result10;
          } else {
            var result8 = null;
            pos = savedPos0;
          }
          if (result8 !== null) {
            var result0 = result8;
          } else {
            if (input.substr(pos, 1) === "~") {
              var result7 = "~";
              pos += 1;
            } else {
              var result7 = null;
              if (reportMatchFailures) {
                matchFailed("\"~\"");
              }
            }
            if (result7 !== null) {
              var result0 = result7;
            } else {
              if (input.substr(pos, 2) === "++") {
                var result6 = "++";
                pos += 2;
              } else {
                var result6 = null;
                if (reportMatchFailures) {
                  matchFailed("\"++\"");
                }
              }
              if (result6 !== null) {
                var result0 = result6;
              } else {
                if (input.substr(pos, 2) === "--") {
                  var result5 = "--";
                  pos += 2;
                } else {
                  var result5 = null;
                  if (reportMatchFailures) {
                    matchFailed("\"--\"");
                  }
                }
                if (result5 !== null) {
                  var result0 = result5;
                } else {
                  if (input.substr(pos, 6) === "typeof") {
                    var result4 = "typeof";
                    pos += 6;
                  } else {
                    var result4 = null;
                    if (reportMatchFailures) {
                      matchFailed("\"typeof\"");
                    }
                  }
                  if (result4 !== null) {
                    var result0 = result4;
                  } else {
                    if (input.substr(pos, 4) === "void") {
                      var result3 = "void";
                      pos += 4;
                    } else {
                      var result3 = null;
                      if (reportMatchFailures) {
                        matchFailed("\"void\"");
                      }
                    }
                    if (result3 !== null) {
                      var result0 = result3;
                    } else {
                      if (input.substr(pos, 3) === "new") {
                        var result2 = "new";
                        pos += 3;
                      } else {
                        var result2 = null;
                        if (reportMatchFailures) {
                          matchFailed("\"new\"");
                        }
                      }
                      if (result2 !== null) {
                        var result0 = result2;
                      } else {
                        if (input.substr(pos, 6) === "delete") {
                          var result1 = "delete";
                          pos += 6;
                        } else {
                          var result1 = null;
                          if (reportMatchFailures) {
                            matchFailed("\"delete\"");
                          }
                        }
                        if (result1 !== null) {
                          var result0 = result1;
                        } else {
                          var result0 = null;;
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_post_unary() {
        var cacheKey = 'post_unary@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          var result4 = parse_POST_UNARY_OPERATOR();
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(op) {
            return " " + op;
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_POST_UNARY_OPERATOR() {
        var cacheKey = 'POST_UNARY_OPERATOR@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 2) === "++") {
          var result2 = "++";
          pos += 2;
        } else {
          var result2 = null;
          if (reportMatchFailures) {
            matchFailed("\"++\"");
          }
        }
        if (result2 !== null) {
          var result0 = result2;
        } else {
          if (input.substr(pos, 2) === "--") {
            var result1 = "--";
            pos += 2;
          } else {
            var result1 = null;
            if (reportMatchFailures) {
              matchFailed("\"--\"");
            }
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_binary() {
        var cacheKey = 'binary@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos2 = pos;
        var savedPos3 = pos;
        var result16 = parse_space();
        var result12 = result16 !== null ? result16 : '';
        if (result12 !== null) {
          var result13 = parse_TEXT_BINARY_OPERATOR();
          if (result13 !== null) {
            var result15 = parse_space();
            var result14 = result15 !== null ? result15 : '';
            if (result14 !== null) {
              var result10 = [result12, result13, result14];
            } else {
              var result10 = null;
              pos = savedPos3;
            }
          } else {
            var result10 = null;
            pos = savedPos3;
          }
        } else {
          var result10 = null;
          pos = savedPos3;
        }
        var result11 = result10 !== null
          ? (function(op) {
            return " " + op + " ";
          })(result10[1])
          : null;
        if (result11 !== null) {
          var result9 = result11;
        } else {
          var result9 = null;
          pos = savedPos2;
        }
        if (result9 !== null) {
          var result0 = result9;
        } else {
          var savedPos0 = pos;
          var savedPos1 = pos;
          var result8 = parse_space();
          var result4 = result8 !== null ? result8 : '';
          if (result4 !== null) {
            var result5 = parse_BINARY_OPERATOR();
            if (result5 !== null) {
              var result7 = parse_space();
              var result6 = result7 !== null ? result7 : '';
              if (result6 !== null) {
                var result2 = [result4, result5, result6];
              } else {
                var result2 = null;
                pos = savedPos1;
              }
            } else {
              var result2 = null;
              pos = savedPos1;
            }
          } else {
            var result2 = null;
            pos = savedPos1;
          }
          var result3 = result2 !== null
            ? (function(op) {
              return " " + op + " ";
            })(result2[1])
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_TEXT_BINARY_OPERATOR() {
        var cacheKey = 'TEXT_BINARY_OPERATOR@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 10) === "instanceof") {
          var result7 = "instanceof";
          pos += 10;
        } else {
          var result7 = null;
          if (reportMatchFailures) {
            matchFailed("\"instanceof\"");
          }
        }
        if (result7 !== null) {
          var result0 = result7;
        } else {
          var savedPos1 = pos;
          if (input.substr(pos, 3) === "and") {
            var result5 = "and";
            pos += 3;
          } else {
            var result5 = null;
            if (reportMatchFailures) {
              matchFailed("\"and\"");
            }
          }
          var result6 = result5 !== null
            ? (function() {
              return "&&";
            })()
            : null;
          if (result6 !== null) {
            var result4 = result6;
          } else {
            var result4 = null;
            pos = savedPos1;
          }
          if (result4 !== null) {
            var result0 = result4;
          } else {
            var savedPos0 = pos;
            if (input.substr(pos, 2) === "or") {
              var result2 = "or";
              pos += 2;
            } else {
              var result2 = null;
              if (reportMatchFailures) {
                matchFailed("\"or\"");
              }
            }
            var result3 = result2 !== null
              ? (function() {
                return "||";
              })()
              : null;
            if (result3 !== null) {
              var result1 = result3;
            } else {
              var result1 = null;
              pos = savedPos0;
            }
            if (result1 !== null) {
              var result0 = result1;
            } else {
              var result0 = null;;
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_BINARY_OPERATOR() {
        var cacheKey = 'BINARY_OPERATOR@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 3) === ">>>") {
          var result28 = ">>>";
          pos += 3;
        } else {
          var result28 = null;
          if (reportMatchFailures) {
            matchFailed("\">>>\"");
          }
        }
        if (result28 !== null) {
          var result0 = result28;
        } else {
          if (input.substr(pos, 3) === "===") {
            var result27 = "===";
            pos += 3;
          } else {
            var result27 = null;
            if (reportMatchFailures) {
              matchFailed("\"===\"");
            }
          }
          if (result27 !== null) {
            var result0 = result27;
          } else {
            if (input.substr(pos, 3) === "!==") {
              var result26 = "!==";
              pos += 3;
            } else {
              var result26 = null;
              if (reportMatchFailures) {
                matchFailed("\"!==\"");
              }
            }
            if (result26 !== null) {
              var result0 = result26;
            } else {
              if (input.substr(pos, 2) === "==") {
                var result25 = "==";
                pos += 2;
              } else {
                var result25 = null;
                if (reportMatchFailures) {
                  matchFailed("\"==\"");
                }
              }
              if (result25 !== null) {
                var result0 = result25;
              } else {
                if (input.substr(pos, 2) === "!=") {
                  var result24 = "!=";
                  pos += 2;
                } else {
                  var result24 = null;
                  if (reportMatchFailures) {
                    matchFailed("\"!=\"");
                  }
                }
                if (result24 !== null) {
                  var result0 = result24;
                } else {
                  if (input.substr(pos, 2) === ">=") {
                    var result23 = ">=";
                    pos += 2;
                  } else {
                    var result23 = null;
                    if (reportMatchFailures) {
                      matchFailed("\">=\"");
                    }
                  }
                  if (result23 !== null) {
                    var result0 = result23;
                  } else {
                    if (input.substr(pos, 2) === "<=") {
                      var result22 = "<=";
                      pos += 2;
                    } else {
                      var result22 = null;
                      if (reportMatchFailures) {
                        matchFailed("\"<=\"");
                      }
                    }
                    if (result22 !== null) {
                      var result0 = result22;
                    } else {
                      if (input.substr(pos, 2) === "&&") {
                        var result21 = "&&";
                        pos += 2;
                      } else {
                        var result21 = null;
                        if (reportMatchFailures) {
                          matchFailed("\"&&\"");
                        }
                      }
                      if (result21 !== null) {
                        var result0 = result21;
                      } else {
                        if (input.substr(pos, 2) === "||") {
                          var result20 = "||";
                          pos += 2;
                        } else {
                          var result20 = null;
                          if (reportMatchFailures) {
                            matchFailed("\"||\"");
                          }
                        }
                        if (result20 !== null) {
                          var result0 = result20;
                        } else {
                          if (input.substr(pos, 2) === "<<") {
                            var result19 = "<<";
                            pos += 2;
                          } else {
                            var result19 = null;
                            if (reportMatchFailures) {
                              matchFailed("\"<<\"");
                            }
                          }
                          if (result19 !== null) {
                            var result0 = result19;
                          } else {
                            if (input.substr(pos, 2) === ">>") {
                              var result18 = ">>";
                              pos += 2;
                            } else {
                              var result18 = null;
                              if (reportMatchFailures) {
                                matchFailed("\">>\"");
                              }
                            }
                            if (result18 !== null) {
                              var result0 = result18;
                            } else {
                              if (input.substr(pos, 2) === "+=") {
                                var result17 = "+=";
                                pos += 2;
                              } else {
                                var result17 = null;
                                if (reportMatchFailures) {
                                  matchFailed("\"+=\"");
                                }
                              }
                              if (result17 !== null) {
                                var result0 = result17;
                              } else {
                                if (input.substr(pos, 2) === "-=") {
                                  var result16 = "-=";
                                  pos += 2;
                                } else {
                                  var result16 = null;
                                  if (reportMatchFailures) {
                                    matchFailed("\"-=\"");
                                  }
                                }
                                if (result16 !== null) {
                                  var result0 = result16;
                                } else {
                                  if (input.substr(pos, 2) === "%=") {
                                    var result15 = "%=";
                                    pos += 2;
                                  } else {
                                    var result15 = null;
                                    if (reportMatchFailures) {
                                      matchFailed("\"%=\"");
                                    }
                                  }
                                  if (result15 !== null) {
                                    var result0 = result15;
                                  } else {
                                    if (input.substr(pos, 2) === "/=") {
                                      var result14 = "/=";
                                      pos += 2;
                                    } else {
                                      var result14 = null;
                                      if (reportMatchFailures) {
                                        matchFailed("\"/=\"");
                                      }
                                    }
                                    if (result14 !== null) {
                                      var result0 = result14;
                                    } else {
                                      if (input.substr(pos, 2) === "*=") {
                                        var result13 = "*=";
                                        pos += 2;
                                      } else {
                                        var result13 = null;
                                        if (reportMatchFailures) {
                                          matchFailed("\"*=\"");
                                        }
                                      }
                                      if (result13 !== null) {
                                        var result0 = result13;
                                      } else {
                                        if (input.substr(pos, 1) === "=") {
                                          var result12 = "=";
                                          pos += 1;
                                        } else {
                                          var result12 = null;
                                          if (reportMatchFailures) {
                                            matchFailed("\"=\"");
                                          }
                                        }
                                        if (result12 !== null) {
                                          var result0 = result12;
                                        } else {
                                          if (input.substr(pos, 1) === "|") {
                                            var result11 = "|";
                                            pos += 1;
                                          } else {
                                            var result11 = null;
                                            if (reportMatchFailures) {
                                              matchFailed("\"|\"");
                                            }
                                          }
                                          if (result11 !== null) {
                                            var result0 = result11;
                                          } else {
                                            if (input.substr(pos, 1) === "/") {
                                              var result10 = "/";
                                              pos += 1;
                                            } else {
                                              var result10 = null;
                                              if (reportMatchFailures) {
                                                matchFailed("\"/\"");
                                              }
                                            }
                                            if (result10 !== null) {
                                              var result0 = result10;
                                            } else {
                                              if (input.substr(pos, 1) === "^") {
                                                var result9 = "^";
                                                pos += 1;
                                              } else {
                                                var result9 = null;
                                                if (reportMatchFailures) {
                                                  matchFailed("\"^\"");
                                                }
                                              }
                                              if (result9 !== null) {
                                                var result0 = result9;
                                              } else {
                                                if (input.substr(pos, 1) === "&") {
                                                  var result8 = "&";
                                                  pos += 1;
                                                } else {
                                                  var result8 = null;
                                                  if (reportMatchFailures) {
                                                    matchFailed("\"&\"");
                                                  }
                                                }
                                                if (result8 !== null) {
                                                  var result0 = result8;
                                                } else {
                                                  if (input.substr(pos, 1) === "|") {
                                                    var result7 = "|";
                                                    pos += 1;
                                                  } else {
                                                    var result7 = null;
                                                    if (reportMatchFailures) {
                                                      matchFailed("\"|\"");
                                                    }
                                                  }
                                                  if (result7 !== null) {
                                                    var result0 = result7;
                                                  } else {
                                                    if (input.substr(pos, 1) === "+") {
                                                      var result6 = "+";
                                                      pos += 1;
                                                    } else {
                                                      var result6 = null;
                                                      if (reportMatchFailures) {
                                                        matchFailed("\"+\"");
                                                      }
                                                    }
                                                    if (result6 !== null) {
                                                      var result0 = result6;
                                                    } else {
                                                      if (input.substr(pos, 1) === ">") {
                                                        var result5 = ">";
                                                        pos += 1;
                                                      } else {
                                                        var result5 = null;
                                                        if (reportMatchFailures) {
                                                          matchFailed("\">\"");
                                                        }
                                                      }
                                                      if (result5 !== null) {
                                                        var result0 = result5;
                                                      } else {
                                                        if (input.substr(pos, 1) === "<") {
                                                          var result4 = "<";
                                                          pos += 1;
                                                        } else {
                                                          var result4 = null;
                                                          if (reportMatchFailures) {
                                                            matchFailed("\"<\"");
                                                          }
                                                        }
                                                        if (result4 !== null) {
                                                          var result0 = result4;
                                                        } else {
                                                          if (input.substr(pos, 1) === "%") {
                                                            var result3 = "%";
                                                            pos += 1;
                                                          } else {
                                                            var result3 = null;
                                                            if (reportMatchFailures) {
                                                              matchFailed("\"%\"");
                                                            }
                                                          }
                                                          if (result3 !== null) {
                                                            var result0 = result3;
                                                          } else {
                                                            if (input.substr(pos, 1) === "-") {
                                                              var result2 = "-";
                                                              pos += 1;
                                                            } else {
                                                              var result2 = null;
                                                              if (reportMatchFailures) {
                                                                matchFailed("\"-\"");
                                                              }
                                                            }
                                                            if (result2 !== null) {
                                                              var result0 = result2;
                                                            } else {
                                                              if (input.substr(pos, 1) === "*") {
                                                                var result1 = "*";
                                                                pos += 1;
                                                              } else {
                                                                var result1 = null;
                                                                if (reportMatchFailures) {
                                                                  matchFailed("\"*\"");
                                                                }
                                                              }
                                                              if (result1 !== null) {
                                                                var result0 = result1;
                                                              } else {
                                                                var result0 = null;;
                                                              };
                                                            };
                                                          };
                                                        };
                                                      };
                                                    };
                                                  };
                                                };
                                              };
                                            };
                                          };
                                        };
                                      };
                                    };
                                  };
                                };
                              };
                            };
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_NEW() {
        var cacheKey = 'NEW@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          if (input.substr(pos, 3) === "new") {
            var result4 = "new";
            pos += 3;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("\"new\"");
            }
          }
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function() {
            return "new";
          })()
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_special_value() {
        var cacheKey = 'special_value@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result7 = parse_space();
        var result3 = result7 !== null ? result7 : '';
        if (result3 !== null) {
          var result4 = parse_SPECIAL();
          if (result4 !== null) {
            var result6 = parse_space();
            var result5 = result6 !== null ? result6 : '';
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(s) {
            return s;
          })(result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_SPECIAL() {
        var cacheKey = 'SPECIAL@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 5) === "false") {
          var result6 = "false";
          pos += 5;
        } else {
          var result6 = null;
          if (reportMatchFailures) {
            matchFailed("\"false\"");
          }
        }
        if (result6 !== null) {
          var result0 = result6;
        } else {
          if (input.substr(pos, 4) === "true") {
            var result5 = "true";
            pos += 4;
          } else {
            var result5 = null;
            if (reportMatchFailures) {
              matchFailed("\"true\"");
            }
          }
          if (result5 !== null) {
            var result0 = result5;
          } else {
            if (input.substr(pos, 4) === "this") {
              var result4 = "this";
              pos += 4;
            } else {
              var result4 = null;
              if (reportMatchFailures) {
                matchFailed("\"this\"");
              }
            }
            if (result4 !== null) {
              var result0 = result4;
            } else {
              if (input.substr(pos, 4) === "void") {
                var result3 = "void";
                pos += 4;
              } else {
                var result3 = null;
                if (reportMatchFailures) {
                  matchFailed("\"void\"");
                }
              }
              if (result3 !== null) {
                var result0 = result3;
              } else {
                if (input.substr(pos, 4) === "null") {
                  var result2 = "null";
                  pos += 4;
                } else {
                  var result2 = null;
                  if (reportMatchFailures) {
                    matchFailed("\"null\"");
                  }
                }
                if (result2 !== null) {
                  var result0 = result2;
                } else {
                  if (input.substr(pos, 9) === "undefined") {
                    var result1 = "undefined";
                    pos += 9;
                  } else {
                    var result1 = null;
                    if (reportMatchFailures) {
                      matchFailed("\"undefined\"");
                    }
                  }
                  if (result1 !== null) {
                    var result0 = result1;
                  } else {
                    var result0 = null;;
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_tag_for() {
        var cacheKey = 'tag_for@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos2 = pos;
        var savedPos3 = pos;
        var result12 = parse_identifier();
        if (result12 !== null) {
          var result13 = parse_IN();
          if (result13 !== null) {
            var result14 = parse_expression();
            if (result14 !== null) {
              var result10 = [result12, result13, result14];
            } else {
              var result10 = null;
              pos = savedPos3;
            }
          } else {
            var result10 = null;
            pos = savedPos3;
          }
        } else {
          var result10 = null;
          pos = savedPos3;
        }
        var result11 = result10 !== null
          ? (function(key, exp) {
            return {
            key: key,
            condition: exp
          };
          })(result10[0], result10[2])
          : null;
        if (result11 !== null) {
          var result9 = result11;
        } else {
          var result9 = null;
          pos = savedPos2;
        }
        if (result9 !== null) {
          var result0 = result9;
        } else {
          var savedPos0 = pos;
          var savedPos1 = pos;
          var result4 = parse_identifier();
          if (result4 !== null) {
            var result5 = parse_COMMA();
            if (result5 !== null) {
              var result6 = parse_identifier();
              if (result6 !== null) {
                var result7 = parse_IN();
                if (result7 !== null) {
                  var result8 = parse_expression();
                  if (result8 !== null) {
                    var result2 = [result4, result5, result6, result7, result8];
                  } else {
                    var result2 = null;
                    pos = savedPos1;
                  }
                } else {
                  var result2 = null;
                  pos = savedPos1;
                }
              } else {
                var result2 = null;
                pos = savedPos1;
              }
            } else {
              var result2 = null;
              pos = savedPos1;
            }
          } else {
            var result2 = null;
            pos = savedPos1;
          }
          var result3 = result2 !== null
            ? (function(key, value, exp) {
              return {
              key: key,
              value: value,
              condition: exp
            };
            })(result2[0], result2[2], result2[4])
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_tag_let() {
        var cacheKey = 'tag_let@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_identifier();
        if (result3 !== null) {
          var result4 = parse_ASSIGN();
          if (result4 !== null) {
            var result5 = parse_expression();
            if (result5 !== null) {
              var result1 = [result3, result4, result5];
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(variable_name, expression) {
            return {
            variable_name: variable_name,
            expression: expression
          };
          })(result1[0], result1[2])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_tag_macro() {
        var cacheKey = 'tag_macro@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_identifier();
        if (result3 !== null) {
          var result4 = parse_LPAREN();
          if (result4 !== null) {
            var result7 = parse_macro_call_arguments();
            var result5 = result7 !== null ? result7 : '';
            if (result5 !== null) {
              var result6 = parse_RPAREN();
              if (result6 !== null) {
                var result1 = [result3, result4, result5, result6];
              } else {
                var result1 = null;
                pos = savedPos1;
              }
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(function_name, args) {
            return {
            function_name: function_name,
            args: args == '' ? [] : args
          };
          })(result1[0], result1[2])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_macro_call_arguments() {
        var cacheKey = 'macro_call_arguments@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result3 = parse_macro_argument();
        if (result3 !== null) {
          var result4 = [];
          var savedPos2 = pos;
          var savedPos3 = pos;
          var result8 = parse_COMMA();
          if (result8 !== null) {
            var result9 = parse_macro_argument();
            if (result9 !== null) {
              var result6 = [result8, result9];
            } else {
              var result6 = null;
              pos = savedPos3;
            }
          } else {
            var result6 = null;
            pos = savedPos3;
          }
          var result7 = result6 !== null
            ? (function(arg) { return arg; })(result6[1])
            : null;
          if (result7 !== null) {
            var result5 = result7;
          } else {
            var result5 = null;
            pos = savedPos2;
          }
          while (result5 !== null) {
            result4.push(result5);
            var savedPos2 = pos;
            var savedPos3 = pos;
            var result8 = parse_COMMA();
            if (result8 !== null) {
              var result9 = parse_macro_argument();
              if (result9 !== null) {
                var result6 = [result8, result9];
              } else {
                var result6 = null;
                pos = savedPos3;
              }
            } else {
              var result6 = null;
              pos = savedPos3;
            }
            var result7 = result6 !== null
              ? (function(arg) { return arg; })(result6[1])
              : null;
            if (result7 !== null) {
              var result5 = result7;
            } else {
              var result5 = null;
              pos = savedPos2;
            }
          }
          if (result4 !== null) {
            var result1 = [result3, result4];
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(first, other_args) {
            var arg, res;
          res = [first].concat((function(){
            var _i, _ref, _len, _results = [];
            for (_i = 0, _len = (_ref = other_args).length; _i < _len; ++_i) {
              arg = _ref[_i];
              _results.push(arg);
            }
            return _results;
          }()));
          return res;
          })(result1[0], result1[1])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_macro_argument() {
        var cacheKey = 'macro_argument@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos1 = pos;
        var savedPos2 = pos;
        var result7 = parse_identifier();
        if (result7 !== null) {
          var result8 = parse_ASSIGN();
          if (result8 !== null) {
            var result9 = parse_expression();
            if (result9 !== null) {
              var result5 = [result7, result8, result9];
            } else {
              var result5 = null;
              pos = savedPos2;
            }
          } else {
            var result5 = null;
            pos = savedPos2;
          }
        } else {
          var result5 = null;
          pos = savedPos2;
        }
        var result6 = result5 !== null
          ? (function(name, exp) {
            return {
            name: name,
            default_value: exp
          };
          })(result5[0], result5[2])
          : null;
        if (result6 !== null) {
          var result4 = result6;
        } else {
          var result4 = null;
          pos = savedPos1;
        }
        if (result4 !== null) {
          var result0 = result4;
        } else {
          var savedPos0 = pos;
          var result2 = parse_identifier();
          var result3 = result2 !== null
            ? (function(name) {
              return {
              name: name
            };
            })(result2)
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_tag_block() {
        var cacheKey = 'tag_block@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var result9 = parse_space();
        var result3 = result9 !== null ? result9 : '';
        if (result3 !== null) {
          if (input.substr(pos).match(/^[a-zA-Z_]/) !== null) {
            var result4 = input.charAt(pos);
            pos++;
          } else {
            var result4 = null;
            if (reportMatchFailures) {
              matchFailed("[a-zA-Z_]");
            }
          }
          if (result4 !== null) {
            var result5 = [];
            if (input.substr(pos).match(/^[\-a-zA-Z0-9_]/) !== null) {
              var result8 = input.charAt(pos);
              pos++;
            } else {
              var result8 = null;
              if (reportMatchFailures) {
                matchFailed("[\\-a-zA-Z0-9_]");
              }
            }
            while (result8 !== null) {
              result5.push(result8);
              if (input.substr(pos).match(/^[\-a-zA-Z0-9_]/) !== null) {
                var result8 = input.charAt(pos);
                pos++;
              } else {
                var result8 = null;
                if (reportMatchFailures) {
                  matchFailed("[\\-a-zA-Z0-9_]");
                }
              }
            }
            if (result5 !== null) {
              var result7 = parse_space();
              var result6 = result7 !== null ? result7 : '';
              if (result6 !== null) {
                var result1 = [result3, result4, result5, result6];
              } else {
                var result1 = null;
                pos = savedPos1;
              }
            } else {
              var result1 = null;
              pos = savedPos1;
            }
          } else {
            var result1 = null;
            pos = savedPos1;
          }
        } else {
          var result1 = null;
          pos = savedPos1;
        }
        var result2 = result1 !== null
          ? (function(first_letter, next_letters) {
            return first_letter + "" + (next_letters ? next_letters.join("") : '');
          })(result1[1], result1[2])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_tag_import() {
        var cacheKey = 'tag_import@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos3 = pos;
        var savedPos4 = pos;
        var result20 = parse_expression();
        if (result20 !== null) {
          var result32 = parse_space();
          var result21 = result32 !== null ? result32 : '';
          if (result21 !== null) {
            if (input.substr(pos, 6) === "import") {
              var result22 = "import";
              pos += 6;
            } else {
              var result22 = null;
              if (reportMatchFailures) {
                matchFailed("\"import\"");
              }
            }
            if (result22 !== null) {
              var result31 = parse_space();
              var result23 = result31 !== null ? result31 : '';
              if (result23 !== null) {
                var result24 = parse_variable_list();
                if (result24 !== null) {
                  var savedPos5 = pos;
                  var result27 = parse_space();
                  if (result27 !== null) {
                    if (input.substr(pos, 4) === "with") {
                      var result28 = "with";
                      pos += 4;
                    } else {
                      var result28 = null;
                      if (reportMatchFailures) {
                        matchFailed("\"with\"");
                      }
                    }
                    if (result28 !== null) {
                      var result29 = parse_space();
                      if (result29 !== null) {
                        if (input.substr(pos, 7) === "context") {
                          var result30 = "context";
                          pos += 7;
                        } else {
                          var result30 = null;
                          if (reportMatchFailures) {
                            matchFailed("\"context\"");
                          }
                        }
                        if (result30 !== null) {
                          var result26 = [result27, result28, result29, result30];
                        } else {
                          var result26 = null;
                          pos = savedPos5;
                        }
                      } else {
                        var result26 = null;
                        pos = savedPos5;
                      }
                    } else {
                      var result26 = null;
                      pos = savedPos5;
                    }
                  } else {
                    var result26 = null;
                    pos = savedPos5;
                  }
                  var result25 = result26 !== null ? result26 : '';
                  if (result25 !== null) {
                    var result18 = [result20, result21, result22, result23, result24, result25];
                  } else {
                    var result18 = null;
                    pos = savedPos4;
                  }
                } else {
                  var result18 = null;
                  pos = savedPos4;
                }
              } else {
                var result18 = null;
                pos = savedPos4;
              }
            } else {
              var result18 = null;
              pos = savedPos4;
            }
          } else {
            var result18 = null;
            pos = savedPos4;
          }
        } else {
          var result18 = null;
          pos = savedPos4;
        }
        var result19 = result18 !== null
          ? (function(exp, args, ctx) {
            return {
            template: exp,
            variables: args,
            with_context: ctx !== ""
          };
          })(result18[0], result18[4], result18[5])
          : null;
        if (result19 !== null) {
          var result17 = result19;
        } else {
          var result17 = null;
          pos = savedPos3;
        }
        if (result17 !== null) {
          var result0 = result17;
        } else {
          var savedPos0 = pos;
          var savedPos1 = pos;
          var result4 = parse_expression();
          if (result4 !== null) {
            var result16 = parse_space();
            var result5 = result16 !== null ? result16 : '';
            if (result5 !== null) {
              if (input.substr(pos, 2) === "as") {
                var result6 = "as";
                pos += 2;
              } else {
                var result6 = null;
                if (reportMatchFailures) {
                  matchFailed("\"as\"");
                }
              }
              if (result6 !== null) {
                var result15 = parse_space();
                var result7 = result15 !== null ? result15 : '';
                if (result7 !== null) {
                  var result8 = parse_identifier();
                  if (result8 !== null) {
                    var savedPos2 = pos;
                    var result11 = parse_space();
                    if (result11 !== null) {
                      if (input.substr(pos, 4) === "with") {
                        var result12 = "with";
                        pos += 4;
                      } else {
                        var result12 = null;
                        if (reportMatchFailures) {
                          matchFailed("\"with\"");
                        }
                      }
                      if (result12 !== null) {
                        var result13 = parse_space();
                        if (result13 !== null) {
                          if (input.substr(pos, 7) === "context") {
                            var result14 = "context";
                            pos += 7;
                          } else {
                            var result14 = null;
                            if (reportMatchFailures) {
                              matchFailed("\"context\"");
                            }
                          }
                          if (result14 !== null) {
                            var result10 = [result11, result12, result13, result14];
                          } else {
                            var result10 = null;
                            pos = savedPos2;
                          }
                        } else {
                          var result10 = null;
                          pos = savedPos2;
                        }
                      } else {
                        var result10 = null;
                        pos = savedPos2;
                      }
                    } else {
                      var result10 = null;
                      pos = savedPos2;
                    }
                    var result9 = result10 !== null ? result10 : '';
                    if (result9 !== null) {
                      var result2 = [result4, result5, result6, result7, result8, result9];
                    } else {
                      var result2 = null;
                      pos = savedPos1;
                    }
                  } else {
                    var result2 = null;
                    pos = savedPos1;
                  }
                } else {
                  var result2 = null;
                  pos = savedPos1;
                }
              } else {
                var result2 = null;
                pos = savedPos1;
              }
            } else {
              var result2 = null;
              pos = savedPos1;
            }
          } else {
            var result2 = null;
            pos = savedPos1;
          }
          var result3 = result2 !== null
            ? (function(exp, id, ctx) {
              return {
              template: exp,
              as_name: id,
              with_context: ctx !== ""
            };
            })(result2[0], result2[4], result2[5])
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_variable_list() {
        var cacheKey = 'variable_list@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos1 = pos;
        var savedPos2 = pos;
        var result7 = parse_identifier();
        if (result7 !== null) {
          var result8 = parse_COMMA();
          if (result8 !== null) {
            var result9 = parse_variable_list();
            if (result9 !== null) {
              var result5 = [result7, result8, result9];
            } else {
              var result5 = null;
              pos = savedPos2;
            }
          } else {
            var result5 = null;
            pos = savedPos2;
          }
        } else {
          var result5 = null;
          pos = savedPos2;
        }
        var result6 = result5 !== null
          ? (function(id, list) {
            list.push(id);
          return list;
          })(result5[0], result5[2])
          : null;
        if (result6 !== null) {
          var result4 = result6;
        } else {
          var result4 = null;
          pos = savedPos1;
        }
        if (result4 !== null) {
          var result0 = result4;
        } else {
          var savedPos0 = pos;
          var result2 = parse_identifier();
          var result3 = result2 !== null
            ? (function(id) {
              return [id];
            })(result2)
            : null;
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result1 = null;
            pos = savedPos0;
          }
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function buildErrorMessage() {
        function buildExpected(failuresExpected) {
          failuresExpected.sort();
          
          var lastFailure = null;
          var failuresExpectedUnique = [];
          for (var i = 0; i < failuresExpected.length; i++) {
            if (failuresExpected[i] !== lastFailure) {
              failuresExpectedUnique.push(failuresExpected[i]);
              lastFailure = failuresExpected[i];
            }
          }
          
          switch (failuresExpectedUnique.length) {
            case 0:
              return 'end of input';
            case 1:
              return failuresExpectedUnique[0];
            default:
              return failuresExpectedUnique.slice(0, failuresExpectedUnique.length - 1).join(', ')
                + ' or '
                + failuresExpectedUnique[failuresExpectedUnique.length - 1];
          }
        }
        
        var expected = buildExpected(rightmostMatchFailuresExpected);
        var actualPos = Math.max(pos, rightmostMatchFailuresPos);
        var actual = actualPos < input.length
          ? quote(input.charAt(actualPos))
          : 'end of input';
        
        return 'Expected ' + expected + ' but ' + actual + ' found.';
      }
      
      function computeErrorPosition() {
        /*
         * The first idea was to use |String.split| to break the input up to the
         * error position along newlines and derive the line and column from
         * there. However IE's |split| implementation is so broken that it was
         * enough to prevent it.
         */
        
        var line = 1;
        var column = 1;
        var seenCR = false;
        
        for (var i = 0; i <  rightmostMatchFailuresPos; i++) {
          var ch = input.charAt(i);
          if (ch === '\n') {
            if (!seenCR) { line++; }
            column = 1;
            seenCR = false;
          } else if (ch === '\r' | ch === '\u2028' || ch === '\u2029') {
            line++;
            column = 1;
            seenCR = true;
          } else {
            column++;
            seenCR = false;
          }
        }
        
        return { line: line, column: column };
      }
      
      
      
    var compilation_ctx, make_filter, reserved_words, _ref;
      
  compilation_ctx = (_ref = arguments[2]) != null
      
    ? _ref
      
    : {};
      
  compilation_ctx.filters == null && (compilation_ctx.filters = {});
      
  compilation_ctx.filters_used == null && (compilation_ctx.filters_used = {});
      
  make_filter = function(expression, filters){
      
    var res, f, args, _i, _len;
      
    res = expression;
      
    for (_i = 0, _len = filters.length; _i < _len; ++_i) {
      
      f = filters[_i];
      
      args = "";
      
      if (f.args) {
      
        args = ", " + f.args;
      
      }
      
      res = f.name + ".call($$," + res + args + ")";
      
    }
      
    return res;
      
  };
      
  reserved_words = ["abstract", "as", "boolean", "break", "byte", "case", "catch", "char", "class", "continue", "const", "debugger", "default", "delete", "do", "double", "else", "enum", "export", "extends", "false", "final", "finally", "float", "for", "function", "goto", "if", "implements", "import", "in", "instanceof", "int", "interface", "is", "long", "namespace", "native", "new", "null", "package", "private", "protected", "public", "return", "short", "static", "switch", "synchronized", "this", "throw", "throws", "transient", "true", "try", "typeof", "use", "var", "void", "volatile", "while", "with"];
      
  
      
      var result = parseFunctions[startRule]();
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostMatchFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostMatchFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostMatchFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        var errorPosition = computeErrorPosition();
        throw new this.SyntaxError(
          buildErrorMessage(),
          errorPosition.line,
          errorPosition.column
        );
      }
      
      return result;
    },
    
    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(message, line, column) {
    this.name = 'SyntaxError';
    this.message = message;
    this.line = line;
    this.column = column;
  };
  
  result.SyntaxError.prototype = Error.prototype;
  
  return result;
})(); var _parse = module.exports.parse; module.exports.parse = function (input, startRule, options) {if (startRule instanceof Object) { options = startRule; startRule = undefined; }return _parse (input, startRule, options);};
});

require.define("/module_template.js", function (require, module, exports, __dirname, __filename) {
var _require = require;
var require = (function (_require) {
    return function (mod) { 
        if ((typeof mod === "object") && (mod.render != null))
            return mod;
        return require(mod);
    };
})(_require);
var __last_ctx__ = null;

var __indexOf = [].indexOf || function(x) {
    for (var i = this.length - 1; i >= 0; i--)
        if (this[i] === x) return i;
};

if (!Object.keys) Object.keys = function(o){
 if (o !== Object(o))
      throw new TypeError('Object.keys called on non-object');
 var ret=[],p;
 for(p in o) if(Object.prototype.hasOwnProperty.call(o,p)) ret.push(p);
 return ret;
}

function __in(obj, container){
    if (obj instanceof Array) {
      return __indexOf.call(container, obj) > -1;
    }
    return container[obj] != null;
  }function __import(obj, src){
    var own, key;
    own = {}.hasOwnProperty;
    for (key in src) {
      if (own.call(src, key)) {
        obj[key] = src[key];
      }
    }
    return obj;
  }
function $default(value, default_value){
        if (value == null) {
          return default_value;
        }
        return value;
      }

// RENDERING FUNCTION, EVERYTHING HAPPENS HERE.
function render ($$) {
    $$ = ($$ === undefined || $$ === null) ? {} : $$;
    var _ref = undefined;
    var _res = '';
    var _i = 0;
    var __extends__ = null;
        
    _res += 'var _require = function (mod) { \n    if ((typeof mod === \"object\") && (mod.render != null))\n        return mod;\n    return ';
    _res += ((_ref = $default.call($$,$$.require_exp, "require")) !== undefined && _ref !== null ? _ref : '').toString();
    _res += '(mod);\n};\nvar __last_ctx__ = null;\n\nvar __indexOf = [].indexOf || function(x) {\n    for (var i = this.length - 1; i >= 0; i--)\n        if (this[i] === x) return i;\n};\n\nif (!Object.keys) Object.keys = function(o){\n if (o !== Object(o))\n      throw new TypeError(\'Object.keys called on non-object\');\n var ret=[],p;\n for(p in o) if(Object.prototype.hasOwnProperty.call(o,p)) ret.push(p);\n return ret;\n}\n\n';
    (function() {var _fref = $$.utils || [], _prev_loop = $$.loop, _prev_key = $$['fname'], _prev_value = $$['fn'], k = null, v = null, i = 0, l = 0, x = null, last_v = null, last_k = null;$$.loop = { };
    if (_fref instanceof Array) {l = _fref.length;for (i = 0; i < l; i++) {$$.loop.last = (i == l - 1);$$.loop.first = (i == 0);$$.loop.index0 = i;$$.loop.index = i + 1;$$['fname'] = _fref[i]; $$['fn'] = i;
    _res += ((_ref = $$.fn) !== undefined && _ref !== null ? _ref : '').toString();}
    } else {$$.loop = { first: true, last: false };l = Object.keys(_fref).length;for (x in _fref) { if (_fref.hasOwnProperty(x)) {$$.loop.last = (i == l - 1);$$['fname'] = x;$$['fn'] = _fref[x];$$.loop.index0 = i;$$.loop.index = i + 1;
    _res += ((_ref = $$.fn) !== undefined && _ref !== null ? _ref : '').toString();i += 1;$$.loop.first = false;} }}
    if ($$.loop.index == undefined) {}$$.loop = _prev_loop; $$['fname'] = _prev_key; $$['fn'] = _prev_value;})();
    _res += '\n';
    (function() {var _fref = $$.filters_used || [], _prev_loop = $$.loop, _prev_key = $$['fn_name'], _prev_value = $$['decl'], k = null, v = null, i = 0, l = 0, x = null, last_v = null, last_k = null;$$.loop = { };
    if (_fref instanceof Array) {l = _fref.length;for (i = 0; i < l; i++) {$$.loop.last = (i == l - 1);$$.loop.first = (i == 0);$$.loop.index0 = i;$$.loop.index = i + 1;$$['fn_name'] = _fref[i]; $$['decl'] = i;
    _res += ((_ref = $$.decl) !== undefined && _ref !== null ? _ref : '').toString();
    _res += '\n';}
    } else {$$.loop = { first: true, last: false };l = Object.keys(_fref).length;for (x in _fref) { if (_fref.hasOwnProperty(x)) {$$.loop.last = (i == l - 1);$$['fn_name'] = x;$$['decl'] = _fref[x];$$.loop.index0 = i;$$.loop.index = i + 1;
    _res += ((_ref = $$.decl) !== undefined && _ref !== null ? _ref : '').toString();
    _res += '\n';i += 1;$$.loop.first = false;} }}
    if ($$.loop.index == undefined) {}$$.loop = _prev_loop; $$['fn_name'] = _prev_key; $$['decl'] = _prev_value;})();
    _res += '\n';
    if ($$.blocks) {
        _res += '// Start Block Definitions\n\n';
        (function() {var _fref = $$.blocks || [], _prev_loop = $$.loop, _prev_key = $$['name'], _prev_value = $$['contents'], k = null, v = null, i = 0, l = 0, x = null, last_v = null, last_k = null;$$.loop = { };
        if (_fref instanceof Array) {l = _fref.length;for (i = 0; i < l; i++) {$$.loop.last = (i == l - 1);$$.loop.first = (i == 0);$$.loop.index0 = i;$$.loop.index = i + 1;$$['name'] = _fref[i]; $$['contents'] = i;
        _res += '// Block declaration of \"';
        _res += ((_ref = $$.name) !== undefined && _ref !== null ? _ref : '').toString();
        _res += '\"\nfunction __block_';
        _res += ((_ref = $$.name) !== undefined && _ref !== null ? _ref : '').toString();
        _res += ' ($$) {\n    var require = _require;\n    var _b = ($$ ? $$.__blocks__ : {});\n    var _res = \"\";\n    var __extends__ = null;\n    ';
        _res += ((_ref = $$.contents) !== undefined && _ref !== null ? _ref : '').toString();
        _res += '\n    return _res;\n}\n';}
        } else {$$.loop = { first: true, last: false };l = Object.keys(_fref).length;for (x in _fref) { if (_fref.hasOwnProperty(x)) {$$.loop.last = (i == l - 1);$$['name'] = x;$$['contents'] = _fref[x];$$.loop.index0 = i;$$.loop.index = i + 1;
        _res += '// Block declaration of \"';
        _res += ((_ref = $$.name) !== undefined && _ref !== null ? _ref : '').toString();
        _res += '\"\nfunction __block_';
        _res += ((_ref = $$.name) !== undefined && _ref !== null ? _ref : '').toString();
        _res += ' ($$) {\n    var require = _require;\n    var _b = ($$ ? $$.__blocks__ : {});\n    var _res = \"\";\n    var __extends__ = null;\n    ';
        _res += ((_ref = $$.contents) !== undefined && _ref !== null ? _ref : '').toString();
        _res += '\n    return _res;\n}\n';i += 1;$$.loop.first = false;} }}
        if ($$.loop.index == undefined) {}$$.loop = _prev_loop; $$['name'] = _prev_key; $$['contents'] = _prev_value;})();
        _res += '\n// End Block Definitions\n';
    }
    _res += '// RENDERING FUNCTION, EVERYTHING HAPPENS HERE.\nfunction render ($$) {\n    $$ = ($$ === undefined || $$ === null) ? {} : $$;\n    var _ref = undefined;\n    var _res = \'\';\n    var _i = 0;\n    var __extends__ = null;\n    var require = _require;\n    ';
    if ($$.blocks) {
        _res += '    var _b = null;\n    ($$.__blocks__ == null) && ($$.__blocks__ = {});\n    _b = $$.__blocks__;\n    var __newblocks__ = {};\n    var _block_iterator = null;\n    ';
    }
    _res += '    ';
    _res += ((_ref = $$.body) !== undefined && _ref !== null ? _ref : '').toString();
    _res += '\n    if (__extends__ !== undefined && __extends__ !== null) return __extends__.render($$);\n    return _res;\n}\nexports.render = render;\n\nfunction _cached_ctx () {\n    if (!__last_ctx__) {\n        __last_ctx__ = {};\n        render(__last_ctx__);\n    }\n    return __last_ctx__;\n}\nexports._cached_ctx = _cached_ctx;\n';
    if (__extends__ !== undefined && __extends__ !== null) return __extends__.render($$);
    return _res;
}
exports.render = render;

function _cached_ctx () {
    if (!__last_ctx__) {
        __last_ctx__ = {};
        render(__last_ctx__);
    }
    return __last_ctx__;
}
exports._cached_ctx = _cached_ctx;

});

require.define("fs", function (require, module, exports, __dirname, __filename) {
// nothing to see here... no file methods for the browser

});

require.define("/utils.js", function (require, module, exports, __dirname, __filename) {
(function(){
  function __in(obj, container){
    if (obj instanceof Array) {
      return __indexOf.call(container, obj) > -1;
    }
    return container[obj] != null;
  }
  function __import(obj, src){
    var own, key;
    own = {}.hasOwnProperty;
    for (key in src) {
      if (own.call(src, key)) {
        obj[key] = src[key];
      }
    }
    return obj;
  }
  exports.__in = __in;
  exports.__import = __import;
}).call(this);

});

require.define("/filters.js", function (require, module, exports, __dirname, __filename) {
/**
    BEWARE : In this module, you can't have any require() out of the functions, nor
    can you use all of coco's shortcuts : all of these are meant to be used with .toString() !
**/
(function(){
  __import(exports, {
    /**
     * Return the absolute value of the argument.
     */
    $abs: (function(){
      function $abs(num){
        if (num < 0) {
          return -num;
        }
        return num;
      }
      return $abs;
    }())
    /**
     * A filter that batches items. It works pretty much like slice just the other way round. 
     * It returns a list of lists with the given number of items. 
     * If you provide a second parameter this is used to fill missing items.
     */,
    $batch: (function(){
      function $batch(value, linecount, fill_with){
        var result, i, tmpres, j, _to, _to2;
        fill_with == null && (fill_with = null);
        result = [];
        for (i = 0, _to = value.length - 1; linecount < 0 ? i >= _to : i <= _to; i += linecount) {
          tmpres = [];
          for (j = 0, _to2 = linecount - 1; j <= _to2; ++j) {
            if (!(i + j in value)) {
              if (fill_with == null) {
                break;
              }
              tmpres.push(fill_with);
            } else {
              tmpres.push(value[i + j]);
            }
          }
          result.push(tmpres);
        }
        return result;
      }
      return $batch;
    }())
    /**
     *  Capitalize a string.
     */,
    $capitalize: (function(){
      function $capitalize(str){
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      }
      return $capitalize;
    }())
    /**
     *  Center monospaced text.
     */,
    $center: (function(){
      function $center(value, width){
        var leading;
        width == null && (width = 80);
        if (value.length >= width - 1) {
          return value;
        }
        leading = $repeat(" ", (width - value.length) / 2);
        return leading + value;
      }
      return $center;
    }()),
    $count: (function(){
      function $count(){
        return exports.length.apply(this, arguments);
      }
      return $count;
    }())
    /**
     *  Formats a date.
     *  TODO : not completely done.
     */,
    $date: (function(){
      function $date(d, format){
        var _pad;
        _pad = function(v){
          if (v < 10) {
            return "0" + v;
          }
          return v;
        };
        return format.replace(/%[%cdfHIjmMpSUwWxXyYzZ]/g, function(s){
          var y;
          switch (s[1]) {
          case 'c':
            return d.toLocaleDateString() + " " + d.toLocaleTimeString();
          case 'd':
            return _pad(d.getDate());
          case 'f':
            return d.getMilliseconds();
          case 'H':
            return _pad(d.getHours());
          case 'I':
            return _pad(d.getHours() % 12);
          case 'j':
            return '';
          case 'm':
            return _pad(d.getMonth() + 1);
          case 'M':
            return _pad(d.getMinutes());
          case 'p':
            return '';
          case 'S':
            return _pad(d.getSeconds());
          case 'U':
            return '';
          case 'w':
            return d.getDay();
          case 'W':
            return '';
          case 'x':
            return d.toLocaleDateString();
          case 'X':
            return d.toLocalTimeString();
          case 'y':
            y = d.getFullYear();
            return "" + _pad(Math.round((y / 100 - Math.floor(y / 100)) * 100));
          case 'Y':
            return d.getFullYear();
          case 'z':
            return d.getTimezoneOffset();
          case 'Z':
            try {
              return d.getTimezone();
            } catch (e) {
              return '';
            }
            break;
          case '%':
            return '%';
          default:
            return '#error';
          }
        });
      }
      return $date;
    }())
    /**
     *  Alias for default.
     */,
    $d: (function(){
      function $d(){
        return exports['default'].apply(this, arguments);
      }
      return $d;
    }())
    /**
     *  Return a default value.
     *  @param default_value: The value to return
     *      when `value` is null.
     */,
    $default: (function(){
      function $default(value, default_value){
        if (value == null) {
          return default_value;
        }
        return value;
      }
      return $default;
    }())
    /**
     *  Return a list with 
     */,
    $dictsort: (function(){
      function $dictsort(value, case_sensitive, _by){
        var result, k, v;
        case_sensitive == null && (case_sensitive = false);
        _by == null && (_by = 'key');
        result = [];
        for (k in value) {
          v = value[k];
          result.push([k, v]);
        }
        result.sort(function(a, b){
          var i;
          if (_by === 'value') {
            i = 1;
          } else {
            i = 0;
          }
          a = a[i];
          b = b[i];
          if (!case_sensitive) {
            a = a.toString().toUpperCase();
            b = b.toString().toUpperCase();
          }
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
          return 0;
        });
        return result;
      }
      return $dictsort;
    }()),
    $e: {
      alias: "$escape"
    },
    $escape: (function(){
      function $escape(value){
        return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      }
      return $escape;
    }())
    /**
     *  Escape a string to make it Javascript/JSON compliant.
     */,
    $escapejs: (function(){
      function $escapejs(value){
        var _unicode;
        _unicode = function(s){
          s = s.charCodeAt(0).toString(16);
          return "\\u" + $repeat("0", 4 - s.length) + s;
        };
        return value.replace(/./g, function(s){
          if (('a' <= s && s <= 'z') || ('A' <= s && s <= 'Z') || ('0' <= s && s <= '9')) {
            return s;
          }
          return _unicode(s);
        });
      }
      return $escapejs;
    }()),
    $filesizeformat: (function(){
      function $filesizeformat(value){
        var val, unit, strval;
        if (value < 1024) {
          return value + "";
        }
        if (value < 1024 * 1024) {
          val = val / 1024;
          unit = "Kb";
        } else if (value < 1024 * 1024 * 1024) {
          val = val / (1024 * 1024);
          unit = "Mb";
        } else {
          val = val / (1024 * 1024 * 1024);
          unit = "Gb";
        }
        strval = Math.round(val) + "";
        return val.toPrecision(strval.length + 3) + "Kb";
      }
      return $filesizeformat;
    }()),
    $first: (function(){
      function $first(arr){
        return arr != null ? arr[0] : void 8;
      }
      return $first;
    }()),
    $float: (function(){
      function $float(value){
        var res;
        res = parseFloat(value);
        if (res === NaN) {
          return 0.0;
        }
        return res;
      }
      return $float;
    }()),
    $forceescape: (function(){
      function $forceescape(value){
        throw new Error('unimplemented');
      }
      return $forceescape;
    }()),
    $format: (function(){
      function $format(value, args, kwargs){
        args == null && (args = []);
        kwargs == null && (kwargs = {});
        throw new Error('unimplemented');
      }
      return $format;
    }())
    /**
     *  NOTE: only usable in the {% for grouper, list %} notation.
     *  @param attribute: The attribute to group by.
     */,
    $groupby: (function(){
      function $groupby(arr, attribute){
        var result, obj, grouper, _i, _len;
        result = {};
        for (_i = 0, _len = arr.length; _i < _len; ++_i) {
          obj = arr[_i];
          grouper = $resolve_attr(obj, attribute);
          result[grouper] == null && (result[grouper] = []);
          result[grouper].push(obj);
        }
        return result;
      }
      return $groupby;
    }()),
    $in: (function(){
      function $in(obj, arr){
        var x;
        x = null;
        for (x in arr) {
          if (arr.hasOwnProperty(x) && obj === arr[x]) {
            return true;
          }
        }
        return false;
      }
      return $in;
    }()),
    $indent: (function(){
      function $indent(value, width, indentfirst){
        var first;
        width == null && (width = 4);
        indentfirst == null && (indentfirst = false);
        first = true;
        return value.replace(/^/gm, function(s){
          if (!first || indentfirst) {
            return $repeat(" ", width) + s;
          }
          first = false;
          return s;
        });
      }
      return $indent;
    }()),
    $join: (function(){
      function $join(arr, string, attribute){
        var o, _res, _i, _len;
        string == null && (string = "");
        attribute == null && (attribute = null);
        if ((arr != null ? arr.length : void 8) > 0) {
          if (attribute) {
            _res = [];
            for (_i = 0, _len = arr.length; _i < _len; ++_i) {
              o = arr[_i];
              _res.push($resolve_attr(o, attribute).toString());
            }
            arr = _res;
          }
          return arr.join(string);
        }
        return "";
      }
      return $join;
    }()),
    $last: (function(){
      function $last(arr){
        if (!(arr != null && arr.length)) {
          return null;
        }
        return arr[arr.length - 1];
      }
      return $last;
    }()),
    $length: (function(){
      function $length(arr){
        if (arr == null) {
          return 0;
        }
        return arr.length;
      }
      return $length;
    }()),
    $lower: (function(){
      function $lower(value){
        return value.toString().toLowerCase();
      }
      return $lower;
    }()),
    $pprint_: (function(){
      function $pprint_(node, fmter){
        function real_pprint(node, fmter, met){
          var index, is_array, props, k, v, i, prop, _len;
          met == null && (met = []);
          if (node instanceof Function) {
            return fmter('function', node);
          } else if (node instanceof RegExp) {
            return fmter('regexp', node);
          } else if (node instanceof Object) {
            index = met.indexOf(node);
            if (index != -1) {
              fmter('obj-already', index);
              return;
            }
            met.push(node);
            index = met.length - 1;
            is_array = node instanceof Array;
            fmter('obj-pre', is_array, index);
            props = [];
            for (k in node) {
              v = node[k];
              if (node.hasOwnProperty(k)) {
                if (v instanceof String) {
                  console.log(v);
                }
                props.push({
                  lbl: k,
                  node: v
                });
              }
            }
            props.sort(function(a, b){
              if (a < b) {
                return -1;
              }
              if (a > b) {
                return 1;
              }
              return 0;
            });
            for (i = 0, _len = props.length; i < _len; ++i) {
              prop = props[i];
              if (i != 0) {
                fmter('obj-sep');
              }
              if (!is_array) {
                fmter('obj-label', prop.lbl);
              }
              real_pprint(prop.node, fmter, met);
            }
            return fmter('obj-post', node instanceof Array);
          } else if (node instanceof String || typeof node === 'string') {
            return fmter('string', node);
          } else if (node instanceof Number || typeof node === 'number') {
            return fmter('number', node);
          } else if (node instanceof Boolean || typeof node === 'boolean') {
            return fmter('boolean', node);
          } else if (node == null) {
            return fmter('empty');
          }
        }
        return real_pprint(node, fmter);
      }
      return $pprint_;
    }()),
    $pprint: (function(){
      function $pprint(value, verbose, depth){
        var res;
        verbose == null && (verbose = false);
        depth == null && (depth = 0);
        res = [];
        $pprint_(value, function(type, node){
          switch (type) {
          case 'obj-pre':
            return res.push(node ? "[ " : "{ ");
          case 'obj-post':
            return res.push(node ? " ]" : " }");
          case 'obj-already':
            return res.push("[cycle]");
          case 'obj-sep':
            return res.push(", ");
          case 'obj-label':
            return res.push(node + ": ");
          case 'string':
            return res.push("\"" + node + "\"");
          case 'number':
            return res.push(node + "");
          case 'regexp':
            return res.push("/" + node + "/");
          case 'function':
            return res.push("[function]");
          case 'boolean':
            return res.push(node + "");
          case 'empty':
            return res.push("\u2205");
          default:
            return res.push(node);
          }
        });
        return res.join("");
      }
      return $pprint;
    }()),
    $hprint: (function(){
      function $hprint(value, verbose, depth){
        var unique, res, cur_depth, fmt;
        verbose == null && (verbose = false);
        depth == null && (depth = 0);
        unique = "hprint-" + Date.now();
        res = [];
        cur_depth = 0;
        res.push("<span class='hprint-value'>");
        fmt = (function(){
          function fmt(val, type, color, morestyle){
            morestyle == null && (morestyle = "");
            return "<span class='hprint-" + type + "' style='color:" + color + ";" + morestyle + "'>" + val + "</span>";
          }
          return fmt;
        }());
        $pprint_(value, function(type, node, index){
          if (type === 'obj-pre') {
            cur_depth = cur_depth + 1;
          }
          if (type === 'obj-post') {
            cur_depth = cur_depth - 1;
          }
          if (depth > 0 && cur_depth >= depth) {
            return;
          }
          switch (type) {
          case 'obj-pre':
            res.push(fmt(node ? "[ " : "{ ", 'open', 'gray', "font-weight: bold;"));
            return res.push("<span id='" + unique + "-" + index + "' class='hprint-object hprint-depth-" + cur_depth + "'>");
          case 'obj-post':
            res.push("</span>");
            return res.push(fmt(node ? " ]" : " }", 'close', 'gray', "font-weight: bold;"));
          case 'obj-already':
            return res.push(fmt("<a href='#" + unique + "-" + node + "'>[cycle]</a>", 'cycle', 'cyan'));
          case 'obj-sep':
            return res.push(", ");
          case 'obj-label':
            return res.push("<span class='hprint-label'>" + node + ": </span>");
          case 'string':
            return res.push(fmt("\"" + $escape(node) + "\"", 'string', 'goldenrod'));
          case 'number':
            return res.push(fmt(node + "", 'number', 'magenta'));
          case 'regexp':
            return res.push(fmt($escape(node.toString()) + "", 'regexp', 'lightgreen'));
          case 'function':
            return res.push(fmt("[function]", 'function', 'salmon'));
          case 'boolean':
            return res.push(fmt(node + "", 'boolean', 'magenta'));
          case 'empty':
            return res.push(fmt("\u2205", 'empty', 'magenta'));
          default:
            return res.push(node);
          }
        });
        res.push("</span>");
        return res.join("");
      }
      return $hprint;
    }()),
    $random: (function(){
      function $random(list){
        var index;
        if ((list != null ? list.length : void 8) > 0) {
          index = Math.floor(Math.random() * (list.length - 1) + 1);
          return list[index];
        }
        return "";
      }
      return $random;
    }()),
    $repeat: (function(){
      function $repeat(str, n){
        var r, i, _to;
        r = '';
        for (i = 0, _to = n - 1; i <= _to; ++i) {
          r += str;
        }
        return r;
      }
      return $repeat;
    }()),
    $replace: (function(){
      function $replace(string, regexp, newvalue, count){
        count == null && (count = null);
        if (typeof regexp === 'string') {
          regexp = new RegExp(regexp, 'g');
        }
        return string.replace(regexp, function(s){
          if (count != null) {
            if (count <= 0) {
              return s;
            }
            count = count - 1;
          }
          return s.replace(regexp, newvalue);
        });
      }
      return $replace;
    }()),
    $resolve_attr: (function(){
      function $resolve_attr(obj, att){
        var attrs, a, _i, _len;
        attrs = att.split('.');
        for (_i = 0, _len = attrs.length; _i < _len; ++_i) {
          a = attrs[_i];
          obj = obj[a];
        }
        return obj;
      }
      return $resolve_attr;
    }()),
    $reverse: (function(){
      function $reverse(arr){
        var new_arr;
        new_arr = arr.splice(0);
        new_arr.reverse();
        return new_arr;
      }
      return $reverse;
    }()),
    $round: (function(){
      function $round(value, precision, method){
        var factor;
        precision == null && (precision = 0);
        method == null && (method = 'common');
        if (method === 'common') {
          return value.toFixed(precision);
        } else {
          factor = Math.pow(10, precision);
          value *= factor;
          if (method === 'floor') {
            value = Math.floor(value);
          }
          if (method === 'ceil') {
            value = Math.ceil(value);
          }
          return (value / factor).toFixed(precision);
        }
      }
      return $round;
    }()),
    $safe: (function(){
      function $safe(value){
        throw new Error("Escaping is not yet implemented");
      }
      return $safe;
    }()),
    $slice: (function(){
      function $slice(value, slices, fill_with){
        var result, slice_length, i, tmpres, j, pos, _to, _to2;
        fill_with == null && (fill_with = null);
        result = [];
        slice_length = Math.ceil(value.length / slices);
        for (i = 0, _to = slices - 1; i <= _to; ++i) {
          tmpres = [];
          for (j = 0, _to2 = slice_length - 1; j <= _to2; ++j) {
            pos = i * slice_length + j;
            if (!(pos in value)) {
              if (fill_with == null) {
                break;
              }
              tmpres.push(fill_with);
            } else {
              tmpres.push(value[pos]);
            }
          }
          result.push(tmpres);
        }
        return result;
      }
      return $slice;
    }()),
    $sort: (function(){
      function $sort(value, reverse, case_sensitive, attribute){
        var new_arr;
        reverse == null && (reverse = false);
        case_sensitive == null && (case_sensitive = false);
        attribute == null && (attribute = null);
        new_arr = value.splice(0);
        new_arr.sort(function(a, b){
          if (attribute) {
            a = $resolve_attr(a, attribute);
            b = $resolve_attr(b, attribute);
          }
          if (!case_sensitive) {
            a = a.toString().toUpperCase();
            b = b.toString().toUpperCase();
          }
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
          return 0;
        });
        if (reverse) {
          new_arr.reverse();
        }
        return new_arr;
      }
      return $sort;
    }()),
    $string: (function(){
      function $string(s){
        return s.toString();
      }
      return $string;
    }()),
    $striptags: (function(){
      function $striptags(val){
        return val.replace(/<('(\'|[^'])*'|"(\"|[^"])*"|[^>])+>/g, '');
      }
      return $striptags;
    }()),
    $sum: (function(){
      function $sum(container, attribute, start){
        var res, o, _i, _len;
        attribute == null && (attribute = null);
        start == null && (start = 0);
        res = 0;
        for (_i = 0, _len = container.length; _i < _len; ++_i) {
          o = container[_i];
          if (attribute) {
            res += $resolve_attr(o, attribute);
          } else {
            res += o;
          }
        }
        return res + start;
      }
      return $sum;
    }()),
    $title: (function(){
      function $title(s){
        var o;
        return (function(){
          var _i, _ref, _len, _results = [];
          for (_i = 0, _len = (_ref = s.split(/\s/)).length; _i < _len; ++_i) {
            o = _ref[_i];
            _results.push($capitalize(o));
          }
          return _results;
        }()).join(" ");
      }
      return $title;
    }()),
    $trim: (function(){
      function $trim(value){
        var _ref;
        return (_ref = value != null ? value.trim() : void 8) != null ? _ref : "";
      }
      return $trim;
    }()),
    $truncate: (function(){
      function $truncate(s, length, killwords, ellipsis){
        var end;
        length == null && (length = 255);
        killwords == null && (killwords = false);
        ellipsis == null && (ellipsis = '...');
        end = length - 1;
        if (end < s.length && !killwords) {
          while (end + 1 < s.length && !/\B/.test(s[end + 1])) {
            end += 1;
          }
        }
        if (end == s.length - 1) {
          ellipsis = "";
        }
        return s.slice(0, end + 1) + ellipsis;
      }
      return $truncate;
    }()),
    $upper: (function(){
      function $upper(value){
        return value.toString().toUpperCase();
      }
      return $upper;
    }()),
    $urlize: (function(){
      function $urlize(value, trim_url_limit, nofollow){
        trim_url_limit == null && (trim_url_limit = null);
        nofollow == null && (nofollow = false);
        return value.replace(/([a-z]+:\/\/\w([-\w\.]+)*|\w+(\.\w+)+)(:\d+)?(\/([\w\/_\.]*(\?\S+)?)?)?/g, function(u){
          var trimmed_u;
          if (trim_url_limit != null) {
            trimmed_u = u.slice(0, trim_url_limit);
            if (trimmed_u.length < u.length) {
              trimmed_u += "...";
            }
          } else {
            trimmed_u = u;
          }
          return "<a href=\"" + u + "\"" + (nofollow ? " rel=\"nofollow\"" : "") + ">" + trimmed_u + "</a>";
        });
      }
      return $urlize;
    }()),
    $wordwrap: (function(){
      function $wordwrap(s, width, break_long_words){
        var res, actual, sp, words, w, i, _i, _ref, _len, _to;
        width == null && (width = 79);
        break_long_words == null && (break_long_words = true);
        res = [];
        actual = "";
        sp = /^\s+$/;
        words = [];
        for (_i = 0, _len = (_ref = s.split(/\b/)).length; _i < _len; ++_i) {
          w = _ref[_i];
          if (break_long_words && w.length > width) {
            for (i = 0, _to = w.length - 1; width < 0 ? i >= _to : i <= _to; i += width) {
              words.push(w.slice(i, i + width));
            }
          } else {
            words.push(w);
          }
        }
        for (_i = 0, _len = words.length; _i < _len; ++_i) {
          w = words[_i];
          if (actual.length + w.length <= width || sp.test(w) || actual === "") {
            actual += w;
          } else {
            res.push(actual);
            actual = w;
          }
        }
        res.push(actual);
        return res.join("\n");
      }
      return $wordwrap;
    }()),
    $xmlattr: (function(){
      function $xmlattr(d, autospace){
        var res, k, v;
        autospace == null && (autospace = true);
        res = [];
        for (k in d) {
          v = d[k];
          if (v != null) {
            res.push((autospace ? " " : "") + "" + k + "=\"" + $escape(v.toString()) + "\"");
          }
        }
        return res.join("");
      }
      return $xmlattr;
    }())
  });
  exports['$center'].dependencies = ['$repeat'];
  exports['$escapejs'].dependencies = ['$repeat'];
  exports['$groupby'].dependencies = ['$resolve_attr'];
  exports['$indent'].dependencies = ['$repeat'];
  exports['$join'].dependencies = ['$resolve_attr'];
  exports['$sort'].dependencies = ['$resolve_attr'];
  exports['$sum'].dependencies = ['$resolve_attr'];
  exports['$title'].dependencies = ['$capitalize'];
  exports['$xmlattr'].dependencies = ['$escape'];
  exports['$pprint'].dependencies = ['$pprint_', '$escape'];
  exports['$hprint'].dependencies = ['$pprint_', '$escape'];
  function __import(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);

});

require.define("/environment.js", function (require, module, exports, __dirname, __filename) {
    (function(){
  var Parser, render_template, watchFile, readFileSync, join, dirname, Environment, BasicFileEnvironment, _ref;
  Parser = require('./parser').Parser;
  render_template = require('./module_template').render;
  _ref = require('fs'), watchFile = _ref.watchFile, readFileSync = _ref.readFileSync;
  _ref = require('path'), join = _ref.join, dirname = _ref.dirname;
  /**
   *  A very basic environment.
   */
  Environment = (function(){
    Environment.displayName = 'Environment';
    var $evalTemplateObject, prototype = Environment.prototype, constructor = Environment;
    $evalTemplateObject = function(t, env){
      var environment;
      environment = env;
      return eval(t);
    };
    function Environment(_arg){
      var _ref, _ref2;
      _ref = _arg != null
        ? _arg
        : {}, this.utils = (_ref2 = _ref.utils) != null
        ? _ref2
        : require("./utils"), this.filters = (_ref2 = _ref.filters) != null
        ? _ref2
        : require("./filters"), this.parser = (_ref2 = _ref.parser) != null
        ? _ref2
        : new Parser(), this.pre_compile_func = (_ref2 = _ref.pre_compile_func) != null ? _ref2 : "", this.require_exp = (_ref2 = _ref.require_exp) != null ? _ref2 : 'require';
    }
    prototype.getTemplateFromString = (function(){
      function getTemplateFromString(str){
        var exports, compiled;
        try {
          exports = {};
          compiled = this.getTemplateSourceFromString(str);
          eval(compiled);
          return exports;
        } catch (e) {
          if (e instanceof SyntaxError) {
            console.log(compiled);
          }
          throw e;
        }
      }
      return getTemplateFromString;
    }());
    prototype.getTemplateSourceFromString = (function(){
      function getTemplateSourceFromString(str){
        var ast, opts, compilation_ctx, body, _ref;
        if (this.pre_compile_func) {
          str = this.pre_compile_func(str);
        }
        ast = this.parser.parse(str, compilation_ctx);
        opts = {
          __indent__: 1,
          utils: this.utils,
          filters: this.filters
        };
        compilation_ctx = {
          filters_used: {}
        };
        compilation_ctx.filters = this.filters;
        compilation_ctx.utils = this.utils;
        body = ast.compile(opts, compilation_ctx);
        _ref = __import(opts, compilation_ctx);
        _ref.body = body;
        _ref.require_exp = this.require_exp;
        return render_template(opts);
      }
      return getTemplateSourceFromString;
    }());
    return Environment;
  }());
  /**
   *  A basic file compilation environment. It has no notion of template
   *  directories to look in ; it expects getTemplate() to be provided with
   *  an absolute path to its template.
   *
   *  Inside templates, templates can be called by relative paths however.
   *
   *  If a file doesn't exist, this environment will just crash and burn, as
   *  it makes no checks whatsoever.
   */
  BasicFileEnvironment = (function(_super){
    /**
     *  Constructor.
     */
    BasicFileEnvironment.displayName = 'BasicFileEnvironment';
    var prototype = __extends(BasicFileEnvironment, _super).prototype, constructor = BasicFileEnvironment;
    function BasicFileEnvironment(specs){
      specs.require_exp = "__load_template";
      BasicFileEnvironment.superclass.apply(this, arguments);
      this.cache = {};
      this.tracked = {};
      this.deps = {};
    }
    /**
     *  Invalidate the files that depend on the template at path.
     *  @param path: The base template.
     */
    prototype.invalidateDeps = function(path){
      var file, deps, _ref, _ref2;
      for (file in _ref = this.deps) {
        deps = _ref[file];
        if (path in deps) {
          delete this.cache[file];
          this.invalidateDeps(file);
        }
      }
      return _ref2 = (_ref = this.deps)[path], delete _ref[path], _ref2;
    };
    /**
     *  @param path: The path to monitor for changes.
     */
    prototype.trackFile = function(path){
      var _this = this;
      if (!(path in this.tracked)) {
        this.tracked[path] = true;
        return watchFile(path, function(curr, prev){
          if (curr.mtime > prev.mtime) {
            delete _this.cache[path];
          }
          return _this.invalidateDeps(path);
        });
      }
    };
    /**
     *  @param  path: An absolute path.
     *  @throws Error if the path does not exist.
     */
    prototype.getTemplate = function(path){
      var result;
      if (path in this.cache) {
        return this.cache[path];
      }
      result = readFileSync(path, 'utf-8');
      result = this.getTemplateFromString(result, {
        filename: path,
        root: dirname(path)
      });
      this.cache[path] = result;
      return result;
    };
    /**
     *  @param str: The text contents of the template.
     *  @param opts: An object containing at least "filename" as the path
     *      to the template, and "root" as its basedir.
     */
    prototype.getTemplateFromString = function(str, opts){
      var exports, compiled, __filename, __dirname, __load_template, _this = this;
      __filename = opts.filename;
      __dirname = opts.root;
      this.trackFile(__filename);
      this.deps[__filename] = {};
      __load_template = function(path){
        if (path[0] != '/') {
          path = join(__dirname, path);
        }
        _this.deps[__filename][path] = true;
        return _this.getTemplate(path);
      };
      try {
        exports = {};
        compiled = this.getTemplateSourceFromString(str);
        eval(compiled);
        return exports;
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.log(compiled);
        }
        throw e;
      }
    };
    return BasicFileEnvironment;
  }(Environment));
  exports.defaultEnvironment = new Environment({
    filters: require("/filters"),
    utils: require("/utils")
  });
  exports.Environment = Environment;
  exports.BasicFileEnvironment = BasicFileEnvironment;
  function __import(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
  function __extends(sub, sup){
    function ctor(){} ctor.prototype = (sub.superclass = sup).prototype;
    (sub.prototype = new ctor).constructor = sub;
    if (typeof sup.extended == 'function') sup.extended(sub);
    return sub;
  }
}).call(this);

});
require("/environment.js");

require.define("/parser.js", function (require, module, exports, __dirname, __filename) {
    (function(){
  var Lexer, NodeComment, NodeList, NodePrint, default_nodes, tk_tag_open, tk_tag_open_spc, tk_tag_close, tk_tag_close_spc, tk_tag_single, tk_comment_open, tk_comment_open_spc, tk_comment_close, tk_comment_close_spc, tk_comment_single, tk_print_open, tk_print_close, tk_new_line, default_tokens, Parser, _ref, _tag_search;
  Lexer = require('./lexer').Lexer;
  _ref = require('./nodes'), NodeComment = _ref.NodeComment, NodeList = _ref.NodeList, NodePrint = _ref.NodePrint, default_nodes = _ref.default_nodes;
  tk_tag_open = "{%";
  tk_tag_open_spc = "{%-";
  tk_tag_close = "%}";
  tk_tag_close_spc = "-%}";
  tk_tag_single = "%";
  tk_comment_open = "{#";
  tk_comment_open_spc = "{#-";
  tk_comment_close = "#}";
  tk_comment_close_spc = "-#}";
  tk_comment_single = "#";
  tk_print_open = "{{";
  tk_print_close = "}}";
  tk_new_line = "\n";
  default_tokens = [tk_tag_open, tk_tag_open_spc, tk_tag_close, tk_tag_close_spc, tk_comment_open, tk_comment_open_spc, tk_comment_close, tk_comment_close_spc, tk_print_open, tk_print_close, tk_new_line];
  /**
   *  @param str A string
   *  @returns    A trimmed string, without leading nor ending spaces.
   */
  function trim(str){
    if (str === null) {
      return null;
    }
    return str.replace(/^\s+/g, '').replace(/\s+$/g, '');
  }
  _tag_search = /\s*([a-zA-Z][-a-zA-Z0-9_]*)\s+((.|\n)*)/m;
  /**
   *  @param stmt The contents between {% and %}
   *  @returns    An object containing the tag portion and the contents.
   */
  function parse_tag(stmt){
    var m, _ref;
    m = _tag_search.exec(stmt);
    return [m[1], (_ref = m[2]) != null ? _ref : ""];
  }
  function remove_spaces(str){
    var i, _ref;
    i = 0;
    while ((_ref = str[i]) === ' ' || _ref === "\t") {
      i += 1;
    }
    return [str.substr(0, i), str.substr(i)];
  }
  /**
   *  The parser is used to build a node tree : this node tree will present a compile () method
   *  that generates javascript code ready to be compiled.
   */
  Parser = (function(){
    Parser.displayName = 'Parser';
    var prototype = Parser.prototype, constructor = Parser;
    function Parser(specs){
      var _ref;
      specs == null && (specs = {});
      this.nodes = (_ref = specs.nodes) != null ? _ref : default_nodes;
      this.lexer = new Lexer({
        tokens: default_tokens
      });
      this.root = NodeList();
      this.trim_blocks = (_ref = specs.trim_blocks) != null ? _ref : true;
      this._discard_next_space = false;
      this._discard_next_newline = false;
      this._cached_next = null;
    }
    prototype._nextToken = (function(){
      function _nextToken(){
        var acc, spaces, tok, _ref;
        if (this._cached_next != null) {
          this.current_token = this._cached_next;
          this._cached_next = null;
          return;
        }
        acc = '';
        do {
          this.current_token = this.lexer.next();
          if (this.current_token === tk_new_line) {
            acc += this.current_token;
            this.current_token = '';
          } else if (this.current_token != null) {
            _ref = remove_spaces(this.current_token), spaces = _ref[0], tok = _ref[1];
            acc += spaces;
            this.current_token = tok;
          }
        } while (this.current_token === '' && this.current_token !== null);
        if (acc === '' && this.current_token === null) {
          return;
        }
        if (this._discard_next_space || ((_ref = this.current_token) === tk_tag_open_spc || _ref === tk_comment_open_spc)) {
          this._discard_next_space = false;
          return;
        }
        if ((_ref = this.current_token) === tk_comment_close_spc || _ref === tk_tag_close_spc) {
          this._discard_next_space = true;
        }
        if (acc) {
          this._cached_next = this.current_token;
          return this.current_token = acc;
        }
      }
      return _nextToken;
    }());
    prototype.nextToken = (function(){
      function nextToken(){
        var i, _ref, _to, _ref2;
        this._nextToken();
        if (this.current_token == null) {
          return;
        }
        _ref = this.current_token;
        if (this._discard_next_newline) {
          for (i = 0, _to = _ref.length - 1; i <= _to; ++i) {
            if (_ref[i] == '\n') {
              this.current_token = _ref.substr(i + 1);
              break;
            }
          }
          if (!this.current_token) {
            this.nextToken();
            return;
          }
          this._discard_next_newline = false;
        }
        if (this.trim_blocks && ((_ref2 = this.current_token) === tk_comment_close || _ref2 === tk_tag_close)) {
          return this._discard_next_newline = true;
        }
      }
      return nextToken;
    }());
    /**
     *  Parse comments in the input.
     *  @return nothing ! We ditch everything inside.
     */
    prototype.parseComment = (function(){
      function parseComment(){
        var balance, comment;
        balance = 1;
        comment = "";
        do {
          this.nextToken();
          if (this.current_token == tk_comment_close || this.current_token == tk_comment_close_spc) {
            balance -= 1;
            continue;
          }
          if (this.current_token == tk_comment_open || this.current_token == tk_comment_open_spc) {
            balance += 1;
            continue;
          }
          comment += this.current_token;
        } while (this.current_token != null && balance > 0);
        if (balance != 0) {
          throw new Error("Unclosed Comment at line " + _lexer.lineno);
        }
      }
      return parseComment;
    }());
    /**
     *  Parse a print statement. Usually delimited by {{ and }}
     *  The insides of the print statement are in turn parsed to escape
     *  variables and filters with the ctx. and env.filters. prefix respectively.
     *
     *  @return a PrintNode
     */
    prototype.parsePrintStatement = (function(){
      function parsePrintStatement(){
        var statement;
        statement = "";
        do {
          this.current_token = this.lexer.next();
          if (this.current_token && this.current_token != tk_print_close) {
            statement += this.current_token;
          }
        } while (this.current_token != null && this.current_token != tk_print_close);
        if (this.current_token === null) {
          throw new Error("Waiting for '" + tk_print_close + "' at line " + this.lexer.lineno);
        }
        return new NodePrint({
          contents: trim(statement)
        });
      }
      return parsePrintStatement;
    }());
    /**
     *
     */
    prototype.parseTag = (function(){
      function parseTag(waiting_for){
        var tag_contents, name, contents, stop_clause, until_clause, inside_clause, child_node, tag, inside_name, inside_contents, inside_cls, inside_tag, _ref;
        tag_contents = "";
        this.nextToken();
        while (this.current_token != null && this.current_token != tk_tag_close && this.current_token != tk_tag_close_spc) {
          tag_contents += this.current_token;
          this.nextToken();
        }
        if (this.current_token === null) {
          throw new Error("Waiting for '" + tk_tag_close + "' on line " + this.lexer.lineno);
        }
        _ref = parse_tag(tag_contents), name = _ref[0], contents = _ref[1];
        if (name in waiting_for) {
          this.last_tag = [name, contents];
          return;
        }
        if (!this.nodes[name]) {
          throw new Error("Unexpected tag : '" + name + "' at line " + this.lexer.lineno);
        }
        stop_clause = {};
        until_clause = this.nodes[name]['until'];
        stop_clause[until_clause] = true;
        inside_clause = this.nodes[name]['inside'];
        __import(stop_clause, inside_clause);
        if (until_clause == "__endfile__") {
          child_node = this.parseLevel();
        } else if (until_clause) {
          child_node = this.parseLevel(stop_clause);
        }
        tag = new this.nodes[name]({
          name: trim(name),
          contents: trim(contents),
          child_node: child_node
        });
        if (!until_clause) {
          return tag;
        }
        while (this.last_tag != null && this.last_tag[0] != until_clause) {
          _ref = [this.last_tag[0], this.last_tag[1]], inside_name = _ref[0], inside_contents = _ref[1];
          inside_cls = this.nodes[name].inside[inside_name];
          inside_clause = inside_cls['inside'];
          stop_clause = (_ref = __import((_ref = {}, _ref[until_clause + ""] = true, _ref), inside_clause)) != null
            ? _ref
            : {};
          inside_tag = this.parseLevel(stop_clause);
          tag.push(new inside_cls({
            name: inside_name,
            contents: inside_contents,
            child_node: inside_tag
          }));
        }
        return tag;
      }
      return parseTag;
    }());
    /**
     *  Parse the input file.
     *  @return the root NodeList
     */
    prototype.parseLevel = (function(){
      function parseLevel(waiting_for){
        var result, tag;
        waiting_for == null && (waiting_for = {});
        if (waiting_for != null && !typeof waiting_for == 'object') {
          waiting_for = {
            waiting_for: true
          };
        }
        result = new NodeList();
        for (;;) {
          this.nextToken();
          if (!this.current_token) {
            break;
          }
          if (this.current_token == tk_tag_open || this.current_token == tk_tag_open_spc) {
            tag = this.parseTag(waiting_for);
            if (!tag) {
              return result;
            }
            result.push(tag);
            continue;
          }
          if (this.current_token == tk_print_open) {
            result.push(this.parsePrintStatement());
            continue;
          }
          if (this.current_token == tk_comment_open || this.current_token == tk_comment_open_spc) {
            result.push(this.parseComment());
            continue;
          }
          result.push(this.current_token);
        }
        return result;
      }
      return parseLevel;
    }());
    /**
     *  Holder function for _parse_global
     *  @return _parse_global's result
     */
    prototype.parse = (function(){
      function parse(str){
        this.lexer.feed(str);
        this.current = this.root;
        this.current_token = "";
        return this.parseLevel();
      }
      return parse;
    }());
    return Parser;
  }());
  exports.Parser = Parser;
  exports.default_tokens = default_tokens;
  function __import(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);

});
require("/parser.js");

require.define("/utils.js", function (require, module, exports, __dirname, __filename) {
    (function(){
  function __in(obj, container){
    if (obj instanceof Array) {
      return __indexOf.call(container, obj) > -1;
    }
    return container[obj] != null;
  }
  function __import(obj, src){
    var own, key;
    own = {}.hasOwnProperty;
    for (key in src) {
      if (own.call(src, key)) {
        obj[key] = src[key];
      }
    }
    return obj;
  }
  exports.__in = __in;
  exports.__import = __import;
}).call(this);

});
require("/utils.js");

require.define("/filters.js", function (require, module, exports, __dirname, __filename) {
    /**
    BEWARE : In this module, you can't have any require() out of the functions, nor
    can you use all of coco's shortcuts : all of these are meant to be used with .toString() !
**/
(function(){
  __import(exports, {
    /**
     * Return the absolute value of the argument.
     */
    $abs: (function(){
      function $abs(num){
        if (num < 0) {
          return -num;
        }
        return num;
      }
      return $abs;
    }())
    /**
     * A filter that batches items. It works pretty much like slice just the other way round. 
     * It returns a list of lists with the given number of items. 
     * If you provide a second parameter this is used to fill missing items.
     */,
    $batch: (function(){
      function $batch(value, linecount, fill_with){
        var result, i, tmpres, j, _to, _to2;
        fill_with == null && (fill_with = null);
        result = [];
        for (i = 0, _to = value.length - 1; linecount < 0 ? i >= _to : i <= _to; i += linecount) {
          tmpres = [];
          for (j = 0, _to2 = linecount - 1; j <= _to2; ++j) {
            if (!(i + j in value)) {
              if (fill_with == null) {
                break;
              }
              tmpres.push(fill_with);
            } else {
              tmpres.push(value[i + j]);
            }
          }
          result.push(tmpres);
        }
        return result;
      }
      return $batch;
    }())
    /**
     *  Capitalize a string.
     */,
    $capitalize: (function(){
      function $capitalize(str){
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      }
      return $capitalize;
    }())
    /**
     *  Center monospaced text.
     */,
    $center: (function(){
      function $center(value, width){
        var leading;
        width == null && (width = 80);
        if (value.length >= width - 1) {
          return value;
        }
        leading = $repeat(" ", (width - value.length) / 2);
        return leading + value;
      }
      return $center;
    }()),
    $count: (function(){
      function $count(){
        return exports.length.apply(this, arguments);
      }
      return $count;
    }())
    /**
     *  Formats a date.
     *  TODO : not completely done.
     */,
    $date: (function(){
      function $date(d, format){
        var _pad;
        _pad = function(v){
          if (v < 10) {
            return "0" + v;
          }
          return v;
        };
        return format.replace(/%[%cdfHIjmMpSUwWxXyYzZ]/g, function(s){
          var y;
          switch (s[1]) {
          case 'c':
            return d.toLocaleDateString() + " " + d.toLocaleTimeString();
          case 'd':
            return _pad(d.getDate());
          case 'f':
            return d.getMilliseconds();
          case 'H':
            return _pad(d.getHours());
          case 'I':
            return _pad(d.getHours() % 12);
          case 'j':
            return '';
          case 'm':
            return _pad(d.getMonth() + 1);
          case 'M':
            return _pad(d.getMinutes());
          case 'p':
            return '';
          case 'S':
            return _pad(d.getSeconds());
          case 'U':
            return '';
          case 'w':
            return d.getDay();
          case 'W':
            return '';
          case 'x':
            return d.toLocaleDateString();
          case 'X':
            return d.toLocalTimeString();
          case 'y':
            y = d.getFullYear();
            return "" + _pad(Math.round((y / 100 - Math.floor(y / 100)) * 100));
          case 'Y':
            return d.getFullYear();
          case 'z':
            return d.getTimezoneOffset();
          case 'Z':
            try {
              return d.getTimezone();
            } catch (e) {
              return '';
            }
            break;
          case '%':
            return '%';
          default:
            return '#error';
          }
        });
      }
      return $date;
    }())
    /**
     *  Alias for default.
     */,
    $d: (function(){
      function $d(){
        return exports['default'].apply(this, arguments);
      }
      return $d;
    }())
    /**
     *  Return a default value.
     *  @param default_value: The value to return
     *      when `value` is null.
     */,
    $default: (function(){
      function $default(value, default_value){
        if (value == null) {
          return default_value;
        }
        return value;
      }
      return $default;
    }())
    /**
     *  Return a list with 
     */,
    $dictsort: (function(){
      function $dictsort(value, case_sensitive, _by){
        var result, k, v;
        case_sensitive == null && (case_sensitive = false);
        _by == null && (_by = 'key');
        result = [];
        for (k in value) {
          v = value[k];
          result.push([k, v]);
        }
        result.sort(function(a, b){
          var i;
          if (_by === 'value') {
            i = 1;
          } else {
            i = 0;
          }
          a = a[i];
          b = b[i];
          if (!case_sensitive) {
            a = a.toString().toUpperCase();
            b = b.toString().toUpperCase();
          }
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
          return 0;
        });
        return result;
      }
      return $dictsort;
    }()),
    $e: {
      alias: "$escape"
    },
    $escape: (function(){
      function $escape(value){
        return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      }
      return $escape;
    }())
    /**
     *  Escape a string to make it Javascript/JSON compliant.
     */,
    $escapejs: (function(){
      function $escapejs(value){
        var _unicode;
        _unicode = function(s){
          s = s.charCodeAt(0).toString(16);
          return "\\u" + $repeat("0", 4 - s.length) + s;
        };
        return value.replace(/./g, function(s){
          if (('a' <= s && s <= 'z') || ('A' <= s && s <= 'Z') || ('0' <= s && s <= '9')) {
            return s;
          }
          return _unicode(s);
        });
      }
      return $escapejs;
    }()),
    $filesizeformat: (function(){
      function $filesizeformat(value){
        var val, unit, strval;
        if (value < 1024) {
          return value + "";
        }
        if (value < 1024 * 1024) {
          val = val / 1024;
          unit = "Kb";
        } else if (value < 1024 * 1024 * 1024) {
          val = val / (1024 * 1024);
          unit = "Mb";
        } else {
          val = val / (1024 * 1024 * 1024);
          unit = "Gb";
        }
        strval = Math.round(val) + "";
        return val.toPrecision(strval.length + 3) + "Kb";
      }
      return $filesizeformat;
    }()),
    $first: (function(){
      function $first(arr){
        return arr != null ? arr[0] : void 8;
      }
      return $first;
    }()),
    $float: (function(){
      function $float(value){
        var res;
        res = parseFloat(value);
        if (res === NaN) {
          return 0.0;
        }
        return res;
      }
      return $float;
    }()),
    $forceescape: (function(){
      function $forceescape(value){
        throw new Error('unimplemented');
      }
      return $forceescape;
    }()),
    $format: (function(){
      function $format(value, args, kwargs){
        args == null && (args = []);
        kwargs == null && (kwargs = {});
        throw new Error('unimplemented');
      }
      return $format;
    }())
    /**
     *  NOTE: only usable in the {% for grouper, list %} notation.
     *  @param attribute: The attribute to group by.
     */,
    $groupby: (function(){
      function $groupby(arr, attribute){
        var result, obj, grouper, _i, _len;
        result = {};
        for (_i = 0, _len = arr.length; _i < _len; ++_i) {
          obj = arr[_i];
          grouper = $resolve_attr(obj, attribute);
          result[grouper] == null && (result[grouper] = []);
          result[grouper].push(obj);
        }
        return result;
      }
      return $groupby;
    }()),
    $in: (function(){
      function $in(obj, arr){
        var x;
        x = null;
        for (x in arr) {
          if (arr.hasOwnProperty(x) && obj === arr[x]) {
            return true;
          }
        }
        return false;
      }
      return $in;
    }()),
    $indent: (function(){
      function $indent(value, width, indentfirst){
        var first;
        width == null && (width = 4);
        indentfirst == null && (indentfirst = false);
        first = true;
        return value.replace(/^/gm, function(s){
          if (!first || indentfirst) {
            return $repeat(" ", width) + s;
          }
          first = false;
          return s;
        });
      }
      return $indent;
    }()),
    $join: (function(){
      function $join(arr, string, attribute){
        var o, _res, _i, _len;
        string == null && (string = "");
        attribute == null && (attribute = null);
        if ((arr != null ? arr.length : void 8) > 0) {
          if (attribute) {
            _res = [];
            for (_i = 0, _len = arr.length; _i < _len; ++_i) {
              o = arr[_i];
              _res.push($resolve_attr(o, attribute).toString());
            }
            arr = _res;
          }
          return arr.join(string);
        }
        return "";
      }
      return $join;
    }()),
    $last: (function(){
      function $last(arr){
        if (!(arr != null && arr.length)) {
          return null;
        }
        return arr[arr.length - 1];
      }
      return $last;
    }()),
    $length: (function(){
      function $length(arr){
        if (arr == null) {
          return 0;
        }
        return arr.length;
      }
      return $length;
    }()),
    $lower: (function(){
      function $lower(value){
        return value.toString().toLowerCase();
      }
      return $lower;
    }()),
    $pprint_: (function(){
      function $pprint_(node, fmter){
        function real_pprint(node, fmter, met){
          var index, is_array, props, k, v, i, prop, _len;
          met == null && (met = []);
          if (node instanceof Function) {
            return fmter('function', node);
          } else if (node instanceof RegExp) {
            return fmter('regexp', node);
          } else if (node instanceof Object) {
            index = met.indexOf(node);
            if (index != -1) {
              fmter('obj-already', index);
              return;
            }
            met.push(node);
            index = met.length - 1;
            is_array = node instanceof Array;
            fmter('obj-pre', is_array, index);
            props = [];
            for (k in node) {
              v = node[k];
              if (node.hasOwnProperty(k)) {
                if (v instanceof String) {
                  console.log(v);
                }
                props.push({
                  lbl: k,
                  node: v
                });
              }
            }
            props.sort(function(a, b){
              if (a < b) {
                return -1;
              }
              if (a > b) {
                return 1;
              }
              return 0;
            });
            for (i = 0, _len = props.length; i < _len; ++i) {
              prop = props[i];
              if (i != 0) {
                fmter('obj-sep');
              }
              if (!is_array) {
                fmter('obj-label', prop.lbl);
              }
              real_pprint(prop.node, fmter, met);
            }
            return fmter('obj-post', node instanceof Array);
          } else if (node instanceof String || typeof node === 'string') {
            return fmter('string', node);
          } else if (node instanceof Number || typeof node === 'number') {
            return fmter('number', node);
          } else if (node instanceof Boolean || typeof node === 'boolean') {
            return fmter('boolean', node);
          } else if (node == null) {
            return fmter('empty');
          }
        }
        return real_pprint(node, fmter);
      }
      return $pprint_;
    }()),
    $pprint: (function(){
      function $pprint(value, verbose, depth){
        var res;
        verbose == null && (verbose = false);
        depth == null && (depth = 0);
        res = [];
        $pprint_(value, function(type, node){
          switch (type) {
          case 'obj-pre':
            return res.push(node ? "[ " : "{ ");
          case 'obj-post':
            return res.push(node ? " ]" : " }");
          case 'obj-already':
            return res.push("[cycle]");
          case 'obj-sep':
            return res.push(", ");
          case 'obj-label':
            return res.push(node + ": ");
          case 'string':
            return res.push("\"" + node + "\"");
          case 'number':
            return res.push(node + "");
          case 'regexp':
            return res.push("/" + node + "/");
          case 'function':
            return res.push("[function]");
          case 'boolean':
            return res.push(node + "");
          case 'empty':
            return res.push("\u2205");
          default:
            return res.push(node);
          }
        });
        return res.join("");
      }
      return $pprint;
    }()),
    $hprint: (function(){
      function $hprint(value, verbose, depth){
        var unique, res, cur_depth, fmt;
        verbose == null && (verbose = false);
        depth == null && (depth = 0);
        unique = "hprint-" + Date.now();
        res = [];
        cur_depth = 0;
        res.push("<span class='hprint-value'>");
        fmt = (function(){
          function fmt(val, type, color, morestyle){
            morestyle == null && (morestyle = "");
            return "<span class='hprint-" + type + "' style='color:" + color + ";" + morestyle + "'>" + val + "</span>";
          }
          return fmt;
        }());
        $pprint_(value, function(type, node, index){
          if (type === 'obj-pre') {
            cur_depth = cur_depth + 1;
          }
          if (type === 'obj-post') {
            cur_depth = cur_depth - 1;
          }
          if (depth > 0 && cur_depth >= depth) {
            return;
          }
          switch (type) {
          case 'obj-pre':
            res.push(fmt(node ? "[ " : "{ ", 'open', 'gray', "font-weight: bold;"));
            return res.push("<span id='" + unique + "-" + index + "' class='hprint-object hprint-depth-" + cur_depth + "'>");
          case 'obj-post':
            res.push("</span>");
            return res.push(fmt(node ? " ]" : " }", 'close', 'gray', "font-weight: bold;"));
          case 'obj-already':
            return res.push(fmt("<a href='#" + unique + "-" + node + "'>[cycle]</a>", 'cycle', 'cyan'));
          case 'obj-sep':
            return res.push(", ");
          case 'obj-label':
            return res.push("<span class='hprint-label'>" + node + ": </span>");
          case 'string':
            return res.push(fmt("\"" + $escape(node) + "\"", 'string', 'goldenrod'));
          case 'number':
            return res.push(fmt(node + "", 'number', 'magenta'));
          case 'regexp':
            return res.push(fmt($escape(node.toString()) + "", 'regexp', 'lightgreen'));
          case 'function':
            return res.push(fmt("[function]", 'function', 'salmon'));
          case 'boolean':
            return res.push(fmt(node + "", 'boolean', 'magenta'));
          case 'empty':
            return res.push(fmt("\u2205", 'empty', 'magenta'));
          default:
            return res.push(node);
          }
        });
        res.push("</span>");
        return res.join("");
      }
      return $hprint;
    }()),
    $random: (function(){
      function $random(list){
        var index;
        if ((list != null ? list.length : void 8) > 0) {
          index = Math.floor(Math.random() * (list.length - 1) + 1);
          return list[index];
        }
        return "";
      }
      return $random;
    }()),
    $repeat: (function(){
      function $repeat(str, n){
        var r, i, _to;
        r = '';
        for (i = 0, _to = n - 1; i <= _to; ++i) {
          r += str;
        }
        return r;
      }
      return $repeat;
    }()),
    $replace: (function(){
      function $replace(string, regexp, newvalue, count){
        count == null && (count = null);
        if (typeof regexp === 'string') {
          regexp = new RegExp(regexp, 'g');
        }
        return string.replace(regexp, function(s){
          if (count != null) {
            if (count <= 0) {
              return s;
            }
            count = count - 1;
          }
          return s.replace(regexp, newvalue);
        });
      }
      return $replace;
    }()),
    $resolve_attr: (function(){
      function $resolve_attr(obj, att){
        var attrs, a, _i, _len;
        attrs = att.split('.');
        for (_i = 0, _len = attrs.length; _i < _len; ++_i) {
          a = attrs[_i];
          obj = obj[a];
        }
        return obj;
      }
      return $resolve_attr;
    }()),
    $reverse: (function(){
      function $reverse(arr){
        var new_arr;
        new_arr = arr.splice(0);
        new_arr.reverse();
        return new_arr;
      }
      return $reverse;
    }()),
    $round: (function(){
      function $round(value, precision, method){
        var factor;
        precision == null && (precision = 0);
        method == null && (method = 'common');
        if (method === 'common') {
          return value.toFixed(precision);
        } else {
          factor = Math.pow(10, precision);
          value *= factor;
          if (method === 'floor') {
            value = Math.floor(value);
          }
          if (method === 'ceil') {
            value = Math.ceil(value);
          }
          return (value / factor).toFixed(precision);
        }
      }
      return $round;
    }()),
    $safe: (function(){
      function $safe(value){
        throw new Error("Escaping is not yet implemented");
      }
      return $safe;
    }()),
    $slice: (function(){
      function $slice(value, slices, fill_with){
        var result, slice_length, i, tmpres, j, pos, _to, _to2;
        fill_with == null && (fill_with = null);
        result = [];
        slice_length = Math.ceil(value.length / slices);
        for (i = 0, _to = slices - 1; i <= _to; ++i) {
          tmpres = [];
          for (j = 0, _to2 = slice_length - 1; j <= _to2; ++j) {
            pos = i * slice_length + j;
            if (!(pos in value)) {
              if (fill_with == null) {
                break;
              }
              tmpres.push(fill_with);
            } else {
              tmpres.push(value[pos]);
            }
          }
          result.push(tmpres);
        }
        return result;
      }
      return $slice;
    }()),
    $sort: (function(){
      function $sort(value, reverse, case_sensitive, attribute){
        var new_arr;
        reverse == null && (reverse = false);
        case_sensitive == null && (case_sensitive = false);
        attribute == null && (attribute = null);
        new_arr = value.splice(0);
        new_arr.sort(function(a, b){
          if (attribute) {
            a = $resolve_attr(a, attribute);
            b = $resolve_attr(b, attribute);
          }
          if (!case_sensitive) {
            a = a.toString().toUpperCase();
            b = b.toString().toUpperCase();
          }
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
          return 0;
        });
        if (reverse) {
          new_arr.reverse();
        }
        return new_arr;
      }
      return $sort;
    }()),
    $string: (function(){
      function $string(s){
        return s.toString();
      }
      return $string;
    }()),
    $striptags: (function(){
      function $striptags(val){
        return val.replace(/<('(\'|[^'])*'|"(\"|[^"])*"|[^>])+>/g, '');
      }
      return $striptags;
    }()),
    $sum: (function(){
      function $sum(container, attribute, start){
        var res, o, _i, _len;
        attribute == null && (attribute = null);
        start == null && (start = 0);
        res = 0;
        for (_i = 0, _len = container.length; _i < _len; ++_i) {
          o = container[_i];
          if (attribute) {
            res += $resolve_attr(o, attribute);
          } else {
            res += o;
          }
        }
        return res + start;
      }
      return $sum;
    }()),
    $title: (function(){
      function $title(s){
        var o;
        return (function(){
          var _i, _ref, _len, _results = [];
          for (_i = 0, _len = (_ref = s.split(/\s/)).length; _i < _len; ++_i) {
            o = _ref[_i];
            _results.push($capitalize(o));
          }
          return _results;
        }()).join(" ");
      }
      return $title;
    }()),
    $trim: (function(){
      function $trim(value){
        var _ref;
        return (_ref = value != null ? value.trim() : void 8) != null ? _ref : "";
      }
      return $trim;
    }()),
    $truncate: (function(){
      function $truncate(s, length, killwords, ellipsis){
        var end;
        length == null && (length = 255);
        killwords == null && (killwords = false);
        ellipsis == null && (ellipsis = '...');
        end = length - 1;
        if (end < s.length && !killwords) {
          while (end + 1 < s.length && !/\B/.test(s[end + 1])) {
            end += 1;
          }
        }
        if (end == s.length - 1) {
          ellipsis = "";
        }
        return s.slice(0, end + 1) + ellipsis;
      }
      return $truncate;
    }()),
    $upper: (function(){
      function $upper(value){
        return value.toString().toUpperCase();
      }
      return $upper;
    }()),
    $urlize: (function(){
      function $urlize(value, trim_url_limit, nofollow){
        trim_url_limit == null && (trim_url_limit = null);
        nofollow == null && (nofollow = false);
        return value.replace(/([a-z]+:\/\/\w([-\w\.]+)*|\w+(\.\w+)+)(:\d+)?(\/([\w\/_\.]*(\?\S+)?)?)?/g, function(u){
          var trimmed_u;
          if (trim_url_limit != null) {
            trimmed_u = u.slice(0, trim_url_limit);
            if (trimmed_u.length < u.length) {
              trimmed_u += "...";
            }
          } else {
            trimmed_u = u;
          }
          return "<a href=\"" + u + "\"" + (nofollow ? " rel=\"nofollow\"" : "") + ">" + trimmed_u + "</a>";
        });
      }
      return $urlize;
    }()),
    $wordwrap: (function(){
      function $wordwrap(s, width, break_long_words){
        var res, actual, sp, words, w, i, _i, _ref, _len, _to;
        width == null && (width = 79);
        break_long_words == null && (break_long_words = true);
        res = [];
        actual = "";
        sp = /^\s+$/;
        words = [];
        for (_i = 0, _len = (_ref = s.split(/\b/)).length; _i < _len; ++_i) {
          w = _ref[_i];
          if (break_long_words && w.length > width) {
            for (i = 0, _to = w.length - 1; width < 0 ? i >= _to : i <= _to; i += width) {
              words.push(w.slice(i, i + width));
            }
          } else {
            words.push(w);
          }
        }
        for (_i = 0, _len = words.length; _i < _len; ++_i) {
          w = words[_i];
          if (actual.length + w.length <= width || sp.test(w) || actual === "") {
            actual += w;
          } else {
            res.push(actual);
            actual = w;
          }
        }
        res.push(actual);
        return res.join("\n");
      }
      return $wordwrap;
    }()),
    $xmlattr: (function(){
      function $xmlattr(d, autospace){
        var res, k, v;
        autospace == null && (autospace = true);
        res = [];
        for (k in d) {
          v = d[k];
          if (v != null) {
            res.push((autospace ? " " : "") + "" + k + "=\"" + $escape(v.toString()) + "\"");
          }
        }
        return res.join("");
      }
      return $xmlattr;
    }())
  });
  exports['$center'].dependencies = ['$repeat'];
  exports['$escapejs'].dependencies = ['$repeat'];
  exports['$groupby'].dependencies = ['$resolve_attr'];
  exports['$indent'].dependencies = ['$repeat'];
  exports['$join'].dependencies = ['$resolve_attr'];
  exports['$sort'].dependencies = ['$resolve_attr'];
  exports['$sum'].dependencies = ['$resolve_attr'];
  exports['$title'].dependencies = ['$capitalize'];
  exports['$xmlattr'].dependencies = ['$escape'];
  exports['$pprint'].dependencies = ['$pprint_', '$escape'];
  exports['$hprint'].dependencies = ['$pprint_', '$escape'];
  function __import(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);

});
require("/filters.js");
require.define('jinja.js', function(require, module, exports) {
    var __initialized   = false;
    var env             = require('/environment').defaultEnvironment;
    var templateIdMap = {};

    exports.init = function() {
        var scripts     = document.getElementsByTagName('script');

        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];

            if ('text/jinja' === script.getAttribute('type')) {
                // Setup each template #id with `require`
                templateIdMap[script.id] = script.innerHTML;

                require.define(script.id, function(trequire, tmodule, texports, dirname, filename) {
                    texports.render = function(context) {
                        return exports.render(templateIdMap[filename], context);
                    };
                });
            }
        }

        __initialized  = true;
    };

    exports.render = function(content, context) {
        // Lazy-load any templates that may be included
        if (!__initialized) {
            exports.init();
        }

        return env.getTemplateFromString(content).render(context);
    };
});

window.Jinja = require('jinja.js');
