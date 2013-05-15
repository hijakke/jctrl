//(function(window, $, undefined) {

var

// document = window.document,
//
// location = window.location,


Data = function(data) {
	
	var self = this, 
	update_handlers = [], 
	local_data , 
	chain ,
	
	// data access 
	val = function() {
		try {
			var format = function(arg) {
				arg = arg.replace(/\[(\w+)\]/g, "['$1']");
				return arg && /^[^.]/.test(arg) ? "." + arg : arg;
			}, 
			variable_name = /\w+/.exec(arguments[0])[0], 
			key = "data.json" + format(arguments[0]);

			if (!self.contains(variable_name) && chain ) {
				if(arguments.length == 2){
					chain.set(arguments[0], arguments[1]);
				}else{
					return chain.get(arguments[0]);
				}
				return;
			}

			if (arguments.length == 2) {
				(new Function("data", "value", key + "=value;"))(local_data, arguments[1]);
				self.update();
			} else {
				return (new Function("data", "return " + key))(local_data);

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
					if(key_values[full] === undefined){
						
						var fk_exp_rs = /^local\.([^.]*)(?:\.(.*))?$/.exec(full);
						if (fk_exp_rs && fk_list && fk_list[fk_exp_rs[1]]) {
							key_values[full] = fk_list[fk_exp_rs[1]].get(fk_exp_rs[2] || "");
						} else {
							key_values[full] = self.get(full == "this" ? "" : full);
						}
					}
					values.push(key_values[full] === undefined ? "" : key_values[full]);
					self.keys.push(full);
					return "arguments[" + (i++) + "]";
				}
				return alias;
			}
		});
		return (new Function("return " + el)).apply(window, values);
	};
	
	this.keys = [];
	
	this.get = function(){
		if(arguments.length == 0 || !arguments[0]){
			return local_data.json;
		}else{
			return val(arguments[0]);
		}
	};
	
	this.set = function(){
		if (arguments.length == 1) {
			local_data.json = arguments[0];
			self.update();
		} else {
			val(arguments[0], arguments[1]);
		}
	};

	this.define = function(key, value){
		local_data.json[key] = value;
	};
	
	this.contains = function(key){
		return local_data.json ? local_data.json.hasOwnProperty(key) : false;
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
			update_handlers.push(handler);
		}else{
			for(var i = 0; i < update_handlers.length; i++){
				update_handlers[i].update();
			}
		}
	};
	
	if(data instanceof Data){
		chain = data;
		local_data = {json : {}};
		chain.update(self);
	}else{
		local_data = {json : data || {}};
	}
	
},

//download and cache files
Connector = function() {

	var cached = {}, 
	last,	
	
	update = function(current) {

		for(var i =0;i<current.process.length;i++){
			current.process[i]( (current.done.length + current.error.length) / current.urls.length  );
		}
		
		if(current.urls.length == current.done.length + current.error.length){
			for(var i =0;i<current.listener.length;i++){
				current.listener[i](current.done, current.error);
			}
			current.ready = true;
		}
		
	},
	
	doTask = function(current){		
		
		for ( var i = 0; i < current.urls.length; i++) {
			
			if(current.cache !== false &&  cached[current.urls[i]]){
				current.done.push(cached[current.urls[i]]);
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
					current.done.push(response);
					update(current);
				},
				error : function() {
					current.error.push(this);
					update(current);
				}
			});
		}
	};

	this.load = function(urls, cache) {

		if (!(urls instanceof Array)) {
			urls = [ urls ];
		}
		
		last = {
				urls : urls,
				error : [],
				done : [],
				listener : [],
				cache : cache,
				process : []
		};
		
		doTask(last);
	};
	
	this.process = function(fn){
		last.process.push(fn);
	};
	
	this.ready = function(fn){
		if(last.ready){
			fn(last.done, last.error);
		}
		else{
			last.listener.push(fn);
		}
	};
},

//Batch file downloader
Batch = function(urls, dstype) {
	this.async = true;
	this.load = function(callback) {

		var self = this, 
		one = function(url, success, error) {
			$.ajax({
				url : url,
				dataType : dstype,
				success : success,
				error : error,
				async : self.async
			});
		}, 
		mutil = function(success, error) {
			var rsps = [], got = 0, failed = 0, reqs = [], i, get = function(i) {
				one(urls[i], function(rsp) {
					rsps[i] = rsp;
					got++;
					if (self.process) {
						self.process(got / urls.length, i, rsp);
					}
					if (got === urls.length) {
						success(rsps);
					}
				}, function(req) {
					failed++;
					reqs.push(req);
					if (got + failed === urls.length) {
						error(reqs, rsps);
					}
				});
			};
			for ( i = 0; i < urls.length; i++) {
				get(i);
			}
		};

		if ( typeof urls === "string") {
			one(urls, function(rsp) {
				if (callback) {
					callback(rsp);
				}
				if (self.ready) {
					self.ready.call(window, rsp);
				}
			}, function(req) {
				if (self.error) {
					self.error.call(window, req);
				}
			});
		} else if (urls.length === 0) {
			if (callback) {
				callback();
			}
			if (self.ready) {
				self.ready.call(window);
			}
		} else {
			mutil(function(rsps) {
				if (callback) {
					callback(rsps);
				}
				if (self.ready) {
					self.ready.call(window, rsps);
				}
			}, function(reqs, rsps) {
				if (self.error) {
					self.error.call(window, reqs, rsps);
				}
			});
		}
	};
}, 

Adapter = function() {

	this.connector = new Connector();
	
	this.match = function(type) {
		return this.type === type;
	};
	this.process = function(url, callback, error) {
		
		
		
		var self = this; 
		
		this.connector.load(url);
		
		this.connector.ready(function(responses, errors){
			
			var rt = self.handle.call(self, responses[0], self.app.data.get()) || responses[0];
			if (self.format) {
				rt = self.format.call(self, rt) || rt;
			}
			if (callback) {
				callback.call(self, rt);
			}
			
		});
	};
}, 

ViewAdapter = function() {

	Adapter.apply(this, arguments);

	this.format = function(doc) {
		return doc instanceof $ ? doc : $(doc);
	};
}, 

DataAdapter = function() {
	Adapter.apply(this, arguments);
	this.format = function() {

		// update local session data from server
		var app = this.app, server_session = app.data.get().session, i;

		for (i in server_session) {
			app.session[i] = server_session[i];
		}

		for (i in app.session) {
			if (server_session[i] === undefined) {
				server_session[i] = app.session[i];
			}
		}
		app.lastUpdateTime = new Date();
	};
}, 

/*
 * If an element contains data-bind attribute
 * then will generated a Binding object
 */
Binding = function() {
	
	this.update = function(){		
	};
	
	this.data = function(){
		return this.dataSource.el(this.dataExp, this.foreignData);
	};
}, 

/*
 * Base Tag Class 
 */
Tag = function() {
	this.ns = "http://jctrl.org/tags";
	this.isContainer = false;
	
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
	
	this.process = function($element, script_vars) {
		var binding = new Binding(),
		
		//flag marks if data-bind express contains 
		//data object which is not foreign data  
		has_app_data_flag = false;
		binding.dataExp = $element.attr("data-bind");
		$element.removeAttr("data-bind");
		binding.foreignData = script_vars;
		binding.dataSource = this.app.data;
		
		//Calculate the expression, get key expressions
		this.app.data.el(binding.dataExp);
		
		var fk_exp = /^local\.([^.]*)(?:\.(.*))?$/, fk_exp_rs;	
		for ( var i = 0; i < this.app.data.keys.length; i++) {
			fk_exp_rs = fk_exp.exec(this.app.data.keys[i]);
			if(fk_exp_rs){
				//generate a new Data object if first appeared
				if(!script_vars[fk_exp_rs[1]]){
					script_vars[fk_exp_rs[1]] = new Data();
				}
				script_vars[fk_exp_rs[1]].update(binding);
			}
			else{
				has_app_data_flag = true;
			}
		}
		
		var rt = this.handle($element[0], binding) || $element;	
		
		if($element !== rt && $element[0] !== rt[0]){
			$element.replaceWith(rt);
		}
		binding.element = rt;
		$.extend(binding, this.prototype);
		
		if(has_app_data_flag){
			binding.dataSource.update(binding);
		}
		
		return rt;
	};
}, 

/*
 * Config path app/views/group/view
 * Module is a Template or Section 
 * Module object includes script files and style files
 */

Module = function() {

	var self = this, 
	app = arguments[0], 
	$element = arguments[1] || $(), 
	default_viewtype = arguments[2], 
	default_datatype = arguments[3], 
	scripts = [], styles = [], preloads = [];

	this.name = $element.attr("name") || arguments[4];
	this.data = $element.attr("data");
	this.template = $element.attr("template");
	this.path = $element.parent().attr("path") || arguments[5];
	this.type = $element.parent().attr("type") || arguments[6];
	this.viewType = $element.attr("viewType") || default_viewtype;
	this.dataType = $element.attr("dataType") || default_datatype;
	this.url = (this.path || "") + ($element.attr("url") || this.name + "." + this.viewType);
	this.scripts = [];
	this.styles = [];
	this.preloads = [];
	this.progress = 0;

	this.match = function(name, type) {
		return this.name === name && this.type === type;
	};

	this.load = function(docReady, progress) {

		this.progress = 0;

		var script_loader = new Batch(scripts, "text"), 
		style_loader = new Batch(styles, "text"), 
		pre_loader = new Batch(preloads), 
		length = 1 + scripts.length + styles.length + preloads.length, 
		got = 0;

		app.va(this.viewType).process(this.url, function(view) {
			self.$document = view;
			docReady(view);
			progress(self.progress = ++got / length);
		});

		pre_loader.process = function(p, i, d) {
			progress(self.progress = ++got / length);
		};
		script_loader.process = function(p, i, g) {
			self.scripts[i] = g;
			progress(self.progress = ++got / length);
		};
		style_loader.process = function(p, i, g) {

			var style = document.createElement("style"), 
			baseurl = /(.*\/)?/.exec(styleFiles[i])[1];
			style.setAttribute("type", "text/css");
			if (!baseurl) {
				g = g.replace(/(url\(\s*)(.)/igm, function(full, url, path) {
					if (path === "/") {
						return full;
					}
					return url + baseurl + path;
				});
			}
			if (style.styleSheet) {
				style.styleSheet.cssText = g;
			} else {
				var cssText = document.createTextNode(g);
				style.appendChild(cssText);
			}
			self.styles[i] = style;
			progress(self.progress = ++got / length);
		};
		script_loader.load();
		style_loader.load();
		pre_loader.load();
	};
	
	this.on = function() {
	
		var script_vars={};
		
		Tag.parse(this.$document, script_vars);
		
		var script = "";
		
		for(var j in script_vars){
			  script += "var " + j + " = arguments[0]['" + j + "'];\n";
		}
		script += "var session = arguments[1];\n";
		
		var head = document.getElementsByTagName("head")[0], i;
		for ( i = 0; i < this.scripts.length; i++) {			
			
			// var script = document.createElement("script");
			// script.text=this.scripts[i];
			// head.appendChild(script);			
			(new Function(script + this.scripts[i])).call(window, script_vars, app.session);
		}
		for ( i = 0; i < this.styles.length; i++) {
			head.appendChild(this.styles[i]);
		}
	};

	this.off = function() {
		for (var i = 0; i < this.styles.length; i++) {
			head.removeChild(this.styles[i]);
		}
	};

	$element.find("script").each(function() {
		scripts.push((self.path || "") + $(this).text());
	});

	$element.find("style").each(function() {
		styles.push((self.path || "") + $(this).text());
	});

	$element.find("preload").each(function() {
		preloads.push((self.path || "") + $(this).text());
	});

}, 

/*
 * Config path app/map/entry
 * Map  
 */

Map = function($element, default_datatype) {

	var keyreg = /{(\w+)}/g, 
	key = $element.attr("key"), 
	path_vars = [], 
	exp, temp, 
	hasdef = false, 
	views = this.views = [];

	this.data = $element.attr("data");
	this.pathValues = {};
	this.dataType = $element.attr("dataType") || default_datatype;

	while (( temp = keyreg.exec(key)) !== null) {
		path_vars.push(temp[1]);
	}

	this.match = function(name) {
		var matched_values = exp.exec(name);
		if (!matched_values) {
			return false;
		}
		for (var i = 0; i < path_vars.length; i++) {
			this.pathValues[path_vars[i]] = matched_values[i + 1];
		}
		return true;
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

	$element.find("on").each(function() {
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
	if (!this.dataType) {
		this.dataType = default_datatype;
	}
}, 

/*
 * @Controller
 */
Controller = function(app) {

	var self = this, id = 0, 
	loadData = function(url, datatype, callback) {
		if (!url) {
			callback.call(self, "success");
			return;
		}
		var da = app.da(datatype);
		da.process(url, function() {
			callback.call(self, "success");
		}, function() {
			callback.call(self, "error");
		});
	}, 
	render = function($element, $document, modules, cid, refresh) {

		if (id !== cid) {
			return;
		}
		var i = 0, unwrap = $document.children();
		$document = unwrap.size() === 0 ? $document.text() : unwrap;
		$element.empty().append($document);
		
		if (refresh) {
			for (; i < app.loadedModules.length; i++) {
				app.loadedModules[i].off();
			}
			app.loadedModules = modules;
		}
		for ( i = 0; i < modules.length; i++) {
			modules[i].on();
		}

	};

	this.loadSection = function($element, name, callback) {

	};

	this.loadView = function($element, name) {

		var i = j = 0, cid = ++id, 
		$document = $("<div></div>"), 
		modules = [], 
		got = 0, 
		base = 0.5;

		for (; i < app.maps.length; i++) {
			if (app.maps[i].match(name)) {
				break;
			}
		}

		if (i === app.maps.length) {
			throw new Error("No urlMap found");
		}
		
		$(app).trigger("loading", 0);

		var map = app.maps[i];

		app.frameData.set(map.pathValues);

		loadData(app.data.el(map.data), map.dataType, function(status) {

			var view;

			for ( i = 0; i < map.views.length; i++) {
				if (map.views[i].on === status || app.data.el(map.views[i].on) === true) {
					view = app.data.el(map.views[i].to);
					break;
				}
			}

			if (i === map.views.length) {
				throw new Error("No accepted view found on status: " + status);
			}

			var route = app.module(view, "route"), template, progress = function() {
				var progress = 0;
				for ( i = 0; i < modules.length; i++) {
					progress += modules[i].progress;
				}
				
				$(app).trigger("loading" , progress / i * base * 100);
				
				if (progress / i === 1) {
					render($element, $document, modules, cid, true);
				}
			}, containerReady = function() {
				if (++got < 2) {
					return;
				}
				if (template) {
					$document.append(template.$document);
					var route_document = $("<div></div>").append(route.$document);
					$document.find("[place]").each(function() {
						var place = $(this);
						place.empty().append(route_document.find("#" + place.attr("place")));
						place.removeAttr("place");
					});
				} else {
					$document.append(route.$document);
				}
				base = 1;
				$document.find("[section]").each(function() {
					var place = $(this), section = app.module(place.attr("section"), "section");
					modules.push(section);
					place.removeAttr("section");

					loadData(app.data.el(section.data), section.dataType, function(status) {
						section.load(function() {
						}, progress);
					});
				});
			};

			if (route.template) {
				template = app.module(route.template, "template");
				modules.push(template);
				template.load(containerReady, progress);
			} else {
				got = 1;
			}
			modules.push(route);
			route.load(containerReady, progress);

		});
	};
}, 

App = function() {

	this.frameData = new Data();
	this.data = new Data(this.frameData);	
	this.lastUpdateTime = new Date();
	this.maps = [];
	//Type: List<Module> 
	//Current loaded Modules
	this.loadedModules = [];	
	//Type: List<Module> 
	//Defined Modules in config file
	this.modules = [];
	this.langs = {};
	this.isReady = false;
	this.defaultViewType = null;
	this.defaultDataType = null;
	//Default path if Module path is not specified
	this.groupPath = {};
	
	this.data.set({
		lang : {},
		model : {},
		session : {}
	});
	
	var self = this, sessionData = {}, vas = [], das = [], controller = new Controller(this) ,container;

	this.container = function(set){
		if(set){
			container = set instanceof $ ? set : $(set);
		}else{
			return container;
		}
	};
	
	for (var i in this.exts) {
		this.exts[i].prototype.app = this;
		var impl = new this.exts[i];
		( impl instanceof Tag ? Tag.lib : impl instanceof DataAdapter ? das : vas).push(impl);
	}

	this.lang = function(name, callback) {
		var arr = this.langs[name], got = 0;
		for ( i = 0; i < arr.length; i++) {
			var da = this.da(arr[i].dataType);
			da.process(arr[i].url, function() {
				if (++got === arr.length && callback) {
					callback();
				}
			});
		}
	};

	this.da = function(name) {
		for (var i = 0; i < das.length; i++) {
			if (das[i].match(name)) {
				return das[i];
			}
		}
		throw new Error("No dataAdapter found");
	};

	this.va = function(name) {
		for (var i = 0; i < vas.length; i++) {
			if (vas[i].match(name)) {
				return vas[i];
			}
		}
		throw new Error("No viewAdapter found");
	};

	this.module = function(name, type) {
		for (var i = 0; i < self.modules.length; i++) {
			if (self.modules[i].match(name, type)) {
				return self.modules[i];
			}
		}
		var generated_module = new Module(self, null, self.defaultViewType, undefined, name, self.groupPath[type] || "", type);
		self.modules.push(generated_module);
		return generated_module;
	};
	// virtual session at client.
	// session data will lost while the page forward.
	// session data can be accessed in view files.
	this.session = function(key, value) {
		if (value === undefined) {
			return sessionData[key];
		} else {
			sessionData[key] = value;
		}
	};

	this.loadView = function(ele, name){
		if (self.isReady) {
			ele = ele instanceof $ ? ele : 
				ele ? $(ele) : (self.container() || $("body")) ;
			if (!name) {
				name = /^#?([^?]+)?/g.exec(location.hash)[1] || self.entry;
			}
			controller.loadView(ele, name);
		}else{
			self.ready(function(){
				self.loadView(ele, name);
			});
		}
	};
	
	this.ready = function(fn){
		if(self.isReady){
			fn.call(window);
		}else{
			$(self).one("appReady", fn);
		}
	};
}, 

jCtrl = function() {
};

//TODO Extend jCtrl
$.extend(jCtrl, {
	extend : function(abst, impl) {
		if (!App.prototype.exts) {
			App.prototype.exts = [];
		}
		abst = {ViewAdapter:ViewAdapter, DataAdapter:DataAdapter,Tag:Tag}[abst];
		if (!abst) {
			throw new Error("superClass not defined");
		}
		impl.prototype = new abst();
			
		App.prototype.exts.push(impl);
		
		return this;
	},
	create : function(config, container) {
		
		var app = new App(),
		waitting = config instanceof Array ? config : [config],
		lang, 
		parse = function(dom, path) {

			var $element = $(dom), def = $element.find("default");
			app.defaultDataType = def.attr("dataType") || app.defaultDataType;
			app.defaultViewType = def.attr("viewType") || app.defaultViewType;
			app.entry = def.attr("entry") || app.entry;
			lang = def.attr("lang") || lang;

			$element.find("include").each(function() {
				var file = $(this).attr("file");
				waitting.push(file.charAt(0) === "/" ? file : (path || "") + file);
			});

			$element.find("views group").each(function() {
				var group = $(this);
				app.groupPath[group.attr("type")] = group.attr("path");
			});

			$element.find("language group").each(function() {
				var lang = $(this);
				var name = lang.attr("name"), lang_datatype = lang.attr("dataType") || app.defaultDataType, path = lang.attr("path");

				if (!app.langs[name]) {
					app.langs[name] = [];
				}

				lang.children().each(function() {
					var file = $(this);
					app.langs[name].push({
						url : (path || "") + file.text(),
						dataType : file.attr("dataType") || lang_datatype
					});
				});

			});

			$element.find("map entry").each(function() {
				app.maps.push(new Map($(this), app.defaultDataType));
			});

			$element.find("views view").each(function() {
				var module = $(this);
				app.modules.push(new Module(app, module, app.defaultViewType, app.defaultDataType));
			});

		};
		
		(function load() {
			if (waitting.length === 0) {
				app.lang(lang, function() {
					$(document).ready(function(){
						app.isReady = true;
						app.container(container);
						$(app).trigger("appReady");						
					});
				});
				return;
			}
			var loader = new Batch(waitting, "xml");
			loader.ready = function(doms) {
				var paths = [], i;
				for ( i = 0; i < waitting.length; i++) {
					paths[i] = /^(.*\/)?/.exec(waitting[i])[1];
				}
				waitting = [];
				for ( i = 0; i < doms.length; i++) {
					parse(doms[i], paths[i]);
				}
				load();
			};
			loader.load();
		})();
		
		return app;
	}
});

//TODO: Extend Tag Class
$.extend(Tag, {
	ns: (function(){javascript:forward('/merchant')
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
	lib : [],
	get :  function(name) {
		for (var i = 0; i < Tag.lib.length; i++) {
			if (Tag.lib[i].match(name)) {
				return Tag.lib[i];
			}
		}
	},
	parse : function($element, script_vars) {
		
		Tag.tns = {},
		attrs = $element[0].attributes;
		
		for ( var i = 0; i < attrs.length; i++) {
			var attr = /xmlns:(\w+)$/.exec(attrs[i].name);
			if(attr){
				Tag.tns[attr[1]] = attrs[i].value;
			}
		}
		
		(function parse($ele) {
			
			//Add scopeName propertity for IE
			var	scopeName =  (!$ele.prop("scopeName") || $ele.prop("scopeName") === "HTML")
			? "" : $ele.prop("scopeName") + ":";
			
			var tag_name = (scopeName + $ele.prop("tagName") || "" ).toLowerCase();
			
			var j, tag = Tag.get(tag_name);

			if (tag) {
				var replaced = tag.process($ele, script_vars);				
				
				if (tag.isContainer) {
					var subs = replaced.size() > 1 ? replaced : replaced.children();
					for ( j = 0; j < subs.size(); j++) {
						parse(subs.eq(j));
					}
				}
			} else {

				var subs = $ele.children();
				if (subs.size() === 0) {
					return;
				}

				for ( j = 0; j < subs.size(); j++) {
					parse(subs.eq(j));
				}
			}
		})($element);
		
	}
});

// xml data adapter
jCtrl.extend("DataAdapter", function() {
	this.type = "xml";
	this.dstype = "xml";

	var update = function(local, server) {
		server.children().each(function() {
			var node = $(this), nodeName = node.prop("tagName");

			if (node.children().size() > 0) {
				update((local[nodeName] = {}), node);
			} else {
				local[nodeName] = node.text();
			}
		});
	};

	this.handle = function(get, ds) {

		update(ds.lang, $(get).find("data:first>lang"));
		update((ds.model = {}), $(get).find("data:first>model"));
		update((ds.session = {}), $(get).find("data:first>lang"));
	};
})
// json data adatper
.extend("DataAdapter", function() {
	this.type = "json";
	this.dstype = "text";

	var update = function(local, server) {
		for (var i in server) {
			local[i] = server[i];
		}
	};

	this.handle = function(got, ds) {

		var json = (new Function("return " + got))();

		update(ds.lang, json.lang);

		ds.session = json.session || ds.session;
		ds.model = json.model || ds.model;

	};
})
// xsl view adapter
.extend("ViewAdapter", function() {
	this.type = "xsl";
	this.dstype = "xml";

	var xml_doc = (function(data) {
		var xml;
		if (window.ActiveXObject) {// IE
			xml = new ActiveXObject("Microsoft.XMLDOM");
			xml.async = "false";
			xml.loadXML(data);
		} else {// Standard
			xml = new DOMParser();
			xml = xml.parseFromString(data, "text/xml");
		}
		return $(xml);
	})("<data><lang /><model /><path /><session /></data>"), 
	
	last_update = new Date(), 
	update = function(xml, ds) {
		if ( typeof ds === "string" || typeof ds === "number") {
			xml.text(ds);
		} else {
			for (var i in ds) {
				var ele = $(xml_doc[0].createElement(isNaN(i) ? i : "item"));
				xml.append(ele);
				update(ele, ds[i]);
			}
		}
	},
	synchronize = function(ds) {
		if (this.app.lastUpdateTime === last_update) {
			return;
		}
		update(xml_doc.find("data:first>lang"), ds.lang);
		update(xml_doc.find("data:first>session"), ds.session);
		update(xml_doc.find("data:first>model"), ds.model);

		last_update = this.app.lastUpdateTime;

	};

	this.handle = function(xsl, ds) {
		var doc;
		synchronize.call(this, ds);
		if (window.ActiveXObject) {
			doc = xml_doc[0].transformNode(xsl);
		} else if (window.XSLTProcessor) {
			var xslt_processor = new XSLTProcessor(), nodes, i;
			xslt_processor.importStylesheet(xsl);
			nodes = xslt_processor.transformToFragment(xml_doc[0], document).childNodes;
			doc = [];
			for ( i = 0; i < nodes.length; i++) {
				if (nodes[i].nodeType !== 3) {
					doc.push(nodes[i]);
				}
			}
		}
		return doc;
	};
})
// html view adapter
.extend("ViewAdapter", function() {
	this.type = "html";
	this.dstype = "text";

	this.handle = function(html, ds) {
		return html;
	};
})


//TODO: Extend Tag
.extend("Tag", function() {
	this.name = "foreach";
	this.isContainer = true;
	this.handle = function(element, binding) {
		element = $(element);
		
		var attr_var = element.attr("var"), 
		begin = element.attr("begin"), 
		end = element.attr("end"), 
		items = element.attr("itmes"), 
		child_element = element.children(), 
		new_element = $("<div></div>"), i;

		binding.dataSource = new Data(binding.dataSource), 
		
		binding.dataSource.define(attr_var);
		
		for (i = begin; i < end; i++) {
			new_element.append(child_element.clone());
		}

		return new_element.children();

	};
	this.prototype = {
		update : function() {

		}
	};
})

.extend("Tag", function() {
	this.name = "xinput";
	this.handle = function(element, binding) {
		
		var new_element = $("<input type=\"text\"/>");

		new_element.attr("style", "padding-left:5px;font-size: 18px;" 
				+ "height: 32px;border: 1px solid #666;border-radius: 4px;line-height: 32px;").focus(function() {
			if (new_element.val() === String(binding.data())) {
				new_element.val("");
				new_element.css("color", "#000");
			}
		}).blur(function() {
			if (new_element.val() === "" || new_element.val() === String(binding.data())) {
				new_element.val(String(binding.data()));
				new_element.css("color", "#999");
			}
		}).val(String(binding.data())).css("color", "#999");
		
		return new_element;
	};
	
	this.prototype = {
		update : function(){
			$(this.element).val(String(this.data())).css("color", "#999");
		}
	};
	
})

// Text Tag
.extend("Tag", function(){
	this.ns = "";
	this.matchTag = function(name){
		return /^span|h[1-6]$/.test(name);
	};
	this.handle = function(element, binding){
		element = $(element);
		element.text(binding.data());
	};
	this.prototype = {
		update : function() {
			$(this.element).text(String(this.data()));
		}
	};
})
		

.extend("Tag", function() {
	this.name = "xa";
	this.isContainer = true;
	this.handle = function(element, binding) {

		var href = /^#?([^?]+)?/.exec( $(element).attr("href") || "" )[1] || "" ,
		self = this;
		var new_element = $("<a href='#" + href + "'></a>");
		new_element.click(function(){
			var curView = /^#?([^?]+)?/.exec(location.hash)[1];
			if(href && curView !== href ){
				self.app.loadView($("#container"), href);
			}
		}).html($(element).html());
		return new_element;
	};
});

//
//(function(jCtrl) {
//	if (window.jCtrl) {
//		// return;
//	}
//	var last_hash = location.hash;
//	var hashCheck = function() {
//		if (location.hash !== last_hash) {
//			last_hash = location.hash;
//			jCtrl.trigger("hashchange", [last_hash]);
//		}
//	};
//	setInterval(hashCheck, 200);
//})(jCtrl);

// public methods and objects
window.jCtrl = jCtrl;

// })(window, jQuery);