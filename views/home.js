
window._d = appData;
	
$("input[type='button']").click(function(){
	
	appData.push("list", localData.get());
});
