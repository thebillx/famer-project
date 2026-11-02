import {smooth} from './timeline.js';

// A tangent-preserving change of world scale. Earth and the incoming landscape
// share this radius. The field uses one affine scale, preserving every triangle
// interior and canal clearance throughout; its original scale is restored at .465.
export function descentSurface(p){
 const expansion=smooth(.375,.465,p),radius=expansion===1?900:40*Math.exp(Math.log(900/40)*expansion);
 return {
  radius,
  scale:radius/900,
  detail:smooth(.415,.475,p),
  reveal:smooth(.397,.433,p),
 };
}

export function projectDescentSurface(x,y,z,p){
 const {scale}=descentSurface(p);
 return [x*scale,y*scale,z*scale];
}

export function descentCloudHeight(x,z,p){
 const {radius}=descentSurface(p);
 return -2*radius*Math.sin(Math.hypot(x,z)/radius/2)**2;
}
