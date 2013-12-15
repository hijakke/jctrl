(function(winwdow, undefined) {

	//
	'use strict';

	var funcCache = {},

	//关键字会进行优先进行处理
	keywords = {
		lt : "<",
		gt : ">",
		le : "<=",
		ge : ">=",
		eq : "===",
		ne : "!==",
		div : "/",
		mod : "%",
		and : "&&",
		or : "||",
		"=" : "===",
		"==" : "===",
		"===" : "===",
		"!=" : "!==",
		"!==" : "!==",
		"true" : "true",
		"false" : "false",
		"null" : "null",
		"undefined" : "undefined"
	},

	// 匹配字符串中的EL表达式
	rget_el_in_str = /{((?:'[^']*'|"[^']*"|[^{}]+)+)}/g,

	// 匹配EL表达式中的注释、变量、运算符和关键字
	rget_key_in_el = /'[^']*'|"[^"]*"|!?=+|(?:\.)?\s*([_$a-zA-Z][_$\w]*)\s*(?:\()?|./g,

	//数据对象
	Data = function(data) {

		var self = this, updater = {}, json = {}, upper, 

		//
		val = function() {

			try {

				if (val_cache.hasOwnProperty(arguments[0])) {
					return val_cache[arguments[0]].apply(json, arguments);
				}

				var variable_name, key, i = 0;

				for (; i < arguments[0].length; i++) {
					if (arguments[0].charAt(i) == "[" || arguments[0].charAt(i) == ".") {
						break;
					}
				}
				variable_name = arguments[0].substring(0, i);
				key = "this." + arguments[0];

				//当前和上级作用域中都不存在该属性时
				//进行写操作时对未定义的属性先进行定义,进行读操作时返回未定义
				if (!self.has(variable_name)) {
					if (arguments.length == 2) {
						self.define(variable_name);
					} else {
						return undefined;
					}
				}

				//属性定义在上级作用域中
				if (!json.hasOwnProperty(variable_name)) {
					if (arguments.length == 2) {
						chain.set(arguments[0], arguments[1]);
					} else {
						return chain.get(arguments[0]);
					}
					return;
				}

				if (Data.var_cache.hasOwnProperty(arguments[0])) {
					return (val_cache[arguments[0]] = Data.var_cache[arguments[0]]).apply(json, arguments);
				}

				return (val_cache[arguments[0]] = new Function("return arguments.length==1? " + key + " : " + key + "=arguments[1]")).apply(json, arguments);

			} catch (e) {
				if (e.name == "TypeError") {
					return undefined;
				}
				throw new Error("Unrecognized identifier: " + arguments[0]);
			}

		}, elval = function(el, refer_data) {
			try {
				if (el_cache.hasOwnProperty(el)) {
					return el_cache[el](self, refer_data, Data.functions);
				}

				var scopes = [], deep = 0, end = true, el_bulid = el.replace(rget_key_in_el, function(full, key) {
					if (full.charAt(0) == '"' || full.charAt(0) == "'" || full == " ") {
						return full;
					}

					//关键字
					if (words_map.hasOwnProperty(full)) {
						return words_map[full];
					}

					//访问的变量是this或local时，中括号中的表达式作为实际变量名
					if (full == "[") {
						end = true;
						deep++;
						if (deep == scopes[scopes.length - 1] + 1) {
							return "(";
						}
						return "[";
					}

					if (full == "]") {
						deep--;
						if (deep == scopes[scopes.length - 1]) {
							scopes.pop();
							return ")";
						}
						return "]";
					}

					if (full.charAt(0) == '.') {
						end = true;
						if (deep == scopes[scopes.length - 1]) {
							scopes.pop();
							return "('" + key + "')";
						}
						return full;
					}

					//函数
					if (full.charAt(full.length - 1) == "(") {
						return "arguments[2]['" + key + "'](";
					}

					if (key == "this" || key == "local") {
						end = false;
						scopes.push(deep);
						return "arguments[" + (key == "this" ? 0 : 1 ) + "].get";
					}

					if (key && /^[_$a-zA-Z]/.test(key)) {
						return "arguments[0].get('" + key + "')";
					}

					if (!end) {
						end = true;
						return "()" + full;
					}

					return full;

				});

				if (!end) {
					el_bulid = el_bulid + "()";
				}

				return (el_cache[el] = new Function("return " + el_bulid))(self, refer_data, Data.functions);

			} catch (e) {
				if (e.name === "TypeError") {
					return "";
				}
				throw new Error("Unrecognized expression: " + el);
			}
		};

		//将构造参数中的Data对象作为上级作用域对象
		if ( data instanceof Data) {
			chain = data;
			chain.update(self);
		} else if ( typeof data == "object") {
			json = data;
		}

		this.get = function() {
			if (arguments.length == 0 || arguments[0] === undefined || arguments[0] === "") {
				return json;
			}
			return val(arguments[0]);
		};

		this.set = function() {
			if (arguments.length == 1) {
				if ( typeof arguments[0] !== "object") {
					return;
				}
				json = arguments[0];
			} else {
				val(arguments[0], arguments[1]);
			}
			self.update();
		};

		this.define = function(key, value) {
			json[key] = value;
		};

		this.has = function(key) {
			return json.hasOwnProperty(key) ? true : chain ? chain.has(key) : false;
		};

		this.push = function(key, obj) {

			var push_to = self.get(key);
			if (push_to && push_to.push) {
				push_to.push(obj);
			}

			self.update();

		};

		//计算字符串中el表达式的值
		this.el = function(str, refer_data) {

			if ( typeof str != "string") {
				return str;
			}

			var proto_result, cur_exp;
			str = str.replace(rget_el_in_str, function(full, exp_str) {
				cur_exp = exp_str;

				//如果字符串只包含el表达式，返回原型对象
				if (str.length == full.length) {
					proto_result = elval(exp_str, refer_data);
					return;
				}
				return String(elval(exp_str, refer_data));
			});

			if (proto_result !== undefined) {
				str = proto_result;
			}

			return str;
		};

		this.test = function(el) {

			el = $.trim(el);

			var el_group, keys_group, key_count = 0, test_result = {
				scope : 0,
				key : ""
			};

			while (( el_group = rget_el_in_str.exec(el)) !== null) {

				while (( keys_group = rget_key_in_el.exec(el_group[1])) !== null) {

					if (keys_group[0].charAt(0) === "'" || keys_group[0].charAt(0) === '"' || keys_group[0].charAt(0) === "." || keys_group[0] == "[" || keys_group[0] == "]" || words_map.hasOwnProperty(keys_group[0])) {
						continue;
					}

					key_count++;
					if (keys_group[1] == "local") {
						test_result.scope = test_result.scope | 1;
					} else {
						test_result.scope = test_result.scope | 2;
					}
				}
			}

			if (el.charAt(0) == "{" && el.charAt(el.length - 1) == "}" && key_count == 1) {
				test_result.key = $.trim(el.substr(1, el.length - 2));
				if (test_result.scope == 1) {
					test_result.key = test_result.key.substr(test_result.key.indexOf(".") + 1);
				}
			}

			return test_result;
		};

		this.update = function() {

			if ( typeof arguments[0] == "boolean") {
				update_on = arguments[0];
				return;
			} else if (arguments[0] instanceof Data) {
				updater.push(arguments[0]);
				return;
			}

			if (update_on) {
				for (var i = 0; i < updater.length; i++) {
					updater[i].update();
				}
			}
		};
	}
})(window);
