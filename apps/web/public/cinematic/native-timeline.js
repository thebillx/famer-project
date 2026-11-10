export const NATIVE_DURATION = 12;
export const NATIVE_TAKEOVER_START = .30;
export const NATIVE_TAKEOVER_END = .33;
export const NATIVE_TAKEOVER_COMPLETE = .56;
export const NATIVE_TRANSITIONS = Object.freeze([
 {from:'orbit',to:'regional',start:3.69,end:3.81},
 {from:'regional',to:'field',start:7.69,end:7.81},
]);

export function clamp(value,min=0,max=1){return Math.max(min,Math.min(max,value));}
export function smoothstep(edge0,edge1,value){
 if(edge0===edge1)return value<edge0?0:1;
 const t=clamp((value-edge0)/(edge1-edge0));
 return t*t*(3-2*t);
}
export function nativeTimeFromProgress(progress){
 return clamp((clamp(progress)-NATIVE_TAKEOVER_START)/.26,0,1)*NATIVE_DURATION;
}
export function nativeTakeoverWeight(progress){return smoothstep(NATIVE_TAKEOVER_START,NATIVE_TAKEOVER_END,clamp(progress));}
export function nativeStageWeights(time){
 const first=smoothstep(NATIVE_TRANSITIONS[0].start,NATIVE_TRANSITIONS[0].end,time);
 const second=smoothstep(NATIVE_TRANSITIONS[1].start,NATIVE_TRANSITIONS[1].end,time);
 return {orbit:1-first,regional:first*(1-second),field:second};
}
export function nativePair(time){return time>=NATIVE_TRANSITIONS[1].start?['regional','field']:['orbit','regional'];}

// Apply a normalized projective mapping in homogeneous coordinates. Inputs
// use the existing field's local x/z plane and output normalized top-left CSS
// coordinates. Keeping this pure makes registration independently testable.
export function projectiveMap(point,matrix){
 const [x,z]=point;
 const w=matrix[2][0]*x+matrix[2][1]*z+matrix[2][2];
 return {x:(matrix[0][0]*x+matrix[0][1]*z+matrix[0][2])/w,y:(matrix[1][0]*x+matrix[1][1]*z+matrix[1][2])/w};
}

export const LEGACY_FIELD_CORNERS=Object.freeze([
 [-2.50,-2.30], [2.45,-2.30], [2.45,2.27], [-2.50,2.27],
]);

