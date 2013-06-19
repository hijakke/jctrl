//(function(window, $, undefined) {

var Data = function(data) {
	
	var self = this, 
	updater = [], 
	pool, 
	chain,
	
	format = function(arg) {
		arg = arg.replace(/\[(\w+)\]/g, "['$1']");
		return arg && /^[^.]/.test(arg) ? "." + arg : arg;
	}, 	
	
	// data access 
	val = function() {
		try {
			var variable_name = /\w+/.exec(arguments[0])[0], 
			key = "data.json" + format(arguments[0]);
			
			if(!self.has(variable_name)){
				//define variable if variable not defined
				if(arguments.length == 2){
					self.define(variable_name);
				}else{
				// return undefined when variable not defined
					return undefined;
				}
			}

			//if variable not defined in itself
			//then access the variable from upper scope
			if (pool.json && !pool.json.hasOwnProperty(variable_name)) {
				if(arguments.length == 2){
					chain.set(arguments[0], arguments[1]);
				}else{
					return chain.get(arguments[0]);
				}
				return;
			}

			//if variable defined in itself
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
	
	elval = function(el, fk_list) {

		var i = 0, values = [], key_values = {};

		el = el.replace(/'(\\'|[^'])*'|"(\\"|[^"])*"|\b[_$a-zA-Z][_$.\w\[\]'"]*(\s*\()?/g, function(full) {
			if (/^['"]/.test(full)) {
				return full;
			} else {
				var alias = {
				lt : "<",
				gt : ">",
				le : "<=",
				ge : ">=",
				eq : "==",
				ne : "!=",
				div : "/",
				mod : "%",
				and : "&&",
				or : "||",
				"true" : "true",
				"false" : "false",
				"null" : "null",
				"undefined" : "undefined"
				}[full];
				if (!alias) {
					if (/\($/.test(full)) {
						return "(";
					}
					if(!key_values.hasOwnProperty(full)){

						self.keys.push(full);
						var fk_exp_rs = /^local\.([^.]*)(?:\.(.*))?$/.exec(full);
						if (fk_exp_rs && fk_list && fk_list[fk_exp_rs[1]]) {
							key_values[full] = fk_list[fk_exp_rs[1]].get(fk_exp_rs[2] || "");
						} else {
							key_values[full] = self.get(full == "this" ? "" : full);
						}
					}
					values.push(key_values[full] === undefined ? "" : key_values[full]);
					return "arguments[" + (i++) + "]";
				}
				return alias;
			}
		});
		return (new Function("return " + el)).apply(window, values);
	};
	
	if(data instanceof Data){
		chain = data;
		pool = {json : {}};
		chain.update(self);
	}else{
		pool = {json : data || {}};
	}
	
	this.keys = [];
	
	this.get = function(){
		if(arguments.length == 0 || !arguments[0]){
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

	//parse el expression in string
	this.el = function(str, fk_list) {
		try {
			self.keys = [];
			
			if(typeof str != "string"){
				return str;
			}
			var proto_result, cur_exp;		
			str = str.replace(/[$#]?{('[^']*'|"[^']*"|[^{}]+)?}/g, function(full, exp_str) {				
				cur_exp = exp_str;				
				//express only
				if (str.length == full.length){
					proto_result = elval(exp_str, fk_list);
					return ;
				}
				return String(elval(exp_str, fk_list));
			});
			
			return proto_result === undefined ? str : proto_result;
			
		} catch (e) {
			self.keys = [];
			throw new Error("Unrecognized expression: " + cur_exp);
		}
	};
	
	this.update = function(handler){
		if(handler){
			updater.push(handler);
		}else{
			for(var i = 0; i < updater.length; i++){
				updater[i].update();
			}
		}
	};	
},

Adapter = function() {
	
	this.match = function(type) {
		return this.type === type;
	};
	
	// abstract method
	this.handle = function(){
		throw new Error("Unimplemented method");
	};
},

//download and cache files
Connector = function() {

	var cached = {},
	task_list = [],
	clear_fns = [],
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
				}
				finally{
					clear_fns=[];
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
	},
	
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
 	local_data = [],
 	
	requires = $view.attr("require")? $view.attr("require").split(",") : [],
	
	//public properties
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
	// load required resources in require attribute
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
	// load required resources in require children
	$view.find("require>").each(function(){
		load_require($(this));
	});
	
	this.load = function(callback){
		
		connector.load(attributes.url, Adapter.get(viewType)).ready(function(html){
			attributes.html = "<div>" + html[0] +"</div>"; 
			attributes.dom = $(attributes.html);
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
		
		for(var j in local_data){
			script_head += "var " + j + " = arguments[0]['" + j + "'];\n";
		}
		script_head += "var session = arguments[1];\n";
		
		for(var i = 0; i<script_texts.length;i++){
			(new Function(script_head + script_texts[i])).call(window, local_data, app.session);
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
		Tag.parse(new_dom, app, app.data(), local_data);
		return new_dom.contents();
	};
	
},

Tag = function() {
	this.ns = "http://jctrl.org/tags";
	this.parseChild = true;

	var abstract_method = function(){
		throw new Error("Unimplemented method");
	};
	
	//get tag name defined in namespace
	this.matchNS = function(name){
		var prefix = /(?:([^:]*):)?(.*)/.exec(name);
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
	
	this.bind = function(binding){
		
		var fk_exp = /^local\.([^.]*)(?:\.(.*))?$/, fk_exp_rs,
		
		has_app_data_flag = false;
		
		binding.app_data.el(binding.bind_exp);
		
		for ( var i = 0; i < binding.app_data.keys.length; i++) {
			fk_exp_rs = fk_exp.exec(binding.app_data.keys[i]);
			if(fk_exp_rs){
				//generate a new Data object if first appeared
				if(!binding.local_data[fk_exp_rs[1]]){
					binding.local_data[fk_exp_rs[1]] = new Data("");
				}
				
				if(binding.update != abstract_method){				
					binding.local_data[fk_exp_rs[1]].update(binding);
				}
			}
			else{
				has_app_data_flag = true;
			}
		}
		
		if(has_app_data_flag && binding.update != abstract_method){
			binding.app_data.update(binding);
		}
	};
	
	this.parse = function($element, app, app_data, local_data) {
		
		var self = this,
		binding ={
			element : $element,
			app : app,
			app_data : app_data,
			local_data : local_data,
			bind_exp : $element.attr("data-bind"),
			update : self.update
		},
		
		rt = self.handle.call(binding);
		
		if(rt){
			binding.element = typeof rt == "string" ? $("<div>" + rt + "</div>").contents()	: rt;
		}
		
		if(binding.bind_exp){
			self.bind(binding);
		}
		
		if($element !== binding.element && $element[0] !== binding.element[0]){
			$element.replaceWith(binding.element);
		}
		
		return binding.element;
		
	};
	// abstract method
	this.update = abstract_method;
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
		$wrapper = $("<div></div>"),		
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
			
			//required views and self
			view_required_count = required_id_list.length + 1;
			
			for ( var i = 0; i < required_id_list.length; i++) {				
				//load a required view
				required_views[required_id_list[i]] = app.view(required_id_list[i]).load(view_load_ready);
				//load required views by required view loaded
				var current_required_id_list = required_views[required_id_list[i]].attr("requires");
				
				for(var j =0; j < current_required_id_list.length; j++){
					//not loaded
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
		
	app_data.set({session:{}, model:{}});
	
	$app.find("bean.view").each(function(){
		views.push(new View($(this), $app, self));
	});
	
	$app.find("map entry").each(function() {
		maps.push(new Map($(this), self));
	});
	
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

jCtrl = new function jCtrl(){
	
	this.extend = function(abst, impl) {
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

		if(arguments.length == 0){
			return new App($app);
		}
		load_config(urls);
	};
	
};


//TODO: Extend Tag

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
					
		//Add scopeName propertity for IE	
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

		var parse = function ($ele, app_data) {
			
			var	tag_name = Tag.getTagName($ele),
			tag = Tag.get(tag_name);

			if (tag) {
				var replaced = tag.parse($ele, app, app_data, local_data);				
				
				if (tag.parseChild) {
					var subs = replaced.size() > 1 ? replaced : replaced.children();
					for (var j = 0; j < subs.size(); j++) {
						parse(subs.eq(j), app_data);
					}
				}
			} else {

				var subs = $ele.children();
				if (subs.size() === 0) {
					return;
				}

				for (var j = 0; j < subs.size(); j++) {
					parse(subs.eq(j), app_data);
				}
			}
		};
		
		if ($element.size() > 1) {
			for (var i = 0; i < $element.size(); i++) {
				parse($element.eq(i), app_data);
			}
		} else {
			parse($element, app_data);
		}

	}
});


//TODO: Extend Adapter 
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

//xml data adapter
jCtrl.extend("Adapter", function() {
	
	this.type = "xml";
	
	var xmlToJson = function(xml) {
		
		var obj= {}, tmp , sub_count = 0;
		
		if (xml.nodeType == 1) { // element
			if (xml.attributes.length > 0) {
			obj["@attributes"] = {};
				for (var j = 0; j < xml.attributes.length; j++) {
					var attribute = xml.attributes.item(j);
					obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
				}
			}
		} else if (xml.nodeType == 3) { // text
			obj = $.trim(xml.nodeValue); // add trim here
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

//json data adatper
.extend("Adapter", function() {
	
	this.type = "json";

	this.handle = function(json) {
		
		return (new Function("return " + json))();

	};
})

//html view adapter
.extend("Adapter", function() {
	
	this.type = "html";

	this.handle = function(html) {
		return html;
	};
})

//TODO: Extend Tag Parser

// Text Tag
.extend("Tag", function(){
	
	var self = this;
	this.ns = "";
	this.matchTag = function(name){
		return /^span|h[1-6]$/.test(name);
	};
	this.handle = function(){
		var binding = this;
		binding.element.text(binding.app_data.el(binding.bind_exp, binding.local_data));
	};
	this.update = function() {
		self.handle.call(this);
	};
})

.extend("Tag", function(){
	
	this.name = "set";
		
	this.handle = function(){
		var binding = this,
		var_name = binding.element.attr("val"),
		var_value = binding.app_data.el(binding.element.attr("value"), binding.local_data);
		
		if(var_name){
			if(var_name.indexOf("local.") == 0){
				var_name = var_name.substr(6);
				if(!binding.local_data[var_name]){
					binding.local_data[var_name] = new Data();
				}
				binding.local_data[var_name].set(var_value);
			}else{
				binding.app_data[var_name].set(var_value);
			}
		}
	};
})

.extend("Tag", function() {
	
	this.name = "foreach";
	
	//Self handle contents
	this.parseChild = false;
	
	this.handle = function() {
		var binding = this;
		var	element = binding.element,
		attr_var = element.attr("var"),
		begin = Number(binding.app_data.el(element.attr("begin"))), 
		end = Number(binding.app_data.el(element.attr("end"))), 
		new_element = $("<div></div>");

		for (var i = begin; i <= end; i++) {
			var child_data = new Data(binding.app_data);
			child_data.define(attr_var);
			child_data.set(attr_var, i);
			
			var temp_child_element = element.contents().clone();
			new_element.append(temp_child_element);
			Tag.parse(temp_child_element, binding.app, child_data, binding.local_data);
		}
		binding.element = new_element.contents();

	};
})

.extend("Tag", function(){
	
	this.name = "out";
	
	this.handle = function(){
		this.element = $("<span></span>").text(this.app_data.el(this.element.attr("value"),this.local_data));
	};
})

.extend("Tag", function(){
	
	var self = this;
	
	this.name = "choose";
	
	this.handle = function(){
		var binding = this,
		placeholder = $("<span class='placeholder'></span>"),
		contents = binding.element.children();
		
		binding.element = null;
		binding.bind_exp = "";
		binding.placeholder = placeholder;
		binding.contents = [];
		
		for(var i = 0; i< contents.size();i++){
			var sub = contents.eq(i),
			tag_name = self.matchNS(Tag.getTagName(sub)),
			test = sub.attr("test") || "",
			element = sub.contents();
			
			binding.bind_exp += test;
			
			binding.contents.push({
				name : tag_name,
				test : test,
				element : element,
				parsed : false
			});
			
			if(binding.element){
				continue;
			}
			
			if(tag_name == "otherwise"){
				binding.element = element;
				return;
			}else if(tag_name == "when"){
				if(binding.app_data.el(test, binding.local_data) == true ){
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
				if(binding.app_data.el(test, binding.local_data) == true){
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

.extend("Tag", function(){
	
	this.name="if";
	
	this.handle = function(){
		var binding = this,	
		placeholder = $("<span class='placeholder'></span>");

		binding.bind_exp = binding.element.attr("test");
		binding.placeholder = placeholder;
		binding.contents = binding.element.contents();
		
		if(binding.app_data.el(binding.bind_exp, binding.local_data) == true){
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
			&& binding.app_data.el(binding.bind_exp, binding.local_data) == true){
			
			binding.placeholder.replaceWith(binding.contents);
			binding.element = binding.contents;
			
			if(!binding.parsed){
				binding.parsed = true;
				Tag.parse(binding.element, binding.app, binding.app_data, binding.local_data);
			}
			
		}else if (binding.element == binding.contents  
			&& binding.app_data.el(binding.bind_exp, binding.local_data) == false){
			
			binding.contents.replaceWith(binding.placeholder);
			binding.element = binding.placeholder;
			
		}
	};
})

//View Tag 
.extend("Tag", function() {
	this.name = "xa";
	this.handle = function() {
		var binding = this;
		var href = /^#?([^?]+)?/.exec( binding.element.attr("href") || "" )[1] || "" ;
		var new_element = $("<a href='#" + href + "'></a>");
		new_element.click(function(){
			var curView = /^#?([^?]+)?/.exec(location.hash)[1];
			if(href && curView !== href ){
				binding.app.loadView($("#container"), href);
			}
		}).html(binding.element.html());
		
		binding.element = new_element;
	};
})

.extend("Tag", function() {
	this.name = "xinput";
	this.handle = function() {
		var binding = this;
		var new_element = $("<input type=\"text\"/>");

		new_element.attr("style", "padding-left:5px;font-size: 18px;" 
				+ "height: 32px;border: 1px solid #666;border-radius: 4px;line-height: 32px;").focus(function() {
			if (new_element.val() === String(binding.app_data.el(binding.bind_exp, binding.local_data))) {
				new_element.val("");
				new_element.css("color", "#000");
			}
		}).blur(function() {
			if (new_element.val() === "" || new_element.val() === String(binding.app_data.el(binding.bind_exp, binding.local_data))) {
				new_element.val(String(binding.app_data.el(binding.bind_exp, binding.local_data)));
				new_element.css("color", "#999");
			}
		}).val(String(binding.app_data.el(binding.bind_exp, binding.local_data))).css("color", "#999");
		
		return new_element;
	};
	
	this.update = function(){
		var binding = this;
		binding.element.val(String(binding.app_data.el(binding.bind_exp, binding.local_data))).css("color", "#999");
	};
	
});

//window.jCtrl = jCtrl;
//})(window, jQuery);