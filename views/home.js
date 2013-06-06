var a = 1;
x.set(1);
$("input").click(function(){
	LogFactory.getLog("home").begin("title");
	app.data().set("title", "vvv");
	LogFactory.getLog("home").end("title");
	LogFactory.getLog("home").begin("x");
	x.set(++a);
	LogFactory.getLog("home").end("x");
});
