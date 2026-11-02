import {mountJourney as mountSharedJourney} from './main.js';
import {sampleLabCamera} from './lab-timeline.js';

// The lab keeps the established renderer, asset and disposal boundary while
// opting into experimental composition and interactions on an isolated route.
export function mountJourney(root){
 return mountSharedJourney(root,{lab:true,cameraSampler:sampleLabCamera});
}
