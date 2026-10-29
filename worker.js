importScripts('exact.js');
onmessage=e=>{if(e.data.type!=='exact')return;try{const {mode,mins,maxs,bad,good}=e.data;const result=exactChance(mode,mins,maxs);if(good?.length){const r=countBadBlocks(mode,good);result.goodNumerator=r.badNumerator;result.goodBlockNumerators=r.badBlockNumerators;}if(bad?.length)Object.assign(result,countBadBlocks(mode,bad));
if(good?.length&&bad?.length){
 const conflicts=[];
 for(let i=0;i<good.length;i++)for(let j=0;j<bad.length;j++){
  const lo=good[i].mins.map((x,k)=>Math.max(x,bad[j].mins[k]));
  const hi=good[i].maxs.map((x,k)=>Math.min(x,bad[j].maxs[k]));
  if(lo.some((x,k)=>x>hi[k]))continue;
  const n=countValid(mode,lo,hi);
  if(n>0n)conflicts.push({good:i,bad:j,numerator:n.toString()});
 }
 result.conflicts=conflicts;
 // The overlap warning is based on exact counts, never on rounded percentages.
}postMessage({type:'exactComplete',...result})}catch(err){postMessage({type:'exactError',message:String(err)})}};
