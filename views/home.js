var a = 1;
x.set(1);
$("input").click(function(){
	app.data().set("title", "vvv");
	x.set(++a);
});
