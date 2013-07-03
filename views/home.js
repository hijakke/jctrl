
window._d = appData;
	
$("input").click(function(){
	
	x.set(x.get()+1);
	appData.push("list", x.get());
});
