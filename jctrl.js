//(function(window, $, undefined) {

var Data = function(data) {
	
	var self = this, 
	update_fns = [], 
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

			if (!self.contains(variable_name) && chain ) {
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
		pool.json[key] = value;
	};
	
	this.contains = function(key){
		return pool.json ? pool.json.hasOwnProperty(key) : false;
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
			update_fns.push(handler);
		}else{
			for(var i = 0; i < update_fns.length; i++){
				update_fns[i].update();
			}
		}
	};
	
	if(data instanceof Data){
		chain = data;
		pool = {json : {}};
		chain.update(self);
	}else{
		pool = {json : data || {}};
	}
	
},

Adapter = function() {
	
	this.match = function(type) {
		return this.type === type;
	};
	
	this.process = function(url, callback, error) {	
		
		var self = this;
		
		new Connector().load(url).ready(function(responses, errors){
			try{
				var result = self.handle(responses[0]) || responses[0];
				
				callback.call(self, result);
				
				if(errors.length > 0){
					errors.call(self);
				}
			}
			catch(e){
				throw e;
			}
		});
	};

	// abstract method
	this.handle = function(){};
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
						response = current.adapter.handle(response) || response;
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
	requires = $view.attr("require")? $view.attr("require").split(",") : [],
	properties = {
		id : id,
		url : path + ($view.attr("url") || id + "." + viewType) ,
		scripts : scripts,
		styles : styles,
		dataType : dataType,
		viewType : viewType,
		dom : null,
		requires : []
	},
	connector = new Connector(),
	
	style_doms = [],
	
	script_texts = [],
	
	load_require = function($dom){
		
		var bean_path = $dom.attr("path");
		
    	if ($dom.is(".view")) {
    		properties.requires.push($dom.attr("id"));
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
		
		connector.load(properties.url, Adapter.get(viewType)).ready(function(doms){
			properties.dom = doms[0];
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
		
		connector.clear(callback);
		
		return this;
	};
	
	this.on = function(){
		
		var variables = {}, script_head = "",
		head = document.getElementsByTagName("head")[0];
		
		for(var j in variables){
			script_head += "var " + j + " = arguments[0]['" + j + "'];\n";
		}
		script_head += "var session = arguments[1];\n";
		
		for(var i = 0; i<script_texts.length;i++){
			(new Function(script_texts[i])).call(window, variables, {});
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
	
	this.property = function(name){
		return properties[name];
	};
	
	
},

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
	},
	filter = function($dom, selector){
		var result = $dom.find(selector);
		$dom.filter(selector).each(function(){
				result.push(this);
		});
		return result;
	};
	
	this.load = function($container, key){
		var map = app.map(key),	
		$wrapper = $("<div></div>"),		
		view_loaded_count = 0,		
		required_views = {},
		request_view,
		
		append_dom = function($parent, view){

			$parent.append(view.$dom);
			
			for(var i = 0; i<view.requires; i++){
				
				var query_str = "[require="	+ view.requires[i].view.property("id") + "]";
				
				append_dom(filter(view.$dom, query_str), view.requires[i]);
			}
		},
		
		view_load_ready = function(){
			
			if(request_view.property("requires").length + 1  > ++view_loaded_count ){
				return;
			}
			var entry_view;

			for(var i in required_views){
				
				required_views[i].$dom = $(required_views[i].view.property("dom"));
				filter(required_views[i].$dom, "[require]").each(function(){
					
					var required_view_id = $(this).attr("require"), 
					required_view = required_views[required_view_id];

					if(required_view.entry){
						required_views[i].entry = true;
						required_view.entry = false;
					}
					required_views[i].requires.push(required_view);
					
				});

				if(required_views[i].entry){
					entry_view = required_views[i];
				}
			}
			
			append_dom($wrapper, entry_view);
			
			$container.append($wrapper.children());
			
			for(var i in required_views){
				required_views[i].view.on();
			}
			
		};
		
		load_data(map.data(key), map.dataType(), function(status){
			
			var entry_view_id = map.on(key, status),			
				entry_view = app.view(entry_view_id).load(view_load_ready),				
				required_id_list = entry_view.property("requires");
			
			request_view = entry_view;
			
			for ( var i = 0; i < required_id_list.length; i++) {
				
				required_views[required_id_list[i]] = { 
						view: app.view(required_id_list[i]).load(view_load_ready),
						$dom : null,
						entry : false,
						requires : []
				};				
			}
			
			required_views[entry_view_id] = { 
					view: entry_view,
					$dom : null,
					entry : true,
					requires : []
			};	
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
		views.push(new View($(this), $app));
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
			obj = xml.nodeValue.trim(); // add trim here
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
		return $(html);
	};
});
// })(window, jQuery);