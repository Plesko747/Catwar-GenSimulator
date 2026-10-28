importScripts('exact.js');
onmessage=e=>{if(e.data.type!=='exact')return;try{const {mode,mins,maxs}=e.data;postMessage({type:'exactComplete',...exactChance(mode,mins,maxs)})}catch(err){postMessage({type:'exactError',message:String(err)})}};
