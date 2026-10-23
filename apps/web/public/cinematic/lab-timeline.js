import {sampleCameraFromKeys} from './timeline.js';

// Experimental framing for the isolated lab route. It keeps the same ten
// chapters and 19 beat positions while opening the descent into a broader world.
export const LAB_CAMERA_KEYS = [
 {p:0,pos:[15,13,59],target:[-9,-17,0],fov:47,roll:-.14},
 {p:.045,pos:[10.5,17.5,33],target:[5,9,-4],fov:46,roll:-.10},
 {p:.095,pos:[-5.5,21.5,11.5],target:[0,12.2,0],fov:49,roll:.10},
 {p:.135,pos:[3.2,18.8,8.7],target:[0,12.8,0],fov:46,roll:.14},
 {p:.18,pos:[4.8,11.1,4.4],target:[.4,13,0],fov:50,roll:.07},
 {p:.22,pos:[2.7,14,5.7],target:[0,13.1,1],fov:42,roll:0},
 {p:.265,pos:[3.9,17.3,7.2],target:[0,12.8,0],fov:46,roll:-.08},
 {p:.30,pos:[6.2,22,11.8],target:[1,7,-1],fov:49,roll:-.12},
 {p:.33,pos:[6.4,26.5,17.5],target:[0,1,0],fov:49,roll:-.08},
 {p:.36,pos:[6.0,30,23],target:[0,-2,-7],fov:49,roll:0},
 {p:.40,pos:[7.0,34,29],target:[-.5,-2,-15],fov:49,roll:.028},
 {p:.43,pos:[5.5,31,32],target:[0,2,-35],fov:58,roll:.024},
 {p:.46,pos:[4,26,28],target:[0,1,-27],fov:58,roll:.015},
 {p:.485,pos:[5.2,20,21],target:[-1,0,-15],fov:50,roll:.008},
 {p:.51,pos:[5.2,13.2,12.5],target:[-1.8,.05,-1.8],fov:45,roll:0},
 {p:.56,pos:[4.0,7.1,7.8],target:[-.55,.05,0],fov:45,roll:0},
 {p:.65,pos:[3.0,7.4,6.9],target:[-.8,.05,0],fov:44,roll:0},
 {p:.76,pos:[1.7,9.7,5.9],target:[-.8,.05,0],fov:42,roll:0},
 {p:.86,pos:[1.3,10.2,5.6],target:[-.8,.05,0],fov:42,roll:0},
 {p:1,pos:[.7,11,5.3],target:[-.9,.05,0],fov:42,roll:0}
];

export function sampleLabCamera(p,aspect=1.6){
 return sampleCameraFromKeys(LAB_CAMERA_KEYS,p,aspect);
}
