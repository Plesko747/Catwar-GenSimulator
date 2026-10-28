importScripts('engine.js');
let cancelled=false;
onmessage=e=>{if(e.data.type==='stop'){cancelled=true;return}if(e.data.type!=='start')return;cancelled=false;const {mode,mins,maxs,iterations}=e.data;let done=0,hits=0;function batch(){const target=Math.min(iterations,done+1000);for(;done<target;done++){const v=generate(mode);if(v.every((x,i)=>x>=mins[i]&&x<=maxs[i]))hits++}postMessage({type:'progress',done,hits,iterations});if(cancelled||done>=iterations){postMessage({type:'complete',done,hits,iterations,stopped:cancelled});return}setTimeout(batch,0)}batch()};
