(function(window, $, undefined) {

var Data = function(data) {
	
	var self = this, 
	updater = [], 
	pool, 
	chain,
	key_cache = {},
	el_cache={},
	on = true,
	
	words_map = {
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
		"true" : "true",
		"false" : "false",
		"null" : "null",
		"undefined" : "undefined"
	},
	
	fns = {
		substr : function(str, begin, len){
			return String.prototype.substr.call(str, begin, len);
		},
		startWith : function(full, start){
			return full.indexOf(start) == 0;
		},
		join : function(array , separator){
			return Array.prototype.join.call(array,separator);
		},
		trim : function(str){
			return $.trim(str);
		},
		hayagu : function(){
			throw 1;
		}
	},
	
	// 将el表达式转换成js表达式 
	// '[^']*'|"[^"]*" 过渡字符串 
	// \b[_$a-zA-Z][_$\w]*(?:\.[_$\w]*|\[[^\[\]]*\])* 获取变量名，计算变量值加入参数列表
	// (?:\s*\()? 过滤函数	
	rget_key_in_el = /'[^']*'|"[^"]*"|[_$a-zA-Z][_$\w]*(?:\.[_$\w]*|\[[^\[\]]*\])?(?:\s*\()?/g,
	
	//处理中括号运算符，取出其中变量并计算其值
	rget_operator_in_key = /\[(?!['"\d])([^\[\]])*\]/g,
	
	//截取字符串中的el表达式
	rget_el_in_str = /[$#]?{((?:'[^']*'|"[^']*"|[^{}]+)+)}/g,
	
	rget_var_in_brackets = /\[\s*['"]([^\]]+)['"]\s*\]/,
	
	rget_w = /\w+/,
	 
	val = function() {
		try {
			
			var variable_name, key;
			
			if(arguments[0].charAt(0)=='['){
				variable_name = rget_var_in_brackets.exec(arguments[0])[1];
				key = "data.json" + arguments[0];
			}else {
				variable_name = rget_w.exec(arguments[0])[0];
				key = (arguments[0].charAt(0) == '.' ? "data.json" : "data.json.") + arguments[0];
			}
			
			//当前和上级作用域中都不存在该属性时
			//进行写操作时对未定义的属性先进行定义,进行读操作时返回未定义
			if(!self.has(variable_name)){
				if(arguments.length == 2){
					self.define(variable_name);
				}else{
					return undefined;
				}
			}

			//属性定义在上级作用域中
			if (pool.json && !pool.json.hasOwnProperty(variable_name)) {
				if(arguments.length == 2){
					chain.set(arguments[0], arguments[1]);
				}else{
					return chain.get(arguments[0]);
				}
				return;
			}

			if (arguments.length == 2) {
				(new Function("data", "value", key + "=value;"))(pool, arguments[1]);
				self.update();
			} else {
				return (new Function("data", "return " + key))(pool);
			}
		} catch (e) {
			if (e.name === "TypeError") {
				return undefined;
			}
			throw new Error("Uncorrect arguments");
		}

	},
	
	elval = function(el, refer_data) {

		var i = 1, values = [], key_value;
		
		values.push(fns);
		
		el = el.replace(rget_key_in_el, function(full) {
			//过滤字符串
			if (full.charAt(0) === "'" || full.charAt(0) === '"' ) {
				return full;
			} else {
				
				var alias = words_map[full];
				if (alias) {
					return alias;
				}
				//过滤函数
				if (full.charAt(full.length-1) =="(") {
					
					return "arguments[0]['" + full.substr(0,full.length-1) + "'](";
				}
				
				//处理中括号运算符
				full = full.replace(rget_operator_in_key, function(_, selector){
					return "['"+ val(selector) +"']";			
				});

				var variable_name = rget_w.exec(full)[0];

				if(!key_cache.hasOwnProperty(variable_name)){
					key_cache[variable_name] = {};
				}
				
				//未计算过值的变量
				if(!key_cache[variable_name].hasOwnProperty(full)){
					
					//引用外部变量
					if(variable_name == "local"){
						key_value = refer_data ? refer_data.get(full.substr(5)) : undefined;
					} else {						
						key_value = key_cache[variable_name][full] = val(variable_name == "this" ? full.substr(4) : full);
					}
				}else{
					//计算过变量的值
					key_value = key_cache[variable_name][full];
				}
				
				values.push(key_value === undefined ? "" : key_value);
				
				return "arguments[" + (i++) + "]";
				
			}
		});
		return (new Function("return " + el)).apply(window, values);
	};
	
	//将构造参数中的Data对象作为上级作用域对象
	if(data instanceof Data){
		chain = data;
		pool = {json : {}};
		chain.update(self);
	}else{
		pool = {json : data === undefined ? {} : data};
	}
	
	this.get = function(){
		if(arguments.length == 0 || arguments[0] === undefined){
			return pool.json;
		}else{
			return val(arguments[0]);
		}
	};
	
	this.set = function(){
		if (arguments.length == 1) {
			pool.json = arguments[0];
			self.update();
		} else {
			val(arguments[0], arguments[1]);
		}
	};

	this.define = function(key, value){
		if(!pool.json){
			pool.json = {};
		}
		pool.json[key] = value;
	};
	
	this.has = function(key){
		return pool.json && pool.json.hasOwnProperty(key) ? true 
			: chain ? chain.has(key) : false;
	};

	this.push = function(key, obj){
		
		var push_to = val(key);
		if(push_to && push_to.push){
			push_to.push(obj);
		}
				
		this.update();
		
	};
	
	//计算字符串中el表达式的值
	this.el = function(str, refer_data) {
		try {
			if(typeof str != "string"){
				return str;
			}
			
			if(el_cache.hasOwnProperty(str)){
				return el_cache[str];
			}
			
			var proto_result,out_value, cur_exp;		
			out_value = str.replace(rget_el_in_str, function(full, exp_str) {				
				cur_exp = exp_str;				
				
				//如果字符串只包含el表达式，返回原型对象
				if (str.length == full.length){
					 proto_result = elval(exp_str, refer_data);		
					 return;			
				}
				return String(elval(exp_str, refer_data));
			});
			
			out_value = proto_result === undefined ? out_value : proto_result;

			el_cache[str] = out_value ;
			
			return el_cache[str];
			
		} catch (e) {
			throw new Error("Unrecognized expression: " + cur_exp);
		}
	};
	
	//计算el表达式的值后，表达式中的变量名会保存在keys数组中
	this.check = function(el){
		var el_group,keys_group,last_el_group,last_keys_group,
		
		check_result ={scope : 0};
		
		while((el_group=rget_el_in_str.exec(el)) !== null){
			
			while((keys_group =rget_key_in_el.exec( el_group[1])) !== null){
				if (keys_group[0].charAt(0) === "'" || keys_group[0] === '"' || words_map.hasOwnProperty(keys_group[0])) {
					continue;
				} 
				var var_name = rget_w.exec(keys_group[0])[0];
				if(var_name == "local"){
					check_result.scope = check_result.scope | 1;
				}else{
					check_result.scope = check_result.scope | 2;
				}
				last_keys_group = keys_group;
			}
			last_el_group = el_group;
		}
		
		if(last_el_group && last_keys_group[0] == $.trim(last_el_group[1])){
			check_result.avaliable = last_keys_group[0];
			if(check_result.scope == 1){
				
				check_result.avaliable =  check_result.avaliable.substr(5);
				
			}
		}
		
		return check_result;
	};
	
	this.update = function() {
		if (typeof arguments[0] == "boolean") {
			on = arguments[0];
			
		} else if (arguments[0]) {
			updater.push(arguments[0]);
			
		} else if (on) {			
			key_cache = {};
			for ( var i = 0; i < updater.length; i++) {
				updater[i].update();
			}			
		}
		el_cache={};
	};	
},

Adapter = function() {
	
	this.match = function(type) {
		return this.type === type;
	};
	
	// 抽象方法，由扩展Adapter类实现
	this.handle = function(){
		throw new Error("Unimplemented method");
	};
},


Connector = function() {

	var cached = {},
	task_list = [],
	clear_fns = [],
	error_fns = [],
	progress_fns = [],
	last,
	
	update = function(current) {
		var progress = 0;
		for ( var i = 0; i < task_list.length; i++) {
			progress += (task_list[i].dones.length + task_list[i].errors.length)
					/ task_list[i].urls.length;
		}
		progress = progress / task_list.length;
		
		for(var i =0;i<progress_fns.length;i++){
			progress_fns[i](progress);
		}
		
		if(current.urls.length == current.dones.length + current.errors.length){
			
			for(var i=0;i<current.doneFns.length;i++){
				current.doneFns[i].call(current, current.dones, current.errors);
			}
			
			current.ready = true;
			
			for(var i =0;i<task_list.length;i++){
				if(task_list[i] == current){
					task_list.splice(i, 1);
					break;
				}
			}
			if(task_list.length == 0){
				try{
					for(var i =0;i<clear_fns.length;i++){
						clear_fns[i]();
					}
				} catch(e){
					throw e;
				} finally{
					clear_fns=[];
					error_fns=[];
					progress_fns = [];
				}
			}
		}
	},
	
	doTask = function(current){		

		if (current.urls.length == 0) {
			update(current);
			return;
		}
		
		for ( var i = 0; i < current.urls.length; i++) {
			
			if(current.cache !== false &&  cached[current.urls[i]]){
				current.dones.push(cached[current.urls[i]]);
				update(current);
				continue;
			}
			
			$.ajax({
				orgin_url : current.urls[i],
				url : current.urls[i],
				cache : current.cache,
				dataType : "text",
				success :  function(response) {
					
					cached[this.orgin_url] = response;	

					if(current.adapter){
						response = current.adapter.handle(response);
					}
					
					current.dones.push(response);
					current.doneUrls.push(this.orgin_url);
					update(current);
				},
				error : function() {
					
					for(var i =0;i<error_fns.length;i++){
						error_fns[i](this.orgin_url);
					}
					
					current.errors.push(this);
					update(current);
				}
			});
		}
	};

	this.load = function() {

		var cache, adapter;
		last = {
				urls : arguments[0] instanceof Array ? arguments[0]	: [ arguments[0] ],
				errors : [],
				dones : [],
				doneUrls : [],
				doneFns : [],
				cache : true,
				adapter : null
		};
		
		if( typeof( cache = arguments[1]) == "boolean" || typeof( cache = arguments[2]) == "boolean"){
			last.cache = cache;
		}
		if( (adapter = arguments[1]) instanceof Adapter || (adapter = arguments[2]) instanceof Adapter){
			last.adapter = adapter;
		}
		
		task_list.push(last);
		doTask(last);
		
		return this;
	};
	
	this.process = function(fn){
		progress_fns.push(fn);
	};
	
	this.clear = function(fn){
		if(task_list.length == 0){
			fn();
		}else{
			clear_fns.push(fn);
		}
	};
	
	this.error = function(fn){
		error_fns.push(fn);
	};
	
	this.ready = function(fn){
		if(last.ready){
			fn.call(last, last.dones, last.errors);
		}
		else{
			last.doneFns.push(fn);
		}
	};
},

Map = function($map, app) {

	var keyreg = /{([^}]+)}/g, 
	key = $map.attr("key"), 
	path_vars = [], 
	exp, temp, 
	hasdef = false, 
	views = [],
	path_data= {},
	data = $map.attr("data"),
	dataType = $map.attr("dataType");

	while (( temp = keyreg.exec(key)) !== null) {
		path_vars.push(temp[1]);
	}

	this.match = function(name) {
		var matched_values = exp.exec(name),
		path_values = {};
		
		if (!matched_values) {
			return false;
		}
		for (var i = 0; i < path_vars.length; i++) {
			path_values[path_vars[i]] = matched_values[i + 1];
		}
		
		if(!path_data[name]){
			path_data[name] = new Data(app.data());
		}
		
		path_data[name].set(path_values);
		
		return true;
	};
	
	this.on = function(name, status){
		for (var i = 0; i < views.length; i++) {
			if (views[i].on === status || path_data[name].el(views[i].on) === true) {
				return  path_data[name].el(views[i].to);
			}
		}
		throw new Error("No accepted view found on status: " + status);
	};
	
	this.data = function(name){
		return path_data[name].el(data);
	};
	
	this.dataType = function(){
		return dataType;
	};

	exp = new RegExp("^" + key.replace(/(\?|\.|^\*\*\/|\/\*\*\/|\*+|{\w+}|\/)/g, function(pattern) {
		switch (pattern) {
			case "?":
				return "[^\\/]";
			case ".":
				return "\\.";
			case "**":
			case "*":
				return "[^\\/]*(?:\\/$)?";
			case "/":
				return "(?:\\/|$)";
			case "/**/":
				return "(?:\\/.*\\/|\\/|.*$)";
			case "**/":
				return "(?:.*\\/|\\/)";
			default:
				return "([^\\/]+)";
		}
	}) + "$");

	$map.find("on").each(function() {
		var view = $(this);
		if (view.attr("status") === "success") {
			hasdef = true;
		}
		views.push({
			on : view.attr("status"),
			to : view.attr("to")
		});
	});

	if (!hasdef) {
		views.push({
			on : "success",
			to : key
		});
	}
},

View = function($view, $app, app) {
	var id = $view.attr("id"),
 	dataType = $view.attr("dataType"), 
 	viewType = $view.attr("viewType"), 
 	path = $view.attr("path")  || "", 
 	scripts = [], 
 	styles = [], 	
 	local_data = new Data(),
 	data_url = $view.attr("data"),
 	app_data = new Data(app.data()),
 	
	requires = $view.attr("require")? $view.attr("require").split(",") : [],
	
	//公共属性
	attributes = {
		id : id,
		url : path + ($view.attr("url") || id + "." + viewType) ,
		scripts : scripts,
		styles : styles,
		dataType : dataType,
		viewType : viewType,
		html : "",
		dom : null,
		requires : []
	},
	
	dom_instances = [],
	
	connector = new Connector(),
	
	style_doms = [],
	
	script_texts = [],
	
	load_require = function($dom){
		
		var bean_path = $dom.attr("path");
		
    	if ($dom.is(".view")) {
    		attributes.requires.push($dom.attr("id"));
		} else if ($dom.is(".js") || $dom.is(".css")) {

			if ($dom.is(".js")) {
				scripts.push((bean_path || path) + $dom.attr("url"));
			} else {
				styles.push((bean_path || path) + $dom.attr("url"));
			}
		} else if ($dom.is("list")) {	
			$dom.children().each(function() {
				load_require($(this));
			});
		}
	};
	// 加载require属性中定义的对象
	for(var i=0;i<requires.length;i++){
		switch(requires[i]){
			case ".js":
				scripts.push(path + id + ".js");
				break;
			case ".css":
				styles.push(path + id + ".css");
				break;
			default:
				$app.find(requires[i].replace(/\//g,"\\/")).each(function(){
					load_require($(this));
				});
				
		}
	}
	
	$view.find("require>").each(function(){
		load_require($(this));
	});
	
	connector.error(function(url){
		throw new Error("Load view file: " + url +" failed.");
	});
	
	this.load = function(callback){
		
		if(data_url){
			connector.load(data_url, Adapter.get(dataType)).ready(function(gots){
				app_data.set(gots[0] || {});
			});
		}
		
		connector.load(attributes.url, Adapter.get(viewType)).ready(function(html){
			attributes.html = html[0]; 
			attributes.dom = $("<div>").html(html[0]);
		});
		
		connector.load(scripts).ready(function(texts){
			script_texts = texts;
		});
		
		connector.load(styles).ready(function(texts){
			for(var i = 0; i < texts.length; i++){
				
				var style = document.createElement("style"), 
				baseurl = /(.*\/)?/.exec(this.doneUrls[i])[1];
				style.setAttribute("type", "text/css");
				if (!baseurl) {
					texts[i] = texts[i].replace(/(url\(\s*)(.)/igm, function(full, url, path) {
						if (path === "/") {
							return full;
						}
						return url + baseurl + path;
					});
				}
				if (style.styleSheet) {
					style.styleSheet.cssText = texts[i];
				} else {
					style.appendChild(document.createTextNode(texts[i]));
				}
				style_doms.push(style);				
			}
		});		
		
		connector.clear(function(){
			callback(id);
		});
		
		return this;
	};
	
	this.on = function(){
		
		var script_head = "",
		head = document.getElementsByTagName("head")[0];

		script_head += "var localData = arguments[0];\n";
		script_head += "var appData = arguments[1];\n";
		
		for(var i = 0; i<script_texts.length;i++){
			(new Function(script_head + script_texts[i])).call(window, local_data, app_data);
		}
		
		for (var i = 0; i < style_doms.length; i++) {
			head.appendChild(style_doms[i]);
		}
	};
	
	this.off = function() {
		for (var i = 0; i < style_doms.length; i++) {
			head.removeChild(style_doms[i]);
		}
	};
	
	this.match = function(){
		return id === arguments[0];
	};
	
	this.attr = function(key, value){
		if(value){
			attributes[key] = value;
		}else{
			return attributes[key];
		}
	};
	
	this.generate = function(){
		var new_dom = attributes.dom.clone();
		dom_instances.push(new_dom);
		Tag.parse(new_dom, app, app_data, local_data);
		return new_dom.contents();
	};
	
},

Binding = function($element, app, app_data, local_data, fn){
	var original = $element,
	attr_exp = {},
	update_fn = fn,
	last_val/*,
	last_element*/;
	
	this.bindExp = "";
	this.element = $element;
	this.appData = app_data;
	this.localData = local_data;
	this.app = app;
	
	this.bindTo = function(el){
		if(el.indexOf("@") == 0){
			if(attr_exp.hasOwnProperty(el)){
				this.bindExp += attr_exp[el]; 
			}else{
				this.bindExp += attr_exp[el] = original.attr(el.substr(1));					
			} 
		}else{
			this.bindExp += el;
		}
	};
	
	this.val = function(){
		if(arguments.length==0){
			return this.appData.el(this.bindExp, this.localData); 
		}else{
			var el = arguments[0];
			if(el && el.indexOf("@") == 0){
								
				if(attr_exp.hasOwnProperty(el)){
					el = attr_exp[el];
				}else{
					el = attr_exp[el] = original.attr(el.substr(1));					
				} 
			}
			return this.appData.el(el, this.localData);
		}		
	};
	
	this.update = function(){
		var cur_val = this.val();
		last_element = this.element;
		if(update_fn && cur_val !== last_val){
			
			update_fn.call(this);
			
			if(last_element !== this.element && this.element && last_element[0] !== this.element[0]){
//				last_element.replaceWith(this.element);
			}
		}
		
		last_val = cur_val;
	};
	
	this.bind = function(){
		
		var check = this.appData.check(this.bindExp);
		
		if(check.scope & 1 && update_fn){				
			this.localData.update(this);
		}
		if(check.scope & 2 && update_fn){
			this.appData.update(this);
		}
	};
},

Tag = function() {
	this.ns = "http://jctrl.org/tags";
	this.parseChild = true;
	
	//匹配标签命名空间并截取标签名
	this.matchNS = function(name){
		var prefix = /(?:([^:]*):)?(.*)/.exec(name);
		//不包含前缀
		if(!this.ns && !prefix[1]){
			return name;
		}else {
			var ns = Tag.tns[prefix[1]] || Tag.ns[prefix[1]];
			if (ns === this.ns) {
				return prefix[2];
			}
		}
	};
	
	this.matchTag = function(name){
		return name === this.name;
	};
	
	this.match = function(name) {
		return this.matchTag(this.matchNS(name));
	};
	
	this.parse = function($element, app, app_data, local_data) {
		
		var self = this,
		
		binding = new Binding($element, app, app_data, local_data, self.update),
		
		rt = self.handle.call(binding);
		
		if(rt){
			binding.element = rt;
		}
		
		if(typeof binding.element != "object" ){
			binding.element = $(document.createTextNode(binding.element));
		}
		
		binding.bind();
		
		if($element !== binding.element && binding.element && $element[0] !== binding.element[0]){
			$element.replaceWith(binding.element);
		}
		
		return binding.element;
		
	};
},

Controller = function(app) {

	var self = this, 	
	connector = new Connector(),
	
	load_data = function(url, dataType, callback) {
		
		if (!url) {
			callback.call(self, "success");
			return;
		}
		
		connector.load(url, Adapter.get(dataType)).ready(function(got, error){
			if(error.length>0){
				callback.call(self, "error");
				return;
			}
			app.data().set(got[0]);
			callback.call(self, "success");
		});
	};
	
	this.load = function($container, key){
		var map = app.map(key),	
		$wrapper = $("<div>"),		
		view_loaded_count = 0,
		view_required_count = 0,
		required_views = {},
		entry_view_id,
		required_views_link = {},
		
		append_dom = function($parent, view){

			var view_generated_dom = view.generate();
			
			$parent.append(view_generated_dom);
			
			view_generated_dom.find("[require]").each(function(){
				
					append_dom($(this), required_views[$(this).attr("require")]);
			});
		},
		
		view_load_ready = function(id){
			
			required_views[id].attr("dom").find("[require]").each(function(){
				
				var required_view_id = $(this).attr("require"), 
				required_view = required_views[required_view_id];
				
				if(!required_view){
					view_required_count++;
					required_views[required_view_id] = app.view(required_view_id);
					required_views[required_view_id].load(view_load_ready);
				}
				required_views_link[required_view_id] = id;
			});
			
			if(view_required_count  > ++view_loaded_count ){
				return;
			}

			while(required_views_link[entry_view_id]){
				entry_view_id = required_views_link[entry_view_id];
			}
			var entry_view = required_views[entry_view_id];
			append_dom($wrapper, entry_view);
			
			$container.append($wrapper.contents());
			
			for(var i in required_views){
				required_views[i].on();
			}
			
		};
		
		load_data(map.data(key), map.dataType(), function(status){
			
			entry_view_id = map.on(key, status);

			var entry_view = app.view(entry_view_id),
			required_id_list = entry_view.attr("requires");

			required_views[entry_view_id] = entry_view;
			entry_view.load(view_load_ready);
			
			//当前请求依赖的视图数量
			//包括请求的视图和该视图依赖的视图
			view_required_count = required_id_list.length + 1;
			
			for ( var i = 0; i < required_id_list.length; i++) {				
				
				required_views[required_id_list[i]] = app.view(required_id_list[i]).load(view_load_ready);
				
				//加载依赖视图后继续加载该视图的依赖视图
				//依赖视图会被包含多次
				var current_required_id_list = required_views[required_id_list[i]].attr("requires");
				
				for(var j =0; j < current_required_id_list.length; j++){
					
					if(!required_views[current_required_id_list[j]]){
						view_required_count++;
						required_views[current_required_id_list[j]] = app.view(current_required_id_list[j]).load(view_load_ready);
					}
				}
			}			
		});
	};
}, 

App = function($app){	
	
	var self = this,
	views = [],
	maps = [],
	_session = {},
	sys_data = new Data(),
	app_data = new Data(sys_data),
	langs = {};
	
	this.ctr = new Controller(this);
	
	this.data = function(which){
		return which === "sys" ? sys_data : app_data;
	};

	this.session = function(key, value) {
		if (value === undefined) {
			return _session[key];
		} else {
			_session[key] = value;
		}
	};
	
	this.lang = function(name, obj){
		if(obj){
			if(!langs[name]){
				langs[name] = {};
			}
			for(var key in obj){
				langs[name][key] = obj [key];
			}
		}else{
			sys_data.set(langs[name]);
		}
	};
	
	this.map = function(key){
		for (var i = 0; i < maps.length; i++) {
			if (maps[i].match(key)) {
				return maps[i];
			}
		}
		throw new Error("No urlMap found");
	};
	
	this.view = function(key) {
		for ( var i = 0; i < views.length; i++) {
			if (views[i].match(key)) {
				return views[i];
			}
		}
	};
	
	app_data.set({session:{}, model:{}});
	
	$app.find("bean.view").each(function(){
		views.push(new View($(this), $app, self));
	});
	
	$app.find("map entry").each(function() {
		maps.push(new Map($(this), self));
	});
},

LogFactory = (function(){

	var statistics = {},
	instance = {},
 	empty = {
		begin : function() {},
		end : function() {}
	},
	Log = function(clazz){
		this.begin = function(fn) {
			if(fn && !statistics[clazz][fn]){
				statistics[clazz][fn] = {
					hit : 0,
					use : 0
				};
			}
			statistics[clazz]["_start" + (fn || "")] = new Date().valueOf();
		};
	
		this.end = function(fn) {
			var start_key = "_start" + (fn || "");
			if(!statistics[clazz][start_key]){
				return;
			}
			var current = new Date().valueOf();
			statistics[clazz].use+= current - statistics[clazz][start_key];
			statistics[clazz].hit++;
			if(fn){
				statistics[clazz][fn].use += current - statistics[clazz][start_key];
				statistics[clazz][fn].hit++;
			}
			delete statistics[clazz][start_key];
		};
	};
	
	return new function(){
		
		this.DEBUG = true;
		
		this.getLog = function(clazz){
			if(!this.DEBUG){
				return empty;
			}
			if(!instance[clazz]){
				statistics[clazz] = {
					hit : 0,
					use : 0
				};
				instance[clazz] = new Log(clazz);
			}
			return instance[clazz];
		};
		
		this.report = function(){
			return JSON.stringify(statistics);
		};
	};
})(),

jCtrl = new function (){
	
	this.extend = function(abst, impl) {
		
		if(abst =="Function"){
			Data.instances.push(impl);
			return;
		}
		
		abst = {Adapter:Adapter, Tag:Tag}[abst];
		if (!abst) {
			throw new Error("superClass not defined");
		}
		
		if(!abst.instances){
			abst.instances = [];
		}
		impl.prototype = new abst();
		impl.prototype.constructor = impl;
		
		abst.instances.push(new impl);
		
		return this;
	};
	
	this.init = function(){
		$(document).ready(function(){
			
			jCtrl.create($("[app]").attr("app"), function(app) {
				app.ctr.load($("[app]"), "home");
			});
			
		});
		return this;
	};
	
	this.create = function(urls, callback){		
		var app, langs = {},
		connector = new Connector(),
		lang_connector = new Connector(),
		r_path = /^(.*\/)?/,		
		$app  = $($.parseXML("<app/>")).find("app"),
		
		set_ifnull = function(dom, default_setter, attrs){
			for(var i =0; i <attrs.length;i++){
				if(default_setter.attr(attrs[i]) && ! dom.attr(attrs[i])){
					dom.attr(attrs[i],default_setter.attr(attrs[i]));
				}
			}
		},
		
		load_config = function(urls){
			connector.load(urls).ready(function(cfgs){
				
				var imports = [], i, path, import_url;
				for(i = 0;i<cfgs.length;i++){
					path = r_path.exec(this.doneUrls[i])[1];
					$app.append($($.parseXML(cfgs[i])).find("app>"));
					$app.find("import").each(function(){
						import_url = $(this).attr("resource");
						$(this).remove();
						imports.push(import_url.charAt(0) === "/" ? import_url : (path || "") + import_url);
					});
				}
				if(imports.length>0){
					load_config(imports);
				}else{	
					$app.find("default").each(function(){
						var default_setter = $(this);
						$app.find(default_setter.attr("for")).each(function(){
							set_ifnull($(this),default_setter,["url","path","dataType","viewType","require"]);
							default_setter.remove();
						});
					});
					app = new App($app);
					$app.find(".language").each(function(){
						var $lang = $(this),
						adapter = Adapter.get($(this).attr("dataType")),
						lang_id = $lang.attr("id"),
						lang_path = $lang.attr("path") || "";
						if(!langs[lang_id]){
							langs[lang_id] = [];
						}
						$lang.children("url").each(function(){
							var url = $(this).text();
							url = url.charAt(0) === "/" ? url : (lang_path || "") + url;
							
							lang_connector.load(url, adapter);
							lang_connector.ready(function(dom){
								app.lang(lang_id, dom[0].lang || dom[0]);
							});							
						});
					});
					lang_connector.clear(function(){
						app.lang($app.find(".language").attr("id"));
						callback(app);
					});
				}
			});
		};
		
		connector.error(function(url){
			throw new Error("Load config files: " + url + " failed.");
		});

		if(arguments.length == 0){
			return new App($app);
		}
		load_config(urls);
	};
	
};


//TODO: 扩展Tag对象

$.extend(Tag, {
	tns : [],
	ns: (function(){
		var ns = {};
		if (document.namespaces) {
			for ( var i = 0; i < document.namespaces.length; i++) {
				ns[document.namespaces[i].name] = document.namespaces[i].urn;
			}
		} else {
			var attrs = $("html")[0].attributes;
			for ( var i = 0; i < attrs.length; i++) {
				var attr = /xmlns:(\w+)$/.exec(attrs[i].name);
				if(attr){
					ns[attr[1]] = attrs[i].value;
				}
			}
		}
		return ns;
	})(),
	instances : [],
	get :  function(name) {
		for (var i = 0; i < Tag.instances.length; i++) {
			if (Tag.instances[i].match(name)) {
				return Tag.instances[i];
			}
		}
	},
	
	getTagName : function($ele){
		var	tag_name = $ele.prop("tagName");	
		if(tag_name){
			tag_name = tag_name.toLowerCase();
		}	
					
		//部分浏览器（ie）tagName不包含命名空间前缀
		if($ele.prop("scopeName")){
			var	scope_name = $ele.prop("scopeName") === "HTML" ? "" : $ele.prop("scopeName") + ":";
			if(tag_name && tag_name.search(scope_name) == -1){
				tag_name = scope_name + tag_name;
			}
		}
		return tag_name;
	},
	
	parse : function($element, app, app_data, local_data) {
		

//		 Tag.tns = {}, attrs = $element[0].attributes;
// 
//		 for (var i = 0; i < attrs.length; i++) {
//			 var attr = /xmlns:(\w+)$/.exec(attrs[i].name);
//			 if (attr) {
//				 Tag.tns[attr[1]] = attrs[i].value;
//			 }
//		 }

		//保存解析后的雪元素
		var container = $(),
		
		parsed_temp,
		//递归处理每个元素
		parse = function ($ele, app_data) {
			
			var	tag_name = Tag.getTagName($ele),
			tag = Tag.get(tag_name);

			if (tag) {
				
				//解析后的元素可以是原来元素或是新的元素
				var replaced = tag.parse($ele, app, app_data, local_data);				
				
				//扩展标签未标识自己处理子元素
				if (tag.parseChild && replaced) {
					var subs = replaced.size() > 1 ? replaced : replaced.children();
					for (var j = 0; j < subs.size(); j++) {
						parse(subs.eq(j), app_data);
					}
				}
				return replaced;
			} else {

				var subs = $ele.children();
				if (subs.size() === 0) {
					return;
				}

				for (var j = 0; j < subs.size(); j++) {
					parse(subs.eq(j), app_data);
				}
				return $ele;
			}
		};
		
		if ($element.size() > 1) {
			for (var i = 0; i < $element.size(); i++) {
				parsed_temp = parse($element.eq(i), app_data);
				if(parsed_temp){
					Array.prototype.push.apply(container, parsed_temp.toArray());
				}
			}
		} else {
			parsed_temp = parse($element, app_data);
			if(parsed_temp){
				Array.prototype.push.apply(container, parsed_temp.toArray());
			}
		}
		
		return container;
	}
});

$.extend(Data,{
	instances : []
});

//TODO: 扩展Adapter对象 
$.extend(Adapter,{
	instances : [],
	get : function(type){
		for (var i = 0; i < Adapter.instances.length; i++) {
			if (Adapter.instances[i].match(type)) {
				return Adapter.instances[i];
			}
		}
		throw new Error("No adapter found:" + type);
	}
});

//XML类型适配器，将xml数据对象转换成JSON对象
jCtrl.extend("Adapter", function() {
	
	this.type = "xml";
	
	var xmlToJson = function(xml) {
		
		var obj= {}, tmp , sub_count = 0;
		
		if (xml.nodeType == 1) { 
			if (xml.attributes.length > 0) {
				for (var j = 0; j < xml.attributes.length; j++) {
					var attribute = xml.attributes.item(j);
					obj["@" + attribute.nodeName] = attribute.nodeValue;
				}
			}
		} else if (xml.nodeType == 3) {
			obj = $.trim(xml.nodeValue); 
		}
		
		if (xml.hasChildNodes()) {
			
			for(var i = 0; i < xml.childNodes.length; i++) {
				var item = xml.childNodes.item(i);
				var nodeName = item.nodeName;
				if((tmp = xmlToJson(item)) == ""){
					continue;
				}
				if (typeof(obj[nodeName]) == "undefined") {
					sub_count ++;
					obj[nodeName] = tmp;
				} else {
					if (typeof(obj[nodeName].push) == "undefined") {
						var old = obj[nodeName];
						obj[nodeName] = [];
						obj[nodeName].push(old);
					}
					obj[nodeName].push(tmp);
				}
			}
			if(sub_count == 1 && obj["#text"]){
				obj = obj["#text"];
			}
		}
		return obj;
	};

	this.handle = function(xml) {
		
		var xml_dom = $.parseXML(xml),
		json = xmlToJson(xml_dom);
		return json.data || json.app || json.root || json;
	};
})

//JSON类型适配器
.extend("Adapter", function() {
	
	this.type = "json";

	this.handle = function(json) {
		
		return (new Function("return " + json))();

	};
})

//HTML视图适配器
.extend("Adapter", function() {
	
	this.type = "html";

	this.handle = function(html) {
		return html;
	};
})

//TODO: 扩展基本标签

//基本文本绑定标签
.extend("Tag", function(){
	
	this.ns = "";
	this.matchTag = function(name){
		return /^span|h[1-6]$/.test(name);
	};
	this.handle = function(){
		this.bindTo("@data-bind");
		this.element.text(this.val());
	};
	this.update = function() {
		this.element.text(this.val());
	};
})

.extend("Tag", function(){
	
	this.name="script";
	
	this.handle = function(){
		
		var script_head = "var localData = arguments[0],appData = arguments[1];";
		
		(new Function(script_head + this.element.text())).call(window, this.localData, this.appData);
		
		this.element.remove();
		
	};
})

.extend("Tag", function(){
	
	this.ns = "";
	this.name = "input";
	
	this.handle = function(){
		var binding = this,
		type=binding.element.attr("type");
		
		switch(type) {
			case "text":
				binding.bindTo("@value");
				binding.element.val(binding.val());
				var check = binding.appData.check(binding.bindExp);
				
				//如果绑定的表达式只有唯一变量，则将元素的值绑定到该变量，否则路过绑定步骤，
				if(!check.avaliable){
					break;
				}
				
				//元素值更新时更新变量值
				binding.element.change(function(){

					if(check.scope == 1){
						binding.localData.set(check.avaliable, binding.element.val());
					}else{
						binding.appData.set(check.avaliable, binding.element.val());
					}
				});
				
				break;
		}

		
	};
	this.update = function() {
		var binding = this;
		binding.element.val(binding.val());
	};
})

//set标签
.extend("Tag", function(){
	
	this.name = "set";
		
	this.handle = function(){
		var binding = this,
		check = binding.appData.check("{" + binding.element.attr("var") + "}"),
		var_value = binding.val("@value");
		
		if(check.avaliable){
			if(check.scope == 1){
				binding.localData.set(check.avaliable, var_value);
			}else{
				binding.appData.set(check.avaliable, var_value);
			}
		}
		
		binding.element.remove();
	};
})

//remove标签
.extend("Tag", function(){
	
	this.name = "remove";
		
	this.handle = function(){
		var binding = this,
		check = binding.appData.check("{" + binding.element.attr("var") + "}");
		
		if(check.avaliable){
			if(check.scope == 1){
				binding.localData.set(check.avaliable, undefined);
			}else{
				binding.appData.set(check.avaliable, undefined);
			}
		}
		
		binding.element.remove();
	};
})

//foreach标签
.extend("Tag", function() {
	
	this.name = "foreach";
	
	this.parseChild = false;
	
	var append_new_content = function(key, value, container, binding) {
		
		var new_content = {
			data : new Data(binding.appData),
			element : binding.template.clone(),
			key : key
		};
		
		new_content.data.define(binding.attrVar, value);
		new_content.element = Tag.parse(new_content.element, binding.app, new_content.data, binding.localData);
		
		container.append(new_content.element);
		
		binding.contents[key] = new_content;
	}; 
	
	this.handle = function() {
		var binding = this,
		begin = parseInt(binding.val("@begin")) || 0, 
		end = parseInt(binding.val("@end")), 
		items = binding.val("@items"),
		step = parseInt(binding.val("@step")) || 1,
		new_element = $("<div>");

		binding.attrVar = binding.element.attr("var");
		binding.attrVarStatus = binding.element.attr("varStatus");
		binding.contents = {};
		binding.template = binding.element.contents();
		
		if(items !== undefined && typeof items != "string"){

			binding.bindTo("@items");
			
			for(var i in items){				
				append_new_content(i, items[i], new_element, binding);				
			}
		} else if(end !== undefined) {

			binding.bindTo("@begin");
			binding.bindTo("@end");
			
			for ( var i = begin; i <= end; i += step) {				
				append_new_content(i, i, new_element, binding);				
			}
		}
		if(new_element.contents().size() == 0){
			binding.element = new_element;
		}else{
			binding.element = new_element.contents();
		}

	};
	
	this.update = function(){
		var binding = this,
		begin = parseInt(binding.val("@begin")) || 0, 
		end =  parseInt(binding.val("@end")), 
		step = parseInt(binding.val("@step")) || 1,
		items =  binding.val("@items"),
		new_element = $("<div>"),
		placeholder = $("<div>");

		binding.element.replaceWith(placeholder);
		binding.element = placeholder;
		
		if(items && typeof items != "string"){
			
			for(var i in items){
				
				if(!binding.contents.hasOwnProperty(i)){
					append_new_content(i, items[i], new_element, binding);
				}else{
					new_element.append(binding.contents[i].element);
				}				
			}
		} else if(end) {
			
			for ( var i = begin; i <= end; i += step) {
				
				if(!binding.contents.hasOwnProperty(i)){
					append_new_content(i, i, new_element, binding);
				}else{
					new_element.append(binding.contents[i].element);
				}
			}
		}
		new_element = new_element.contents();
		if(new_element.size()>0){
			placeholder.replaceWith(new_element);
			binding.element = new_element;
		}		
	};
	
})

//out标签
.extend("Tag", function(){
	
	this.name = "out";
	
	this.handle = function(){
		//this.element = $("<span>").text(this.val("@value"));
		this.element = this.val("@value");
		this.bindTo("@value");
	};
	this.update = function(){
		this.element.text(this.val("@value"));
	};
})

//choose标签
.extend("Tag", function(){
	
	var self = this;
	
	this.name = "choose";
	
	this.handle = function(){
		var binding = this,
		placeholder = $("<div>"),
		contents = binding.element.children();
		
		binding.element = placeholder;
		binding.placeholder = placeholder;
		binding.contents = [];
		
		for(var i = 0; i< contents.size();i++){
			var sub = contents.eq(i),
			tag_name = self.matchNS(Tag.getTagName(sub)),
			test = sub.attr("test") || "",
			element = sub.contents();
			
			//如果判断分支下内容为空，使用占位符代替
			if(element.size() == 0){
				element = $("<div>");
			}
			
			binding.bindExp += test;
			
			binding.contents.push({
				name : tag_name,
				test : test,
				element : element,
				parsed : false
			});
			
			//已经有判断为真的分支，不再继续寻找
			if(binding.element != placeholder){
				continue;
			}
			
			if(tag_name == "otherwise"){
				binding.element = element;
				return;
			}else if(tag_name == "when"){
				if(binding.val(test) == true ){
					binding.element =  element;
				}		
			}
		}	
	};
	
	this.update = function(){
		var binding = this;
		
		for(var i = 0; i<binding.contents.length;i++){
			
			var element = binding.contents[i].element,
			tag_name = binding.contents[i].name,
			test = binding.contents[i].test;
			
			if(tag_name == "otherwise" && element != binding.element){
				binding.element.replaceWith(element);
				binding.element = element;
				return;
			}else if(tag_name == "when"){
				if(binding.val(test) == true){
					if(element != binding.element){
						binding.element.replaceWith(element);
						binding.element = element;
					}
					return;	
				}	
			}
		}		
	};
	
})

//if标签
.extend("Tag", function(){
	
	this.name="if";
	
	this.handle = function(){
		var binding = this,	
		placeholder = $("<div>");

		binding.bindTo("@test");
		binding.placeholder = placeholder;
		binding.contents = binding.element.contents();
		
		if(binding.val() === true){
			binding.element =  binding.contents;
			binding.parsed = true; 
		}else{
			binding.element = placeholder;
			binding.parsed = false; 
		}		
		
	};
	
	this.update = function(){
		var binding = this;
		if( binding.element == binding.placeholder  				
			&& binding.val() == true){
			
			binding.placeholder.replaceWith(binding.contents);
			binding.element = binding.contents;
			
			if(!binding.parsed){
				binding.parsed = true;
				Tag.parse(binding.element, binding.app, binding.appData, binding.localData);
			}
			
		}else if (binding.element == binding.contents  
			&& binding.val() == false){
			
			binding.contents.replaceWith(binding.placeholder);
			binding.element = binding.placeholder;
			
		}
	};
});

window.Log = LogFactory;
window.App = App;
window.Data = Data;
window.jCtrl = jCtrl.init();

})(window, jQuery);