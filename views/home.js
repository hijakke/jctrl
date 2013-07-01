
	
$("input").click(function(){
	
	if((x.get()+1)*13 <= appData.get("list.length-1")){
		x.set(x.get()+1);
	}else{
		x.set(0);
	}
	
});
